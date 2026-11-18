"""Actual exported observer, synthetic process/OS ports only; no native child."""
import ast
import contextlib
import inspect
import io
import json
from pathlib import Path
import signal
import subprocess
import os
import tempfile
import types
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

OPERATOR=Path(__file__).resolve().parents[2]/'scripts/concurrency/linux-operator'
sys.path.insert(0,str(OPERATOR))
import linux_owned_process as P

class MissingDiagnostics:
    def snapshot(self):return {'firstCause':None}

class Harness:
    def __init__(self,case='normal'):
        self.case=case;self.trace=[];self.handlers={};self.clock=1000.;self.reads=0
        self.released=False;self.error=PermissionError(13,'SYNTHETIC_PRIVATE');self.tracks=0
        self.process=SimpleNamespace(pid=42,returncode=None)
        self.process.stdout=self.pipe(51);self.process.stderr=self.pipe(52)
        self.process.poll=lambda:self.process.returncode
        def wait(timeout):self.trace.append(('wait',timeout));return self.process.returncode
        self.process.wait=wait
        self.stdout=[b'x'*40000,b'y'*30000,b''] if case=='stdout' else [b'']
        self.stderr=[b'x'*8193,b''] if case=='stderr' else [b'']
        self.ends=set();self.selections={}
        self.ctx={'sourceRevision':'a'*40,'job':{'repository':'peiyi-liu/colorplay_v1','runId':'123','runAttempt':1,'jobName':'capacity-linux'},'binaries':{'node':{'path':'/approved/node','device':1,'inode':1},'browser':[]},'generatorCgroupRelativePath':'/synthetic-leaf'}
    def pipe(self,fd):return SimpleNamespace(fileno=lambda:fd,close=lambda:self.trace.append(('pipe-close',fd)))
    def monotonic(self):
        self.clock+=.25
        if self.case=='deadline' and self.released:self.clock=2600
        self.trace.append(('clock',self.clock));return self.clock
    def write(self,fd,data):
        self.trace.append(('write',fd,len(data)))
        if fd==12 and data==b'1':self.released=True
        return len(data)
    def signal(self,number,handler):
        old=self.handlers.get(number,lambda *_:None);self.handlers[number]=handler;return old
    def read(self,fd,size):
        self.trace.append(('read',fd,size))
        if fd==13:return b'R'
        if self.case=='base':raise self.error
        values=self.stdout if fd==51 else self.stderr;data=values.pop(0) if values else b''
        if not data:self.ends.add(fd)
        if self.ends=={51,52}:self.process.returncode=0
        return data
    def inventory(self):
        h=self
        class Inventory:
            def __init__(self,ctx):self.ctx=ctx;self.boot='b'*64;self.seen={};self.saw_browser=False
            def acquire(self,*_):h.trace.append(('acquire',));return 10
            def attach(self,pid):h.trace.append(('attach',))
            def track(self):
                h.tracks+=1;h.trace.append(('track',))
                if h.tracks==1:
                    if h.case in ('signal','signal-track'):h.handlers[signal.SIGTERM](signal.SIGTERM,None)
                    if h.case in ('track','signal-track','track-signal','track-stop-error'):raise h.error
                return []
            def stop(self,process):
                h.trace.append(('stop',))
                if h.case=='track-signal':h.handlers[signal.SIGINT](signal.SIGINT,None)
                if h.case in ('stop-error','track-stop-error'):raise OSError(5,'SYNTHETIC_PRIVATE')
                process.returncode=-signal.SIGKILL;return 0
            def remaining(self):h.trace.append(('remaining',));return 1 if h.case=='residue' else 0
            def unchanged(self):h.trace.append(('unchanged',))
            def close(self):h.trace.append(('inventory-close',))
        return Inventory
    def selector(self):
        h=self
        class Selector:
            def register(self,pipe,event,name):h.selections[pipe.fileno()]=SimpleNamespace(fileobj=pipe,data=name)
            def unregister(self,pipe):h.selections.pop(pipe.fileno())
            def get_map(self):return h.selections
            def select(self,timeout):return [(x,None) for x in list(h.selections.values())]
            def close(self):h.trace.append(('selector-close',))
        return Selector
    def run(self,module=P):
        diag=module.ParentStopDiagnostics() if hasattr(module,'ParentStopDiagnostics') else MissingDiagnostics()
        kwargs={'diagnostics':diag} if 'diagnostics' in inspect.signature(module.run_child).parameters else {}
        patches=[patch.object(module,'context',return_value=self.ctx),patch.object(module,'verify_executables'),patch.object(module,'OwnedInventory',self.inventory()),patch.object(module,'pid_identity',return_value={'pid':42,'startTicks':'1','uid':1001,'device':3,'inode':4,'exe':'/approved/python'}),patch.object(module,'gate_matches',return_value=True),patch.object(module,'capability_census',return_value=0),patch.object(module.os,'pipe',side_effect=[(11,12),(13,14)]),patch.object(module.os,'fstat',return_value=SimpleNamespace(st_dev=1,st_ino=2)),patch.object(module.os,'get_inheritable',return_value=False),patch.object(module.os,'close',side_effect=lambda fd:self.trace.append(('close',fd))),patch.object(module.os,'pidfd_open',return_value=15,create=True),patch.object(module.os,'set_blocking'),patch.object(module.os,'write',side_effect=self.write),patch.object(module.os,'read',side_effect=self.read),patch.object(module.select,'select',return_value=([13],[],[])),patch.object(module.selectors,'DefaultSelector',self.selector()),patch.object(module.subprocess,'Popen',return_value=self.process),patch.object(module.time,'monotonic',side_effect=self.monotonic),patch.object(module.signal,'signal',side_effect=self.signal)]
        result=None;error=None
        with contextlib.ExitStack() as stack,contextlib.redirect_stdout(io.StringIO()):
            for item in patches:stack.enter_context(item)
            try:result=module.run_child(['/approved/node'],**kwargs)
            except BaseException as caught:error=caught
        return result,error,diag.snapshot()

class Tests(unittest.TestCase):
    def test_actual_track_failure_is_distinct_from_parent_signal(self):
        result,error,diagnostic=Harness('track').run()
        self.assertIsNone(error);self.assertFalse(result['complete'])
        self.assertIsNotNone(diagnostic['firstCause'])
        self.assertEqual(diagnostic['firstCause']['reason'],'TRACK_EXCEPTION')
    def test_first_signal_wins_then_track_and_track_wins_then_later_signal(self):
        for case,expected in [('signal-track','PARENT_SIGTERM'),('track-signal','TRACK_EXCEPTION')]:
            result,error,d=Harness(case).run();self.assertIsNone(error)
            self.assertFalse(result['complete']);self.assertEqual(d['firstCause']['reason'],expected)

    def test_all_existing_stop_sources_and_normal_exit(self):
        for case,reason in [('normal',None),('deadline','DEADLINE'),('stdout','STDOUT_OVERFLOW'),('stderr','STDERR_OVERFLOW'),('signal','PARENT_SIGTERM'),('base','BASE_EXCEPTION'),('residue','RESIDUE_CLEANUP')]:
            with self.subTest(case=case):
                h=Harness(case);result,error,d=h.run()
                self.assertEqual(None if d['firstCause'] is None else d['firstCause']['reason'],reason)
                self.assertTrue(d['observerResourcesClosed'])
                self.assertEqual(d['collection'],'OBSERVED')
                if case=='base':self.assertIs(error,h.error)
                else:self.assertIsNone(error)
                if reason is not None:
                    self.assertIsNone(d['firstCause']['atElapsedMs'])
                    self.assertEqual(d['firstCause']['timeObservation'],'UNOBSERVED')
                self.assertNotIn('SYNTHETIC_PRIVATE',json.dumps(d))
    def test_secondary_stop_error_does_not_replace_first_cause(self):
        result,error,d=Harness('track-stop-error').run()
        self.assertIsNone(error);self.assertFalse(result['complete'])
        self.assertEqual(d['firstCause']['reason'],'TRACK_EXCEPTION')
        self.assertTrue(any(e['state']=='RAISED' and e['error']['errno']=='EIO' for e in d['stopEvents']))
    def test_pinned_original_and_new_export_have_identical_operations(self):
        raw=subprocess.check_output(['/usr/bin/git','show','4ada65a14378b9c8fdec55871e196bfe81fd56cf:scripts/concurrency/linux-operator/linux_owned_process.py'],cwd=OPERATOR,env={**os.environ,'DEVELOPER_DIR':'/Library/Developer/CommandLineTools'})
        old=types.ModuleType('parent_stop_original');old.__file__=str(OPERATOR/'linux_owned_process.py')
        exec(compile(raw,'PINNED_ORIGINAL','exec'),old.__dict__)
        for case in ['normal','deadline','stdout','stderr','signal','signal-track','track','track-signal','base','residue','track-stop-error']:
            with self.subTest(case=case):
                a,b=Harness(case),Harness(case);ra,ea,_=a.run(old);rb,eb,_=b.run()
                self.assertEqual(a.trace,b.trace)
                self.assertEqual(ra,rb);self.assertEqual(type(ea),type(eb))
                if ea is not None:self.assertIs(ea,a.error);self.assertIs(eb,b.error)
    def test_diagnostic_failure_cannot_change_actual_child_result(self):
        class Bad(P.ParentStopDiagnostics):
            def tick(self,*args):raise RuntimeError('SYNTHETIC_PRIVATE')
        with patch.object(P,'ParentStopDiagnostics',Bad):
            result,error,d=Harness().run()
        self.assertIsNone(error);self.assertTrue(result['complete'])
        self.assertEqual(d['collection'],'UNAVAILABLE')
    def test_closed_projection_overflow_and_first_cause_latch(self):
        d=P.ParentStopDiagnostics();d.cause('TRACK_EXCEPTION',ValueError('SECRET_UPPERCASE'))
        for _ in range(100):d.event('SYNTHETIC_PRIVATE','RAISED',error=RuntimeError('SYNTHETIC_PRIVATE'))
        d.cause('PARENT_SIGTERM');value=d.snapshot()
        self.assertEqual(value['firstCause']['reason'],'TRACK_EXCEPTION')
        self.assertEqual(value['firstCause']['error']['code'],'UNKNOWN')
        self.assertTrue(value['eventOverflow']);self.assertEqual(len(value['stopEvents']),64)
        self.assertNotIn('SYNTHETIC_PRIVATE',json.dumps(value));self.assertNotIn('SECRET_UPPERCASE',json.dumps(value))
    def test_actual_identity_each_read_stage_and_errno(self):
        row={'pid':42,'state':'R','startTicks':'12'}
        for stage,read_at in [('FIRST_STAT',0),('FIRST_STATUS',1),('FIRST_STAT_RECHECK',2)]:
            d=P.ParentStopDiagnostics();calls=0;sentinel=PermissionError(13,'SYNTHETIC_PRIVATE')
            def read(path):
                nonlocal calls
                at=calls;calls+=1
                if at==read_at:raise sentinel
                return 'Uid: 1001 1001 1001 1001' if at==1 else 'STAT'
            with patch.object(P,'read_text',side_effect=read),patch.object(P,'parse_stat',return_value=row),patch.object(P.os,'readlink',return_value='/approved/node'),patch.object(P.os,'stat',return_value=SimpleNamespace(st_dev=1,st_ino=2)):
                with self.assertRaises(PermissionError) as caught:P.pid_identity(42,1001,d,'FIRST')
            self.assertIs(caught.exception,sentinel);self.assertEqual(d.track['stage'],stage)
        for method,stage in [('readlink','FIRST_EXE_READLINK'),('stat','FIRST_EXE_STAT')]:
            d=P.ParentStopDiagnostics();sentinel=PermissionError(1,'SYNTHETIC_PRIVATE')
            with patch.object(P,'read_text',side_effect=['STAT','Uid: 1001 1001 1001 1001']),patch.object(P,'parse_stat',return_value=row),patch.object(P.os,method,side_effect=sentinel),patch.object(P.os,'readlink' if method=='stat' else 'stat',return_value='/approved/node'):
                with self.assertRaises(PermissionError):P.pid_identity(42,1001,d,'FIRST')
            self.assertEqual(d.track['stage'],stage)
    def test_actual_inventory_stages_compare_roles_and_original_error(self):
        row={'pid':42,'uid':1001,'startTicks':'12','exe':'/approved/node','device':1,'inode':2}
        for stage in ['CGROUP_CHECK','MEMBERS','FIRST_IDENTITY','PIDFD_OPEN','SECOND_IDENTITY','COMPARE']:
            d=P.ParentStopDiagnostics();d.pins={'node':{'path':'/approved/node','device':1,'inode':2},'browser':[]}
            inv=P.OwnedInventory.__new__(P.OwnedInventory);inv.ctx={'binaries':{'browser':[]}};inv.group=Path('/synthetic');inv.seen={};inv.saw_browser=False;inv.diagnostics=d
            sentinel=PermissionError(13,'SYNTHETIC_PRIVATE');count=0
            def identity(*args):
                nonlocal count
                count+=1
                if stage==('FIRST_IDENTITY' if count==1 else 'SECOND_IDENTITY'):raise sentinel
                return row if count==1 or stage!='COMPARE' else {**row,'inode':3}
            with patch.object(inv,'unchanged',side_effect=sentinel if stage=='CGROUP_CHECK' else None),patch.object(P,'read_pid_members',side_effect=sentinel if stage=='MEMBERS' else None,return_value=[42]),patch.object(P,'pid_identity',side_effect=identity),patch.object(P.os,'pidfd_open',side_effect=sentinel if stage=='PIDFD_OPEN' else None,return_value=7,create=True),patch.object(P.os,'close'):
                with self.assertRaises(Exception) as caught:inv.track()
            self.assertEqual(d.track['stage'],stage)
            if stage=='COMPARE':
                self.assertEqual(d.track['fields'],['inode']);self.assertEqual(d.track['firstRole'],'NODE')
                self.assertEqual(str(caught.exception),'PROCESS_CHANGED_WHILE_TRACKING')
            else:self.assertIs(caught.exception,sentinel)
            self.assertEqual(d.events[-1]['state'],'RAISED')
    def test_actual_stop_keeps_all_original_waits_targets_and_order(self):
        trace=[];d=P.ParentStopDiagnostics();inv=P.OwnedInventory.__new__(P.OwnedInventory)
        inv.diagnostics=d;inv.seen={(42,'12'):7};inv.group=Path('/synthetic')
        inv.track=lambda:trace.append('track');inv.unchanged=lambda:trace.append('unchanged')
        inv.remaining=lambda:0
        process=SimpleNamespace(poll=lambda:None,terminate=lambda:trace.append('terminate'),kill=lambda:trace.append('kill'),wait=lambda timeout:trace.append(('wait',timeout)))
        with patch.object(P,'signal_pidfd',side_effect=lambda fd,sig:trace.append((fd,sig))),patch.object(P.time,'monotonic',side_effect=range(10)),patch.object(P.time,'sleep',side_effect=AssertionError('NO_NEW_SLEEP')),patch.object(P,'read_pid_members',return_value=[]):
            self.assertEqual(inv.stop(process),0)
        self.assertEqual(trace,['track',(7,signal.SIGTERM),'terminate','unchanged',(7,signal.SIGKILL),'kill',('wait',3)])
        phases=[e['phase'] for e in d.events if e['state']=='ENTERED']
        self.assertEqual(phases,['STOP_TRACK','PIDFD_TERM','MAIN_TERM','GRACE','STOP_CGROUP_CHECK','KILL_MEMBERS','CGROUP_KILL','PIDFD_KILL','MAIN_KILL','WAIT','RESIDUE_WAIT','FINAL_RESIDUE'])
    def caller(self,write,run):
        tree=ast.parse((OPERATOR/'run-functional-owned.py').read_text())
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='observe_owned_child')
        namespace={'ParentStopDiagnostics':P.ParentStopDiagnostics,'run_child':run,'re':__import__('re'),'json':json,'R':Path('/synthetic'),'write':write}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'ACTUAL_CALLER','exec'),namespace)
        return namespace['observe_owned_child']
    def test_actual_caller_write_after_return_and_writer_failure_original_identity(self):
        trace=[];result=object();sentinel=ValueError('SYNTHETIC_PRIVATE')
        profile={'expectedSha256':'c'*64,'observed':{'identity':{'jobSha256':'d'*64,'bootIdSha256':'b'*64}}}
        scope={'executionProfileSha256':'c'*64}
        def run(*args,**kwargs):trace.append('closed');return result
        def write(path,value):trace.append('write');self.assertEqual(value['authority'],'NON_AUTHORITY');self.assertEqual(path.name,'capacity-parent-stop-wcr-261118-abcdef.json');raise sentinel
        fn=self.caller(write,run)
        self.assertIs(fn([], 'a'*40,'wcr-261118-abcdef',scope,profile,'fresh_registration-native_browser-40'),result)
        self.assertEqual(trace,['closed','write'])
        def fail(*args,**kwargs):trace.append('original-error');raise sentinel
        fn=self.caller(write,fail)
        with self.assertRaises(ValueError) as caught:fn([],'a'*40,'wcr-261118-abcdef',scope,profile,'fresh_registration-native_browser-40')
        self.assertIs(caught.exception,sentinel);self.assertEqual(trace[-2:],['original-error','write'])
    def test_actual_caller_fixed_private_writer_and_closed_binding(self):
        tree=ast.parse((OPERATOR/'run-functional-owned.py').read_text())
        fns=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('write','digest')]
        ns={'os':os,'json':json,'hashlib':__import__('hashlib')}
        exec(compile(ast.Module(body=fns,type_ignores=[]),'ACTUAL_WRITER','exec'),ns)
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'sideband.json';ns['write'](path,{'authority':'NON_AUTHORITY'})
            self.assertEqual(path.stat().st_mode&0o777,0o600)
            with self.assertRaises(FileExistsError):ns['write'](path,{})
        writes=[];fn=self.caller(lambda *args:writes.append(args),lambda *args,**kwargs:42)
        malformed={'expectedSha256':'c'*64,'observed':{'identity':{'jobSha256':'PRIVATE','bootIdSha256':'b'*64}}}
        self.assertEqual(fn([],'a'*40,'wcr-261118-abcdef',{'executionProfileSha256':'c'*64},malformed),42)
        self.assertEqual(writes,[])

if __name__=='__main__':unittest.main()
