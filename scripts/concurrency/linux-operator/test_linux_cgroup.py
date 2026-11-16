import tempfile
import unittest
from pathlib import Path
from linux_cgroup import read_counter_map, read_backend_values, cgroup_identity, read_pid_members, effective_cpu_quota, cgroup_limit_chain

class LinuxCgroupTests(unittest.TestCase):
    def test_counter_keys_are_not_positional_and_duplicates_are_refused(self):
        self.assertEqual(read_counter_map("system_usec 7\nusage_usec 19\nuser_usec 12\n"),{"system_usec":7,"usage_usec":19,"user_usec":12})
        with self.assertRaises(ValueError):read_counter_map("usage_usec 1\nusage_usec 2\n")
    def test_kernel_counter_names_may_contain_digits(self):
        self.assertEqual(read_counter_map("pgalloc_dma32 9\n"),{"pgalloc_dma32":9})
    def test_backend_uses_one_parent_aggregate_and_keeps_oom_counters(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();group=root/"backend";group.mkdir()
            content={"cpu.max":"400000 100000\n","memory.max":"6442450944\n","memory.current":"1073741824\n","memory.swap.current":"0\n","cpu.stat":"usage_usec 2000000\nthrottled_usec 3000\nnr_periods 20\n","memory.events":"low 0\nhigh 0\nmax 1\noom 2\noom_kill 1\n"}
            for name,text in content.items():(group/name).write_text(text)
            self.assertEqual(read_backend_values(group),{"cpuQuotaUs":400000,"cpuPeriodUs":100000,"memoryMaxBytes":6442450944,"memoryCurrentBytes":1073741824,"swapCurrentBytes":0,"cpuUsageUsec":2000000,"throttledUsec":3000,"oom":2,"oomKill":1})
    def test_missing_nonroot_counter_does_not_become_zero(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises((ValueError,FileNotFoundError)):read_backend_values(Path(temp).resolve())
    def test_effective_limit_uses_tightest_ancestor(self):
        self.assertEqual(effective_cpu_quota([{"cpuMax":{"quotaUs":400000,"periodUs":100000}},{"cpuMax":{"quotaUs":200000,"periodUs":100000}},{"cpuMax":"NOT_APPLICABLE_AT_HIERARCHY_ROOT"}]),{"quotaUs":200000,"periodUs":100000})
        self.assertEqual(effective_cpu_quota([{"cpuMax":{"quotaUs":None,"periodUs":100000}},{"cpuMax":"NOT_APPLICABLE_AT_HIERARCHY_ROOT"}]),{"quotaUs":None,"periodUs":None})
    def test_group_identity_changes_with_boot_or_container_binding(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();group=root/"backend";group.mkdir()
            first=cgroup_identity(group,root,"a"*64,["one"])
            self.assertEqual(first,cgroup_identity(group,root,"a"*64,["one"]))
            self.assertNotEqual(first,cgroup_identity(group,root,"b"*64,["one"]))
            self.assertNotEqual(first,cgroup_identity(group,root,"a"*64,["two"]))
    def test_recursive_members_include_orphans_in_child_groups(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();child=root/"child";child.mkdir()
            (root/"cgroup.procs").write_text("31\n")
            (child/"cgroup.procs").write_text("32\n33\n")
            self.assertEqual(read_pid_members(root),[31,32,33])
    def test_member_symlink_cannot_escape_group(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();(root/"cgroup.procs").write_text("")
            (root/"escape").symlink_to(root,target_is_directory=True)
            with self.assertRaises(ValueError):read_pid_members(root)

if __name__=="__main__":unittest.main()
