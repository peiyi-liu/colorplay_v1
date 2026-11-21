"""Actual preparation caller; synthetic Root authority and ordinary file/process ports."""
import contextlib
import errno
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

DIRECTORY=Path(__file__).resolve().parents[2]/'scripts/concurrency'
sys.path[:0]=[str(DIRECTORY/'linux-operator'),str(DIRECTORY)]
def imported(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
M=imported('observed_preparation',DIRECTORY/'linux-operator/prepare-functional-request-observed.py')
B=imported('preparation_bootstrap',DIRECTORY/'linux-local-bootstrap.py')

class PreparationTests(unittest.TestCase):
    def fixture(self,root):
        runtime=root/'whole-site-261115';runtime.mkdir(mode=0o700)
        source=root/'source';source.mkdir();dist=source/'dist';dist.mkdir()
        def write(path,value):
            path.parent.mkdir(parents=True,exist_ok=True)
            raw=value if isinstance(value,bytes) else json.dumps(value).encode()
            path.write_bytes(raw);path.chmod(0o600);return hashlib.sha256(raw).hexdigest()
        revision='a'*40;attempt=runtime/'activation-synthetic';attempt.mkdir(mode=0o700)
        files={'admin-release.json':json.dumps({'environment':'local','revision':revision}).encode(),
               'assets/blooks/fixture-128.webp':b'PUBLIC_SYNTHETIC_IMAGE','assets/fixture.js':b'PUBLIC_SYNTHETIC_JS'}
        for name,raw in files.items():write(dist/name,raw)
        artifact={'sourceRevision':revision,'privateValuesAbsent':True,'files':{k:M.sha(v) for k,v in files.items()}}
        artifact_sha=write(attempt/'build-manifest.json',artifact)
        bundle={'sourceRevision':revision,'artifactSha256':M.sha(files['admin-release.json'])}
        write(runtime/'entry-bundle-proof.json',bundle);write(attempt/'entry-bundle-proof.json',{'measurement':bundle,'buildManifestSha256':artifact_sha})
        profile={'identity':{'databaseIdentitySha256':'b'*64}};profile_sha=write(runtime/'execution-profile.json',profile)
        write(runtime/'execution-profile-helper-closure.json',{})
        write(runtime/'reviewed-candidate.json',{'sourceRevision':revision,'result':'ACCEPTED_FOR_LOCAL_VALIDATION','executionProfileSha256':profile_sha})
        write(runtime/'ownership.json',{'projectId':'cp-whole-site-261115','apiUrl':'http://127.0.0.1:58321','appUrl':'http://127.0.0.1:58373'})
        write(runtime/'status-secret.json',{'API_URL':'http://127.0.0.1:58321','ANON_KEY':'SYNTHETIC_SECRET','SERVICE_ROLE_KEY':'SYNTHETIC_SECRET'})
        write(runtime/'active-preview.json',{'attemptPath':str(attempt),'sourceRevision':revision})
        functions={str(i)+'.ts':M.sha(b'PUBLIC_FUNCTION') for i in range(20)}
        for name in functions:write(source/'supabase/functions'/name,b'PUBLIC_FUNCTION')
        write(runtime/'edge-bind-synthetic/result.json',{'sourceRevision':revision,'sourceScope':'all-functions','result':'LOCAL_EDGE_SOURCE_BOUND','runtimeSourceHashes':functions,'runtimeSourceFileCount':20})
        config=root/'synthetic-daemon.json';write(config,b'{"ip":"127.0.0.1"}')
        write(runtime/'linux-isolation-result.json',{'result':'LOCAL_LOOPBACK_ISOLATED','afterConfigSha256':M.sha(config.read_bytes())})
        for name in ['functional-preflight.py','canonical-baseline.py','media-readback.py','run-functional-owned.py','validate-functional-publication.mjs','root-functional-network-observer.mjs','linux_owned_process.py']:
            write(runtime/name,b'PUBLIC_APPROVED_FIXTURE')
        return runtime,source,config

    @contextlib.contextmanager
    def ports(self,runtime,source,config):
        original=B.bounded;calls=[]
        def process(args,cwd,**options):
            self.assertEqual(args,['/usr/bin/sudo','-n','/usr/bin/python3','-B','-c',B.SYSTEM_READ,'/etc/docker/daemon.json'])
            calls.append('FIXED_ROOT_READ')
            # External process fixture only: no sudo or real /etc read on Mac.
            return original([sys.executable,'-B','-c',B.SYSTEM_READ,str(config)],cwd,**options)
        with patch.object(M,'R',runtime),patch.object(M,'SOURCE',source),patch.object(M,'require_linux'), \
                patch.object(M,'frozen',return_value=True),patch.object(M,'verify_root_snapshot',return_value={}), \
                patch.object(M,'read_text',side_effect=PermissionError(errno.EACCES,'SECRET_FILE_NAME')), \
                patch.object(M.runpy,'run_path',return_value={'NativeIO':B.NativeIO}),patch.object(B,'bounded',side_effect=process), \
                patch.object(sys,'argv',['prepare','a'*40]):
            yield calls

    def test_actual_preparation_uses_fixed_privileged_reader_without_relaxing_hash_or_mode(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime,source,config=self.fixture(Path(folder).resolve())
            before=config.stat();output=io.StringIO()
            with self.ports(runtime,source,config) as calls,contextlib.redirect_stdout(output):M.main()
            self.assertEqual(calls,['FIXED_ROOT_READ'])
            self.assertEqual(config.stat().st_mode&0o777,0o600);self.assertEqual(config.stat().st_ino,before.st_ino)
            self.assertEqual(json.loads(output.getvalue())['result'],'LOCAL_FUNCTIONAL_REQUEST_PREPARED')
            self.assertNotIn('SYNTHETIC_SECRET',output.getvalue());self.assertNotIn('SECRET_FILE_NAME',output.getvalue())

    def test_daemon_hash_drift_still_rejects_before_private_preparation(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime,source,config=self.fixture(Path(folder).resolve());config.write_bytes(b'CHANGED')
            with self.ports(runtime,source,config),self.assertRaisesRegex(AssertionError,'LOOPBACK_CONFIG_CHANGED') as rejected:M.main()
            diagnostic=M.blocked_outcome(rejected.exception)
            self.assertEqual(diagnostic['diagnostic'],{'phase':'DAEMON','operation':'ROOT_READ','errno':'UNKNOWN','pathKind':'DAEMON_CONFIG'})
            self.assertFalse((runtime/'functional-private').exists());self.assertFalse(diagnostic['rawLogsStored'])

    def test_actual_profile_permission_reports_exact_phase_without_filename_or_token(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime,source,config=self.fixture(Path(folder).resolve())
            with self.ports(runtime,source,config) as calls,patch.object(M,'verify_root_snapshot',side_effect=PermissionError(
                    errno.EACCES,'SECRET_TOKEN','/proc/123/SECRET_FILENAME')),self.assertRaises(PermissionError) as rejected:M.main()
            result=M.blocked_outcome(rejected.exception)
            self.assertEqual(result['diagnostic'],{'phase':'PROFILE','operation':'VERIFY_ROOT','errno':'EACCES','pathKind':'PROC'})
            self.assertEqual(calls,[]);self.assertNotIn('SECRET',json.dumps(result));self.assertEqual(result['safeReason'],'UNAVAILABLE')

    def test_errno_and_bad_context_are_closed_enums_and_reader_has_no_target_argument(self):
        for number,expected in [(errno.EPERM,'EPERM'),(errno.ENOENT,'ENOENT'),(errno.EIO,'OTHER'),(None,'UNKNOWN')]:
            with self.subTest(number=number),patch.object(M,'PHASE','SECRET_PHASE'),patch.object(M,'OPERATION','SECRET_OPERATION'),patch.object(M,'PATH_KIND','SECRET_PATH'):
                result=M.blocked_outcome(OSError(number,'SECRET_ERROR','SECRET_FILE'))
                self.assertEqual(result['diagnostic']['errno'],expected);self.assertNotIn('SECRET',json.dumps(result))
        with patch.object(M.runpy,'run_path') as command,self.assertRaises(TypeError):M.read_daemon_config('/tmp/foreign')
        command.assert_not_called()


class DiagnosticBarrierTests(unittest.TestCase):
    def suite(self,flag,prepare_fails=False):
        import types
        from test_linux_local_bootstrap import Fixture
        R=imported('diagnostic_suite',DIRECTORY/'run-linux-local-suite.py');S=R.S
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());f.runtime.mkdir(mode=0o700)
            (f.runtime/'execution-profile.json').write_text(json.dumps({'identity':{'jobSha256':'d'*64}}));(f.runtime/'execution-profile.json').chmod(0o600)
            calls=[];seen_flags=[]
            def stages(name,*_args,**_options):
                calls.append(name);seen_flags.append('COLORPLAY_LOCAL_DIAGNOSTIC_ONLY' in os.environ)
                if name=='functional-prepare' and prepare_fails:raise S.StageRejected(None)
                if name=='consistent-snapshot':
                    nonce=json.loads((f.parent/'requests/bootstrap-input.json').read_bytes())['instanceNonce']
                    snapshot=f.parent/'snapshots'/nonce;snapshot.mkdir(parents=True,mode=0o700)
                    (snapshot/'snapshot-manifest.json').write_bytes(b'{}');(snapshot/'snapshot-manifest.json').chmod(0o600)
                    return {'snapshotDirectory':str(snapshot),'snapshotManifestSha256':S.digest(b'{}')}
                return {'result':'PASS','pinReceiptSha256':'d'*64,'executionProfileSha256':'e'*64,
                    'runId':'wsb-synthetic-abcdef123456','approvalSha256':'f'*64,'plannedLegs':15,'planId':'synthetic'}
            env={**f.environment,'GITHUB_SHA':'a'*40,'GITHUB_REF':'refs/heads/codex/local-capacity-linux-20261116'}
            if flag is not None:env['COLORPLAY_LOCAL_DIAGNOSTIC_ONLY']=flag
            output=io.StringIO();umask=os.umask(0o077);os.umask(umask)
            with patch.object(S,'SOURCE',f.source),patch.object(S,'PARENT',f.parent),patch.object(S,'RUNTIME',f.runtime),patch.object(S,'TOOLS',f.parent/'tools'), \
                    patch.object(S,'module',return_value=types.SimpleNamespace(H=__import__('linux_bootstrap_contracts').H,bounded=lambda *a,**k:(0,b'{"result":"PINNED_LOCAL_TOOLCHAIN_INSTALLED"}'))), \
                    patch.object(S,'stage',side_effect=stages),patch.object(S,'install_psql_adapter'), \
                    patch.object(S,'create_snapshot_plan',return_value=(f.parent/'requests/snapshot-plan.json','e'*64)), \
                    patch.object(S,'export_snapshot',return_value={'cipherSha256':'f'*64,'cipherBytes':10,'fileCount':1,'plaintextBytes':2}), \
                    patch.object(R,'attach_controls'),patch.dict(os.environ,env,clear=True),patch.object(sys,'platform','linux'), \
                    patch.object(R.platform,'machine',return_value='x86_64'),patch.object(sys,'argv',['suite','a'*40]),contextlib.redirect_stdout(output):
                try:
                    try:code=R.main();error=None
                    except ValueError as rejected:code=1;error=rejected
                finally:os.umask(umask)
            return code,output.getvalue(),calls,seen_flags,error

    def test_actual_workflow_does_not_force_diagnostic_only(self):
        workflow=(DIRECTORY.parents[1]/'.github/workflows/local-capacity-linux.yml').read_text()
        self.assertNotIn('COLORPLAY_LOCAL_DIAGNOSTIC_ONLY',workflow)
        self.assertIn('        id: suite\n        run: /usr/bin/python3 -B '
                      '"$GITHUB_WORKSPACE/colorplay-live-recovery/scripts/concurrency/run-linux-local-suite.py" '
                      '"$GITHUB_SHA"\n',workflow)

    def test_diagnostic_flag_stops_before_business_even_when_prepare_succeeds(self):
        code,text,calls,flags,error=self.suite('1')
        self.assertIsNone(error);self.assertEqual(code,1)
        self.assertIn('functional-prepare',calls);self.assertNotIn('functional-run',calls)
        self.assertNotIn('capacity-plan',calls);self.assertFalse(any(flags))
        result=json.loads(text.splitlines()[-1]);self.assertTrue(result['diagnosticOnly'])
        self.assertEqual(result['functional'],'NOT_RUN');self.assertEqual(result['capacityVerdict'],'NOT_VERIFIED')
        self.assertEqual(result['result'],'LOCAL_SUITE_STOPPED')

    def test_prepare_failure_diagnostic_never_admits_business_and_keeps_failure_stage(self):
        code,text,calls,flags,error=self.suite('1',prepare_fails=True)
        self.assertEqual(code,1);self.assertIsNone(error);self.assertFalse(any(flags))
        self.assertNotIn('functional-run',calls);self.assertNotIn('capacity-plan',calls)
        result=json.loads(text.splitlines()[-1]);self.assertEqual(result['failedStage'],'functional-prepare')
        self.assertTrue(result['diagnosticOnly']);self.assertEqual(result['capacityVerdict'],'NOT_VERIFIED')

    def test_missing_flag_preserves_normal_fifteen_leg_flow_and_unknown_flags_stop_before_setup(self):
        code,text,calls,flags,error=self.suite(None)
        self.assertEqual(code,0);self.assertIsNone(error);self.assertFalse(any(flags))
        result=json.loads(text.splitlines()[-1]);self.assertNotIn('diagnosticOnly',result)
        self.assertIn('functional-run',calls);self.assertEqual(len([n for n in calls if n.startswith('capacity-run-')]),15)
        for flag in ['', '0','true',' 1','1\n','SECRET_FLAG']:
            with self.subTest(flag=flag):
                code,text,calls,flags,error=self.suite(flag)
                self.assertEqual(code,1);self.assertEqual(calls,[]);self.assertEqual(text,'')
                self.assertEqual(str(error),'LOCAL_DIAGNOSTIC_FLAG_INVALID')

if __name__=='__main__':unittest.main()
