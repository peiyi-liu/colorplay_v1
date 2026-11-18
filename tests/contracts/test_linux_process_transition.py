"""Synthetic procfs only: original tracker failure must remain authoritative."""
import sys
import json
import hashlib
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
OPERATOR=Path(__file__).resolve().parents[2]/'scripts/concurrency/linux-operator'
sys.path.insert(0,str(OPERATOR))
import linux_owned_process as P
import linux_process_transition as T

class ActualTransitionTests(unittest.TestCase):
    def test_actual_failed_compare_has_transition_witness_without_relaxing_original_failure(self):
        first={'pid':42,'startTicks':'12','uid':1001,'exe':'/approved/python','device':1,'inode':2}
        after={**first,'startTicks':'13','exe':'/usr/bin/git','inode':3}
        with patch.object(P,'private_read',return_value=(OPERATOR/'linux_process_transition.py').read_bytes()):
            diagnostic=P.ParentStopDiagnostics()
        diagnostic.transition.reader=lambda pid,kind,maximum: fake_stat(pid,'12') if kind=='stat' else b'0::/synthetic-leaf\n' if kind=='cgroup' else b'/usr/bin/git\0rev-parse\0HEAD\0'
        diagnostic.transition.clock=lambda:1.0
        diagnostic.python_pin(first)
        inventory=P.OwnedInventory.__new__(P.OwnedInventory)
        inventory.ctx={'binaries':{'node':{'path':'/approved/node','device':1,'inode':1},'browser':[]},'generatorCgroupRelativePath':'/synthetic-leaf'}
        inventory.group=Path('/synthetic');inventory.seen={};inventory.saw_browser=False;inventory.diagnostics=diagnostic
        with patch.object(inventory,'unchanged'),patch.object(P,'read_pid_members',return_value=[42]),patch.object(P,'pid_identity',return_value=first),patch.object(P,'_owned_frame',side_effect=[first,after]),patch.object(P.select,'select',return_value=([],[],[])),patch.object(P.os,'getuid',return_value=1001),patch.object(P.os,'pidfd_open',return_value=7,create=True),patch.object(P.os,'close'):
            with self.assertRaisesRegex(ValueError,'PROCESS_CHANGED_WHILE_TRACKING'):
                inventory.track()
        port=getattr(diagnostic,'transition_snapshot',lambda:{'collection':'UNOBSERVED'})
        self.assertEqual(port()['collection'],'OBSERVED')
        # Birth drift remains a failed pair; original M64 refuses post-failure enrichment.
        self.assertEqual(port()['afterFailure']['collection'],'UNOBSERVED')
        self.assertIsNone(port()['afterFailure']['candidate'])
        self.assertEqual(port()['pair']['changedFields'],['startTicks','exe','inode'])
        self.assertEqual(inventory.seen,{})



def fake_stat(pid,start,ppid=1,state='S'):
    fields=['0']*19;fields[0]=str(ppid);fields[18]=str(start)
    return ('%d (PRIVATE) %s %s\n'%(pid,state,' '.join(fields))).encode()

def context():
    return {'binaries':{'node':{'path':'/approved/node','device':1,'inode':1},'browser':[]},'generatorCgroupRelativePath':'/synthetic-leaf'}

def pair():
    first={'pid':42,'startTicks':'12','uid':1001,'exe':'/approved/python','device':1,'inode':2}
    return first,{**first,'exe':'/usr/bin/git','inode':3}

class PassiveControls(unittest.TestCase):
    def collector(self,reader=None,clock=None):
        calls=[]
        def read(pid,kind,maximum):
            calls.append((pid,kind,maximum))
            if reader:return reader(pid,kind,maximum)
            return fake_stat(pid,'12' if pid==42 else '8',100) if kind=='stat' else b'0::/synthetic-leaf\n' if kind=='cgroup' else b'/usr/bin/git\0rev-parse\0HEAD\0'
        value=T.ProcessTransitionDiagnostics(read,clock or (lambda:1.),OPERATOR)
        value.configure(context());value.python_pin(pair()[0])
        return value,calls
    def run_pair(self,value,seen=None,first=None,second=None,pidfd=True):
        a,b=pair();first=a if first is None else first;second=b if second is None else second
        with patch.object(T.os,'getuid',return_value=1001):value.failure(context(),first,second,{} if seen is None else seen,pidfd)
        return value.snapshot()
    def test_pair_and_two_verified_pids_are_distinct_from_post_failure_observation(self):
        value,calls=self.collector()
        for prefix in ['FIRST','SECOND']:
            value.piece(prefix,'stat',{'pid':42,'ppid':100,'state':'S','startTicks':'12'})
            value.piece(prefix,'recheck',{'pid':42,'ppid':100,'state':'S','startTicks':'12'})
        value.piece('FIRST','readlink','/approved/python');value.piece('FIRST','exeStat',{'device':1,'inode':2})
        result=self.run_pair(value,{(100,'8'):7,(1000,'9'):8})
        self.assertEqual({c[0] for c in calls},{42,100});self.assertEqual(len(calls),10)
        self.assertEqual(result['pair']['equalities']['ppid'],'EQUAL')
        self.assertEqual(result['pair']['first']['rowRole'],'PYTHON')
        self.assertEqual(result['pair']['first']['fstatRole'],'PYTHON')
        self.assertEqual(result['pair']['second']['rowRole'],'KNOWN_PATH_ONLY_GIT_READONLY')
        self.assertEqual(result['afterFailure']['parent']['argv']['pin'],'UNPINNED')
        self.assertEqual(result['afterFailure']['phase'],'AFTER_FAILURE')
        self.assertEqual(result['pair']['pidfdBirthAttestation'],'UNOBSERVED')
        before=value.snapshot();value.begin();value.failure({}, {}, {}, {}, False)
        self.assertEqual(value.snapshot(),before)
        result['pair']['candidateNew']=False;self.assertTrue(value.snapshot()['pair']['candidateNew'])
    def test_birth_uid_or_unopened_pidfd_never_admits_extra_reads(self):
        for key,new in [('startTicks','13'),('pid',43),('uid',1002),('PIDFD',False)]:
            with self.subTest(key=key):
                value,calls=self.collector();first,second=pair()
                if key!='PIDFD':second[key]=new
                result=self.run_pair(value,first=first,second=second,pidfd=key!='PIDFD')
                self.assertEqual(calls,[]);self.assertEqual(result['afterFailure']['collection'],'UNOBSERVED')
    def test_drift_and_missing_parent_are_not_invented_as_owned(self):
        for mode in ['BIRTH','LEAF','PARENT_REUSE']:
            def read(pid,kind,maximum):
                if kind=='stat':return fake_stat(pid,'13' if mode=='BIRTH' or pid==100 else '12',100)
                if kind=='cgroup':return b'0::/foreign\n' if mode=='LEAF' else b'0::/synthetic-leaf\n'
                return b'/usr/bin/git\0status\0--porcelain\0'
            value,calls=self.collector(read);result=self.run_pair(value,{(100,'8'):9})
            if mode=='BIRTH':self.assertEqual(len(calls),1);self.assertEqual(result['afterFailure']['candidate']['birth'],'DIFFERENT')
            elif mode=='LEAF':self.assertEqual(len(calls),2);self.assertEqual(result['afterFailure']['candidate']['leaf'],'DIFFERENT')
            else:self.assertEqual(result['afterFailure']['parent']['birth'],'DIFFERENT');self.assertEqual(len(calls),6)
    def test_soft_deadline_bytes_clock_and_errno_are_closed_and_isolated(self):
        for mode in ['TIME','CLOCK','BACKWARD','BYTES','MISSING','PERMISSION']:
            time=[1.];reads=[]
            def clock():
                if mode=='CLOCK':return float('nan')
                if mode=='BACKWARD':time[0]-=.01
                return time[0]
            def read(pid,kind,maximum):
                reads.append(kind)
                if mode=='TIME':time[0]+=.101
                if mode=='BYTES':return b'X'*8193
                if mode=='MISSING':raise FileNotFoundError(2,'PRIVATE_SECRET')
                if mode=='PERMISSION':raise PermissionError(13,'PRIVATE_SECRET')
                return fake_stat(pid,'12')
            value,_=self.collector(read,clock);result=self.run_pair(value)
            self.assertEqual(result['collection'],'UNAVAILABLE',mode)
            self.assertLessEqual(len(reads),1,mode);self.assertLessEqual(result['afterFailure']['bytesRead'],65536)
            self.assertNotIn('PRIVATE_SECRET',json.dumps(result))
    def test_fixed_templates_and_secret_rejection(self):
        cases=[(b'/usr/bin/git\0rev-parse\0HEAD\0','GIT_READONLY'),
               (b'/usr/bin/git\0status\0--porcelain\0','GIT_READONLY'),
               (b'/usr/bin/docker\0--host\0unix:///var/run/docker.sock\0inspect\0--format\0'+T.DOCKER_SHAPE.encode()+b'\0'+b'\0'.join([b'a'*64]*8)+b'\0','DOCKER_INSPECT'),
               (str(OPERATOR.parent/'host-client/bin/psql').encode()+b'\0--no-psqlrc\0--quiet\0--tuples-only\0--no-align\0--set=ON_ERROR_STOP=1\0','PSQL_READONLY')]
        for raw,expected in cases:self.assertEqual(T.argv_class(raw,OPERATOR)['kind'],expected)
        for raw in [b'/tmp/git\0status\0--porcelain\0',b'/usr/bin/git\0config\0SECRET\0',b'KEY=SECRET',b'\xff\0']:
            result=T.argv_class(raw,OPERATOR);self.assertEqual(result['kind'],'OTHER');self.assertNotIn('SECRET',json.dumps(result))
        for filename,kind in T.HELPERS.items():
            tail=[] if kind in {'HOST_SAMPLE','BACKEND_SAMPLE'} else ['a'*40,'wsc-261118-abcdef','b'*64] if kind.startswith('CAPACITY_') else ['a'*40,'b'*64,'c'*32] if kind=='PROFILE_PREFLIGHT' else ['a'*40,'wsb-261118-abcdef']
            raw='\0'.join(['/usr/bin/python3','-B',str(OPERATOR/filename),*tail,'']).encode()
            self.assertEqual(T.argv_class(raw,OPERATOR)['helper'],kind)
    def test_loader_fixed_hash_matches_manifest_and_rejects_tamper_symlink_mode(self):
        raw=(OPERATOR/'linux_process_transition.py').read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),P.TRANSITION_MODULE_SHA256)
        entry=json.loads((OPERATOR/'package-manifest.json').read_text())['files']['linux_process_transition.py']
        self.assertEqual(entry['sha256'],P.TRANSITION_MODULE_SHA256)
        with tempfile.TemporaryDirectory() as folder:
            folder=Path(folder).resolve();target=folder/'linux_process_transition.py';target.write_bytes(raw);target.chmod(0o600)
            with patch.object(P,'__file__',str(Path(folder)/'linux_owned_process.py')):
                self.assertIsNotNone(P._transition_collector())
                target.write_bytes(raw+b'\nraise Exception("SECRET")')
                with patch('builtins.exec') as execute:
                    self.assertIsNone(P._transition_collector());execute.assert_not_called()
                target.write_bytes(raw);target.chmod(0o644);self.assertIsNone(P._transition_collector())
                target.unlink();target.symlink_to(OPERATOR/'linux_process_transition.py');self.assertIsNone(P._transition_collector())
    def test_actual_identity_reuses_existing_reads_without_changing_return_fields(self):
        value,calls=self.collector();d=P.ParentStopDiagnostics();d.transition=value
        row={'pid':42,'ppid':100,'state':'S','startTicks':'12'}
        with patch.object(P,'read_text',side_effect=['STAT','Uid: 1001 1001 1001 1001','STAT']),patch.object(P,'parse_stat',return_value=row),patch.object(P.os,'readlink',return_value='/approved/python'),patch.object(P.os,'stat',return_value=SimpleNamespace(st_dev=1,st_ino=2)):
            actual=P.pid_identity(42,1001,d,'FIRST')
        self.assertEqual(set(actual),{'pid','startTicks','uid','exe','device','inode'});self.assertEqual(calls,[])
        self.assertEqual(value.parts['FIRST']['recheck']['ppid'],100)

class NativeReadShapeOnlyTests(unittest.TestCase):
    def test_native_reader_has_fixed_proc_path_nonblock_limit_and_closes_owned_fd(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'synthetic';source.write_bytes(b'x'*20)
            original=os.open;owned=[]
            def fake_open(path,flags):
                self.assertEqual(path,'/proc/42/stat');self.assertTrue(flags&os.O_NONBLOCK);self.assertTrue(flags&os.O_NOFOLLOW)
                fd=original(source,flags);owned.append(fd);return fd
            with patch.object(T.os,'open',side_effect=fake_open):self.assertEqual(T.read_proc(42,'stat',7),b'x'*7)
            with self.assertRaises(OSError):os.fstat(owned[0])
    def test_unknown_reader_error_never_leaks_or_overwrites_original_pair(self):
        collector=PassiveControls();value,_=collector.collector(lambda *args:(_ for _ in ()).throw(ValueError(['PRIVATE_SECRET'])))
        result=collector.run_pair(value)
        self.assertEqual(result['pair']['changedFields'],['exe','inode'])
        self.assertEqual(result['afterFailure']['reason'],'READ_UNAVAILABLE')
        self.assertNotIn('PRIVATE_SECRET',json.dumps(result))

class AfterFailureBoundaryTests(unittest.TestCase):
    def test_cmdline_race_birth_parent_leaf_disappearance_never_keeps_bound_argv(self):
        for mode in ['BIRTH','PPID','LEAF','DISAPPEAR']:
            with self.subTest(mode=mode):
                changed=[False]
                def read(pid,kind,maximum):
                    if kind=='cmdline':changed[0]=True;return b'/usr/bin/git\0rev-parse\0HEAD\0'
                    if changed[0] and mode=='DISAPPEAR':raise FileNotFoundError(2,'PRIVATE')
                    if kind=='stat':return fake_stat(pid,'13' if changed[0] and mode=='BIRTH' else '12',101 if changed[0] and mode=='PPID' else 1)
                    return b'0::/foreign\n' if changed[0] and mode=='LEAF' else b'0::/synthetic-leaf\n'
                value,calls=PassiveControls().collector(read)
                result=PassiveControls().run_pair(value)
                self.assertEqual(result['afterFailure']['collection'],'UNAVAILABLE')
                self.assertIsNone(result['afterFailure']['candidate']['argv'])
                self.assertIsNone(result['afterFailure']['parent'])
                self.assertLessEqual(len(calls),5)

class StableBoundaryPositiveTests(unittest.TestCase):
    def test_normal_state_change_still_captures_with_exact_two_stat_two_leaf_budget(self):
        changed=[False]
        def read(pid,kind,maximum):
            if kind=='cmdline':changed[0]=True;return b'/usr/bin/git\0rev-parse\0HEAD\0'
            if kind=='stat':return fake_stat(pid,'12',1,'S' if changed[0] else 'R')
            return b'0::/synthetic-leaf\n'
        value,calls=PassiveControls().collector(read);result=PassiveControls().run_pair(value)
        self.assertEqual(result['afterFailure']['collection'],'OBSERVED')
        candidate=result['afterFailure']['candidate']
        self.assertEqual(candidate['birth'],'EQUAL');self.assertEqual(candidate['ppidBoundary'],'EQUAL')
        self.assertEqual(candidate['stateAtStart'],'R');self.assertEqual(candidate['stateAtEnd'],'S')
        self.assertEqual(candidate['argv']['kind'],'GIT_READONLY');self.assertFalse(candidate['atomic'])
        self.assertEqual([(kind,cap) for _,kind,cap in calls],[('stat',4096),('cgroup',8192),('cmdline',8192),('stat',4096),('cgroup',8192)])

if __name__=='__main__':unittest.main()
