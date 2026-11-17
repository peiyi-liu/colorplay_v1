"""Fixed Linux-only external ports. No shell, arbitrary targets, or cleanup."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import select
import signal
import stat
import subprocess
import sys
import tempfile
import time
import urllib.parse
import local_snapshot_contracts as C
import local_edge_shutdown as E
import local_rest_shutdown as R

DOCKER = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']
ENV = {'PATH':'/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE':'1'}
SOURCE = Path(__file__).resolve().parents[2]
VOLUME_CENSUS = r'''import os,sys,stat,json,hashlib
root=sys.argv[1];assert os.path.realpath(root)==root
rows=[];total=0
def inaccessible(error):raise error
for parent,dirs,files in os.walk(root,followlinks=False,onerror=inaccessible):
 for name in sorted(dirs+files):
  p=os.path.join(parent,name);s=os.lstat(p);assert not stat.S_ISLNK(s.st_mode)
  assert stat.S_ISDIR(s.st_mode) or (stat.S_ISREG(s.st_mode) and s.st_nlink==1)
  row={'path':os.path.relpath(p,root),'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'inode':s.st_ino,'device':s.st_dev,'bytes':s.st_size,'directory':stat.S_ISDIR(s.st_mode)}
  if not row['directory']:
   h=hashlib.sha256();f=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
   with os.fdopen(f,'rb') as stream:
    before=os.fstat(stream.fileno())
    while chunk:=stream.read(65536):h.update(chunk)
    after=os.fstat(stream.fileno())
   fields=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mode,x.st_uid,x.st_gid,x.st_mtime_ns,x.st_ctime_ns)
   assert fields(s)==fields(before)==fields(after)==fields(os.lstat(p))
   row['sha256']=h.hexdigest();total+=s.st_size;assert total<=2147483648
  rows.append(row);assert len(rows)<=20000
print(json.dumps(sorted(rows,key=lambda x:x['path'])))
'''
WRITERS = r'''import os,sys,json
root,backend=sys.argv[1:];unknown=False;writers=0
for pid in os.listdir('/proc'):
 if not pid.isdecimal():continue
 try:
  group=open('/proc/'+pid+'/cgroup').read().strip()
  if group.startswith('0::'+backend+'/'):continue
  for fd in os.listdir('/proc/'+pid+'/fd'):
   target=os.readlink('/proc/'+pid+'/fd/'+fd)
   if target==root or target.startswith(root+'/'):
    values=dict(line.split(':',1) for line in open('/proc/'+pid+'/fdinfo/'+fd) if ':' in line)
    if int(values['flags'].strip(),8)&os.O_ACCMODE in (os.O_WRONLY,os.O_RDWR):writers+=1
 except FileNotFoundError:continue
 except (PermissionError,KeyError,ValueError,ProcessLookupError):unknown=True
print(json.dumps({'writers':writers,'unknown':unknown}))
'''
MAIL_GET = r'''import sys,urllib.request
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k):raise RuntimeError('REDIRECT_REJECTED')
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
request=urllib.request.Request('http://127.0.0.1:58324'+sys.argv[1],method='GET')
with opener.open(request,timeout=5) as response:
 assert response.status==200
 count=0
 while chunk:=response.read(65536):
  count+=len(chunk);assert count<=52428800
  sys.stdout.buffer.write(chunk)
'''


class NativeIO:
    def __init__(self):
        self.source, self.environment, self.platform = SOURCE, dict(os.environ), sys.platform
        self.runtime = SOURCE.parent / 'live-recovery-runtime/whole-site-261115'
        self.deadline, self.closure, self.cancelled = time.monotonic() + 600, 'VERIFIED', False

    def check(self):
        C.require(not self.cancelled,'SNAPSHOT_INTERRUPTED')
        C.require(time.monotonic() < self.deadline, 'SNAPSHOT_DEADLINE')

    def run(self, args, *, data=None, output=None, env=None, timeout=30, maximum=8*1024**2, merge_stderr=False):
        self.check()
        seconds = min(timeout, self.deadline - time.monotonic() - 4)
        C.require(seconds > 0, 'SNAPSHOT_DEADLINE')
        privileged = args[:2] == ['/usr/bin/sudo', '-n']
        if privileged:
            args = [*args[:2], '/usr/bin/timeout', '--signal=TERM', '--kill-after=2', str(seconds), *args[2:]]
        started = time.monotonic()
        stop_info = None
        if args[:6] == [*DOCKER, 'stop', '--timeout', '-1']:
            stop_info = {'requestedSeconds':timeout,'effectiveSeconds':seconds,'startedMonotonic':started,
                         'elapsedSeconds':None,'clientClosed':None,'exitCode':None,'subprocessClosure':'UNKNOWN'}
            self.last_stop_command = stop_info
        incoming = tempfile.TemporaryFile()
        incoming.write(data or b''); incoming.seek(0)
        fd = os.open(output, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600) if output else None
        destination = os.fdopen(fd,'wb') if fd is not None else tempfile.TemporaryFile()
        child = None
        try:
            child = subprocess.Popen(args,cwd=self.source,env={**ENV,**(env or {})},stdin=incoming,
                stdout=destination,stderr=destination if merge_stderr else subprocess.DEVNULL,start_new_session=True)
            while child.poll() is None:
                self.check()
                C.require(time.monotonic()-started < seconds+3, 'SNAPSHOT_COMMAND_TIMEOUT')
                C.require(os.fstat(destination.fileno()).st_size <= (C.LIMIT if output else maximum), 'SNAPSHOT_SIZE_LIMIT')
                time.sleep(0.02)
            C.require(child.returncode == 0, 'SNAPSHOT_COMMAND_FAILED')
            destination.flush(); os.fsync(destination.fileno())
            size = os.fstat(destination.fileno()).st_size
            C.require(size <= (C.LIMIT if output else maximum), 'SNAPSHOT_SIZE_LIMIT')
            if output:return None
            destination.seek(0); return destination.read(maximum+1)
        finally:
            normal_completion=(child is not None and child.poll()is not None and child.returncode>=0) if getattr(self,'rest_read_active',False) else False
            if child is not None and child.poll() is None:
                try:os.killpg(child.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                except PermissionError:self.closure='UNKNOWN'
                try:child.wait(timeout=3)
                except subprocess.TimeoutExpired:self.closure='UNKNOWN'
                if privileged:self.closure='UNKNOWN'
            destination.close(); incoming.close()
            if getattr(self,'rest_read_active',False):
                self.rest_read_command={'clientClosed':child.poll()is not None if child is not None else False,'normalCompletion':normal_completion,'subprocessClosure':self.closure}
            if stop_info is not None:
                stop_info.update(elapsedSeconds=time.monotonic()-started,
                    clientClosed=child.poll() is not None if child is not None else None,
                    exitCode=child.returncode if child is not None else None,subprocessClosure=self.closure)

    def docker(self, *args, **options):
        return self.run([*DOCKER,*args],**options)

    def frozen(self, plan):
        C.require(self.platform=='linux' and platform.machine() in {'x86_64','amd64'},'SNAPSHOT_LINUX_REQUIRED')
        values=dict(line.split('=',1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
        C.require(values.get('ID','').strip('"')=='ubuntu' and values.get('VERSION_ID','').strip('"')=='24.04')
        C.require(self.run(['/usr/bin/git','rev-parse','HEAD']).decode().strip()==plan['sourceRevision'] and
                  not self.run(['/usr/bin/git','status','--porcelain']).strip(),'SNAPSHOT_SOURCE_CHANGED')
        C.require(not os.path.lexists(self.source/'supabase/.temp/project-ref') and
                  not any(p.name!='.env.example' for p in self.source.glob('.env*')))

    def load_root(self):
        before=list(sys.path);sys.dont_write_bytecode=True
        try:
            sys.path.insert(0,str(self.runtime))
            spec=importlib.util.spec_from_file_location('snapshot_approved_root',self.runtime/'linux_runtime_common.py')
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        finally:sys.path[:]=before
        return module

    def boot(self):
        value=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        return C.digest(value.encode())

    def process(self, pin):
        pid=pin['pid'];root=Path('/proc')/str(pid)
        fd=os.pidfd_open(pid)
        try:
            raw=(root/'stat').read_text();parts=raw[raw.rfind(')')+2:].split()
            uid=int(next(line.split()[1] for line in (root/'status').read_text().splitlines() if line.startswith('Uid:')))
            executable=(root/'exe').resolve(strict=True)
            C.require(int(parts[19])==pin['startTicks'] and uid==pin['uid']==os.getuid() and
                      str(executable)==pin['executablePath'] and C.binary_hash(executable)==pin['executableSha256'] and
                      self.boot()==pin['hostBootIdSha256'] and pid!=os.getpid(),'SNAPSHOT_PREVIEW_CHANGED')
            return fd
        except BaseException:os.close(fd);raise

    def observe(self, plan, context, profile):
        self.context=context;self.profile=profile
        root=self.load_root()
        root.validate_context(context)
        C.require({'schemaVersion':1,'kind':root.H.profile_kind(profile['host']),**root.observe_profile(context,allow_outside_group=True)}==profile,
                  'SNAPSHOT_PROFILE_CHANGED')
        fd=self.process(plan['preview']);os.close(fd)
        self.barrier(plan,context)
        rows=C.decode(self.docker('inspect',*[r['id'] for r in plan['containers']]))
        names=self.docker('volume','ls','-q').decode().split()
        volumes=C.decode(self.docker('volume','inspect',*names)) if names else []
        all_ids=self.docker('ps','-aq','--no-trunc').decode().split()
        docker_root=self.docker('info','--format','{{.DockerRootDir}}').decode().strip()
        return {'containers':rows,'volumes':volumes,'allContainerIds':all_ids,'dockerRoot':docker_root,'boot':self.boot()}

    def barrier(self, plan, context):
        self.check()
        C.require(self.boot()==plan['preview']['hostBootIdSha256'],'SNAPSHOT_BOOT_CHANGED')
        group=Path('/sys/fs/cgroup')/context['generatorCgroupRelativePath'].lstrip('/')
        C.require(group.resolve(strict=True)==group and all(not (Path(p)/'cgroup.procs').read_text().strip()
                  for p,_,_ in os.walk(group)),
                  'SNAPSHOT_GENERATOR_NOT_EMPTY')
        result=C.decode(self.run(['/usr/bin/sudo','-n','/usr/bin/python3','-B','-c',WRITERS,
            str(self.runtime),context['backendCgroupRelativePath']]))
        C.require(result=={'writers':0,'unknown':False},'SNAPSHOT_WRITERS_NOT_SETTLED')

    def stop_preview(self, pin):
        fd=self.process(pin)
        try:
            signal.pidfd_send_signal(fd,signal.SIGTERM)
            ready,_,_=select.select([fd],[],[],min(30,self.deadline-time.monotonic()))
            C.require(bool(ready),'SNAPSHOT_PREVIEW_STOP_UNKNOWN')
        finally:os.close(fd)

    def get(self, target):
        import re
        C.require(re.fullmatch(r'/api/v1/messages\?start=[0-9]{1,6}&limit=50|/api/v1/message/[A-Za-z0-9_-]{1,80}/raw',target))
        C.require('/message/latest/' not in target)
        return self.run(['/usr/bin/python3','-B','-c',MAIL_GET,target],timeout=15,maximum=50*1024**2)

    def inspect(self, rows):
        return C.decode(self.docker('inspect',*[r['id'] for r in rows]))

    def stop(self, row):
        if row['role']=='rest':return self.stop_rest(row)
        if row['role'] not in E.TARGETS:
            self.docker('stop','--timeout','-1',row['id'],timeout=90);return
        role=row['role'];target=E.TARGETS[role]
        C.require(hasattr(self,'stop_output') and hasattr(self,'edge_policy'),'SNAPSHOT_SERVICE_OUTPUT_REQUIRED')
        C.directory(self.stop_output);C.require(self.stop_output.stat().st_mode&0o777==0o700)
        C.require(row in self.stop_plan['containers'] and row['imageId']==target['image'] and row['name']==target['name'],'SNAPSHOT_CONTAINER_CHANGED')
        attempted=getattr(self,'stop_attempted',set());C.require(role not in attempted,'SNAPSHOT_SERVICE_ALREADY_ATTEMPTED')
        self.stop_attempted=attempted|{role};started=time.monotonic();end=min(started+90,self.deadline-4)
        raw,approval,context_raw=self.edge_policy
        record={'role':role,'restartState':'NOT_ATTEMPTED','signal':None,'naturalExit':'NOT_REACHED'}
        self.service_shutdown_receipts=getattr(self,'service_shutdown_receipts',{});self.service_shutdown_receipts[role]=record
        def remaining():
            self.check();value=end-time.monotonic();C.require(value>0,'SNAPSHOT_DEADLINE');return value
        def read():return self.service_state(row,min(2,remaining()))
        def root_run(args,**options):
            value=self.run(args,**options);return value,self.closure=='VERIFIED'
        try:
            before=read();C.require(before['running'] and before['pid']>1 and before['policy']==('no' if role=='edge_runtime' else 'unless-stopped'),'SNAPSHOT_RESTART_POLICY_CHANGED')
            if role!='edge_runtime':
                intent={'role':role,'containerIdSha256':C.digest(row['id'].encode()),'planSha256':approval,
                        'originalPolicy':'unless-stopped','requestedPolicy':'no','before':{k:v for k,v in before.items() if k!='pid'},'initPidSha256':C.digest(str(before['pid']).encode())}
                C.write_once(self.stop_output/('restart-'+role+'-intent.json'),intent)
                remaining();record['restartState']='MAY_HAVE_CHANGED'
                self.docker('update','--restart=no',row['id'],timeout=remaining(),maximum=16384)
                C.require(self.closure=='VERIFIED','SNAPSHOT_SUBPROCESS_CLOSURE_UNKNOWN')
                after=read();C.require(after=={**before,'policy':'no'},'SNAPSHOT_RESTART_POLICY_CHANGED')
                record['restartState']='CONFIRMED_NO_RESTART'
                C.write_once(self.stop_output/('restart-'+role+'-confirmed.json'),{'role':role,'planSha256':approval,'after':{k:v for k,v in after.items() if k!='pid'},'initPidSha256':C.digest(str(after['pid']).encode())})
                before=after
            try:
                record['signal']=E.perform(raw,approval,context_raw,root_run,self.check,clock=time.monotonic,deadline=end,target_role=role)
            except E.EdgeShutdownError as error:
                record['signal']=error.evidence;raise C.SnapshotError('SNAPSHOT_EDGE_SHUTDOWN_UNVERIFIED') from None
            finally:
                if role=='edge_runtime':self.edge_shutdown_receipt=record['signal']
            while True:
                remaining();current=read()
                C.require({**current,'pid':before['pid'],'running':before['running']}==before,'SNAPSHOT_SERVICE_CHANGED')
                if current['running']is False:
                    C.require(current['pid']==0,'SNAPSHOT_STOP_UNKNOWN');record['naturalExit']='VERIFIED';break
                C.require(current['pid']==before['pid'],'SNAPSHOT_SERVICE_CHANGED')
                time.sleep(min(0.05,remaining()))
            self.docker('stop','--timeout','-1',row['id'],timeout=remaining())
            C.require(self.closure=='VERIFIED','SNAPSHOT_SUBPROCESS_CLOSURE_UNKNOWN');remaining()
        except BaseException:
            if record['signal'] is not None:record['signal']['status']='UNATTESTED'
            raise
        finally:
            record['elapsedSeconds']=time.monotonic()-started
            if isinstance(getattr(self,'last_stop_command',None),dict):self.last_stop_command.update(edgeIntervalRequestedSeconds=90,totalElapsedSeconds=record['elapsedSeconds'])

    def stop_rest(self,row):
        C.require(hasattr(self,'stop_output') and hasattr(self,'edge_policy') and not getattr(self,'rest_attempted',False),'SNAPSHOT_REST_SCOPE_REQUIRED')
        C.directory(self.stop_output);C.require(row in self.stop_plan['containers'] and row['role']=='rest','SNAPSHOT_REST_SCOPE_REQUIRED')
        self.rest_attempted=True;started=time.monotonic();end=min(started+90,self.deadline-4)
        self.rest_shutdown_receipt={'status':'UNATTESTED','receiptSha256':None,'observation':None,'completionElapsedSeconds':None}
        expected=R.bindings(*self.edge_policy)
        def remaining():
            self.check();left=end-time.monotonic();C.require(left>0,'SNAPSHOT_DEADLINE');return left
        def read(args,maximum):
            seconds=min(2,remaining());self.rest_read_active=True;self.rest_read_command=None;value=None
            try:value=self.docker(*args,timeout=seconds,maximum=maximum,merge_stderr=args[0]=='logs')
            except (OSError,C.SnapshotError):pass
            finally:self.rest_read_active=False
            proof=self.rest_read_command
            C.require(type(proof)is dict and proof.get('normalCompletion')is True and proof.get('clientClosed')is True and proof.get('subprocessClosure')=='VERIFIED','SNAPSHOT_SUBPROCESS_CLOSURE_UNKNOWN')
            remaining();return value
        def inspect():
            raw=read(('inspect',row['id']),262144);C.require(raw is not None,'SNAPSHOT_REST_IDENTITY_UNKNOWN')
            values=C.decode(raw);C.require(type(values)is list and len(values)==1);return values[0]
        before=inspect();before_state=R.normalize(before,expected,True)
        top=R.single_process(read(('top',row['id'],'-eo','pid,ppid,comm'),16384),before['State']['Pid'])
        before_log=read(('logs','--tail','80',row['id']),65536)
        self.last_stop_command=None
        self.docker('stop','--timeout','-1',row['id'],timeout=remaining())
        C.require(self.closure=='VERIFIED','SNAPSHOT_SUBPROCESS_CLOSURE_UNKNOWN');remaining()
        after=inspect();after_state=R.normalize(after,expected,False)
        C.require(all(before_state[k]==after_state[k] for k in ['identitySha256','configSha256','restartCount','restartPolicy','retry']),'SNAPSHOT_REST_IDENTITY_CHANGED')
        after_log=read(('logs','--tail','80',row['id']),65536)
        try:
            value=R.observation(expected,before,after,top,before_log,after_log,self.last_stop_command,time.monotonic()-started)
            raw=R.receipt_bytes(value);fingerprint=C.write_once(self.stop_output/'rest-interruption-receipt.json',raw)
            remaining();evidence={'status':'VERIFIED','receiptSha256':fingerprint,'observation':value,'completionElapsedSeconds':time.monotonic()-started}
            if not R.eligible255(evidence,expected,before,after):evidence['status']='UNATTESTED'
            self.rest_shutdown_receipt=evidence
        except (OSError,ValueError,TypeError,C.SnapshotError):self.shutdown_diagnostics='UNKNOWN'
        remaining()

    def service_state(self,row,timeout):
        values=C.decode(self.docker('inspect',row['id'],timeout=timeout,maximum=262144))
        C.require(type(values)is list and len(values)==1 and type(values[0])is dict,'SNAPSHOT_INSPECT_SHAPE')
        value=values[0];state=value['State'];host=value['HostConfig'];policy=host['RestartPolicy']
        C.require(value['Id']==row['id'] and value['Name']==row['name'] and value['Image']==row['imageId'],'SNAPSHOT_CONTAINER_CHANGED')
        C.require(all(type(state[k])is bool for k in ['Running','Paused','Restarting','Dead','OOMKilled']) and
                  all(state[k]is False for k in ['Paused','Restarting','Dead','OOMKilled']) and type(state['Error'])is str and not state['Error'],'SNAPSHOT_SERVICE_CHANGED')
        C.require(type(state['Pid'])is int and state['Pid']>=0 and type(value['RestartCount'])is int and value['RestartCount']>=0 and
                  type(policy['Name'])is str and type(policy['MaximumRetryCount'])is int and policy['MaximumRetryCount']==0 and host['AutoRemove']is False,'SNAPSHOT_SERVICE_CHANGED')
        init='ABSENT' if 'Init' not in host else 'NULL' if host['Init']is None else 'FALSE' if host['Init']is False else 'UNKNOWN'
        C.require(init!='UNKNOWN','SNAPSHOT_INIT_UNSUPPORTED')
        return {'pid':state['Pid'],'running':state['Running'],'policy':policy['Name'],'restartCount':value['RestartCount'],'initState':init}

    def bind_stop_policy(self,plan_raw,approval,context_raw):
        expected=E.bindings(plan_raw,approval,context_raw)
        plan=C.parse_plan(plan_raw,approval)
        C.require(json.loads(context_raw)==self.context,'SNAPSHOT_EDGE_POLICY_REQUIRED')
        self.edge_policy=(plan_raw,approval,context_raw);self.edge_bindings=expected;self.stop_plan=plan

    def bind_stop_output(self,output):
        expected=self.runtime.parent/'snapshots'/self.stop_plan['instanceNonce']
        C.require(output==expected and output.resolve(strict=True)==output,'SNAPSHOT_SERVICE_OUTPUT_REQUIRED')
        C.directory(output);C.require(output.stat().st_mode&0o777==0o700,'SNAPSHOT_SERVICE_OUTPUT_REQUIRED')
        self.stop_output=output

    def stop_diagnostics(self, row):
        self.check()
        C.require(any(all(row.get(k)==pin[k] for k in ['role','id','name','imageId'])
                      for pin in self.context['containers']), 'SNAPSHOT_CONTAINER_CHANGED')
        rows=C.decode(self.docker('inspect',row['id'],timeout=2,maximum=262144))
        C.require(type(rows)is list and len(rows)==1)
        item=rows[0]
        C.require(item['Id']==row['id'] and item['Name']==row['name'] and item['Image']==row['imageId'])
        state=item['State'];config=item['Config']
        C.require(all(type(state[k])is bool for k in ['Running','Paused','Restarting','Dead']) and
                  type(state['ExitCode'])is int and isinstance(state['Status'],str) and
                  state['Status'] in {'created','running','paused','restarting','removing','exited','dead'})
        safe={k:state[k] for k in ['Running','Paused','Restarting','Dead','Status','ExitCode']}
        signal_name=config.get('StopSignal') or 'DEFAULT'
        safe['stopSignal']=signal_name if signal_name in {'DEFAULT','SIGTERM','SIGINT','SIGQUIT'} else 'UNKNOWN'
        entrypoint,cmd=config.get('Entrypoint'),config.get('Cmd')
        shape='UNKNOWN'
        if isinstance(entrypoint,list) and entrypoint and all(isinstance(v,str) for v in entrypoint):
            executable=Path(entrypoint[0]).name
            shape='SHELL' if executable in {'sh','ash','bash','dash'} else 'EDGE_RUNTIME' if executable=='edge-runtime' else 'OTHER'
        result={'state':safe,'entrypointKind':shape,
                'entrypointCmdSha256':C.digest(C.canonical([entrypoint,cmd])),'topology':'UNKNOWN','signals':'UNKNOWN'}
        if state['Running']:
            try:
                top=self.docker('top',row['id'],'-eo','pid,ppid,comm',timeout=2,maximum=16384)
                result['topology']=self.safe_topology(top,state['Pid'])
            except Exception:pass
        if row['role']=='edge_runtime':
            try:
                raw=self.docker('logs','--tail','80',row['id'],timeout=2,maximum=65536,merge_stderr=True)
                result['signals']=self.safe_signals(raw)
            except Exception:pass
        return result

    @staticmethod
    def safe_topology(top,pid1):
        C.require(isinstance(top,bytes) and len(top)<=16384 and type(pid1)is int and 0<pid1<=2**31-1)
        text=top.decode('ascii')
        C.require(all(32<=ord(char)<=126 or char in '\n\t' for char in text))
        lines=text.splitlines()
        C.require(2<=len(lines)<=65 and lines[0].split()==['PID','PPID','COMMAND'])
        rows={}
        for line in lines[1:]:
            row=line.split()
            C.require(len(row)==3 and re.fullmatch('[1-9][0-9]{0,9}',row[0]) and
                      re.fullmatch('0|[1-9][0-9]{0,9}',row[1]) and re.fullmatch('[A-Za-z0-9_.:/@+-]{1,64}',row[2]))
            pid,parent=int(row[0]),int(row[1]);C.require(pid<=2**31-1 and parent<=2**31-1 and pid not in rows)
            comm=row[2];kind='SHELL' if comm in {'sh','ash','bash','dash'} else 'EDGE_RUNTIME' if comm=='edge-runtime' else 'INIT' if comm in {'tini','docker-init'} else 'OTHER'
            rows[pid]=(parent,kind)
        C.require(pid1 in rows)
        edge=[value for value in rows.values() if value[1]=='EDGE_RUNTIME']
        parent_kind=rows[edge[0][0]][1] if len(edge)==1 and edge[0][0] in rows else 'UNKNOWN'
        return {'processes':len(rows),'pid1Kind':rows[pid1][1],'runtimeCount':len(edge),'runtimeParentKind':parent_kind}

    @staticmethod
    def safe_signals(raw):
        C.require(isinstance(raw,bytes) and len(raw)<=65536)
        text=raw.decode('utf-8',errors='replace');events=set()
        for number in re.findall(r'shutdown signal received: ([0-9]{1,2})\b',text):
            if number=='15':events.add('SIGTERM_RECEIVED')
        for pattern,event in [('interrupt signal received','SIGINT_RECEIVED'),
                ('received interrupt signal while waiting workers','DRAIN_INTERRUPTED'),
                ('did not able to terminate the workers within [0-9]+ seconds','GRACEFUL_TIMEOUT'),
                ('runtime exits immediately since the graceful exit feature has been disabled','DRAIN_DISABLED')]:
            if re.search(pattern,text):events.add(event)
        return sorted(events) if events else 'UNKNOWN'

    def database(self, plan):
        self.db=next(row['id'] for row in plan['containers'] if row['role']=='db')
        state=C.decode(C.read_file(self.runtime/'status-secret.json',private=True))
        target=urllib.parse.urlsplit(state['DB_URL'])
        C.require(target.scheme in {'postgres','postgresql'} and target.hostname=='127.0.0.1' and target.port==58322 and
                  target.username=='postgres' and target.path=='/postgres' and target.password and not target.query and not target.fragment)
        self.pg_env={'PGPASSWORD':urllib.parse.unquote(target.password),'PGOPTIONS':'-c default_transaction_read_only=on'}
        return self.sql('postgres',"select coalesce(json_agg(datname order by datname),'[]') from pg_database where not datistemplate;")

    def sql(self, database, query):
        args=['exec','-i','--env','PGPASSWORD','--env','PGOPTIONS',self.db,'psql','-X','-q','-t','-A','-w',
              '--host','127.0.0.1','--port','5432','--username','postgres','--dbname',database,'--set','ON_ERROR_STOP=1']
        return C.decode(self.docker(*args,data=("begin read only;set local statement_timeout='10s';"+query+'rollback;').encode(),env=self.pg_env).strip())

    def census(self, databases):
        result={'clusterRoles':self.sql('postgres',"select json_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,chr(10) order by to_jsonb(r)::text),''),'UTF8')),'hex')) from pg_authid r;")}
        for database in databases:
            tables=self.sql(database,"select coalesce(json_agg(json_build_array(n.nspname,c.relname) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and left(n.nspname,3)<>'pg_' and n.nspname<>'information_schema';")
            C.require(type(tables)is list and len(tables)<=256)
            queries=[]
            for schema,table in tables:
                import re
                C.require(all(isinstance(v,str) and re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,62}',v) for v in [schema,table]))
                queries.append("select json_build_object('schema','%s','table','%s','count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,chr(10) order by to_jsonb(t)::text),''),'UTF8')),'hex')) from \"%s\".\"%s\" t"%(schema,table,schema,table))
            result[database]=self.sql(database,'select coalesce(json_agg(v),\'[]\') from ('+' union all '.join(queries)+') q(v);') if queries else []
        return result

    def dump(self, database, target):
        program='pg_dumpall' if database is None else 'pg_dump'
        args=['exec','--env','PGPASSWORD','--env','PGOPTIONS',self.db,program,'--host','127.0.0.1',
              '--port','5432','--username','postgres','--no-password']
        args+=['--globals-only'] if database is None else ['--format=custom','--dbname',database]
        self.docker(*args,output=target,env=self.pg_env,timeout=90)

    def database_files(self, directory):
        for name in ['postgresql','postgresql-custom']:
            self.docker('cp',self.db+':/etc/'+name,'-',output=directory/(name+'.tar'),timeout=30)
        key=directory/'pgsodium_root.key'
        self.docker('exec',self.db,'cat','/etc/postgresql-custom/pgsodium_root.key',output=key)
        C.require(0<key.stat().st_size<=4096,'SNAPSHOT_VAULT_KEY_MISSING')

    def volume(self, mount, target):
        source=mount['source']
        before=self.run(['/usr/bin/sudo','-n','/usr/bin/python3','-B','-c',VOLUME_CENSUS,source],timeout=60)
        self.run(['/usr/bin/sudo','-n','/usr/bin/tar','--format=pax','--numeric-owner','--acls','--xattrs','--sparse',
                  '--create','--file=-','--directory',source,'.'],output=target,timeout=90)
        after=self.run(['/usr/bin/sudo','-n','/usr/bin/python3','-B','-c',VOLUME_CENSUS,source],timeout=60)
        C.require(before==after,'SNAPSHOT_VOLUME_CHANGED')
        return C.decode(before)
