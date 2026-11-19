"""Pure closed diagnostic projection; no IO or execution authority."""
import json
import math
import re
from urllib.parse import urlsplit

GIB = 1024**3
LIMIT = 1024**2
WAITS = ('Activity', 'BufferPin', 'Client', 'Extension', 'IO', 'IPC', 'LWLock', 'Lock', 'Timeout')
NODES = ('Result', 'Function Scan', 'Seq Scan', 'Index Scan', 'Index Only Scan', 'Bitmap Heap Scan', 'Bitmap Index Scan', 'Nested Loop', 'Hash Join', 'Merge Join', 'Hash', 'Aggregate', 'Group', 'Sort', 'Incremental Sort', 'Limit', 'Append', 'CTE Scan', 'Subquery Scan', 'Materialize', 'Memoize', 'Gather', 'Gather Merge', 'Unique', 'SetOp', 'ProjectSet', 'Values Scan', 'WindowAgg')
PLAN_KEYS = set(('Node Type|Parallel Aware|Async Capable|Startup Cost|Total Cost|Plan Rows|Plan Width|Actual Startup Time|Actual Total Time|Actual Rows|Actual Loops|Plans|Parent Relationship|Subplan Name|Schema|Relation Name|Alias|Index Name|Scan Direction|Filter|Rows Removed by Filter|Index Cond|Recheck Cond|Rows Removed by Index Recheck|Join Type|Inner Unique|Join Filter|Rows Removed by Join Filter|Hash Cond|Merge Cond|Sort Key|Sort Method|Sort Space Used|Sort Space Type|Group Key|Strategy|Partial Mode|Output|Shared Hit Blocks|Shared Read Blocks|Shared Dirtied Blocks|Shared Written Blocks|Local Hit Blocks|Local Read Blocks|Local Dirtied Blocks|Local Written Blocks|Temp Read Blocks|Temp Written Blocks|I/O Read Time|I/O Write Time|Hash Buckets|Original Hash Buckets|Hash Batches|Original Hash Batches|Peak Memory Usage|Workers Planned|Workers Launched|Workers|CTE Name|Cache Key|Cache Mode|Cache Hits|Cache Misses|Cache Evictions|Cache Overflows').split('|'))


PLAN_KEYS.update({'Function Name', 'Shared I/O Read Time', 'Shared I/O Write Time', 'Local I/O Read Time', 'Local I/O Write Time', 'Temp I/O Read Time', 'Temp I/O Write Time'})
BUFFER_KEYS = {key for key in PLAN_KEYS if key.endswith(' Blocks') or 'I/O ' in key}
ROLES = {'db', 'rest', 'auth', 'kong', 'realtime', 'storage', 'inbucket', 'edge_runtime'}


def need(ok):
    if not ok:
        raise ValueError('DIAGNOSTIC_UNAVAILABLE')


def decode_private(raw):
    need(isinstance(raw, (str, bytes)) and len(raw) <= 4 * LIMIT)
    def pairs(rows):
        result = {}
        for key, value in rows:
            need(key not in result)
            result[key] = value
        return result
    def invalid(_value):
        raise ValueError('DIAGNOSTIC_UNAVAILABLE')
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)


def number(value, minimum=0):
    need(type(value) in (int, float) and math.isfinite(value) and value >= minimum)
    return value


def local_api(value):
    need(type(value) is str and value.rstrip('/') in ('http://127.0.0.1:58321', 'http://[::1]:58321'))
    parsed = urlsplit(value)
    need(parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', '::1') and parsed.port == 58321 and not parsed.username and not parsed.password and parsed.path in ('', '/') and not parsed.query and not parsed.fragment)
    return value.rstrip('/')


def optional_number(value):
    return None if value is None else number(value)


def project_plan(value):
    need(type(value) is list and len(value) == 1 and type(value[0]) is dict)
    root = value[0]
    need(set(root) <= {'Plan', 'Planning', 'Planning Time', 'Execution Time', 'JIT', 'Triggers', 'Settings', 'Query Identifier'})
    need({'Plan', 'Planning Time', 'Execution Time'} <= set(root))
    planning = root.get('Planning', {})
    need(type(planning) is dict and set(planning) <= BUFFER_KEYS)
    for item in planning.values():number(item)
    rows = []
    def visit(node, depth):
        need(type(node) is dict and depth <= 12 and len(rows) < 64 and set(node) <= PLAN_KEYS)
        need({'Node Type', 'Actual Total Time', 'Actual Rows', 'Actual Loops'} <= set(node))
        kind = node['Node Type']
        need(kind in NODES)
        for key in BUFFER_KEYS & set(node):number(node[key])
        if 'Function Name' in node:need(type(node['Function Name']) is str and len(node['Function Name']) <= 128)
        rows.append({'type': kind, 'rows': number(node['Actual Rows']), 'loops': number(node['Actual Loops']), 'timeMs': number(node['Actual Total Time']), 'sharedHits': optional_number(node.get('Shared Hit Blocks')), 'sharedReads': optional_number(node.get('Shared Read Blocks')), 'tempReads': optional_number(node.get('Temp Read Blocks')), 'tempWrites': optional_number(node.get('Temp Written Blocks'))})
        children = node.get('Plans', [])
        need(type(children) is list)
        for child in children:visit(child, depth + 1)
    visit(root['Plan'], 0)
    jit = root.get('JIT')
    if jit is not None:need(type(jit) is dict and set(jit) <= {'Functions', 'Options', 'Timing'} and 'Functions' in jit)
    # Absent optional buffer/JIT observations stay null, never fabricated zero.
    return {'collection': 'OPAQUE' if len(rows) == 1 and rows[0]['type'] in ('Result', 'Function Scan') else 'OBSERVED', 'executed': True, 'authorized': True, 'executionMs': number(root['Execution Time']), 'planningMs': number(root['Planning Time']), 'jitFunctions': number(jit['Functions']) if jit is not None else None, 'nodes': rows}


def denied_helper_plan():
    return {'query': 'CHAPTER_AVAILABILITY', 'collection': 'NOT_AUTHORIZED', 'executed': False, 'authorized': False, 'executionMs': None, 'planningMs': None, 'jitFunctions': None, 'nodes': []}


def stop_signal_class(role, value):
    need(role in ROLES and (value is None or type(value) is str))
    if value is None or value == '':return 'DEFAULT_TERM'
    if value in ('SIGTERM', 'TERM', '15'):return 'TERM'
    if role == 'db' and value in ('SIGINT', 'INT', '2'):return 'DB_INT'
    if role == 'kong' and value in ('SIGQUIT', 'QUIT', '3'):return 'KONG_QUIT'
    raise ValueError('DIAGNOSTIC_UNAVAILABLE')


def stopped_services(rows, expected_ids, signals, project):
    need(type(rows) is list and len(rows) == len(expected_ids) == 8)
    need({row['Id'] for row in rows} == set(expected_ids))
    found = set()
    for row in rows:
        role = next((role for role in ROLES if row['Name'] == '/supabase_' + role + '_' + project), None)
        need(role and role not in found and row['Config']['Labels'].get('com.supabase.cli.project') == project)
        found.add(role)
        state = row['State']
        need(state['Running'] is False and state['Restarting'] is False and state['Dead'] is False and state['OOMKilled'] is False and type(state['Pid']) is int and state['Pid'] == 0 and state['Status'] == 'exited')
        need(type(row['RestartCount']) is int and row['RestartCount'] == 0)
        signal = stop_signal_class(role, row['Config'].get('StopSignal'))
        need(signals[role] == signal)
        expected_exit = {'DEFAULT_TERM': 143, 'TERM': 143, 'DB_INT': 130, 'KONG_QUIT': 131}[signal]
        need(type(state['ExitCode']) is int and state['ExitCode'] in (0, expected_exit))
    need(found == ROLES)
    return {'collection': 'OBSERVED', 'services': 8, 'signalClasses': [{'role': role, 'signal': signals[role]} for role in sorted(found)]}


def summarize_http(rows, count):
    need(type(rows) is list and len(rows) == count and count in (1, 39, 59))
    for row in rows:
        need(type(row) is dict and set(row) == {'headersMs', 'bodyMs', 'totalMs', 'bodyBytes', 'status', 'startOffsetMs'})
        number(row['startOffsetMs']); number(row['headersMs']); number(row['bodyMs']); number(row['totalMs']); number(row['bodyBytes'])
        need(abs(row['bodyMs'] - (row['totalMs'] - row['headersMs'])) < 0.000001)
        need(row['headersMs'] <= row['totalMs'] and type(row['status']) is int and row['status'] == 200 and type(row['bodyBytes']) is int and row['bodyBytes'] <= LIMIT)
    durations = sorted(row['totalMs'] for row in rows)
    p95 = durations[math.ceil(.95 * count) - 1]
    return {'concurrency': count, 'samples': rows, 'p50Ms': durations[math.ceil(.5 * count) - 1], 'p95Ms': p95, 'maxMs': durations[-1], 'budgetMs': 500, 'sloPass': p95 <= 500}


def validate_public(value):
    need(type(value) is dict and set(value) == {'schemaVersion', 'kind', 'executionAuthority', 'fixtureHistory', 'nativeHistoryEquivalent', 'cannotClearNativeGate', 'sourceRevision', 'collection', 'stage', 'resourceFacts', 'versions', 'settings', 'fixtureCounts', 'batches', 'plans', 'resourcesClosed', 'controlCommandFailure', 'terminationUnknown', 'shutdown'})
    need(type(value['schemaVersion']) is int and value['schemaVersion'] == 1 and value['kind'] == 'LOCAL_CHAPTER_MAP_DIAGNOSTIC' and value['executionAuthority'] == 'NONE' and value['fixtureHistory'] == 'EMPTY_BASELINE' and value['nativeHistoryEquivalent'] is False and value['cannotClearNativeGate'] is True)
    need(type(value['sourceRevision']) is str and re.fullmatch('[a-f0-9]{40}', value['sourceRevision']))
    need(value['collection'] in ('OBSERVED', 'UNAVAILABLE') and value['resourcesClosed'] is True and value['controlCommandFailure'] is False and value['terminationUnknown'] is False)
    resource = value['resourceFacts']
    need(type(resource) is dict and set(resource) == {'hostCpus', 'availableRamBytes', 'freeDiskBytes', 'backendCpuCores', 'backendMemoryBytes', 'backendSwapBytes', 'services'})
    for item in resource.values():
        need(type(item) is int)
        number(item)
    versions = value['versions']
    need(type(versions) is dict and set(versions) == {'node', 'supabase', 'postgresVersionNumber', 'dockerVersion'})
    need(versions['node'] in ('UNOBSERVED', 'v24.13.1') and versions['supabase'] in ('UNOBSERVED', '2.109.1'))
    need(value['stage'] in ('PREFLIGHT', 'ISOLATION', 'BACKEND', 'FIXTURE', 'HTTP_1', 'HTTP_39', 'HTTP_59', 'PLANS', 'CLEANUP', 'COMPLETE'))
    settings = value['settings']
    need(type(settings) is dict and set(settings) == {'apiPoolSize', 'dbMaxConnections', 'dbJitEnabled'})
    if settings['apiPoolSize'] is not None:number(settings['apiPoolSize'], 1)
    number(settings['dbMaxConnections'])
    need(settings['dbJitEnabled'] is None or type(settings['dbJitEnabled']) is bool)
    need(type(versions['postgresVersionNumber']) is int)
    number(versions['postgresVersionNumber'])
    need(type(versions['dockerVersion']) is list and len(versions['dockerVersion']) in (0, 3))
    for part in versions['dockerVersion']:
        need(type(part) is int and 0 <= part <= 10000)
    counts = value['fixtureCounts']
    need(type(counts) is dict and set(counts) == {'students', 'quizHistory', 'reviewHistory'} and type(counts['students']) is int and 0 <= counts['students'] <= 59 and type(counts['quizHistory']) is int and type(counts['reviewHistory']) is int and counts['quizHistory'] == counts['reviewHistory'] == 0)
    need(type(value['batches']) is list and len(value['batches']) <= 3)
    for batch, count in zip(value['batches'], (1, 39, 59)):
        need(set(batch) == {'concurrency', 'samples', 'p50Ms', 'p95Ms', 'maxMs', 'budgetMs', 'sloPass', 'preparedWorkers', 'waits', 'waitSampleBoundsMs', 'settledAtWaitStart', 'settledAtWaitEnd'})
        need(type(batch['preparedWorkers']) is int and batch['preparedWorkers'] == count)
        need(type(batch['sloPass']) is bool and type(batch['concurrency']) is int)
        bounds = batch['waitSampleBoundsMs']
        need(type(bounds) is list and len(bounds) == 2)
        need(number(bounds[0]) <= number(bounds[1]))
        need(type(batch['settledAtWaitStart']) is int and type(batch['settledAtWaitEnd']) is int and 0 <= batch['settledAtWaitStart'] <= batch['settledAtWaitEnd'] <= count)
        waits = batch['waits']; need(type(waits) is dict and set(waits) == set(WAITS) | {'NONE', 'OTHER'})
        for item in waits.values():
            need(type(item) is int)
            number(item)
        need({key: val for key, val in batch.items() if key not in ('preparedWorkers', 'waits', 'waitSampleBoundsMs', 'settledAtWaitStart', 'settledAtWaitEnd')} == summarize_http(batch['samples'], count))
    need(type(value['plans']) is list and len(value['plans']) <= 3)
    for plan, query in zip(value['plans'], ('CHAPTER_MAP', 'LEARNING_PROGRESS', 'CHAPTER_AVAILABILITY')):
        need(type(plan) is dict and set(plan) == {'query', 'collection', 'executed', 'authorized', 'executionMs', 'planningMs', 'jitFunctions', 'nodes'} and plan['query'] == query)
        if query == 'CHAPTER_AVAILABILITY':
            need(plan == denied_helper_plan())
            continue
        need(plan['collection'] in ('OBSERVED', 'OPAQUE') and plan['executed'] is True and plan['authorized'] is True)
        number(plan['executionMs']);number(plan['planningMs']);optional_number(plan['jitFunctions'])
        need(type(plan['nodes']) is list and 1 <= len(plan['nodes']) <= 64)
        for node in plan['nodes']:
            need(type(node) is dict and set(node) == {'type', 'rows', 'loops', 'timeMs', 'sharedHits', 'sharedReads', 'tempReads', 'tempWrites'} and node['type'] in NODES)
            for key in ('rows', 'loops', 'timeMs'):number(node[key])
            for key in ('sharedHits', 'sharedReads', 'tempReads', 'tempWrites'):optional_number(node[key])
    shutdown = value['shutdown']
    need(type(shutdown) is dict and set(shutdown) == {'collection', 'services', 'signalClasses'})
    need(shutdown['collection'] in ('UNOBSERVED', 'OBSERVED') and type(shutdown['services']) is int)
    if shutdown['collection'] == 'UNOBSERVED':need(shutdown == {'collection': 'UNOBSERVED', 'services': 0, 'signalClasses': []})
    else:
        need(shutdown['services'] == 8 and type(shutdown['signalClasses']) is list and len(shutdown['signalClasses']) == 8)
        need({item['role'] for item in shutdown['signalClasses']} == ROLES)
        for item in shutdown['signalClasses']:
            need(set(item) == {'role', 'signal'} and item['signal'] in ('DEFAULT_TERM', 'TERM', 'DB_INT', 'KONG_QUIT'))
            need(item['signal'] != 'DB_INT' or item['role'] == 'db')
            need(item['signal'] != 'KONG_QUIT' or item['role'] == 'kong')
    if value['collection'] == 'OBSERVED':
        need(shutdown['collection'] == 'OBSERVED')
        need(170000 <= versions['postgresVersionNumber'] < 180000 and len(versions['dockerVersion']) == 3 and settings['dbMaxConnections'] > 0 and type(settings['dbJitEnabled']) is bool and counts['students'] == 59 and versions['node'] == 'v24.13.1' and versions['supabase'] == '2.109.1' and len(value['batches']) == len(value['plans']) == 3 and resource['hostCpus'] >= 4 and resource['availableRamBytes'] >= 12 * GIB and resource['backendCpuCores'] == 4 and resource['backendMemoryBytes'] == 6 * GIB and resource['backendSwapBytes'] == 0 and resource['services'] == 8)
    raw = json.dumps(value, allow_nan=False, separators=(',', ':')).encode()
    need(len(raw) <= LIMIT)
    return raw


def safe_control_failure(stage, diagnostic, resources_closed):
    stages = {'PREFLIGHT', 'ISOLATION', 'BACKEND', 'FIXTURE', 'HTTP_1', 'HTTP_39', 'HTTP_59', 'PLANS', 'CLEANUP', 'COMPLETE'}
    operations = {'DOCKER_LIST_CONTAINERS', 'DOCKER_LIST_VOLUMES', 'DOCKER_INSPECT_VOLUMES', 'DOCKER_INSPECT_CONTAINERS', 'DOCKER_INFO', 'DOCKER_IMAGE_PULL', 'DOCKER_IMAGE_INSPECT', 'DOCKER_IMAGE_TAG', 'DOCKER_EXEC_READONLY', 'SYSTEM_READ', 'SYSTEM_WRITE', 'SYSTEMD_RELOAD', 'SYSTEMD_START', 'CGROUP_MKDIR', 'CGROUP_CHOWN', 'DOCKER_CONFIG_VALIDATE', 'SYSTEMD_DOCKER_RESTART', 'GIT_HEAD', 'GIT_STATUS', 'GIT_TRACKED_FILES', 'NODE_VERSION', 'NODE_TOKEN_SIGNATURE_VERIFY', 'NODE_KEY_GENERATION', 'SUPABASE_START_HELP', 'SUPABASE_VERSION', 'SUPABASE_START', 'SUPABASE_STATUS', 'SUPABASE_GO_VERSION', 'UNKNOWN'}
    classes = {'UNKNOWN_FLAG', 'CONFIG_PARSE', 'PERMISSION', 'HEALTH', 'IMAGE_PULL', 'PORT', 'CONNECTION', 'UNKNOWN'}
    value = diagnostic if type(diagnostic) is dict else {}
    operation, classification = value.get('operation'), value.get('classification')
    code, size, digest = value.get('exitCode'), value.get('stderrBytes'), value.get('stderrSha256')
    return {'kind': 'FIRST_CONTROL_FAILURE', 'stage': stage if type(stage) is str and stage in stages else 'UNKNOWN', 'operation': operation if type(operation) is str and operation in operations else 'UNKNOWN', 'exitCode': code if type(code) is int and -255 <= code <= 255 else None, 'stderrBytes': size if type(size) is int and 0 <= size <= 4 * LIMIT else None, 'stderrSha256': digest if type(digest) is str and len(digest) == 64 and all(c in '0123456789abcdef' for c in digest) else None, 'classification': classification if type(classification) is str and classification in classes else 'UNKNOWN', 'resourcesClosed': resources_closed is True, 'controlFailure': True, 'terminationUnknown': True}
