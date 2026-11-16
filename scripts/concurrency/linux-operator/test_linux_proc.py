import unittest
from linux_proc import parse_meminfo, parse_stat, parse_psi, parse_smaps_rollup, process_identity

class LinuxProcTests(unittest.TestCase):
    def test_meminfo_uses_kernel_usable_total_in_bytes(self):
        self.assertEqual(parse_meminfo("MemTotal: 16383084 kB\nMemAvailable: 10000000 kB\nSwapTotal: 2048 kB\nSwapFree: 1024 kB\n"), {"totalBytes":16776278016,"availableBytes":10240000000,"swapTotalBytes":2097152,"swapFreeBytes":1048576})
    def test_meminfo_rejects_missing_duplicate_units_and_negative(self):
        for value in ("MemTotal: 1 kB\n", "MemTotal: -1 kB\n", "MemTotal: 1 MB\n", "MemTotal: 1 kB\nMemTotal: 2 kB\n"):
            with self.subTest(value=value), self.assertRaises(ValueError): parse_meminfo(value)
    def test_stat_handles_parentheses_spaces_and_last_closing_paren(self):
        # State is field 3, ppid 4, utime 14, stime 15 and starttime 22.
        value="42 (chrome (renderer) worker) S 7 0 0 0 0 0 0 0 0 0 11 13 0 0 0 0 0 0 98765 0 0"
        self.assertEqual(parse_stat(value), {"pid":42,"ppid":7,"state":"S","userTicks":11,"systemTicks":13,"startTicks":"98765"})
    def test_stat_supports_kernel_tracing_stop_state(self):
        value="42 (chrome) t 7 0 0 0 0 0 0 0 0 0 11 13 0 0 0 0 0 0 98765 0 0"
        self.assertEqual(parse_stat(value)["state"], "t")
    def test_stat_rejects_wrong_pid_and_short_or_negative_start(self):
        for value in ("1 (x) S 0", "oops", "0 (x) S 0"):
            with self.subTest(value=value), self.assertRaises(ValueError): parse_stat(value)
    def test_psi_requires_some_and_full_with_complete_averages(self):
        value="some avg10=10.00 avg60=2.00 avg300=0.30 total=1000\nfull avg10=1.00 avg60=0.10 avg300=0.01 total=20\n"
        self.assertEqual(parse_psi(value), {"some":{"avg10":10.0,"avg60":2.0,"avg300":0.3,"totalUs":1000},"full":{"avg10":1.0,"avg60":0.1,"avg300":0.01,"totalUs":20}})
    def test_psi_rejects_nan_range_duplicates_and_missing(self):
        for value in ("some avg10=nan avg60=0 avg300=0 total=0\n", "some avg10=101 avg60=0 avg300=0 total=0\n", "some avg10=0 avg60=0 avg300=0 total=0\n", "some avg10=0 avg10=0 avg60=0 avg300=0 total=0\nfull avg10=0 avg60=0 avg300=0 total=0\n"):
            with self.subTest(value=value), self.assertRaises(ValueError): parse_psi(value)
    def test_pss_is_separate_from_rss(self):
        value="00000000-ffffffff ---p 00000000 00:00 0 [rollup]\nRss: 4096 kB\nPss: 2048 kB\nPss_Anon: 100 kB\n"
        self.assertEqual(parse_smaps_rollup(value), {"rssBytes":4194304,"pssBytes":2097152})
    def test_smaps_rejects_missing_inverted_and_duplicate(self):
        for value in ("Rss: 1 kB\n", "Rss: 1 kB\nPss: 2 kB\n", "Rss: 1 kB\nPss: 1 kB\nPss: 1 kB\n"):
            with self.subTest(value=value), self.assertRaises(ValueError): parse_smaps_rollup(value)
    def test_identity_changes_for_pid_reuse_uid_or_boot(self):
        original=process_identity("a"*64,42,"98765",1001)
        self.assertEqual(original, process_identity("a"*64,42,"98765",1001))
        for args in (("b"*64,42,"98765",1001),("a"*64,42,"98766",1001),("a"*64,42,"98765",1002)):
            self.assertNotEqual(original, process_identity(*args))
    def test_identity_rejects_unbounded_or_invalid_inputs(self):
        for args in (("a"*63,42,"98765",1001),("a"*64,0,"98765",1001),("a"*64,42,"-1",1001),("a"*64,42,"98765",-1)):
            with self.subTest(args=args), self.assertRaises(ValueError): process_identity(*args)

if __name__ == "__main__": unittest.main()
