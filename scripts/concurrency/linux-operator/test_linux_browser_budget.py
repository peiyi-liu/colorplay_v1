"""Versioned policy selection uses Root approval, not CPU inference; fake IO only."""
import contextlib
import copy
import importlib.util
import io
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import unittest
import linux_host_contract as H

KIND = 'LINUX_VM_12CPU_32G_BROWSER12G_V1'
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'scripts/concurrency'))
sys.path.insert(0, str(ROOT/'tests/contracts'))
sys.path.insert(0, str(ROOT/'tests/contracts/helpers'))
import linux_bootstrap_contracts as C
import linux_runtime_common as M
from linux_vm_contract_driver import request as old_request


def request():
    value, env = old_request(H.VM12)
    value['confirmation'] = H.target(KIND)['confirmation']
    value['provenance'] = H.provenance(KIND)
    env[H.SELECTOR] = KIND
    return value, env


def observed():
    return {'host': {'platform':'linux','distribution':'ubuntu-24.04',
        'logicalCpu':12,'nominalMemoryBytes':32*H.GIB,'memTotalBytes':31*H.GIB,
        'affinityCpus':list(range(12)),'cpuQuotaUs':None,'cpuPeriodUs':None,
        'dedicatedGenerator':False},'identity':{'databaseIdentitySha256':'f'*64},'backend':{}}


def load(name):
    spec = importlib.util.spec_from_file_location('budget_'+name.replace('-','_'),Path(__file__).with_name(name+'.py'))
    module = importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


class BrowserBudgetTests(unittest.TestCase):
    def test_explicit_new_policy_is_admitted_only_on_the_existing_vm_provenance(self):
        environment = {'GITHUB_REF': H.target(H.VM12)['ref'],
                       'GITHUB_WORKFLOW_REF': H.target(H.VM12)['workflowRef'],
                       'GITHUB_EVENT_NAME': 'push', H.SELECTOR: KIND}
        self.assertEqual(H.environment_target(environment)['kind'], KIND)
        self.assertEqual(H.kind_for_cpu(12), H.VM12)

    def test_selector_confirmation_hash_and_provenance_fail_closed(self):
        value, env = request()
        raw = json.dumps(value).encode()
        self.assertEqual(C.parse_request(raw,C.digest(raw),env),value)
        with self.assertRaises(C.BootstrapError):C.parse_request(raw,'0'*64,env)
        for key in (H.SELECTOR,'GITHUB_REF','GITHUB_WORKFLOW_REF','GITHUB_EVENT_NAME'):
            for change in (None,'UNKNOWN',H.VM12):
                changed = dict(env)
                if change is None:changed.pop(key)
                else:changed[key] = change
                with self.subTest(key=key,change=change),self.assertRaises((C.BootstrapError,ValueError)):
                    C.parse_request(raw,C.digest(raw),changed)
        for confirmation in (H.target(H.VM12)['confirmation'],'UNKNOWN'):
            changed = dict(value,confirmation=confirmation);body=json.dumps(changed).encode()
            with self.assertRaises((C.BootstrapError,ValueError)):C.parse_request(body,C.digest(body),env)
        free, free_env = old_request(H.FREE);free_env[H.SELECTOR]=KIND
        with self.assertRaises((C.BootstrapError,ValueError)):H.request_target(free,free_env)
        legacy, legacy_env = old_request(H.VM12)
        self.assertEqual(H.request_target(legacy,legacy_env)['kind'],H.VM12)
        default, default_env = old_request(H.VM)
        self.assertEqual(H.request_target(default,default_env)['kind'],H.VM)

    def test_new_policy_hardware_boundaries_and_no_hardware_upgrade(self):
        host = observed()['host']
        self.assertEqual(H.profile_kind(host),H.VM12)
        for memory in (28,32):
            for quota in (None,1200000):
                host.update(memTotalBytes=memory*H.GIB,cpuQuotaUs=quota,cpuPeriodUs=100000 if quota else None)
                self.assertEqual(H.profile_kind(host,KIND),KIND)
        for key,value in [('logicalCpu',16),('affinityCpus',[0]*12),('memTotalBytes',28*H.GIB-1),
                          ('memTotalBytes',32*H.GIB+1),('cpuQuotaUs',400000),('dedicatedGenerator',True)]:
            bad=copy.deepcopy(observed()['host']);bad[key]=value
            with self.subTest(key=key,value=value),self.assertRaises(ValueError):H.profile_kind(bad,KIND)
        with self.assertRaises(ValueError):H.profile_kind(host,'UNKNOWN')

    def test_actual_bootstrap_and_snapshot_bind_new_policy_to_original_request(self):
        from test_linux_local_bootstrap import Fixture as Bootstrap
        from test_snapshot_local_evidence import Fixture as Snapshot
        import local_snapshot_contracts as S
        for factory in (Bootstrap,Snapshot):
            with tempfile.TemporaryDirectory() as temporary:
                f=factory(Path(temporary).resolve());value,env=request()
                f.request.update(confirmation=value['confirmation'],provenance=value['provenance'])
                f.environment.update(env);f.facts.update(logicalCpu=12,affinity=list(range(12)),memTotalBytes=31*H.GIB)
                f.path.write_text(json.dumps(f.request))
                if factory is Bootstrap:
                    self.assertEqual(f.execute()['services'],8)
                    self.assertIn('CPUQuota=400%',f.files['/run/systemd/system/colorplaybackendbbbbbbbbbbbb.slice'].decode())
                else:
                    f.profile.update(kind=KIND);f.profile['host'].update(observed()['host'])
                    (f.runtime/'bootstrap-input.json').write_text(json.dumps(f.request))
                    (f.runtime/'execution-profile.json').write_text(json.dumps(f.profile))
                    f.plan.update(bootstrapRequestSha256=C.digest((f.runtime/'bootstrap-input.json').read_bytes()),
                                  executionProfileSha256=C.digest((f.runtime/'execution-profile.json').read_bytes()))
                    self.assertEqual(S.bindings(f.source,f.runtime,f.plan,f.environment)[1]['kind'],KIND)
                    f.profile['kind']=H.VM12
                    (f.runtime/'execution-profile.json').write_text(json.dumps(f.profile))
                    f.plan['executionProfileSha256']=C.digest((f.runtime/'execution-profile.json').read_bytes())
                    with self.assertRaises(S.SnapshotError):S.bindings(f.source,f.runtime,f.plan,f.environment)

    def test_actual_preflight_and_runtime_recheck_profile_kind_and_independent_hash(self):
        module=load('execution-profile-preflight');facts=observed()
        profile={'schemaVersion':1,'kind':KIND,**facts};raw=json.dumps(profile).encode()
        ctx={'sourceRevision':'a'*40}
        with patch.object(module,'context',return_value=ctx),patch.object(module,'private_read',return_value=raw), \
             patch.object(module,'observe_profile',return_value=facts), \
             patch.object(module.sys,'argv',['preflight','a'*40,C.digest(raw),'c'*32]),contextlib.redirect_stdout(io.StringIO()) as out:
            module.main();self.assertEqual(json.loads(out.getvalue())['observed'],facts)
        for approved_sha in (C.digest(raw),'0'*64):
            with patch.object(M,'context',return_value=ctx),patch.object(M,'private_json',return_value=(profile,C.digest(raw))), \
                 patch.object(M,'host_observation',return_value=(facts['host'],'boot')),patch.object(M,'instance_facts',return_value={}), \
                 patch.object(M,'verify_executables'):
                if approved_sha==C.digest(raw):self.assertEqual(M.verify_local_profile('a'*40,approved_sha)[1]['kind'],KIND)
                else:
                    with self.assertRaises(ValueError):M.verify_local_profile('a'*40,approved_sha)

    def test_actual_calibration_preserves_policy_before_unchanged_kernel_boundary(self):
        module=load('calibrate-linux-runtime');facts=observed()
        profile={'schemaVersion':1,'kind':KIND,**facts}
        pin={'sourceRevision':'a'*40,'result':'LOCAL_PROFILE_PINNED_PENDING_CALIBRATION',
             'bootstrapRequestSha256':'b'*64,'executionProfileSha256':'c'*64,'helperClosureSha256':'d'*64}
        sentinel=RuntimeError('SYNTHETIC_KERNEL_PORT')
        pinner=SimpleNamespace(approved_inputs=lambda *_:None,write_once=lambda *_:None)
        with tempfile.TemporaryDirectory() as temporary:
            runtime=Path(temporary)/'whole-site-261115';runtime.mkdir()
            with patch.object(module,'RUNTIME',runtime),patch.object(module,'require_linux'), \
                 patch.object(module.sys,'argv',['calibrate','a'*40,'e'*64]), \
                 patch.object(module,'private_json',side_effect=lambda p,*_: (pin,'e'*64) if p.name=='profile-pin-receipt.json' else (profile,'c'*64)), \
                 patch.object(module,'load_pinner',return_value=pinner), \
                 patch.object(module,'context',return_value={'binaries':{'node':{'path':'/synthetic/node'}}}), \
                 patch.object(module,'observe_profile',return_value=facts), \
                 patch.object(module,'kernel_permission_snapshot',return_value={}),patch.object(module,'run_child',side_effect=sentinel) as child:
                with self.assertRaises(RuntimeError) as caught:module.main()
                self.assertIs(caught.exception,sentinel);self.assertEqual(child.call_count,1)
                self.assertEqual(module.PHASE,'NATIVE_BROWSER')


    def test_actual_pin_publishes_only_request_selected_policy_and_matching_closure(self):
        from test_linux_runtime_common import fixture
        module=load('pin-execution-profile');facts=observed();value,_=request()
        value['instanceNonce']=fixture()['instanceNonce']
        names={'functional-preflight.py','canonical-baseline.py','media-readback.py','capacity-root-readonly.py',
               'capacity-registration-readback.py','capacity-retention-readback.py','capacity-preflight-readback.py',
               'execution-profile-preflight.py','linux-host-sample.py','backend-cgroup-sample.py','linux_proc.py',
               'linux_cgroup.py','linux_runtime_common.py','linux_host_contract.py'}
        for selected in (KIND,H.VM12):
            with self.subTest(selected=selected),tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary).resolve();runtime=root/'whole-site-261115';runtime.mkdir()
                tools=root/'tools';tools.mkdir();node=tools/'node';node.write_bytes(b'synthetic node');node.chmod(0o700)
                home=root/'home';cache=home/'.cache/ms-playwright';cache.mkdir(parents=True)
                chrome=cache/'chrome';chrome.write_bytes(b'synthetic chromium');chrome.chmod(0o700)
                for name in names:
                    (runtime/name).write_bytes(b'# synthetic '+name.encode());(runtime/name).chmod(0o600)
                chosen=copy.deepcopy(value);chosen['confirmation']=H.target(selected)['confirmation']
                tool={'node':{'path':str(node),'sha256':C.digest(node.read_bytes()),'version':'24.18.0'}}
                with patch.object(module,'RUNTIME',runtime),patch.object(module,'require_linux'),patch.object(module,'frozen'), \
                     patch.object(module,'approved_inputs',return_value=(chosen,tool)), \
                     patch.object(module,'private_json',return_value=({'projectId':M.PROJECT,'apiUrl':'http://127.0.0.1:58321','appUrl':'http://127.0.0.1:58373'},'a'*64)), \
                     patch.object(module,'command',return_value='v24.18.0'),patch.object(module.Path,'home',return_value=home), \
                     patch.object(module,'actual_containers',return_value=fixture()['containers']), \
                     patch.object(module,'observe_profile',return_value=facts), \
                     patch.object(module.sys,'argv',['pin','a'*40,'b'*64]),contextlib.redirect_stdout(io.StringIO()):
                    module.main()
                raw=(runtime/'execution-profile.json').read_bytes();profile=json.loads(raw)
                self.assertEqual(profile['kind'],selected);self.assertEqual(profile['host'],facts['host'])
                closure=json.loads((runtime/'execution-profile-helper-closure.json').read_bytes())
                self.assertEqual(closure['executionProfileSha256'],C.digest(raw))
                self.assertEqual(set(closure['files']),names)

    def test_actual_root_snapshot_and_native_reobserve_keep_hash_bound_policy(self):
        facts=observed();profile={'schemaVersion':1,'kind':KIND,**facts};raw=json.dumps(profile).encode()
        names={'functional-preflight.py','canonical-baseline.py','media-readback.py','capacity-root-readonly.py',
               'capacity-registration-readback.py','capacity-retention-readback.py','capacity-preflight-readback.py',
               'execution-profile-preflight.py','linux-host-sample.py','backend-cgroup-sample.py','linux_proc.py',
               'linux_cgroup.py','linux_runtime_common.py','linux_host_contract.py'}
        files={name:b'# synthetic '+name.encode() for name in names}
        closure={'schemaVersion':1,'sourceRevision':'a'*40,'executionProfileSha256':C.digest(raw),
                 'files':{name:C.digest(body) for name,body in files.items()}}
        closure_raw=json.dumps(closure).encode()
        files.update({'execution-profile.json':raw,'execution-profile-helper-closure.json':closure_raw})
        scope={'environment':'local','projectId':M.PROJECT,'executionProfileSha256':C.digest(raw),'databaseIdentitySha256':'f'*64}
        descriptor={'helperClosureSha256':C.digest(closure_raw)}
        with patch.object(M,'context',return_value={'sourceRevision':'a'*40}), \
             patch.object(M,'private_read',side_effect=lambda path,*_:files[path.name]), \
             patch.object(M,'observe_profile',return_value=facts),patch.object(M,'host_listeners'):
            self.assertEqual(M.verify_root_snapshot(scope,'a'*40,descriptor)['observed'],facts)
            facts['host']['logicalCpu']=16
            with self.assertRaises(ValueError):M.verify_root_snapshot(scope,'a'*40,descriptor)
            facts['host']['logicalCpu']=12
        from local_snapshot_native import NativeIO
        sentinel=RuntimeError('SYNTHETIC_PROCESS_BOUNDARY')
        native=NativeIO.__new__(NativeIO)
        root=SimpleNamespace(H=H,validate_context=lambda _:None,observe_profile=lambda *_a,**_k:facts)
        with patch.object(native,'load_root',return_value=root),patch.object(native,'process',side_effect=sentinel) as process:
            with self.assertRaises(RuntimeError) as caught:native.observe({'preview':{}},{},profile)
            self.assertIs(caught.exception,sentinel);self.assertEqual(process.call_count,1)

    def test_actual_suite_request_carries_bound_selector_and_provenance(self):
        from test_linux_local_bootstrap import Fixture
        _,env=request();env['UNAPPROVED_TEST_SECRET']='synthetic-not-forwarded'
        with patch.dict(__import__('os').environ,env,clear=True):
            spec=importlib.util.spec_from_file_location('budget_suite',ROOT/'scripts/concurrency/linux_suite_support.py')
            suite=importlib.util.module_from_spec(spec);spec.loader.exec_module(suite)
        self.assertEqual(suite.ENV[H.SELECTOR],KIND);self.assertNotIn('UNAPPROVED_TEST_SECRET',suite.ENV)
        with tempfile.TemporaryDirectory() as temporary:
            f=Fixture(Path(temporary).resolve())
            with patch.object(suite,'PARENT',f.parent),patch.object(suite,'TOOLS',f.parent/'tools'), \
                 patch.dict(__import__('os').environ,env,clear=True):
                path,approval,value=suite.create_bootstrap_request('a'*40)
            self.assertEqual(C.digest(path.read_bytes()),approval)
            self.assertEqual(C.parse_request(path.read_bytes(),approval,env),value)
            self.assertEqual(H.request_target(value,suite.ENV)['kind'],KIND)


if __name__ == '__main__':
    unittest.main()
