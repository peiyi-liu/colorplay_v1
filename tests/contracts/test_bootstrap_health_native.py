"""Synthetic native ports only: never opens a socket or launches Docker."""
import json
import os
from pathlib import Path
import socket
import stat
import struct
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

DIRECTORY=Path(__file__).resolve().parents[2]/'scripts/concurrency'
sys.path.insert(0,str(DIRECTORY))
import linux_bootstrap_health_native as N
import linux_bootstrap_health_observer as H


class FakeSocket:
    def __init__(self,parts): self.parts=list(parts); self.closed=False; self.sent=[]; self.connections=[]
    def settimeout(self,value): pass
    def connect(self,path): self.connections.append(path)
    def getsockopt(self,*args): return struct.pack('3i',1,0,0)
    def sendall(self,value): self.sent.append(value)
    def recv(self,size):
        value=self.parts.pop(0) if self.parts else b''
        if isinstance(value,BaseException): raise value
        return value
    def shutdown(self,*args): self.closed=True
    def close(self): self.closed=True
    def fileno(self): return -1 if self.closed else 77


class NativeContracts(unittest.TestCase):
    def stream(self,parts):
        sock=FakeSocket(parts); registered=[]
        info=SimpleNamespace(st_mode=stat.S_IFSOCK|0o600,st_uid=0,st_ino=19)
        with patch.object(N.socket,'socket',return_value=sock), patch.object(N.socket,'SO_PEERCRED',17,create=True), patch.object(N.os,'stat',return_value=info):
            stream=N.Stream('/fixed',time.monotonic()+20,threading.Event(),registered.append)
        self.assertEqual(registered,[sock]); self.assertEqual(sock.connections,[N.SOCKET])
        self.assertEqual(len(sock.sent),1)
        return stream,sock

    def test_idle_partial_headers_and_chunks_preserved_without_reconnect(self):
        stream,sock=self.stream([b'HTTP/1.1 2',socket.timeout(),b'00 OK\r\nTransfer-Encoding: chu',socket.timeout(),
                                b'nked\r\nContent-Type: application/vnd.docker.raw-stream\r\n\r\n3\r',
                                socket.timeout(),b'\nA',socket.timeout(),b'BC\r\n0\r\n\r\n'])
        self.assertEqual(stream.headers(),(200,'application/vnd.docker.raw-stream'))
        self.assertEqual(b''.join(stream.body()),b'ABC')
        self.assertEqual(len(sock.connections),1); self.assertEqual(len(sock.sent),1)
        sock.close(); self.assertEqual(sock.fileno(),-1)

    def test_content_length_partial_eof_and_conflicting_headers_reject(self):
        for parts in [[b'HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nabc',b''],
                      [b'HTTP/1.1 200 OK\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n'],
                      [b'HTTP/1.1 200 OK\r\nContent-Length: 4\r\nContent-Length: 4\r\n\r\n']]:
            with self.subTest(parts=parts):
                stream,sock=self.stream(parts)
                with self.assertRaises(ValueError): stream.headers(); list(stream.body())
                sock.close()

    def test_register_failure_closes_new_owned_socket(self):
        sock=FakeSocket([])
        with patch.object(N.socket,'socket',return_value=sock):
            with self.assertRaises(ValueError):
                N.Stream('/fixed',time.monotonic()+20,threading.Event(),lambda _: H.require(False))
        self.assertTrue(sock.closed); self.assertEqual(sock.connections,[])

    def test_stop_and_deadline_keep_partial_buffer_without_reconnect(self):
        stream,sock=self.stream([]); stream.buffer.extend(b'partial'); stream.stop.set()
        with self.assertRaises(ValueError): stream.receive()
        self.assertEqual(stream.buffer,b'partial'); self.assertEqual(len(sock.connections),1); sock.close()

    def test_inspect_projection_has_no_env_or_health_log_payload(self):
        self.assertNotIn('json .State}',N.FORMAT)
        self.assertNotIn('Config.Env',N.FORMAT)
        self.assertNotIn('Health.Log',N.FORMAT)
        self.assertIn('json .State.Health.Status',N.FORMAT)
        self.assertIn('json .ID',N.FORMAT)
        self.assertIn('json .Config.Tty',N.FORMAT)

    def test_sink_wx_private_mux_partial_bytes_and_summary(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary).resolve(); directory.chmod(0o700)
            sink=N.Sink(directory); sink.raw('mux',b'\1\0'); self.assertTrue(sink.close())
            sink.summary({'collection':'UNAVAILABLE','executionAuthority':'NONE'})
            raw=directory/'bootstrap-health-edge-mux.bin'
            self.assertEqual(raw.read_bytes(),b'\1\0'); self.assertEqual(stat.S_IMODE(raw.stat().st_mode),0o600)
            self.assertEqual(stat.S_IMODE((directory/'bootstrap-health-diagnostic.json').stat().st_mode),0o600)
            with self.assertRaises(OSError): N.Sink(directory).raw('mux',b'overwrite')
            with self.assertRaises(ValueError): sink.raw('mux',b'late')
            with self.assertRaises(ValueError): N.Sink(directory).raw('stderr',b'unsupported')
            self.assertEqual(raw.read_bytes(),b'\1\0')

    def test_close_uses_owned_shutdown_and_join_not_container_signal(self):
        native=N.Native(Path('/synthetic'),time.monotonic()+5)
        sock=FakeSocket([]); native.register(sock)
        ready=threading.Event()
        def worker():
            ready.set(); native.stop.wait()
        native.launch(worker); self.assertTrue(ready.wait(1))
        self.assertTrue(native.close(time.monotonic()+2))
        self.assertTrue(sock.closed); self.assertTrue(all(not t.is_alive() for t in native.threads))
        with self.assertRaises(ValueError): native.register(FakeSocket([]))

    def test_unknown_worker_close_not_fabricated_verified(self):
        native=N.Native(Path('/synthetic'),time.monotonic()+5)
        thread=SimpleNamespace(join=lambda timeout:None,is_alive=lambda:True)
        native.threads=[thread]
        self.assertFalse(native.close(time.monotonic()))

    def test_unbound_or_wrong_pins_fail_before_socket(self):
        source=Path('/synthetic/source')
        binding=(source,{},'a'*64,'backend',Path('/synthetic/requests'),[])
        with patch.object(N.socket,'socket',side_effect=AssertionError('NO_SOCKET')):
            with self.assertRaises(ValueError): N.start(binding,Path('/foreign'),[],time.monotonic()+5)
            with self.assertRaises(ValueError): N.bind(source,Path('/wrong'),'a'*64,{}, {},{},Path('/synthetic/runtime'),{})



class BindingAndExport(unittest.TestCase):
    def test_actual_binding_checks_request_job_source_module_bytes_and_empty_inventory(self):
        sys.path.insert(0,str(Path(__file__).parent))
        from test_linux_local_bootstrap import Fixture
        with tempfile.TemporaryDirectory() as temporary:
            f=Fixture(Path(temporary).resolve());f.runtime.mkdir(mode=0o700)
            requests=f.parent/'requests';requests.mkdir(mode=0o700)
            request=requests/'bootstrap-input.json';N.C.write_once(request,f.path.read_bytes())
            approval=N.C.digest(request.read_bytes());isolation={'backend':'colorplaybackend'+'b'*12+'.slice'}
            N.C.write_once(f.runtime/'bootstrap-admission.json',{'requestSha256':approval,'sourceRevision':'a'*40,
                'job':f.request['job'],'instanceNonce':'b'*32})
            N.C.write_once(f.runtime/'kernel-isolation-proof.json',isolation)
            for name in N.MODULES:(f.source/'scripts/concurrency'/name).write_bytes(b'fixed-module')
            def git(argv,**options):
                if argv[1]=='status': return b''
                if argv[1]=='rev-parse': return b'a'*40+b'\n'
                return json.dumps({'images':f.pins}).encode() if argv[-1].endswith('linux-image-pins.json') else b'fixed-module'
            with patch.object(N.sys,'platform','linux'),patch.object(N.subprocess,'check_output',side_effect=git), \
                    patch.object(N.socket,'socket',side_effect=AssertionError('NO_TRANSPORT_DURING_BIND')):
                bound=N.bind(f.source,request,approval,f.request,{'containers':[],'volumes':[]},isolation,f.runtime,f.environment)
                self.assertEqual(bound[-1],f.pins);self.assertEqual(bound[4],requests)
                with self.assertRaises(ValueError):N.bind(f.source,request,approval,f.request,{'containers':['foreign'],'volumes':[]},isolation,f.runtime,f.environment)
                changed=dict(f.request,job=dict(f.request['job'],runId='99999'))
                with self.assertRaises(ValueError):N.bind(f.source,request,approval,changed,{'containers':[],'volumes':[]},isolation,f.runtime,f.environment)
                (f.source/'scripts/concurrency'/N.MODULES[0]).write_bytes(b'changed-module')
                with self.assertRaises(ValueError):N.bind(f.source,request,approval,f.request,{'containers':[],'volumes':[]},isolation,f.runtime,f.environment)

    def test_existing_prebusiness_export_includes_fixed_observer_prefix_bytes(self):
        import contextlib
        import gzip
        import io
        import tarfile
        sys.path.insert(0,str(Path(__file__).parent))
        import test_prebusiness_diagnostic_export as P
        from test_linux_local_bootstrap import Fixture
        external=P.PrebusinessTests('test_schema2_exports_without_fake_profile_and_without_changing_v1_result')
        export=external.export_fixture()
        try:
            with tempfile.TemporaryDirectory() as temporary:
                f=Fixture(Path(temporary).resolve());requests=f.parent/'requests';requests.mkdir(mode=0o700)
                request=requests/'bootstrap-input.json';N.C.write_once(request,f.path.read_bytes())
                sink=N.Sink(requests);sink.raw('mux',b'\2\0\0\0\0\0\0\3RAW')
                sink.summary({'executionAuthority':'NONE','collection':'UNAVAILABLE'})
                (f.source/'scripts/concurrency/local-export-recipient.json').write_text(json.dumps(
                    {'schemaVersion':1,'recipient':export.manifest['recipient'],'privateIdentityUploaded':False}))
                summary={'failedStage':'bootstrap','functional':'NOT_RUN','passedLegs':0,'capacityVerdict':'NOT_VERIFIED'}
                with P.wired(f,export.adapter()),contextlib.redirect_stdout(io.StringIO()):
                    result=P.S.export_prebusiness_diagnostic('a'*40,request,P.S.digest(request.read_bytes()),summary)
                self.assertEqual(result['executionAuthority'],'NONE')
                with tarfile.open(fileobj=io.BytesIO(gzip.decompress((f.parent/'exports/evidence.age').read_bytes()))) as tar:
                    self.assertEqual(tar.extractfile('requests/bootstrap-health-edge-mux.bin').read(),b'\2\0\0\0\0\0\0\3RAW')
                    self.assertIn('requests/bootstrap-health-diagnostic.json',tar.getnames())
        finally: external.doCleanups()



class SameRoundNativeRegressions(unittest.TestCase):
    def test_actual_subscribe_requests_exact_closed_action_filter(self):
        import urllib.parse
        project=N.C.PROJECT
        event={'Type':'container','Action':'start','Actor':{'ID':'a'*64,'Attributes':{
            'name':'supabase_auth_'+project,'com.supabase.cli.project':project,'image':'approved'}}}
        class EventStream:
            def __init__(self):self.socket=FakeSocket([])
            def headers(self):return 200,'application/json'
            def body(self):yield (json.dumps(event)+'\n').encode()
        class Observer:
            def __init__(self):self.value={'subscription':{}};self.accepted_status=None;self.events=[];self.failures=[]
            def sent(self):pass
            def accepted(self,status):self.accepted_status=status
            def event(self,value):self.events.append(value)
            def fail(self,code):self.failures.append(code)
        native=N.Native(Path('/synthetic'),time.monotonic()+5);native.api='/v1.47'
        stream=EventStream();observer=Observer();paths=[]
        def get(path):paths.append(path);return stream
        with patch.object(native,'version'),patch.object(native,'stream',side_effect=get),patch.object(native,'launch',side_effect=lambda fn:fn()):
            native.subscribe(observer)
        filters=json.loads(urllib.parse.parse_qs(urllib.parse.urlsplit(paths[0]).query)['filters'][0])
        self.assertEqual(filters,{'type':['container'],'label':['com.supabase.cli.project='+project],
                                 'event':sorted(H.ACTIONS)})
        self.assertEqual(observer.events,[event]);self.assertEqual(observer.accepted_status,200)
        self.assertEqual(observer.failures,['EVENT_TRANSPORT'])  # EOF is not complete history.
        self.assertTrue(stream.socket.closed)
        self.assertNotIn('exec',json.dumps(filters))

    def test_actual_inspect_exit_between_poll_and_kill_still_closes_and_waits(self):
        import io
        child=SimpleNamespace(pid=12345,returncode=None,stdout=io.BytesIO(b''))
        child.stdout.fileno=lambda:77
        calls=[]
        def poll():return None if child.returncode is None else child.returncode
        def wait(timeout):calls.append(('wait',timeout));child.returncode=0;return 0
        def gone(pid,sig):
            calls.append(('owned-kill',pid));child.returncode=0
            raise ProcessLookupError('SYNTHETIC_EXIT_RACE')
        child.poll=poll;child.wait=wait
        native=N.Native(Path('/synthetic'),time.monotonic()+5)
        def read(fd,count):native.stop.set();return b''
        with patch.object(N.subprocess,'Popen',return_value=child),patch.object(N.os,'set_blocking'), \
                patch.object(N.os,'read',side_effect=read),patch.object(N.os,'killpg',side_effect=gone):
            with self.assertRaisesRegex(ValueError,'^INSPECT$'):
                native.inspect('a'*64,time.monotonic()+5)
        self.assertTrue(child.stdout.closed)
        self.assertEqual([x[0] for x in calls],['owned-kill','wait'])
        self.assertTrue(native.close(time.monotonic()+1))


if __name__=='__main__': unittest.main()
