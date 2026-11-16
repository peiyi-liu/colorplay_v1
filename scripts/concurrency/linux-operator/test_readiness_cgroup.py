import tempfile
import unittest
from pathlib import Path
from collect_readiness import cgroup_limit_chain, AdmissionError

class CgroupReadinessTests(unittest.TestCase):
    def test_hierarchy_root_is_explicitly_not_a_nonroot_quota(self):
        with tempfile.TemporaryDirectory() as value:
            root=Path(value).resolve();child=root/"runner";child.mkdir()
            (child/"cpu.max").write_text("400000 100000\n")
            (child/"memory.max").write_text("6442450944\n")
            (child/"memory.swap.max").write_text("0\n")
            rows=cgroup_limit_chain(root,"/runner")
            self.assertEqual(len(rows),2)
            self.assertEqual(rows[0]["cpuMax"],{"quotaUs":400000,"periodUs":100000})
            self.assertEqual(rows[0]["memoryMaxBytes"],6442450944)
            self.assertEqual(rows[1]["cpuMax"],"NOT_APPLICABLE_AT_HIERARCHY_ROOT")
            self.assertTrue(rows[1]["hierarchyRoot"])
    def test_nonroot_missing_limit_is_rejected(self):
        with tempfile.TemporaryDirectory() as value:
            root=Path(value).resolve();(root/"runner").mkdir()
            with self.assertRaises((AdmissionError,FileNotFoundError)):cgroup_limit_chain(root,"/runner")
    def test_symlink_cgroup_is_rejected(self):
        with tempfile.TemporaryDirectory() as value:
            root=Path(value).resolve();(root/"real").mkdir();(root/"runner").symlink_to(root/"real",target_is_directory=True)
            with self.assertRaises(AdmissionError):cgroup_limit_chain(root,"/runner")

if __name__=="__main__":unittest.main()
