"""Closed Edge/Kong/DB normal pidfd signal; no caller PID/path/signal authority."""
import hashlib
import json
import math
import time

IMAGE = 'sha256:72d69a90c0d4e46dcf93197dc5a6cc2d16483c7148c637ccf3d58db04943e077'
EXE_SHA = '3b7c6b9cc472f49fa7719a7f8988d099b1196d8fd0890cf2bd81c9480de57826'
EXE_BYTES = 165260008
NAME = '/supabase_edge_runtime_cp-whole-site-261115'
TARGETS={
 'edge_runtime':{'name':NAME,'image':IMAGE,'exe':'/usr/local/bin/edge-runtime','bytes':EXE_BYTES,'sha256':EXE_SHA,'initUid':0,'initGid':0,'uid':0,'gid':0,'signal':'SIGTERM','shells':['/bin/sh','/usr/bin/sh','/bin/dash','/usr/bin/dash','/bin/bash','/usr/bin/bash'],'shellBytes':None,'shellSha256':None},
 'db':{'name':'/supabase_db_cp-whole-site-261115','image':'sha256:2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a','exe':'/nix/store/l1g3sy2n4qxsbjjqy4yl1nm4p8wqi7zv-postgresql-and-plugins-17.6/bin/.postgres-wrapped','bytes':11284888,'sha256':'3794a95bd1c4b8224bb7b0af1aa5ff5f0ed16e61dd911fc82a1249739c7f4463','initUid':0,'initGid':0,'uid':100,'gid':101,'signal':'SIGINT','shells':['/bin/busybox'],'shellBytes':804616,'shellSha256':'f3547b3d78d08a028a4833ddb83b77cf012838c078bfd2b76355f53d1d8bba62'},
 'kong':{'name':'/supabase_kong_cp-whole-site-261115','image':'sha256:3cefb958bcd694597b65adc00053a762b1f9a6df3c6031af528d052d75a64e1a','exe':'/usr/local/openresty/nginx/sbin/nginx','bytes':14996672,'sha256':'854b17f3b5594f2ef5efcf46f33abd2aa3b06e0b1b8bc8694c97eb92f01f29d6','initUid':100,'initGid':65533,'uid':100,'gid':65533,'signal':'SIGQUIT','shells':['/bin/busybox'],'shellBytes':841376,'shellSha256':'28a60362bdd0a77dcbc5294ef9cdfd256c19c3ee391a24489a42c74be26fde9f'}}
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
 need(set(value) in ({'schemaVersion','planBytes','approvedPlanSha256','contextBytes','deadlineMonotonic'},{'schemaVersion','planBytes','approvedPlanSha256','contextBytes','deadlineMonotonic','targetRole'}))
 role=value.get('targetRole','edge_runtime');need(type(role)is str and role in TARGETS);target=TARGETS[role]
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
 edge=next(r for r in ctx['containers'] if r['role']==role);need(edge['name']==target['name'] and edge['imageId']==target['image'])
 boot=plan['preview']['hostBootIdSha256'];need(re.fullmatch('[a-f0-9]{64}',boot))
 end=value['deadlineMonotonic'];need(type(end)in (float,int) and math.isfinite(end))
 bindings={'sourceRevision':plan['sourceRevision'],'approvedPlanSha256':value['approvedPlanSha256'],'contextSha256':sha(context_raw),'jobSha256':plan['jobIdentitySha256'],'bootSha256':boot,'instanceNonce':nonce,'edgeIdSha256':sha(edge['id'].encode()),'imageId':target['image'],'executableSha256':target['sha256'],'targetRole':role}
 return edge,backend,boot,end,bindings,target

def run_request(value,ports):
 started=ports.clock();fds=[];sent='NOT_SENT';bindings=None;init_hash=child_hash=None;error='UNKNOWN';identity='UNKNOWN';closed=True;stage='POLICY';failure_stage=None;target=TARGETS['edge_runtime']
 try:
  edge,backend,boot,end,bindings,target=policy(value)
  need(started<end<=started+10)
  def check():need(ports.clock()<end)
  stage='BOOT';ports.authorize(end);check();need(ports.boot()==boot)
  stage='INSPECT'
  before=ports.inspect(edge['id']);need(before['id']==edge['id'] and before['name']==target['name'] and before['image']==target['image'] and before['running']is True and before['restarting']is False and before['dead']is False and before['restart']=='no' and before['autoRemove']is False and (before['init']is None or before['init']is False) and not before['paused'] and not before['oom'] and not before['error'] and before['retry']==0 and type(before['restartCount'])is int and before['restartCount']>=0)
  pid=before['pid'];need(type(pid)is int and pid>1)
  stage='PIDFD';init_fd=ports.open_pidfd(pid);fds.append(init_fd);check()
  stage='INIT';init=ports.process(pid)
  need(init['pid']==pid and init['nspid'][-1]==1 and len(init['nspid'])>=2 and init['uid']==[target['initUid']]*4 and init['gid']==[target['initGid']]*4 and init['userns']==ports.user_namespace())
  need(init['exe'] in target['shells'])
  if target['shellBytes']:
   shell=ports.binary(pid,target['shellBytes']);need(shell['bytes']==target['shellBytes'] and shell['sha256']==target['shellSha256'] and shell['device']==init['exeDevice'] and shell['inode']==init['exeInode'])
  need(init['cgroup'] in {backend+'/docker-'+edge['id']+'.scope',backend+'/'+edge['id']})
  stage='SELECT';children=ports.children(pid);need(type(children)is list and 1<=len(children)<=64 and all(type(p)is int and p>1 for p in children) and len(set(children))==len(children))
  candidates=[]
  for candidate in children:
   item=ports.process(candidate)
   if item['exe']==target['exe'] and item['pid']==candidate and item['ppid']==pid and item['uid']==[target['uid']]*4 and item['gid']==[target['gid']]*4 and item['userns']==init['userns'] and item['pidns']==init['pidns'] and item['nspid'][-1]>1 and item['cgroup']==init['cgroup']:candidates.append(item)
  need(len(candidates)==1);child=candidates[0];child_pid=child['pid']
  stage='PIDFD';child_fd=ports.open_pidfd(child_pid);fds.append(child_fd);check();need(ports.process(child_pid)==child)
  stage='BINARY';binary=ports.binary(child_pid,target['bytes']);need(binary['bytes']==target['bytes'] and binary['sha256']==target['sha256'] and binary['device']==child['exeDevice'] and binary['inode']==child['exeInode'])
  stage='REVALIDATE';check();need(ports.process(pid)==init and ports.process(child_pid)==child and ports.children(pid)==children)
  need(ports.inspect(edge['id'])==before and ports.boot()==boot and ports.alive(init_fd) and ports.alive(child_fd))
  init_hash=sha(canonical(init));child_hash=sha(canonical(child));identity='VERIFIED';check()
  stage='SIGNAL';sent='UNKNOWN_MAY_HAVE_BEEN_SENT'
  try:ports.send(child_fd,target['signal'])
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
 return {'schemaVersion':1,'kind':'ROOT_OWNED_SERVICE_TERMINATION','result':'SENT' if error is None and closed else 'UNATTESTED','signal':target['signal'],'signalState':sent,'identity':identity,'bindings':bindings,'initIdentitySha256':init_hash,'runtimeIdentitySha256':child_hash,'fdClosure':'VERIFIED' if closed else 'UNKNOWN','elapsedMs':(ports.clock()-started)*1000,'errno':error,'failureStage':failure_stage,'inspectDiagnostic':getattr(ports,'inspect_diagnostic',None)}

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
  self.check();self.inspect_diagnostic={'stage':'COMMAND','exitCode':None,'stdoutBytes':None,'stderrBytes':None,'stdoutSha256':None,'stderrSha256':None,'requiredFields':False,'fieldsPresent':False,'fieldTypesValid':False,'identityMatches':False,'initState':'UNKNOWN'}
  result=subprocess.run(['/usr/bin/docker','--host','unix:///var/run/docker.sock','inspect',identifier],capture_output=True,env={'PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1'},timeout=min(2,self.end-self.clock()))
  d=self.inspect_diagnostic;d.update(exitCode=result.returncode,stdoutBytes=len(result.stdout),stderrBytes=len(result.stderr),stdoutSha256=sha(result.stdout),stderrSha256=sha(result.stderr))
  need(result.returncode==0 and len(result.stdout)<=262144 and len(result.stderr)<=16384);self.check()
  d['stage']='DECODE';rows=decode(result.stdout)
  d['stage']='SHAPE';need(type(rows)is list and len(rows)==1 and type(rows[0])is dict)
  row=rows[0];need(all(k in row for k in ['Id','Name','Image','RestartCount','State','HostConfig']))
  state=row['State'];host=row['HostConfig'];need(type(state)is dict and type(host)is dict and type(host.get('RestartPolicy'))is dict);restart=host['RestartPolicy']
  d['fieldsPresent']=all(k in state for k in ['Pid','Running','Paused','Restarting','Dead','OOMKilled','Error']) and all(k in host for k in ['RestartPolicy','AutoRemove']) and all(k in restart for k in ['Name','MaximumRetryCount']);need(d['fieldsPresent'])
  need(all(type(row[k])is str for k in ['Id','Name','Image']) and type(row['RestartCount'])is int and row['RestartCount']>=0)
  need(type(state['Pid'])is int and state['Pid']>=0 and all(type(state[k])is bool for k in ['Running','Paused','Restarting','Dead','OOMKilled']) and type(state['Error'])is str)
  need(type(restart['Name'])is str and type(restart['MaximumRetryCount'])is int and restart['MaximumRetryCount']>=0 and type(host['AutoRemove'])is bool)
  init='ABSENT' if 'Init' not in host else 'NULL' if host['Init']is None else 'FALSE' if host['Init']is False else 'UNKNOWN'
  d['initState']=init;need(init!='UNKNOWN');d['fieldTypesValid']=True;d['requiredFields']=True
  d['stage']='MATCH';d['identityMatches']=row['Id']==identifier and any(row['Name']==v['name'] and row['Image']==v['image'] for v in TARGETS.values());need(d['identityMatches'])
  return {'id':row['Id'],'name':row['Name'],'image':row['Image'],'pid':state['Pid'],'running':state['Running'],'paused':state['Paused'],'restarting':state['Restarting'],'dead':state['Dead'],'oom':state['OOMKilled'],'error':bool(state['Error']),'restart':restart['Name'],'retry':restart['MaximumRetryCount'],'restartCount':row['RestartCount'],'autoRemove':host['AutoRemove'],'init':None if init!='FALSE' else False,'initState':init}
 def process(self,pid):
  base='/proc/'+str(pid);text=self.read(base+'/stat');parts=text[text.rfind(')')+2:].split()
  rows=dict(line.split(':',1) for line in self.read(base+'/status').splitlines() if ':' in line)
  need(int(rows['Tgid'])==pid and int(rows['TracerPid'])==0 and parts[0] not in {'Z','X','x'})
  exe=base+'/exe';info=os.stat(exe)
  group=self.read(base+'/cgroup').strip();need(group.startswith('0::/') and '\n' not in group)
  return {'pid':pid,'ppid':int(parts[1]),'startTicks':int(parts[19]),'uid':[int(x) for x in rows['Uid'].split()],'gid':[int(x) for x in rows['Gid'].split()],'nspid':[int(x) for x in rows['NSpid'].split()],'pidns':os.stat(base+'/ns/pid').st_ino,'userns':os.stat(base+'/ns/user').st_ino,'exe':os.readlink(exe),'exeDevice':info.st_dev,'exeInode':info.st_ino,'exeSize':info.st_size,'exeMtimeNs':info.st_mtime_ns,'exeCtimeNs':info.st_ctime_ns,'cgroup':group[3:]}
 def children(self,pid):return [int(x) for x in self.read('/proc/'+str(pid)+'/task/'+str(pid)+'/children').split()]
 def binary(self,pid,expected_bytes=EXE_BYTES):
  self.check();fd=os.open('/proc/'+str(pid)+'/exe',os.O_RDONLY)
  with os.fdopen(fd,'rb') as stream:
   before=os.fstat(stream.fileno());need(stat.S_ISREG(before.st_mode) and before.st_size==expected_bytes)
   digest=hashlib.sha256();size=0
   while chunk:=stream.read(1048576):self.check();size+=len(chunk);need(size<=expected_bytes);digest.update(chunk)
   after=os.fstat(stream.fileno())
   fields=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
   need(size==expected_bytes and fields(before)==fields(after))
  self.check();return {'bytes':size,'sha256':digest.hexdigest(),'device':before.st_dev,'inode':before.st_ino}
 def open_pidfd(self,pid):self.check();return os.pidfd_open(pid)
 def alive(self,fd):return not select.select([fd],[],[],0)[0]
 def send(self,fd,signal_name):self.check();signal.pidfd_send_signal(fd,{'SIGTERM':signal.SIGTERM,'SIGINT':signal.SIGINT,'SIGQUIT':signal.SIGQUIT}[signal_name])
 def close(self,fd):os.close(fd)

if __name__=='__main__':
 started=time.monotonic();invoked=False
 try:
  native=NativePorts();native.authorize(native.end)
  value=decode(sys.stdin.buffer.read(2097153));need(len(canonical(value))<=2097152)
  invoked=True;result=run_request(value,native)
 except Exception:
  result={'schemaVersion':1,'kind':'ROOT_OWNED_SERVICE_TERMINATION','result':'UNATTESTED','signal':'SIGTERM','signalState':'UNKNOWN_MAY_HAVE_BEEN_SENT' if invoked else 'NOT_SENT','identity':'UNKNOWN','bindings':None,'initIdentitySha256':None,'runtimeIdentitySha256':None,'fdClosure':'UNKNOWN','elapsedMs':(time.monotonic()-started)*1000,'errno':'UNKNOWN','failureStage':'UNKNOWN' if invoked else 'POLICY','inspectDiagnostic':getattr(locals().get('native'),'inspect_diagnostic',None)}
 print(json.dumps(result),flush=True)
'''
ROOT_PROGRAM=ROOT_PROGRAM.replace('def need(ok):', 'TARGETS='+repr(TARGETS)+'\ndef need(ok):',1)


def digest(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()


class EdgeShutdownError(Exception):
    def __init__(self,evidence):
        super().__init__('SNAPSHOT_EDGE_SHUTDOWN_UNVERIFIED');self.evidence=evidence


def bindings(plan_raw,approved,context_raw,target_role='edge_runtime'):
    if target_role not in TARGETS:raise ValueError('SNAPSHOT_SERVICE_ROLE_INVALID')
    target=TARGETS[target_role]
    if digest(plan_raw)!=approved:raise ValueError('SNAPSHOT_EDGE_APPROVAL_INVALID')
    plan=json.loads(plan_raw);ctx=json.loads(context_raw)
    if digest(context_raw)!=plan['executionContextSha256']:raise ValueError('SNAPSHOT_EDGE_CONTEXT_INVALID')
    row=next(r for r in plan['containers'] if r['role']==target_role)
    return {'sourceRevision':plan['sourceRevision'],'approvedPlanSha256':approved,'contextSha256':digest(context_raw),
        'jobSha256':plan['jobIdentitySha256'],'bootSha256':plan['preview']['hostBootIdSha256'],
        'instanceNonce':plan['instanceNonce'],'edgeIdSha256':digest(row['id'].encode()),'imageId':target['image'],'executableSha256':target['sha256'],'targetRole':target_role}


def perform(plan_raw,approved,context_raw,run,check,clock=time.monotonic,deadline=None,target_role='edge_runtime'):
    if target_role not in TARGETS:raise ValueError('SNAPSHOT_SERVICE_ROLE_INVALID')
    evidence={'status':'UNATTESTED','signalState':'NOT_SENT','helperClosed':'UNKNOWN','rootProgramSha256':digest(ROOT_PROGRAM.encode()),'proof':None}
    try:
        check();started=clock();end=min(deadline,started+10)
        expected=bindings(plan_raw,approved,context_raw,target_role)
        if not math.isfinite(end) or end<=started:raise ValueError('SNAPSHOT_EDGE_DEADLINE')
        request={'schemaVersion':1,'planBytes':plan_raw.decode(),'approvedPlanSha256':approved,'contextBytes':context_raw.decode(),'deadlineMonotonic':end,'targetRole':target_role}
        evidence['signalState']='UNKNOWN_MAY_HAVE_BEEN_SENT'
        raw,closed=run(['/usr/bin/sudo','-n','/usr/bin/python3','-I','-B','-c',ROOT_PROGRAM],data=canonical(request),timeout=end-started,maximum=32768)
        evidence['helperClosed']=closed
        value=json.loads(raw)
        keys={'schemaVersion','kind','result','signal','signalState','identity','bindings','initIdentitySha256','runtimeIdentitySha256','fdClosure','elapsedMs','errno','failureStage','inspectDiagnostic'}
        if type(value)is not dict or set(value)!=keys:raise ValueError('SNAPSHOT_EDGE_PROOF_INVALID')
        if not safe_inspect_diagnostic(value['inspectDiagnostic']):raise ValueError('SNAPSHOT_INSPECT_DIAGNOSTIC_INVALID')
        if value['failureStage'] not in {None,'POLICY','BOOT','INSPECT','INIT','SELECT','PIDFD','BINARY','REVALIDATE','SIGNAL','CLOSE','UNKNOWN'}:raise ValueError('SNAPSHOT_EDGE_PROOF_INVALID')
        if value['signalState'] in {'SENT','NOT_SENT','UNKNOWN_MAY_HAVE_BEEN_SENT'}:evidence['signalState']=value['signalState']
        evidence['proof']=value
        check()
        if not (closed is True and clock()<end and valid_proof(value,expected)):raise ValueError('SNAPSHOT_EDGE_PROOF_INVALID')
        evidence['status']='VERIFIED';return evidence
    except BaseException as error:raise EdgeShutdownError(evidence) from error


def safe_inspect_diagnostic(value):
    if value is None:return True
    keys={'stage','exitCode','stdoutBytes','stderrBytes','stdoutSha256','stderrSha256','requiredFields','fieldsPresent','fieldTypesValid','identityMatches','initState'}
    if type(value)is not dict or set(value)!=keys:return False
    if value['stage'] not in {'COMMAND','DECODE','SHAPE','MATCH'} or value['initState'] not in {'UNKNOWN','ABSENT','NULL','FALSE'}:return False
    if any(type(value[k])is not bool for k in ['requiredFields','fieldsPresent','fieldTypesValid','identityMatches']):return False
    if value['exitCode'] is not None and (type(value['exitCode'])is not int or not -255<=value['exitCode']<=255):return False
    for prefix in ['stdout','stderr']:
        count=value[prefix+'Bytes'];sha=value[prefix+'Sha256']
        if count is not None and (type(count)is not int or count<0):return False
        if sha is not None and not (type(sha)is str and len(sha)==64 and all(c in '0123456789abcdef' for c in sha)):return False
    return True


def valid_proof(proof,expected):
    keys={'schemaVersion','kind','result','signal','signalState','identity','bindings','initIdentitySha256','runtimeIdentitySha256','fdClosure','elapsedMs','errno','failureStage','inspectDiagnostic'}
    if type(proof)is not dict or set(proof)!=keys or not safe_inspect_diagnostic(proof.get('inspectDiagnostic')):return False
    return type(proof['schemaVersion'])is int and proof['schemaVersion']==1 and proof['kind']=='ROOT_OWNED_SERVICE_TERMINATION' and proof['result']=='SENT' and proof['signal']==TARGETS.get(expected.get('targetRole'),{}).get('signal') and proof['signalState']=='SENT' and proof['identity']=='VERIFIED' and proof['bindings']==expected and proof['fdClosure']=='VERIFIED' and proof['errno'] is None and proof['failureStage'] is None and all(isinstance(proof[k],str) and len(proof[k])==64 and all(c in '0123456789abcdef' for c in proof[k]) for k in ['initIdentitySha256','runtimeIdentitySha256']) and type(proof['elapsedMs'])in (int,float) and math.isfinite(proof['elapsedMs']) and 0<=proof['elapsedMs']<=10000


def eligible15(evidence,expected,diagnostic):
    try:
        proof=evidence['proof'];signals=diagnostic['signals']
        return expected.get('targetRole')=='edge_runtime' and evidence['status']=='VERIFIED' and evidence['signalState']=='SENT' and evidence['helperClosed'] is True and evidence['rootProgramSha256']==digest(ROOT_PROGRAM.encode()) and valid_proof(proof,expected) and isinstance(signals,list) and 'SIGTERM_RECEIVED' in signals and not set(signals)&{'GRACEFUL_TIMEOUT','DRAIN_INTERRUPTED','DRAIN_DISABLED'}
    except (TypeError,KeyError):return False
