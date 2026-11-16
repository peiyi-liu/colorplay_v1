"""Root outside-cgroup observer. Requires real Linux pidfds and owned empty leaf."""
import json
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
from linux_runtime_common import CGROOT, SOURCE, boot_sha, context, proc_cgroup, require, verify_executables

BUDGET=1500000
GATE="import os,sys; fd=int(sys.argv[1]); value=os.read(fd,1); os.close(fd); value==b'1' or sys.exit(125); os.execve(sys.argv[2],sys.argv[2:],dict(os.environ))"

def pid_identity(pid,owner_uid):
    """Kernel identity only. A disappearing process is not replaced with zero."""
    try:
        first=parse_stat(read_text(f"/proc/{pid}/stat"))
        require(first["pid"]==pid,"PROCESS_IDENTITY_INVALID")
        uid=[line.split() for line in read_text(f"/proc/{pid}/status").splitlines() if line.startswith("Uid:")]
        require(len(uid)==1 and len(uid[0])==5 and all(value.isdecimal() and int(value)==owner_uid for value in uid[0][1:]),"PROCESS_OWNER_CHANGED")
        if first["state"]=="Z":return None
        executable=os.readlink(f"/proc/{pid}/exe");info=os.stat(f"/proc/{pid}/exe")
        second=parse_stat(read_text(f"/proc/{pid}/stat"))
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
        self.seen={};self.saw_browser=False
        require(proc_cgroup(os.getpid())!=ctx["generatorCgroupRelativePath"],"ROOT_OBSERVER_INSIDE_WORKLOAD")
        require(not read_pid_members(self.group),"OWNED_CGROUP_NOT_EMPTY")
        require(hasattr(os,"pidfd_open") and hasattr(signal,"pidfd_send_signal"),"PIDFD_REQUIRED")

    def unchanged(self):
        require(boot_sha()==self.boot and cgroup_identity(self.group,CGROOT,self.boot)==self.pin,"OWNED_CGROUP_CHANGED")

    def track(self):
        self.unchanged()
        members=read_pid_members(self.group)
        for pid in members:
            row=pid_identity(pid,os.getuid())
            if row is None:continue
            key=(pid,row["startTicks"])
            if key in self.seen:continue
            try:fd=os.pidfd_open(pid,0)
            except ProcessLookupError:continue
            try:
                after=pid_identity(pid,os.getuid())
                if after is None:os.close(fd);continue
                require(after==row,"PROCESS_CHANGED_WHILE_TRACKING")
                self.seen[key]=fd
            except BaseException:
                os.close(fd);raise
            for pin in self.ctx["binaries"]["browser"]:
                if row["device"]==pin["device"] and row["inode"]==pin["inode"] and row["exe"]==pin["path"]:
                    self.saw_browser=True
        return members

    def remaining(self):
        members=self.track()
        live=sum(not select.select([fd],[],[],0)[0] for fd in self.seen.values())
        return max(len(members),live)

    def attach(self,pid):
        self.unchanged()
        row=pid_identity(pid,os.getuid());require(row is not None,"START_GATE_PROCESS_MISSING")
        fd=os.open(self.group/"cgroup.procs",os.O_WRONLY|os.O_NOFOLLOW)
        try:
            require(stat.S_ISREG(os.fstat(fd).st_mode),"CGROUP_PROCS_INVALID")
            os.write(fd,(str(pid)+"\n").encode())
        finally:os.close(fd)
        require(proc_cgroup(pid)==self.ctx["generatorCgroupRelativePath"],"START_GATE_ATTACH_FAILED")
        self.track()
        require((pid,row["startTicks"]) in self.seen,"START_GATE_IDENTITY_UNOBSERVED")

    def stop(self,process):
        # pidfds cannot signal a reused PID. cgroup.kill is restricted to the
        # new, pinned leaf and atomically includes descendants and late children.
        self.track()
        for fd in self.seen.values():signal_pidfd(fd,signal.SIGTERM)
        if process.poll() is None:process.terminate()
        deadline=time.monotonic()+1
        while time.monotonic()<deadline and self.remaining():time.sleep(0.025)
        self.unchanged()
        if read_pid_members(self.group):
            fd=os.open(self.group/"cgroup.kill",os.O_WRONLY|os.O_NOFOLLOW)
            try:os.write(fd,b"1\n")
            finally:os.close(fd)
        for fd in self.seen.values():signal_pidfd(fd,signal.SIGKILL)
        if process.poll() is None:process.kill()
        process.wait(timeout=3)
        deadline=time.monotonic()+2
        while time.monotonic()<deadline and self.remaining():time.sleep(0.025)
        return self.remaining()

    def close(self):
        for fd in self.seen.values():os.close(fd)
        self.seen.clear()

def run_child(arguments,progress_action="LOCAL_FUNCTIONAL_RUNNING"):
    ctx=context() # Must refuse Darwin before inspecting files or starting a child.
    require(progress_action in {"LOCAL_FUNCTIONAL_RUNNING","LOCAL_CAPACITY_RUNNING"},"PROGRESS_ACTION_INVALID")
    require(isinstance(arguments,list) and len(arguments)<=20 and arguments[0]==ctx["binaries"]["node"]["path"],"PRODUCER_BINARY_INVALID")
    verify_executables(ctx,full_hash=True)
    inventory=OwnedInventory(ctx);started=time.monotonic()
    gate_read=gate_write=None;process=None;selection=selectors.DefaultSelector()
    buffers={"stdout":bytearray(),"stderr":bytearray()};counts={"stdout":0,"stderr":0}
    complete=True;overflow=False;timed_out=False;cancelled=False;residue=None
    old_handlers={}
    def cancel(_signum,_frame):
        nonlocal cancelled
        cancelled=True
    try:
        for value in (signal.SIGINT,signal.SIGTERM):
            old_handlers[value]=signal.signal(value,cancel)
        gate_read,gate_write=os.pipe()
        env={"PATH":str(Path(arguments[0]).parent)+":/usr/bin:/bin","HOME":str(Path.home()),"PYTHONDONTWRITEBYTECODE":"1"}
        process=subprocess.Popen(["/usr/bin/python3","-I","-B","-c",GATE,str(gate_read),*arguments],cwd=SOURCE,env=env,pass_fds=(gate_read,),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        os.close(gate_read);gate_read=None
        inventory.attach(process.pid)
        os.write(gate_write,b"1");os.close(gate_write);gate_write=None
        for name,pipe in [("stdout",process.stdout),("stderr",process.stderr)]:
            os.set_blocking(pipe.fileno(),False);selection.register(pipe,selectors.EVENT_READ,name)
        sampled=notified=0
        while selection.get_map() or process.poll() is None:
            now=time.monotonic();elapsed=(now-started)*1000
            if now-sampled>=0.25:
                try:inventory.track()
                except Exception:complete=False;cancelled=True
                sampled=now
            if elapsed>=BUDGET-10000 or overflow or cancelled:
                timed_out=elapsed>=BUDGET-10000
                try:residue=inventory.stop(process)
                except Exception:complete=False
                break
            for key,_ in selection.select(timeout=0.05):
                data=os.read(key.fileobj.fileno(),65536)
                if not data:selection.unregister(key.fileobj);continue
                counts[key.data]+=len(data)
                limit=65536 if key.data=="stdout" else 8192
                if counts[key.data]>limit:overflow=True
                else:buffers[key.data].extend(data)
            if now-notified>=20:
                print(json.dumps({"action":progress_action,"elapsedSeconds":round(elapsed/1000),"observedOwnedProcesses":len(inventory.seen)}),flush=True);notified=now
        process.wait(timeout=3)
        residue=inventory.remaining()
        if residue:
            complete=False;residue=inventory.stop(process)
        inventory.unchanged()
    except BaseException:
        complete=False
        if process is not None:
            try:residue=inventory.stop(process)
            except Exception:pass
        raise
    finally:
        for fd in (gate_read,gate_write):
            if fd is not None:os.close(fd)
        if process is not None:
            for pipe in (process.stdout,process.stderr):
                if pipe is not None:pipe.close()
        selection.close();saw_browser=inventory.saw_browser;inventory.close()
        for value,handler in old_handlers.items():signal.signal(value,handler)
    return {"stdout":bytes(buffers["stdout"]),"stderrBytes":counts["stderr"],"code":process.returncode,"elapsedMs":(time.monotonic()-started)*1000,"complete":complete and not cancelled,"sawBrowser":saw_browser,"residue":residue,"timedOut":timed_out,"overflow":overflow}
