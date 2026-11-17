"""Synthetic external process/kernel ports; real files and M3 stream, not true age."""
import contextlib
import copy
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import tarfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
DIRECTORY=ROOT/'scripts/concurrency'
sys.path.insert(0,str(DIRECTORY));sys.path.insert(0,str(Path(__file__).parent))
import test_export_local_evidence as E
EXPORT=E.EXPORT
from test_linux_local_bootstrap import Fixture
import linux_suite_support as S
spec=importlib.util.spec_from_file_location('prebusiness_bootstrap',DIRECTORY/'linux-local-bootstrap.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
spec=importlib.util.spec_from_file_location('prebusiness_suite',DIRECTORY/'run-linux-local-suite.py')
R=importlib.util.module_from_spec(spec);spec.loader.exec_module(R)

@contextlib.contextmanager
def wired(f,adapter):
    def dispatch(argv,source,**options):
        if any(str(a).endswith('export-local-evidence.py') for a in argv):
            def flag(name):return argv[argv.index('--'+name)+1]
            result=EXPORT.export_evidence(flag('source-root'),flag('manifest'),flag('approve'),flag('output'),adapter=adapter)
            return (0 if result['result']=='CIPHER_CREATED' else 1),(json.dumps(result)+'\n').encode()
        if any(str(a).endswith('prepare-linux-runner.py') for a in argv):
            return 0,b'{"result":"PINNED_LOCAL_TOOLCHAIN_INSTALLED"}\n'
        request=Path(argv[argv.index('--request')+1]);approval=argv[argv.index('--approve')+1]
        M.C.parse_request(request.read_bytes(),approval,os.environ)
        native=M.NativeIO();native.source=f.source;native._authorize_diagnostics(request,approval)
        try:native.run([sys.executable,'-I','-B','-c','import sys;sys.stdout.write("SYNTHETIC_STDOUT_SECRET");sys.stderr.write("SYNTHETIC_STDERR_SECRET");sys.exit(3)'])
        except M.C.BootstrapError:pass
        return 1,(json.dumps({'result':'FAILED','code':'BOOTSTRAP_COMMAND_FAILED','stage':'start',
            'executionAuthority':'NONE','retention':'UNVERIFIED','upstreamAutoRemovalPossible':True,
            'newVolumesMayHaveBeenRemoved':True,'command':native.command_diagnostic})+'\n').encode()
    environment={**f.environment,'GITHUB_SHA':'a'*40,'GITHUB_REF':'refs/heads/codex/local-capacity-linux-20261116'}
    with patch.object(S,'SOURCE',f.source),patch.object(S,'PARENT',f.parent),patch.object(S,'RUNTIME',f.runtime),\
            patch.object(S,'TOOLS',f.parent/'tools'),patch.object(S,'module',return_value=types.SimpleNamespace(C=M.C,bounded=dispatch)),\
            patch.dict(os.environ,environment,clear=True),patch.object(sys,'platform','linux'):
        yield

class PrebusinessTests(unittest.TestCase):
    def export_fixture(self):
        f=E.ExportTests('test_synthetic_stream_contains_exact_manifest_and_allowlisted_files');f.setUp();self.addCleanup(f.tearDown)
        f.manifest.update(schemaVersion=2,purpose='PREBUSINESS_DIAGNOSTIC',executionProfileSha256=None,bootstrapRequestSha256='d'*64)
        f.approval=f.write_manifest();return f

    def test_known_snapshot_plan_failure_exports_requests_not_runtime_or_profile(self):
        f_export=self.export_fixture()
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());requests=f.parent/'requests';requests.mkdir(mode=0o700)
            request=requests/'bootstrap-input.json';M.C.write_once(request,f.path.read_bytes())
            f.runtime.mkdir(mode=0o700)
            markers=['execution-profile.json','execution-context.json','reviewed-candidate.json','runtime-secret.json']
            for name in markers:M.C.write_once(f.runtime/name,b'SYNTHETIC_RUNTIME_SECRET')
            M.C.write_once(requests/'edge-source-bind-stdout.jsonl',b'{"result":"LOCAL_EDGE_SOURCE_BOUND"}\n')
            (f.source/'scripts/concurrency/local-export-recipient.json').write_text(json.dumps(
                {'schemaVersion':1,'recipient':f_export.manifest['recipient'],'privateIdentityUploaded':False}))
            summary={'failedStage':'snapshot-plan','functional':'NOT_RUN','passedLegs':0,'capacityVerdict':'NOT_VERIFIED'}
            with wired(f,f_export.adapter()),contextlib.redirect_stdout(io.StringIO()):
                result=S.export_prebusiness_diagnostic('a'*40,request,S.digest(request.read_bytes()),summary)
            self.assertEqual(result['captureCompleteness'],'PREBUSINESS_DIAGNOSTIC_ONLY')
            self.assertIsNone(result['executionProfileSha256']);self.assertEqual(result['executionAuthority'],'NONE')
            self.assertEqual(result['uncaptured'],['RUNTIME','EXECUTION_PROFILE','DATABASES','VOLUMES'])
            with tarfile.open(fileobj=io.BytesIO(gzip.decompress((f.parent/'exports/evidence.age').read_bytes()))) as tar:
                names=tar.getnames()
                self.assertTrue(all(n.startswith('requests/') or n in ['diagnostic-scope.json','_colorplay/export-manifest.json'] for n in names))
                self.assertEqual(tar.extractfile('requests/bootstrap-input.json').read(),request.read_bytes())
                scope=json.loads(tar.extractfile('diagnostic-scope.json').read())
                self.assertEqual(scope['failedStage'],'snapshot-plan');self.assertFalse(scope['profileAttested'])
                self.assertNotIn(b'SYNTHETIC_RUNTIME_SECRET',b''.join(tar.extractfile(n).read() for n in names))
            for name in markers:self.assertEqual((f.runtime/name).read_bytes(),b'SYNTHETIC_RUNTIME_SECRET')

    def test_later_closed_phases_accept_private_markers_without_reading_their_contents(self):
        for phase in ['profile-pin','kernel-calibration','build-and-preview','entry-bundle','edge-source-bind','snapshot-plan']:
            with self.subTest(phase=phase),tempfile.TemporaryDirectory() as temp:
                runtime=Path(temp).resolve();S.write(runtime/'execution-profile.json',b'SYNTHETIC_UNPARSED_SECRET')
                with patch.object(S,'RUNTIME',runtime),patch.object(sys,'platform','linux'), \
                        patch.object(S,'private',side_effect=AssertionError('MARKER_CONTENT_MUST_NOT_BE_READ')):
                    state=S.prebusiness_state({'failedStage':phase,'functional':'NOT_RUN','passedLegs':0,'capacityVerdict':'NOT_VERIFIED'})
                self.assertEqual(state[0],phase);self.assertEqual(len(state[1]),1)

    def test_unknown_business_phase_boolean_legs_and_unsafe_markers_reject_before_output(self):
        cases=[('phase',None),('phase','toolchain'),('phase','functional-prepare'),('phase','functional-run'),
            ('phase','capacity-plan'),('phase','capacity-run-0'),('phase','consistent-snapshot'),('phase','encrypt-evidence'),
            ('phase',[]),('legs',False),('marker','functional-private'),('marker','capacity-journals'),
            ('marker-link','execution-profile.json'),('marker-link','functional-private'),
            ('marker-mode','execution-context.json'),('marker-hardlink','reviewed-candidate.json')]
        for case,value in cases:
            with self.subTest(case=case,value=value),tempfile.TemporaryDirectory() as temp:
                f=Fixture(Path(temp).resolve());request=f.parent/'requests/bootstrap-input.json';request.parent.mkdir(mode=0o700)
                M.C.write_once(request,f.path.read_bytes());f.runtime.mkdir(mode=0o700)
                summary={'failedStage':'snapshot-plan','functional':'NOT_RUN','passedLegs':0,'capacityVerdict':'NOT_VERIFIED'}
                if case=='phase':summary['failedStage']=value
                elif case=='legs':summary['passedLegs']=value
                elif case=='marker':(f.runtime/value).mkdir(mode=0o700)
                elif case=='marker-link':(f.runtime/value).symlink_to(f.runtime/'nonexistent')
                elif case=='marker-mode':(f.runtime/value).write_bytes(b'{}');(f.runtime/value).chmod(0o644)
                elif case=='marker-hardlink':S.write(f.runtime/'original',b'{}');os.link(f.runtime/'original',f.runtime/value)
                with wired(f,None),self.assertRaises(ValueError):
                    S.export_prebusiness_diagnostic('a'*40,request,S.digest(request.read_bytes()),summary)
                self.assertFalse((f.parent/'prebusiness-diagnostic').exists())

    def test_snapshot_plan_failure_is_labeled_and_exports_without_admitting_business(self):
        f_export=self.export_fixture()
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());f.runtime.mkdir(mode=0o700)
            (f.source/'scripts/concurrency/local-export-recipient.json').write_text(json.dumps(
                {'schemaVersion':1,'recipient':f_export.manifest['recipient'],'privateIdentityUploaded':False}))
            actual_stage=S.stage;calls=[]
            def stages(name,argv,expected=None,**options):
                calls.append(name)
                if name=='encrypt-prebusiness-diagnostic':return actual_stage(name,argv,expected,**options)
                return {'result':expected,'pinReceiptSha256':'d'*64,'executionProfileSha256':'e'*64}
            output=io.StringIO();umask=os.umask(0o077);os.umask(umask)
            with wired(f,f_export.adapter()),patch.object(S,'stage',side_effect=stages), \
                    patch.object(S,'install_psql_adapter'),patch.object(S,'create_snapshot_plan',side_effect=ValueError('synthetic secret must not escape')), \
                    patch.object(sys,'argv',['suite','a'*40]),patch.object(R.platform,'machine',return_value='x86_64'), \
                    contextlib.redirect_stdout(output):
                try:self.assertEqual(R.main(),1)
                finally:os.umask(umask)
            result=json.loads(output.getvalue().splitlines()[-1])
            self.assertEqual(result['failedStage'],'snapshot-plan');self.assertEqual(result['functional'],'NOT_RUN')
            self.assertEqual(result['result'],'LOCAL_SUITE_STOPPED');self.assertEqual(result['passedLegs'],0)
            self.assertEqual(result['safeReason'],'LOCAL_SUITE_IO_UNAVAILABLE')
            self.assertEqual(result['prebusinessDiagnostic']['failedStage'],'snapshot-plan')
            self.assertNotIn('functional-prepare',calls);self.assertNotIn('synthetic secret',output.getvalue())

    def test_schema2_exports_without_fake_profile_and_without_changing_v1_result(self):
        f=self.export_fixture();result=f.run_export()
        self.assertEqual(result['result'],'CIPHER_CREATED')
        self.assertIsNone(result['executionProfileSha256'])
        self.assertEqual(result['purpose'],'PREBUSINESS_DIAGNOSTIC')
        self.assertEqual(result['executionAuthority'],'NONE')
        self.assertEqual(result['retention'],'UNVERIFIED')
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(f.output.read_bytes()))) as tar:
            self.assertEqual(json.loads(tar.extractfile('_colorplay/export-manifest.json').read()),f.manifest)
            self.assertEqual(tar.extractfile('data.bin').read(),f.payload)
        f.manifest.update(schemaVersion=1,executionProfileSha256='b'*64)
        del f.manifest['purpose'];del f.manifest['bootstrapRequestSha256']
        f.approval=f.write_manifest();f.output=f.root/'legacy.age'
        legacy=f.run_export();self.assertEqual(legacy['result'],'CIPHER_ARCHIVE_CREATED')
        self.assertNotIn('executionAuthority',legacy);self.assertNotIn('purpose',legacy)

    def test_actual_bootstrap_failure_saves_first_private_raw_after_admission(self):
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());requests=f.parent/'requests';requests.mkdir(mode=0o700)
            request=requests/'bootstrap-input.json';M.C.write_once(request,f.path.read_bytes())
            native=M.NativeIO();native.source=f.source;native.environment=f.environment;native.platform='linux'
            native.bootstrap_observer=None  # External fake: no Docker observer or native proof.
            for name in ['hardware','system_exists','system_read','system_write','system_identity','jwks']:setattr(native,name,getattr(f,name))
            original=M.bounded
            def process(args,source,**options):
                return original([sys.executable,'-I','-B','-c','import sys;sys.stdout.write("SYNTHETIC_STDOUT_SECRET");sys.stderr.write("SYNTHETIC_STDERR_SECRET");sys.exit(7)'],source,**options)
            def run(args,**options):
                if args[0]==f.tools['supabase']['path'] and args[1]=='start' and '--help' not in args:return M.NativeIO.run(native,args,**options)
                return f.run(args,**options)
            native.run=run
            with patch.object(M,'bounded',side_effect=process),patch.object(sys,'platform','linux'), \
                    patch.object(M.H,'bind',return_value='SYNTHETIC_AUTHORITY_NOT_NATIVE'):
                result=M.bootstrap(request,M.C.digest(request.read_bytes()),native)
            self.assertEqual(result['result'],'FAILED')
            self.assertEqual((requests/'bootstrap-command-stdout.bin').read_bytes(),b'SYNTHETIC_STDOUT_SECRET')
            self.assertEqual((requests/'bootstrap-command-stderr.bin').read_bytes(),b'SYNTHETIC_STDERR_SECRET')
            self.assertNotIn('SYNTHETIC_STDERR_SECRET',json.dumps(result))
            metadata=json.loads((requests/'bootstrap-command-raw.json').read_bytes())
            self.assertTrue(metadata['complete']);self.assertEqual(metadata['status'],'SAVED')
            self.assertEqual(metadata['bootstrapRequestSha256'],M.C.digest(request.read_bytes()))
            for p in requests.iterdir():self.assertEqual(p.stat().st_mode&0o777,0o600)
            first=(requests/'bootstrap-command-stderr.bin').read_bytes()
            with self.assertRaises(M.C.BootstrapError):M.NativeIO.run(native,[sys.executable,'-c','import sys;sys.stderr.write("LATER");sys.exit(8)'])
            self.assertEqual((requests/'bootstrap-command-stderr.bin').read_bytes(),first)

    def test_schema2_strict_null_purpose_hash_and_limits_reject_before_spawn(self):
        f=self.export_fixture();original=copy.deepcopy(f.manifest)
        cases=[('executionProfileSha256','b'*64),('bootstrapRequestSha256',None),('jobSha256','bad'),
            ('purpose','FULL_BACKUP'),('environment','hosted'),('schemaVersion',True),('extra','SYNTHETIC_SECRET')]
        for key,value in cases:
            with self.subTest(key=key):
                f.manifest={**original,key:value};f.approval=f.write_manifest()
                self.assertEqual(f.run_export()['result'],'UNVERIFIED');self.assertFalse(f.output.exists())
        f.manifest=copy.deepcopy(original);f.manifest['files'][0]['bytes']=2*1024**3+1;f.approval=f.write_manifest()
        self.assertEqual(f.run_export()['result'],'UNVERIFIED');self.assertEqual(f.commands,[])
        f.manifest=original;f.approval=f.write_manifest()
        with patch.object(EXPORT,'CIPHER_LIMIT',10):self.assertEqual(f.run_export()['result'],'UNVERIFIED')
        self.assertTrue(f.output.exists());self.assertTrue(all(c.poll() is not None for c in f.children))

    def test_unadmitted_native_and_darwin_never_write_raw(self):
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());native=M.NativeIO();native.source=f.source
            with self.assertRaises(M.C.BootstrapError):
                native.run([sys.executable,'-c','import sys;sys.stderr.write("secret");sys.exit(1)'])
            self.assertFalse((f.parent/'requests').exists())
            with patch.object(sys,'platform','darwin'):native._authorize_diagnostics(f.path,'a'*64)
            self.assertIsNone(native._raw_root)

    def test_incomplete_failed_command_records_unknown_and_does_not_replace_with_inventory(self):
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());requests=f.parent/'requests';requests.mkdir(mode=0o700)
            request=requests/'bootstrap-input.json';M.C.write_once(request,f.path.read_bytes())
            native=M.NativeIO();native.source=f.source
            with patch.object(sys,'platform','linux'):native._authorize_diagnostics(request,M.C.digest(request.read_bytes()))
            with self.assertRaises(M.C.BootstrapError):native.run([sys.executable,'-c','import time;time.sleep(5)'],timeout=1.2)
            metadata=json.loads((requests/'bootstrap-command-raw.json').read_bytes())
            self.assertEqual(metadata['status'],'UNKNOWN');self.assertIsNone(metadata['stderrBytes'])
            self.assertFalse((requests/'bootstrap-command-stderr.bin').exists())
            with self.assertRaises(M.C.BootstrapError):native.run([sys.executable,'-c','raise SystemExit(2)'])
            self.assertEqual(json.loads((requests/'bootstrap-command-raw.json').read_bytes()),metadata)

    def test_root_full_main_exports_diagnostic_but_remains_stopped(self):
        f_export=self.export_fixture()
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());public=f.source/'scripts/concurrency/local-export-recipient.json'
            public.write_text(json.dumps({'schemaVersion':1,'recipient':f_export.manifest['recipient'],'privateIdentityUploaded':False}))
            output=io.StringIO();umask=os.umask(0o077);os.umask(umask)
            with wired(f,f_export.adapter()),patch.object(sys,'argv',['suite','a'*40]),\
                    patch.object(R.platform,'machine',return_value='x86_64'),contextlib.redirect_stdout(output):
                try:self.assertEqual(R.main(),1)
                finally:os.umask(umask)
            summary=json.loads(output.getvalue().splitlines()[-1]);diagnostic=summary['prebusinessDiagnostic']
            self.assertEqual(summary['result'],'LOCAL_SUITE_STOPPED');self.assertEqual(summary['functional'],'NOT_RUN')
            self.assertEqual(summary['passedLegs'],0);self.assertEqual(summary['capacityVerdict'],'NOT_VERIFIED')
            self.assertEqual(diagnostic['captureCompleteness'],'PREBUSINESS_DIAGNOSTIC_ONLY')
            self.assertEqual(diagnostic['executionAuthority'],'NONE');self.assertEqual(diagnostic['rawCapture'],'SAVED')
            self.assertIsNone(diagnostic['executionProfileSha256']);self.assertEqual(diagnostic['retention'],'UNVERIFIED')
            self.assertNotIn('SYNTHETIC_STDERR_SECRET',output.getvalue())
            self.assertFalse((f.runtime/'execution-profile.json').exists())
            self.assertTrue((f.parent/'exports/export-complete.json').is_file())
            with tarfile.open(fileobj=io.BytesIO(gzip.decompress((f.parent/'exports/evidence.age').read_bytes()))) as tar:
                self.assertEqual(tar.extractfile('requests/bootstrap-command-stderr.bin').read(),b'SYNTHETIC_STDERR_SECRET')
                manifest=json.loads(tar.extractfile('_colorplay/export-manifest.json').read())
                self.assertEqual(manifest['schemaVersion'],2);self.assertIsNone(manifest['executionProfileSha256'])
                for row in manifest['files']:
                    body=tar.extractfile(row['path']).read();self.assertEqual(S.digest(body),row['sha256']);self.assertEqual(len(body),row['bytes'])

    def test_no_request_or_existing_profile_or_started_business_never_admits_v2(self):
        f_export=self.export_fixture()
        for case in ['missing-request','wrong-approval','profile','functional','legs']:
            with self.subTest(case=case),tempfile.TemporaryDirectory() as temp:
                f=Fixture(Path(temp).resolve());request=f.parent/'requests/bootstrap-input.json';request.parent.mkdir(mode=0o700)
                M.C.write_once(request,f.path.read_bytes());sha=S.digest(request.read_bytes())
                summary={'failedStage':'bootstrap','functional':'NOT_RUN','passedLegs':0,'capacityVerdict':'NOT_VERIFIED'}
                if case=='missing-request':request.unlink()
                if case=='profile':f.runtime.mkdir(mode=0o700);M.C.write_once(f.runtime/'execution-profile.json',{})
                if case=='functional':summary['functional']='PASS'
                if case=='legs':summary['passedLegs']=1
                if case=='wrong-approval':sha='0'*64
                with wired(f,f_export.adapter()),self.assertRaises(Exception):S.export_prebusiness_diagnostic('a'*40,request,sha,summary)
                self.assertFalse((f.parent/'prebusiness-diagnostic').exists());self.assertFalse((f.parent/'exports').exists())

    def test_schema2_cli_exits_success_only_after_actual_exporter_closes(self):
        f=self.export_fixture();args=['--source-root',str(f.source),'--manifest',str(f.manifest_path),'--approve',f.approval,'--output',str(f.output)]
        out=io.StringIO()
        with patch.object(EXPORT.sys,'platform','linux'),patch.object(EXPORT,'native_age',f.adapter()),contextlib.redirect_stdout(out):
            self.assertEqual(EXPORT.main(args),0)
        self.assertTrue(json.loads(out.getvalue())['ownedProcessClosed'])
        bad={'result':'CIPHER_CREATED','purpose':'FULL_BACKUP','executionProfileSha256':None}
        with patch.object(EXPORT,'export_evidence',return_value=bad),contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(EXPORT.main(args),1)

    def test_encryption_failure_keeps_partial_cipher_without_marker_or_retry(self):
        f_export=self.export_fixture()
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());folder=f.parent/'requests';folder.mkdir(mode=0o700)
            request=folder/'bootstrap-input.json';M.C.write_once(request,f.path.read_bytes())
            public=f.source/'scripts/concurrency/local-export-recipient.json'
            public.write_text(json.dumps({'schemaVersion':1,'recipient':f_export.manifest['recipient'],'privateIdentityUploaded':False}))
            summary={'failedStage':'bootstrap','functional':'NOT_RUN','passedLegs':0,'capacityVerdict':'NOT_VERIFIED'}
            with wired(f,f_export.adapter('raise SystemExit(7)')),contextlib.redirect_stdout(io.StringIO()):
                for _ in range(2):
                    with self.assertRaises(ValueError):S.export_prebusiness_diagnostic('a'*40,request,S.digest(request.read_bytes()),summary)
            self.assertEqual(len(f_export.children),1)
            self.assertTrue((f.parent/'exports/evidence.age').exists())
            self.assertFalse((f.parent/'exports/export-complete.json').exists())
            self.assertTrue((f.parent/'prebusiness-diagnostic/requests/bootstrap-input.json').exists())

    def test_profile_appearing_during_encryption_cannot_publish_no_profile_marker(self):
        f_export=self.export_fixture()
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());folder=f.parent/'requests';folder.mkdir(mode=0o700)
            request=folder/'bootstrap-input.json';M.C.write_once(request,f.path.read_bytes())
            (f.source/'scripts/concurrency/local-export-recipient.json').write_text(json.dumps(
                {'schemaVersion':1,'recipient':f_export.manifest['recipient'],'privateIdentityUploaded':False}))
            script='import os,sys;data=sys.stdin.buffer.read();os.mkdir('+repr(str(f.runtime))+',0o700);f=os.open('+repr(str(f.runtime/'execution-profile.json'))+',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.write(f,b"{}");os.close(f);sys.stdout.buffer.write(data)'
            with wired(f,f_export.adapter(script)),contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(ValueError,'PREBUSINESS_EXPORT_UNVERIFIED'):
                    S.export_prebusiness_diagnostic('a'*40,request,S.digest(request.read_bytes()),
                        {'failedStage':'bootstrap','functional':'NOT_RUN','passedLegs':0,'capacityVerdict':'NOT_VERIFIED'})
            self.assertTrue((f.parent/'exports/evidence.age').is_file())
            self.assertFalse((f.parent/'exports/export-complete.json').exists())

if __name__=='__main__':unittest.main()
