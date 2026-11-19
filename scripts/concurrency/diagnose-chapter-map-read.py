"""Fixed ephemeral Local experiment; never a Native/Hosted admission authority."""
import concurrent.futures
import http.client
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import stat
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/concurrency'))
from chapter_map_diagnostic_contracts import (GIB, LIMIT, WAITS, NODES, PLAN_KEYS, denied_helper_plan, stop_signal_class, stopped_services, safe_control_failure, fixed_pnpm_operation, command_stream_diagnostic, need, decode_private, number, local_api, project_plan, summarize_http, validate_public)
BRANCH = 'refs/heads/codex/local-chapter-map-diagnostic-20261119'
REPOSITORY = 'peiyi-liu/colorplay_v1'


def request_once(api, anon, token):
    target = urlsplit(local_api(api))
    connection = http.client.HTTPConnection(target.hostname, target.port, timeout=15)
    started = time.monotonic()
    expired = threading.Event()
    wire = [None]
    response = None
    def expire():
        expired.set()
        if wire[0] is not None:
            try:wire[0].shutdown(socket.SHUT_RDWR)
            except OSError:pass
    deadline = threading.Timer(15, expire)
    deadline.start()
    try:
        need(not expired.is_set())
        connection.connect()
        wire[0] = connection.sock
        need(not expired.is_set())
        connection.request('POST', '/rest/v1/rpc/get_student_chapter_map', body=b'{}', headers={'apikey': anon, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Connection': 'close'})
        response = connection.getresponse()
        headers = (time.monotonic() - started) * 1000
        body = response.read(LIMIT + 1)
        finished = (time.monotonic() - started) * 1000
        need(not expired.is_set() and time.monotonic() - started <= 15 and response.status == 200 and len(body) <= LIMIT)
        payload = decode_private(body)
        need(type(payload) is dict and set(payload) == {'mode', 'rules_version', 'chapters'} and type(payload['chapters']) is list and len(payload['chapters']) == 6 and payload['mode'] in ('open', 'sequential') and payload['rules_version'] == '2026-08-sequence-1')
        return {'headersMs': headers, 'bodyMs': finished - headers, 'totalMs': finished, 'bodyBytes': len(body), 'status': response.status}
    finally:
        deadline.cancel()
        if response is not None:response.close()
        connection.close()
        if wire[0] is not None:wire[0].close()
        deadline.join()


def run_batch(tokens, count, request, wait_snapshot):
    need(len(tokens) == 59 and count in (1, 39, 59))
    ready = threading.Barrier(count + 1, timeout=5)
    release = threading.Event()
    state = {'allowed': False, 'start': 0.0}
    def one(token):
        ready.wait()
        release.wait()
        need(state['allowed'])
        offset = (time.monotonic() - state['start']) * 1000
        return {**request(token), 'startOffsetMs': offset}
    with concurrent.futures.ThreadPoolExecutor(max_workers=count) as pool:
        futures = []
        try:
            futures = [pool.submit(one, token) for token in tokens[:count]]
            ready.wait()
            state.update(allowed=True, start=time.monotonic())
        finally:
            release.set()
        before = sum(future.done() for future in futures)
        lower = (time.monotonic() - state['start']) * 1000
        try:
            waits = wait_snapshot()
            upper = (time.monotonic() - state['start']) * 1000
            after = sum(future.done() for future in futures)
        finally:
            settled = concurrent.futures.wait(futures)
            need(not settled.not_done)
        rows = [future.result() for future in futures]
    return {**summarize_http(rows, count), 'preparedWorkers': count, 'waits': waits, 'waitSampleBoundsMs': [lower, upper], 'settledAtWaitStart': before, 'settledAtWaitEnd': after}


def private_write(path, raw):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)


def write_control_failure(private, first, resources_closed):
    value = {**first, 'resourcesClosed': resources_closed is True,
             'controlCommandFailure': True, 'terminationUnknown': True}
    raw = json.dumps(value, allow_nan=False, separators=(',', ':')).encode()
    need(len(raw) <= 2048)
    print(raw.decode(), flush=True)
    private_write(private / 'control-failure-private.json', raw)


def private_read(path):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1 and info.st_size <= 4 * LIMIT)
    return path.read_bytes()


def observe_backend(io, containers, backend, roles, project):
    need(type(containers) is list and len(containers) == 8)
    own = io.system_read('/proc/self/cgroup').decode().strip()
    need(own.startswith('0::/') and not own.startswith('0::/' + backend + '/'))
    seen, published, database, pool = set(), [], None, None
    for item in containers:
        role = next((role for role in roles if item['Name'] == '/supabase_' + role + '_' + project), None)
        need(role and role not in seen and item['State']['Running'] is True and item['Config']['Labels'].get('com.supabase.cli.project') == project and re.fullmatch('[a-f0-9]{64}', item['Id']))
        seen.add(role)
        pid = item['State']['Pid']
        need(type(pid) is int and pid > 0)
        leaf = io.system_read('/proc/' + str(pid) + '/cgroup').decode().strip()
        need(leaf.startswith('0::/' + backend + '/') and '..' not in Path(leaf[3:]).parts)
        for bindings in item['NetworkSettings']['Ports'].values():
            for binding in bindings or []:
                need(binding['HostIp'] == '127.0.0.1' and binding['HostPort'] in ('58321', '58322', '58324'))
                published.append(binding['HostPort'])
        if role == 'db':database = item['Id']
        if role == 'rest':
            pools = [entry.split('=', 1)[1] for entry in item['Config']['Env'] if entry.startswith('PGRST_DB_POOL=')]
            need(len(pools) <= 1)
            if pools:
                need(re.fullmatch('[1-9][0-9]{0,4}', pools[0]) is not None)
                pool = int(pools[0])
    need(seen == roles and database and sorted(published) == ['58321', '58322', '58324'])
    for key, expected in [('memory.max', str(6 * GIB)), ('memory.swap.max', '0')]:
        need(io.system_read('/sys/fs/cgroup/' + backend + '/' + key).decode().strip() == expected)
    quota, period = io.system_read('/sys/fs/cgroup/' + backend + '/cpu.max').decode().split()
    need(int(period) > 0 and int(quota) == 4 * int(period))
    return {'database': database, 'apiPoolSize': pool}


def graceful_close(io, original_rows, backend, roles, project, docker, cleanup):
    need(type(original_rows) is list and len(original_rows) == 8)
    identifiers = [row['Id'] for row in original_rows]
    need(len(set(identifiers)) == 8 and all(re.fullmatch('[a-f0-9]{64}', value) for value in identifiers))
    need(set(docker('ps', '-aq', '--no-trunc').decode().split()) == set(identifiers))
    before = decode_private(docker('inspect', *identifiers))
    observe_backend(io, before, backend, roles, project)
    need({row['Id'] for row in before} == set(identifiers))
    signals = {}
    for row in before:
        role = next(role for role in roles if row['Name'] == '/supabase_' + role + '_' + project)
        state = row['State']
        need(row['RestartCount'] == 0 and type(row['RestartCount']) is int and state['Restarting'] is False and state['OOMKilled'] is False and state['Dead'] is False)
        signals[role] = stop_signal_class(role, row['Config'].get('StopSignal'))
    # Docker -1 waits indefinitely; the bounded control CLI may fail, but no
    # daemon-side SIGKILL timeout/fallback is requested for a backend service.
    docker('stop', '--timeout=-1', *identifiers)
    after = decode_private(docker('inspect', *identifiers))
    proof = stopped_services(after, identifiers, signals, project)
    cleanup()  # Only after actual stopped metadata was validated for all8.
    need(not docker('ps', '-aq', '--no-trunc').strip())
    events = io.system_read('/sys/fs/cgroup/' + backend + '/cgroup.events').decode()
    need('populated 0' in events.splitlines())
    return proof

def actual_experiment(environment):
    need(sys.platform == 'linux' and environment.get('GITHUB_REPOSITORY') == REPOSITORY and environment.get('GITHUB_REF') == BRANCH and environment.get('GITHUB_JOB') == 'chapter-map-diagnostic' and environment.get('GITHUB_RUN_ATTEMPT') == '1')
    need(environment.get('GITHUB_WORKFLOW_REF') == REPOSITORY + '/.github/workflows/local-chapter-map-diagnostic.yml@' + BRANCH)
    revision = environment.get('GITHUB_SHA', '')
    need(re.fullmatch('[a-f0-9]{40}', revision) is not None)
    parent = Path(environment['RUNNER_TEMP'])
    need(parent.is_absolute() and parent.resolve() == parent)
    private = parent / 'chapter-map-diagnostic'
    private.mkdir(mode=0o700)
    report = {'schemaVersion': 1, 'kind': 'LOCAL_CHAPTER_MAP_DIAGNOSTIC', 'executionAuthority': 'NONE', 'fixtureHistory': 'EMPTY_BASELINE', 'nativeHistoryEquivalent': False, 'cannotClearNativeGate': True, 'sourceRevision': revision, 'collection': 'UNAVAILABLE', 'stage': 'PREFLIGHT', 'resourceFacts': dict.fromkeys(('hostCpus', 'availableRamBytes', 'freeDiskBytes', 'backendCpuCores', 'backendMemoryBytes', 'backendSwapBytes', 'services'), 0), 'versions': {'node': 'UNOBSERVED', 'supabase': 'UNOBSERVED', 'postgresVersionNumber': 0, 'dockerVersion': []}, 'settings': {'apiPoolSize': None, 'dbMaxConnections': 0, 'dbJitEnabled': None}, 'fixtureCounts': {'students': 0, 'quizHistory': 0, 'reviewHistory': 0}, 'batches': [], 'plans': [], 'resourcesClosed': True, 'controlCommandFailure': False, 'terminationUnknown': False, 'shutdown': {'collection': 'UNOBSERVED', 'services': 0, 'signalClasses': []}}
    sys.path.insert(0, str(ROOT / 'scripts/concurrency'))
    import linux_bootstrap_backend as B
    import linux_bootstrap_contracts as C
    import linux_project_inputs as I
    spec = importlib.util.spec_from_file_location('diagnostic_native_io', ROOT / 'scripts/concurrency/linux-local-bootstrap.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    io = module.NativeIO()
    original_run = io.run
    first_control_failure = None
    node, pnpm = shutil.which('node'), shutil.which('pnpm')
    need(node and pnpm)
    path_env = {'PATH': str(Path(node).parent) + ':/usr/bin:/bin'}
    def allowed(args):
        if args[0] == node:
            return args[1:] in (['--version'], ['-e', B.NODE_JWK], ['--import', 'tsx', str(ROOT / 'scripts/concurrency/diagnose-chapter-map-fixtures.ts')])
        if args[0] == pnpm:
            return fixed_pnpm_operation(args, pnpm, project, B.EXCLUDED) != 'UNKNOWN'
        if args[:3] == B.DOCKER:
            tail = args[3:]
            if tail in (['ps', '-aq', '--no-trunc'], ['ps', '-q'], ['ps', '-q', '--no-trunc'], ['volume', 'ls', '-q']):return True
            if len(tail) == 3 and tail[:2] == ['info', '--format']:
                return tail[2] == '{"driver":{{json .CgroupDriver}},"version":{{json .CgroupVersion}},"engine":{{json .ServerVersion}}}'
            if tail[0] == 'inspect':return len(tail) == 9 and all(re.fullmatch('[a-f0-9]{64}', value) for value in tail[1:])
            if tail[:2] == ['stop', '--timeout=-1']:return containers is not None and tail[2:] == [row['Id'] for row in containers]
            return database is not None and tail == ['exec', '-i', database, 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']
        return module.command_operation(args) in {'GIT_HEAD', 'GIT_STATUS', 'GIT_TRACKED_FILES', 'SYSTEM_READ', 'SYSTEM_WRITE', 'SYSTEMD_RELOAD', 'SYSTEMD_START', 'CGROUP_MKDIR', 'CGROUP_CHOWN', 'DOCKER_CONFIG_VALIDATE', 'SYSTEMD_DOCKER_RESTART'}
    def observed_run(args, **options):
        nonlocal first_control_failure
        try:
            need(allowed(args) and options.get('cwd', ROOT) == ROOT)
            if args[0] == pnpm:
                operation = fixed_pnpm_operation(args, pnpm, project, B.EXCLUDED)
                io.command_diagnostic = None
                options.pop('checked', None)
                options.pop('capture_stderr', None)
                try:
                    code, raw, error = module.bounded(args, options.pop('cwd', ROOT), checked=False, capture_stderr=True, **options)
                except BaseException:
                    io.command_diagnostic = command_stream_diagnostic(operation, None, None, None)
                    raise
                if code != 0:
                    io.command_diagnostic = command_stream_diagnostic(operation, code, raw, error)
                    if first_control_failure is None:
                        first_control_failure = safe_control_failure('CLEANUP' if cleaning else report['stage'], io.command_diagnostic, False)
                        private_write(private / 'first-command-stdout-private.bin', raw)
                        private_write(private / 'first-command-stderr-private.bin', error)
                need(code == 0)
                return raw
            return original_run(args, **options)
        except BaseException:
            if first_control_failure is None:
                first_control_failure = safe_control_failure('CLEANUP' if cleaning else report['stage'], io.command_diagnostic, False)
            report['controlCommandFailure'] = True
            report['terminationUnknown'] = True
            raise
    io.run = observed_run
    def command(args, data=None, timeout=60, extra=None):
        return io.run(args, data=data, timeout=timeout, maximum=4 * LIMIT, env={**path_env, **(extra or {})})
    docker = lambda *args: command([*B.DOCKER, *args])
    project = None
    isolation = None
    database = None
    started = False
    cleaning = False
    containers = None
    io.run = observed_run
    try:
        facts = report['resourceFacts']
        facts['hostCpus'] = len(os.sched_getaffinity(0))
        memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
        facts['availableRamBytes'] = int(memory['MemAvailable'].split()[0]) * 1024
        facts['freeDiskBytes'] = shutil.disk_usage(parent).free
        need(facts['hostCpus'] >= 4 and facts['availableRamBytes'] >= 12 * GIB and facts['freeDiskBytes'] >= 10 * GIB)
        need(Path('/sys/fs/cgroup/cgroup.controllers').is_file() and os.geteuid() != 0)
        need(command(['/usr/bin/git', 'rev-parse', 'HEAD']).decode().strip() == revision and not command(['/usr/bin/git', 'status', '--porcelain']).strip())
        need(command([node, '--version']).strip() == b'v24.13.1')
        need(command([pnpm, 'exec', 'supabase', '--version']).strip() == b'2.109.1')
        report['versions'].update(node='v24.13.1', supabase='2.109.1')
        need(not docker('ps', '-aq', '--no-trunc').strip() and not docker('volume', 'ls', '-q').strip())
        info = decode_private(docker('info', '--format', '{"driver":{{json .CgroupDriver}},"version":{{json .CgroupVersion}},"engine":{{json .ServerVersion}}}'))
        need(set(info) == {'driver', 'version', 'engine'} and info['driver'] == 'systemd' and info['version'] == '2')
        version = re.fullmatch(r'([0-9]+)\.([0-9]+)\.([0-9]+)(?:[-+][A-Za-z0-9.-]+)?', info['engine'])
        need(version is not None)
        report['versions']['dockerVersion'] = [int(part) for part in version.groups()]
        original = io.system_read('/etc/docker/daemon.json') if io.system_exists('/etc/docker/daemon.json') else b''
        runtime = private / 'runtime'
        runtime.mkdir(mode=0o700)
        report['stage'] = 'ISOLATION'
        isolation = B.isolate(io, runtime, secrets.token_hex(16), original)
        facts.update(backendCpuCores=4, backendMemoryBytes=6 * GIB, backendSwapBytes=0)
        tracked = command(['/usr/bin/git', 'ls-files', '-z', '--', 'supabase']).decode().strip('\0').split('\0')
        inputs = I.capture_project_inputs(ROOT, tracked)
        project, _, _, secret, _ = B.project(io, ROOT, runtime, {'node': {'path': node}}, inputs, I.proof_sha256(inputs))
        extra = {'SUPABASE_AUTH_JWT_SECRET': secret, 'SUPABASE_JWT_SECRET': secret}
        report['stage'] = 'BACKEND'
        started = True
        report['resourcesClosed'] = False
        command([pnpm, 'exec', 'supabase', 'start', '--workdir', str(project), '--exclude', B.EXCLUDED], timeout=600, extra=extra)
        command([pnpm, 'exec', 'supabase', 'db', 'reset', '--local', '--workdir', str(project)], timeout=300, extra=extra)
        state = decode_private(command([pnpm, 'exec', 'supabase', 'status', '--workdir', str(project), '-o', 'json'], extra=extra))
        api = local_api(state['API_URL'])
        need(api == 'http://127.0.0.1:58321')
        ids = docker('ps', '-q', '--no-trunc').decode().split()
        need(len(ids) == 8)
        containers = decode_private(docker('inspect', *ids))
        observed = observe_backend(io, containers, isolation['backend'], C.ROLES, C.PROJECT)
        database = observed['database']
        report['settings']['apiPoolSize'] = observed['apiPoolSize']
        facts['services'] = 8
        def sql(query):
            need(query.startswith('begin read only;'))
            bounded_query = query.replace('begin read only;', "begin read only;set local statement_timeout='15s';set local lock_timeout='5s';", 1)
            return decode_private(command([*B.DOCKER, 'exec', '-i', database, 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], data=bounded_query.encode(), timeout=20))
        report['stage'] = 'FIXTURE'
        raw = command([node, '--import', 'tsx', str(ROOT / 'scripts/concurrency/diagnose-chapter-map-fixtures.ts')], data=json.dumps({'api': api, 'anon': state['ANON_KEY'], 'service': state['SERVICE_ROLE_KEY']}).encode(), timeout=240)
        private_write(private / 'fixture-private.json', raw)
        fixture = decode_private(raw)
        need(set(fixture) == {'rows', 'counts'} and fixture['counts'] == {'students': 59, 'quizHistory': 0, 'reviewHistory': 0} and len(fixture['rows']) == 59)
        report['fixtureCounts'] = fixture['counts']
        subjects = [row['userId'] for row in fixture['rows']]
        need(len(set(subjects)) == 59 and all(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', subject) for subject in subjects))
        report['versions']['postgresVersionNumber'] = sql("begin read only;select current_setting('server_version_num')::integer;rollback;")
        settings = sql("begin read only;select json_build_object('dbMaxConnections',current_setting('max_connections')::integer,'dbJitEnabled',current_setting('jit')='on');rollback;")
        report['settings'].update(settings)
        def waits():
            rows = sql("begin read only;select coalesce(json_agg(json_build_array(coalesce(wait_event_type,'NONE'),n)),'[]'::json) from (select wait_event_type,count(*) n from pg_stat_activity where datname='postgres' and backend_type='client backend' group by wait_event_type) x;rollback;")
            result = dict.fromkeys((*WAITS, 'NONE', 'OTHER'), 0)
            for kind, count in rows:
                result[kind if kind in result else 'OTHER'] += number(count)
            return result
        for count in (1, 39, 59):
            report['stage'] = 'HTTP_' + str(count)
            report['batches'].append(run_batch([row['accessToken'] for row in fixture['rows']], count, lambda token: request_once(api, state['ANON_KEY'], token), waits))
        # Plans intentionally follow all HTTP batches; no plan-based prewarming.
        report['stage'] = 'PLANS'
        subject = subjects[0]
        claims = fixture['rows'][0]['claims']
        need(claims == {'sub': subject, 'role': 'authenticated'})
        prefix = "begin read only;set local statement_timeout='15s';set local role authenticated;set local request.jwt.claims='" + json.dumps(claims, separators=(',', ':')) + "';"
        context = sql(prefix + "select json_build_object('role',current_user,'subjectMatches',auth.uid()='" + subject + "'::uuid,'profiles',(select count(*) from public.profiles where id=auth.uid()));rollback;")
        need(context == {'role': 'authenticated', 'subjectMatches': True, 'profiles': 1})
        queries = [('CHAPTER_MAP', 'select public.get_student_chapter_map()'), ('LEARNING_PROGRESS', 'select * from public.get_learning_progress(null)'), ('CHAPTER_AVAILABILITY', "select public.chapter_content_is_available(id) from public.chapters where status='published' order by sort_order limit 1")]
        for label, query in queries:
            if label == 'CHAPTER_AVAILABILITY':
                allowed_helper = sql(prefix + "select to_json(has_function_privilege(current_user,'public.chapter_content_is_available(uuid)','EXECUTE'));rollback;")
                need(allowed_helper is False)
                report['plans'].append(denied_helper_plan())
                continue
            plan = sql(prefix + 'explain (analyze,buffers,format json) ' + query + ';rollback;')
            projected = project_plan(plan)
            # These outer plans cannot reveal nested function execution nodes.
            projected['collection'] = 'OPAQUE'
            report['plans'].append({'query': label, **projected})
        report['collection'] = 'OBSERVED'
        report['stage'] = 'CLEANUP'
    except Exception:
        report['collection'] = 'UNAVAILABLE'
    finally:
        if started and project:
            cleaning = True
            try:
                report['shutdown'] = graceful_close(
                    io, containers, isolation['backend'], C.ROLES, C.PROJECT,
                    docker, lambda: command([pnpm, 'exec', 'supabase', 'stop', '--workdir', str(project)], timeout=120, extra=extra))
                report['resourcesClosed'] = True
                if report['collection'] == 'OBSERVED':report['stage'] = 'COMPLETE'
            except Exception:
                report['resourcesClosed'] = False
                report['collection'] = 'UNAVAILABLE'
        if report['controlCommandFailure']:
            report['collection'] = 'UNAVAILABLE'
            write_control_failure(private, first_control_failure, report['resourcesClosed'])
        private_write(private / 'outcome-private.json', json.dumps(report, allow_nan=False).encode())
        if report['resourcesClosed'] and not report['controlCommandFailure']:
            try:
                private_write(private / 'safe-result.json', validate_public(report))
            except Exception:
                report['collection'] = 'UNAVAILABLE'
    return 0 if report['collection'] == 'OBSERVED' and report['resourcesClosed'] else 1


def main():
    if sys.argv[1:] == ['--run']:
        return actual_experiment(os.environ)
    if sys.argv[1:] == ['--validate']:
        folder = Path(os.environ['RUNNER_TEMP']) / 'chapter-map-diagnostic'
        value = decode_private(private_read(folder / 'safe-result.json'))
        need(value['sourceRevision'] == os.environ.get('GITHUB_SHA') and os.environ.get('GITHUB_REPOSITORY') == REPOSITORY and os.environ.get('GITHUB_REF') == BRANCH and os.environ.get('GITHUB_RUN_ATTEMPT') == '1')
        validate_public(value)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            stream.write('safe_artifact=true\n')
        return 0
    return 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('DIAGNOSTIC_UNAVAILABLE')
        sys.exit(1)
