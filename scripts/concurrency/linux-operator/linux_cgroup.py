"""Read-only cgroup v2 facts. Missing non-root data never becomes a zero."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from fractions import Fraction

ROOT_NOT_APPLICABLE="NOT_APPLICABLE_AT_HIERARCHY_ROOT"

def require(condition):
    if not condition:raise ValueError("LINUX_CGROUP_INVALID")

def read_text(path, maximum=131072):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,"rb") as stream:
        require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode))
        data=stream.read(maximum+1)
    require(len(data)<=maximum)
    return data.decode("ascii")

def integer(value, positive=False):
    require(isinstance(value,str) and bool(re.fullmatch(r"[0-9]{1,20}",value)))
    result=int(value);require(result<=2**63-1 and (not positive or result>0))
    return result

def read_counter_map(text):
    result={}
    for line in text.splitlines():
        parts=line.split();require(len(parts)==2 and bool(re.fullmatch(r"[a-z_][a-z0-9_.]*",parts[0])) and parts[0] not in result)
        result[parts[0]]=integer(parts[1])
    return result

def scalar(path):
    value=read_text(path).strip()
    return None if value=="max" else integer(value)

def cpu_max(path):
    values=read_text(path).split();require(len(values)==2)
    return {"quotaUs":None if values[0]=="max" else integer(values[0],True),"periodUs":integer(values[1],True)}

def checked_group(path, root=None):
    path=Path(path);require(path.is_absolute() and path.resolve()==path and path.is_dir())
    if root is not None:require(path==root or root in path.parents)
    return path

def cgroup_limit_chain(root, relative):
    root=checked_group(root);require(isinstance(relative,str) and relative.startswith("/") and ".." not in Path(relative).parts)
    current=checked_group(root/relative.lstrip("/"),root);rows=[]
    while True:
        current=checked_group(current,root);info=current.stat();is_root=current==root
        def value(name,reader):
            file=current/name
            return ROOT_NOT_APPLICABLE if is_root and not file.exists() else reader(file)
        rows.append({"pathSha256":hashlib.sha256(str(current.relative_to(root)).encode()).hexdigest(),"device":info.st_dev,"inode":info.st_ino,"hierarchyRoot":is_root,"cpuMax":value("cpu.max",cpu_max),"memoryMaxBytes":value("memory.max",scalar),"swapMaxBytes":value("memory.swap.max",scalar)})
        if is_root:return rows
        current=current.parent

def effective_cpu_quota(chain):
    candidates=[]
    for row in chain:
        value=row["cpuMax"]
        if value==ROOT_NOT_APPLICABLE:continue
        require(isinstance(value,dict) and value.keys()=={"quotaUs","periodUs"})
        require(type(value["periodUs"])is int and value["periodUs"]>0)
        if value["quotaUs"]is not None:
            require(type(value["quotaUs"])is int and value["quotaUs"]>0)
            candidates.append(value)
    return min(candidates,key=lambda v:Fraction(v["quotaUs"],v["periodUs"])) if candidates else {"quotaUs":None,"periodUs":None}

def cgroup_identity(path,root,boot_sha,binding=None):
    root=checked_group(root);path=checked_group(path,root)
    require(isinstance(boot_sha,str) and bool(re.fullmatch(r"[a-f0-9]{64}",boot_sha)))
    info=path.stat()
    data={"bootIdSha256":boot_sha,"relativePath":str(path.relative_to(root)),"device":info.st_dev,"inode":info.st_ino,"binding":binding}
    return hashlib.sha256(json.dumps(data,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()).hexdigest()

def read_pid_members(group):
    group=checked_group(group);pending=[group];seen=set();visited=0
    while pending:
        current=checked_group(pending.pop(),group);visited+=1;require(visited<=1000)
        for line in read_text(current/"cgroup.procs").splitlines():seen.add(integer(line,True))
        require(len(seen)<=10000)
        with os.scandir(current) as entries:
            for item in entries:
                require(not item.is_symlink())
                if item.is_dir(follow_symlinks=False):pending.append(Path(item.path))
    return sorted(seen)

def read_backend_values(group):
    group=checked_group(group);cpu=cpu_max(group/"cpu.max");maximum=scalar(group/"memory.max")
    require(cpu["quotaUs"] is not None and maximum is not None and maximum>0)
    cpu_stats=read_counter_map(read_text(group/"cpu.stat"));events=read_counter_map(read_text(group/"memory.events"))
    require({"usage_usec","throttled_usec"}.issubset(cpu_stats) and {"oom","oom_kill"}.issubset(events))
    return {"cpuQuotaUs":cpu["quotaUs"],"cpuPeriodUs":cpu["periodUs"],"memoryMaxBytes":maximum,"memoryCurrentBytes":integer(read_text(group/"memory.current").strip()),"swapCurrentBytes":integer(read_text(group/"memory.swap.current").strip()),"cpuUsageUsec":cpu_stats["usage_usec"],"throttledUsec":cpu_stats["throttled_usec"],"oom":events["oom"],"oomKill":events["oom_kill"]}
