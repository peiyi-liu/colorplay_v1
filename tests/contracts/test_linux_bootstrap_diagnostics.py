"""Actual subprocess pipes and public suite stage: fixed diagnostics, no raw output."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
DIRECTORY=ROOT/'scripts/concurrency'
sys.path.insert(0,str(DIRECTORY))

def load(name):
    spec=importlib.util.spec_from_file_location('diagnostic_'+name.replace('-','_'),DIRECTORY/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

M=load('linux-local-bootstrap')
import linux_suite_support as S
R=load('run-linux-local-suite')
FAILURE={'result':'FAILED','code':'BOOTSTRAP_COMMAND_FAILED','stage':'isolation','executionAuthority':'NONE',
         'retention':'UNVERIFIED','upstreamAutoRemovalPossible':False,'newVolumesMayHaveBeenRemoved':False}

class DiagnosticTests(unittest.TestCase):
    def test_failed_public_stage_remains_rejected_but_carries_safe_outcome(self):
        with tempfile.TemporaryDirectory() as temp:
            parent=Path(temp).resolve();(parent/'requests').mkdir(mode=0o700)
            args=[sys.executable,'-I','-B','-c','import json,sys;print(json.dumps('+repr(FAILURE)+'));sys.exit(7)']
            with patch.object(S,'PARENT',parent),contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(ValueError) as caught:S.stage('bootstrap',args,'LOCAL_LINUX_BACKEND_READY_PENDING_ROOT_PROFILE')
            self.assertEqual(getattr(caught.exception,'bootstrapOutcome',None),
                             {k:FAILURE[k] for k in ['result','code','stage','upstreamAutoRemovalPossible','newVolumesMayHaveBeenRemoved']})
            self.assertTrue((parent/'requests/bootstrap-stdout.jsonl').is_file())

    def test_native_failed_subprocess_records_safe_stderr_not_provider_content(self):
        native=M.NativeIO()
        marker='SYNTHETIC_PRIVATE_DIAGNOSTIC_MARKER'
        args=[sys.executable,'-I','-B','-c','import sys;sys.stderr.write('+repr('permission denied '+marker)+');sys.exit(9)']
        with self.assertRaises(M.C.BootstrapError):native.run(args)
        diagnostic=getattr(native,'command_diagnostic',None)
        self.assertIsInstance(diagnostic,dict)
        self.assertEqual(diagnostic['exitCode'],9)
        self.assertEqual(diagnostic['classification'],'PERMISSION')
        self.assertNotIn(marker,json.dumps(diagnostic))

    def test_dual_pipes_are_drained_together_and_share_one_cap(self):
        script='import os;[(os.write(1,b"o"*2048),os.write(2,b"e"*2048)) for _ in range(50)]'
        argv=[sys.executable,'-I','-B','-c',script]
        code,out,error=M.bounded(argv,ROOT,checked=False,capture_stderr=True,maximum=204800)
        self.assertEqual((code,len(out),len(error)),(0,102400,102400))
        with self.assertRaisesRegex(M.C.BootstrapError,'BOOTSTRAP_OUTPUT_LIMIT'):
            M.bounded(argv,ROOT,checked=False,capture_stderr=True,maximum=150000)
        with self.assertRaisesRegex(M.C.BootstrapError,'BOOTSTRAP_COMMAND_FAILED'):
            M.bounded([sys.executable,'-c','import sys;sys.stderr.write("private");sys.exit(3)'],ROOT,capture_stderr=True)
        self.assertEqual(M.bounded([sys.executable,'-c','print("old")'],ROOT),b'old\n')
        self.assertEqual(M.bounded([sys.executable,'-c','print("old");raise SystemExit(4)'],ROOT,checked=False),(4,b'old\n'))

    def test_timeout_closes_child_and_unknown_stderr_is_not_reported_as_empty(self):
        with tempfile.TemporaryDirectory() as temp:
            pidfile=Path(temp).resolve()/'pid'
            code='import os,time;f=os.open('+repr(str(pidfile))+',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.write(f,str(os.getpid()).encode());os.close(f);time.sleep(30)'
            native=M.NativeIO()
            with self.assertRaisesRegex(M.C.BootstrapError,'BOOTSTRAP_COMMAND_TIMEOUT'):
                native.run([sys.executable,'-I','-B','-c',code],timeout=1.2)
            pid=int(pidfile.read_text())
            with self.assertRaises(ProcessLookupError):os.kill(pid,0)
            self.assertEqual(native.command_diagnostic,{'operation':'UNKNOWN','exitCode':None,
                'stderrBytes':None,'stderrSha256':None,'classification':'UNKNOWN'})

    def test_classification_is_closed_and_never_echoes_provider_text(self):
        examples={'UNKNOWN_FLAG':'unknown flag: --private', 'CONFIG_PARSE':'failed to parse configuration',
            'PERMISSION':'permission denied', 'HEALTH':'unhealthy', 'IMAGE_PULL':'manifest unknown',
            'PORT':'address already in use', 'CONNECTION':'connection refused', 'UNKNOWN':'unclassified provider detail'}
        for expected,text in examples.items():
            with self.subTest(expected=expected):
                self.assertEqual(M.stderr_classification((text+' SYNTHETIC_SECRET').encode()),expected)
        self.assertEqual(M.command_operation(['/usr/bin/docker','--host','unix:///var/run/docker.sock','pull','private-url']),'DOCKER_IMAGE_PULL')
        self.assertEqual(M.command_operation(['/usr/bin/sudo','-n','/usr/bin/python3','-B','-c',M.SYSTEM_READ,'private-path']),'SYSTEM_READ')
        self.assertEqual(M.command_operation(['/private/tool/supabase','start','--workdir','private-path']),'SUPABASE_START')

    def test_sanitizer_rejects_extras_unknown_codes_and_malformed_types(self):
        valid={**FAILURE,'command':{'operation':'SUPABASE_START','exitCode':1,'stderrBytes':0,
            'stderrSha256':S.digest(b''),'classification':'UNKNOWN'},'remainingResources':'UNKNOWN'}
        self.assertIsNotNone(S.safe_bootstrap_outcome(valid))
        for key,value in [('raw',{'token':'SYNTHETIC_SECRET'}),('code','BOOTSTRAP_SYNTHETIC_SECRET'),
                ('code',{}),('stage',{}),('stage','https://outside.invalid'),('remainingResources','ALL_RETAINED'),
                ('upstreamAutoRemovalPossible',1)]:
            with self.subTest(key=key):self.assertIsNone(S.safe_bootstrap_outcome({**valid,key:value}))
        for key,value in [('operation','PRIVATE_COMMAND'),('operation',{}),('exitCode',True),('exitCode',0),
                ('stderrBytes',-1),('stderrSha256','raw-secret'),('classification','PRIVATE_PROVIDER')]:
            with self.subTest(key=key):
                command={**valid['command'],key:value}
                self.assertIsNone(S.safe_bootstrap_outcome({**valid,'command':command}))
        null_command={k:None for k in ['exitCode','stderrBytes','stderrSha256']}
        self.assertIsNotNone(S.safe_bootstrap_outcome({**valid,'command':{'operation':'UNKNOWN',**null_command,'classification':'UNKNOWN'}}))

    def test_known_hardware_subset_survives_failure_without_inventing_absent_facts(self):
        sys.path.insert(0,str(Path(__file__).parent))
        from test_linux_local_bootstrap import Fixture
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());f.facts['logicalCpu']=8
            value=M.bootstrap(f.path,M.C.digest(f.path.read_bytes()),f)
            self.assertEqual(value['code'],'BOOTSTRAP_HARDWARE_UNSUPPORTED')
            self.assertEqual(value['hardware']['logicalCpu'],8)
            self.assertEqual(value['hardware']['affinityCount'],4)
            self.assertNotIn('affinity',value['hardware'])
            self.assertIsNotNone(S.safe_bootstrap_outcome(value))
        native=M.NativeIO()
        early=M.bootstrap(Path('/nonexistent'),'0'*64,native)
        self.assertNotIn('hardware',early)
        self.assertIsNone(M.hardware_diagnostic(None))
        hardware={'distribution':'ubuntu-24.04','logicalCpu':4,'affinityCount':4,'memTotalBytes':16*1024**3,
            'freeDiskBytes':10*1024**3,'cgroupV2':True,'pidfd':True,'pss':True,'psi':True}
        self.assertIsNotNone(S.safe_bootstrap_outcome({**FAILURE,'hardware':hardware}))
        self.assertIsNone(S.safe_bootstrap_outcome({**FAILURE,'hardware':{**hardware,'pidfd':1}}))
        self.assertIsNone(S.safe_bootstrap_outcome({**FAILURE,'hardware':{k:v for k,v in hardware.items() if k!='pss'}}))

    def test_whole_suite_summary_carries_safe_failure_and_still_stops_without_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            parent=Path(temp).resolve();source=parent/'source';source.mkdir();tools=parent/'tools';tools.mkdir(mode=0o700)
            package=source/'scripts/concurrency/linux-operator';package.mkdir(parents=True)
            (package/'package-manifest.json').write_bytes(b'{}')
            S.write(tools/'toolchain.json',{'synthetic':True})
            runtime=parent/'whole-site-261115'
            marker='SYNTHETIC_PRIVATE_DIAGNOSTIC_MARKER'
            native=M.NativeIO()
            try:native.run([sys.executable,'-c','import sys;sys.stderr.write('+repr('unknown flag '+marker)+');sys.exit(2)'])
            except M.C.BootstrapError:pass
            failure={**FAILURE,'command':native.command_diagnostic}
            def dispatch(argv,source_arg,**options):
                setup=any(str(a).endswith('prepare-linux-runner.py') for a in argv)
                value={'result':'PINNED_LOCAL_TOOLCHAIN_INSTALLED'} if setup else failure
                code=0 if setup else 1
                command=[sys.executable,'-I','-B','-c','import json;print(json.dumps('+repr(value)+'));raise SystemExit('+str(code)+')']
                return M.bounded(command,ROOT,**options)
            environment={'GITHUB_SHA':'a'*40,'GITHUB_REPOSITORY':'peiyi-liu/colorplay_v1','GITHUB_RUN_ID':'12345',
                'GITHUB_RUN_ATTEMPT':'1','GITHUB_JOB':'capacity-linux','GITHUB_REF':'refs/heads/codex/local-capacity-linux-20261116'}
            output=io.StringIO()
            previous_umask=os.umask(0o077);os.umask(previous_umask)
            with patch.object(S,'SOURCE',source),patch.object(S,'PARENT',parent),patch.object(S,'TOOLS',tools),\
                    patch.object(S,'RUNTIME',runtime),patch.object(S,'module',return_value=types.SimpleNamespace(bounded=dispatch,H=M.C.H)),\
                    patch.dict(os.environ,environment),patch.object(sys,'argv',['suite','a'*40]),\
                    patch.object(sys,'platform','linux'),patch.object(R.platform,'machine',return_value='x86_64'),\
                    contextlib.redirect_stdout(output):
                try:self.assertEqual(R.main(),1)
                finally:os.umask(previous_umask)
            summary=json.loads(output.getvalue().splitlines()[-1])
            self.assertEqual(summary['result'],'LOCAL_SUITE_STOPPED')
            self.assertEqual(summary['bootstrapOutcome']['command']['classification'],'UNKNOWN_FLAG')
            self.assertEqual(summary['bootstrapOutcome']['stage'],'isolation')
            self.assertEqual(summary['capacityVerdict'],'NOT_VERIFIED')
            self.assertEqual(summary['functional'],'NOT_RUN');self.assertEqual(summary['passedLegs'],0)
            self.assertEqual(summary['snapshot'],'NOT_ADMITTED_NO_BUSINESS_FIXTURES')
            self.assertNotIn(marker,output.getvalue())
            diagnostic=parent/'requests/bootstrap-diagnostic.json'
            self.assertEqual(diagnostic.stat().st_mode&0o777,0o600)
            self.assertEqual(json.loads(diagnostic.read_bytes()),summary['bootstrapOutcome'])

    def test_unknown_stdout_is_not_forwarded_and_failed_private_write_does_not_erase_safe_diagnostic(self):
        with tempfile.TemporaryDirectory() as temp:
            parent=Path(temp).resolve();(parent/'requests').mkdir(mode=0o700)
            raw={**FAILURE,'raw':'SYNTHETIC_SECRET'}
            argv=[sys.executable,'-c','print('+repr(json.dumps(raw))+');raise SystemExit(1)']
            with patch.object(S,'PARENT',parent),contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(S.StageRejected) as caught:S.stage('bootstrap',argv)
            self.assertIsNone(caught.exception.bootstrapOutcome)
            self.assertIn('SYNTHETIC_SECRET',(parent/'requests/bootstrap-stdout.jsonl').read_text())
            argv=[sys.executable,'-c','print('+repr(json.dumps(FAILURE))+');raise SystemExit(1)']
            with patch.object(S,'write',side_effect=OSError('PRIVATE_PATH')),contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(S.StageRejected) as caught:S.stage('bootstrap',argv)
            self.assertEqual(caught.exception.bootstrapOutcome['code'],'BOOTSTRAP_COMMAND_FAILED')

if __name__=='__main__':unittest.main()
