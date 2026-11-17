"""Synthetic imports/FS only; never invokes a native sampler or /proc provider."""
import ast
import contextlib
import errno
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
DIRECTORY = ROOT / 'scripts/concurrency/linux-operator'


def environment(kind):
    trace = []
    ctx = {'backendCgroupRelativePath': '/synthetic-backend'}
    host = {'clockTicksPerSecond': 100, 'cgroupIdentitySha256': 'b' * 64, 'limitChainSha256': 'c' * 64}
    identity = {'ownerUid': 1001, 'instanceSha256': 'd' * 64, 'jobSha256': 'e' * 64}
    profile = {'host': host, 'identity': identity}
    def observed(name, value):
        def call(*_args, **_kwargs):
            trace.append(name)
            return value
        return call
    def require(value, code='LINUX_RUNTIME_INVALID'):
        if not value:
            raise ValueError(code)
    common = types.ModuleType('linux_runtime_common')
    common.RUNTIME = Path('/synthetic/runtime')
    common.CGROOT = Path('/synthetic/cgroup')
    common.require = require
    common.context = observed('context', ctx)
    common.private_json = observed('private_json', (profile, 'a' * 64))
    common.host_observation = observed('host_observation', (host, 'boot'))
    common.instance_facts = observed('instance_facts', identity)
    common.verify_executables = observed('verify_executables', None)
    common.inspect_backend = observed('inspect_backend', {'services': 8})
    proc = types.ModuleType('linux_proc')
    proc.parse_stat = observed('parse_stat', {})
    proc.parse_smaps_rollup = observed('parse_smaps_rollup', {'rssBytes': 100, 'pssBytes': 50})
    proc.parse_meminfo = observed('parse_meminfo', {'totalBytes': 1000, 'swapTotalBytes': 0, 'swapFreeBytes': 0})
    proc.parse_psi = observed('parse_psi', {'some': {'avg10': 0}, 'full': {'avg10': 0}})
    cgroup = types.ModuleType('linux_cgroup')
    def read_text(path, *_args):
        # This function is the entire fake provider; it never opens the path.
        trace.append('read:' + Path(path).name)
        return '100 0' if str(path) == '/proc/uptime' else 'synthetic'
    cgroup.read_text = read_text
    cgroup.read_pid_members = observed('read_pid_members', [])
    cgroup.read_counter_map = observed('read_counter_map', {'oom_kill': 0})
    cgroup.read_backend_values = observed('read_backend_values', {'cpuUsageUsec': 0})
    return trace, common, {'linux_runtime_common': common, 'linux_proc': proc, 'linux_cgroup': cgroup}


def load(kind, source):
    trace, common, modules = environment(kind)
    namespace = {'__name__': 'SYNTHETIC_ONLY'}
    with patch.dict(sys.modules, modules):
        exec(compile(source, '<synthetic-pinned-source>', 'exec'), namespace)
    namespace['os'] = types.SimpleNamespace(getppid=lambda: 123)
    namespace['time'] = types.SimpleNamespace(monotonic_ns=lambda: 1000000, monotonic=lambda: 0)
    rows = {
        123: {'startTicks': '1', 'userTicks': 1, 'systemTicks': 1, 'identity': {'pid': 123}},
        234: {'startTicks': '2', 'userTicks': 1, 'systemTicks': 1, 'identity': {'pid': 234}},
    }
    def stable(*_args, **_kwargs):
        trace.append('stable_memory_sample')
        return rows, {234: rows[234]}, {123: {'rssBytes': 100, 'pssBytes': 50}, 234: {'rssBytes': 200, 'pssBytes': 100}}
    namespace['stable_memory_sample'] = stable
    return namespace, trace, common


def main_failure(kind, error):
    _trace, common, modules = environment(kind)
    def denied():
        raise error
    common.context = denied
    captured = io.StringIO()
    with patch.dict(sys.modules, modules), patch.object(sys, 'argv', ['synthetic']), patch.object(sys, 'stdin', io.StringIO('{}' if kind == 'host' else 'null')), contextlib.redirect_stdout(captured):
        try:
            exec(compile(source(kind), '<synthetic-pinned-main>', 'exec'), {'__name__': '__main__'})
        except SystemExit as stopped:
            if stopped.code != 1:
                raise AssertionError('EXPECTED_ORIGINAL_EXIT_ONE') from None
        else:
            raise AssertionError('EXPECTED_ORIGINAL_FAILURE')
    return json.loads(captured.getvalue())


def filename(kind):
    return 'linux-host-sample.py' if kind == 'host' else 'backend-cgroup-sample.py'


def source(kind):
    return (DIRECTORY / filename(kind)).read_text()


class SyntheticSamplerFailure(unittest.TestCase):
    def test_actual_main_errno_known_guard_and_unknown_secret(self):
        for kind in ['host', 'backend']:
            cases = [
                (ValueError('PROCESS_TREE_INCOMPLETE'), 'PROCESS_TREE_INCOMPLETE', None),
                (ValueError('PRIVATE_UPPERCASE_SECRET'), 'UNKNOWN', None),
                (PermissionError(errno.EACCES, 'PRIVATE_MESSAGE', '/PRIVATE_PATH'), 'UNKNOWN', 'EACCES'),
                (OSError(errno.EIO, 'PRIVATE_MESSAGE'), 'UNKNOWN', 'EIO'),
                (OSError(9999, 'PRIVATE_MESSAGE'), 'UNKNOWN', 'UNKNOWN'),
            ]
            for error, code, number in cases:
                with self.subTest(kind=kind, code=code, errno=number):
                    value = main_failure(kind, error)
                    if kind == 'host':
                        timing = value.pop('samplerTiming')
                        self.assertIn(timing['collection'], {'OBSERVED', 'UNAVAILABLE'})
                        self.assertEqual(timing['scope'], 'PYTHON_REQUEST_TO_RETURN_ONLY')
                        if timing['collection'] == 'OBSERVED':
                            self.assertTrue(0 <= timing['wallMs'] <= 30000)
                            self.assertTrue(0 <= timing['ownCpuMs'] <= 30000)
                            self.assertTrue(1 <= len(timing['stages']) <= 24)
                            for row in timing['stages']:
                                self.assertTrue(1 <= row['visits'] <= 65536)
                                self.assertTrue(0 <= row['wallMs'] <= 30000)
                                self.assertTrue(0 <= row['ownCpuMs'] <= 30000)
                    self.assertEqual(value, {'result': 'HOST_SAMPLE_UNAVAILABLE' if kind == 'host' else 'BACKEND_SAMPLE_UNAVAILABLE', 'code': code, 'stage': 'CONTEXT', 'errno': number, 'rawProviderOutput': False})
                    self.assertNotIn('PRIVATE', json.dumps(value))

    def test_positive_sample_and_provider_order_equal_exact_git_base(self):
        for kind in ['host', 'backend']:
            old = subprocess.check_output(['git', 'show', 'HEAD:scripts/concurrency/linux-operator/' + filename(kind)], cwd=ROOT, env={**os.environ, 'DEVELOPER_DIR': '/Library/Developer/CommandLineTools'}, timeout=5).decode()
            values, traces = [], []
            for text in [old, source(kind)]:
                namespace, trace, _ = load(kind, text)
                value = namespace['sample']({'mode': 'NATIVE_BROWSER', 'nodePid': 123, 'browserPid': 234}) if kind == 'host' else namespace['sample']()
                values.append(value)
                traces.append(trace)
                self.assertNotIn('stage', value)
                self.assertNotIn('errno', value)
            self.assertEqual(values[0], values[1])
            self.assertEqual(traces[0], traces[1])
            old_sample = next(node for node in ast.parse(old).body if isinstance(node, ast.FunctionDef) and node.name == 'sample')
            new_sample = next(node for node in ast.parse(source(kind)).body if isinstance(node, ast.FunctionDef) and node.name == 'sample')
            self.assertEqual([ast.dump(n) for n in ast.walk(old_sample) if isinstance(n, ast.Return)], [ast.dump(n) for n in ast.walk(new_sample) if isinstance(n, ast.Return)])

    def test_stable_scan_smaps_error_stage_without_real_proc(self):
        namespace, _trace, _ = load('host', source('host'))
        namespace['metadata'] = lambda *_args: {123: {'identity': {}, 'exe': 'node', 'device': 1, 'inode': 2}}
        namespace['same_binary'] = lambda *_args: True
        namespace['chrome_members'] = lambda *_args: {}
        def denied(*_args):
            raise PermissionError(errno.EPERM, 'PRIVATE', '/PRIVATE')
        namespace['read_text'] = denied
        # Recover the exact function replaced by the positive fake provider.
        functions = {n.name:n for n in ast.parse(source('host')).body if isinstance(n, ast.FunctionDef)}
        exec(compile(ast.Module(body=[functions['complete_pss'], functions['stable_memory_sample']], type_ignores=[]), '<synthetic-stable-scan>', 'exec'), namespace)
        with self.assertRaises(PermissionError) as caught:
            namespace['stable_memory_sample']({'generatorCgroupRelativePath': '/synthetic', 'binaries': {'node': {}}}, {'identity': {'ownerUid': 1001}}, 123, None, True, 'boot')
        self.assertEqual(namespace['failure'](caught.exception)['stage'], 'SMAPS')
        self.assertEqual(namespace['failure'](caught.exception)['errno'], 'EPERM')

    def test_node_cpu_failure_after_profile_recheck_reports_cpu(self):
        namespace, _, _ = load('host', source('host'))
        original = namespace['stable_memory_sample']
        def negative_node(*args, **kwargs):
            rows, browser, memory = original(*args, **kwargs)
            rows[123]['userTicks'] = -10
            return rows, browser, memory
        namespace['stable_memory_sample'] = negative_node
        with self.assertRaisesRegex(ValueError, 'PROCESS_CPU_CLOCK_INVALID') as caught:
            namespace['sample']({'mode': 'NATIVE_BROWSER', 'nodePid': 123, 'browserPid': 234})
        value = namespace['failure'](caught.exception)
        self.assertEqual(value['code'], 'PROCESS_CPU_CLOCK_INVALID')
        self.assertEqual(value['stage'], 'CPU')
        self.assertEqual(value['result'], 'HOST_SAMPLE_UNAVAILABLE')
        self.assertFalse(value['rawProviderOutput'])

    def test_guard_allowlist_matches_explicit_source_literals(self):
        allowed = set()
        for name in ['linux-host-sample.py', 'backend-cgroup-sample.py', 'linux_runtime_common.py', 'linux_proc.py', 'linux_cgroup.py']:
            for node in ast.walk(ast.parse((DIRECTORY / name).read_text())):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    at = 1 if node.func.id == 'require' else 0 if node.func.id == 'ValueError' else -1
                    if at >= 0 and len(node.args) > at and isinstance(node.args[at], ast.Constant) and isinstance(node.args[at].value, str):
                        allowed.add(node.args[at].value)
        allowed.add('LINUX_RUNTIME_INVALID')
        for kind in ['host', 'backend']:
            namespace, _, _ = load(kind, source(kind))
            self.assertEqual(namespace['CODES'], allowed)


if __name__ == '__main__':
    unittest.main()
