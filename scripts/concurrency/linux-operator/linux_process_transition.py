"""Passive first-failed-pair evidence. Never grants process authority."""
import copy
import math
import os
from pathlib import Path
import re
import stat
import time
from linux_proc import parse_stat

ERRNOS={1:'EPERM',2:'ENOENT',3:'ESRCH',5:'EIO',9:'EBADF',12:'ENOMEM',13:'EACCES',22:'EINVAL'}
STATES=frozenset('RSDZTtXxKWPI')
HELPERS={
    'functional-preflight.py':'FUNCTIONAL_PREFLIGHT', 'canonical-baseline.py':'CANONICAL_BASELINE',
    'media-readback.py':'MEDIA_READBACK', 'execution-profile-preflight.py':'PROFILE_PREFLIGHT',
    'linux-host-sample.py':'HOST_SAMPLE', 'backend-cgroup-sample.py':'BACKEND_SAMPLE',
    'capacity-preflight-readback.py':'CAPACITY_PREFLIGHT',
    'capacity-registration-readback.py':'CAPACITY_REGISTRATION',
    'capacity-retention-readback.py':'CAPACITY_RETENTION',
}
DOCKER_SHAPE='{"id":{{json .Id}},"name":{{json .Name}},"imageId":{{json .Image}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"ports":{{json .NetworkSettings.Ports}}}'


def read_proc(pid,kind,maximum):
    assert type(pid)is int and pid>0 and kind in {'stat','cgroup','cmdline'}
    fd=os.open('/proc/%d/%s'%(pid,kind),os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        assert stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid()
        return stream.read(maximum)


def argv_class(raw,runtime):
    """Exact public call templates; no argv or digest leaves this function."""
    result={'kind':'OTHER','template':'NO_MATCH','helper':'UNOBSERVED','pin':'UNPINNED'}
    if not raw.endswith(b'\0') or b'\0\0' in raw:return result
    try:argv=raw[:-1].decode('ascii').split('\0')
    except UnicodeError:return result
    if argv in [['/usr/bin/git','rev-parse','HEAD'],['/usr/bin/git','status','--porcelain']]:
        return {**result,'kind':'GIT_READONLY','template':'KNOWN_TEMPLATE_MATCH'}
    if len(argv)==14 and argv[:5]==['/usr/bin/docker','--host','unix:///var/run/docker.sock','inspect','--format'] and argv[5]==DOCKER_SHAPE and all(re.fullmatch('[a-f0-9]{64}',v) for v in argv[6:]):
        return {**result,'kind':'DOCKER_INSPECT','template':'KNOWN_TEMPLATE_MATCH'}
    if argv==[str(runtime.parent/'host-client/bin/psql'),'--no-psqlrc','--quiet','--tuples-only','--no-align','--set=ON_ERROR_STOP=1']:
        return {**result,'kind':'PSQL_READONLY','template':'KNOWN_TEMPLATE_MATCH'}
    if len(argv)>=3 and argv[:2]==['/usr/bin/python3','-B']:
        for name,kind in HELPERS.items():
            if argv[2]!=str(runtime/name):continue
            tail=argv[3:]
            if kind in {'HOST_SAMPLE','BACKEND_SAMPLE'}:valid=not tail
            elif kind.startswith('CAPACITY_'):valid=len(tail)==3 and re.fullmatch('[a-f0-9]{40}',tail[0]) and re.fullmatch('wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}',tail[1]) and re.fullmatch('[a-f0-9]{64}',tail[2])
            elif kind=='PROFILE_PREFLIGHT':valid=len(tail)==3 and re.fullmatch('[a-f0-9]{40}',tail[0]) and re.fullmatch('[a-f0-9]{64}',tail[1]) and re.fullmatch('[a-f0-9]{32}',tail[2])
            else:
                valid=len(tail)==2 and re.fullmatch('[a-f0-9]{40}',tail[0]) and (re.fullmatch('wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}',tail[1]) or kind=='MEDIA_READBACK' and Path(tail[1]).parent==runtime/'functional-private' and re.fullmatch('wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}',Path(tail[1]).name))
            if valid:return {**result,'kind':'APPROVED_HELPER_TEMPLATE','template':'KNOWN_TEMPLATE_MATCH','helper':kind}
    return result


class ProcessTransitionDiagnostics:
    def __init__(self,reader=None,clock=None,runtime=None):
        self.reader=reader or read_proc;self.clock=clock or time.monotonic
        self.runtime=Path(runtime) if runtime is not None else Path(__file__).resolve().parent
        self.ctx=None;self.python=None;self.parts={};self.claimed=False;self.value=None

    def configure(self,ctx):self.ctx=ctx
    def python_pin(self,row):self.python=dict(row)
    def begin(self):
        if not self.claimed:self.parts={}
    def piece(self,prefix,kind,value):
        if not self.claimed and prefix in {'FIRST','SECOND'}:
            self.parts.setdefault(prefix,{})[kind]=dict(value) if isinstance(value,dict) else value

    def role(self,path=None,device=None,inode=None,mode='FULL'):
        pins=[] if self.ctx is None else [('NODE',self.ctx['binaries']['node']),*[( 'BROWSER',p) for p in self.ctx['binaries']['browser']]]
        if self.python:pins.append(('PYTHON',{'path':self.python['exe'],'device':self.python['device'],'inode':self.python['inode']}))
        for role,pin in pins:
            if (mode=='STAT' or path==pin['path']) and (mode=='PATH' or (device,inode)==(pin['device'],pin['inode'])):return role
        if mode!='STAT':
            known={'/usr/bin/git':'GIT_READONLY','/usr/bin/docker':'DOCKER_INSPECT',str(self.runtime.parent/'host-client/bin/psql'):'PSQL_READONLY'}
            if path in known:return 'KNOWN_PATH_ONLY_'+known[path]
        return 'OTHER'

    def summary(self,prefix,row):
        pieces=self.parts.get(prefix,{})
        initial=pieces.get('stat',{});final=pieces.get('recheck',{})
        info=pieces.get('exeStat',{})
        return {'collection':'OBSERVED' if pieces else 'UNOBSERVED',
                'state':final.get('state') if final.get('state') in STATES else 'UNOBSERVED',
                'statBirthStable':'EQUAL' if initial and final and initial.get('startTicks')==final.get('startTicks') else 'UNOBSERVED',
                'readlinkRole':self.role(path=pieces['readlink'],mode='PATH') if 'readlink'in pieces else 'UNOBSERVED',
                'fstatRole':self.role(device=info.get('device'),inode=info.get('inode'),mode='STAT') if info else 'UNOBSERVED',
                'rowRole':self.role(row.get('exe'),row.get('device'),row.get('inode'))}

    def failure(self,ctx,first,second,seen,pidfd_open):
        if self.claimed:return
        self.claimed=True;self.ctx=ctx
        fields=['pid','startTicks','uid','exe','device','inode']
        equal={k:('EQUAL' if first.get(k)==second.get(k) else 'DIFFERENT') for k in fields}
        one=self.parts.get('FIRST',{}).get('recheck',{})
        two=self.parts.get('SECOND',{}).get('recheck',{})
        for k in ['ppid','state']:
            equal[k]='UNOBSERVED' if k not in one or k not in two else 'EQUAL' if one[k]==two[k] else 'DIFFERENT'
        self.value={'schemaVersion':1,'authority':'NON_AUTHORITY','collection':'OBSERVED','phase':'FAILED_COMPARE',
                    'pair':{'changedFields':[k for k in fields if first.get(k)!=second.get(k)],'equalities':equal,
                            'first':self.summary('FIRST',first),'second':self.summary('SECOND',second),
                            'candidateNew':(first['pid'],first['startTicks']) not in seen,'pidfdOpenObserved':pidfd_open is True,
                            'leafCheck':'TRACK_BEGIN_ONLY','perIdentityLeaf':'UNOBSERVED','pidfdBirthAttestation':'UNOBSERVED'},
                    'afterFailure':{'phase':'AFTER_FAILURE','collection':'UNOBSERVED','reason':'UNOBSERVED','elapsedMs':None,'bytesRead':0,'reads':[],'candidate':None,'parent':None}}
        if not pidfd_open or any(first[k]!=second[k] for k in ['pid','startTicks','uid']) or first['uid']!=os.getuid():return
        self.enrich(first,second,seen)

    def enrich(self,first,second,seen):
        after=self.value['afterFailure'];last=None
        def now():
            nonlocal last
            value=self.clock()
            if not isinstance(value,(int,float)) or isinstance(value,bool) or not math.isfinite(value) or value<0 or last is not None and value<last:raise ValueError('CLOCK_INVALID')
            last=value;return value
        try:start=now()
        except BaseException:
            after.update(collection='UNAVAILABLE',reason='CLOCK_INVALID');self.value['collection']='UNAVAILABLE';return
        def read(pid,kind,maximum,boundary):
            elapsed=(now()-start)*1000;after['elapsedMs']=elapsed
            if elapsed>=100:raise ValueError('SOFT_DEADLINE')
            remaining=65536-after['bytesRead']
            if remaining<=0:raise ValueError('BYTE_CAP')
            limit=min(maximum,remaining)
            row={'subject':'CANDIDATE' if pid==first['pid'] else 'PARENT','field':kind.upper(),'boundary':boundary,'outcome':'UNOBSERVED','errno':None}
            after['reads'].append(row)
            try:
                raw=self.reader(pid,kind,limit)
                if not isinstance(raw,bytes):raise ValueError('READ_SHAPE')
                after['bytesRead']+=len(raw)
                if len(raw)>limit or len(raw)>=maximum:raise ValueError('BYTE_CAP')
                row['outcome']='RETURNED'
                after['elapsedMs']=(now()-start)*1000
                if after['elapsedMs']>=100:raise ValueError('SOFT_DEADLINE')
                return raw
            except OSError as error:
                row.update(outcome='UNAVAILABLE',errno=ERRNOS.get(error.errno,'OTHER'));raise
        def observe(pid,expected,subject):
            item={'phase':'BOUNDED_READ_SEQUENCE','atomic':False,'birth':'UNOBSERVED','birthAtStart':'UNOBSERVED',
                  'ppidBoundary':'UNOBSERVED','leaf':'UNOBSERVED','uidFresh':'UNOBSERVED','argv':None,
                  'stateAtStart':'UNOBSERVED','stateAtEnd':'UNOBSERVED'}
            after[subject]=item
            before=parse_stat(read(pid,'stat',4096,'BEFORE').decode('ascii'))
            item['stateAtStart']=before['state'] if before['state'] in STATES else 'UNOBSERVED'
            item['birthAtStart']='EQUAL' if before['pid']==pid and before['startTicks']==expected else 'DIFFERENT'
            if item['birthAtStart']!='EQUAL':item['birth']='DIFFERENT';raise ValueError('BIRTH_CHANGED')
            if before['state']=='Z':raise ValueError('PROCESS_GONE')
            group=read(pid,'cgroup',8192,'BEFORE').decode('ascii')
            expected_group='0::'+self.ctx['generatorCgroupRelativePath']+'\n'
            if group!=expected_group:item['leaf']='DIFFERENT';raise ValueError('LEAF_CHANGED')
            argv=argv_class(read(pid,'cmdline',8192,'BODY'),self.runtime)
            final=parse_stat(read(pid,'stat',4096,'AFTER').decode('ascii'))
            item['stateAtEnd']=final['state'] if final['state'] in STATES else 'UNOBSERVED'
            if final['pid']!=pid or final['startTicks']!=expected:item['birth']='DIFFERENT';raise ValueError('BIRTH_CHANGED')
            if final['ppid']!=before['ppid']:item['ppidBoundary']='DIFFERENT';raise ValueError('PARENT_CHANGED')
            if final['state']=='Z':raise ValueError('PROCESS_GONE')
            group_after=read(pid,'cgroup',8192,'AFTER').decode('ascii')
            if group_after!=group or group_after!=expected_group:item['leaf']='DIFFERENT';raise ValueError('LEAF_CHANGED')
            item.update(birth='EQUAL',ppidBoundary='EQUAL',leaf='EQUAL',argv=argv)
            return item,final
        try:
            item,parsed=observe(first['pid'],second['startTicks'],'candidate');after['candidate']=item
            if item['birth']=='EQUAL' and item['leaf']=='EQUAL':
                parents=[key for key in seen if key[0]==parsed['ppid']]
                if len(parents)==1 and parents[0][0]!=first['pid']:
                    after['parent'],_=observe(*parents[0],'parent')
            after.update(collection='OBSERVED',reason='CAPTURED')
        except BaseException as error:
            reason=error.args[0] if type(error)is ValueError and len(error.args)==1 and type(error.args[0])is str and error.args[0] in {'CLOCK_INVALID','SOFT_DEADLINE','BYTE_CAP','READ_SHAPE','BIRTH_CHANGED','PARENT_CHANGED','LEAF_CHANGED','PROCESS_GONE'} else 'READ_UNAVAILABLE'
            after.update(collection='UNAVAILABLE',reason=reason)
            if reason=='CLOCK_INVALID':after['elapsedMs']=None
            for subject in ['candidate','parent']:
                if after[subject] is not None:after[subject]['argv']=None
        if after['collection']=='UNAVAILABLE':self.value['collection']='UNAVAILABLE'

    def snapshot(self):
        if self.value is None:return {'schemaVersion':1,'authority':'NON_AUTHORITY','collection':'UNOBSERVED','phase':'FAILED_COMPARE','pair':None,'afterFailure':None}
        return copy.deepcopy(self.value)
