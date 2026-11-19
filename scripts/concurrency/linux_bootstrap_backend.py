"""Fixed new-job backend operations. Native process/FS ports live in bootstrap."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import time
import tomllib
import urllib.parse
import linux_project_inputs as I
import linux_status_contracts as D
import linux_bootstrap_health_observer as H
from linux_bootstrap_contracts import (PROJECT, ROLES, require, digest, read_file,
                                        write_once, decode, exact, BootstrapError, fingerprint, directory)

DOCKER = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']
EXCLUDED = 'postgres-meta,studio,imgproxy,logflare,vector,supavisor'
SEEDS = ['seed.sql', 'seeds/content-questions.sql', 'seeds/content-review-cards.sql',
         'seeds/content-question-hints.sql']
NODE_JWK = "const c=require('node:crypto');const p=c.generateKeyPairSync('ec',{namedCurve:'P-256'});process.stdout.write(JSON.stringify([{...p.privateKey.export({format:'jwk'}),kid:c.randomUUID(),alg:'ES256',use:'sig',key_ops:['sign','verify']}]));"


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


def generated_signing_key(value):
    code = 'BOOTSTRAP_JWKS_INVALID'
    require(type(value) is list and len(value) == 1 and type(value[0]) is dict, code)
    key = value[0]
    require(set(key) == {'kty', 'crv', 'x', 'y', 'd', 'kid', 'alg', 'use', 'key_ops'}, code)
    require(key['kty'] == 'EC' and key['crv'] == 'P-256' and key['alg'] == 'ES256' and
            key['use'] == 'sig' and key['key_ops'] == ['sign', 'verify'] and
            isinstance(key['kid'], str) and re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', key['kid']), code)
    for name in ['x', 'y', 'd']:
        encoded = key[name]
        require(isinstance(encoded, str) and re.fullmatch('[A-Za-z0-9_-]{43}', encoded), code)
        raw = base64.urlsafe_b64decode(encoded + '=')
        require(len(raw) == 32 and base64.urlsafe_b64encode(raw).rstrip(b'=').decode() == encoded, code)
    return key


def project(io, source, runtime, tools, inputs, inputs_sha):
    tracked = io.run(['/usr/bin/git', 'ls-files', '-z', '--', 'supabase'], cwd=source).decode().split('\0')
    tracked = [name for name in tracked if name]
    I.verify_project_inputs(source, tracked, inputs, inputs_sha)
    target = runtime / 'local-project' / 'supabase'
    target.mkdir(parents=True, mode=0o700)
    (target.parent).chmod(0o700)
    names = [name for name in tracked if name and (name.startswith(('supabase/migrations/', 'supabase/functions/')))]
    require(sum(name.startswith('supabase/migrations/') and name.endswith('.sql') for name in names) == 122)
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
               ('auth', 'signing_keys_path', './signing-keys.json'),
               ('auth', 'jwt_secret', 'env(SUPABASE_AUTH_JWT_SECRET)')]
    for section, key, value in changes:
        text = set_toml(text, section, key, value)
    config = tomllib.loads(text)
    require(config['project_id'] == PROJECT and config['auth']['additional_redirect_urls'] == ['http://127.0.0.1:58373/**'])
    write_once(target / 'config.toml', text.encode())
    jwks = decode(io.run([tools['node']['path'], '-e', NODE_JWK], maximum=16384))
    generated_signing_key(jwks)
    write_once(target / 'signing-keys.json', jwks)
    secret = secrets.token_urlsafe(48)
    write_once(runtime / 'runtime-secret.json', {'hmacSecret': secret, 'signingKey': jwks[0]})
    I.verify_project_inputs(source, tracked, inputs, inputs_sha)
    I.verify_copied_inputs(target.parent, inputs)
    require(digest(read_file(target / 'config.toml', private=True)) == digest(text.encode()), I.CODE)
    return target.parent, text.encode(), hashes, secret, jwks[0]


def check_status(raw, secret, key, io, runtime, node):
    state, proof = D.observe_status(raw, secret, key)
    write_once(runtime / 'status-secret.json', raw)
    D.verify_signatures(io, runtime, node, key, proof)
    require(D.safe_status(proof) is not None, 'BOOTSTRAP_STATUS_INVALID')
    D.record(runtime, 'status', proof)
    D.require_status(proof)
    return state


def start(io, runtime, project_dir, tools, pins, secret, key):
    for index, pin in enumerate(pins):
        io.pull_approved_image(pin, index)
        image = decode(docker(io, 'image', 'inspect', pin['pinnedReference']))[0]
        require(image['Id'] == pin['configDigest'] and image['Architecture'] == 'amd64' and image['Os'] == 'linux')
        docker(io, 'tag', pin['pinnedReference'], pin['tag'])
    env = {'SUPABASE_AUTH_JWT_SECRET': secret, 'SUPABASE_JWT_SECRET': secret}
    factory = getattr(io, 'bootstrap_observer', None)
    observer = factory(runtime, pins, time.monotonic() + 600) if callable(factory) else H.Unobserved()
    command = [tools['supabase']['path'], 'start', '--workdir', str(project_dir), '--exclude', EXCLUDED]
    try:
        write_once(runtime / 'cli-start-intent.json', {'projectId': PROJECT, 'attempts': 1,
            'upstreamAutoRemovalPossible': True, 'volumesMayAlsoBeRemoved': True})
        observer.cli_started()
        io.run(command, env=env, timeout=600)
        write_once(runtime / 'cli-start-returned.json', {'projectId': PROJECT, 'exitCode': 0})
    except BaseException:
        try: observer.finish()
        except BaseException: pass  # Never mask the original start/write error.
        raise
    try: closed = observer.finish()
    except BaseException: closed = {'closure': 'UNKNOWN', 'persisted': False}
    if callable(factory):
        require(closed == {'closure': 'VERIFIED', 'persisted': True}, 'BOOTSTRAP_OPERATION_FAILED')
    raw = io.run([tools['supabase']['path'], 'status', '--workdir', str(project_dir), '--output', 'json'], env=env)
    state = check_status(raw, secret, key, io, runtime, tools['node']['path'])
    return state


def containers(io, pins, group, runtime):
    proof = {'state': 'UNKNOWN', 'count': None, 'roles': None, 'loopback': None, 'backendGroup': None}
    try:
        identifiers = docker(io, 'ps', '-aq', '--no-trunc').decode().split()
        proof['count'] = len(identifiers)
        require(len(identifiers) == len(set(identifiers)) == 8, 'BOOTSTRAP_SERVICE_COUNT_INVALID')
        rows = decode(docker(io, 'inspect', *identifiers))
        require(len(rows) == 8)
        expected = {pin['role']: pin for pin in pins}
        result, seen, published = [], set(), []
        for row in rows:
            role = next((r for r in ROLES if row['Name'] == '/supabase_' + r + '_' + PROJECT), None)
            matched = role in expected and role not in seen and row['State']['Running'] is True and row['Config']['Labels']['com.supabase.cli.project'] == PROJECT and row['Image'] == expected[role]['configDigest']
            proof['roles'] = proof['roles'] is not False and matched
            require(matched)
            require(re.fullmatch('[a-f0-9]{64}', row['Id']) and row['Id'] in identifiers)
            pid = row['State']['Pid']
            require(type(pid) is int and pid > 0)
            path = io.system_read('/proc/' + str(pid) + '/cgroup').decode().strip()
            matched = path.startswith('0::/' + group + '/') and '..' not in Path(path[3:]).parts
            proof['backendGroup'] = proof['backendGroup'] is not False and matched
            require(matched)
            for bindings in row['NetworkSettings']['Ports'].values():
                for binding in bindings or []:
                    matched = binding['HostIp'] == '127.0.0.1' and binding['HostPort'] in {'58321', '58322', '58324'}
                    proof['loopback'] = proof['loopback'] is not False and matched
                    require(matched)
                    published.append(binding['HostPort'])
            result.append({'role': role, 'id': row['Id'], 'name': row['Name'], 'imageId': row['Image']})
            seen.add(role)
        proof['roles'] = proof['roles'] is True and seen == ROLES
        proof['loopback'] = proof['loopback'] is True and sorted(published) == ['58321', '58322', '58324']
        require(proof['roles'] and proof['loopback'])
        proof['state'] = 'PASS'
        return sorted(result, key=lambda row: row['role'])
    except BootstrapError:
        proof['state'] = 'FAIL'
        raise
    finally:
        D.record(runtime, 'containers', proof)


def baseline(io, db, state, runtime):
    proof = {'state': 'UNKNOWN', 'counts': None}
    try:
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
        expected = dict(D.EXPECTED_BASELINE)
        observed = {name: value.get(name) if type(value.get(name)) is int and 0 <= value[name] <= 2**53 else None for name in expected} if type(value) is dict else dict.fromkeys(expected)
        matched = type(value) is dict and set(value) == {'systemIdentifier', *expected} and all(observed[name] == count for name, count in expected.items())
        identity_valid = type(value) is dict and isinstance(value.get('systemIdentifier'), str) and re.fullmatch('[0-9]{1,24}', value['systemIdentifier']) is not None
        proof = {'state': 'PASS' if matched and identity_valid else 'FAIL', 'counts': observed}
        require(re.fullmatch('[0-9]{1,24}', value['systemIdentifier']))
        require(matched, 'BOOTSTRAP_BASELINE_INVALID')
        return {'readOnly': True, 'querySha256': digest(query.encode()), 'databaseIdentitySha256':
                digest((PROJECT + ':' + value['systemIdentifier'] + ':postgres').encode()), 'counts': expected}
    finally:
        D.record(runtime, 'database', proof)


def template_http_body(raw,expected_bytes,expected_sha):
    """Closed static HTTP/1.x response, never redirects/decodes/executes content."""
    require(type(raw)is bytes and len(raw)<=4096 and type(expected_bytes)is int and
            0<expected_bytes<=2048 and re.fullmatch('[a-f0-9]{64}',expected_sha),I.CODE)
    header,separator,body=raw.partition(b'\r\n\r\n')
    require(separator and len(header)+4<=2048,I.CODE)
    lines=header.split(b'\r\n')
    require(lines[0] in (b'HTTP/1.0 200 OK',b'HTTP/1.1 200 OK'),I.CODE)
    fields={}
    allowed={b'server',b'date',b'content-type',b'content-length',b'last-modified',
             b'connection',b'etag',b'accept-ranges'}
    for line in lines[1:]:
        name,colon,value=line.partition(b':')
        require(colon and re.fullmatch(b'[A-Za-z-]+',name) and
                all(32<=c<=126 for c in value) and name.lower() in allowed and
                name.lower() not in fields,I.CODE)
        fields[name.lower()]=value.strip(b' ')
    length=fields.get(b'content-length',b'')
    require(re.fullmatch(b'[1-9][0-9]{0,8}',length) and int(length)==expected_bytes and
            len(body)==expected_bytes and digest(body)==expected_sha,I.CODE)
    require(fields.get(b'connection',b'close').lower()==b'close' and
            fields.get(b'content-type',b'text/html').lower() in
            (b'text/html',b'text/html; charset=utf-8'),I.CODE)
    return {'status':200,'bytes':len(body),'sha256':digest(body)}


def template_readback(io,runtime,project,inputs,inputs_sha,request,approval,kong):
    diagnostic={'deadline':time.monotonic()+10,'admitted':False,'lastStage':'FILE_CHECK',
                'reason':'BINDING_REJECTED','httpStatus':None,'responseBytes':None,'responseSha256':None}
    try:return _template_readback(io,runtime,project,inputs,inputs_sha,request,approval,kong,diagnostic)
    except BaseException:
        try:
            folder=Path(runtime).parent/'requests'
            require(diagnostic['admitted'] and time.monotonic()<diagnostic['deadline'] and
                    getattr(io,'_raw_root',None)==folder and getattr(io,'_raw_request_sha',None)==approval,I.CODE)
            raw=read_file(folder/'bootstrap-input.json',private=True)
            require(folder.resolve()==folder and digest(raw)==approval and decode(raw)==request,I.CODE)
            directory(folder)
            value={'schemaVersion':1,'kind':'LOCAL_KONG_TEMPLATE_DIAGNOSTIC','state':'UNVERIFIED',
                   'executionAuthority':'NONE','bootstrapRequestSha256':approval,
                   'sourceRevision':request['sourceRevision'],'job':request['job'],'instanceNonce':request['instanceNonce'],
                   **{k:diagnostic[k] for k in ['lastStage','reason','httpStatus','responseBytes','responseSha256']}}
            write_once(folder/'bootstrap-template-readback-diagnostic.json',value)
        except BaseException:pass  # Never masks the operation, overwrites or retries.
        raise


def _template_readback(io,runtime,project,inputs,inputs_sha,request,approval,kong,diagnostic):
    """Only the approved job's two public Kong routes; setup, no business authority."""
    deadline=diagnostic['deadline']
    def admit():
        if deadline-time.monotonic()<=1:
            diagnostic.update(lastStage='DEADLINE',reason='DEADLINE')
            require(False,I.CODE)
    def command(*args,**options):
        admit()
        reason=diagnostic['reason'];diagnostic['reason']='COMMAND_UNAVAILABLE'
        raw=docker(io,*args,timeout=min(2,deadline-time.monotonic()),**options)
        diagnostic['reason']=reason
        admit()
        require(type(raw)is bytes and len(raw)<=options['maximum'],I.CODE)
        return raw
    admit()
    runtime,project=Path(runtime),Path(project)
    require(project==runtime/'local-project' and project.resolve()==project,I.CODE)
    admission_raw=read_file(runtime/'bootstrap-admission.json',private=True)
    admission=decode(admission_raw)
    require(admission=={'requestSha256':approval,'sourceRevision':request['sourceRevision'],
            'job':request['job'],'instanceNonce':request['instanceNonce'],
            'operatorPackageManifestSha256':request['operatorPackageManifestSha256'],
            'projectInputsSha256':inputs_sha,'executionAuthority':'NONE'} and
            re.fullmatch('[a-f0-9]{64}',approval) and I.proof_sha256(inputs)==inputs_sha,I.CODE)
    diagnostic['admitted']=True
    require(kong['role']=='kong' and re.fullmatch('[a-f0-9]{64}',kong['id']) and
            kong['name']=='/supabase_kong_'+PROJECT and
            re.fullmatch('sha256:[a-f0-9]{64}',kong['imageId']),I.CODE)
    rows=[row for row in inputs['dependencies'] if I.public_template(row)]
    require(len(rows)==1,I.CODE)
    template=rows[0];path=project/I.PUBLIC_TEMPLATE
    source=Path(io.source)/I.PUBLIC_TEMPLATE
    refs=('confirmation','magic_link')
    def files():
        I.verify_copied_inputs(project,inputs)
        require(digest(read_file(Path(io.source)/inputs['config']['path']))==inputs['config']['sha256'] and
                digest(read_file(source))==template['sha256'],I.CODE)
        return fingerprint(path.stat(follow_symlinks=False))
    before_file=files()
    def inspect():
        value=decode(command('inspect',kong['id'],maximum=65536))
        require(type(value)is list and len(value)==1 and type(value[0])is dict,I.CODE)
        value=value[0];state=value['State'];pid=state['Pid']
        require(value['Id']==kong['id'] and value['Name']==kong['name'] and value['Image']==kong['imageId'] and
                value['Config']['Labels']['com.supabase.cli.project']==PROJECT and state['Running']is True and
                state['Restarting']is False and state['Dead']is False and type(pid)is int and pid>0,I.CODE)
        selected=[]
        for ref in refs:
            destination='/home/kong/templates/email/'+ref+'.html'
            mounts=[m for m in value['Mounts'] if m.get('Destination')==destination]
            require(len(mounts)==1 and mounts[0].get('Type')=='bind' and
                    mounts[0].get('Source')==str(path) and mounts[0].get('RW')is True,I.CODE)
            selected.append({'sourceSha256':digest(str(path).encode()),'destination':ref})
        return {'idSha256':digest(kong['id'].encode()),'imageId':kong['imageId'],
                'pid':pid,'mounts':selected}
    diagnostic.update(lastStage='INSPECT_BEFORE',reason='BINDING_REJECTED')
    first=inspect()
    diagnostic.update(lastStage='APPLET',reason='APPLET_UNAVAILABLE')
    prefix=('exec','--user','100:65533',kong['id'],'/bin/busybox')
    applets=command(*prefix,'--list',maximum=16384).splitlines()
    require(applets.count(b'nc')==1 and all(re.fullmatch(rb'[A-Za-z0-9_.\[\]-]{1,64}',a) for a in applets),I.CODE)
    observed=[]
    for ref in refs:
        diagnostic.update(lastStage='FILE_CHECK',reason='FILE_CHANGED')
        require(files()==before_file,I.CODE)
        diagnostic.update(lastStage=ref.upper()+'_HTTP',reason='HTTP_REJECTED',httpStatus=None,responseBytes=None,responseSha256=None)
        data=('GET /email/'+ref+'.html HTTP/1.0\r\nHost: 127.0.0.1:8088\r\nConnection: close\r\n\r\n').encode()
        raw=command('exec','-i','--user','100:65533',kong['id'],'/bin/busybox',
                    'nc','-w','2','127.0.0.1','8088',data=data,maximum=4096)
        status=re.match(rb'HTTP/1\.[01] ([1-5][0-9]{2}) [\x20-\x7e]{0,64}\r\n',raw[:100])
        diagnostic.update(httpStatus=int(status[1]) if status else None,responseBytes=len(raw),responseSha256=digest(raw))
        observed.append({'template':ref,**template_http_body(raw,template['bytes'],template['sha256'])})
    diagnostic.update(lastStage='INSPECT_AFTER',reason='BINDING_REJECTED')
    require(inspect()==first,I.CODE)
    diagnostic.update(lastStage='FILE_CHECK',reason='FILE_CHANGED')
    require(files()==before_file and read_file(runtime/'bootstrap-admission.json',private=True)==admission_raw,I.CODE)
    admit()
    proof={'schemaVersion':1,'kind':'LOCAL_KONG_TEMPLATE_READBACK','state':'READBACK_OBSERVED',
           'executionAuthority':'NONE','bootstrapRequestSha256':approval,'sourceRevision':request['sourceRevision'],
           'job':request['job'],'instanceNonce':request['instanceNonce'],'projectInputsSha256':inputs_sha,
           'kongIdSha256':first['idSha256'],'kongImageId':kong['imageId'],
           'templateSha256':template['sha256'],'observations':observed,'clientsClosed':True}
    diagnostic.update(lastStage='WRITE',reason='WRITER_FAILED')
    write_once(runtime/'template-readback-proof.json',proof)
    admit()  # A late synchronous write cannot promote BACKEND_READY.
    return proof
