"""Actual closed validators and collectors with pure fake kernel providers."""
import copy
import importlib.util
import json
import sys
from pathlib import Path
import unittest
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/concurrency'))
sys.path.insert(0, str(ROOT / 'scripts/concurrency/linux-operator'))
import linux_host_contract as H
import linux_bootstrap_contracts as C
import collect_readiness as R
import linux_runtime_common as M
sys.path.insert(0, str(ROOT / 'tests/contracts'))


def facts(cpu=16, memory=31):
    return {'platform': 'linux', 'architecture': 'x86_64', 'distribution': 'ubuntu-24.04',
            'logicalCpu': cpu, 'affinity': list(range(cpu)), 'memTotalBytes': memory * H.GIB,
            'freeDiskBytes': 20 * H.GIB, 'cgroupV2': True, 'pidfd': True, 'pss': True, 'psi': True}


def request(kind=H.VM):
    value = {'schemaVersion': 1, 'confirmation': H.target(kind)['confirmation'],
             'sourceRevision': 'a' * 40, 'repository': H.REPOSITORY,
             'job': {'runId': '12345', 'runAttempt': 1, 'jobName': 'capacity-linux'},
             'instanceNonce': 'b' * 32, 'operatorPackageManifestSha256': 'c' * 64,
             'toolchainSha256': 'd' * 64}
    if kind == H.VM:
        value['provenance'] = H.provenance(kind)
    env = {'GITHUB_REPOSITORY': H.REPOSITORY, 'GITHUB_RUN_ID': '12345',
           'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_JOB': 'capacity-linux', 'GITHUB_SHA': 'a' * 40,
           'GITHUB_REF': H.target(kind)['ref'], 'GITHUB_WORKFLOW_REF': H.target(kind)['workflowRef'],
           'GITHUB_EVENT_NAME': 'push'}
    return value, env


def admit(value, env):
    raw = json.dumps(value).encode()
    return C.parse_request(raw, C.digest(raw), env)


class Tests(unittest.TestCase):
    def test_paid_and_free_requests_and_hardware_boundaries(self):
        for kind, cpu, boundaries in [(H.FREE, 4, (14, 16)), (H.VM, 16, (28, 32))]:
            value, env = request(kind)
            self.assertEqual(admit(value, env), value)
            for memory in boundaries:
                C.hardware(facts(cpu, memory), kind)
                for delta in (-1, 1):
                    bad = facts(cpu, memory)
                    if (memory == boundaries[0] and delta == -1) or (memory == boundaries[1] and delta == 1):
                        bad['memTotalBytes'] += delta
                        with self.assertRaises(C.BootstrapError):C.hardware(bad, kind)
        with self.assertRaises(C.BootstrapError):C.hardware(facts(), H.FREE)
        with self.assertRaises(C.BootstrapError):C.hardware(facts(4, 16), H.VM)

    def test_paid_provenance_missing_wrong_and_crossed_rejected(self):
        for key in ('GITHUB_REF', 'GITHUB_WORKFLOW_REF', 'GITHUB_EVENT_NAME'):
            for replacement in (None, 'foreign'):
                value, env = request()
                if replacement is None:env.pop(key)
                else:env[key] = replacement
                with self.assertRaises(C.BootstrapError):admit(value, env)
        for kind in (H.FREE, H.VM):
            value, _ = request(kind)
            _, crossed = request(H.VM if kind == H.FREE else H.FREE)
            with self.assertRaises(C.BootstrapError):admit(value, crossed)
        value, env = request(); value['provenance']['workflowRef'] += 'x'
        with self.assertRaises(C.BootstrapError):admit(value, env)

    def test_profile_tuple_quota_affinity_and_admission_budget(self):
        host = {'logicalCpu': 16, 'nominalMemoryBytes': 32 * H.GIB,
                'memTotalBytes': 31 * H.GIB, 'affinityCpus': list(range(16)),
                'cpuQuotaUs': None, 'cpuPeriodUs': None, 'dedicatedGenerator': False}
        self.assertEqual(H.profile_kind(host), H.VM)
        host.update(cpuQuotaUs=1600000, cpuPeriodUs=100000)
        self.assertEqual(H.profile_kind(host), H.VM)
        for key, value in [('cpuQuotaUs', 400000), ('cpuPeriodUs', 0),
                           ('affinityCpus', [0] * 16), ('nominalMemoryBytes', 16 * H.GIB)]:
            bad = copy.deepcopy(host); bad[key] = value
            with self.assertRaises(ValueError):H.profile_kind(bad)
        self.assertEqual(H.target(H.VM)['admissionMinutes'], 75)
        self.assertEqual(H.target(H.FREE)['admissionMinutes'], 240)

    def test_actual_readiness_collector_uses_observed_paid_tuple(self):
        fake = {'totalBytes': 31 * H.GIB, 'swapTotalBytes': 0, 'swapFreeBytes': 0}
        def read(path, *_):
            if path == '/sys/fs/cgroup/cgroup.controllers':return 'cpu memory pids'
            if path == '/proc/123/cgroup':return '0::/owned'
            if path == '/proc/vmstat':return 'oom_kill 0'
            return 'synthetic'
        with patch.object(R.platform, 'system', return_value='Linux'), patch.object(R.sys, 'platform', 'linux'), \
             patch.object(R.platform, 'machine', return_value='x86_64'), patch.object(R.os, 'getpid', return_value=123), \
             patch.object(R.os, 'cpu_count', return_value=16), patch.object(R.os, 'sched_getaffinity', return_value=set(range(16)), create=True), \
             patch.object(R, 'boot_sha', return_value='a' * 64), patch.object(R, 'read', side_effect=read), \
             patch.object(R, 'parse_stat', return_value={'pid': 123, 'startTicks': '42'}), \
             patch.object(R, 'parse_meminfo', return_value=fake), patch.object(R, 'parse_psi', return_value={'observed': True}), \
             patch.object(R, 'parse_smaps_rollup', return_value={'pssBytes': 100}), \
             patch.object(R, 'cgroup_limit_chain', return_value=[]):
            value = R.collect()
        self.assertEqual(value['hostLogicalCpu'], 16)
        self.assertEqual(value['executionAuthority'], 'NONE')

    def test_actual_host_observation_ancestor_and_quota_guards(self):
        ctx = {'generatorCgroupRelativePath': '/owned'}
        for maximum, quota, succeeds in [(None, None, True), (28 * H.GIB, 1600000, True),
                                          (28 * H.GIB - 1, None, False), (32 * H.GIB, 400000, False)]:
            with patch.object(M, 'require_linux'), patch.object(M, 'boot_sha', return_value='a' * 64), \
                 patch.object(M, 'checked_group', return_value=Path('/synthetic')), \
                 patch.object(M, 'read_text', return_value='synthetic'), \
                 patch.object(M, 'parse_meminfo', return_value={'totalBytes': 31 * H.GIB}), \
                 patch.object(M.os, 'cpu_count', return_value=16), patch.object(M.os, 'sched_getaffinity', return_value=set(range(16)), create=True), \
                 patch.object(M, 'cgroup_limit_chain', return_value=[{'memoryMaxBytes': maximum}]), \
                 patch.object(M, 'effective_cpu_quota', return_value={'quotaUs': quota, 'periodUs': 100000 if quota else None}), \
                 patch.object(M, 'cgroup_identity', return_value='b' * 64), patch.object(M, 'distro', return_value='ubuntu-24.04'):
                if succeeds:
                    host, _ = M.host_observation(ctx, allow_outside_group=True)
                    self.assertEqual(H.profile_kind(host), H.VM)
                else:
                    with self.assertRaises(ValueError):M.host_observation(ctx, allow_outside_group=True)

    def test_actual_paid_bootstrap_and_snapshot_bindings(self):
        from test_linux_local_bootstrap import Fixture as Bootstrap
        from test_snapshot_local_evidence import Fixture as Snapshot
        import local_snapshot_contracts as S
        for factory in (Bootstrap, Snapshot):
            with tempfile.TemporaryDirectory() as temp:
                f = factory(Path(temp).resolve())
                f.request.update(confirmation=H.target(H.VM)['confirmation'], provenance=H.provenance(H.VM))
                _, environment = request()
                f.environment.update(environment)
                f.facts.update(logicalCpu=16, affinity=list(range(16)), memTotalBytes=31 * H.GIB)
                f.path.write_text(json.dumps(f.request))
                if factory is Bootstrap:
                    self.assertEqual(f.execute()['services'], 8)
                    self.assertIn('CPUQuota=400%', f.files['/run/systemd/system/colorplaybackendbbbbbbbbbbbb.slice'].decode())
                else:
                    f.profile['kind'] = H.VM
                    f.profile['host'].update(logicalCpu=16, nominalMemoryBytes=32*H.GIB,
                                             memTotalBytes=31*H.GIB, affinityCpus=list(range(16)))
                    (f.runtime/'bootstrap-input.json').write_text(json.dumps(f.request))
                    (f.runtime/'execution-profile.json').write_text(json.dumps(f.profile))
                    f.plan['bootstrapRequestSha256'] = C.digest((f.runtime/'bootstrap-input.json').read_bytes())
                    f.plan['executionProfileSha256'] = C.digest((f.runtime/'execution-profile.json').read_bytes())
                    _, profile, _ = S.bindings(f.source, f.runtime, f.plan, f.environment)
                    self.assertEqual(profile['kind'], H.VM)
                    f.environment['GITHUB_WORKFLOW_REF'] = H.target(H.FREE)['workflowRef']
                    with self.assertRaises(ValueError):S.bindings(f.source, f.runtime, f.plan, f.environment)

    def test_actual_sampler_projects_observed_paid_cpu_without_changing_pss(self):
        sys.path.insert(0, str(ROOT/'tests/contracts/helpers'))
        import root_sampler_failure_driver as F
        source = (ROOT/'scripts/concurrency/linux-operator/linux-host-sample.py').read_bytes()
        ns, _, _ = F.load('host', source)
        profile, _ = ns['private_json'](None)
        profile['host']['logicalCpu'] = 16
        result = ns['sample']({'mode':'NATIVE_BROWSER','nodePid':123,'browserPid':234})
        self.assertEqual(result['hostLogicalCpu'], 16)
        self.assertEqual(result['browserTreePssBytes'], 100)

    def test_actual_calibration_accepts_paid_profile_before_original_kernel_port(self):
        path = ROOT/'scripts/concurrency/linux-operator/calibrate-linux-runtime.py'
        spec = importlib.util.spec_from_file_location('paid_calibration_fake', path)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        host = {'logicalCpu':16,'nominalMemoryBytes':32*H.GIB,'memTotalBytes':31*H.GIB,
                'affinityCpus':list(range(16)),'cpuQuotaUs':None,'cpuPeriodUs':None,'dedicatedGenerator':False}
        observed = {'host':host,'identity':{},'backend':{}}
        profile = {'schemaVersion':1,'kind':H.VM,**observed}
        pin = {'sourceRevision':'a'*40,'result':'LOCAL_PROFILE_PINNED_PENDING_CALIBRATION',
               'bootstrapRequestSha256':'b'*64,'executionProfileSha256':'c'*64,'helperClosureSha256':'d'*64}
        sentinel = RuntimeError('SYNTHETIC_KERNEL_PORT')
        pinner = SimpleNamespace(approved_inputs=lambda *_:None, write_once=lambda *_:None)
        with tempfile.TemporaryDirectory() as temp:
            runtime = Path(temp)/'whole-site-261115';runtime.mkdir()
            with patch.object(module,'RUNTIME',runtime),patch.object(module,'require_linux'), \
                 patch.object(module.sys,'argv',['calibrate','a'*40,'e'*64]), \
                 patch.object(module,'private_json',side_effect=lambda p,*_: (pin,'e'*64) if p.name=='profile-pin-receipt.json' else (profile,'c'*64)), \
                 patch.object(module,'load_pinner',return_value=pinner), \
                 patch.object(module,'context',return_value={'binaries':{'node':{'path':'/synthetic/node'}}}), \
                 patch.object(module,'observe_profile',return_value=observed), \
                 patch.object(module,'kernel_permission_snapshot',return_value={}), \
                 patch.object(module,'run_child',side_effect=sentinel) as child:
                with self.assertRaises(RuntimeError) as caught:module.main()
                self.assertIs(caught.exception,sentinel)
                self.assertEqual(child.call_count,1)
                self.assertEqual(module.PHASE,'NATIVE_BROWSER')


if __name__ == '__main__':
    unittest.main()
