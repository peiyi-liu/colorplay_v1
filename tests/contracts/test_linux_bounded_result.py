"""Real subprocess output from failed stages must survive for diagnosis."""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/concurrency'))
spec = importlib.util.spec_from_file_location('bounded_stage', ROOT / 'scripts/concurrency/linux-local-bootstrap.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class BoundedResultTests(unittest.TestCase):
    def test_nonzero_output_is_captured_only_with_explicit_unchecked_request(self):
        argv = [sys.executable, '-I', '-B', '-c', 'import sys;print("stage diagnostic");sys.exit(7)']
        code, raw = module.bounded(argv, ROOT, checked=False)
        self.assertEqual((code, raw), (7, b'stage diagnostic\n'))
        with self.assertRaises(module.C.BootstrapError):
            module.bounded(argv, ROOT)
