"""Classic-store admission, real temp FS and synthetic Docker/kernel ports."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from test_linux_local_bootstrap import Fixture, C

CLASSIC={'driver':'systemd','version':'2','storageDriver':'overlay2',
         'driverStatus':[['Backing Filesystem','extfs'],['Supports d_type','true']]}
CONTAINERD={'driver':'systemd','version':'2','storageDriver':'overlayfs',
            'driverStatus':[['driver-type','io.containerd.snapshotter.v1']]}


class Tests(unittest.TestCase):
    def test_actual_containerd_witness_rejects_before_mutation_or_pull(self):
        with tempfile.TemporaryDirectory() as temp:
            f=Fixture(Path(temp).resolve());f.docker_info=copy.deepcopy(CONTAINERD)
            result=f.execute()
            self.assertEqual(result.get('code'),'BOOTSTRAP_DOCKER_UNSUPPORTED')
            self.assertFalse(f.runtime.exists());self.assertEqual(f.writes,[])
            self.assertFalse(any('pull' in args for args,_ in f.commands))
            self.assertFalse(f.started)

    def test_store_matrix_is_fail_closed_without_inferring_from_values(self):
        C.classic_docker_store(copy.deepcopy(CLASSIC))
        variants=[CONTAINERD,{k:v for k,v in CLASSIC.items() if k!='driverStatus'},
                  {**CLASSIC,'driverStatus':None},{**CLASSIC,'driverStatus':[]},
                  {**CLASSIC,'driverStatus':[['driver-type','unknown']]},
                  {**CLASSIC,'driverStatus':[['driver-type','classic']]},
                  {**CLASSIC,'driverStatus':[['same','x'],['same','y']]},
                  {**CLASSIC,'driverStatus':[['x']]},{**CLASSIC,'driverStatus':[['x',1]]},
                  {**CLASSIC,'storageDriver':'unknown'},{**CLASSIC,'driver':'cgroupfs'},
                  {**CLASSIC,'version':'1'},{**CLASSIC,'extra':True}]
        for value in variants:
            with self.subTest(value=value),self.assertRaises(C.BootstrapError) as error:
                C.classic_docker_store(value)
            self.assertEqual(str(error.exception),'BOOTSTRAP_DOCKER_UNSUPPORTED')
        C.classic_docker_store({**CLASSIC,'driverStatus':[['Future ancillary key','opaque metadata']]})

    def test_all_profiles_accept_classic_and_isolate_preserves_feature_false(self):
        for kind,cpu,memory in [(C.H.FREE,4,15),(C.H.VM,16,31),(C.H.VM12,12,31)]:
            with tempfile.TemporaryDirectory() as temp:
                f=Fixture(Path(temp).resolve());target=C.H.target(kind)
                f.request['confirmation']=target['confirmation']
                if kind!=C.H.FREE:f.request['provenance']=C.H.provenance(kind)
                f.environment.update(GITHUB_REF=target['ref'],GITHUB_WORKFLOW_REF=target['workflowRef'],GITHUB_EVENT_NAME='push')
                if kind==C.H.VM12:f.environment[C.H.SELECTOR]=kind
                f.path.write_text(json.dumps(f.request))
                f.facts.update(logicalCpu=cpu,affinity=list(range(cpu)),memTotalBytes=memory*1024**3)
                f.files['/etc/docker/daemon.json']=b'{"features":{"containerd-snapshotter":false},"log-level":"warn"}'
                self.assertEqual(f.execute().get('services'),8)
                self.assertIs(C.decode(f.files['/etc/docker/daemon.json'])['features']['containerd-snapshotter'],False)


if __name__=='__main__':unittest.main()
