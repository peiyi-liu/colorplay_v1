"""One approved Edge pidfd SIGTERM. No caller PID/path/signal authority."""
import hashlib
import json
import math
import time

IMAGE = 'sha256:72d69a90c0d4e46dcf93197dc5a6cc2d16483c7148c637ccf3d58db04943e077'
EXE_SHA = '3b7c6b9cc472f49fa7719a7f8988d099b1196d8fd0890cf2bd81c9480de57826'
EXE_BYTES = 165260008
NAME = '/supabase_edge_runtime_cp-whole-site-261115'
ROOT_PROGRAM = r'''
import hashlib,json,math,os,re,select,signal,stat,subprocess,sys,time
IMAGE='sha256:72d69a90c0d4e46dcf93197dc5a6cc2d16483c7148c637ccf3d58db04943e077'
EXE_SHA='3b7c6b9cc472f49fa7719a7f8988d099b1196d8fd0890cf2bd81c9480de57826'
EXE_BYTES=165260008
NAME='/supabase_edge_runtime_cp-whole-site-261115'
def need(ok):
 if not ok:raise ValueError('OWNED_EDGE_REJECTED')
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def unique(pairs):
 result={}
 for key,value in pairs:need(key not in result);result[key]=value
 return result
def decode(raw):return json.loads(raw,object_pairs_hook=unique)
def exact(value,keys):need(type(value)is dict and set(value)==set(keys));return value

def policy(value):
 exact(value,{'schemaVersion','planBytes','approvedPlanSha256','contextBytes','deadlineMonotonic'})
 need(type(value['schemaVersion'])is int and value['schemaVersion']==1 and type(value['planBytes'])is str and type(value['contextBytes'])is str)
 raw=value['planBytes'].encode();context_raw=value['contextBytes'].encode()
 need(len(raw)<=1048576 and len(context_raw)<=262144 and sha(raw)==value['approvedPlanSha256'])
 plan=decode(raw);ctx=decode(context_raw)
 need(plan['schemaVersion']==1 and plan['confirmation']=='LOCAL_LINUX_SNAPSHOT_ONCE' and plan['projectId']==ctx['projectId']=='cp-whole-site-261115')
 need(re.fullmatch('[a-f0-9]{40}',plan['sourceRevision']) and plan['sourceRevision']==ctx['sourceRevision'])
 nonce=plan['instanceNonce'];need(re.fullmatch('[a-f0-9]{32}',nonce) and ctx['instanceNonce']==nonce)
 need(sha(context_raw)==plan['executionContextSha256'])
 job=exact(ctx['job'],{'repository','runId','runAttempt','jobName'})
 need(job['repository']=='peiyi-liu/colorplay_v1' and re.fullmatch('[0-9]{1,20}',job['runId']) and type(job['runAttempt'])is int and job['runAttempt']==1 and job['jobName']=='capacity-linux')
 need(sha(canonical(job))==plan['jobIdentitySha256'])
 backend='/colorplaybackend'+nonce[:12]+'.slice';need(ctx['backendCgroupRelativePath']==backend)
 need(ctx['generatorCgroupRelativePath']=='/colorplaygenerator'+nonce[:12]+'.slice/workload')
 need(len(plan['containers'])==len(ctx['containers'])==8)
 need(sorted([{k:r[k] for k in ['role','id','name','imageId']} for r in plan['containers']],key=lambda r:r['role'])==sorted(ctx['containers'],key=lambda r:r['role']))
 roles=[r['role'] for r in ctx['containers']];need(set(roles)=={'db','auth','rest','realtime','storage','edge_runtime','kong','inbucket'})
 ids=[r['id'] for r in ctx['containers']];need(len(set(ids))==8 and all(re.fullmatch('[a-f0-9]{64}',x) for x in ids))
 edge=next(r for r in ctx['containers'] if r['role']=='edge_runtime');need(edge['name']==NAME and edge['imageId']==IMAGE)
 boot=plan['preview']['hostBootIdSha256'];need(re.fullmatch('[a-f0-9]{64}',boot))
 end=value['deadlineMonotonic'];need(type(end)in (float,int) and math.isfinite(end))
 bindings={'sourceRevision':plan['sourceRevision'],'approvedPlanSha256':value['approvedPlanSha256'],'contextSha256':sha(context_raw),'jobSha256':plan['jobIdentitySha256'],'bootSha256':boot,'instanceNonce':nonce,'edgeIdSha256':sha(edge['id'].encode()),'imageId':IMAGE,'executableSha256':EXE_SHA}
 return edge,backend,boot,end,bindings

def run_request(value,ports):
 started=ports.clock();fds=[];sent='NOT_SENT';bindings=None;init_hash=child_hash=None;error='UNKNOWN';identity='UNKNOWN';closed=True;stage='POLICY';failure_stage=None
 try:
  edge,backend,boot,end,bindings=policy(value)
  need(started<end<=started+10)
  def check():need(ports.clock()<end)
  stage='BOOT';ports.authorize(end);check();need(ports.boot()==boot)
  stage='INSPECT'
  before=ports.inspect(edge['id']);need(before['id']==edge['id'] and before['name']==NAME and before['image']==IMAGE and before['running']is True and before['restarting']is False and before['dead']is False and before['restart']=='no' and before['autoRemove']is False and before['init']is None)
  pid=before['pid'];need(type(pid)is int and pid>1)
  stage='PIDFD';init_fd=ports.open_pidfd(pid);fds.append(init_fd);check()
  stage='INIT';init=ports.process(pid)
  need(init['pid']==pid and init['nspid'][-1]==1 and len(init['nspid'])>=2 and init['uid']==[0]*4 and init['gid']==[0]*4 and init['userns']==ports.user_namespace())
  need(init['exe'] in {'/bin/sh','/usr/bin/sh','/bin/dash','/usr/bin/dash','/bin/bash','/usr/bin/bash'})
  need(init['cgroup'] in {backend+'/docker-'+edge['id']+'.scope',backend+'/'+edge['id']})
  stage='SELECT';children=ports.children(pid);need(type(children)is list and len(children)==1 and type(children[0])is int and children[0]>1)
  child_pid=children[0];stage='PIDFD';child_fd=ports.open_pidfd(child_pid);fds.append(child_fd);check()
  stage='SELECT';child=ports.process(child_pid)
  need(child['pid']==child_pid and child['ppid']==pid and child['uid']==init['uid'] and child['gid']==init['gid'] and child['userns']==init['userns'] and child['pidns']==init['pidns'] and child['nspid'][-1]>1 and child['cgroup']==init['cgroup'] and child['exe']=='/usr/local/bin/edge-runtime')
  stage='BINARY';binary=ports.binary(child_pid);need(binary['bytes']==EXE_BYTES and binary['sha256']==EXE_SHA and binary['device']==child['exeDevice'] and binary['inode']==child['exeInode'])
  stage='REVALIDATE';check();need(ports.process(pid)==init and ports.process(child_pid)==child and ports.children(pid)==children)
  need(ports.inspect(edge['id'])==before and ports.boot()==boot and ports.alive(init_fd) and ports.alive(child_fd))
  init_hash=sha(canonical(init));child_hash=sha(canonical(child));identity='VERIFIED';check()
  stage='SIGNAL';sent='UNKNOWN_MAY_HAVE_BEEN_SENT'
  try:ports.send(child_fd)
  except OSError as failure:
   if failure.errno in (1,3):sent='NOT_SENT'
   raise
  sent='SENT';check();error=None
 except Exception as failure:
  failure_stage=stage;number=getattr(failure,'errno',None);error={1:'EPERM',3:'ESRCH',13:'EACCES'}.get(number,'UNKNOWN')
 finally:
  for fd in reversed(fds):
   try:ports.close(fd)
   except Exception:
    closed=False
    if failure_stage is None:failure_stage='CLOSE'
 return {'schemaVersion':1,'kind':'ROOT_OWNED_EDGE_TERMINATION','result':'SENT' if error is None and closed else 'UNATTESTED','signal':'SIGTERM','signalState':sent,'identity':identity,'bindings':bindings,'initIdentitySha256':init_hash,'runtimeIdentitySha256':child_hash,'fdClosure':'VERIFIED' if closed else 'UNKNOWN','elapsedMs':(ports.clock()-started)*1000,'errno':error,'failureStage':failure_stage}

class NativePorts:
 def __init__(self):self.end=self.clock()+10
 def clock(self):return time.monotonic()
 def check(self):need(self.clock()<self.end)
 def authorize(self,end):
  need(sys.platform=='linux' and os.getresuid()==(0,0,0) and os.getresgid()==(0,0,0));self.end=min(self.end,end)
  def expired(*_):raise TimeoutError('OWNED_EDGE_DEADLINE')
  signal.signal(signal.SIGALRM,expired);signal.setitimer(signal.ITIMER_REAL,max(0.001,self.end-self.clock()))
 def read(self,path,maximum=16384):
  self.check();fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
  with os.fdopen(fd,'rb') as stream:
   need(stat.S_ISREG(os.fstat(stream.fileno()).st_mode));raw=stream.read(maximum+1)
  need(len(raw)<=maximum);return raw.decode('ascii')
 def boot(self):return sha(self.read('/proc/sys/kernel/random/boot_id').strip().encode())
 def user_namespace(self):return os.stat('/proc/self/ns/user').st_ino
 def inspect(self,identifier):
  self.check()
  format='{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Image}},"pid":{{json .State.Pid}},"running":{{json .State.Running}},"restarting":{{json .State.Restarting}},"dead":{{json .State.Dead}},"restart":{{json .HostConfig.RestartPolicy.Name}},"autoRemove":{{json .HostConfig.AutoRemove}},"init":{{json .HostConfig.Init}}}'
  result=subprocess.run(['/usr/bin/docker','--host','unix:///var/run/docker.sock','inspect','--format',format,identifier],capture_output=True,env={'PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1'},timeout=min(2,self.end-self.clock()))
  need(result.returncode==0 and len(result.stdout)<=16384);self.check();return decode(result.stdout)
 def process(self,pid):
  base='/proc/'+str(pid);text=self.read(base+'/stat');parts=text[text.rfind(')')+2:].split()
  rows=dict(line.split(':',1) for line in self.read(base+'/status').splitlines() if ':' in line)
  need(int(rows['Tgid'])==pid and int(rows['TracerPid'])==0 and parts[0] not in {'Z','X','x'})
  exe=base+'/exe';info=os.stat(exe)
  group=self.read(base+'/cgroup').strip();need(group.startswith('0::/') and '\n' not in group)
  return {'pid':pid,'ppid':int(parts[1]),'startTicks':int(parts[19]),'uid':[int(x) for x in rows['Uid'].split()],'gid':[int(x) for x in rows['Gid'].split()],'nspid':[int(x) for x in rows['NSpid'].split()],'pidns':os.stat(base+'/ns/pid').st_ino,'userns':os.stat(base+'/ns/user').st_ino,'exe':os.readlink(exe),'exeDevice':info.st_dev,'exeInode':info.st_ino,'exeSize':info.st_size,'exeMtimeNs':info.st_mtime_ns,'exeCtimeNs':info.st_ctime_ns,'cgroup':group[3:]}
 def children(self,pid):return [int(x) for x in self.read('/proc/'+str(pid)+'/task/'+str(pid)+'/children').split()]
 def binary(self,pid):
  self.check();fd=os.open('/proc/'+str(pid)+'/exe',os.O_RDONLY)
  with os.fdopen(fd,'rb') as stream:
   before=os.fstat(stream.fileno());need(stat.S_ISREG(before.st_mode) and before.st_size==EXE_BYTES)
   digest=hashlib.sha256();size=0
   while chunk:=stream.read(1048576):self.check();size+=len(chunk);need(size<=EXE_BYTES);digest.update(chunk)
   after=os.fstat(stream.fileno())
   fields=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
   need(size==EXE_BYTES and fields(before)==fields(after))
  self.check();return {'bytes':size,'sha256':digest.hexdigest(),'device':before.st_dev,'inode':before.st_ino}
 def open_pidfd(self,pid):self.check();return os.pidfd_open(pid)
 def alive(self,fd):return not select.select([fd],[],[],0)[0]
 def send(self,fd):self.check();signal.pidfd_send_signal(fd,signal.SIGTERM)
 def close(self,fd):os.close(fd)

if __name__=='__main__':
 started=time.monotonic();invoked=False
 try:
  native=NativePorts();native.authorize(native.end)
  value=decode(sys.stdin.buffer.read(2097153));need(len(canonical(value))<=2097152)
  invoked=True;result=run_request(value,native)
 except Exception:
  result={'schemaVersion':1,'kind':'ROOT_OWNED_EDGE_TERMINATION','result':'UNATTESTED','signal':'SIGTERM','signalState':'UNKNOWN_MAY_HAVE_BEEN_SENT' if invoked else 'NOT_SENT','identity':'UNKNOWN','bindings':None,'initIdentitySha256':None,'runtimeIdentitySha256':None,'fdClosure':'UNKNOWN','elapsedMs':(time.monotonic()-started)*1000,'errno':'UNKNOWN','failureStage':'UNKNOWN' if invoked else 'POLICY'}
 print(json.dumps(result),flush=True)
'''


def digest(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()


class EdgeShutdownError(Exception):
    def __init__(self,evidence):
        super().__init__('SNAPSHOT_EDGE_SHUTDOWN_UNVERIFIED');self.evidence=evidence


def bindings(plan_raw,approved,context_raw):
    if digest(plan_raw)!=approved:raise ValueError('SNAPSHOT_EDGE_APPROVAL_INVALID')
    plan=json.loads(plan_raw);ctx=json.loads(context_raw)
    if digest(context_raw)!=plan['executionContextSha256']:raise ValueError('SNAPSHOT_EDGE_CONTEXT_INVALID')
    row=next(r for r in plan['containers'] if r['role']=='edge_runtime')
    return {'sourceRevision':plan['sourceRevision'],'approvedPlanSha256':approved,'contextSha256':digest(context_raw),
        'jobSha256':plan['jobIdentitySha256'],'bootSha256':plan['preview']['hostBootIdSha256'],
        'instanceNonce':plan['instanceNonce'],'edgeIdSha256':digest(row['id'].encode()),'imageId':IMAGE,'executableSha256':EXE_SHA}


def perform(plan_raw,approved,context_raw,run,check,clock=time.monotonic,deadline=None):
    evidence={'status':'UNATTESTED','signalState':'NOT_SENT','helperClosed':'UNKNOWN','rootProgramSha256':digest(ROOT_PROGRAM.encode()),'proof':None}
    try:
        check();started=clock();end=min(deadline,started+10)
        expected=bindings(plan_raw,approved,context_raw)
        if not math.isfinite(end) or end<=started:raise ValueError('SNAPSHOT_EDGE_DEADLINE')
        request={'schemaVersion':1,'planBytes':plan_raw.decode(),'approvedPlanSha256':approved,'contextBytes':context_raw.decode(),'deadlineMonotonic':end}
        evidence['signalState']='UNKNOWN_MAY_HAVE_BEEN_SENT'
        raw,closed=run(['/usr/bin/sudo','-n','/usr/bin/python3','-I','-B','-c',ROOT_PROGRAM],data=canonical(request),timeout=end-started,maximum=32768)
        evidence['helperClosed']=closed
        value=json.loads(raw)
        keys={'schemaVersion','kind','result','signal','signalState','identity','bindings','initIdentitySha256','runtimeIdentitySha256','fdClosure','elapsedMs','errno','failureStage'}
        if type(value)is not dict or set(value)!=keys:raise ValueError('SNAPSHOT_EDGE_PROOF_INVALID')
        if value['failureStage'] not in {None,'POLICY','BOOT','INSPECT','INIT','SELECT','PIDFD','BINARY','REVALIDATE','SIGNAL','CLOSE','UNKNOWN'}:raise ValueError('SNAPSHOT_EDGE_PROOF_INVALID')
        if value['signalState'] in {'SENT','NOT_SENT','UNKNOWN_MAY_HAVE_BEEN_SENT'}:evidence['signalState']=value['signalState']
        evidence['proof']=value
        check()
        if not (closed is True and clock()<end and valid_proof(value,expected)):raise ValueError('SNAPSHOT_EDGE_PROOF_INVALID')
        evidence['status']='VERIFIED';return evidence
    except BaseException as error:raise EdgeShutdownError(evidence) from error


def valid_proof(proof,expected):
    keys={'schemaVersion','kind','result','signal','signalState','identity','bindings','initIdentitySha256','runtimeIdentitySha256','fdClosure','elapsedMs','errno','failureStage'}
    if type(proof)is not dict or set(proof)!=keys:return False
    return type(proof['schemaVersion'])is int and proof['schemaVersion']==1 and proof['kind']=='ROOT_OWNED_EDGE_TERMINATION' and proof['result']=='SENT' and proof['signal']=='SIGTERM' and proof['signalState']=='SENT' and proof['identity']=='VERIFIED' and proof['bindings']==expected and proof['fdClosure']=='VERIFIED' and proof['errno'] is None and proof['failureStage'] is None and all(isinstance(proof[k],str) and len(proof[k])==64 and all(c in '0123456789abcdef' for c in proof[k]) for k in ['initIdentitySha256','runtimeIdentitySha256']) and type(proof['elapsedMs'])in (int,float) and math.isfinite(proof['elapsedMs']) and 0<=proof['elapsedMs']<=10000


def eligible15(evidence,expected,diagnostic):
    try:
        proof=evidence['proof'];signals=diagnostic['signals']
        return evidence['status']=='VERIFIED' and evidence['signalState']=='SENT' and evidence['helperClosed'] is True and evidence['rootProgramSha256']==digest(ROOT_PROGRAM.encode()) and valid_proof(proof,expected) and isinstance(signals,list) and 'SIGTERM_RECEIVED' in signals and not set(signals)&{'GRACEFUL_TIMEOUT','DRAIN_INTERRUPTED','DRAIN_DISABLED'}
    except (TypeError,KeyError):return False
