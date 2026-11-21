"""Actual snapshot state machine with synthetic approved backend/kernel ports."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

DIRECTORY=Path(__file__).resolve().parents[2]/'scripts/concurrency'
sys.path[:0]=[str(DIRECTORY),str(Path(__file__).parent)]
from test_snapshot_local_evidence import Fixture, M, C
from local_snapshot_native import NativeIO, DOCKER

class ShutdownTests(unittest.TestCase):
    def test_timeout_preserves_role_intent_and_no_false_container_stopped_claim(self):
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());f.fail_stage='stop'
            result=f.execute()
            self.assertEqual(result['result'],'FAILED');self.assertEqual(result['code'],'SNAPSHOT_COMMAND_TIMEOUT')
            intent=f.output/'shutdown-0-intent.json';self.assertTrue(intent.is_file())
            self.assertEqual(json.loads(intent.read_bytes())['role'],f.plan['containers'][0]['role'])
            terminal=json.loads((f.output/'shutdown-0-result.json').read_bytes())
            self.assertEqual(terminal['outcome'],'FAILED');self.assertEqual(terminal['containerStopped'],'UNKNOWN')
            self.assertEqual(sum(e.startswith('stop:') for e in f.events),1)
            self.assertFalse((f.output/'snapshot-manifest.json').exists())
            for path in [intent,f.output/'shutdown-0-result.json']:self.assertEqual(path.stat().st_mode&0o777,0o600)


    def test_actual_native_client_timeout_is_bounded_and_distinct_from_running_container(self):
        import subprocess
        import time
        import local_snapshot_native as N
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());native=NativeIO();native.source=f.source;native.runtime=f.runtime;native.deadline=600
            row=f.plan['containers'][0];children=[];arguments=[];original=subprocess.Popen
            def process(args,**options):
                arguments.append(args)
                child=original([sys.executable,'-B','-c','import signal;signal.pause()'],**options)
                children.append(child);return child
            ticks=iter([0,0,0,0,94,94,94,94])
            with patch.object(N.subprocess,'Popen',side_effect=process),patch.object(N.time,'monotonic',side_effect=lambda:next(ticks,94)), \
                    self.assertRaisesRegex(C.SnapshotError,'SNAPSHOT_COMMAND_TIMEOUT'):
                native.stop(row)
            self.assertEqual(arguments,[[*DOCKER,'stop','--timeout','-1',row['id']]])
            self.assertEqual(native.last_stop_command['requestedSeconds'],90)
            self.assertEqual(native.last_stop_command['effectiveSeconds'],90)
            self.assertTrue(native.last_stop_command['clientClosed']);self.assertEqual(native.closure,'VERIFIED')
            self.assertTrue(all(c.poll() is not None for c in children));self.assertEqual(native.deadline,600)
            f.output.mkdir(parents=True,mode=0o700)
            def stopped(_row):
                f.last_stop_command=native.last_stop_command
                raise C.SnapshotError('SNAPSHOT_COMMAND_TIMEOUT')
            f.stop=stopped;f.stop_diagnostics=lambda _row:{'state':{'Running':True}}
            with self.assertRaisesRegex(C.SnapshotError,'SNAPSHOT_COMMAND_TIMEOUT'):M.stop_one(f,row,f.output,0,f.plan['containers'])
            result=json.loads((f.output/'shutdown-0-result.json').read_bytes())
            self.assertFalse(result['containerStopped']);self.assertTrue(result['command']['clientClosed'])
            self.assertEqual(result['command']['effectiveSeconds'],90)

    def test_native_observer_never_operates_on_foreign_or_cancelled_or_no_budget_targets(self):
        import copy
        import time
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());native=NativeIO();native.source=f.source;native.runtime=f.runtime;native.context=f.context
            foreign=copy.deepcopy(f.plan['containers'][0]);foreign['id']='f'*64
            with patch.object(native,'docker') as port,self.assertRaises(C.SnapshotError):native.stop_diagnostics(foreign)
            port.assert_not_called()
            for reason in ['cancel','deadline']:
                native.cancelled=reason=='cancel';native.deadline=time.monotonic()-1 if reason=='deadline' else time.monotonic()+600
                with patch.object(native,'docker') as port,self.assertRaises(C.SnapshotError):native.stop_diagnostics(f.plan['containers'][0])
                port.assert_not_called()
            f.output.mkdir(parents=True,mode=0o700)
            with self.assertRaises(C.SnapshotError):M.stop_one(f,foreign,f.output,0,f.plan['containers'])
            self.assertEqual(list(f.output.iterdir()),[]);self.assertFalse(any(e.startswith('stop:') for e in f.events))

    def test_observer_shapes_hashes_logs_and_topology_do_not_expose_arguments_or_env(self):
        import copy
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());row=next(r for r in f.plan['containers'] if r['role']=='edge_runtime')
            actual=copy.deepcopy(next(r for r in f.backend_rows if r['Id']==row['id']))
            actual['State'].update(Pid=123,Running=True,Paused=False,Dead=False,Restarting=False,Status='running',ExitCode=0)
            actual['Config'].update(StopSignal='SIGTERM',Entrypoint=['sh','-c','SYNTHETIC_PRIVATE_SCRIPT'],Cmd=['SECRET_ARG'],Env=['SECRET_TOKEN'])
            native=NativeIO();native.source=f.source;native.runtime=f.runtime;native.context=f.context;calls=[]
            def docker(*args,**options):
                calls.append((args,options))
                if args[0]=='inspect':return C.canonical([actual])
                if args[0]=='top':return b'PID                 PPID                COMMAND\n123                 1                   sh\n124                 123                 edge-runtime\n'
                return b'SECRET_PROVIDER_TEXT\nshutdown signal received: 15\ndid not able to terminate the workers within 15 seconds'
            with patch.object(native,'docker',side_effect=docker):result=native.stop_diagnostics(row)
            self.assertEqual(result['entrypointKind'],'SHELL');self.assertEqual(len(result['entrypointCmdSha256']),64)
            self.assertEqual(result['topology'],{'processes':2,'pid1Kind':'SHELL','runtimeCount':1,'runtimeParentKind':'SHELL'})
            self.assertEqual(result['signals'],['GRACEFUL_TIMEOUT','SIGTERM_RECEIVED'])
            self.assertNotIn('SECRET',json.dumps(result));self.assertNotIn('SYNTHETIC',json.dumps(result))
            self.assertTrue(all(options['timeout']==2 for _,options in calls));self.assertEqual(calls[-1][1]['maximum'],65536)
            with self.assertRaises(C.SnapshotError):NativeIO.safe_topology({'Titles':['args'],'Processes':[['secret']]},123)
            self.assertEqual(NativeIO.safe_signals(b'no known message, SECRET'),'UNKNOWN')
            self.assertEqual(NativeIO.safe_signals(b'interrupt signal received'),['SIGINT_RECEIVED'])

    def test_diagnostic_unavailability_preserves_original_stop_error_and_exit15_stays_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());f.fail_stage='stop'
            def unavailable(_row):raise PermissionError('SECRET_PROVIDER')
            f.stop_diagnostics=unavailable
            result=f.execute();self.assertEqual(result['code'],'SNAPSHOT_COMMAND_TIMEOUT')
            self.assertNotIn('SECRET',json.dumps(result));self.assertEqual(result['subprocessClosure'],'VERIFIED')
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());original=f.stop
            def stopped(row):
                original(row)
                if row['role']=='auth':next(r for r in f.backend_rows if r['Id']==row['id'])['State']['ExitCode']=15
            f.stop=stopped;result=f.execute()
            self.assertEqual(result['result'],'FAILED');self.assertEqual(result['code'],'SNAPSHOT_STOP_UNKNOWN')
            self.assertFalse((f.output/'snapshot-manifest.json').exists())

    def test_cli_table_is_strict_bounded_and_bad_tables_become_unknown_without_leaking_rows(self):
        import copy
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());row=next(r for r in f.plan['containers'] if r['role']=='edge_runtime')
            actual=copy.deepcopy(next(r for r in f.backend_rows if r['Id']==row['id']))
            actual['State'].update(Pid=123,Running=True,Paused=False,Dead=False,Restarting=False,Status='running',ExitCode=0)
            native=NativeIO();native.source=f.source;native.runtime=f.runtime;native.context=f.context
            bad=[b'', b'PID PPID COMMAND\n', b'PID PPID COMMAND ARGS\n123 1 sh secret\n',
                b'UID PID PPID COMMAND\n1001 123 1 sh\n', b'PID PPID CMD\n123 1 sh\n',
                b'PID PPID COMMAND\n123 1 sh\n123 1 edge-runtime\n', b'PID PPID COMMAND\n00123 1 sh\n',
                b'PID PPID COMMAND\n123 -1 sh\n', b'PID PPID COMMAND\n0 1 sh\n',
                b'PID PPID COMMAND\n2147483648 1 sh\n', b'PID PPID COMMAND\n123 2147483648 sh\n',
                b'PID PPID COMMAND\n124 1 edge-runtime\n', b'PID PPID COMMAND\n123 1 sh SECRET_ARGS\n',
                b'PID PPID COMMAND\n123 1 \xff\n', b'PID PPID COMMAND\n123 1 sh\x00\n',
                b'PID PPID COMMAND\n123 1 '+b'x'*65+b'\n', b'x'*16385,
                b'PID PPID COMMAND\n'+b''.join(str(pid).encode()+b' 1 sh\n' for pid in range(123,188)),
                C.canonical({'Titles':['PID','PPID','COMMAND'],'Processes':[['123','1','sh']]})]
            for text in bad:
                with self.subTest(table=text[:50]):
                    def port(*args,**options):
                        self.assertIn(row['id'],args)
                        if args[0]=='inspect':return C.canonical([actual])
                        if args[0]=='top':
                            self.assertEqual(args,('top',row['id'],'-eo','pid,ppid,comm'))
                            self.assertEqual(options,{'timeout':2,'maximum':16384});return text
                        self.assertEqual(args,('logs','--tail','80',row['id']));return b''
                    with patch.object(native,'docker',side_effect=port):result=native.stop_diagnostics(row)
                    self.assertEqual(result['topology'],'UNKNOWN');self.assertNotIn('SECRET',json.dumps(result))
            good=b'  PID\tPPID   COMMAND\n 123 1 sh\n 124\t123 edge-runtime\n'
            self.assertEqual(NativeIO.safe_topology(good,123),{'processes':2,'pid1Kind':'SHELL','runtimeCount':1,'runtimeParentKind':'SHELL'})
            for pid1 in [True,0,-1,2**31]:
                with self.subTest(pid1=pid1),self.assertRaises(C.SnapshotError):NativeIO.safe_topology(good,pid1)

    def test_verified_edge_sigterm_exit15_can_complete_without_relaxing_other_roles(self):
        from test_local_edge_shutdown import configured_fixture, Kernel, receipt
        import local_edge_shutdown as E
        with tempfile.TemporaryDirectory() as folder:
            f,raw,ctx=configured_fixture(Path(folder).resolve());original=f.stop
            def stopped(row):
                if row['role']=='edge_runtime':
                    f.edge_shutdown_receipt=receipt(raw,ctx,Kernel(f.plan,f.context))
                    f.edge_bindings=E.bindings(raw,E.digest(raw),ctx)
                original(row)
                if row['role']=='edge_runtime':next(r for r in f.backend_rows if r['Id']==row['id'])['State'].update(ExitCode=15,Dead=False)
            f.stop=stopped;f.stop_diagnostics=lambda row:{'state':{'Running':False},'signals':['SIGTERM_RECEIVED']}
            result=f.execute()
            self.assertEqual(result['result'],'LOCAL_SNAPSHOT_CREATED')
            terminal=json.loads((f.output/'shutdown-1-result.json').read_bytes())
            self.assertEqual(terminal['edgeReceipt']['status'],'VERIFIED')

    def test_exit15_requires_current_exact_edge_receipt_and_positive_drain_signal_evidence(self):
        import copy
        import local_edge_shutdown as E
        from test_local_edge_shutdown import configured_fixture, Kernel, receipt
        with tempfile.TemporaryDirectory() as folder:
            f,raw,ctx=configured_fixture(Path(folder).resolve());kernel=Kernel(f.plan,f.context)
            before=copy.deepcopy(next(r for r in f.backend_rows if r['Id']==kernel.edge['id']))
            row=copy.deepcopy(before);row['State'].update(Running=False,Pid=0,ExitCode=15,Dead=False,OOMKilled=False,Error='',Restarting=False)
            evidence={'receipt':receipt(raw,ctx,kernel),'bindings':E.bindings(raw,E.digest(raw),ctx),'diagnostic':{'signals':['SIGTERM_RECEIVED']}}
            M.stopped([row],[before],{row['Id']:evidence})
            cases=['no-receipt','unknown-signal','timeout','interrupted','disabled','unknown-close','unknown-identity','wrong-plan','bad-proof-shape','oom','error','restarting','dead','running','wrong-image','foreign-role']
            for case in cases:
                with self.subTest(case=case):
                    actual=copy.deepcopy(row);original=copy.deepcopy(before);proof=copy.deepcopy(evidence)
                    if case=='no-receipt':proof['receipt']=None
                    if case=='unknown-signal':proof['diagnostic']['signals']='UNKNOWN'
                    if case in ['timeout','interrupted','disabled']:proof['diagnostic']['signals'].append({'timeout':'GRACEFUL_TIMEOUT','interrupted':'DRAIN_INTERRUPTED','disabled':'DRAIN_DISABLED'}[case])
                    if case=='unknown-close':proof['receipt']['helperClosed']='UNKNOWN'
                    if case=='unknown-identity':proof['receipt']['proof']['identity']='UNKNOWN'
                    if case=='wrong-plan':proof['bindings']['approvedPlanSha256']='f'*64
                    if case=='bad-proof-shape':del proof['receipt']['proof']['runtimeIdentitySha256']
                    if case in ['oom','error','restarting','dead','running']:actual['State'][{'oom':'OOMKilled','error':'Error','restarting':'Restarting','dead':'Dead','running':'Running'}[case]]='private' if case=='error' else True
                    if case=='wrong-image':actual['Image']=original['Image']='sha256:'+'f'*64
                    if case=='foreign-role':actual['Name']=original['Name']='/supabase_auth_cp-whole-site-261115'
                    with self.assertRaises(C.SnapshotError):M.stopped([actual],[original],{actual['Id']:proof})

    def test_all_eight_topologies_are_recorded_before_any_stop_with_no_extra_signals(self):
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());calls=[];original=f.stop
            def observe(row):
                calls.append(('observe',row['role']))
                return {'state':{'Running':True},'topology':{'pid1Kind':'SHELL' if row['role'] in {'db','kong','edge_runtime'} else 'OTHER'},'signals':'UNKNOWN'}
            def stopped(row):
                self.assertTrue((f.output/'shutdown-before-census.json').is_file())
                calls.append(('stop',row['role']));original(row)
            f.stop_diagnostics=observe;f.stop=stopped
            result=f.execute();self.assertEqual(result['result'],'LOCAL_SNAPSHOT_CREATED')
            self.assertEqual(calls[:8],[('observe',r['role']) for r in f.plan['containers']])
            self.assertGreaterEqual(next(i for i,event in enumerate(calls) if event[0]=='stop'),8)
            path=f.output/'shutdown-before-census.json';value=json.loads(path.read_bytes())
            self.assertTrue(value['complete']);self.assertEqual(len(value['records']),8)
            self.assertEqual(path.stat().st_mode&0o777,0o600)
            self.assertEqual({r['role'] for r in value['records']},{r['role'] for r in f.plan['containers']})
            self.assertTrue(all(len(r['containerIdSha256'])==64 for r in value['records']))

class ServiceStopFlowTests(unittest.TestCase):
    def flow(self,role,failure=None):
        import local_snapshot_native as N
        import local_edge_shutdown as E
        from test_local_edge_shutdown import configured_fixture,Kernel,service_kernel,native_fixture,inspect_bytes,execute
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        f,raw,ctx=configured_fixture(Path(temporary.name).resolve())
        k=Kernel(f.plan,f.context) if role=='edge_runtime' else service_kernel(f,role)
        raw=C.canonical(f.plan);ctx=C.canonical(f.context);native=native_fixture(f,raw,ctx)
        now=[0];events=[];updated=[role=='edge_runtime'];helper=[False];polls=[0]
        if failure=='intent-exists':C.write_once(f.output/('restart-'+role+'-intent.json'),{'preserved':True})
        def port(args,**options):
            if args[0]=='/usr/bin/sudo':
                events.append('helper');self.assertTrue(updated[0]);self.assertLessEqual(options['timeout'],10)
                result=execute(k,json.loads(options['data']));now[0]+=2;helper[0]=True
                if failure=='helper-close':native.closure='UNKNOWN'
                if failure=='cancel':native.cancelled=True
                if failure=='late':now[0]=91
                return C.canonical(result)
            op=args[3];events.append(op)
            if op=='inspect':
                if helper[0]:
                    polls[0]+=1
                    self.assertEqual(k.events[-2:],[('close',1101),('close',1100)])
                running=not helper[0] or polls[0]==1 or failure=='never-exit'
                value=json.loads(inspect_bytes(k,policy='no' if updated[0] else 'unless-stopped',running=running))
                if updated[0] and not helper[0] and failure=='readback':value[0]['RestartCount']=1
                if helper[0] and failure=='poll-error':raise C.SnapshotError('SYNTHETIC_READ_FAILED')
                if helper[0] and failure=='poll-restart':value[0]['RestartCount']=1
                if helper[0] and failure=='poll-oom':value[0]['State']['OOMKilled']=True
                if helper[0] and failure=='poll-pid':value[0]['State']['Pid']=999
                if helper[0] and failure=='poll-identity':value[0]['Image']='sha256:'+'f'*64
                return C.canonical(value)
            if op=='update':
                self.assertEqual(args,[*DOCKER,'update','--restart=no',k.edge['id']]);self.assertFalse(helper[0])
                path=f.output/('restart-'+role+'-intent.json');self.assertTrue(path.exists());self.assertEqual(path.stat().st_mode&0o777,0o600)
                if failure=='update':raise C.SnapshotError('SYNTHETIC_UPDATE_FAILED')
                updated[0]=True;return b'synthetic'
            self.assertEqual(args,[*DOCKER,'stop','--timeout','-1',k.edge['id']]);self.assertGreaterEqual(polls[0],2)
            self.assertLess(options['timeout'],88);self.assertGreater(options['timeout'],0)
            return b''
        def sleep(seconds):now[0]+=90 if failure=='never-exit' else seconds
        with patch.object(N.time,'monotonic',side_effect=lambda:now[0]),patch.object(N.time,'sleep',side_effect=sleep),patch.object(native,'run',side_effect=port):
            if failure:
                with self.assertRaises((C.SnapshotError,OSError)):native.stop(k.edge)
            else:native.stop(k.edge)
        return f,native,events,k,now[0]

    def test_closed_three_roles_update_before_signal_and_observe_natural_exit_before_stop(self):
        for role in ['edge_runtime','kong','db']:
            with self.subTest(role=role):
                f,native,events,k,elapsed=self.flow(role)
                self.assertEqual(events.count('helper'),1);self.assertEqual(events.count('stop'),1)
                self.assertEqual(events.count('update'),0 if role=='edge_runtime' else 1)
                if role!='edge_runtime':
                    self.assertLess(events.index('update'),events.index('helper'))
                    self.assertEqual(native.service_shutdown_receipts[role]['restartState'],'CONFIRMED_NO_RESTART')
                    self.assertTrue((f.output/('restart-'+role+'-confirmed.json')).exists())
                self.assertEqual(native.service_shutdown_receipts[role]['naturalExit'],'VERIFIED');self.assertLess(elapsed,90)
                self.assertEqual(native.deadline,600);self.assertEqual(native.service_shutdown_receipts[role]['signal']['status'],'VERIFIED')
                self.assertNotIn('pid',json.dumps(native.service_shutdown_receipts[role]))

    def test_other_four_roles_keep_original_stop_only_and_no_restart_intents(self):
        import time
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());native=NativeIO();native.source=f.source;native.runtime=f.runtime;native.deadline=time.monotonic()+600
            for role in ['auth','realtime','storage','inbucket']:
                row=next(r for r in f.plan['containers'] if r['role']==role)
                with patch.object(native,'run',return_value=b'') as run:native.stop(row)
                self.assertEqual(run.call_args.args[0],[*DOCKER,'stop','--timeout','-1',row['id']]);self.assertEqual(run.call_args.kwargs,{'timeout':90})
            self.assertFalse(f.output.exists())

    def test_update_intent_readback_or_late_completion_never_continues_or_retries(self):
        for failure in ['intent-exists','update','readback','helper-close','cancel','late','never-exit','poll-error','poll-restart','poll-oom','poll-pid','poll-identity']:
            with self.subTest(failure=failure):
                f,native,events,k,_=self.flow('db',failure)
                self.assertNotIn('stop',events);self.assertLessEqual(events.count('update'),1);self.assertLessEqual(events.count('helper'),1)
                if failure in ['intent-exists','update','readback']:
                    self.assertNotIn('helper',events);self.assertFalse(any(e[0]=='send' for e in k.events))
                else:
                    record=native.service_shutdown_receipts['db'];self.assertEqual(record['signal']['status'],'UNATTESTED')
                    self.assertEqual(record['signal']['signalState'],'SENT')
                if failure=='intent-exists':self.assertEqual(C.decode((f.output/'restart-db-intent.json').read_bytes()),{'preserved':True})


class RestActualReaderTests(unittest.TestCase):
    def fixture(self,folder):
        from test_local_edge_shutdown import configured_fixture,native_fixture
        f,raw,ctx=configured_fixture(Path(folder).resolve())
        row=next(r for r in f.plan['containers'] if r['role']=='rest')
        row['imageId']='sha256:de2f4d042d5efb5d1362d98c11e5e0773bedc1376bafcdb4ec863fc18d25f52d'
        next(r for r in f.context['containers'] if r['role']=='rest')['imageId']=row['imageId']
        ctx=C.canonical(f.context);f.plan['executionContextSha256']=C.digest(ctx);raw=C.canonical(f.plan)
        native=native_fixture(f,raw,ctx)
        import time
        native.deadline=time.monotonic()+600
        return f,row,native

    def test_actual_reader_observes_adjacent_logs_and_persists_private_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            f,row,native=self.fixture(folder);calls=[];stopped=[False]
            before={'Id':row['id'],'Name':row['name'],'Image':row['imageId'],'RestartCount':0,
                    'Config':{'Image':'public.ecr.aws/supabase/postgrest:v14.14','Cmd':['/bin/postgrest'],'Entrypoint':None},
                    'HostConfig':{'RestartPolicy':{'Name':'unless-stopped','MaximumRetryCount':0},'AutoRemove':False},
                    'State':{'Running':True,'Pid':123,'ExitCode':0,'Paused':False,'Restarting':False,'Dead':False,'OOMKilled':False,'Error':''}}
            baseline=b'Existing startup and access rows\n';term=b'16/Nov/2026:12:00:00 +0000: Received termination unix signal SIGTERM\n'
            def run(args,**options):
                op=args[3];calls.append(op)
                if op=='stop':
                    stopped[0]=True;native.last_stop_command={'clientClosed':True,'exitCode':0,'subprocessClosure':'VERIFIED','requestedSeconds':options['timeout'],'effectiveSeconds':options['timeout'],'elapsedSeconds':0.0};return b''
                native.rest_read_command={'clientClosed':True,'normalCompletion':True,'subprocessClosure':'VERIFIED'}
                if op=='top':return b'PID PPID COMMAND\n123 1 postgrest\n'
                if op=='logs':return baseline+(term if stopped[0] else b'')
                self.assertEqual(op,'inspect');value=json.loads(C.canonical(before))
                if stopped[0]:value['State'].update(Running=False,Pid=0,ExitCode=255)
                return C.canonical([value])
            with patch.object(native,'run',side_effect=run):native.stop(row)
            evidence=getattr(native,'rest_shutdown_receipt',None)
            self.assertIsNotNone(evidence,'actual REST reader did not observe its stop')
            self.assertEqual(evidence['status'],'VERIFIED');self.assertEqual(calls,['inspect','top','logs','stop','inspect','logs'])
            self.assertTrue((f.output/'rest-interruption-receipt.json').exists())
            self.assertEqual((f.output/'rest-interruption-receipt.json').stat().st_mode&0o777,0o600)
            self.assertNotIn('Existing startup',json.dumps(evidence));self.assertNotIn('/bin/postgrest',json.dumps(evidence));self.assertNotIn('Cmd',json.dumps(evidence))


    def test_rest_unavailable_logs_keep_normal_codes_but_unknown_close_cancel_or_identity_stops(self):
        import local_snapshot_native as N
        from test_local_rest_shutdown import fixed_fixture,BASELINE,TERM
        cases=['logs-unavailable','before-unclosed','before-cancel','before-late','top-many','identity',
               'after-identity','after-unclosed','stop-closure','stop-error','persist','persist-late','normal-zero','normal-term']
        for case in cases:
            with self.subTest(case=case),tempfile.TemporaryDirectory() as folder:
                f,row,native,before,after,_,_=fixed_fixture(folder);native.deadline=600;now=[0];calls=[];did_stop=[False]
                if case in ['normal-zero','normal-term']:after['State']['ExitCode']=0 if case=='normal-zero' else 143
                if case=='identity':before['Config']['Cmd']=['sh']
                if case=='after-identity':after['RestartCount']=1
                def run(args,**options):
                    op=args[3];calls.append(op)
                    if op=='stop':
                        self.assertEqual(args,[*DOCKER,'stop','--timeout','-1',row['id']]);self.assertTrue(0<options['timeout']<=90)
                        did_stop[0]=True;native.last_stop_command={'clientClosed':True,'exitCode':0,'subprocessClosure':'VERIFIED','requestedSeconds':options['timeout'],'effectiveSeconds':options['timeout'],'elapsedSeconds':0.1}
                        now[0]+=0.1
                        if case=='stop-closure':native.closure='UNKNOWN'
                        if case=='stop-error':raise C.SnapshotError('SYNTHETIC_STOP_FAILED')
                        return b''
                    native.rest_read_command={'clientClosed':True,'normalCompletion':True,'subprocessClosure':'VERIFIED'}
                    if op=='inspect':return C.canonical([after if did_stop[0] else before])
                    if op=='top':return b'PID PPID COMMAND\n123 1 postgrest\n'+(b'124 123 worker\n' if case=='top-many' else b'')
                    self.assertEqual(args,[*DOCKER,'logs','--tail','80',row['id']]);self.assertEqual(options['maximum'],65536);self.assertLessEqual(options['timeout'],2)
                    if case=='before-unclosed' or (case=='after-unclosed' and did_stop[0]):native.rest_read_command['normalCompletion']=False
                    if case=='before-cancel':native.cancelled=True
                    if case=='before-late':now[0]=91
                    if case in ['logs-unavailable','normal-zero','normal-term']:raise C.SnapshotError('SYNTHETIC_PRIVATE_LOG_UNAVAILABLE')
                    return BASELINE+(TERM if did_stop[0] else b'')
                original_write=C.write_once
                def write(path,value):
                    if path.name=='rest-interruption-receipt.json':
                        if case=='persist':raise PermissionError('SYNTHETIC_PRIVATE_WRITE')
                        result=original_write(path,value)
                        if case=='persist-late':now[0]=91
                        return result
                    return original_write(path,value)
                allowed=case in ['logs-unavailable','persist','normal-zero','normal-term']
                with patch.object(N.time,'monotonic',side_effect=lambda:now[0]),patch.object(native,'run',side_effect=run),patch.object(C,'write_once',side_effect=write):
                    if allowed:native.stop(row)
                    else:
                        with self.assertRaises((C.SnapshotError,ValueError)):native.stop(row)
                self.assertEqual(calls.count('stop'),0 if case in ['before-unclosed','before-cancel','before-late','top-many','identity'] else 1)
                evidence=native.rest_shutdown_receipt;self.assertEqual(evidence['status'],'UNATTESTED');self.assertNotIn('SYNTHETIC_PRIVATE',json.dumps(evidence))
                if case in ['normal-zero','normal-term']:M.stopped([after],[before])
                elif did_stop[0]:
                    with self.assertRaises(C.SnapshotError):M.stopped([after],[before],{row['id']:{'restReceipt':evidence}},native.edge_policy)
                if case=='persist-late':
                    candidate=C.decode((f.output/'rest-interruption-receipt.json').read_bytes())
                    self.assertNotIn('status',candidate);self.assertNotIn('result',candidate);self.assertEqual(candidate['executionAuthority'],'NONE')

    def test_actual_read_client_close_metadata_comes_from_owned_real_subprocess(self):
        import subprocess
        from test_local_rest_shutdown import fixed_fixture
        with tempfile.TemporaryDirectory() as folder:
            f,_,native,_,_,_,_=fixed_fixture(folder);import time;native.deadline=time.monotonic()+600
            actual=subprocess.Popen;children=[]
            def process(args,**options):
                self.assertEqual(args,[*DOCKER,'logs','--tail','80','synthetic-only'])
                child=actual([sys.executable,'-B','-c','print("ordinary synthetic process")'],**options);children.append(child);return child
            native.rest_read_active=True
            with patch.object(subprocess,'Popen',side_effect=process):raw=native.docker('logs','--tail','80','synthetic-only',timeout=2,maximum=65536)
            self.assertEqual(raw,b'ordinary synthetic process\n');self.assertEqual(native.rest_read_command,{'clientClosed':True,'normalCompletion':True,'subprocessClosure':'VERIFIED'})
            self.assertTrue(all(child.poll()==0 for child in children));self.assertEqual(list(f.output.iterdir()),[])

if __name__=='__main__':unittest.main()
