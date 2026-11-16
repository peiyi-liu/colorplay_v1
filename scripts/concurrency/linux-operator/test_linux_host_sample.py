import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location("root_host_sampler",Path(__file__).with_name("linux-host-sample.py"))
HOST=importlib.util.module_from_spec(spec);spec.loader.exec_module(HOST)

def stat_line(pid,parent,start):
    fields=["0"]*19;fields[0]=str(parent);fields[10]="25";fields[11]="5";fields[18]=str(start)
    return str(pid)+" (fixture process) S "+" ".join(fields)+"\n"

class HostSampleFsTests(unittest.TestCase):
    def test_whole_owned_cgroup_includes_orphan_chrome_pss_without_double_count(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve();proc=root/"proc";proc.mkdir();groups=root/"cgroup";groups.mkdir();group=groups/"owned";group.mkdir()
            cache=root/"browser-cache";cache.mkdir();node=root/"node";node.write_bytes(b"fixture node");chrome=cache/"chrome";chrome.write_bytes(b"fixture chrome")
            def pin(path):
                info=path.stat();return {"path":str(path),"sha256":"a"*64,"device":info.st_dev,"inode":info.st_ino}
            ctx={"generatorCgroupRelativePath":"/owned","binaries":{"node":pin(node),"browser":[pin(chrome)]}}
            owner=os.getuid();profile={"identity":{"ownerUid":owner}}
            for pid,parent,start,exe,rss,pss in [(201,1,100,node,80,60),(202,201,110,chrome,800,200),(203,1,120,chrome,900,300)]:
                directory=proc/str(pid);directory.mkdir();(directory/"stat").write_text(stat_line(pid,parent,start));(directory/"status").write_text("Uid:\t"+"\t".join([str(owner)]*4)+"\n");(directory/"exe").symlink_to(exe);(directory/"smaps_rollup").write_text(f"Rss: {rss} kB\nPss: {pss} kB\n")
            (group/"cgroup.procs").write_text("201\n202\n203\n203\n")
            rows,browsers,memory=HOST.stable_memory_sample(ctx,profile,201,202,False,"b"*64,proc_root=proc,cgroup_root=groups,browser_cache=cache)
            self.assertEqual(set(rows),{201,202,203});self.assertEqual(set(browsers),{202,203})
            self.assertEqual(sum(memory[pid]["pssBytes"] for pid in browsers),500*1024)
            self.assertEqual(sum(memory[pid]["rssBytes"] for pid in browsers),1700*1024)
            with self.assertRaisesRegex(ValueError,"UNDECLARED_BROWSER_PRESENT"):
                HOST.stable_memory_sample(ctx,profile,201,None,True,"b"*64,proc_root=proc,cgroup_root=groups,browser_cache=cache)
            unknown=cache/"headless_shell";unknown.write_bytes(b"unapproved browser");(proc/"203/exe").unlink();(proc/"203/exe").symlink_to(unknown)
            with self.assertRaisesRegex(ValueError,"UNAPPROVED_BROWSER_BINARY"):
                HOST.stable_memory_sample(ctx,profile,201,202,False,"b"*64,proc_root=proc,cgroup_root=groups,browser_cache=cache)

if __name__=="__main__":unittest.main()
