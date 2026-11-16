"""Real filesystem census admission, without starting the Local suite."""
import ast
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import sys
import types
import unittest
from unittest.mock import patch

DIRECTORY = Path(__file__).resolve().parents[2] / 'scripts/concurrency'
sys.path[:0] = [str(DIRECTORY), str(DIRECTORY / 'linux-operator'), str(Path(__file__).parent)]
from test_snapshot_local_evidence import Fixture, C
from linux_proc import parse_stat

spec = importlib.util.spec_from_file_location('suite_support', Path(__file__).resolve().parents[2] / 'scripts/concurrency/linux_suite_support.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SuiteCensusTests(unittest.TestCase):
    @contextlib.contextmanager
    def snapshot_ports(self, fixture, active, stat_text):
        original_read = Path.read_text
        def read(path, *args, **options):
            if str(path) == '/proc/4444/stat':return stat_text
            if str(path) == '/proc/4444/status':return 'Uid:\t' + '\t'.join([str(os.getuid())] * 4)
            return original_read(path, *args, **options)
        def loaded(path):
            return active if path.name == 'active-preview.json' else json.loads(module.private(path))
        def inspected(args, **options):
            return json.dumps([row for row in fixture.backend_rows if row['Id'] == args[-1]]).encode()
        (fixture.parent / 'requests').mkdir(mode=0o700)
        with patch.object(module, 'SOURCE', fixture.source), patch.object(module, 'PARENT', fixture.parent), \
                patch.object(module, 'RUNTIME', fixture.runtime), patch.object(module, 'TOOLS', fixture.parent / 'tools'), \
                patch.object(module, 'load', side_effect=loaded), patch.object(module.os, 'readlink', return_value=fixture.tools['node']['path']), \
                patch.object(Path, 'read_text', autospec=True, side_effect=read), \
                patch.object(module, 'run', side_effect=inspected) as external, \
                patch.object(module, 'module', return_value=types.SimpleNamespace(bounded=lambda *a, **k: b'["_supabase","postgres"]')):
            yield external

    def activation_preview(self):
        # Execute only the producer's actual assignment seam, with synthetic /proc.
        tree = ast.parse((DIRECTORY / 'linux-operator/activate-candidate.py').read_text())
        main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        nodes = [n for n in main.body if isinstance(n, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id in {'process_stat', 'process_start', 'process'} for t in n.targets)]
        self.assertEqual(len(nodes), 3)
        fields = ['0'] * 20;fields[0] = '1';fields[18] = '12345'
        text = '4444 (node) S ' + ' '.join(fields)
        values = {'parse_stat': parse_stat, 'read_text': lambda path: text, 'child': types.SimpleNamespace(pid=4444),
            'sha': 'a' * 40, 'args': ['synthetic-node'], 'attempt': Path('/synthetic'),
            'owner': {'appUrl': 'http://127.0.0.1:58373'}}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), '<activation-preview-seam>', 'exec'), values)
        return values['process'], text

    def test_actual_activation_string_becomes_integer_consumed_by_actual_m5(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Fixture(Path(directory).resolve());active, text = self.activation_preview()
            self.assertIs(type(active['processStart']), str)
            with self.snapshot_ports(f, active, text):
                path, approved = module.create_snapshot_plan('a' * 40, 'b' * 64)
            plan = C.parse_plan(path.read_bytes(), approved)
            self.assertIs(type(plan['preview']['startTicks']), int)
            self.assertEqual(plan['preview']['startTicks'], 12345)

    def test_noncanonical_or_stale_preview_ticks_reject_before_external_operations(self):
        for value in [None, True, False, 12345, 12345.0, '', '0', '01', '+1', '-1', '1.0',
                      '1e3', ' 12345', '12345\n', '9223372036854775808', '9' * 100, '12346']:
            with self.subTest(value=value), tempfile.TemporaryDirectory() as directory:
                f = Fixture(Path(directory).resolve());active, text = self.activation_preview()
                active['processStart'] = value
                with self.snapshot_ports(f, active, text) as external, self.assertRaises(ValueError):
                    module.create_snapshot_plan('a' * 40, 'b' * 64)
                external.assert_not_called()
                self.assertFalse((f.parent / 'requests/snapshot-plan.json').exists())

    def test_maximum_canonical_ticks_and_original_source_identity_guard(self):
        with tempfile.TemporaryDirectory() as directory:
            f = Fixture(Path(directory).resolve());active, text = self.activation_preview()
            active['processStart'] = '9223372036854775807'
            with self.snapshot_ports(f, active, text.replace('12345', active['processStart'])):
                path, approved = module.create_snapshot_plan('a' * 40, 'b' * 64)
            self.assertEqual(C.parse_plan(path.read_bytes(), approved)['preview']['startTicks'], 9223372036854775807)
        with tempfile.TemporaryDirectory() as directory:
            f = Fixture(Path(directory).resolve());active, text = self.activation_preview()
            active['sourceRevision'] = 'c' * 40
            with self.snapshot_ports(f, active, text) as external, self.assertRaises(ValueError):
                module.create_snapshot_plan('a' * 40, 'b' * 64)
            external.assert_not_called()

    def test_stage_preserves_strict_actual_last_json_result_and_exit_contract(self):
        for code, raw, expected in [(0,b'{"result":"WRONG"}', 'LOCAL_EDGE_SOURCE_BOUND'),
                (1,b'{"result":"LOCAL_EDGE_SOURCE_BOUND"}', 'LOCAL_EDGE_SOURCE_BOUND'),
                (0,b'[]',None), (0,b'',None)]:
            with self.subTest(code=code, raw=raw), tempfile.TemporaryDirectory() as directory:
                parent = Path(directory).resolve();(parent / 'requests').mkdir(mode=0o700)
                with patch.object(module, 'PARENT', parent), patch.object(module, 'module',
                        return_value=types.SimpleNamespace(bounded=lambda *a, **k: (code, raw))), \
                        contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
                    module.stage('edge-source-bind', ['synthetic-port'], expected)

    def test_real_private_file_has_exact_independent_hash_and_size(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            target = root / 'mail.eml'
            target.write_bytes(b'abc')
            target.chmod(0o600)
            row = module.file_record(target, root)
            self.assertEqual(row, {'path': 'mail.eml', 'bytes': 3, 'sha256': 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'})

    def test_link_and_nonprivate_file_are_not_archived(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            target = root / 'status.json'
            target.write_bytes(b'{}')
            target.chmod(0o644)
            with self.assertRaises(ValueError):
                module.file_record(target, root)
            target.chmod(0o600)
            os.link(target, root / 'hardlink')
            with self.assertRaises(ValueError):
                module.file_record(target, root)
            (root / 'symlink').symlink_to(target)
            with self.assertRaises(ValueError):
                module.file_record(root / 'symlink', root)

    def test_partial_diagnostic_preserves_keys_and_marks_omissions_without_full_backup_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory).resolve()
            runtime = parent / 'whole-site-261115'
            runtime.mkdir(mode=0o700)
            (parent / 'requests').mkdir(mode=0o700)
            secret = runtime / 'status-secret.json'
            secret.write_bytes(b'local-private-test-value')
            secret.chmod(0o644)
            (runtime / 'link').symlink_to(secret)
            original = (module.PARENT, module.RUNTIME)
            module.PARENT, module.RUNTIME = parent, runtime
            try:
                snapshot = module.capture_partial_diagnostic(parent / 'snapshots' / ('a' * 32), {'capacityVerdict': 'NOT_VERIFIED'})
                copy = snapshot / 'root-partial-diagnostic/runtime/status-secret.json'
                self.assertEqual(copy.read_bytes(), secret.read_bytes())
                self.assertEqual(copy.stat().st_mode & 0o777, 0o600)
                self.assertEqual(secret.stat().st_mode & 0o777, 0o644)
                scope = json.loads((snapshot / 'root-partial-diagnostic/diagnostic-scope.json').read_bytes())
                self.assertEqual(scope['captureCompleteness'], 'PARTIAL')
                self.assertEqual(scope['retention'], 'UNVERIFIED')
                self.assertEqual(scope['omissions'], [{'path': 'link', 'reason': 'FILE_NOT_ATTESTED'}])
            finally:
                module.PARENT, module.RUNTIME = original
