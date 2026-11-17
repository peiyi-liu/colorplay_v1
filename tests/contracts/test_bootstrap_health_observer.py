"""Pure external ports and private temporary files; no native Docker/socket."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

DIRECTORY = Path(__file__).resolve().parents[2] / 'scripts/concurrency'
sys.path.insert(0, str(DIRECTORY))
import linux_bootstrap_backend as B


class StartBoundary(unittest.TestCase):
    def test_original_start_sentinel_survives_passive_observer_and_cleanup(self):
        sentinel = RuntimeError('SYNTHETIC_PRIVATE_SENTINEL')
        calls = []
        class Observer:
            def cli_started(self): calls.append('CLI_BOUNDARY')
            def finish(self):
                calls.append('OBSERVER_CLOSED')
                return {'closure': 'VERIFIED'}
        class Ports:
            def pull_approved_image(self, pin, index): calls.append('PULL')
            def bootstrap_observer(self, runtime, pins, deadline):
                calls.append('OBSERVER_CREATED')
                return Observer()
            def run(self, args, **options):
                if args[:3] == B.DOCKER:
                    return json.dumps([{'Id': 'sha256:' + 'a'*64, 'Architecture': 'amd64', 'Os': 'linux'}]).encode() if args[3:5] == ['image', 'inspect'] else b''
                calls.append('START')
                self.assertion = options
                raise sentinel
        with tempfile.TemporaryDirectory() as temporary:
            runtime = Path(temporary).resolve()
            ports = Ports()
            with self.assertRaises(RuntimeError) as caught:
                B.start(ports, runtime, runtime/'project', {'supabase': {'path': '/synthetic/supabase'}}, [{'pinnedReference': 'approved', 'configDigest': 'sha256:'+'a'*64, 'tag': 'approved'}]*8, 'private', {})
            self.assertIs(caught.exception, sentinel)
            self.assertEqual(calls[-4:], ['OBSERVER_CREATED', 'CLI_BOUNDARY', 'START', 'OBSERVER_CLOSED'])
            self.assertEqual(ports.assertion['timeout'], 600)
            self.assertEqual(ports.assertion['env'], {'SUPABASE_AUTH_JWT_SECRET':'private','SUPABASE_JWT_SECRET':'private'})



import copy
import struct
from unittest.mock import patch
import linux_bootstrap_health_observer as H
from linux_bootstrap_contracts import ROLES, PROJECT


class PureObserver(unittest.TestCase):
    def setUp(self):
        self.request = {'sourceRevision': 'a'*40, 'instanceNonce': 'b'*32}
        self.backend = 'colorplaybackend' + 'b'*12 + '.slice'
        self.pins = [{'role': role, 'tag': 'public.ecr.aws/supabase/'+role+':fixed',
                      'pinnedReference': 'public.ecr.aws/supabase/test@sha256:'+'c'*64,
                      'configDigest': 'sha256:'+'d'*64} for role in sorted(ROLES)]
        self.scope = H.Scope(self.request, 'e'*64, self.pins, self.backend)
        owner = self
        class Ports:
            closed = True
            def __init__(self): self.reads = []; self.attach = []; self.mutation = None
            def inspect(self, identity, deadline):
                self.reads.append(identity)
                role = owner.roles[identity]
                row = {'id': identity, 'name': '/supabase_'+role+'_'+PROJECT, 'project': PROJECT,
                       'image': 'sha256:'+'d'*64, 'cgroup': '', 'pid': 100, 'running': True,
                       'restarting': False, 'dead': False, 'oom': False, 'exitCode': 0,
                       'restartCount': 0, 'health': 'healthy', 'tty': False}
                if self.mutation: row.update(self.mutation)
                return row
            def cgroup(self, pid): return '0::/'+owner.backend+'/docker-'+self.reads[-1]+'.scope\n'
            def attach_logs(self, identity, observer): self.attach.append(identity)
            def close(self, deadline): return self.closed
        class Sink:
            def __init__(self): self.raws = []; self.value = None; self.failed = False
            def raw(self, channel, body): self.raws.append((channel, body))
            def close(self): return True
            def summary(self, value):
                if self.failed: raise OSError('PRIVATE_WRITER_ERROR')
                self.value = copy.deepcopy(value)
        self.roles = {format(i+1, '064x'): role for i, role in enumerate(sorted(ROLES))}
        self.ports, self.sink = Ports(), Sink()
        self.observer = H.Observer(self.scope, self.ports, self.sink, 100, now=lambda: 1)

    def event(self, role='edge_runtime', action='start', **attrs):
        identity = next(k for k,v in self.roles.items() if v == role)
        attributes = {'name': 'supabase_'+role+'_'+PROJECT, 'com.supabase.cli.project': PROJECT,
                      'image': self.scope.pins[role]['tag']} | attrs
        return {'Type': 'container', 'Action': action, 'Actor': {'ID': identity, 'Attributes': attributes}}

    def test_all_roles_validated_event_driven_and_edge_attached_once(self):
        for role in sorted(ROLES):
            self.observer.event(self.event(role, 'create'))
        self.assertEqual(self.ports.reads, [])
        for role in sorted(ROLES): self.observer.event(self.event(role))
        self.observer.event(self.event(action='health_status: healthy'))
        self.assertEqual(len(self.observer.value['states']), 9)
        self.assertEqual(len(self.ports.attach), 1)
        self.assertEqual(self.observer.value['collection'], 'OBSERVED')
        self.assertNotIn('pid', json.dumps(self.observer.value))

    def test_foreign_candidates_never_inspected(self):
        for attrs in [{'name': 'foreign'}, {'image': 'foreign'}, {'com.supabase.cli.project': 'foreign'}]:
            self.observer.event(self.event(**attrs))
        self.assertEqual(self.ports.reads, [])
        self.assertEqual(self.observer.value['firstTerminal']['reason'], 'SCOPE')

    def test_wrong_identity_cgroup_tty_fail_without_logs(self):
        for changes in [{'image':'sha256:'+'f'*64}, {'cgroup':'foreign'}, {'tty':True},
                        {'running':False,'pid':0,'cgroup':''}, {'pid':True}]:
            with self.subTest(changes=changes):
                self.setUp(); self.ports.mutation=changes
                self.observer.event(self.event())
                self.assertEqual(self.ports.attach, [])
                self.assertEqual(self.observer.value['collection'], 'UNAVAILABLE')
                count=len(self.ports.reads); self.observer.event(self.event())
                self.assertEqual(len(self.ports.reads), count)

    def test_role_second_id_rejected_and_first_failure_retained(self):
        self.observer.event(self.event())
        other=self.event(); other['Actor']['ID']='f'*64
        self.observer.event(other); self.observer.fail('PRIVATE_ERROR_TEXT')
        self.assertEqual(len(self.ports.reads),1)
        self.assertEqual(self.observer.value['firstTerminal']['reason'],'ROLE_REUSED')
        self.assertNotIn('PRIVATE',json.dumps(self.observer.value))

    def test_http_provider_failure_never_becomes_app_stderr(self):
        self.assertFalse(self.observer.log_status(403,'application/json'))
        self.assertEqual(self.observer.value['logs']['stderrFrames'],0)
        self.assertEqual(self.sink.raws,[])
        self.assertEqual(self.observer.value['firstTerminal']['reason'],'LOG_HTTP')

    def test_mux_partial_channels_system_and_private_bytes(self):
        def frame(channel,body): return bytes([channel,0,0,0])+struct.pack('>I',len(body))+body
        raw=frame(1,b'PRIVATE_APP_STDOUT')+frame(2,b'PRIVATE_APP_STDERR')+frame(3,b'PRIVATE_SYSTEM')
        for body in [raw[:3],raw[3:10],raw[10:]]: self.observer.log_data(body)
        self.observer.log_end(True)
        self.assertEqual(self.observer.value['logs']['stdoutFrames'],1)
        self.assertEqual(self.observer.value['logs']['stderrFrames'],1)
        self.assertEqual(self.observer.value['logs']['systemFrames'],1)
        self.assertEqual(self.observer.value['firstTerminal']['reason'],'SYSTEM_FRAME')
        self.assertEqual(b''.join(b for _,b in self.sink.raws),raw)
        self.assertNotIn('PRIVATE',json.dumps(self.observer.value))

    def test_partial_malformed_oversize_and_raw_limit(self):
        for raw in [b'\1\0',b'\1\1\0\0'+struct.pack('>I',0),b'\1\0\0\0'+struct.pack('>I',65537)]:
            with self.subTest(raw=raw):
                self.setUp()
                try: self.observer.log_data(raw)
                except ValueError: pass
                self.observer.log_end(False)
                self.assertEqual(self.observer.value['collection'],'UNAVAILABLE')
                self.assertEqual(b''.join(b for _,b in self.sink.raws),raw)
        self.setUp(); self.observer.raw_size=H.LOG_LIMIT-1
        with self.assertRaises(ValueError): self.observer.log_data(b'xx')
        self.assertEqual(self.sink.raws,[('mux',b'x')])
        self.assertEqual(self.observer.value['firstTerminal']['reason'],'LOG_LIMIT')

    def test_bounds_and_late_events_fail_closed(self):
        self.observer.value['events']=[{}]*H.EVENT_LIMIT
        self.observer.event(self.event()); self.assertEqual(self.ports.reads,[])
        self.assertEqual(self.observer.value['firstTerminal']['reason'],'EVENT_LIMIT')
        self.setUp(); self.observer.value['states']=[{}]*H.STATE_LIMIT
        self.observer.event(self.event()); self.assertEqual(self.ports.reads,[])
        self.assertEqual(self.observer.value['firstTerminal']['reason'],'STATE_LIMIT')
        self.setUp(); self.observer.finish(); self.observer.event(self.event())
        self.assertEqual(self.ports.reads,[])
        self.assertEqual(self.observer.value['firstTerminal']['reason'],'UNKNOWN')

    def test_request_sent_not_accepted_not_complete_and_close_unknown(self):
        self.observer.sent(); self.assertIsNone(self.observer.value['subscription']['acceptedAtMs'])
        self.assertEqual(self.observer.value['coverage'],'UNOBSERVED')
        self.observer.accepted(200)
        self.assertEqual(self.observer.value['coverage'],'OBSERVED_POSSIBLE_GAP')
        self.ports.closed=False
        self.assertEqual(self.observer.finish(),{'closure':'UNKNOWN','persisted':True})
        self.assertEqual(self.sink.value['closure'],'UNKNOWN')
        self.setUp(); self.sink.failed=True
        self.assertEqual(self.observer.finish(),{'closure':'VERIFIED','persisted':False})
        self.assertEqual(self.observer.value['firstTerminal']['reason'],'WRITE')

    def test_scope_rejects_foreign_backend_or_bad_pins(self):
        with self.assertRaises(ValueError): H.Scope(self.request,'e'*64,self.pins,'foreign')
        with self.assertRaises(ValueError): H.Scope(self.request,'e'*64,self.pins[:-1],self.backend)

    def test_same_id_cannot_change_role_or_trigger_second_validation(self):
        first=self.event(action='create');self.observer.event(first)
        second=self.event('auth');second['Actor']['ID']=first['Actor']['ID']
        self.observer.event(second)
        self.assertEqual(self.ports.reads,[])
        self.assertEqual(self.observer.value['firstTerminal']['reason'],'ROLE_REUSED')

    def test_oom_die_destroy_preserves_observed_state_not_inferred_retention(self):
        self.observer.event(self.event())
        self.ports.mutation={'running':False,'pid':0,'dead':False,'oom':True,'exitCode':137,'cgroup':self.backend}
        for action in ['oom','die','destroy']:self.observer.event(self.event(action=action))
        self.assertEqual([s['exitCode'] for s in self.observer.value['states']],[0,137,137,137])
        self.assertEqual(self.observer.value['collection'],'OBSERVED')
        self.assertNotIn('retention',self.observer.value)


class SuccessBoundary(unittest.TestCase):
    def test_cli_success_receipt_preserved_but_unknown_observer_blocks_status(self):
        for closure in [{'closure':'UNKNOWN','persisted':True},{'closure':'VERIFIED','persisted':False},
                        {'closure':'VERIFIED','persisted':True}]:
            with self.subTest(closure=closure),tempfile.TemporaryDirectory() as temporary:
                runtime=Path(temporary).resolve();calls=[]
                class Observer:
                    def cli_started(self):calls.append('BOUNDARY')
                    def finish(self):calls.append('CLOSE');return closure
                class Ports:
                    def pull_approved_image(self,*args):pass
                    def bootstrap_observer(self,*args):return Observer()
                    def run(self,args,**options):
                        if args[:3]==B.DOCKER:return json.dumps([{'Id':'sha256:'+'a'*64,'Architecture':'amd64','Os':'linux'}]).encode() if args[3:5]==['image','inspect'] else b''
                        calls.append(args[1]);return b'{}'
                with patch.object(B,'check_status',return_value={'observed':'synthetic'}) as status:
                    args=(Ports(),runtime,runtime/'project',{'supabase':{'path':'/synthetic/supabase'},'node':{'path':'/synthetic/node'}},
                          [{'pinnedReference':'approved','configDigest':'sha256:'+'a'*64,'tag':'approved'}]*8,'private',{})
                    if closure=={'closure':'VERIFIED','persisted':True}:
                        self.assertEqual(B.start(*args),{'observed':'synthetic'});status.assert_called_once()
                        self.assertEqual(calls,['BOUNDARY','start','CLOSE','status'])
                    else:
                        with self.assertRaises(B.BootstrapError):B.start(*args)
                        status.assert_not_called();self.assertEqual(calls,['BOUNDARY','start','CLOSE'])
                    self.assertEqual(json.loads((runtime/'cli-start-returned.json').read_bytes())['exitCode'],0)

    def test_cleanup_writer_error_never_masks_original_cli_error(self):
        sentinel=RuntimeError('PRIVATE_SENTINEL')
        class Observer:
            def cli_started(self):pass
            def finish(self):raise OSError('PRIVATE_WRITE_ERROR')
        class Ports:
            def pull_approved_image(self,*args):pass
            def bootstrap_observer(self,*args):return Observer()
            def run(self,args,**options):
                if args[:3]==B.DOCKER:return json.dumps([{'Id':'sha256:'+'a'*64,'Architecture':'amd64','Os':'linux'}]).encode() if args[3:5]==['image','inspect'] else b''
                raise sentinel
        with tempfile.TemporaryDirectory() as temporary:
            runtime=Path(temporary).resolve()
            with self.assertRaises(RuntimeError) as caught:B.start(Ports(),runtime,runtime,{'supabase':{'path':'/synthetic/supabase'}},
                [{'pinnedReference':'approved','configDigest':'sha256:'+'a'*64,'tag':'approved'}]*8,'private',{})
            self.assertIs(caught.exception,sentinel)



if __name__ == '__main__': unittest.main()
