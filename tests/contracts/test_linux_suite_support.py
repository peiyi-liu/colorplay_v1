"""Real filesystem census admission, without starting the Local suite."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('suite_support', Path(__file__).resolve().parents[2] / 'scripts/concurrency/linux_suite_support.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SuiteCensusTests(unittest.TestCase):
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
