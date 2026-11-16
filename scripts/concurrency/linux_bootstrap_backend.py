"""Fixed new-job backend operations. Native process/FS ports live in bootstrap."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import tomllib
import urllib.parse
import linux_project_inputs as I
from linux_bootstrap_contracts import (PROJECT, ROLES, require, digest, read_file,
                                        write_once, decode, exact)

DOCKER = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']
EXCLUDED = 'postgres-meta,studio,imgproxy,logflare,vector,supavisor'
SEEDS = ['seed.sql', 'seeds/content-questions.sql', 'seeds/content-review-cards.sql',
         'seeds/content-question-hints.sql']
NODE_JWK = "const c=require('node:crypto');const p=c.generateKeyPairSync('ec',{namedCurve:'P-256'});process.stdout.write(JSON.stringify([{...p.privateKey.export({format:'jwk'}),kid:c.randomUUID(),alg:'ES256',use:'sig'}]));"


def docker(io, *args, **options):
    return io.run([*DOCKER, *args], **options)


def inventory(io):
    containers = docker(io, 'ps', '-aq', '--no-trunc').decode().split()
    volumes = docker(io, 'volume', 'ls', '-q').decode().split()
    result = {'containers': containers, 'volumes': volumes}
    if containers:
        shape = '{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Config.Labels}},"image":{{json .Image}}}'
        result['containerOrigins'] = [decode(row) for row in docker(io, 'inspect', '--format', shape, *containers).splitlines()]
    if volumes:
        result['volumeOrigins'] = decode(docker(io, 'volume', 'inspect', *volumes))
    return result


def image_pins(raw):
    value = decode(raw)
    require(value['schemaVersion'] == 1 and value['kind'] == 'ROOT_PUBLIC_LINUX_IMAGE_PINS')
    require(len(value['images']) == 8 and {x['role'] for x in value['images']} == ROLES)
    for row in value['images']:
        require(row['platform'] == 'linux/amd64' and re.fullmatch('sha256:[a-f0-9]{64}', row['configDigest']))
        base, separator, image_hash = row['pinnedReference'].partition('@sha256:')
        require(separator and re.fullmatch('[a-f0-9]{64}', image_hash) and
                base.startswith('public.ecr.aws/supabase/') and
                re.fullmatch(r'public\.ecr\.aws/supabase/[a-z0-9-]+:[A-Za-z0-9_.-]+', row['tag']) and
                row['tag'].rsplit(':', 1)[0] == base and
                row['amd64ManifestSha256'] == 'sha256:' + image_hash)
    return value['images']


def isolation_paths(nonce):
    suffix = nonce[:12]
    backend, generator = 'colorplaybackend' + suffix + '.slice', 'colorplaygenerator' + suffix + '.slice'
    leaf = '/sys/fs/cgroup/' + generator + '/workload'
    return backend, generator, leaf


def require_new_groups(io, nonce):
    backend, generator, leaf = isolation_paths(nonce)
    for name in [backend, generator]:
        require(not io.system_exists('/run/systemd/system/' + name) and
                not io.system_exists('/sys/fs/cgroup/' + name), 'BOOTSTRAP_CGROUP_EXISTS')
    require(not io.system_exists(leaf), 'BOOTSTRAP_CGROUP_EXISTS')


def isolate(io, runtime, nonce, original):
    require_new_groups(io, nonce)
    backend, generator, leaf = isolation_paths(nonce)
    for name, limits in [(backend, 'CPUQuota=400%\nMemoryMax=6442450944\nMemorySwapMax=0\n'), (generator, '')]:
        unit = '[Unit]\nDescription=ColorPlay new Local job\n[Slice]\nCPUAccounting=yes\nMemoryAccounting=yes\n' + limits
        io.system_write('/run/systemd/system/' + name, unit.encode(), exclusive=True)
    io.run(['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'daemon-reload'])
    io.run(['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'start', backend, generator])
    io.system_write('/sys/fs/cgroup/' + generator + '/cgroup.subtree_control', b'+cpu +memory +pids', kernel=True)
    io.run(['/usr/bin/sudo', '-n', '/usr/bin/mkdir', leaf])
    require(io.system_exists(leaf + '/cgroup.kill'), 'BOOTSTRAP_CGROUP_KILL_UNAVAILABLE')
    io.run(['/usr/bin/sudo', '-n', '/usr/bin/chown', str(os.getuid()) + ':' + str(os.getgid()), leaf, leaf + '/cgroup.procs', leaf + '/cgroup.kill'])
    identity = io.system_identity(leaf)
    require(identity['uid'] == os.getuid() and type(identity['inode']) is int and identity['inode'] > 0 and
            identity['pathSha256'] == digest(leaf.encode()), 'BOOTSTRAP_CGROUP_IDENTITY_INVALID')
    values = {name: io.system_read('/sys/fs/cgroup/' + backend + '/' + name).decode().strip()
              for name in ['cpu.max', 'memory.max', 'memory.swap.max']}
    quota, period = values['cpu.max'].split()
    require(int(quota) == 4 * int(period) and int(period) > 0 and
            values['memory.max'] == str(6 * 1024**3) and values['memory.swap.max'] == '0')
    require(io.system_read(leaf + '/cgroup.procs').strip() == b'', 'BOOTSTRAP_GENERATOR_NOT_EMPTY')
    config = decode(original) if original else {}
    require(type(config) is dict)
    config.update({'cgroup-parent': backend, 'ip': '127.0.0.1'})
    defaults = config.setdefault('default-network-opts', {}).setdefault('bridge', {})
    require(type(defaults) is dict)
    defaults['com.docker.network.bridge.host_binding_ipv4'] = '127.0.0.1'
    payload = (json.dumps(config, sort_keys=True) + '\n').encode()
    io.system_write('/etc/docker/daemon.json', payload, expected=digest(original))
    io.run(['/usr/bin/sudo', '-n', '/usr/bin/dockerd', '--validate', '--config-file=/etc/docker/daemon.json'])
    io.run(['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'restart', 'docker'], timeout=90)
    require(io.system_read('/etc/docker/daemon.json') == payload)
    return {'backend': backend, 'generator': generator, 'leaf': leaf,
            'beforeConfigSha256': digest(original), 'afterConfigSha256': digest(payload),
            'kernel': values, 'leafIdentity': identity}


def set_toml(text, section, key, value):
    lines = text.splitlines()
    begin = 0 if not section else next((i + 1 for i, line in enumerate(lines) if line.strip() == '[' + section + ']'), None)
    require(begin is not None, 'BOOTSTRAP_CONFIG_UNSUPPORTED')
    end = next((i for i in range(begin, len(lines)) if lines[i].startswith('[')), len(lines))
    indexes = [i for i in range(begin, end) if re.match(r'^\s*' + re.escape(key) + r'\s*=', lines[i])]
    require(len(indexes) <= 1)
    replacement = key + ' = ' + json.dumps(value)
    if indexes:
        index = indexes[0]
        for stop in range(index + 1, end + 1):
            try:
                parsed = tomllib.loads('\n'.join(lines[index:stop]))
            except tomllib.TOMLDecodeError:
                continue
            require(set(parsed) == {key}, 'BOOTSTRAP_CONFIG_UNSUPPORTED')
            lines[index:stop] = [replacement]
            break
        else:
            require(False, 'BOOTSTRAP_CONFIG_UNSUPPORTED')
    else:
        lines.insert(end, replacement)
    return '\n'.join(lines) + '\n'


def project(io, source, runtime, tools, inputs, inputs_sha):
    tracked = io.run(['/usr/bin/git', 'ls-files', '-z', '--', 'supabase'], cwd=source).decode().split('\0')
    tracked = [name for name in tracked if name]
    I.verify_project_inputs(source, tracked, inputs, inputs_sha)
    target = runtime / 'local-project' / 'supabase'
    target.mkdir(parents=True, mode=0o700)
    (target.parent).chmod(0o700)
    names = [name for name in tracked if name and (name.startswith(('supabase/migrations/', 'supabase/functions/')))]
    require(sum(name.startswith('supabase/migrations/') and name.endswith('.sql') for name in names) == 121)
    require(all(not any(p.startswith('.env') for p in Path(name).parts) and '..' not in Path(name).parts for name in names))
    hashes = {}
    for name in names:
        body = read_file(source / name, maximum=16 * 1024**2)
        destination = target / Path(name).relative_to('supabase')
        parent = target
        for component in destination.relative_to(target).parts[:-1]:
            parent = parent / component
            parent.mkdir(exist_ok=True, mode=0o700)
        write_once(destination, body)
        hashes[name] = digest(body)
    I.copy_project_inputs(source, target.parent, tracked, inputs, inputs_sha)
    hashes.update({row['path']: row['sha256'] for row in inputs['dependencies']})
    hashes[inputs['config']['path']] = inputs['config']['sha256']
    require(all('supabase/' + p in hashes for p in SEEDS))
    text = read_file(source / 'supabase/config.toml').decode()
    require(digest(text.encode()) == inputs['config']['sha256'], I.CODE)
    original = tomllib.loads(text)
    require(original['db']['seed']['sql_paths'] == ['./' + p for p in SEEDS])
    changes = [('', 'project_id', PROJECT), ('api', 'port', 58321), ('db', 'port', 58322),
               ('db', 'shadow_port', 58320), ('local_smtp', 'port', 58324), ('studio', 'enabled', False),
               ('analytics', 'enabled', False), ('db.pooler', 'enabled', False),
               ('auth', 'site_url', 'http://127.0.0.1:58373'),
               ('auth', 'additional_redirect_urls', ['http://127.0.0.1:58373/**']),
               ('auth', 'signing_keys_path', './signing-keys.json')]
    for section, key, value in changes:
        text = set_toml(text, section, key, value)
    config = tomllib.loads(text)
    require(config['project_id'] == PROJECT and config['auth']['additional_redirect_urls'] == ['http://127.0.0.1:58373/**'])
    write_once(target / 'config.toml', text.encode())
    jwks = decode(io.run([tools['node']['path'], '-e', NODE_JWK], maximum=16384))
    require(type(jwks) is list and len(jwks) == 1 and jwks[0]['kty'] == 'EC' and
            jwks[0]['crv'] == 'P-256' and jwks[0]['alg'] == 'ES256' and
            all(isinstance(jwks[0][k], str) and jwks[0][k] for k in ['d', 'x', 'y', 'kid']))
    write_once(target / 'signing-keys.json', jwks)
    secret = secrets.token_urlsafe(48)
    write_once(runtime / 'runtime-secret.json', {'hmacSecret': secret, 'signingKey': jwks[0]})
    I.verify_project_inputs(source, tracked, inputs, inputs_sha)
    I.verify_copied_inputs(target.parent, inputs)
    require(digest(read_file(target / 'config.toml', private=True)) == digest(text.encode()), I.CODE)
    return target.parent, text.encode(), hashes, secret, jwks[0]


def check_status(raw, secret):
    state = decode(raw)
    require(state['API_URL'] == 'http://127.0.0.1:58321' and state['JWT_SECRET'] == secret and
            state['ANON_KEY'] != state['SERVICE_ROLE_KEY'], 'BOOTSTRAP_STATUS_INVALID')
    url = urllib.parse.urlsplit(state['DB_URL'])
    require(url.scheme in {'postgresql', 'postgres'} and url.hostname == '127.0.0.1' and
            url.port == 58322 and url.path == '/postgres' and url.username == 'postgres' and
            bool(url.password) and not url.query and not url.fragment)
    for key, role in [('ANON_KEY', 'anon'), ('SERVICE_ROLE_KEY', 'service_role')]:
        pieces = state[key].split('.')
        require(len(pieces) == 3)
        def dec(value): return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
        require(decode(dec(pieces[0]))['alg'] == 'HS256' and decode(dec(pieces[1]))['role'] == role)
        expected = hmac.new(secret.encode(), '.'.join(pieces[:2]).encode(), hashlib.sha256).digest()
        require(hmac.compare_digest(expected, dec(pieces[2])), 'BOOTSTRAP_TOKEN_SIGNATURE_INVALID')
    return state


def start(io, runtime, project_dir, tools, pins, secret):
    for pin in pins:
        docker(io, 'pull', '--platform', 'linux/amd64', pin['pinnedReference'], timeout=180)
        image = decode(docker(io, 'image', 'inspect', pin['pinnedReference']))[0]
        require(image['Id'] == pin['configDigest'] and image['Architecture'] == 'amd64' and image['Os'] == 'linux')
        docker(io, 'tag', pin['pinnedReference'], pin['tag'])
    env = {'SUPABASE_AUTH_JWT_SECRET': secret, 'SUPABASE_JWT_SECRET': secret}
    write_once(runtime / 'cli-start-intent.json', {'projectId': PROJECT, 'attempts': 1,
        'upstreamAutoRemovalPossible': True, 'volumesMayAlsoBeRemoved': True})
    command = [tools['supabase']['path'], 'start', '--workdir', str(project_dir), '--exclude', EXCLUDED]
    io.run(command, env=env, timeout=600)
    write_once(runtime / 'cli-start-returned.json', {'projectId': PROJECT, 'exitCode': 0})
    raw = io.run([tools['supabase']['path'], 'status', '--workdir', str(project_dir), '--output', 'json'], env=env)
    state = check_status(raw, secret)
    write_once(runtime / 'status-secret.json', raw)
    return state


def containers(io, pins, group):
    identifiers = docker(io, 'ps', '-aq', '--no-trunc').decode().split()
    require(len(identifiers) == len(set(identifiers)) == 8, 'BOOTSTRAP_SERVICE_COUNT_INVALID')
    rows = decode(docker(io, 'inspect', *identifiers))
    require(len(rows) == 8)
    expected = {pin['role']: pin for pin in pins}
    result, seen, published = [], set(), []
    for row in rows:
        role = next((r for r in ROLES if row['Name'] == '/supabase_' + r + '_' + PROJECT), None)
        require(role in expected and role not in seen and row['State']['Running'] is True and
                row['Config']['Labels']['com.supabase.cli.project'] == PROJECT and
                row['Image'] == expected[role]['configDigest'])
        require(re.fullmatch('[a-f0-9]{64}', row['Id']) and row['Id'] in identifiers)
        pid = row['State']['Pid']
        require(type(pid) is int and pid > 0)
        path = io.system_read('/proc/' + str(pid) + '/cgroup').decode().strip()
        require(path.startswith('0::/' + group + '/') and '..' not in Path(path[3:]).parts)
        for bindings in row['NetworkSettings']['Ports'].values():
            for binding in bindings or []:
                require(binding['HostIp'] == '127.0.0.1' and binding['HostPort'] in {'58321', '58322', '58324'})
                published.append(binding['HostPort'])
        result.append({'role': role, 'id': row['Id'], 'name': row['Name'], 'imageId': row['Image']})
        seen.add(role)
    require(seen == ROLES and sorted(published) == ['58321', '58322', '58324'])
    return sorted(result, key=lambda row: row['role'])


def baseline(io, db, state):
    tables = {'auth': 'auth.users', 'profiles': 'public.profiles', 'classrooms': 'public.classrooms',
              'xp': 'public.xp_transactions', 'wallet': 'public.wallet_transactions',
              'mediaRuns': 'public.content_media_upload_runs', 'mediaAssets': 'public.content_media_assets'}
    canonical = {'questions': ('public.questions', 259), 'publishedQuestions': ('public.questions where status=\'published\'', 258),
                 'reviewCards': ('public.review_cards', 9), 'hints': ('public.question_hints', 17),
                 'blooks': ('public.blooks', 20), 'quizTemplates': ('public.quiz_templates', 26)}
    query = "begin read only;set local statement_timeout='10s';select json_build_object('systemIdentifier',(select system_identifier::text from pg_control_system()),'migrations',(select count(*) from supabase_migrations.schema_migrations),'publicTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),'publicWithoutRls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),"
    query += ','.join("'%s',(select count(*) from %s)" % (name, table) for name, table in tables.items()) + ', '
    query += ','.join("'%s',(select count(*) from %s)" % (name, spec[0]) for name, spec in canonical.items()) + ');rollback;'
    password = urllib.parse.unquote(urllib.parse.urlsplit(state['DB_URL']).password)
    raw = docker(io, 'exec', '-i', '--env', 'PGPASSWORD', db['id'], 'psql', '--host', '127.0.0.1', '--port', '5432', '--dbname', 'postgres', '--username', 'postgres', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', data=query.encode(), env={'PGPASSWORD': password})
    value = decode(raw.strip())
    require(re.fullmatch('[0-9]{1,24}', value['systemIdentifier']))
    expected = {'migrations': 121, 'publicTables': 71, 'publicWithoutRls': 0,
                **{name: 0 for name in tables}, **{name: spec[1] for name, spec in canonical.items()}}
    require(set(value) == {'systemIdentifier', *expected} and
            all(type(value[name]) is int and value[name] == count for name, count in expected.items()), 'BOOTSTRAP_BASELINE_INVALID')
    return {'readOnly': True, 'querySha256': digest(query.encode()), 'databaseIdentitySha256':
            digest((PROJECT + ':' + value['systemIdentifier'] + ':postgres').encode()), 'counts': expected}
