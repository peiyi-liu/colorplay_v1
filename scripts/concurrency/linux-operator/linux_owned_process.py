"""Root outside-cgroup observer. Requires real Linux pidfds and owned empty leaf."""
import json
import hashlib
import math
import importlib.util
import secrets
import os
from pathlib import Path
import select
import selectors
import signal
import stat
import subprocess
import time
from linux_proc import parse_stat
from linux_cgroup import checked_group, cgroup_identity, read_pid_members, read_text
from linux_runtime_common import CGROOT, SOURCE, boot_sha, context, proc_cgroup, require, verify_executables, private_read

BUDGET=1500000
GATE="import os,sys\ncap=int(sys.argv[1]); fd=int(sys.argv[2]); ready=int(sys.argv[3])\nos.set_inheritable(cap,False)\ntry:\n    if os.write(cap,b'0\\n')!=2: raise OSError('SELF_ATTACH_SHORT_WRITE')\nfinally: os.close(cap)\nos.write(ready,b'R'); os.close(ready)\nvalue=os.read(fd,1); os.close(fd)\nvalue==b'1' or sys.exit(125)\nos.execve(sys.argv[4],sys.argv[4:],dict(os.environ))"

ERROR_CODES=frozenset({'PROCESS_IDENTITY_INVALID','PROCESS_OWNER_CHANGED','PROCESS_PID_REUSED','PROCESS_CHANGED_WHILE_TRACKING','OWNED_CGROUP_CHANGED','LINUX_CGROUP_INVALID','LINUX_PROC_INVALID','BOOT_ID_INVALID','LINUX_RUNTIME_INVALID','START_GATE_PROCESS_MISSING','START_GATE_IDENTITY_CHANGED','START_GATE_CANCELLED','CAPABILITY_COPY_REMAINS','START_GATE_NOT_READY','CAPABILITY_NOT_READY','ROOT_OBSERVER_INSIDE_WORKLOAD','OWNED_CGROUP_NOT_EMPTY','PIDFD_REQUIRED','START_GATE_ATTACH_FAILED','START_GATE_IDENTITY_UNOBSERVED','PROGRESS_ACTION_INVALID','PRODUCER_BINARY_INVALID','CGROUP_V2_REQUIRED','CGROUP_PATH_INVALID','START_GATE_CODE_CHANGED','CAPABILITY_CENSUS_INVALID','CAPABILITY_CENSUS_CHANGED'})
TRACK_STAGES=frozenset({'UNOBSERVED','UNKNOWN','CGROUP_CHECK','MEMBERS','FIRST_IDENTITY','SECOND_IDENTITY','PIDFD_OPEN','COMPARE','PIDFD_LIVENESS'}|{p+'_'+x for p in ('IDENTITY','FIRST','SECOND') for x in ('STAT','STATUS','EXE_READLINK','EXE_STAT','STAT_RECHECK','PID_COMPARE')})
STOP_STAGES=frozenset({'UNKNOWN','TRACK','STOP','STOP_TRACK','PIDFD_TERM','MAIN_TERM','GRACE','STOP_CGROUP_CHECK','KILL_MEMBERS','CGROUP_KILL','PIDFD_KILL','MAIN_KILL','WAIT','RESIDUE_WAIT','FINAL_RESIDUE','FD_CLOSE','PIPE_CLOSE','SELECTOR_CLOSE','INVENTORY_CLOSE','SIGNAL_RESTORE'})
CAUSES=frozenset({'UNKNOWN','DEADLINE','STDOUT_OVERFLOW','STDERR_OVERFLOW','PARENT_SIGINT','PARENT_SIGTERM','TRACK_EXCEPTION','BASE_EXCEPTION','RESIDUE_CLEANUP'})
ERRNOS={1:'EPERM',2:'ENOENT',3:'ESRCH',5:'EIO',9:'EBADF',12:'ENOMEM',13:'EACCES',23:'ENFILE',24:'EMFILE',22:'EINVAL',110:'ETIMEDOUT'}

def _observe(diagnostic,method,*args):
    if diagnostic is not None:
        try:getattr(diagnostic,method)(*args)
        except BaseException:
            try:diagnostic.unavailable=True
            except BaseException:pass

def _error(error):
    name=type(error).__name__
    kind=name if name in {'ValueError','AssertionError','PermissionError','FileNotFoundError','ProcessLookupError','OSError','TimeoutExpired','KeyboardInterrupt','SystemExit'} else 'OTHER'
    args=getattr(error,'args',())
    code=args[0] if len(args)==1 and type(args[0])is str and args[0]in ERROR_CODES else 'UNKNOWN'
    number=getattr(error,'errno',None)
    return {'class':kind,'code':code,'errno':None if number is None else ERRNOS.get(number,'OTHER')}

TRANSITION_MODULE_SHA256='2c278997e303714df5fc14112799e831405d527b6b94809f6ba8c26c8c49f8c1'

def _transition_collector():
    try:
        path=Path(__file__).with_name('linux_process_transition.py')
        raw=private_read(path,65536)
        if hashlib.sha256(raw).hexdigest()!=TRANSITION_MODULE_SHA256:return None
        namespace={'__file__':str(path)}
        exec(compile(raw,str(path),'exec'),namespace)
        return namespace['ProcessTransitionDiagnostics']()
    except BaseException:return None

class ParentStopDiagnostics:
    def __init__(self):
        self.first=None;self.claim={};self.events=[];self.overflow=False;self.unavailable=False;self.last_loop=None
        self.track={'stage':'UNOBSERVED','fields':[],'firstRole':'UNOBSERVED','secondRole':'UNOBSERVED'}
        self.stop_phase='UNOBSERVED';self.final=None;self.observer_closed=False;self.pins={};self.python=None;self.binding=None;self.transition=_transition_collector()
    def configure(self,ctx,boot):
        self.pins=ctx['binaries'];job=ctx.get('job')
        self.transition_call('configure',ctx)
        self.binding={'sourceRevision':ctx.get('sourceRevision'),'bootIdSha256':boot,'jobSha256':hashlib.sha256(json.dumps(job,sort_keys=True,separators=(',',':')).encode()).hexdigest() if type(job)is dict else None}
    def python_pin(self,row):
        self.python=row;self.transition_call('python_pin',row)
    def transition_call(self,method,*args):
        try:
            if self.transition is not None:getattr(self.transition,method)(*args)
        except BaseException:self.transition=None
    def transition_begin(self):self.transition_call('begin')
    def transition_piece(self,*args):self.transition_call('piece',*args)
    def transition_failure(self,*args):self.transition_call('failure',*args)
    def transition_snapshot(self):
        try:
            if self.transition is not None:return self.transition.snapshot()
        except BaseException:pass
        return {'schemaVersion':1,'authority':'NON_AUTHORITY','collection':'UNAVAILABLE','phase':'FAILED_COMPARE','pair':None,'afterFailure':None}
    def role(self,row):
        if row is None:return 'UNOBSERVED'
        def matches(pin):return all(row.get(k)==pin.get(k if k!='exe' else 'path') for k in ('device','inode','exe'))
        if matches(self.pins.get('node',{})):return 'NODE'
        if any(matches(p) for p in self.pins.get('browser',[])):return 'BROWSER'
        if self.python and all(row.get(k)==self.python.get(k) for k in ('device','inode','exe')):return 'PYTHON'
        return 'OTHER' if self.python else 'UNKNOWN'
    def tick(self,elapsed,counts):self.last_loop={'elapsedMs':elapsed if type(elapsed)in(int,float) and math.isfinite(elapsed) and elapsed>=0 else None,'stdoutBytes':counts['stdout'],'stderrBytes':counts['stderr']}
    def cause(self,reason,error=None):
        token=object()
        if self.claim.setdefault('first',token) is not token:return
        self.first={'reason':reason if reason in CAUSES else 'UNKNOWN','atElapsedMs':None,'timeObservation':'UNOBSERVED','lastLoop':dict(self.last_loop) if self.last_loop else None,'parentStage':self.stop_phase,'track':{k:list(v) if type(v)is list else v for k,v in self.track.items()},'error':_error(error) if error is not None else None}
    def track_stage(self,stage):self.track={'stage':stage if stage in TRACK_STAGES else 'UNKNOWN','fields':[],'firstRole':'UNOBSERVED','secondRole':'UNOBSERVED'}
    def compare(self,first,second):self.track.update(fields=[k for k in ('pid','startTicks','uid','exe','device','inode') if first.get(k)!=second.get(k)],firstRole=self.role(first),secondRole=self.role(second))
    def track_failure(self,error):self.event('TRACK','RAISED',error=error)
    def event(self,phase,state,count=None,error=None):
        if len(self.events)>=64:self.overflow=True;return
        self.events.append({'phase':phase if phase in STOP_STAGES else 'UNKNOWN','state':state if state in {'ENTERED','CALL_RETURNED','SKIPPED','RAISED'} else 'UNKNOWN','count':count,'error':_error(error) if error is not None else None})
    def stage(self,name):self.stop_phase=name if name in STOP_STAGES else 'UNKNOWN';self.event(self.stop_phase,'ENTERED')
    def returned(self,count=None):self.event(self.stop_phase,'CALL_RETURNED',count)
    def finish(self,counts,complete,cancelled,timed_out,overflow,residue,browser,code):
        self.observer_closed=True;self.final={'stdoutBytes':counts['stdout'],'stderrBytes':counts['stderr'],'complete':complete,'cancelled':cancelled,'timedOut':timed_out,'overflow':overflow,'residue':residue,'sawBrowser':browser,'exitCode':code}
    def snapshot(self):
        return {'schemaVersion':1,'authority':'NON_AUTHORITY','clock':'PARENT_MONOTONIC_ELAPSED','collection':'UNAVAILABLE' if self.unavailable or not self.observer_closed else 'OBSERVED','firstCause':self.first,'lastLoop':self.last_loop,'contextBinding':self.binding,'stopEvents':list(self.events),'eventOverflow':self.overflow,'observerResourcesClosed':self.observer_closed,'final':self.final}

def _stop(inventory,process,diagnostic):
    _observe(diagnostic,'stage','STOP')
    try:value=inventory.stop(process)
    except BaseException as error:
        _observe(diagnostic,'event',getattr(diagnostic,'stop_phase','STOP'),'RAISED',None,error);raise
    _observe(diagnostic,'event','STOP','CALL_RETURNED',value)
    return value

def pid_identity(pid,owner_uid,diagnostics=None,prefix="IDENTITY"):
    """Kernel identity only. A disappearing process is not replaced with zero."""
    try:
        _observe(diagnostics,'track_stage',prefix+'_STAT')
        first=parse_stat(read_text(f"/proc/{pid}/stat"))
        _observe(diagnostics,'transition_piece',prefix,'stat',first)
        require(first["pid"]==pid,"PROCESS_IDENTITY_INVALID")
        _observe(diagnostics,'track_stage',prefix+'_STATUS')
        uid=[line.split() for line in read_text(f"/proc/{pid}/status").splitlines() if line.startswith("Uid:")]
        require(len(uid)==1 and len(uid[0])==5 and all(value.isdecimal() and int(value)==owner_uid for value in uid[0][1:]),"PROCESS_OWNER_CHANGED")
        _observe(diagnostics,'transition_piece',prefix,'uid',owner_uid)
        if first["state"]=="Z":return None
        _observe(diagnostics,'track_stage',prefix+'_EXE_READLINK')
        executable=os.readlink(f"/proc/{pid}/exe")
        _observe(diagnostics,'transition_piece',prefix,'readlink',executable)
        _observe(diagnostics,'track_stage',prefix+'_EXE_STAT')
        info=os.stat(f"/proc/{pid}/exe")
        _observe(diagnostics,'transition_piece',prefix,'exeStat',{'device':info.st_dev,'inode':info.st_ino})
        _observe(diagnostics,'track_stage',prefix+'_STAT_RECHECK')
        second=parse_stat(read_text(f"/proc/{pid}/stat"))
        _observe(diagnostics,'transition_piece',prefix,'recheck',second)
        _observe(diagnostics,'track_stage',prefix+'_PID_COMPARE')
        require(first["startTicks"]==second["startTicks"],"PROCESS_PID_REUSED")
        return {"pid":pid,"startTicks":first["startTicks"],"uid":owner_uid,"exe":executable,"device":info.st_dev,"inode":info.st_ino}
    except (FileNotFoundError,ProcessLookupError):return None

def signal_pidfd(fd,value):
    try:signal.pidfd_send_signal(fd,value)
    except ProcessLookupError:pass

class OwnedInventory:
    def __init__(self,ctx):
        self.ctx=ctx;self.boot=boot_sha()
        self.group=checked_group(CGROOT/ctx["generatorCgroupRelativePath"].lstrip("/"),CGROOT)
        self.pin=cgroup_identity(self.group,CGROOT,self.boot)
        self.seen={};self.saw_browser=False;self.diagnostics=None
        require(proc_cgroup(os.getpid())!=ctx["generatorCgroupRelativePath"],"ROOT_OBSERVER_INSIDE_WORKLOAD")
        require(not read_pid_members(self.group),"OWNED_CGROUP_NOT_EMPTY")
        require(hasattr(os,"pidfd_open") and hasattr(signal,"pidfd_send_signal"),"PIDFD_REQUIRED")

    def unchanged(self):
        require(boot_sha()==self.boot and cgroup_identity(self.group,CGROOT,self.boot)==self.pin,"OWNED_CGROUP_CHANGED")

    def track(self):
        try:return self._track()
        except BaseException as error:
            _observe(self.diagnostics,'track_failure',error);raise

    def _track(self):
        _observe(self.diagnostics,'track_stage','CGROUP_CHECK')
        self.unchanged()
        _observe(self.diagnostics,'track_stage','MEMBERS')
        members=read_pid_members(self.group)
        for pid in members:
            _observe(self.diagnostics,'transition_begin')
            _observe(self.diagnostics,'track_stage','FIRST_IDENTITY')
            row=pid_identity(pid,os.getuid(),self.diagnostics,'FIRST')
            if row is None:continue
            key=(pid,row["startTicks"])
            if key in self.seen:continue
            _observe(self.diagnostics,'track_stage','PIDFD_OPEN')
            try:fd=os.pidfd_open(pid,0)
            except ProcessLookupError:continue
            try:
                _observe(self.diagnostics,'track_stage','SECOND_IDENTITY')
                after=pid_identity(pid,os.getuid(),self.diagnostics,'SECOND')
                if after is None:os.close(fd);continue
                _observe(self.diagnostics,'track_stage','COMPARE')
                _observe(self.diagnostics,'compare',row,after)
                try:require(after==row,"PROCESS_CHANGED_WHILE_TRACKING")
                except BaseException:
                    _observe(self.diagnostics,'transition_failure',self.ctx,row,after,self.seen,True)
                    raise
                self.seen[key]=fd
            except BaseException:
                os.close(fd);raise
            for pin in self.ctx["binaries"]["browser"]:
                if row["device"]==pin["device"] and row["inode"]==pin["inode"] and row["exe"]==pin["path"]:
                    self.saw_browser=True
        return members

    def remaining(self):
        members=self.track()
        _observe(self.diagnostics,'track_stage','PIDFD_LIVENESS')
        live=sum(not select.select([fd],[],[],0)[0] for fd in self.seen.values())
        return max(len(members),live)

    def acquire(self,deadline,cancelled):
        self.unchanged();require(not read_pid_members(self.group),'OWNED_CGROUP_NOT_EMPTY')
        client=getattr(self,'authority_client',None)
        if client is None:
            spec=importlib.util.spec_from_file_location('owned_attach_client',Path(__file__).with_name('privileged-attach.py'))
            helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
            require(helper.GATE==GATE,'START_GATE_CODE_CHANGED');client=helper.client
        return client(self.ctx,{'schemaVersion':1,'attachNonce':secrets.token_hex(16)},deadline,cancelled)

    def attach(self,pid):
        # The exact controller gate has already self-migrated and closed capFD.
        self.unchanged()
        row=pid_identity(pid,os.getuid());require(row is not None,'START_GATE_PROCESS_MISSING')
        require(proc_cgroup(pid)==self.ctx['generatorCgroupRelativePath'],'START_GATE_ATTACH_FAILED')
        self.track();require((pid,row['startTicks']) in self.seen,'START_GATE_IDENTITY_UNOBSERVED')

    def stop(self,process):
        # Preserve original signals, target identities, grace and physical waits.
        d=self.diagnostics
        _observe(d,'stage','STOP_TRACK');self.track();_observe(d,'returned')
        _observe(d,'stage','PIDFD_TERM');count=0
        for fd in self.seen.values():signal_pidfd(fd,signal.SIGTERM);count+=1
        _observe(d,'returned',count)
        _observe(d,'stage','MAIN_TERM')
        if process.poll() is None:process.terminate();_observe(d,'returned',1)
        else:_observe(d,'event','MAIN_TERM','SKIPPED',0)
        _observe(d,'stage','GRACE')
        deadline=time.monotonic()+1
        while time.monotonic()<deadline and self.remaining():time.sleep(0.025)
        _observe(d,'returned')
        _observe(d,'stage','STOP_CGROUP_CHECK');self.unchanged();_observe(d,'returned')
        _observe(d,'stage','KILL_MEMBERS');members=read_pid_members(self.group);_observe(d,'returned',len(members))
        _observe(d,'stage','CGROUP_KILL')
        if members:
            fd=os.open(self.group/"cgroup.kill",os.O_WRONLY|os.O_NOFOLLOW)
            try:os.write(fd,b"1\n")
            finally:os.close(fd)
            _observe(d,'returned',1)
        else:_observe(d,'event','CGROUP_KILL','SKIPPED',0)
        _observe(d,'stage','PIDFD_KILL');count=0
        for fd in self.seen.values():signal_pidfd(fd,signal.SIGKILL);count+=1
        _observe(d,'returned',count)
        _observe(d,'stage','MAIN_KILL')
        if process.poll() is None:process.kill();_observe(d,'returned',1)
        else:_observe(d,'event','MAIN_KILL','SKIPPED',0)
        _observe(d,'stage','WAIT');process.wait(timeout=3);_observe(d,'returned')
        _observe(d,'stage','RESIDUE_WAIT')
        deadline=time.monotonic()+2
        while time.monotonic()<deadline and self.remaining():time.sleep(0.025)
        _observe(d,'returned')
        _observe(d,'stage','FINAL_RESIDUE');value=self.remaining();_observe(d,'returned',value)
        return value

    def close(self):
        for fd in self.seen.values():os.close(fd)
        self.seen.clear()

def capability_census(pid,pin):
    directory=Path('/proc')/str(pid)/'fd';names=os.listdir(directory)
    require(len(names)<=256 and all(name.isdecimal() for name in names),'CAPABILITY_CENSUS_INVALID')
    count=0
    for name in names:
        try:info=os.stat(directory/name)
        except FileNotFoundError:
            require(pid==os.getpid(),'CAPABILITY_CENSUS_CHANGED');continue
        if (info.st_dev,info.st_ino)==pin:count+=1
    return count


def gate_matches(pid,arguments):
    row=pid_identity(pid,os.getuid());require(row is not None,'START_GATE_PROCESS_MISSING')
    own=os.stat('/proc/self/exe')
    actual=read_text(f'/proc/{pid}/cmdline').split('\0')
    return (actual==[*arguments,''] and (row['device'],row['inode'])==(own.st_dev,own.st_ino))


def run_child(arguments,progress_action="LOCAL_FUNCTIONAL_RUNNING",diagnostics=None):
    try:
        ctx=context() # Must refuse Darwin before inspecting files or starting a child.
        require(progress_action in {"LOCAL_FUNCTIONAL_RUNNING","LOCAL_CAPACITY_RUNNING"},"PROGRESS_ACTION_INVALID")
        require(isinstance(arguments,list) and len(arguments)<=20 and arguments[0]==ctx["binaries"]["node"]["path"],"PRODUCER_BINARY_INVALID")
        verify_executables(ctx,full_hash=True)
        inventory=OwnedInventory(ctx);started=time.monotonic()
    except BaseException as error:
        _observe(diagnostics,'cause','BASE_EXCEPTION',error);raise
    if diagnostics is not None:
        inventory.diagnostics=diagnostics
        _observe(diagnostics,'configure',ctx,getattr(inventory,'boot',None))
    gate_read=gate_write=ready_read=ready_write=gate_pidfd=capfd=None;process=None;selection=selectors.DefaultSelector()
    buffers={"stdout":bytearray(),"stderr":bytearray()};counts={"stdout":0,"stderr":0}
    complete=True;overflow=False;timed_out=False;cancelled=False;residue=None
    old_handlers={}
    def cancel(_signum,_frame):
        nonlocal cancelled
        _observe(diagnostics,'cause','PARENT_SIGINT' if _signum==signal.SIGINT else 'PARENT_SIGTERM')
        cancelled=True
    try:
        for value in (signal.SIGINT,signal.SIGTERM):
            old_handlers[value]=signal.signal(value,cancel)
        deadline=started+BUDGET/1000-10
        # No gate/producer exists until the root opener has physically exited.
        capfd=inventory.acquire(deadline,lambda:cancelled)
        info=os.fstat(capfd);cap_pin=(info.st_dev,info.st_ino)
        require(not os.get_inheritable(capfd) and not cancelled and time.monotonic()<deadline,'CAPABILITY_NOT_READY')
        gate_read,gate_write=os.pipe();ready_read,ready_write=os.pipe()
        env={'PATH':str(Path(arguments[0]).parent)+':/usr/bin:/bin','HOME':str(Path.home()),'PYTHONDONTWRITEBYTECODE':'1'}
        gate_arguments=['/usr/bin/python3','-I','-B','-c',GATE,str(capfd),str(gate_read),str(ready_write),*arguments]
        process=subprocess.Popen(gate_arguments,cwd=SOURCE,env=env,pass_fds=(capfd,gate_read,ready_write),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        os.close(capfd);capfd=None
        os.close(gate_read);gate_read=None
        os.close(ready_write);ready_write=None
        gate_pidfd=os.pidfd_open(process.pid)
        require(select.select([ready_read],[],[],max(0,min(5,deadline-time.monotonic())))[0] and os.read(ready_read,2)==b'R' and not cancelled,'START_GATE_NOT_READY')
        row=pid_identity(process.pid,os.getuid());require(row is not None,'START_GATE_PROCESS_MISSING')
        require(gate_matches(process.pid,gate_arguments),'START_GATE_IDENTITY_CHANGED')
        require(capability_census(os.getpid(),cap_pin)==0 and capability_census(process.pid,cap_pin)==0,'CAPABILITY_COPY_REMAINS')
        inventory.attach(process.pid)
        require(pid_identity(process.pid,os.getuid())==row and not cancelled and time.monotonic()<deadline,'START_GATE_CANCELLED')
        _observe(diagnostics,'python_pin',row)
        os.write(gate_write,b"1");os.close(gate_write);gate_write=None
        for name,pipe in [("stdout",process.stdout),("stderr",process.stderr)]:
            os.set_blocking(pipe.fileno(),False);selection.register(pipe,selectors.EVENT_READ,name)
        sampled=notified=0
        while selection.get_map() or process.poll() is None:
            now=time.monotonic();elapsed=(now-started)*1000
            _observe(diagnostics,'tick',elapsed,counts)
            if now-sampled>=0.25:
                try:inventory.track()
                except Exception as error:
                    _observe(diagnostics,'cause','TRACK_EXCEPTION',error)
                    complete=False;cancelled=True
                sampled=now
            if elapsed>=BUDGET-10000 or overflow or cancelled:
                timed_out=elapsed>=BUDGET-10000
                if timed_out:_observe(diagnostics,'cause','DEADLINE')
                try:residue=_stop(inventory,process,diagnostics)
                except Exception:complete=False
                break
            for key,_ in selection.select(timeout=0.05):
                data=os.read(key.fileobj.fileno(),65536)
                if not data:selection.unregister(key.fileobj);continue
                counts[key.data]+=len(data)
                limit=65536 if key.data=="stdout" else 8192
                if counts[key.data]>limit:
                    _observe(diagnostics,'cause','STDOUT_OVERFLOW' if key.data=='stdout' else 'STDERR_OVERFLOW')
                    overflow=True
                else:buffers[key.data].extend(data)
            if now-notified>=20:
                print(json.dumps({"action":progress_action,"elapsedSeconds":round(elapsed/1000),"observedOwnedProcesses":len(inventory.seen)}),flush=True);notified=now
        process.wait(timeout=3)
        residue=inventory.remaining()
        if residue:
            _observe(diagnostics,'cause','RESIDUE_CLEANUP')
            complete=False;residue=_stop(inventory,process,diagnostics)
        inventory.unchanged()
    except BaseException as error:
        _observe(diagnostics,'cause','BASE_EXCEPTION',error)
        complete=False
        if process is not None:
            try:residue=_stop(inventory,process,diagnostics)
            except Exception:pass
        raise
    finally:
        try:
            _observe(diagnostics,'stage','FD_CLOSE')
            for fd in (gate_read,gate_write,ready_read,ready_write,gate_pidfd,capfd):
                if fd is not None:os.close(fd)
            _observe(diagnostics,'returned')
            _observe(diagnostics,'stage','PIPE_CLOSE')
            if process is not None:
                for pipe in (process.stdout,process.stderr):
                    if pipe is not None:pipe.close()
            _observe(diagnostics,'returned')
            _observe(diagnostics,'stage','SELECTOR_CLOSE');selection.close();_observe(diagnostics,'returned')
            saw_browser=inventory.saw_browser
            _observe(diagnostics,'stage','INVENTORY_CLOSE');inventory.close();_observe(diagnostics,'returned')
            _observe(diagnostics,'stage','SIGNAL_RESTORE')
            for value,handler in old_handlers.items():signal.signal(value,handler)
            _observe(diagnostics,'returned')
            _observe(diagnostics,'finish',counts,complete,cancelled,timed_out,overflow,residue,saw_browser,process.returncode if process is not None else None)
        except BaseException as error:
            _observe(diagnostics,'cause','BASE_EXCEPTION',error)
            _observe(diagnostics,'event',getattr(diagnostics,'stop_phase','UNKNOWN'),'RAISED',None,error)
            raise
    return {"stdout":bytes(buffers["stdout"]),"stderrBytes":counts["stderr"],"code":process.returncode,"elapsedMs":(time.monotonic()-started)*1000,"complete":complete and not cancelled,"sawBrowser":saw_browser,"residue":residue,"timedOut":timed_out,"overflow":overflow}
