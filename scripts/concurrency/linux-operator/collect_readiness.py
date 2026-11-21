"""Read-only Linux facts for Root admission. This is not capacity proof."""
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import sys
import time
import linux_host_contract as H
from linux_proc import parse_meminfo, parse_psi, parse_smaps_rollup, parse_stat, process_identity

class AdmissionError(Exception):
    pass

def require(condition, code):
    if not condition: raise AdmissionError(code)

def read(path, maximum=131072):
    descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(descriptor,"rb") as stream:
        info=os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode),"PROC_FILE_INVALID")
        data=stream.read(maximum+1)
    require(len(data)<=maximum,"PROC_FILE_TOO_LARGE")
    return data.decode("ascii")

def boot_sha():
    value=read("/proc/sys/kernel/random/boot_id").strip()
    require(bool(re.fullmatch(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",value)),"BOOT_ID_INVALID")
    return hashlib.sha256(value.encode()).hexdigest()

def limit(path):
    value=read(path).strip()
    if value=="max":return None
    require(bool(re.fullmatch(r"[0-9]{1,20}",value)),"CGROUP_LIMIT_INVALID")
    return int(value)

def cpu_max(path):
    values=read(path).split()
    require(len(values)==2 and bool(re.fullmatch(r"[0-9]{1,20}",values[1])),"CGROUP_CPU_LIMIT_INVALID")
    require(values[0]=="max" or bool(re.fullmatch(r"[0-9]{1,20}",values[0])),"CGROUP_CPU_LIMIT_INVALID")
    period=int(values[1]);quota=None if values[0]=="max" else int(values[0])
    require(period>0 and (quota is None or quota>0),"CGROUP_CPU_LIMIT_INVALID")
    return {"quotaUs":quota,"periodUs":period}

def cgroup_limit_chain(root, relative):
    require(root.is_absolute() and root.resolve()==root and ".." not in Path(relative).parts,"CGROUP_PATH_INVALID")
    current=root/relative.lstrip("/");rows=[]
    require(current==root or root in current.parents,"CGROUP_PATH_INVALID")
    while True:
        require(current.resolve()==current,"CGROUP_PATH_INVALID")
        info=current.stat();require(stat.S_ISDIR(info.st_mode),"CGROUP_PATH_INVALID")
        is_root=current==root
        def value(name, reader):
            path=current/name
            if is_root and not path.exists():return "NOT_APPLICABLE_AT_HIERARCHY_ROOT"
            return reader(path)
        rows.append({"pathSha256":hashlib.sha256(str(current.relative_to(root)).encode()).hexdigest(),"device":info.st_dev,"inode":info.st_ino,"hierarchyRoot":is_root,"cpuMax":value("cpu.max",cpu_max),"memoryMaxBytes":value("memory.max",limit),"swapMaxBytes":value("memory.swap.max",limit)})
        if is_root:break
        current=current.parent
    return rows

def collect():
    require(platform.system()=="Linux" and sys.platform=="linux","LINUX_REQUIRED")
    require(platform.machine() in ("x86_64","amd64"),"LINUX_X64_REQUIRED")
    pid=os.getpid();uid=os.getuid();boot=boot_sha()
    before=parse_stat(read(f"/proc/{pid}/stat"))
    require(before["pid"]==pid,"PROC_PID_MISMATCH")
    memory=parse_meminfo(read("/proc/meminfo"))
    pressure=parse_psi(read("/proc/pressure/memory"))
    own_memory=parse_smaps_rollup(read(f"/proc/{pid}/smaps_rollup"))
    controllers=read("/sys/fs/cgroup/cgroup.controllers").split()
    require({"cpu","memory","pids"}.issubset(set(controllers)),"CGROUP_V2_CONTROLLERS_REQUIRED")
    own_cgroup=read(f"/proc/{pid}/cgroup").splitlines()
    require(len(own_cgroup)==1 and own_cgroup[0].startswith("0::/"),"CGROUP_V2_UNIFIED_REQUIRED")
    relative=own_cgroup[0][3:]
    require(".." not in Path(relative).parts,"CGROUP_PATH_INVALID")
    vmstat={}
    for line in read("/proc/vmstat",1048576).splitlines():
        parts=line.split()
        if len(parts)==2 and parts[0]=="oom_kill":vmstat["oomKillCount"]=int(parts[1])
    require("oomKillCount" in vmstat and vmstat["oomKillCount"]>=0,"HOST_OOM_COUNTER_REQUIRED")
    affinity=sorted(os.sched_getaffinity(0));logical=os.cpu_count()
    after=parse_stat(read(f"/proc/{pid}/stat"))
    require(after["startTicks"]==before["startTicks"] and boot_sha()==boot,"PROC_IDENTITY_CHANGED")
    kind=H.kind_for_cpu(logical)
    require(logical==H.target(kind)["cpu"] and len(affinity)==logical and len(set(affinity))==logical,"FREE_PROFILE_CPU_MISMATCH")
    require(H.hardware_matches(kind,logical,affinity,memory["totalBytes"]),"FREE_PROFILE_MEMORY_MISMATCH")
    filesystem=shutil.disk_usage(Path.cwd())
    return {"schemaVersion":1,"kind":"ROOT_LINUX_READINESS_FACTS","capacityProof":False,"executionAuthority":"NONE","platform":"linux","architecture":platform.machine(),"kernelRelease":platform.release(),"pythonVersion":platform.python_version(),"sampledAtMonotonicMs":time.monotonic_ns()/1000000,"hostBootIdSha256":boot,"hostLogicalCpu":logical,"cpuAffinity":affinity,"memory":memory,"memoryPsi":pressure,"hostOomKillCount":vmstat["oomKillCount"],"samplerSelf":{"pid":pid,"uid":uid,"startTicks":after["startTicks"],"identitySha256":process_identity(boot,pid,after["startTicks"],uid),**own_memory},"cgroupVersion":2,"cgroupPathSha256":hashlib.sha256(relative.encode()).hexdigest(),"samplerCgroupLimitChain":cgroup_limit_chain(Path("/sys/fs/cgroup"),relative),"workingFilesystem":{"totalBytes":filesystem.total,"freeBytes":filesystem.free},"backendAttested":False,"chromiumClosureAttested":False}

def main():
    require(len(sys.argv)==2,"OUTPUT_FILE_REQUIRED")
    target=Path(sys.argv[1]);parent=target.parent
    require(parent.is_absolute() and parent.resolve()==parent,"PRIVATE_DIRECTORY_INVALID")
    info=parent.lstat()
    require(stat.S_ISDIR(info.st_mode) and stat.S_IMODE(info.st_mode)==0o700 and info.st_uid==os.getuid(),"PRIVATE_DIRECTORY_INVALID")
    value=collect()
    payload=(json.dumps(value,indent=2)+"\n").encode()
    descriptor=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,"wb") as stream:stream.write(payload);stream.flush();os.fsync(stream.fileno())
    print(json.dumps({"kind":value["kind"],"sha256":hashlib.sha256(payload).hexdigest(),"executionAuthority":"NONE","capacityProof":False}))

if __name__=="__main__":
    try:main()
    except Exception as error:
        code=str(error) if isinstance(error,AdmissionError) else "READINESS_UNAVAILABLE"
        print(json.dumps({"result":"READINESS_REJECTED","code":code,"executionAuthority":"NONE","capacityProof":False}))
        raise SystemExit(2) from None
