"""Root opens/offers one FD; a fixed unprivileged gate alone writes self (0)."""
import array
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import select
import selectors
import signal
import socket
import stat
import struct
import subprocess
import sys
import time

ROOT=Path('/run/colorplay-attach')
MAXIMUM=16384
SECONDS=5
GATE="import os,sys\ncap=int(sys.argv[1]); fd=int(sys.argv[2]); ready=int(sys.argv[3])\nos.set_inheritable(cap,False)\ntry:\n    if os.write(cap,b'0\\n')!=2: raise OSError('SELF_ATTACH_SHORT_WRITE')\nfinally: os.close(cap)\nos.write(ready,b'R'); os.close(ready)\nvalue=os.read(fd,1); os.close(fd)\nvalue==b'1' or sys.exit(125)\nos.execve(sys.argv[4],sys.argv[4:],dict(os.environ))"
REQUEST_KEYS={'schemaVersion','attachNonce'}
POLICY_KEYS={'schemaVersion','instanceNonce','sourceRevision','jobSha256','contextSha256','bootSha256','helperSha256','suite','observer','leaf','node','gateSha256','suiteScriptPath','suiteScriptSha256'}
IDENTITY_KEYS={'pid','startTicks','uid','gid','exe','device','inode','exeSha256','argvSha256','ppid','state'}
PROOF_KEYS={'schemaVersion','result','requestSha256','policySha256','contextSha256','bootSha256','leafSha256','fdDevice','fdInode','rootCredentials','nonDumpable','receiverUnprivileged','receiverUserNamespace'}


def require(ok,code='ATTACH_REJECTED'):
    if not ok:raise ValueError(code)


def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def exact(value,keys):require(type(value)is dict and set(value)==keys);return value
def stable(row):return {k:v for k,v in row.items() if k!='state'}

def hex64(value):return isinstance(value,str) and re.fullmatch('[a-f0-9]{64}',value)is not None


def read(path,maximum=MAXIMUM):
    with open(path,'rb') as stream:
        value=stream.read(maximum+1)
    require(len(value)<=maximum);return value


def process(pid):
    raw=read(f'/proc/{pid}/stat');tail=raw[raw.rfind(b')')+2:].split()
    uid=next(x.split()[1:] for x in read(f'/proc/{pid}/status').splitlines() if x.startswith(b'Uid:'))
    gid=next(x.split()[1:] for x in read(f'/proc/{pid}/status').splitlines() if x.startswith(b'Gid:'))
    require(len(uid)==len(gid)==4 and len(set(uid))==len(set(gid))==1)
    info=os.stat(f'/proc/{pid}/exe');exe=os.readlink(f'/proc/{pid}/exe')
    with open(f'/proc/{pid}/exe','rb') as stream:
        digest=hashlib.file_digest(stream,'sha256').hexdigest()
    argv=read(f'/proc/{pid}/cmdline').split(b'\0');require(argv[-1]==b'');argv=argv[:-1]
    row={'pid':pid,'startTicks':int(tail[19]),'uid':int(uid[0]),'gid':int(gid[0]),'exe':exe,'device':info.st_dev,'inode':info.st_ino,'exeSha256':digest,'argvSha256':sha(b'\0'.join(argv)+b'\0'),'ppid':int(tail[1]),'state':tail[0].decode()}
    again=read(f'/proc/{pid}/stat');require(again[again.rfind(b')')+2:].split()[19]==tail[19]);return row,argv


def membership(pid):
    raw=read(f'/proc/{pid}/cgroup').decode().strip();require(raw.startswith('0::/') and '\n' not in raw);return raw[3:]


def secure_file(path,owner,mode,maximum=262144):
    require(path.is_absolute() and path.resolve()==path)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno());require(stat.S_ISREG(info.st_mode) and info.st_uid==owner and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==mode and info.st_size<=maximum)
        raw=stream.read(maximum+1);require(len(raw)<=maximum)
    return raw


def root_directory(path):
    require(path.is_absolute() and path.resolve()==path and path.parent==ROOT)
    for folder in [ROOT,path]:
        info=folder.lstat();require(stat.S_ISDIR(info.st_mode) and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o711)


def leaf_info(relative):
    require(isinstance(relative,str) and re.fullmatch('/colorplaygenerator[a-f0-9]{12}\\.slice/workload',relative))
    path=Path('/sys/fs/cgroup')/relative.lstrip('/');require(path.resolve()==path)
    info=path.lstat();procs=(path/'cgroup.procs').lstat()
    require(stat.S_ISDIR(info.st_mode) and stat.S_ISREG(procs.st_mode))
    return {'relativePath':relative,'device':info.st_dev,'inode':info.st_ino,'uid':info.st_uid,'procsDevice':procs.st_dev,'procsInode':procs.st_ino}


def load_policy(folder,key):
    root_directory(folder);require(hex64(key))
    raw=secure_file(folder/('policy-'+key+'.json'),0,0o400);policy=exact(json.loads(raw),POLICY_KEYS)
    require(policy['schemaVersion']==1 and policy['instanceNonce']==folder.name and re.fullmatch('[a-f0-9]{32}',folder.name))
    require(all(hex64(policy[k]) for k in ['jobSha256','contextSha256','bootSha256','helperSha256','gateSha256']))
    helper=secure_file(folder/'helper.py',0,0o500);require(sha(helper)==policy['helperSha256'] and sha(GATE.encode())==policy['gateSha256'])
    require(policy['observer']['argvSha256']==key)
    require(sha(read('/proc/sys/kernel/random/boot_id').strip())==policy['bootSha256'])
    return policy,sha(raw)


class Kernel:
    def process(self,pid):return process(pid)
    def membership(self,pid):return membership(pid)
    def leaf(self,relative):return leaf_info(relative)
    def script(self,path,owner):
        info=os.lstat(path);mode=stat.S_IMODE(info.st_mode);require(mode in {0o600,0o644})
        return sha(secure_file(Path(path),owner,mode))
    def unprivileged(self,pid):
        rows=read(f'/proc/{pid}/status').splitlines()
        no_caps=all(int(next(x.split()[1] for x in rows if x.startswith(k)),16)==0 for k in [b'CapEff:',b'CapPrm:',b'CapAmb:',b'CapInh:'])
        peer=os.stat(f'/proc/{pid}/ns/user');own=os.stat('/proc/self/ns/user')
        return no_caps and (peer.st_dev,peer.st_ino)==(own.st_dev,own.st_ino)
    def members(self,relative):return read(Path('/sys/fs/cgroup')/relative.lstrip('/')/'cgroup.procs').split()
    def capability(self,leaf):
        path=Path('/sys/fs/cgroup')/leaf['relativePath'].lstrip('/')/'cgroup.procs'
        fd=os.open(path,os.O_WRONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
        try:check_capability(fd,leaf);return fd
        except BaseException:os.close(fd);raise


def check_capability(fd,leaf):
    info=os.fstat(fd)
    require(stat.S_ISREG(info.st_mode) and (info.st_dev,info.st_ino)==(leaf['procsDevice'],leaf['procsInode']))
    require(fcntl.fcntl(fd,fcntl.F_GETFL)&os.O_ACCMODE==os.O_WRONLY)
    require(not os.get_inheritable(fd))


def offer(request,peer,policy,policy_sha,kernel=None):
    k=kernel or Kernel();exact(request,REQUEST_KEYS)
    require(type(request['schemaVersion'])is int and request['schemaVersion']==1 and re.fullmatch('[a-f0-9]{32}',request['attachNonce']))
    exact(policy,POLICY_KEYS);suite=exact(policy['suite'],IDENTITY_KEYS)
    actual_suite,_=k.process(suite['pid']);require(stable(actual_suite)==stable(suite) and actual_suite['state']!='Z')
    require(k.script(policy['suiteScriptPath'],suite['uid'])==policy['suiteScriptSha256'])
    parent,argv=k.process(peer[0]);observer=policy['observer']
    require(peer[1:]==(suite['uid'],suite['gid']) and parent['uid']==suite['uid'] and parent['gid']==suite['gid'] and parent['ppid']==suite['pid'] and parent['state']!='Z')
    require(parent['exeSha256']==suite['exeSha256'] and parent['exe']==suite['exe'] and parent['device']==suite['device'] and parent['inode']==suite['inode'] and parent['argvSha256']==observer['argvSha256'] and argv==[s.encode() for s in observer['argv']])
    require(k.script(observer['scriptPath'],suite['uid'])==observer['scriptSha256'] and k.membership(peer[0])==observer['sourceCgroup'] and k.unprivileged(peer[0]))
    leaf=policy['leaf'];require(k.leaf(leaf['relativePath'])==leaf and leaf['uid']==suite['uid'] and not k.members(leaf['relativePath']))
    fd=k.capability(leaf)
    try:
        require(stable(k.process(peer[0])[0])==stable(parent) and k.leaf(leaf['relativePath'])==leaf and not k.members(leaf['relativePath']))
        proof={'schemaVersion':1,'result':'CAPABILITY_OFFERED','requestSha256':sha(canonical(request)),'policySha256':policy_sha,'contextSha256':policy['contextSha256'],'bootSha256':policy['bootSha256'],'leafSha256':sha(canonical(leaf)),'fdDevice':leaf['procsDevice'],'fdInode':leaf['procsInode'],'rootCredentials':'ROOT_ALL_IDS_ZERO','nonDumpable':True,'receiverUnprivileged':True,'receiverUserNamespace':'SAME_AS_ROOT'}
        return proof,fd
    except BaseException:os.close(fd);raise


def recv(connection,expected=1):
    flags=getattr(socket,'MSG_CMSG_CLOEXEC',0)
    raw,ancillary,message_flags,_=connection.recvmsg(MAXIMUM,socket.CMSG_SPACE(4*4),flags)
    descriptors=[]
    try:
        for level,kind,data in ancillary:
            require(level==socket.SOL_SOCKET and kind==socket.SCM_RIGHTS)
            values=array.array('i');values.frombytes(data[:len(data)//values.itemsize*values.itemsize]);descriptors.extend(values)
            require(len(data)%values.itemsize==0)
        for fd in descriptors:os.set_inheritable(fd,False)
        require(not message_flags&(socket.MSG_TRUNC|socket.MSG_CTRUNC) and len(descriptors)==expected)
        require(raw and len(raw)<MAXIMUM);value=json.loads(raw)
        return value,descriptors.pop() if expected else None
    finally:
        for fd in descriptors:os.close(fd)


def send(connection,value,fd=None):
    raw=canonical(value)
    ancillary=[] if fd is None else [(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[fd]))]
    require(connection.sendmsg([raw],ancillary)==len(raw),'CAPABILITY_SEND_INCOMPLETE')


def root_credentials():
    require(sys.platform=='linux' and os.getresuid()==(0,0,0) and os.getresgid()==(0,0,0))
    rows=read('/proc/self/status').splitlines()
    require(all(next(x.split()[1:] for x in rows if x.startswith(k))==[b'0']*4 for k in [b'Uid:',b'Gid:']))
    libc=ctypes.CDLL(None,use_errno=True)
    require(libc.prctl(4,0,0,0,0)==0 and libc.prctl(3,0,0,0,0)==0,'ROOT_DUMPABLE_INVALID')


def serve(folder,key,nonce):
    root_credentials();require(re.fullmatch('[a-f0-9]{32}',nonce))
    policy,pin=load_policy(folder,key)
    lease=os.open(folder/('used-'+nonce),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400);os.close(lease)
    address=str(folder/('s-'+nonce));require(len(address.encode())<=107)
    signal.signal(signal.SIGALRM,lambda *_:(_ for _ in ()).throw(TimeoutError()));signal.alarm(SECONDS+3)
    with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as server:
        server.bind(address);os.chown(address,policy['suite']['uid'],policy['suite']['gid']);os.chmod(address,0o600);server.listen(1);server.settimeout(SECONDS)
        print(json.dumps({'kind':'READY','pid':os.getpid()}),flush=True)
        try:
            connection,_=server.accept()
            with connection:
                connection.settimeout(SECONDS)
                peer=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
                request,_=recv(connection,expected=0);require(request['attachNonce']==nonce)
                proof,fd=offer(request,peer,policy,pin)
                try:send(connection,proof,fd)
                finally:os.close(fd)
        finally:os.unlink(address)
    signal.alarm(0)


def client(ctx,request,deadline,cancelled=lambda:False):
    require(sys.platform=='linux' and not cancelled())
    folder=ROOT/ctx['instanceNonce'];root_directory(folder)
    key=sha(read('/proc/self/cmdline'));runtime=Path(__file__).resolve().parent
    mirror=json.loads(secure_file(runtime/('attach-authority-'+key+'.json'),os.getuid(),0o600))
    exact(mirror,{'policy','policySha256'});policy=exact(mirror['policy'],POLICY_KEYS);pin=mirror['policySha256']
    require(pin==sha(canonical(policy)+b'\n'))
    require(policy['instanceNonce']==ctx['instanceNonce'] and policy['sourceRevision']==ctx['sourceRevision'] and policy['contextSha256']==sha(secure_file(runtime/'execution-context.json',os.getuid(),0o600)))
    info=(folder/'helper.py').lstat();require(stat.S_ISREG(info.st_mode) and info.st_uid==0 and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==0o500)
    address=str(folder/('s-'+request['attachNonce']));require(len(address.encode())<=107)
    helper_deadline=min(deadline,time.monotonic()+SECONDS+3)
    remaining=lambda:max(0,helper_deadline-time.monotonic())
    process_handle=None;rootfd=capfd=None;success=False
    try:
        require(remaining()>0 and not cancelled())
        process_handle=subprocess.Popen(['/usr/bin/sudo','-n','/usr/bin/python3','-I','-B',str(folder/'helper.py'),'--serve',ctx['instanceNonce'],key,request['attachNonce']],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env={'PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1'},close_fds=True)
        with selectors.DefaultSelector() as selector:
            selector.register(process_handle.stdout,selectors.EVENT_READ)
            hello=bytearray()
            while not hello.endswith(b'\n'):
                require(len(hello)<MAXIMUM and selector.select(remaining()))
                part=os.read(process_handle.stdout.fileno(),1);require(part);hello.extend(part)
            ready=json.loads(hello)
        require(type(ready)is dict and set(ready)=={'kind','pid'} and ready['kind']=='READY' and type(ready['pid'])is int)
        rootfd=os.pidfd_open(ready['pid']);require(not select.select([rootfd],[],[],0)[0] and not cancelled())
        with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as connection:
            connection.settimeout(remaining());connection.connect(address)
            peer=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
            require(peer==(ready['pid'],0,0),'ROOT_SERVER_PEER_INVALID');send(connection,request)
            proof,capfd=recv(connection);exact(proof,PROOF_KEYS)
        process_handle.wait(timeout=remaining())
        require(process_handle.returncode==0 and select.select([rootfd],[],[],0)[0])
        expected={'schemaVersion':1,'result':'CAPABILITY_OFFERED','requestSha256':sha(canonical(request)),'policySha256':pin,'contextSha256':policy['contextSha256'],'bootSha256':policy['bootSha256'],'leafSha256':sha(canonical(policy['leaf'])),'fdDevice':policy['leaf']['procsDevice'],'fdInode':policy['leaf']['procsInode'],'rootCredentials':'ROOT_ALL_IDS_ZERO','nonDumpable':True,'receiverUnprivileged':True,'receiverUserNamespace':'SAME_AS_ROOT'}
        require(proof==expected and not cancelled() and time.monotonic()<deadline)
        check_capability(capfd,policy['leaf']);success=True
    finally:
        try:
            if process_handle is not None:process_handle.wait(timeout=remaining())
            require(rootfd is None or bool(select.select([rootfd],[],[],0)[0]),'ROOT_HELPER_CLOSE_UNKNOWN')
        except BaseException:
            success=False;raise
        finally:
            if capfd is not None and not success:os.close(capfd)
            if rootfd is not None:os.close(rootfd)
            if process_handle is not None and process_handle.stdout:process_handle.stdout.close()
    if cancelled() or time.monotonic()>=deadline:
        os.close(capfd);raise ValueError('CAPABILITY_CANCELLED')
    return capfd


if __name__=='__main__':
    try:
        require(len(sys.argv)==5 and sys.argv[1]=='--serve' and re.fullmatch('[a-f0-9]{32}',sys.argv[2]))
        serve(ROOT/sys.argv[2],sys.argv[3],sys.argv[4])
    except BaseException:sys.exit(1)
