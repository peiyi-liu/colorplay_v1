"""Synthetic public FS/process ports only; never a real cgroup or child migration."""
import contextlib
import copy
import errno
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

ROOT=Path(__file__).resolve().parents[2];DIRECTORY=ROOT/'scripts/concurrency';OPERATOR=DIRECTORY/'linux-operator'
sys.path.insert(0,str(DIRECTORY));sys.path.insert(0,str(OPERATOR))
import linux_suite_support as S
spec=importlib.util.spec_from_file_location('kernel_diagnostic',OPERATOR/'calibrate-linux-runtime.py');K=importlib.util.module_from_spec(spec);spec.loader.exec_module(K)


def permissions():
    def row(root):return {'pathSha256':'b'*64,'hierarchyRoot':root,'procsUid':0,'procsGid':0,'procsMode':0o644,'effectiveWritable':False}
    return {'uid':1001,'euid':1001,'namespaceInode':123,'source':row(False),'destination':row(False),'commonAncestor':row(True)}

class KernelDiagnosticsTests(unittest.TestCase):
    def test_real_filesystem_metadata_port_hashes_paths_without_reading_foreign_pids(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve()
            for relative in ['', 'runner/job','generator/workload']:
                path=root/relative;path.mkdir(parents=True,exist_ok=True)
                (path/'cgroup.procs').write_text('PRIVATE_FOREIGN_PID_MARKER')
            real_stat=os.stat
            def stat_port(path,**options):
                return types.SimpleNamespace(st_ino=123) if str(path)=='/proc/self/ns/cgroup' else real_stat(path,**options)
            with patch.object(K,'CGROOT',root),patch.object(K,'proc_cgroup',return_value='/runner/job'),\
                    patch.object(K.os,'stat',side_effect=stat_port),patch.object(K.os,'access',return_value=False):
                result=K.kernel_permission_snapshot({'generatorCgroupRelativePath':'/generator/workload'})
            self.assertTrue(result['commonAncestor']['hierarchyRoot']);self.assertFalse(result['destination']['effectiveWritable'])
            self.assertNotIn('/runner/job',json.dumps(result));self.assertNotIn('PRIVATE_FOREIGN_PID_MARKER',json.dumps(result))
            K.PERMISSIONS=result;K.PHASE='NATIVE_BROWSER'
            outcome=K.blocked_outcome(PermissionError(errno.EACCES,'PRIVATE_ERROR_MARKER'))
            self.assertIsNotNone(S.safe_kernel_outcome(outcome));self.assertNotIn('PRIVATE_ERROR_MARKER',json.dumps(outcome))

    def test_single_original_run_child_error_keeps_errno_and_unknown_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Path(folder).resolve()/'whole-site-261115';runtime.mkdir(mode=0o700)
            profile={'schemaVersion':1,'kind':'LINUX_FREE_4CPU_16G_V1','observed':True}
            pin={'sourceRevision':'a'*40,'result':'LOCAL_PROFILE_PINNED_PENDING_CALIBRATION','bootstrapRequestSha256':'b'*64,'executionProfileSha256':'c'*64,'helperClosureSha256':'d'*64}
            pinner=types.SimpleNamespace(approved_inputs=lambda *_:None,write_once=lambda p,v:p.write_text(json.dumps(v)))
            def private(path,*_):return (pin,'e'*64) if path.name=='profile-pin-receipt.json' else (profile,'c'*64)
            with patch.object(K,'RUNTIME',runtime),patch.object(K,'require_linux'),patch.object(K,'private_json',side_effect=private),\
                    patch.object(K,'load_pinner',return_value=pinner),patch.object(K,'context',return_value={'binaries':{'node':{'path':'/synthetic/node'}}}),\
                    patch.object(K,'observe_profile',return_value={'observed':True}),patch.object(K,'kernel_permission_snapshot',return_value=permissions()),\
                    patch.object(K,'run_child',side_effect=PermissionError(errno.EACCES,'SECRET_MARKER')) as child,\
                    patch.object(sys,'argv',['calibration','a'*40,'e'*64]):
                with self.assertRaises(PermissionError) as rejected:K.main()
            child.assert_called_once()
            outcome=K.blocked_outcome(rejected.exception)
            self.assertEqual(outcome['kernelOutcome']['phase'],'NATIVE_BROWSER')
            self.assertEqual(outcome['kernelOutcome']['errno'],'EACCES')
            self.assertEqual(outcome['kernelOutcome']['cleanup'],'UNKNOWN')
            self.assertFalse((runtime/'kernel-calibration.json').exists())
            self.assertFalse((runtime/'reviewed-candidate.json').exists())
            self.assertNotIn('SECRET_MARKER',json.dumps(outcome))

    def test_parent_stage_preserves_only_strict_kernel_outcome_and_rejects_extras(self):
        K.PHASE='NATIVE_BROWSER';K.PERMISSIONS=permissions();outcome=K.blocked_outcome(OSError(errno.EACCES,'SECRET_MARKER'))
        with tempfile.TemporaryDirectory() as folder:
            parent=Path(folder).resolve();(parent/'requests').mkdir(mode=0o700)
            fake=types.SimpleNamespace(bounded=lambda *_args,**_options:(1,json.dumps(outcome).encode()))
            authority=types.SimpleNamespace(prepare_stage=lambda name,argv,timeout,*_:timeout)
            with patch.object(S,'PARENT',parent),patch.object(S,'module',side_effect=lambda name:authority if name=='linux_attach_authority' else fake),contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(S.StageRejected) as rejected:S.stage('kernel-calibration',['/usr/bin/python3','-B',str(S.RUNTIME/'calibrate-linux-runtime.py'),'a'*40,'b'*64], 'ROOT_LINUX_KERNEL_CALIBRATION_VERIFIED')
            self.assertEqual(rejected.exception.kernelOutcome,S.safe_kernel_outcome(outcome))
            self.assertIsNone(rejected.exception.bootstrapOutcome)
            self.assertTrue((parent/'requests/kernel-calibration-diagnostic.json').exists())
        for mutate in [lambda v:v['kernelOutcome'].update(raw='SECRET_MARKER'),lambda v:v['kernelOutcome'].update(cleanup='VERIFIED'),lambda v:v['kernelOutcome']['permissions']['source'].update(path='/foreign'),lambda v:v['kernelOutcome'].update(errno='RAW_PRIVATE'),lambda v:v['kernelOutcome'].update(phase='OPEN_DEST')]:
            value=copy.deepcopy(outcome);mutate(value);self.assertIsNone(S.safe_kernel_outcome(value))
        self.assertEqual(K.blocked_outcome(OSError(999,'SECRET'))['kernelOutcome']['errno'],'UNKNOWN')


    def test_full_suite_remains_stopped_with_strict_kernel_summary(self):
        from test_linux_local_bootstrap import Fixture
        spec=importlib.util.spec_from_file_location('kernel_suite',DIRECTORY/'run-linux-local-suite.py')
        suite=importlib.util.module_from_spec(spec);spec.loader.exec_module(suite)
        K.PHASE='NATIVE_BROWSER';K.PERMISSIONS=permissions();outcome=S.safe_kernel_outcome(K.blocked_outcome(PermissionError(errno.EACCES,'SECRET')))
        with tempfile.TemporaryDirectory() as folder:
            f=Fixture(Path(folder).resolve());(f.parent/'requests').mkdir(mode=0o700)
            fake=types.SimpleNamespace(bounded=lambda *_a,**_kw:(0,b'{"result":"PINNED_LOCAL_TOOLCHAIN_INSTALLED"}'))
            def stage(name,*_args,**_options):
                if name=='bootstrap':f.runtime.mkdir(mode=0o700)
                if name=='kernel-calibration':raise S.StageRejected(None,outcome)
                return {'pinReceiptSha256':'f'*64}
            env={**f.environment,'GITHUB_SHA':'a'*40,'GITHUB_REF':'refs/heads/codex/local-capacity-linux-20261116'}
            output=io.StringIO();mask=os.umask(0o077);os.umask(mask)
            with patch.object(S,'PARENT',f.parent),patch.object(S,'RUNTIME',f.runtime),patch.object(S,'TOOLS',f.parent/'tools'),\
                    patch.object(S,'module',return_value=fake),patch.object(S,'create_bootstrap_request',return_value=(f.path,'b'*64,f.request)),\
                    patch.object(S,'stage',side_effect=stage),patch.object(S,'install_psql_adapter'),\
                    patch.object(S,'export_prebusiness_diagnostic',side_effect=ValueError('DIAGNOSTIC_NOT_ADMITTED')),\
                    patch.dict(os.environ,env,clear=True),patch.object(sys,'platform','linux'),patch.object(suite.platform,'machine',return_value='x86_64'),\
                    patch.object(sys,'argv',['suite','a'*40]),contextlib.redirect_stdout(output):
                try:self.assertEqual(suite.main(),1)
                finally:os.umask(mask)
            result=json.loads(output.getvalue().splitlines()[-1])
            self.assertEqual(result['kernelOutcome'],outcome)
            self.assertEqual(result['functional'],'NOT_RUN');self.assertEqual(result['passedLegs'],0)
            self.assertEqual(result['capacityVerdict'],'NOT_VERIFIED');self.assertEqual(result['result'],'LOCAL_SUITE_STOPPED')

if __name__=='__main__':unittest.main()
