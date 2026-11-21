import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('root_profile_pin',Path(__file__).with_name('pin-execution-profile.py'))
PIN=importlib.util.module_from_spec(spec);spec.loader.exec_module(PIN)

class ProfilePinFsTests(unittest.TestCase):
    def test_binary_pin_is_the_actual_regular_file_not_a_declared_hash(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary).resolve()/'node';path.write_bytes(b'actual fixture binary');path.chmod(0o700)
            expected=hashlib.sha256(b'actual fixture binary').hexdigest()
            value=PIN.fingerprint_binary(path,expected)
            self.assertEqual(value,{'path':str(path),'sha256':expected,'device':path.stat().st_dev,'inode':path.stat().st_ino})
            with self.assertRaises(ValueError):PIN.fingerprint_binary(path,'0'*64)
            linked=path.with_name('alias');linked.symlink_to(path)
            with self.assertRaises(ValueError):PIN.fingerprint_binary(linked,expected)
            linked.unlink();os.link(path,linked)
            with self.assertRaises(ValueError):PIN.fingerprint_binary(path,expected)

if __name__=='__main__':unittest.main()
