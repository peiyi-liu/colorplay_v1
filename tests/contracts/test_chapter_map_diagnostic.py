import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('chapter_diagnostic', ROOT / 'scripts/concurrency/diagnose-chapter-map-read.py')
D = importlib.util.module_from_spec(spec)
spec.loader.exec_module(D)


def public_fixture():
    return {'schemaVersion': 1, 'kind': 'LOCAL_CHAPTER_MAP_DIAGNOSTIC', 'executionAuthority': 'NONE', 'fixtureHistory': 'EMPTY_BASELINE', 'nativeHistoryEquivalent': False, 'cannotClearNativeGate': True, 'sourceRevision': 'a' * 40, 'collection': 'UNAVAILABLE', 'stage': 'PREFLIGHT', 'resourceFacts': dict.fromkeys(('hostCpus', 'availableRamBytes', 'freeDiskBytes', 'backendCpuCores', 'backendMemoryBytes', 'backendSwapBytes', 'services'), 0), 'versions': {'node': 'UNOBSERVED', 'supabase': 'UNOBSERVED', 'postgresVersionNumber': 0, 'dockerVersion': []}, 'settings': {'apiPoolSize': None, 'dbMaxConnections': 0, 'dbJitEnabled': None}, 'fixtureCounts': {'students': 0, 'quizHistory': 0, 'reviewHistory': 0}, 'batches': [], 'plans': [], 'resourcesClosed': True, 'controlCommandFailure': False, 'terminationUnknown': False, 'shutdown': {'collection': 'UNOBSERVED', 'services': 0, 'signalClasses': []}}


class JsonBoundaryTests(unittest.TestCase):
    def test_duplicate_private_fields_are_rejected(self):
        with self.assertRaises(ValueError):
            D.decode_private(b'{"safe":1,"safe":2}')

    def test_nonfinite_private_numbers_are_rejected(self):
        with self.assertRaises(ValueError):
            D.decode_private(b'{"safe":NaN}')


class FixedExperimentTests(unittest.TestCase):
    def test_local_only_targets(self):
        for value in ('http://127.0.0.1:58321', 'http://[::1]:58321/'):
            self.assertEqual(D.local_api(value), value.rstrip('/'))
        for value in ('https://127.0.0.1:58321', 'http://localhost:58321', 'http://127.0.0.1:58321.evil.invalid', 'http://u:p@127.0.0.1:58321', 'http://127.0.0.1:58321/x', 'http://127.0.0.1:58321?secret=x', 'http://127.0.0.1:58321#x', 'http://127.0.0.1:54321'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                D.local_api(value)

    def test_plan_projection_removes_literals_and_classifies_opaque(self):
        raw = [{'Plan': {'Node Type': 'Result', 'Actual Rows': 1, 'Actual Loops': 1, 'Actual Total Time': 123, 'Output': ['SYNTHETIC_SECRET_UUID']}, 'Planning Time': 1, 'Execution Time': 124}]
        value = D.project_plan(raw)
        self.assertEqual(value['collection'], 'OPAQUE')
        self.assertEqual(value['executionMs'], 124)
        self.assertNotIn('SYNTHETIC_SECRET', D.json.dumps(value))
        raw[0]['Plan']['Plans'] = [{'Node Type': 'Seq Scan', 'Actual Rows': 9, 'Actual Loops': 1, 'Actual Total Time': 1, 'Relation Name': 'SYNTHETIC_SECRET_RELATION'}]
        value = D.project_plan(raw)
        self.assertEqual(value['collection'], 'OBSERVED')
        self.assertEqual(len(value['nodes']), 2)
        self.assertNotIn('SYNTHETIC_SECRET', D.json.dumps(value))

    def test_plan_rejects_extra_secret_nonfinite_and_oversized_tree(self):
        base = analyzed_plan()[0]['Plan']
        for node in ({**base, 'password': 'SYNTHETIC_SECRET'}, {**base, 'Actual Rows': float('inf')}, {**base, 'Node Type': 'UNKNOWN_SECRET_NODE'}, {**base, 'Plans': [dict(base)] * 64}):
            with self.assertRaises(ValueError):
                D.project_plan([{'Plan': node, 'Planning Time': 1, 'Execution Time': 1}])

    def test_fixed_parallel_counts_one_attempt_and_all_settled(self):
        import threading
        for count in (1, 39, 59):
            calls = []; lock = threading.Lock()
            def request(token):
                with lock: calls.append(token)
                return {'startOffsetMs': 0, 'headersMs': 2, 'bodyMs': 1, 'totalMs': 3, 'bodyBytes': 32, 'status': 200}
            value = D.run_batch(list(range(59)), count, request, lambda: dict.fromkeys((*D.WAITS, 'NONE', 'OTHER'), 0))
            self.assertEqual(len(calls), count)
            self.assertEqual(set(calls), set(range(count)))
            self.assertEqual(value['concurrency'], count)
            self.assertTrue(value['sloPass'])
            self.assertEqual(len(value['samples']), count)

    def test_failed_request_or_wait_probe_still_drains_all_workers(self):
        for fail_wait in (False, True):
            completed = []
            def request(index):
                completed.append(index)
                if not fail_wait and index == 3: raise ValueError('SYNTHETIC_SECRET')
                return {'startOffsetMs': 0, 'headersMs': 2, 'bodyMs': 1, 'totalMs': 3, 'bodyBytes': 32, 'status': 200}
            def snapshot():
                if fail_wait: raise ValueError('SYNTHETIC_SECRET')
                return {}
            with self.assertRaises(ValueError):
                D.run_batch(list(range(59)), 39, request, snapshot)
            self.assertEqual(set(completed), set(range(39)))
            self.assertEqual(len(completed), 39)

    def test_latency_and_timing_are_not_softened(self):
        row = {'startOffsetMs': 0, 'headersMs': 500, 'bodyMs': 145.733, 'totalMs': 645.733, 'bodyBytes': 32, 'status': 200}
        value = D.summarize_http([row] * 59, 59)
        self.assertEqual(value['p95Ms'], 645.733)
        self.assertEqual(value['budgetMs'], 500)
        self.assertFalse(value['sloPass'])
        for bad in ({**row, 'totalMs': 1}, {**row, 'bodyBytes': D.LIMIT + 1}, {**row, 'status': 500}, {**row, 'password': 'SYNTHETIC_SECRET'}):
            with self.assertRaises(ValueError): D.summarize_http([bad], 1)
        with self.assertRaises(ValueError): D.summarize_http([], 39)

    def test_public_schema_rejects_secret_open_resources_and_false_authority(self):
        value = public_fixture()
        self.assertLessEqual(len(D.validate_public(value)), D.LIMIT)
        for patch in ({'token': 'SYNTHETIC_SECRET'}, {'resourcesClosed': False}, {'controlCommandFailure': True}, {'terminationUnknown': True}, {'controlCommandFailure': True}, {'terminationUnknown': True}, {'nativeHistoryEquivalent': True}, {'executionAuthority': 'VERIFIED'}, {'schemaVersion': True}):
            with self.assertRaises(ValueError): D.validate_public({**value, **patch})
        with self.assertRaises(ValueError): D.validate_public({**value, 'collection': 'OBSERVED'})


class ResourceAndHttpTests(unittest.TestCase):
    def test_actual_aggregate_readback_rejects_foreign_leaf_or_separate_limits(self):
        import copy
        roles = {'db', 'rest', 'auth', 'kong', 'realtime', 'storage', 'inbucket', 'edge_runtime'}
        rows = [{'Name': '/supabase_' + role + '_synthetic', 'Id': format(index, '064x'), 'State': {'Running': True, 'Pid': 1000 + index}, 'Config': {'Labels': {'com.supabase.cli.project': 'synthetic'}, 'Env': []}, 'NetworkSettings': {'Ports': {}}} for index, role in enumerate(sorted(roles))]
        for row, port in zip(rows, ('58321', '58322', '58324')):
            row['NetworkSettings']['Ports'] = {'port': [{'HostIp': '127.0.0.1', 'HostPort': port}]}
        class IO:
            def __init__(self):self.foreign = False;self.memory = str(6 * D.GIB);self.swap = '0';self.cpu = '400000 100000'
            def system_read(self, path):
                if path == '/proc/self/cgroup':return b'0::/runner'
                if path.startswith('/proc/'):
                    return b'0::/foreign/docker.scope' if self.foreign else b'0::/owned.slice/docker.scope'
                return {'memory.max': self.memory, 'memory.swap.max': self.swap, 'cpu.max': self.cpu}[Path(path).name].encode()
        io = IO()
        self.assertIsNone(D.observe_backend(io, rows, 'owned.slice', roles, 'synthetic')['apiPoolSize'])
        for attribute, value in [('foreign', True), ('memory', 'max'), ('swap', 'max'), ('cpu', 'max 100000')]:
            bad = IO();setattr(bad, attribute, value)
            with self.assertRaises(ValueError):D.observe_backend(bad, rows, 'owned.slice', roles, 'synthetic')
        duplicate = copy.deepcopy(rows);duplicate[1] = duplicate[0]
        with self.assertRaises(ValueError):D.observe_backend(IO(), duplicate, 'owned.slice', roles, 'synthetic')

    def test_owned_http_deadline_and_close_do_not_retry(self):
        from unittest.mock import patch
        for timeout in (False, True):
            events = [];timers = []
            class Timer:
                def __init__(self, seconds, action):self.action = action;timers.append(self);self.seconds = seconds
                def start(self):events.append('TIMER_START')
                def cancel(self):events.append('TIMER_CANCEL')
                def join(self):events.append('TIMER_JOIN')
            class Socket:
                def shutdown(self, _how):events.append('SHUTDOWN')
                def close(self):events.append('SOCKET_CLOSE')
            class Response:
                status = 200
                def close(self):events.append('RESPONSE_CLOSE')
                def read(self, maximum):
                    self.maximum = maximum
                    return b'{"mode":"open","rules_version":"2026-08-sequence-1","chapters":[{},{},{},{},{},{}]}'
            class Connection:
                sock = Socket()
                def __init__(self, host, port, timeout):events.append('CONNECTION')
                def connect(self):events.append('CONNECT')
                def request(self, method, path, **kwargs):
                    events.append('POST');self.path = path
                def getresponse(self):
                    if timeout:timers[0].action()
                    return Response()
                def close(self):events.append('CLOSE')
            with patch.object(D.threading, 'Timer', Timer), patch.object(D.http.client, 'HTTPConnection', Connection):
                if timeout:
                    with self.assertRaises(ValueError):D.request_once('http://127.0.0.1:58321', 'SYNTHETIC_ANON', 'SYNTHETIC_TOKEN')
                else:self.assertEqual(D.request_once('http://127.0.0.1:58321', 'SYNTHETIC_ANON', 'SYNTHETIC_TOKEN')['status'], 200)
            self.assertEqual(events.count('POST'), 1)
            self.assertEqual(timers[0].seconds, 15)
            self.assertEqual(events[-5:], ['TIMER_CANCEL', 'RESPONSE_CLOSE', 'CLOSE', 'SOCKET_CLOSE', 'TIMER_JOIN'])
            self.assertEqual(events.count('SHUTDOWN'), int(timeout))


class CompleteProjectionTests(unittest.TestCase):
    def test_complete_numeric_projection_and_partial_failure_cannot_fake_ready(self):
        import copy
        value = public_fixture()
        value.update(collection='OBSERVED', stage='COMPLETE')
        value['resourceFacts'].update(hostCpus=4, availableRamBytes=12 * D.GIB, freeDiskBytes=10 * D.GIB, backendCpuCores=4, backendMemoryBytes=6 * D.GIB, backendSwapBytes=0, services=8)
        value['versions'].update(node='v24.13.1', supabase='2.109.1', postgresVersionNumber=170006, dockerVersion=[29, 1, 3])
        value['settings'].update(dbMaxConnections=100, dbJitEnabled=True)
        value['fixtureCounts']['students'] = 59
        for count in (1, 39, 59):
            rows = [{'startOffsetMs': 0, 'headersMs': 100, 'bodyMs': 545.733, 'totalMs': 645.733, 'bodyBytes': 3000, 'status': 200}] * count
            value['batches'].append({**D.summarize_http(rows, count), 'waits': dict.fromkeys((*D.WAITS, 'NONE', 'OTHER'), 0), 'preparedWorkers': count, 'waitSampleBoundsMs': [0, 1], 'settledAtWaitStart': 0, 'settledAtWaitEnd': count})
        for query in ('CHAPTER_MAP', 'LEARNING_PROGRESS', 'CHAPTER_AVAILABILITY'):
            value['plans'].append(D.denied_helper_plan() if query == 'CHAPTER_AVAILABILITY' else {'query': query, **D.project_plan(analyzed_plan())})
        value['shutdown'] = {'collection': 'OBSERVED', 'services': 8, 'signalClasses': [{'role': role, 'signal': 'DEFAULT_TERM'} for role in sorted(('db', 'rest', 'auth', 'kong', 'realtime', 'storage', 'inbucket', 'edge_runtime'))]}
        raw = D.validate_public(value)
        self.assertLess(len(raw), D.LIMIT)
        self.assertFalse(D.decode_private(raw)['batches'][-1]['sloPass'])
        self.assertTrue(D.decode_private(raw)['cannotClearNativeGate'])
        for field in ('resourceFacts', 'settings', 'versions'):
            bad = copy.deepcopy(value);bad[field]['password'] = 'SYNTHETIC_SECRET'
            with self.assertRaises(ValueError):D.validate_public(bad)
        for count in (0, 1, 2):
            bad = copy.deepcopy(value);bad['batches'] = bad['batches'][:count]
            with self.assertRaises(ValueError):D.validate_public(bad)
        bad = copy.deepcopy(value);bad['plans'][1]['query'] = 'CHAPTER_MAP'
        with self.assertRaises(ValueError):D.validate_public(bad)


class CohortPreparationTests(unittest.TestCase):
    def test_preparation_failure_releases_no_request_and_drains_workers(self):
        from unittest.mock import patch
        import threading
        calls = []
        class Broken:
            def __init__(self, *_args, **_kwargs):pass
            def wait(self):raise threading.BrokenBarrierError()
        with patch.object(D.threading, 'Barrier', Broken):
            with self.assertRaises(threading.BrokenBarrierError):
                D.run_batch(list(range(59)), 39, lambda token: calls.append(token), lambda: calls.append('WAIT'))
        self.assertEqual(calls, [])


def analyzed_plan(kind='Result'):
    return [{'Plan': {'Node Type': kind, 'Actual Startup Time': .1, 'Actual Total Time': .5, 'Actual Rows': 6, 'Actual Loops': 1}, 'Planning Time': .2, 'Execution Time': .6}]


class PlanR1Tests(unittest.TestCase):
    def test_standard_pg17_fields_are_accepted_without_exposing_private_text(self):
        import copy
        for patch in ('planning', 'function', 'io'):
            value = analyzed_plan('Function Scan')
            if patch == 'planning':value[0]['Planning'] = {'Shared Hit Blocks': 4, 'Shared Read Blocks': 0}
            if patch == 'function':value[0]['Plan']['Function Name'] = 'SYNTHETIC_PRIVATE_FUNCTION'
            if patch == 'io':value[0]['Plan'].update({'Shared I/O Read Time': .1, 'Shared I/O Write Time': .2, 'Local I/O Read Time': 0, 'Local I/O Write Time': 0, 'Temp I/O Read Time': 0, 'Temp I/O Write Time': 0})
            with self.subTest(patch=patch):
                try:result = D.project_plan(copy.deepcopy(value))
                except ValueError:self.fail('STANDARD_PG17_SHAPE_REJECTED')
                self.assertNotIn('SYNTHETIC_PRIVATE', str(result))
                self.assertEqual(result['executionMs'], .6)

    def test_missing_required_observation_is_never_a_fake_zero(self):
        for field in ('Planning Time', 'Execution Time', 'Actual Rows', 'Actual Loops', 'Actual Total Time'):
            value = analyzed_plan()
            if field.startswith('Actual '):del value[0]['Plan'][field]
            else:del value[0][field]
            with self.subTest(field=field), self.assertRaises(ValueError):D.project_plan(value)


def services():
    roles = {'db', 'rest', 'auth', 'kong', 'realtime', 'storage', 'inbucket', 'edge_runtime'}
    rows = [{'Name': '/supabase_' + role + '_synthetic', 'Id': format(index, '064x'), 'RestartCount': 0, 'State': {'Running': True, 'Pid': 1000 + index, 'Status': 'running', 'Restarting': False, 'Dead': False, 'OOMKilled': False, 'ExitCode': 0}, 'Config': {'Labels': {'com.supabase.cli.project': 'synthetic'}, 'Env': []}, 'NetworkSettings': {'Ports': {}}} for index, role in enumerate(sorted(roles))]
    for row, port in zip(rows, ('58321', '58322', '58324')):
        row['NetworkSettings']['Ports'] = {'port': [{'HostIp': '127.0.0.1', 'HostPort': port}]}
    return roles, rows


class GracefulR1Tests(unittest.TestCase):
    def exercise(self, failure=None):
        import copy,json
        roles, original = services()
        before = copy.deepcopy(original)
        after = copy.deepcopy(original)
        for row in after:row['State'].update(Running=False, Pid=0, Status='exited')
        if failure == 'unknown':before[0]['Config']['StopSignal'] = 'SIGKILL'
        if failure == 'foreign':before[0]['Config']['Labels']['com.supabase.cli.project'] = 'foreign'
        if failure == 'live':after[0]['State'].update(Running=True, Pid=1000)
        if failure == '137':after[0]['State']['ExitCode'] = 137
        if failure == 'OOM':after[0]['State']['OOMKilled'] = True
        if failure == 'restart':after[0]['RestartCount'] = 1
        if failure == 'missing':after.pop()
        if failure == 'foreign-after':after[0]['Config']['Labels']['com.supabase.cli.project'] = 'foreign'
        calls = [];inspections = 0;cleaned = False
        class IO:
            def system_read(self, path):
                if path == '/proc/self/cgroup':return b'0::/runner'
                if path.startswith('/proc/'):return b'0::/owned.slice/docker.scope'
                return {'memory.max': str(6 * D.GIB), 'memory.swap.max': '0', 'cpu.max': '400000 100000', 'cgroup.events': 'populated 0'}[Path(path).name].encode()
        def docker(*args):
            nonlocal inspections
            calls.append(args)
            if args[0] == 'ps':return b'' if cleaned else '\n'.join(row['Id'] for row in original).encode()
            if args[0] == 'inspect':
                inspections += 1
                return json.dumps(before if inspections == 1 else after).encode()
            self.assertEqual(args, ('stop', '--timeout=-1', *(row['Id'] for row in original)))
            if failure == 'timeout':raise ValueError('SYNTHETIC_CONTROL_TIMEOUT')
            return b''
        def cleanup():
            nonlocal cleaned
            calls.append(('CLI_CLEANUP',));cleaned = True
        if failure:
            with self.assertRaises(ValueError):D.graceful_close(IO(), original, 'owned.slice', roles, 'synthetic', docker, cleanup)
            self.assertFalse(cleaned)
            self.assertLessEqual(sum(call[0] == 'stop' for call in calls), 1)
        else:
            result = D.graceful_close(IO(), original, 'owned.slice', roles, 'synthetic', docker, cleanup)
            self.assertEqual(result['services'], 8)
            self.assertEqual(len(result['signalClasses']), 8)
            self.assertTrue(all(item['signal'] == 'DEFAULT_TERM' for item in result['signalClasses']))
            self.assertLess(calls.index(('CLI_CLEANUP',)), len(calls) - 1)
            self.assertEqual(sum(call[0] == 'stop' for call in calls), 1)
        return calls

    def test_owned8_natural_state_proven_before_cli_cleanup(self):
        self.exercise()

    def test_any_uncertain_state_has_no_force_or_cli_fallback(self):
        for failure in ('unknown', 'foreign', 'live', '137', 'OOM', 'restart', 'missing', 'foreign-after', 'timeout'):
            with self.subTest(failure=failure):self.exercise(failure)

    def test_role_specific_safe_stop_signals(self):
        self.assertEqual(D.stop_signal_class('kong', 'SIGQUIT'), 'KONG_QUIT')
        self.assertEqual(D.stop_signal_class('db', 'SIGINT'), 'DB_INT')
        self.assertEqual(D.stop_signal_class('auth', '15'), 'TERM')
        self.assertEqual(D.stop_signal_class('rest', None), 'DEFAULT_TERM')
        for role, signal in (('auth', 'SIGINT'), ('db', 'SIGQUIT'), ('realtime', 'SIGUSR1'), ('kong', 'SIGKILL'), ('rest', 15)):
            with self.assertRaises(ValueError):D.stop_signal_class(role, signal)


class ClosedR1Tests(unittest.TestCase):
    def test_first_control_failure_is_saved_and_printed_without_raw_data(self):
        import contextlib
        import io
        import tempfile
        self.assertTrue(callable(getattr(D, 'write_control_failure', None)))
        first = D.safe_control_failure('FIXTURE', {'operation': 'SUPABASE_START', 'exitCode': 1, 'stderrBytes': 7, 'stderrSha256': 'a' * 64, 'classification': 'PERMISSION', 'message': 'SYNTHETIC_SECRET'}, False)
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()) as output:
            D.write_control_failure(Path(folder), first, True)
            raw = (Path(folder) / 'control-failure-private.json').read_bytes()
            self.assertEqual(D.decode_private(raw), D.decode_private(output.getvalue()))
            self.assertEqual((Path(folder) / 'control-failure-private.json').stat().st_mode & 0o777, 0o600)
        value = D.decode_private(raw)
        self.assertTrue(value['resourcesClosed'])
        self.assertTrue(value['controlCommandFailure'])
        self.assertTrue(value['terminationUnknown'])
        self.assertEqual(value['stage'], 'FIXTURE')
        self.assertNotIn('SYNTHETIC_SECRET', raw.decode())

    def test_optional_plan_data_is_null_and_unknown_secret_is_rejected(self):
        value = D.project_plan(analyzed_plan())
        self.assertIsNone(value['jitFunctions'])
        self.assertIsNone(value['nodes'][0]['sharedHits'])
        self.assertIsNone(value['nodes'][0]['tempReads'])
        bad = analyzed_plan();bad[0]['Plan']['password'] = 'SYNTHETIC_SECRET'
        with self.assertRaises(ValueError):D.project_plan(bad)

    def test_denied_helper_is_not_executed_or_turned_into_fake_time(self):
        value = D.denied_helper_plan()
        self.assertEqual(value['query'], 'CHAPTER_AVAILABILITY')
        self.assertEqual(value['collection'], 'NOT_AUTHORIZED')
        self.assertIs(value['executed'], False)
        self.assertIs(value['authorized'], False)
        self.assertIsNone(value['executionMs'])
        self.assertIsNone(value['planningMs'])
        self.assertEqual(value['nodes'], [])

    def test_safe_control_projection_never_outputs_message_or_secret(self):
        value = D.safe_control_failure('FIXTURE', {'operation': 'SUPABASE_START', 'exitCode': None, 'stderrBytes': None, 'stderrSha256': None, 'message': 'SYNTHETIC_SECRET'}, False)
        self.assertEqual(value['operation'], 'SUPABASE_START')
        self.assertEqual(value['stage'], 'FIXTURE')
        self.assertIsNone(value['exitCode'])
        self.assertIsNone(value['stderrBytes'])
        self.assertNotIn('SYNTHETIC', str(value))
        self.assertIs(value['resourcesClosed'], False)
        self.assertEqual(D.safe_control_failure('SYNTHETIC_SECRET', {'operation': 'SYNTHETIC_SECRET'}, False)['stage'], 'UNKNOWN')


class SignalPolicyR1Tests(unittest.TestCase):
    def test_role_specific_graceful_signals_and_unknowns(self):
        for role in ('db', 'rest', 'auth', 'kong', 'realtime', 'storage', 'inbucket', 'edge_runtime'):
            self.assertEqual(D.stop_signal_class(role, None), 'DEFAULT_TERM')
            self.assertEqual(D.stop_signal_class(role, ''), 'DEFAULT_TERM')
            for value in ('SIGTERM', 'TERM', '15'):
                self.assertEqual(D.stop_signal_class(role, value), 'TERM')
        self.assertEqual(D.stop_signal_class('db', 'SIGINT'), 'DB_INT')
        self.assertEqual(D.stop_signal_class('kong', 'SIGQUIT'), 'KONG_QUIT')
        for role, value in (('rest', 'SIGINT'), ('db', 'SIGQUIT'), ('auth', 'SIGKILL'), ('realtime', 'SIGUSR1'), ('storage', 15)):
            with self.assertRaises(ValueError):D.stop_signal_class(role, value)


class ActualPermissionBranchR1Tests(unittest.TestCase):
    def test_actual_plan_loop_never_executes_private_helper_or_changes_role(self):
        import ast
        tree = ast.parse(Path(D.__file__).read_bytes())
        actual = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'actual_experiment')
        query_assignment = next(node for node in ast.walk(actual) if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'queries' for target in node.targets))
        loop = next(node for node in ast.walk(actual) if isinstance(node, ast.For) and isinstance(node.target, ast.Tuple) and [part.id for part in node.target.elts] == ['label', 'query'])
        code = compile(ast.fix_missing_locations(ast.Module(body=[query_assignment, loop], type_ignores=[])), '<actual-r1-plan-loop>', 'exec')
        for authorized in (False, True):
            calls = []
            def sql(query):
                calls.append(query)
                return authorized if 'has_function_privilege' in query else analyzed_plan()
            namespace = {'sql': sql, 'prefix': 'SYNTHETIC_AUTHENTICATED_CONTEXT;', 'report': {'plans': []}, 'project_plan': D.project_plan, 'need': D.need, 'denied_helper_plan': D.denied_helper_plan}
            if authorized:
                with self.assertRaises(ValueError):exec(code, namespace)
            else:
                exec(code, namespace)
                self.assertEqual(namespace['report']['plans'][-1], D.denied_helper_plan())
            self.assertEqual(len(calls), 3)
            self.assertEqual(sum('explain (analyze,buffers,format json)' in query for query in calls), 2)
            self.assertEqual(sum('has_function_privilege' in query for query in calls), 1)
            self.assertFalse(any('select public.chapter_content_is_available(id)' in query for query in calls))
            self.assertTrue(all(query.startswith('SYNTHETIC_AUTHENTICATED_CONTEXT;') for query in calls))


class FixedCommandStreamTests(unittest.TestCase):
    def boundary(self, private, result):
        import ast
        from types import SimpleNamespace
        tree = ast.parse(Path(D.__file__).read_bytes())
        actual = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'actual_experiment')
        start = next(i for i, n in enumerate(actual.body) if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'original_run' for t in n.targets))
        end = next(i for i, n in enumerate(actual.body) if isinstance(n, ast.Assign) and any(isinstance(t, ast.Attribute) and t.attr == 'run' for t in n.targets))
        calls = []
        def old_run(*args, **options):
            calls.append('OLD_RUN');io.command_diagnostic = {'operation': 'UNKNOWN', 'exitCode': 1, 'stderrBytes': 0}
            raise ValueError('SYNTHETIC_OLD_FAILURE')
        def bounded(*args, **options):
            calls.append((args, options))
            if isinstance(result, Exception):raise result
            return result
        io = SimpleNamespace(run=old_run, command_diagnostic=None)
        scope = dict(vars(D), io=io, module=SimpleNamespace(bounded=bounded), B=SimpleNamespace(EXCLUDED='FIXED_EXCLUSIONS'), private=private, project=None, cleaning=False, report={'stage': 'PREFLIGHT', 'controlCommandFailure': False, 'terminationUnknown': False}, shutil=SimpleNamespace(which=lambda name: '/fixed/' + name))
        body = actual.body[start:end + 1] + ast.parse('return observed_run, lambda: first_control_failure').body
        wrapper = ast.FunctionDef(name='make_boundary', args=ast.arguments(posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]), body=body, decorator_list=[])
        exec(compile(ast.fix_missing_locations(ast.Module(body=[wrapper], type_ignores=[])), '<actual-command-boundary>', 'exec'), scope)
        run, first = scope['make_boundary']()
        return run, first, calls, io

    def test_actual_stdout_only_failure_keeps_named_operation_and_metadata(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            run, first, calls, io = self.boundary(Path(folder), (1, b'ERR_PNPM_UNEXPECTED_STORE SYNTHETIC_SECRET', b''))
            with self.assertRaises(ValueError):run(['/fixed/pnpm', 'exec', 'supabase', '--version'], timeout=60, maximum=4 * D.LIMIT, env={'PATH': '/fixed:/usr/bin:/bin'})
            self.assertEqual(first()['operation'], 'SUPABASE_VERSION')
            self.assertEqual(first()['stdoutBytes'], 42)
            self.assertNotIn('SYNTHETIC_SECRET', str(first()))
            self.assertEqual(len(calls), 1)

    def test_exact_five_commands_reject_extra_foreign_or_unready_targets(self):
        base = ['/fixed/pnpm', 'exec', 'supabase']; project = Path('/fixed/project')
        tails = [('SUPABASE_VERSION', ['--version']), ('SUPABASE_START', ['start', '--workdir', str(project), '--exclude', 'FIXED']), ('SUPABASE_DB_RESET', ['db', 'reset', '--local', '--workdir', str(project)]), ('SUPABASE_STATUS', ['status', '--workdir', str(project), '-o', 'json']), ('SUPABASE_STOP', ['stop', '--workdir', str(project)])]
        for operation, tail in tails:
            self.assertEqual(D.fixed_pnpm_operation(base + tail, base[0], project, 'FIXED'), operation)
            for args in (base + tail + ['--debug'], ['/foreign/pnpm', *base[1:], *tail]):
                self.assertEqual(D.fixed_pnpm_operation(args, base[0], project, 'FIXED'), 'UNKNOWN')
        self.assertEqual(D.fixed_pnpm_operation(base + tails[1][1], base[0], None, 'FIXED'), 'UNKNOWN')

    def test_success_keeps_original_bounds_and_never_saves_status_raw(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            private = Path(folder);run, first, calls, io = self.boundary(private, (0, b'SYNTHETIC_SECRET_STATUS', b''))
            env = {'PATH': '/fixed:/usr/bin:/bin'}
            self.assertEqual(run(['/fixed/pnpm', 'exec', 'supabase', '--version'], timeout=60, maximum=4 * D.LIMIT, env=env), b'SYNTHETIC_SECRET_STATUS')
            self.assertIsNone(first());self.assertIsNone(io.command_diagnostic)
            self.assertEqual(list(private.iterdir()), [])
            self.assertEqual(calls[0][1], {'timeout': 60, 'maximum': 4 * D.LIMIT, 'env': env, 'checked': False, 'capture_stderr': True})

    def test_first_error_stays_latched_and_raw_is_private_no_overwrite(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            private = Path(folder);run, first, calls, io = self.boundary(private, (1, b'SYNTHETIC_SECRET', b'ERR_PNPM_UNEXPECTED_STORE'))
            args = ['/fixed/pnpm', 'exec', 'supabase', '--version']
            with self.assertRaises(ValueError):run(args)
            original = dict(first());run.__globals__['cleaning'] = True
            with self.assertRaises(ValueError):run(args)
            self.assertEqual(first(), original);self.assertEqual(len(calls), 2)
            for name, raw in [('stdout', b'SYNTHETIC_SECRET'), ('stderr', b'ERR_PNPM_UNEXPECTED_STORE')]:
                target = private / ('first-command-' + name + '-private.bin')
                self.assertEqual(target.read_bytes(), raw);self.assertEqual(target.stat().st_mode & 0o777, 0o600)
                with self.assertRaises(FileExistsError):D.private_write(target, b'NEW')
            self.assertNotIn('SYNTHETIC_SECRET', str(first()));self.assertEqual(first()['classification'], 'STORE')

    def test_control_exception_keeps_identity_and_unknown_stream_completeness(self):
        import tempfile
        for reason in ('BOOTSTRAP_COMMAND_TIMEOUT', 'BOOTSTRAP_OUTPUT_LIMIT'):
            with tempfile.TemporaryDirectory() as folder:
                error = ValueError(reason);run, first, calls, io = self.boundary(Path(folder), error)
                with self.assertRaises(ValueError) as seen:run(['/fixed/pnpm', 'exec', 'supabase', '--version'])
                self.assertIs(seen.exception, error)
                for key in ('exitCode', 'stdoutBytes', 'stdoutSha256', 'stderrBytes', 'stderrSha256'):self.assertIsNone(first()[key])
                self.assertEqual(first()['classification'], 'UNKNOWN');self.assertEqual(first()['operation'], 'SUPABASE_VERSION')
                self.assertEqual(list(Path(folder).iterdir()), [])

    def test_both_stream_classification_is_closed_and_unknown_codes_stay_unknown(self):
        markers = [('ERR_PNPM_UNEXPECTED_STORE', 'STORE'), ('ERR_PNPM_OUTDATED_LOCKFILE', 'DEP_VERSION'), ('ERR_PNPM_UNSUPPORTED_ENGINE', 'RUNTIME_VERSION'), ('$HOME is not defined', 'HOME'), ('ERR_PNPM_EXEC_COMMAND_NOT_FOUND', 'BINARY'), ('permission denied', 'PERMISSION'), ('ERR_PNPM_SECRET_TOKEN', 'UNKNOWN')]
        for marker, expected in markers:
            for stdout, stderr in ((marker.encode(), b''), (b'', marker.encode())):
                value = D.safe_control_failure('PREFLIGHT', D.command_stream_diagnostic('SUPABASE_VERSION', 1, stdout, stderr), False)
                self.assertEqual(value['classification'], expected)
                self.assertNotIn('SECRET_TOKEN', str(value))
        value = D.safe_control_failure('PREFLIGHT', {'operation': 'SECRET', 'errorCode': 'SECRET', 'stdoutBytes': float('nan'), 'stdoutSha256': 'SECRET'}, False)
        self.assertEqual(value['errorCode'], 'UNKNOWN');self.assertIsNone(value['stdoutBytes']);self.assertIsNone(value['stdoutSha256'])

    def test_only_five_full_fixed_argv_match_and_run(self):
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            private = Path(folder);run, first, calls, io = self.boundary(private, (0, b'ok', b''))
            run.__globals__['project'] = private
            excluded = run.__globals__['B'].EXCLUDED
            cases = [('SUPABASE_VERSION', ['--version']), ('SUPABASE_START', ['start', '--workdir', str(private), '--exclude', excluded]), ('SUPABASE_DB_RESET', ['db', 'reset', '--local', '--workdir', str(private)]), ('SUPABASE_STATUS', ['status', '--workdir', str(private), '-o', 'json']), ('SUPABASE_STOP', ['stop', '--workdir', str(private)])]
            for operation, tail in cases:
                args = ['/fixed/pnpm', 'exec', 'supabase', *tail]
                self.assertEqual(D.fixed_pnpm_operation(args, '/fixed/pnpm', private, excluded), operation)
                self.assertEqual(run(args), b'ok')
            self.assertEqual(len(calls), 5)
            for args in (['/other/pnpm', 'exec', 'supabase', '--version'], ['/fixed/pnpm', 'exec', 'supabase', '--version', '--debug'], ['/fixed/pnpm', 'exec', 'supabase', 'stop', '--workdir', '/foreign']):
                self.assertEqual(D.fixed_pnpm_operation(args, '/fixed/pnpm', private, excluded), 'UNKNOWN')


if __name__ == '__main__':
    unittest.main()
