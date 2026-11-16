"""Fixed vendor log/parser/predicate and real snapshot finalizer; no Native ports."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path[:0]=[str(Path(__file__).resolve().parents[2]/'scripts/concurrency'),str(Path(__file__).parent)]
import local_rest_shutdown as R
from test_snapshot_local_evidence import C,M
from test_local_edge_shutdown import configured_fixture,native_fixture

BASELINE=b'Existing startup and access rows\n'
TERM=b'16/Nov/2026:12:00:00 +0000: Received termination unix signal SIGTERM\n'


def fixed_fixture(folder):
    f,raw,ctx=configured_fixture(Path(folder).resolve());row=next(r for r in f.plan['containers'] if r['role']=='rest')
    row['imageId']=R.IMAGE;next(r for r in f.context['containers'] if r['role']=='rest')['imageId']=R.IMAGE
    ctx=C.canonical(f.context);f.plan['executionContextSha256']=C.digest(ctx);raw=C.canonical(f.plan)
    native=native_fixture(f,raw,ctx)
    before={'Id':row['id'],'Name':R.NAME,'Image':R.IMAGE,'RestartCount':0,'Mounts':[],
        'Config':{'Image':R.TAG,'Cmd':['/bin/postgrest'],'Entrypoint':None},
        'HostConfig':{'RestartPolicy':{'Name':'unless-stopped','MaximumRetryCount':0},'AutoRemove':False},
        'State':{'Running':True,'Pid':123,'ExitCode':0,'Paused':False,'Restarting':False,'Dead':False,'OOMKilled':False,'Error':''}}
    after=copy.deepcopy(before);after['State'].update(Running=False,Pid=0,ExitCode=255)
    stop={'clientClosed':True,'exitCode':0,'subprocessClosure':'VERIFIED','requestedSeconds':89,'effectiveSeconds':89,'elapsedSeconds':0.1}
    expected=R.bindings(*native.edge_policy);top=R.single_process(b'PID PPID COMMAND\n123 1 postgrest\n',123)
    value=R.observation(expected,before,after,top,BASELINE,BASELINE+TERM,stop,0.3)
    evidence={'status':'VERIFIED','receiptSha256':R.sha(R.receipt_bytes(value)),'observation':value,'completionElapsedSeconds':0.4}
    return f,row,native,before,after,evidence,expected


class ParserTests(unittest.TestCase):
    def test_exact_calendar_line_and_unrelated_before_rows(self):
        result=R.log_transition(BASELINE,BASELINE+TERM)
        self.assertEqual(result['result'],'VERIFIED');self.assertEqual(result['newTermCount'],1)
        self.assertEqual(result['beforeRows'],1);self.assertEqual(result['afterRows'],2)
        self.assertNotIn('Existing startup',json.dumps(result));self.assertEqual(R.signal_line(TERM[:-1]),'SIGTERM')
        leap=TERM.replace(b'16/Nov/2026',b'29/Feb/2024');self.assertEqual(R.signal_line(leap[:-1]),'SIGTERM')

    def test_suffix_spoof_fatal_unknown_invalid_date_zone_and_truncation_are_rejected(self):
        variants=[b'',TERM+TERM,TERM+b'unknown\n',TERM.replace(b'SIGTERM',b'SIGINT'),
            b'GET /'+TERM,b'"'+TERM[:-1]+b'"\n',b'prefix '+TERM,
            TERM.replace(b'16/Nov/2026',b'31/Nov/2026'),TERM.replace(b'16/Nov/2026',b'29/Feb/2026'),
            TERM.replace(b'12:00:00',b'24:00:00'),TERM.replace(b'+0000',b'+2400'),TERM.replace(b'+0000',b'+0060'),
            TERM.replace(b'\n',b'\r\n'),TERM.replace(b'SIGTERM',b'SIGTERM\0'),TERM[:-1],
            TERM.replace(b': Received',b'Z: Received'),b'Automatic recovery disabled, exiting.\n',b'unknown\n']
        for suffix in variants:
            with self.subTest(suffix=suffix):
                self.assertNotEqual(R.log_transition(BASELINE,BASELINE+suffix)['result'],'VERIFIED')

    def test_prior_term_rotation_limits_and_unavailable_are_unknown(self):
        for before,after in [(TERM,TERM+TERM),(BASELINE,TERM),(None,BASELINE+TERM),
            (BASELINE,None),(TERM.replace(b'SIGTERM',b'SIGINT'),TERM.replace(b'SIGTERM',b'SIGINT')+TERM),(b'x'*65537+b'\n',b'x'*65537+b'\n'+TERM),(b'x\n'*79,b'x\n'*79+TERM)]:
            with self.subTest(before=type(before).__name__):self.assertEqual(R.log_transition(before,after)['result'],'UNKNOWN')


class PredicateTests(unittest.TestCase):
    def test_current_proof_allows_only_fixed_rest_255_in_actual_finalizer(self):
        with tempfile.TemporaryDirectory() as folder:
            f,row,native,before,after,evidence,expected=fixed_fixture(folder)
            self.assertTrue(R.eligible255(evidence,expected,before,after))
            M.stopped([after],[before],{row['id']:{'restReceipt':evidence}},native.edge_policy)

    def test_mutated_binding_topology_closure_state_or_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            _,_,_,before,after,evidence,expected=fixed_fixture(folder)
            for case in ['scope','image','cmd','pid','restart','oom','error','closure','late','logs','extra','persisted','topology']:
                with self.subTest(case=case):
                    a=copy.deepcopy(after);b=copy.deepcopy(before);proof=copy.deepcopy(evidence);exp=copy.deepcopy(expected)
                    if case=='scope':exp['jobSha256']='f'*64
                    if case=='image':a['Image']='sha256:'+'f'*64
                    if case=='cmd':b['Config']['Cmd']=['sh']
                    if case=='pid':a['State']['Pid']=999
                    if case=='restart':a['RestartCount']=1
                    if case=='oom':a['State']['OOMKilled']=True
                    if case=='error':a['State']['Error']='SYNTHETIC_PRIVATE'
                    value=proof['observation']
                    if case=='closure':value['command']['subprocessClosure']='UNKNOWN'
                    if case=='late':value['elapsedSeconds']=91
                    if case=='logs':value['logs']['newTermCount']=2
                    if case=='extra':value['logs']['raw']='SYNTHETIC_PRIVATE'
                    if case=='persisted':proof['status']='UNATTESTED'
                    if case=='topology':value['topology']['processes']=2
                    proof['receiptSha256']=R.sha(R.receipt_bytes(value))
                    self.assertFalse(R.eligible255(proof,exp,b,a))

    def test_actual_finalizer_requires_independent_scope_and_never_expands_foreign_roles(self):
        with tempfile.TemporaryDirectory() as folder:
            _,row,native,before,after,evidence,expected=fixed_fixture(folder)
            for case in ['none','scope','foreign-role','foreign-image','version','nonclosed','late','completion','nested-secret','same-hash','bool-count']:
                with self.subTest(case=case):
                    b=copy.deepcopy(before);a=copy.deepcopy(after);proof=copy.deepcopy(evidence);scope=native.edge_policy
                    if case=='none':proof=None
                    if case=='scope':scope=None
                    if case=='foreign-role':b['Name']=a['Name']='/supabase_db_cp-whole-site-261115'
                    if case=='foreign-image':b['Image']=a['Image']='sha256:'+'f'*64
                    if case=='version':b['Config']['Image']=a['Config']['Image']='public.ecr.aws/supabase/postgrest:v14.15'
                    if case=='nonclosed':proof['observation']['command']['clientClosed']=False
                    if case=='late':proof['completionElapsedSeconds']=91
                    if case=='completion':proof['completionElapsedSeconds']=True
                    if case=='nested-secret':proof['observation']['bindings']['raw']='SYNTHETIC_SECRET'
                    if case=='same-hash':proof['observation']['logs']['afterSha256']=proof['observation']['logs']['beforeSha256']
                    if case=='bool-count':proof['observation']['logs']['beforeTermCount']=False
                    if proof:proof['receiptSha256']=R.sha(R.receipt_bytes(proof['observation']))
                    with self.assertRaises(C.SnapshotError):M.stopped([a],[b],{row['id']:{'restReceipt':proof}},scope)
            for code in [0,143]:
                a=copy.deepcopy(after);a['State']['ExitCode']=code
                M.stopped([a],[before],{row['id']:{'restReceipt':{'status':'UNATTESTED'}}},(b'invalid','not-approved',b'invalid'))

    def test_single_real_top_pid_and_closed_raw_scope_binding(self):
        with tempfile.TemporaryDirectory() as folder:
            _,_,native,before,_,_,_=fixed_fixture(folder)
            for raw in [b'PID PPID COMMAND\n123 1 other\n',b'PID PPID COMMAND\n123 1 postgrest\n124 123 worker\n',
                        b'PID PPID ARGS\n123 1 postgrest\n',b'PID PPID COMMAND\n0123 1 postgrest\n']:
                with self.subTest(raw=raw),self.assertRaises(ValueError):R.single_process(raw,before['State']['Pid'])
            raw,approval,ctx=native.edge_policy
            for case in ['approval','context','job','nonce','role']:
                with self.subTest(case=case):
                    plan=json.loads(raw);context=json.loads(ctx);pin=approval
                    if case=='approval':pin='f'*64
                    if case=='context':context['sourceRevision']='f'*40
                    if case=='job':context['job']['jobName']='other'
                    if case=='nonce':context['instanceNonce']='a'*32
                    if case=='role':next(r for r in context['containers'] if r['role']=='rest')['imageId']='sha256:'+'f'*64
                    if case!='approval':
                        ctx_raw=C.canonical(context);plan['executionContextSha256']=R.sha(ctx_raw);plan_raw=C.canonical(plan);pin=R.sha(plan_raw)
                    else:plan_raw=raw;ctx_raw=ctx
                    with self.assertRaises(ValueError):R.bindings(plan_raw,pin,ctx_raw)

if __name__=='__main__':unittest.main()
