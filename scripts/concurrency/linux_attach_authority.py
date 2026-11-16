"""Trusted suite installer. No authority comes from a producer or stage result."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time

SOURCE=Path(__file__).resolve().parents[2]
RUNTIME=SOURCE.parent/'live-recovery-runtime/whole-site-261115'

# Fixed installer code, executed only by the already admitted suite. The root
# process independently derives all paths/identities; stdin only selects a
# strict known observer argv. It never executes a runner-provided code payload.
INSTALL=r'''
import hashlib,json,os,re,signal,stat,sys
from pathlib import Path

def need(ok):
    if not ok:raise ValueError('ATTACH_INSTALL_REJECTED')
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def read(path,maximum=262144):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno());need(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_size<=maximum)
        raw=stream.read(maximum+1);need(len(raw)<=maximum)
    return raw

def proc(pid):
    raw=Path('/proc/'+str(pid)+'/stat').read_bytes();tail=raw[raw.rfind(b')')+2:].split()
    status=Path('/proc/'+str(pid)+'/status').read_bytes().splitlines()
    ids=[next(x.split()[1:] for x in status if x.startswith(prefix)) for prefix in [b'Uid:',b'Gid:']]
    need(all(len(x)==4 and len(set(x))==1 for x in ids))
    exe=Path('/proc/'+str(pid)+'/exe');info=exe.stat()
    argv=Path('/proc/'+str(pid)+'/cmdline').read_bytes()
    with exe.open('rb') as stream:exe_sha=hashlib.file_digest(stream,'sha256').hexdigest()
    return {'pid':pid,'startTicks':int(tail[19]),'uid':int(ids[0][0]),'gid':int(ids[1][0]),'exe':os.readlink(exe),'device':info.st_dev,'inode':info.st_ino,'exeSha256':exe_sha,'argvSha256':sha(argv),'ppid':int(tail[1]),'state':tail[0].decode()},argv.rstrip(b'\0').decode().split('\0')

def put(path,raw,mode):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
    info=path.lstat();need(info.st_uid==0 and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==mode and read(path)==raw)

need(sys.platform=='linux' and os.geteuid()==0)
signal.signal(signal.SIGALRM,lambda *_:sys.exit(124));signal.alarm(10)
payload=json.loads(sys.stdin.buffer.read(16385));need(set(payload)=={'suitePid','argv'} and type(payload['suitePid'])is int)
suite,args=proc(payload['suitePid']);need(suite['uid']==1001 and suite['gid']>=0 and suite['state']!='Z')
ancestor=os.getppid();found=False
for _ in range(4):
    if ancestor==suite['pid']:found=True;break
    raw=Path('/proc/'+str(ancestor)+'/stat').read_bytes();ancestor=int(raw[raw.rfind(b')')+2:].split()[1])
need(found and len(args)==4 and args[:2]==['/usr/bin/python3','-B'] and re.fullmatch('[a-f0-9]{40}',args[3]))
script=Path(args[2]);need(script.resolve()==script and script.parts[-3:]==('scripts','concurrency','run-linux-local-suite.py'))
source=script.parents[2];runtime=source.parent/'live-recovery-runtime/whole-site-261115'
ctx_raw=read(runtime/'execution-context.json');ctx=json.loads(ctx_raw)
need(ctx['sourceRevision']==args[3] and ctx['projectId']=='cp-whole-site-261115' and re.fullmatch('[a-f0-9]{32}',ctx['instanceNonce']))
job=ctx['job'];need(job['repository']=='peiyi-liu/colorplay_v1' and job['runAttempt']==1 and job['jobName']=='capacity-linux' and re.fullmatch('[0-9]{1,20}',job['runId']))
argv=payload['argv'];need(type(argv)is list and argv[:2]==['/usr/bin/python3','-B'] and len(argv)in {5,6} and argv[3]==args[3])
observer=Path(argv[2]);need(observer.parent==runtime and observer.name in {'calibrate-linux-runtime.py','run-functional-owned.py','run-capacity-owned.py'})
if observer.name=='calibrate-linux-runtime.py':need(len(argv)==5 and re.fullmatch('[a-f0-9]{64}',argv[4]))
else:need(len(argv)==6 and re.fullmatch('[a-z0-9-]{3,100}',argv[4]) and re.fullmatch('[a-f0-9]{64}',argv[5]))
package_raw=read(source/'scripts/concurrency/linux-operator/package-manifest.json')
bootstrap=json.loads(read(runtime/'bootstrap-input.json'));need(bootstrap['sourceRevision']==args[3] and bootstrap['operatorPackageManifestSha256']==sha(package_raw) and bootstrap['instanceNonce']==ctx['instanceNonce'])
package=json.loads(package_raw)['files'];helper=read(source/'scripts/concurrency/linux-operator/privileged-attach.py')
for name,raw in [('privileged-attach.py',helper),(observer.name,read(observer))]:
    pin=package[name];need(pin['role']=='OPERATOR' and pin['bytes']==len(raw) and pin['sha256']==sha(raw))
relative=ctx['generatorCgroupRelativePath'];need(relative=='/colorplaygenerator'+ctx['instanceNonce'][:12]+'.slice/workload')
leaf=Path('/sys/fs/cgroup')/relative.lstrip('/');need(leaf.resolve()==leaf)
info=leaf.lstat();procs=(leaf/'cgroup.procs').lstat();need(stat.S_ISDIR(info.st_mode) and info.st_uid==1001 and stat.S_ISREG(procs.st_mode))
member=Path('/proc/'+str(suite['pid'])+'/cgroup').read_text().strip();need(member.startswith('0::/') and '\n'not in member and member[3:]!=relative)
policy={'schemaVersion':1,'instanceNonce':ctx['instanceNonce'],'sourceRevision':args[3],'jobSha256':sha(canonical(job)),'contextSha256':sha(ctx_raw),'bootSha256':sha(Path('/proc/sys/kernel/random/boot_id').read_bytes().strip()),'helperSha256':sha(helper),'suite':suite,'observer':{'argv':argv,'argvSha256':sha(b'\0'.join(x.encode() for x in argv)+b'\0'),'scriptPath':str(observer),'scriptSha256':sha(read(observer)),'sourceCgroup':member[3:]},'leaf':{'relativePath':relative,'device':info.st_dev,'inode':info.st_ino,'uid':info.st_uid,'procsDevice':procs.st_dev,'procsInode':procs.st_ino},'node':ctx['binaries']['node'],'gateSha256':None,'suiteScriptPath':str(script),'suiteScriptSha256':sha(read(script))}
# Extract just the literal constant; no execution/import of mutable Runtime code.
import ast
module=ast.parse(helper);values=[ast.literal_eval(n.value) for n in module.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='GATE' for t in n.targets)]
need(len(values)==1 and isinstance(values[0],str));policy['gateSha256']=sha(values[0].encode())
def directory(p):
    i=p.lstat();need(p.resolve()==p and stat.S_ISDIR(i.st_mode) and i.st_uid==0 and stat.S_IMODE(i.st_mode)==0o711)
root=Path('/run/colorplay-attach')
if not root.exists():root.mkdir(mode=0o711);root.chmod(0o711)
directory(root)
folder=root/ctx['instanceNonce']
if not folder.exists():folder.mkdir(mode=0o711);folder.chmod(0o711)
directory(folder)
if not (folder/'helper.py').exists():put(folder/'helper.py',helper,0o500)
need(read(folder/'helper.py')==helper)
raw=canonical(policy)+b'\n';path=folder/('policy-'+policy['observer']['argvSha256']+'.json')
put(path,raw,0o400)
need(proc(suite['pid'])[0]['startTicks']==suite['startTicks'])
print(json.dumps({'policy':policy,'policySha256':sha(raw)}))
'''


def require(ok):
    if not ok:raise ValueError('ATTACH_AUTHORITY_REJECTED')


def observer_stage(name,argv,runtime=RUNTIME):
    kind='calibrate-linux-runtime.py' if name=='kernel-calibration' else 'run-functional-owned.py' if name=='functional-run' else 'run-capacity-owned.py' if re.fullmatch('capacity-run-(0|[1-9]|1[0-4])',name) else None
    if kind is None:
        require(not name.startswith('capacity-run-'));return False
    require(type(argv)is list and argv[:3]==['/usr/bin/python3','-B',str(runtime/kind)] and len(argv)==(5 if kind.startswith('calibrate') else 6))
    require(re.fullmatch('[a-f0-9]{40}',argv[3]) and re.fullmatch('[a-f0-9]{64}',argv[-1]))
    if len(argv)==6:require(re.fullmatch('[a-z0-9-]{3,100}',argv[4]))
    return True


def prepare_stage(name,argv,timeout,run,write):
    if not observer_stage(name,argv):return timeout
    require(sys.platform=='linux' and timeout>0)
    started=time.monotonic()
    raw=run(['/usr/bin/sudo','-n','/usr/bin/python3','-I','-B','-c',INSTALL],data=json.dumps({'suitePid':os.getpid(),'argv':argv}).encode(),timeout=min(15,timeout))
    result=json.loads(raw);require(type(result)is dict and set(result)=={'policy','policySha256'})
    policy=result['policy'];require(policy['suite']['pid']==os.getpid() and policy['observer']['argv']==argv and result['policySha256']==hashlib.sha256(json.dumps(policy,sort_keys=True,separators=(',',':')).encode()+b'\n').hexdigest())
    key=policy['observer']['argvSha256'];write(RUNTIME/('attach-authority-'+key+'.json'),result)
    remaining=timeout-(time.monotonic()-started);require(remaining>0);return remaining
