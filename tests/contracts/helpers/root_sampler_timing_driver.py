"""Actual sampler/main with pure synthetic providers and own clocks, no proc IO."""
import ast
import contextlib
import io
import json
import types
import unittest
from unittest.mock import patch
import root_sampler_failure_driver as F


def loaded(clock=None):
    ns, trace, common = F.load('host', F.source('host'))
    values = {'wall': 1000000, 'cpu': 100000}
    def wall():
        values['wall'] += 1000000
        return values['wall']
    def cpu():
        values['cpu'] += 100000
        return values['cpu']
    ns['time'] = types.SimpleNamespace(monotonic_ns=clock or wall, process_time_ns=cpu, monotonic=lambda: 0)
    return ns, trace, common


def actual_main(ns):
    tree = next(n for n in ast.parse(F.source('host')).body if isinstance(n, ast.If))
    output = io.StringIO()
    ns['__name__'] = '__main__'
    with patch.object(F.sys, 'argv', ['synthetic']), patch.object(F.sys, 'stdin', io.StringIO('{"mode":"NATIVE_BROWSER","nodePid":123,"browserPid":234}')), contextlib.redirect_stdout(output):
        try:
            exec(compile(ast.Module(body=[tree], type_ignores=[]), '<actual-main-fake-providers>', 'exec'), ns)
        except SystemExit as stopped:
            return stopped.code, json.loads(output.getvalue())
    return 0, json.loads(output.getvalue())


class Timing(unittest.TestCase):
    def test_actual_main_failure_observes_timing_without_raw_error(self):
        value = F.main_failure('host', ValueError('PRIVATE_UNKNOWN'))
        self.assertEqual(value['code'], 'UNKNOWN')
        self.assertEqual(value.get('samplerTiming', {}).get('collection'), 'OBSERVED')
        self.assertNotIn('PRIVATE', json.dumps(value))

    def test_actual_positive_main_preserves_sample_and_provider_read_order(self):
        ns, trace, _ = loaded()
        direct = ns['sample']({'mode': 'NATIVE_BROWSER', 'nodePid': 123, 'browserPid': 234})
        before = list(trace)
        trace.clear()
        exit_code, body = actual_main(ns)
        timing = body.pop('samplerTiming')
        # The original sampledAt clock advances; no other sample field changes.
        direct.pop('sampledAtMonotonicMs');body.pop('sampledAtMonotonicMs')
        self.assertEqual(direct, body)
        self.assertEqual(trace, before)
        self.assertEqual(exit_code, 0)
        self.assertEqual(timing['collection'], 'OBSERVED')
        self.assertEqual(timing['lastStage'], 'CPU')
        self.assertGreater(timing['wallMs'], timing['ownCpuMs'])
        self.assertEqual(sum(r['wallMs'] for r in timing['stages']), timing['wallMs'])
        cpu = next(r for r in timing['stages'] if r['stage'] == 'CPU')
        self.assertEqual(cpu['visits'], 4)

    def test_import_direct_sample_has_no_extra_timing_clock_calls(self):
        ns, _, _ = loaded()
        count = []
        ns['time'].process_time_ns = lambda: count.append(1)
        self.assertNotIn('samplerTiming', ns['sample']({'mode':'NATIVE_BROWSER','nodePid':123,'browserPid':234}))
        self.assertEqual(count, [])
        self.assertIsNone(ns['TIMING'])

    def test_stage_sets_original_state_before_observer_and_cannot_mask_guard(self):
        ns, _, _ = loaded()
        class Broken:
            bad = None
            def visit(self, _stage):
                self.observed = ns['STATE']['stage']
                raise RuntimeError('PRIVATE')
        ns['TIMING'] = broken = Broken()
        ns['mark']('SMAPS')
        self.assertEqual(broken.observed, 'SMAPS')
        self.assertEqual(broken.bad, 'OBSERVER_ERROR')
        self.assertEqual(ns['failure'](ValueError('PRIVATE'))['code'], 'UNKNOWN')

    def test_invalid_clock_bounds_and_count_are_unavailable_not_clamped(self):
        for kind in ['backwards', 'cpu', 'bounds', 'count', 'stage']:
            with self.subTest(kind=kind):
                ns, _, _ = loaded()
                timer = ns['SamplerTiming']()
                if kind == 'backwards': ns['time'].monotonic_ns = lambda: 0
                if kind == 'cpu': ns['time'].process_time_ns = lambda: -1
                if kind == 'bounds': ns['time'].monotonic_ns = lambda: 40000000000
                if kind == 'count': timer.rows['REQUEST'][0] = 65536;timer.visit('REQUEST')
                if kind == 'stage': timer.visit('PRIVATE')
                body = timer.finish()
                self.assertEqual(body['collection'], 'UNAVAILABLE')
                self.assertNotIn('PRIVATE', json.dumps(body))

    def test_failure_main_keeps_original_exit_guard_and_stage(self):
        ns, _, _ = loaded()
        def denied(): raise PermissionError(13, 'PRIVATE', '/PRIVATE')
        ns['context'] = denied
        exit_code, body = actual_main(ns)
        self.assertEqual(exit_code, 1)
        self.assertEqual(body['stage'], 'CONTEXT')
        self.assertEqual(body['errno'], 'EACCES')
        self.assertEqual(body['samplerTiming']['collection'], 'OBSERVED')
        self.assertNotIn('PRIVATE', json.dumps(body))


if __name__ == '__main__': unittest.main()
