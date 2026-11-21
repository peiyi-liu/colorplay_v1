"""Pure fake providers exercise actual sampler; no proc, root, socket or native IO."""
import copy
import json
from pathlib import Path
import sys
import threading
import unittest

sys.path.insert(0,str(Path(__file__).parent))
import root_stability_driver as S


def fixture(count):
    rows={123:copy.deepcopy(S.NODE)}
    for pid in range(200,200+count-1):rows[pid]=S.row(pid,'/synthetic/chrome')
    ctx={'generatorCgroupRelativePath':'/synthetic','binaries':{'node':{'path':S.NODE['exe'],'device':1,'inode':123},
         'browser':[{'path':'/synthetic/chrome','device':1,'inode':pid} for pid in rows if pid!=123]}}
    p=S.Provider([rows,rows]);p.stationary=True
    def sample():return p.ns['stable_memory_sample'](ctx,S.PROFILE,123,None if count==1 else 200,count==1,'boot',browser_cache=S.ROOT)
    return p,rows,ctx,sample


class PssConcurrency(unittest.TestCase):
    def test_actual_sampler_has_four_bounded_inflight_reads_and_complete_result(self):
        p,rows,_ctx,sample=fixture(20);release=threading.Event();four=threading.Event();lock=threading.Lock()
        active=0;maximum=0;started=[];finished=[];outcome=[]
        def read(path,*_args):
            nonlocal active,maximum
            pid=int(path.parent.name)
            with lock:
                active+=1;maximum=max(maximum,active);started.append(pid)
                if active==4:four.set()
            try:
                if not release.wait(3):raise AssertionError('FIXTURE_RELEASE_MISSING')
                return 'Rss: 100 kB\nPss: 50 kB\n'
            finally:
                with lock:active-=1;finished.append(pid)
        p.ns['read_text']=read
        def run():
            try:outcome.append(sample())
            except BaseException as error:outcome.append(error)
        owner=threading.Thread(target=run,name='synthetic-controller');owner.start()
        try:self.assertTrue(four.wait(2),'ACTUAL_SAMPLER_ONLY_ONE_READ_IN_FLIGHT')
        finally:release.set();owner.join(3)
        self.assertFalse(owner.is_alive());self.assertEqual(active,0);self.assertEqual(maximum,4)
        self.assertEqual(set(started),set(rows));self.assertEqual(len(started),20);self.assertCountEqual(started,finished)
        self.assertEqual(len(outcome),1);self.assertIsInstance(outcome[0],tuple)
        self.assertEqual(set(outcome[0][2]),set(rows));self.assertEqual(p.metadata_calls,2)
        self.assertFalse(any(t.name.startswith('owned-pss') for t in threading.enumerate()))

    def test_serial_reference_complete_result_matches_for_1_20_60(self):
        import ast
        import subprocess
        old=subprocess.check_output(['git','show','4c901f71ee210f9d400c2caa81b819e5af5e313e:scripts/concurrency/linux-operator/linux-host-sample.py'],cwd=S.ROOT,env={**__import__('os').environ,'DEVELOPER_DIR':'/Library/Developer/CommandLineTools'})
        tree=next(n for n in ast.parse(old).body if isinstance(n,ast.FunctionDef) and n.name=='stable_memory_sample')
        for count in [1,20,60]:
            results=[]
            for serial in [True,False]:
                p,rows,_ctx,sample=fixture(count)
                def read(path,*_args):
                    pid=int(path.parent.name)
                    with p.lock:p.reads.append(pid)
                    return 'Rss: '+str(pid+100)+' kB\nPss: '+str(pid+50)+' kB\n'
                p.ns['read_text']=read
                if serial:exec(compile(ast.Module(body=[tree],type_ignores=[]),'<actual-git-serial>','exec'),p.ns)
                results.append(sample());self.assertCountEqual(p.reads,rows);self.assertEqual(p.metadata_calls,2)
            self.assertEqual(results[0],results[1])

    def controlled(self,count=20):
        p,rows,ctx,sample=fixture(count);release={pid:threading.Event() for pid in list(rows)[:4]};done={pid:threading.Event() for pid in list(rows)[:4]}
        entered=threading.Event();lock=threading.Lock();seen=[];active=0;maximum=0;outcome=[]
        pool=p.ns.get('ThreadPoolExecutor')
        if pool:
            class ObservedPool(pool):
                def submit(self,fn,*args,**kwargs):
                    task=super().submit(fn,*args,**kwargs)
                    if args[0] in done:task.add_done_callback(lambda _f:done[args[0]].set())
                    return task
            p.ns['ThreadPoolExecutor']=ObservedPool
        original=p.ns['metadata']
        def metadata(*args):
            with lock:self.assertEqual(active,0,'PRE_OR_POST_BEFORE_READ_DRAIN')
            return original(*args)
        p.ns['metadata']=metadata
        def record(pid):
            nonlocal active,maximum
            with lock:
                active+=1;maximum=max(maximum,active);seen.append((p.metadata_calls,pid))
                if active==4:entered.set()
        def finished():
            nonlocal active
            with lock:active-=1
        def run():
            try:outcome.append(sample())
            except BaseException as error:outcome.append(error)
        owner=threading.Thread(target=run,name='synthetic-controller')
        def close():
            for event in release.values():event.set()
            owner.join(3);self.assertFalse(owner.is_alive());self.assertEqual(active,0);self.assertLessEqual(maximum,4)
            self.assertFalse(any(t.name.startswith('owned-pss') for t in threading.enumerate()))
        return p,rows,release,done,entered,seen,record,finished,owner,close,outcome

    def test_reverse_failure_completion_keeps_planned_error_and_stops_new_work(self):
        p,rows,release,done,entered,seen,record,finished,owner,close,outcome=self.controlled()
        first=PermissionError(13,'PRIVATE_FIRST');second=ValueError('PRIVATE_SECOND')
        def read(path,*_args):
            pid=int(path.parent.name);record(pid)
            try:
                if pid in release and not release[pid].wait(3):raise AssertionError('FIXTURE_RELEASE')
                if pid==123:raise first
                if pid==200:raise second
                return 'Rss: 100 kB\nPss: 50 kB\n'
            finally:finished()
        p.ns['read_text']=read;owner.start()
        try:
            self.assertTrue(entered.wait(2));release[200].set();self.assertTrue(done[200].wait(2))
            self.assertEqual(len(seen),4);self.assertEqual(p.metadata_calls,1)
        finally:close()
        self.assertIs(outcome[0],first);self.assertEqual(p.ns['failure'](first)['errno'],'EACCES');self.assertEqual(p.metadata_calls,1)

    def test_missing_retry_waits_for_every_original_inflight_read(self):
        p,rows,release,done,entered,seen,record,finished,owner,close,outcome=self.controlled()
        def read(path,*_args):
            pid=int(path.parent.name);attempt=p.metadata_calls;record(pid)
            try:
                if attempt==1 and pid in release and not release[pid].wait(3):raise AssertionError('FIXTURE_RELEASE')
                if attempt==1 and pid==123:raise FileNotFoundError('PRIVATE')
                return 'Rss: 100 kB\nPss: 50 kB\n'
            finally:finished()
        p.ns['read_text']=read;owner.start()
        try:
            self.assertTrue(entered.wait(2));release[123].set();self.assertTrue(done[123].wait(2));self.assertEqual(p.metadata_calls,1);self.assertEqual(len(seen),4)
        finally:close()
        self.assertIsInstance(outcome[0],tuple);self.assertEqual(set(outcome[0][2]),set(rows));self.assertEqual(p.metadata_calls,3)
        self.assertCountEqual([pid for attempt,pid in seen if attempt==2],rows)

    def test_mixed_clock_and_permission_both_orders_keep_first_clock_terminal(self):
        for reason in ['CLOCK_INVALID','WINDOW_EXHAUSTED']:
            for ordinary_first in [True,False]:
                with self.subTest(reason=reason,ordinary_first=ordinary_first):
                    p,rows,release,done,entered,seen,record,finished,owner,close,outcome=self.controlled()
                    local=threading.local();calls=0;at_terminal=[];counter_lock=threading.Lock()
                    def now():
                        nonlocal calls
                        with counter_lock:
                            calls+=1
                            if getattr(local,'after_pid',None)==200:
                                at_terminal.append(calls);return float('nan') if reason=='CLOCK_INVALID' else 2.0
                            return 0.0
                    p.ns['time'].monotonic=now
                    def read(path,*_args):
                        pid=int(path.parent.name);record(pid)
                        try:
                            if pid in release and not release[pid].wait(3):raise AssertionError('FIXTURE_RELEASE')
                            if pid==123:raise PermissionError(1,'PRIVATE')
                            local.after_pid=pid
                            return 'Rss: 100 kB\nPss: 50 kB\n'
                        finally:finished()
                    p.ns['read_text']=read;owner.start()
                    try:
                        self.assertTrue(entered.wait(2));first=123 if ordinary_first else 200;release[first].set();self.assertTrue(done[first].wait(2))
                        second=200 if ordinary_first else 123;release[second].set();self.assertTrue(done[second].wait(2))
                    finally:close()
                    self.assertIsInstance(outcome[0],ValueError);proof=p.ns['failure'](outcome[0]);self.assertEqual(proof['code'],'PROCESS_TREE_INCOMPLETE')
                    self.assertEqual(proof['stability']['stopReason'],reason);self.assertEqual(calls,at_terminal[0])
                    self.assertEqual(proof['stability']['elapsedMs'],None if reason=='CLOCK_INVALID' else 2000)
                    self.assertEqual(p.metadata_calls,1);self.assertEqual(len(seen),4)

    def test_clock_reads_and_validation_share_one_lock_without_false_backwards(self):
        p,rows,_ctx,sample=fixture(20);clock_entered=threading.Event();second_window=threading.Event();release=threading.Event();lock=threading.Lock();ticks=0;first=True;outcome=[]
        def now():
            nonlocal ticks,first
            with lock:at=ticks/1000;ticks+=1;block=first and threading.current_thread().name.startswith('owned-pss');first=first and not block
            if block:
                clock_entered.set()
                if not release.wait(3):raise AssertionError('FIXTURE_RELEASE')
            return at
        p.ns['time'].monotonic=now;original=p.ns['complete_pss'];entries=0
        def group(plan,root,window,*guards):
            def observed():
                nonlocal entries
                with lock:
                    entries+=1
                    if entries==2:second_window.set()
                return window()
            return original(plan,root,observed,*guards)
        p.ns['complete_pss']=group
        def run():
            try:outcome.append(sample())
            except BaseException as error:outcome.append(error)
        owner=threading.Thread(target=run,name='synthetic-controller');owner.start()
        try:self.assertTrue(clock_entered.wait(2));self.assertTrue(second_window.wait(2))
        finally:release.set();owner.join(3)
        self.assertFalse(owner.is_alive());self.assertIsInstance(outcome[0],tuple);self.assertEqual(set(outcome[0][2]),set(rows))

    def test_thread_start_failure_drains_existing_work_and_preserves_error(self):
        from unittest.mock import patch
        p,rows,release,done,entered,seen,record,finished,owner,close,outcome=self.controlled()
        sentinel=RuntimeError('SYNTHETIC_THREAD_START');real_start=threading.Thread.start;number=0;one=threading.Event()
        def start(thread):
            nonlocal number
            if thread.name.startswith('owned-pss'):
                number+=1
                if number==2:raise sentinel
            return real_start(thread)
        def read(path,*_args):
            pid=int(path.parent.name);record(pid);one.set()
            try:
                if pid in release and not release[pid].wait(3):raise AssertionError('FIXTURE_RELEASE')
                return 'Rss: 100 kB\nPss: 50 kB\n'
            finally:finished()
        p.ns['read_text']=read
        with patch.object(threading.Thread,'start',start):
            owner.start()
            try:self.assertTrue(one.wait(2));self.assertTrue(owner.is_alive())
            finally:close()
        self.assertIs(outcome[0],sentinel);self.assertEqual(p.metadata_calls,1);self.assertTrue(set(pid for _,pid in seen)<={123,200})

    def test_worker_parse_failure_is_not_partial_success(self):
        p,_rows,_ctx,sample=fixture(20);sentinel=ValueError('PRIVATE_PARSE');p.ns['parse_smaps_rollup']=lambda _value:(_ for _ in ()).throw(sentinel)
        with self.assertRaises(ValueError) as caught:sample()
        self.assertIs(caught.exception,sentinel);self.assertEqual(p.metadata_calls,1);self.assertNotIn('stability',p.ns['failure'](sentinel))
        self.assertFalse(any(t.name.startswith('owned-pss') for t in threading.enumerate()))

    def test_actual_admission_is_atomic_with_worker_failure_latch(self):
        import types
        p,rows,_ctx,sample=fixture(20);release=threading.Event();raised=threading.Event();done=threading.Event();trace=[];locks=[];sentinel=PermissionError(1,'PRIVATE');read_entered=threading.Event();yielded=False
        class SpyLock:
            def __init__(self):self.real=threading.RLock();self.owner=None;self.depth=0
            def __enter__(self):
                self.real.acquire();self.owner=threading.get_ident();self.depth+=1;return self
            def __exit__(self,*_args):
                nonlocal yielded
                self.depth-=1
                if not self.depth:self.owner=None
                self.real.release()
                if not self.depth and threading.current_thread().name=='MainThread' and trace and not yielded:
                    yielded=True
                    if not read_entered.wait(2):raise AssertionError('FIXTURE_FIRST_READ_ENTERED')
        def lock():value=SpyLock();locks.append(value);return value
        class StopEvent:
            def __init__(self):self.real=threading.Event();self.checks=0
            def is_set(self):
                answer=self.real.is_set()
                if threading.current_thread().name=='MainThread' and not answer:
                    self.checks+=1
                    if self.checks==2:
                        release.set()
                        protected=any(value.owner==threading.get_ident() for value in locks)
                        if not (raised if protected else done).wait(2):raise AssertionError('FIXTURE_FAILURE_BARRIER')
                return answer
            def set(self):
                if not self.real.is_set():trace.append(('LATCH',None))
                self.real.set()
        p.ns['threading']=types.SimpleNamespace(RLock=lock,Event=StopEvent)
        original=p.ns['ThreadPoolExecutor']
        class Pool(original):
            def submit(self,fn,*args,**kwargs):
                trace.append(('ADMIT',args[0]));future=super().submit(fn,*args,**kwargs)
                if args[0]==123:future.add_done_callback(lambda _f:done.set())
                return future
        p.ns['ThreadPoolExecutor']=Pool
        def read(path,*_args):
            if int(path.parent.name)==123:
                read_entered.set()
                if not release.wait(3):raise AssertionError('FIXTURE_RELEASE')
                raised.set();raise sentinel
            return 'Rss: 100 kB\nPss: 50 kB\n'
        p.ns['read_text']=read
        try:
            with self.assertRaises(PermissionError) as caught:sample()
        finally:release.set()
        self.assertIs(caught.exception,sentinel);first=next(i for i,v in enumerate(trace) if v[0]=='LATCH')
        self.assertFalse(any(kind=='ADMIT' for kind,_ in trace[first+1:]),'NEW_ADMISSION_AFTER_FAILURE_LATCH')
        self.assertFalse(any(t.name.startswith('owned-pss') for t in threading.enumerate()))

    def test_thread_start_filenotfound_is_not_a_retryable_smaps_disappearance(self):
        from unittest.mock import patch
        p,_rows,_ctx,sample=fixture(20);sentinel=FileNotFoundError(2,'PRIVATE_START');start=threading.Thread.start;failed=False
        def broken(thread):
            nonlocal failed
            if thread.name.startswith('owned-pss') and not failed:failed=True;raise sentinel
            return start(thread)
        with patch.object(threading.Thread,'start',broken):
            with self.assertRaises(FileNotFoundError) as caught:sample()
        self.assertIs(caught.exception,sentinel);self.assertEqual(p.metadata_calls,1);self.assertEqual(p.sleeps,[])

    def test_scheduler_failure_beats_lower_planned_missing_in_both_orders(self):
        from unittest.mock import patch
        for scheduler_first in [True,False]:
            with self.subTest(scheduler_first=scheduler_first):
                p,_rows,_ctx,sample=fixture(20);release=threading.Event();done=threading.Event();sentinel=FileNotFoundError(2,'PRIVATE_SCHEDULER');low=FileNotFoundError(2,'PRIVATE_READ');start=threading.Thread.start;starts=0
                original=p.ns['ThreadPoolExecutor']
                class Pool(original):
                    def submit(self,fn,*args,**kwargs):
                        f=super().submit(fn,*args,**kwargs)
                        if args[0]==123:f.add_done_callback(lambda _f:done.set())
                        return f
                p.ns['ThreadPoolExecutor']=Pool
                def read(path,*_args):
                    if int(path.parent.name)==123:
                        if not release.wait(3):raise AssertionError('FIXTURE_RELEASE')
                        raise low
                    return 'Rss: 100 kB\nPss: 50 kB\n'
                def broken(thread):
                    nonlocal starts
                    if thread.name.startswith('owned-pss'):
                        starts+=1
                        if starts==2:release.set();raise sentinel
                    return start(thread)
                def wait(*_args,**_kwargs):
                    release.set()
                    if not done.wait(2):raise AssertionError('FIXTURE_READ_DONE')
                    raise sentinel
                p.ns['read_text']=read
                if not scheduler_first:p.ns['wait']=wait
                try:
                    with patch.object(threading.Thread,'start',broken if scheduler_first else start):
                        with self.assertRaises(FileNotFoundError) as caught:sample()
                finally:release.set()
                self.assertIs(caught.exception,sentinel);self.assertEqual(p.metadata_calls,1);self.assertEqual(p.sleeps,[])
                self.assertFalse(any(t.name.startswith('owned-pss') for t in threading.enumerate()))

    def test_scheduler_shutdown_error_still_physically_joins_owned_workers(self):
        p,_rows,_ctx,sample=fixture(20);base=p.ns['ThreadPoolExecutor'];created=[];sentinel=FileNotFoundError(2,'PRIVATE_SHUTDOWN')
        class Pool(base):
            def __init__(self,*args,**kwargs):super().__init__(*args,**kwargs);created.append(self)
            def shutdown(self,*_args,**_kwargs):raise sentinel
        p.ns['ThreadPoolExecutor']=Pool
        try:
            with self.assertRaises(FileNotFoundError) as caught:sample()
            self.assertIs(caught.exception,sentinel);self.assertEqual(p.metadata_calls,1)
            self.assertFalse(any(t.name.startswith('owned-pss') for t in threading.enumerate()),'OWNED_THREADS_NOT_JOINED')
        finally:
            for pool in created:base.shutdown(pool,wait=True)


if __name__=='__main__':unittest.main()
