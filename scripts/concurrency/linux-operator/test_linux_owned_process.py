"""Actual ordinary gate/Node, synthetic authority/cgroup/pidfd admission ports."""
import ast
import contextlib
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import unittest
from unittest.mock import patch
import linux_owned_process as P


class OwnedProcessTests(unittest.TestCase):
    def test_unknown_capability_close_never_creates_a_gate_child(self):
        class Inventory:
            saw_browser=False
            def __init__(self,ctx):pass
            def acquire(self,*args):raise ValueError('ROOT_HELPER_CLOSE_UNKNOWN')
            def close(self):pass
        ctx={'binaries':{'node':{'path':'/approved/node'}}};spawns=[]
        def spawn(*args,**kwargs):spawns.append(args);raise AssertionError('CHILD_CREATED_BEFORE_CAPABILITY_CLOSED')
        with patch.object(P,'context',return_value=ctx),patch.object(P,'verify_executables'),patch.object(P,'OwnedInventory',Inventory),patch.object(P.subprocess,'Popen',side_effect=spawn):
            with self.assertRaisesRegex(ValueError,'ROOT_HELPER_CLOSE_UNKNOWN'):P.run_child(['/approved/node'])
        self.assertEqual(spawns,[])

    def test_post_ack_attachment_never_writes_a_numeric_pid(self):
        inventory=P.OwnedInventory.__new__(P.OwnedInventory)
        inventory.group=Path('/synthetic-leaf');inventory.ctx={'generatorCgroupRelativePath':'/synthetic-leaf'}
        inventory.unchanged=lambda:None;inventory.seen={(42,7):9};inventory.track=lambda:None
        with patch.object(P,'pid_identity',return_value={'pid':42,'startTicks':7}),patch.object(P.os,'open',side_effect=PermissionError(13,'LCA remains undelegated')),patch.object(P,'proc_cgroup',return_value='/synthetic-leaf'):
            inventory.attach(42)

    def gate_run(self,case='success'):
        node=Path('/Users/guanyucheng/.nvm/versions/node/v24.18.0/bin/node')
        if not node.exists():node=Path(__import__('shutil').which('node') or '/missing-node')
        self.assertTrue(node.is_file(),'existing Node required, no install or shell fallback')
        events=[];test=self;acquired=[];processes=[]
        with tempfile.TemporaryDirectory() as folder:
            cap=Path(folder)/'cap';marker=Path(folder)/'executed'
            ctx={'binaries':{'node':{'path':str(node)}},'generatorCgroupRelativePath':'/synthetic-leaf'}
            class Inventory:
                attach=P.OwnedInventory.attach
                close=P.OwnedInventory.close
                saw_browser=False
                def __init__(self,context):self.ctx=context;self.seen={};self.pid=None;self.group=Path('/synthetic-leaf')
                def unchanged(self):pass
                def acquire(self,deadline,cancelled):
                    test.assertFalse(processes);events.extend(['helper-start','root-physically-closed'])
                    fd=os.open(cap,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);acquired.append(fd);return fd
                def track(self):
                    if self.pid and not self.seen:self.seen[(self.pid,1)]=os.open(os.devnull,os.O_RDONLY)
                def remaining(self):return 0
                def stop(self,process):
                    test.assertIn('root-physically-closed',events);events.append('producer-reap')
                    try:process.kill()
                    except ProcessLookupError:pass
                    process.wait(timeout=2);return 0
            def identity(pid,uid):return {'pid':pid,'startTicks':1}
            def census(pid,pin):
                # Real parent descriptor closure, synthetic child /proc port on Mac.
                if pid==os.getpid():
                    try:
                        observed=os.fstat(acquired[0]);test.assertNotEqual((observed.st_dev,observed.st_ino),pin)
                    except OSError:pass
                if case=='cancel' and pid!=os.getpid():signal.getsignal(signal.SIGTERM)(signal.SIGTERM,None)
                return 1 if case=='fd-remains' and pid!=os.getpid() else 0
            spawn=P.subprocess.Popen
            def external_spawn(args,**options):
                test.assertEqual(len(options['pass_fds']),3);test.assertIn('root-physically-closed',events)
                if case=='popen-error':raise OSError('SYNTHETIC_POPEN_FAILURE')
                # Only Darwin's external process fixture substitutes its installed Python.
                modified=list(args)
                if case=='ack-lost':modified[4]=modified[4].replace("os.write(ready,b'R')","os._exit(2)")
                process=spawn([sys.executable,*modified[1:]],**options);processes.append(process);return process
            def matches(pid,args):
                events.append('gate-ack');return case!='bad-identity'
            payload="const f=require('node:fs');const i=f.statSync("+json.dumps(str(cap))+").ino;for(let n=0;n<256;n++){try{if(f.fstatSync(n).ino===i)throw new Error('CAPABILITY_IN_NODE')}catch(e){if(e.message==='CAPABILITY_IN_NODE')throw e}}f.writeFileSync("+json.dumps(str(marker))+",'executed')"
            selection=patch.object(P.select,'select',return_value=([],[],[])) if case=='ack-timeout' else contextlib.nullcontext()
            with selection,patch.object(P.subprocess,'Popen',side_effect=external_spawn),patch.object(P,'SOURCE',Path(folder)),patch.object(P,'context',return_value=ctx),patch.object(P,'verify_executables'),patch.object(P,'OwnedInventory',Inventory),patch.object(P,'pid_identity',side_effect=identity),patch.object(P,'proc_cgroup',return_value='/synthetic-leaf'),patch.object(P,'capability_census',side_effect=census),patch.object(P,'gate_matches',side_effect=matches),patch.object(P.os,'pidfd_open',side_effect=lambda *_:os.open(os.devnull,os.O_RDONLY),create=True):
                # Track actual PID without reaping/polling the blocked gate.
                original_attach=Inventory.attach
                def attach(self,pid):self.pid=pid;return original_attach(self,pid)
                Inventory.attach=attach
                if case=='success':
                    result=P.run_child([str(node),'-e',payload]);self.assertTrue(result['complete']);self.assertEqual(result['code'],0);self.assertTrue(marker.exists());self.assertEqual(cap.read_bytes(),b'0\n')
                else:
                    with self.assertRaises((ValueError,OSError)):P.run_child([str(node),'-e',payload])
                    self.assertFalse(marker.exists())
                    if processes:self.assertEqual(events[-1],'producer-reap')
            self.assertEqual(events[:2],['helper-start','root-physically-closed'])
            for process in processes:self.assertIsNotNone(process.returncode)
            # The numeric fd may legitimately have been reused by pidfd/stdio;
            # any surviving descriptor must not refer to the capability inode.
            for fd in acquired:
                try:self.assertNotEqual(os.fstat(fd).st_ino,cap.stat().st_ino)
                except OSError:pass

    def test_real_gate_writes_self_zero_closes_fd_and_only_then_executes_node(self):self.gate_run()
    def test_cancel_after_ack_does_not_release_node(self):self.gate_run('cancel')
    def test_ack_lost_cleans_child_without_numeric_late_writer(self):self.gate_run('ack-lost')
    def test_ack_timeout_does_not_accept_late_ack_or_release(self):self.gate_run('ack-timeout')
    def test_popen_failure_closes_controller_capability(self):self.gate_run('popen-error')
    def test_child_fd_census_or_identity_failure_never_releases(self):
        self.gate_run('fd-remains');self.gate_run('bad-identity')

    def test_actual_fd_census_compares_inode_not_reusable_descriptor_number(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);directory=root/str(os.getpid())/'fd';directory.mkdir(parents=True)
            cap=root/'cap';cap.touch();fd=os.open(cap,os.O_WRONLY);info=os.fstat(fd);pin=(info.st_dev,info.st_ino)
            (directory/'7').symlink_to(cap)
            path_type=P.Path
            with patch.object(P,'Path',side_effect=lambda value:root if value=='/proc' else path_type(value)):
                self.assertEqual(P.capability_census(os.getpid(),pin),1)
                (directory/'7').unlink();self.assertEqual(P.capability_census(os.getpid(),pin),0)
            os.close(fd)

    def test_gate_code_has_exactly_one_fixed_self_write_and_closes_before_ack(self):
        tree=ast.parse(P.GATE);calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='write']
        self.assertEqual([ast.literal_eval(c.args[1]) for c in calls],[b'R',b'0\n'])
        self.assertIn('finally: os.close(cap)',P.GATE)
        self.assertLess(P.GATE.index('os.close(cap)'),P.GATE.index("os.write(ready,b'R')"))

    def test_darwin_refuses_before_starting_any_child(self):
        if os.uname().sysname!='Darwin':self.skipTest('Darwin negative control only')
        with tempfile.TemporaryDirectory() as folder:
            marker=Path(folder)/'not-started'
            with self.assertRaisesRegex(ValueError,'LINUX_REQUIRED'):P.run_child(['/bin/sh','-c','touch '+str(marker)])
            self.assertFalse(marker.exists())


class TransitionTrackerOnlyTests(unittest.TestCase):
    def test_seen_gate_key_keeps_original_single_identity_and_new_zero_wait_liveness(self):
        inv=P.OwnedInventory.__new__(P.OwnedInventory);inv.group=Path('/synthetic');inv.ctx={};inv.seen={(42,'12'):7};inv.saw_browser=False
        diagnostic=P.ParentStopDiagnostics();inv.diagnostics=diagnostic
        row={'pid':42,'startTicks':'12','uid':1001,'exe':'/approved/python','device':1,'inode':2}
        with patch.object(inv,'unchanged'),patch.object(P,'read_pid_members',return_value=[42]),patch.object(P,'pid_identity',return_value=row) as identity,patch.object(P.os,'pidfd_open',side_effect=AssertionError('NO_NEW_PIDFD'),create=True),patch.object(P.select,'select',return_value=([],[],[])) as live:
            self.assertEqual(inv.track(),[42])
        self.assertEqual(identity.call_count,1)
        live.assert_called_once_with([7],[],[],0)
        self.assertIsNone(diagnostic.transition_snapshot()['pair'])

if __name__=='__main__':unittest.main()
