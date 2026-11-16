"""Root/kernel ports are synthetic; private FS and Unix FD transfer are real."""
import array
import ast
import struct
import contextlib
import copy
import importlib.util
import json
import os
from pathlib import Path
import socket
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import MagicMock,patch

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent))
import linux_attach_authority as A
spec=importlib.util.spec_from_file_location('attach_contract',HERE/'privileged-attach.py')
H=importlib.util.module_from_spec(spec);spec.loader.exec_module(H)


def row(pid,parent):
    return {'pid':pid,'startTicks':17+pid,'uid':1001,'gid':1001,'exe':'/usr/bin/python3.12','device':8,'inode':123,'exeSha256':'e'*64,'argvSha256':'a'*64,'ppid':parent,'state':'S'}


def fixture():
    suite=row(100,9);observer=row(200,100)
    argv=['/usr/bin/python3','-B','/approved/run-functional-owned.py','a'*40,'wsb-test','b'*64]
    observer['argvSha256']=H.sha(b'\0'.join(x.encode() for x in argv)+b'\0')
    leaf={'relativePath':'/colorplaygenerator'+'a'*12+'.slice/workload','device':2,'inode':10,'uid':1001,'procsDevice':2,'procsInode':11}
    policy={'schemaVersion':1,'instanceNonce':'a'*32,'sourceRevision':'a'*40,'jobSha256':'b'*64,'contextSha256':'c'*64,'bootSha256':'d'*64,'helperSha256':'e'*64,'suite':suite,'observer':{'argv':argv,'argvSha256':observer['argvSha256'],'scriptPath':argv[2],'scriptSha256':'f'*64,'sourceCgroup':'/runner/job'},'leaf':leaf,'node':{'path':'/approved/node'},'gateSha256':H.sha(H.GATE.encode()),'suiteScriptPath':'/approved/run-linux-local-suite.py','suiteScriptSha256':'f'*64}
    request={'schemaVersion':1,'attachNonce':'b'*32}
    class Kernel:
        def __init__(self):self.rows=copy.deepcopy({100:suite,200:observer});self.opens=[];self.leaf_data=copy.deepcopy(leaf);self.script_hash='f'*64;self.empty=True;self.caps_zero=True
        def process(self,pid):return self.rows[pid],[s.encode() for s in argv] if pid==200 else []
        def script(self,path,owner):return self.script_hash
        def membership(self,pid):return '/runner/job'
        def unprivileged(self,pid):return self.caps_zero
        def leaf(self,relative):return self.leaf_data
        def members(self,relative):return [] if self.empty else [b'999']
        def capability(self,target):self.opens.append(copy.deepcopy(target));return os.open(os.devnull,os.O_WRONLY)
    return policy,request,Kernel()


@contextlib.contextmanager
def socket_pair():
    first,second=socket.socketpair(socket.AF_UNIX,socket.SOCK_DGRAM)
    try:yield first,second
    finally:first.close();second.close()


class OfferTests(unittest.TestCase):
    def test_offer_is_not_an_attachment_and_never_takes_child_pid(self):
        p,r,k=fixture();proof,fd=H.offer(r,(200,1001,1001),p,'1'*64,k)
        try:
            self.assertEqual(proof['result'],'CAPABILITY_OFFERED');self.assertEqual(len(k.opens),1)
            self.assertEqual(set(proof),H.PROOF_KEYS);self.assertNotIn('ATTACHED',json.dumps(proof))
            self.assertNotIn('/approved',json.dumps(proof))
        finally:os.close(fd)
        r['childPid']=300
        with self.assertRaises(ValueError):H.offer(r,(200,1001,1001),p,'1'*64,k)
        self.assertEqual(len(k.opens),1)

    def test_foreign_or_changed_observer_and_nonempty_leaf_cannot_receive_capability(self):
        mutations=[lambda p,r,k:p['suite'].update(startTicks=4),lambda p,r,k:k.rows[200].update(ppid=9),lambda p,r,k:k.rows[200].update(uid=9),lambda p,r,k:k.rows[200].update(state='Z'),lambda p,r,k:k.rows[200].update(inode=999),lambda p,r,k:setattr(k,'script_hash','0'*64),lambda p,r,k:p['leaf'].update(inode=999),lambda p,r,k:setattr(k,'empty',False),lambda p,r,k:setattr(k,'caps_zero',False),lambda p,r,k:r.update(extra='SECRET')]
        for index,mutate in enumerate(mutations):
            with self.subTest(case=index):
                p,r,k=fixture();mutate(p,r,k)
                with self.assertRaises(ValueError):H.offer(r,(200,1001,1001),p,'1'*64,k)
                self.assertEqual(k.opens,[])
        p,r,k=fixture()
        with self.assertRaises(ValueError):H.offer(r,(200,0,0),p,'1'*64,k)
        self.assertEqual(k.opens,[])

    def test_real_private_file_rejects_links_owner_mode_and_size(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();path=root/'policy';path.write_bytes(b'approved');path.chmod(0o600)
            self.assertEqual(H.secure_file(path,os.getuid(),0o600),b'approved')
            for owner,mode,maximum in [(os.getuid()+1,0o600,99),(os.getuid(),0o400,99),(os.getuid(),0o600,2)]:
                with self.assertRaises(ValueError):H.secure_file(path,owner,mode,maximum)
            link=root/'linked';os.link(path,link)
            with self.assertRaises(ValueError):H.secure_file(path,os.getuid(),0o600)
            link.unlink();(root/'symlink').symlink_to(path)
            with self.assertRaises(ValueError):H.secure_file(root/'symlink',os.getuid(),0o600)

    def test_protected_policy_binds_boot_nonce_helper_and_exact_gate(self):
        p,_,_=fixture();helper=b'fixed helper';p['helperSha256']=H.sha(helper);p['bootSha256']=H.sha(b'boot')
        key=p['observer']['argvSha256'];folder=H.ROOT/p['instanceNonce']
        def lookup(path,*args):return helper if path.name=='helper.py' else H.canonical(p)
        with patch.object(H,'root_directory'),patch.object(H,'secure_file',side_effect=lookup),patch.object(H,'read',return_value=b'boot\n'):
            self.assertEqual(H.load_policy(folder,key)[0],p)
            for field in ['bootSha256','helperSha256','gateSha256','instanceNonce']:
                previous=p[field];p[field]='0'*len(previous)
                with self.subTest(field=field),self.assertRaises(ValueError):H.load_policy(folder,key)
                p[field]=previous

    def test_lease_is_write_once_even_if_server_never_listens(self):
        p,_,_=fixture();key=p['observer']['argvSha256'];nonce='b'*32
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();server=MagicMock();server.__enter__.return_value=server;server.bind.side_effect=OSError('SYNTHETIC')
            with patch.object(H,'root_credentials'),patch.object(H,'load_policy',return_value=(p,'a'*64)),patch.object(H.socket,'socket',return_value=server),patch.object(H.signal,'signal'),patch.object(H.signal,'alarm'):
                with self.assertRaises(OSError):H.serve(root,key,nonce)
                saved=(root/('used-'+nonce)).read_bytes()
                with self.assertRaises(FileExistsError):H.serve(root,key,nonce)
                self.assertEqual((root/('used-'+nonce)).read_bytes(),saved);self.assertEqual(server.bind.call_count,1)

    def test_server_has_no_numeric_writer_worker_signal_or_exec_path(self):
        tree=ast.parse((HERE/'privileged-attach.py').read_text())
        forbidden={'write','kill','killpg','pidfd_send_signal','fork','execve','ptrace'}
        calls=[n.func.attr for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in forbidden]
        self.assertEqual(calls,[])
        self.assertNotIn('supervisor', [n.name for n in tree.body if isinstance(n,ast.FunctionDef)])

    def test_root_credentials_are_actual_checked_ports_not_yama_assumptions(self):
        ids=b'Uid:\t0\t0\t0\t0\nGid:\t0\t0\t0\t0\n'
        libc=types.SimpleNamespace(prctl=lambda *args:0)
        with patch.object(H.sys,'platform','linux'),patch.object(H.os,'getresuid',return_value=(0,0,0),create=True),patch.object(H.os,'getresgid',return_value=(0,0,0),create=True),patch.object(H,'read',return_value=ids),patch.object(H.ctypes,'CDLL',return_value=libc):
            H.root_credentials()
            with patch.object(H,'read',return_value=ids.replace(b'Uid:\t0',b'Uid:\t1001')),self.assertRaises(ValueError):H.root_credentials()
            with patch.object(H.ctypes,'CDLL',return_value=types.SimpleNamespace(prctl=lambda *args:1)),self.assertRaises(ValueError):H.root_credentials()


class DescriptorTests(unittest.TestCase):
    def test_unexpected_fd_count_or_truncation_closes_every_received_copy(self):
        for count in [0,2]:
            with self.subTest(count=count),socket_pair() as pair:
                fds=[os.open(os.devnull,os.O_RDONLY) for _ in range(count)]
                try:
                    pair[0].sendmsg([b'{}'],[] if not fds else [(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',fds))])
                    with self.assertRaises(ValueError):H.recv(pair[1])
                finally:
                    for fd in fds:os.close(fd)
        fd=os.open(os.devnull,os.O_RDONLY)
        connection=types.SimpleNamespace(recvmsg=lambda *args:(b'{}',[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[fd]).tobytes())],socket.MSG_TRUNC,None))
        with self.assertRaises(ValueError):H.recv(connection)
        with self.assertRaises(OSError):os.fstat(fd)

    def test_real_scm_copy_is_noninheritable_and_send_is_not_retried(self):
        with socket_pair() as pair:
            fd=os.open(os.devnull,os.O_RDONLY)
            try:
                H.send(pair[0],{'synthetic':True},fd);message,received=H.recv(pair[1])
                self.assertEqual(message,{'synthetic':True});self.assertFalse(os.get_inheritable(received));os.close(received)
            finally:os.close(fd)
        calls=[]
        def short(*args):calls.append(args);return 1
        with self.assertRaises(ValueError):H.send(types.SimpleNamespace(sendmsg=short),{'bounded':True})
        self.assertEqual(len(calls),1)


class ClientClosureTests(unittest.TestCase):
    def execute(self,mutate=None,cancel=False):
        policy,request,_=fixture();ctx={'instanceNonce':'a'*32,'sourceRevision':'a'*40};ctx_raw=H.canonical(ctx);policy['contextSha256']=H.sha(ctx_raw)
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'cap';path.touch();capfd=os.open(path,os.O_WRONLY);info=os.fstat(capfd)
            policy['leaf'].update(procsDevice=info.st_dev,procsInode=info.st_ino)
            mirror={'policy':policy,'policySha256':H.sha(H.canonical(policy)+b'\n')}
            proof={'schemaVersion':1,'result':'CAPABILITY_OFFERED','requestSha256':H.sha(H.canonical(request)),'policySha256':mirror['policySha256'],'contextSha256':policy['contextSha256'],'bootSha256':policy['bootSha256'],'leafSha256':H.sha(H.canonical(policy['leaf'])),'fdDevice':info.st_dev,'fdInode':info.st_ino,'rootCredentials':'ROOT_ALL_IDS_ZERO','nonDumpable':True,'receiverUnprivileged':True,'receiverUserNamespace':'SAME_AS_ROOT'}
            state={'closed':False,'cancel':False,'short':False,'timeout':False,'delivered':False,'peerUid':0,'late':False,'clockOffset':0}
            if mutate:mutate(proof,state)
            rootfd=os.open(os.devnull,os.O_RDONLY);readfd,writefd=os.pipe();os.write(writefd,b'{"kind":"READY","pid":90}\n');os.close(writefd);stdout=os.fdopen(readfd,'rb')
            class Process:
                returncode=0
                def __init__(self):self.stdout=stdout
                def wait(self,timeout):
                    if state['timeout']:raise H.subprocess.TimeoutExpired('synthetic root opener',timeout)
                    state['closed']=True
                    if cancel:state['cancel']=True
            class Connection:
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def settimeout(self,value):pass
                def connect(self,address):pass
                def getsockopt(self,*args):return struct.pack('3i',90,state['peerUid'],0)
                def sendmsg(self,parts,*args):return 1 if state['short'] else sum(map(len,parts))
                def recvmsg(self,*args):
                    state['delivered']=True
                    if state['late']:state['clockOffset']=100
                    return H.canonical(proof),[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[capfd]).tobytes())],0,None
            def selected(fds,*args):return (fds if state['closed'] else [],[],[])
            def private(path,*args):return ctx_raw if path.name=='execution-context.json' else H.canonical(mirror)
            clock=time.monotonic
            try:
                with patch.object(H.time,'monotonic',side_effect=lambda:clock()+state['clockOffset']),patch.object(H.sys,'platform','linux'),patch.object(H.socket,'SO_PEERCRED',17,create=True),patch.object(H,'root_directory'),patch.object(H,'secure_file',side_effect=private),patch.object(H,'read',return_value=b'synthetic-command'),patch.object(H,'sha',side_effect=lambda raw:'a'*64 if raw==b'synthetic-command' else __import__('hashlib').sha256(raw).hexdigest()),patch.object(H.Path,'lstat',return_value=types.SimpleNamespace(st_mode=0o100500,st_uid=0,st_nlink=1)),patch.object(H.subprocess,'Popen',return_value=Process()),patch.object(H.os,'pidfd_open',return_value=rootfd,create=True),patch.object(H.socket,'socket',side_effect=lambda *args:Connection()),patch.object(H.select,'select',side_effect=selected):
                    try:result=H.client(ctx,request,time.monotonic()+10,lambda:state['cancel'])
                    except BaseException:
                        if state['delivered']:
                            with self.assertRaises(OSError):os.fstat(capfd)
                        raise
                self.assertEqual(result,capfd);self.assertTrue(state['closed']);self.assertFalse(os.get_inheritable(result));return state
            finally:
                stdout.close()
                for fd in [capfd,rootfd]:
                    try:os.close(fd)
                    except OSError:pass

    def test_strict_offer_and_observed_root_close_before_fd_transfer(self):
        self.assertTrue(self.execute()['closed'])
        for mutate in [lambda p,s:p.update(result='ATTACHED'),lambda p,s:p.update(policySha256='0'*64),lambda p,s:p.update(extra='SECRET'),lambda p,s:p.update(fdInode=999),lambda p,s:s.update(peerUid=1001)]:
            with self.subTest(case=str(mutate)),self.assertRaises(ValueError):self.execute(mutate)

    def test_cancel_unknown_close_or_partial_send_closes_local_capability(self):
        with self.assertRaises(ValueError):self.execute(cancel=True)
        with self.assertRaises(H.subprocess.TimeoutExpired):self.execute(lambda p,s:s.update(timeout=True))
        with self.assertRaises(ValueError):self.execute(lambda p,s:s.update(short=True))
        with self.assertRaises(ValueError):self.execute(lambda p,s:s.update(late=True))


class SuiteAuthorityTests(unittest.TestCase):
    def test_only_exact_root_observers_and_original_zero_based_15_legs(self):
        args=['/usr/bin/python3','-B',str(A.RUNTIME/'calibrate-linux-runtime.py'),'a'*40,'b'*64]
        self.assertTrue(A.observer_stage('kernel-calibration',args))
        for index in range(15):self.assertTrue(A.observer_stage('capacity-run-'+str(index),['/usr/bin/python3','-B',str(A.RUNTIME/'run-capacity-owned.py'),'a'*40,'wsc-test','b'*64]))
        for name,argv in [('capacity-run-15',args),('capacity-run-01',args),('kernel-calibration',['/bin/sh']),('functional-run',args)]:
            with self.subTest(name=name),self.assertRaises(ValueError):A.observer_stage(name,argv)
        self.assertFalse(A.observer_stage('build-and-preview',['synthetic']))

    def test_darwin_never_installs_and_installer_time_charges_original_stage(self):
        args=['/usr/bin/python3','-B',str(A.RUNTIME/'calibrate-linux-runtime.py'),'a'*40,'b'*64];calls=[];writes=[]
        with patch.object(A.sys,'platform','darwin'),self.assertRaises(ValueError):A.prepare_stage('kernel-calibration',args,60,lambda *a,**kw:calls.append(a),lambda *a:None)
        self.assertEqual(calls,[])
        policy={'suite':{'pid':os.getpid()},'observer':{'argv':args,'argvSha256':'f'*64}};reply={'policy':policy,'policySha256':H.sha(H.canonical(policy)+b'\n')}
        def run(argv,**options):calls.append((argv,options));return json.dumps(reply).encode()
        with patch.object(A.sys,'platform','linux'),patch.object(A.time,'monotonic',side_effect=[10,13]):self.assertEqual(A.prepare_stage('kernel-calibration',args,60,run,lambda *a:writes.append(a)),57)
        self.assertEqual(len(writes),1);self.assertEqual(calls[0][0][:6],['/usr/bin/sudo','-n','/usr/bin/python3','-I','-B','-c'])
        bad={**reply,'policySha256':'0'*64}
        with patch.object(A.sys,'platform','linux'),self.assertRaises(ValueError):A.prepare_stage('kernel-calibration',args,60,lambda *a,**kw:json.dumps(bad).encode(),lambda *a:self.fail('bad pin persisted'))


if __name__=='__main__':unittest.main()
