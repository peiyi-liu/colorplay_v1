import os
from pathlib import Path
import tempfile
import unittest
from linux_owned_process import run_child

class OwnedProcessTests(unittest.TestCase):
    def test_darwin_refuses_before_starting_any_child(self):
        if os.uname().sysname!="Darwin":self.skipTest("Darwin negative control only")
        with tempfile.TemporaryDirectory() as value:
            marker=Path(value)/"not-started"
            with self.assertRaisesRegex(ValueError,"LINUX_REQUIRED"):
                run_child(["/bin/sh","-c","touch "+str(marker)])
            self.assertFalse(marker.exists())

if __name__=="__main__":unittest.main()
