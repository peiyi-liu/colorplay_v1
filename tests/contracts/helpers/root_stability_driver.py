"""Exact public host sampler with fake proc metadata, smaps and monotonic clock."""
import copy
import importlib.util
from pathlib import Path
import sys
import types
import threading
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[3]
DIRECTORY=ROOT/'scripts/concurrency/linux-operator'
sys.path.insert(0,str(Path(__file__).parent))
import root_sampler_failure_driver as F
spec=importlib.util.spec_from_file_location('stability_proc',DIRECTORY/'linux_proc.py')
PROC=importlib.util.module_from_spec(spec);spec.loader.exec_module(PROC)


def row(pid,exe,start=1,ppid=123):
    return {'identity':{'pid':pid,'startTicks':str(start),'uid':1001,'bootIdSha256':'a'*64},
            'exe':exe,'device':1,'inode':pid,'ppid':ppid,'startTicks':str(start),'userTicks':1,'systemTicks':1}


NODE=row(123,'/synthetic/node',ppid=1)
BROWSER=row(234,'/synthetic/chrome')
EXTRA=row(345,'/synthetic/chrome')
A={123:NODE,234:BROWSER}
GROWN={**A,345:EXTRA}
CTX={'generatorCgroupRelativePath':'/synthetic','binaries':{'node':{'path':NODE['exe'],'device':1,'inode':123},
     'browser':[{'path':BROWSER['exe'],'device':1,'inode':234},{'path':EXTRA['exe'],'device':1,'inode':345}]}}
PROFILE={'identity':{'ownerUid':1001}}


class Provider:
    def __init__(self,scans,cost=.01):
        self.lock=threading.RLock();self.trace=[];self.always_missing=False
        self.scans=scans;self.cost=cost;self.clock=0.0;self.reads=[];self.metadata_calls=0;self.sleeps=[]
        self.missing=0;self.denied=None;self.stationary=False;self.sleep_error=None;self.clock_hook=None
        _trace,_common,modules=F.environment('host');modules['linux_proc']=PROC
        self.ns={'__name__':'SYNTHETIC_ONLY'}
        with patch.dict(sys.modules,modules):exec(compile((DIRECTORY/'linux-host-sample.py').read_bytes(),'<actual-host-fake-providers>','exec'),self.ns)
        self.ns['metadata']=self.metadata;self.ns['read_text']=self.read
        self.ns['time']=types.SimpleNamespace(monotonic=self.now,sleep=self.sleep)
    def now(self):
        with self.lock:return self.clock_hook() if self.clock_hook else self.clock
    def metadata(self,*_args):
        with self.lock:
            index=self.metadata_calls;self.metadata_calls+=1;self.trace.append(('META',index))
            if not self.stationary:self.clock+=self.cost
            return copy.deepcopy(self.scans[min(index,len(self.scans)-1)])
    def read(self,path,*_args):
        with self.lock:
            self.reads.append(int(path.parent.name));self.trace.append(('READ',int(path.parent.name)))
            if not self.stationary:self.clock+=.001
            if self.denied:raise self.denied
            if self.always_missing or len(self.reads)<=self.missing:raise FileNotFoundError('SYNTHETIC_PRIVATE')
            return 'Rss: 100 kB\nPss: 50 kB\n'
    def sleep(self,seconds):
        with self.lock:
            self.sleeps.append(seconds)
            if self.sleep_error:raise self.sleep_error
            if not self.stationary:self.clock+=seconds
    def sample(self,protocol=False):
        return self.ns['stable_memory_sample'](CTX,PROFILE,123,None if protocol else 234,protocol,'boot',browser_cache=ROOT)


class StabilityWindow(unittest.TestCase):
    def test_fourth_complete_pair_inside_original_window_succeeds(self):
        p=Provider([A,GROWN]*3+[GROWN,GROWN])
        rows,chrome,values=p.sample()
        self.assertEqual(p.metadata_calls,8)
        self.assertEqual(set(chrome),{234,345})
        self.assertEqual(set(values),{123,234,345})
        self.assertEqual(sum(v['pssBytes'] for v in values.values()),153600)
        self.assertEqual(len(p.reads),9)
        for start,plan in [(0,[123,234]),(2,[123,234]),(4,[123,234]),(6,[123,234,345])]:
            self.assertCountEqual(p.reads[start:start+len(plan)],plan)
        self.assertEqual([value for kind,value in p.trace if kind=='META'],list(range(8)))
        self.assertLess(p.clock,1.5)
    def test_late_stable_pair_cannot_return_a_success(self):
        p=Provider([A,A],cost=.8)
        with self.assertRaisesRegex(ValueError,'^PROCESS_TREE_INCOMPLETE$'):p.sample()
        proof=p.ns['failure'](ValueError('PROCESS_TREE_INCOMPLETE'))['stability']
        self.assertEqual(proof['stopReason'],'WINDOW_EXHAUSTED')
        self.assertEqual(proof['lastAttemptOutcome'],'STABLE_AFTER_DEADLINE')

    def failure(self,p):
        with self.assertRaisesRegex(ValueError,'^PROCESS_TREE_INCOMPLETE$') as caught:p.sample()
        return p.ns['failure'](caught.exception)
    def test_first_pair_output_has_complete_exact_memory_and_no_stability(self):
        p=Provider([A,A]);rows,chrome,values=p.sample()
        self.assertEqual(set(values),{123,234});self.assertEqual(p.metadata_calls,2)
        self.assertEqual(values[123],{'rssBytes':102400,'pssBytes':51200})
        self.assertNotIn('stability',p.ns['STATE'])
    def test_continuous_churn_window_exhausts_without_incomplete_success(self):
        p=Provider([A,GROWN]*76);proof=self.failure(p)['stability']
        self.assertEqual(proof['stopReason'],'WINDOW_EXHAUSTED')
        self.assertLessEqual(proof['attempts'],76)
        self.assertTrue(all(0<t<=.02 for t in p.sleeps))
    def test_stationary_clock_stops_at_76_with_truthful_complete_counts(self):
        p=Provider([A,GROWN]*76);p.stationary=True;proof=self.failure(p)['stability']
        self.assertEqual(proof,{'attempts':76,'elapsedMs':0,'stopReason':'ATTEMPT_CAP',
            'lastAttemptOutcome':'COMPLETE_MISMATCH','lastMismatchKinds':['CHROME_SET'],
            'comparisonComplete':True,'beforeChromeCount':1,'afterChromeCount':2,
            'addedCount':1,'removedCount':0,'changedIdentityCount':0})
        self.assertEqual(p.metadata_calls,152);self.assertEqual(len(p.sleeps),75)
    def test_invalid_and_backwards_clocks_never_clamped(self):
        for value in [float('nan'),float('inf'),True]:
            p=Provider([A,A]);p.clock_hook=lambda:value
            proof=self.failure(p)['stability']
            self.assertEqual(proof['stopReason'],'CLOCK_INVALID');self.assertIsNone(proof['elapsedMs'])
        p=Provider([A,A]);values=iter([1.0,1.1,1.05]);p.clock_hook=lambda:next(values)
        proof=self.failure(p)['stability'];self.assertEqual(proof['stopReason'],'CLOCK_INVALID')
        self.assertIsNone(proof['afterChromeCount']);self.assertIsNone(proof['elapsedMs'])
    def test_smaps_disappears_then_complete_retry_and_permission_error_identity(self):
        p=Provider([A,A,A]);p.missing=1;_,_,values=p.sample()
        self.assertEqual(p.metadata_calls,3);self.assertEqual(set(values),{123,234})
        denied=PermissionError(1,'SYNTHETIC_PRIVATE');p=Provider([A]);p.denied=denied
        with self.assertRaises(PermissionError) as caught:p.sample()
        self.assertIs(caught.exception,denied);self.assertEqual(p.metadata_calls,1);self.assertEqual(p.sleeps,[])
        self.assertNotIn('stability',p.ns['failure'](denied))
    def test_deadline_mid_smaps_keeps_after_counts_unknown(self):
        p=Provider([A,A],cost=1.499);proof=self.failure(p)['stability']
        self.assertFalse(proof['comparisonComplete']);self.assertEqual(proof['beforeChromeCount'],1)
        self.assertIsNone(proof['afterChromeCount']);self.assertIsNone(proof['addedCount'])
        self.assertEqual(p.metadata_calls,1);self.assertGreaterEqual(len(p.reads),1)
        self.assertLessEqual(len(p.reads),2);self.assertEqual(len(set(p.reads)),len(p.reads));self.assertTrue(set(p.reads)<={123,234})
    def test_sleep_interruption_preserves_original_exception(self):
        sentinel=InterruptedError('SYNTHETIC_PRIVATE');p=Provider([A,GROWN]);p.sleep_error=sentinel
        with self.assertRaises(InterruptedError) as caught:p.sample()
        self.assertIs(caught.exception,sentinel);self.assertEqual(p.metadata_calls,2)
    def test_each_full_pre_set_read_and_no_previous_attempt_memory_reused(self):
        p=Provider([A,GROWN]*3+[GROWN,GROWN]);original=p.read
        def changing(path,*args):
            with p.lock:
                original(path,*args)
                return 'Rss: 1000 kB\nPss: '+str(len(p.reads))+' kB\n'
        p.ns['read_text']=changing;_,_,values=p.sample()
        self.assertEqual(len(p.reads),9)
        for start,plan in [(0,[123,234]),(2,[123,234]),(4,[123,234]),(6,[123,234,345])]:
            self.assertCountEqual(p.reads[start:start+len(plan)],plan)
        self.assertEqual([value for kind,value in p.trace if kind=='META'],list(range(8)))
        self.assertEqual(sum(v['pssBytes'] for v in values.values()),24*1024)
    def test_node_and_chrome_identity_differences_are_not_hidden(self):
        for key,kind in [(123,'NODE_IDENTITY'),(234,'CHROME_IDENTITY')]:
            after=copy.deepcopy(A);after[key]['identity']['startTicks']='99'
            p=Provider([A,after]*76);p.stationary=True;proof=self.failure(p)['stability']
            self.assertIn(kind,proof['lastMismatchKinds'])
            self.assertEqual(proof['changedIdentityCount'],1 if key==234 else 0)
        after=copy.deepcopy(A);del after[123];p=Provider([A,after]*76);p.stationary=True
        self.assertEqual(self.failure(p)['stability']['lastMismatchKinds'],['NODE_MISSING'])
    def test_browser_binary_parent_and_node_guards_immediate(self):
        for changes,code in [({'exe':'/synthetic/foreign/chrome'},'UNAPPROVED_BROWSER_BINARY'),
                             ({'ppid':999},'BROWSER_NOT_OWNED')]:
            wrong=copy.deepcopy(A);wrong[234].update(changes);p=Provider([wrong])
            with self.assertRaisesRegex(ValueError,'^'+code+'$'):p.sample()
            self.assertEqual(p.metadata_calls,1);self.assertEqual(p.sleeps,[])
        p=Provider([{234:BROWSER}])
        with self.assertRaisesRegex(ValueError,'^NODE_BINARY_OR_SCOPE_CHANGED$'):p.sample()
    def test_actual_uid_guard_and_original_request_start_guards(self):
        p=Provider([A,A]);fields=['0']*19;fields[0]='1';fields[18]='2'
        p.ns['read_text']=lambda path,*args:'123 (synthetic) S '+' '.join(fields) if path.name=='stat' else 'Uid:\t999 999 999 999\n'
        with self.assertRaisesRegex(ValueError,'^PROCESS_OWNER_CHANGED$'):
            p.ns['read_process'](Path('/synthetic'),123,1001,'boot')
        for key,value,code in [('nodeStart','99','NODE_PID_REUSED'),('browserStart','99','BROWSER_PID_REUSED')]:
            ns,_trace,_common=F.load('host',(DIRECTORY/'linux-host-sample.py').read_text())
            with self.assertRaisesRegex(ValueError,'^'+code+'$'):ns['sample']({'mode':'NATIVE_BROWSER','nodePid':123,'browserPid':234,key:value})
    def test_oversized_elapsed_drops_nested_without_clamp_or_success(self):
        p=Provider([A],cost=31);proof=self.failure(p)
        self.assertNotIn('stability',proof);self.assertEqual(proof['code'],'PROCESS_TREE_INCOMPLETE')
    def test_protocol_node_only_keeps_original_return_shape(self):
        p=Provider([{123:NODE}]*2);rows,chrome,values=p.sample(protocol=True)
        self.assertEqual(chrome,{});self.assertEqual(set(values),{123})

    def test_new_attempt_never_publishes_previous_after_counts(self):
        p=Provider([A,GROWN,GROWN]);original=p.metadata
        def advances(*args):
            value=original(*args)
            if p.metadata_calls==3:p.clock=1.6
            return value
        p.ns['metadata']=advances;proof=self.failure(p)['stability']
        self.assertEqual(proof['attempts'],2);self.assertEqual(proof['beforeChromeCount'],2)
        self.assertIsNone(proof['afterChromeCount']);self.assertIsNone(proof['addedCount'])
        self.assertEqual(proof['lastMismatchKinds'],[]);self.assertFalse(proof['comparisonComplete'])
    def test_clock_invalid_after_full_pair_does_not_claim_deadline(self):
        p=Provider([A,A]);count=0
        def now():
            nonlocal count
            count+=1
            return float('nan') if count==7 else p.clock
        p.clock_hook=now;proof=self.failure(p)['stability']
        self.assertEqual(proof['stopReason'],'CLOCK_INVALID');self.assertIsNone(proof['elapsedMs'])
        self.assertTrue(proof['comparisonComplete']);self.assertEqual(proof['lastAttemptOutcome'],'UNOBSERVED')
    def test_missing_smaps_remains_partial_at_attempt_cap(self):
        p=Provider([A]);p.stationary=True;p.always_missing=True;proof=self.failure(p)['stability']
        self.assertEqual(proof['attempts'],76);self.assertEqual(proof['lastAttemptOutcome'],'SMAPS_DISAPPEARED')
        self.assertIsNone(proof['afterChromeCount']);self.assertIsNone(proof['changedIdentityCount'])


def envelopes():
    providers=[Provider([A,GROWN]*76),Provider([A,GROWN]*76),Provider([A,A]),Provider([A,A],cost=.8),Provider([A])]
    providers[1].stationary=True;providers[2].clock_hook=lambda:float('nan')
    providers[4].stationary=True;providers[4].always_missing=True
    values=[]
    for p in providers:
        try:p.sample()
        except ValueError as error:values.append(p.ns['failure'](error))
        else:raise AssertionError('EXPECTED_FAILURE_ENVELOPE')
    return values


if __name__=='__main__':
    if sys.argv[1:]==['--envelopes']:
        import json
        print(json.dumps(envelopes()))
    else:unittest.main()
