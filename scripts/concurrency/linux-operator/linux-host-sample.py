"""Root Linux host sampler: owned cgroup, complete Chrome set, PSS separate RSS."""
import json
import math
import os
from pathlib import Path
import re
import sys
import time
from linux_proc import parse_stat, parse_smaps_rollup, parse_meminfo, parse_psi
from linux_cgroup import read_text, read_pid_members, read_counter_map
from linux_runtime_common import RUNTIME, CGROOT, require, context, private_json, host_observation, instance_facts, verify_executables

BROWSER_NAMES={"chrome","headless_shell","chrome-headless-shell","chrome_crashpad_handler"}

def read_process(proc_root,pid,owner_uid,boot):
    base=proc_root/str(pid)
    try:
        first=parse_stat(read_text(base/"stat"))
        require(first["pid"]==pid,"PROCESS_IDENTITY_INVALID")
        if first["state"]=="Z":return None
        lines=[line.split() for line in read_text(base/"status").splitlines() if line.startswith("Uid:")]
        require(len(lines)==1 and len(lines[0])==5 and all(value.isdecimal() and int(value)==owner_uid for value in lines[0][1:]),"PROCESS_OWNER_CHANGED")
        exe=os.readlink(base/"exe");info=os.stat(base/"exe")
        second=parse_stat(read_text(base/"stat"))
        require(first["startTicks"]==second["startTicks"] and second["pid"]==pid,"PROCESS_PID_REUSED")
        return {**second,"identity":{"pid":pid,"startTicks":second["startTicks"],"uid":owner_uid,"bootIdSha256":boot},"exe":exe,"device":info.st_dev,"inode":info.st_ino}
    except (FileNotFoundError,ProcessLookupError):return None

def same_binary(row,pin):
    return row["exe"]==pin["path"] and row["device"]==pin["device"] and row["inode"]==pin["inode"]

def lifetime_percent(ticks,start_ticks,hz,uptime):
    elapsed=uptime-int(start_ticks)/hz
    require(elapsed>0 and hz>0 and ticks>=0,"PROCESS_CPU_CLOCK_INVALID")
    value=(ticks/hz)/elapsed*100
    require(math.isfinite(value) and value>=0,"PROCESS_CPU_CLOCK_INVALID")
    return value

def metadata(group,owner_uid,boot,proc_root=Path("/proc")):
    rows={}
    for pid in read_pid_members(group):
        value=read_process(proc_root,pid,owner_uid,boot)
        if value is not None:rows[pid]=value
    return rows

def chrome_members(rows,ctx,browser_cache=None):
    pins=ctx["binaries"]["browser"];cache=(Path.home()/".cache/ms-playwright" if browser_cache is None else browser_cache).resolve(strict=True);found={}
    for pid,row in rows.items():
        path=Path(row["exe"])
        if any(same_binary(row,pin) for pin in pins):found[pid]=row
        elif cache in path.parents or path.name in BROWSER_NAMES:require(False,"UNAPPROVED_BROWSER_BINARY")
    return found

def stable_memory_sample(ctx,profile,node_pid,browser_pid,protocol,boot,*,proc_root=Path("/proc"),cgroup_root=CGROOT,browser_cache=None):
    group=cgroup_root/ctx["generatorCgroupRelativePath"].lstrip("/")
    deadline=time.monotonic()+1.5
    for attempt in range(3):
        rows=metadata(group,profile["identity"]["ownerUid"],boot,proc_root)
        require(node_pid in rows and same_binary(rows[node_pid],ctx["binaries"]["node"]),"NODE_BINARY_OR_SCOPE_CHANGED")
        chrome=chrome_members(rows,ctx,browser_cache)
        if protocol:require(not chrome and browser_pid is None,"UNDECLARED_BROWSER_PRESENT")
        else:require(browser_pid in chrome and rows[browser_pid]["ppid"]==node_pid,"BROWSER_NOT_OWNED")
        values={}
        try:
            for pid in [node_pid,*chrome]:values[pid]=parse_smaps_rollup(read_text(proc_root/str(pid)/"smaps_rollup"))
        except (FileNotFoundError,ProcessLookupError):
            if time.monotonic()<deadline:continue
            raise ValueError("PROCESS_TREE_INCOMPLETE") from None
        after=metadata(group,profile["identity"]["ownerUid"],boot,proc_root)
        after_chrome=chrome_members(after,ctx,browser_cache)
        unchanged=node_pid in after and same_binary(after[node_pid],ctx["binaries"]["node"]) and all(after[node_pid][key]==rows[node_pid][key] for key in ["identity","exe","device","inode"]) and set(after_chrome)==set(chrome) and all(all(after_chrome[pid][key]==chrome[pid][key] for key in ["identity","exe","device","inode"]) for pid in chrome)
        if unchanged:return rows,chrome,values
        if time.monotonic()>=deadline:break
    raise ValueError("PROCESS_TREE_INCOMPLETE")

def sample(request):
    ctx=context()
    require(isinstance(request,dict) and set(request).issubset({"mode","nodePid","browserPid","nodeStart","browserStart"}),"HOST_SAMPLE_ARGUMENTS_INVALID")
    mode=request.get("mode");require(mode in {"NATIVE_BROWSER","HYBRID_BROWSER_SDK","NODE_PROTOCOL"},"HOST_SAMPLE_MODE_INVALID")
    node=request.get("nodePid");browser=request.get("browserPid");protocol=mode=="NODE_PROTOCOL"
    require(type(node)is int and node>0 and node==os.getppid(),"HOST_SAMPLE_CALLER_INVALID")
    if protocol:require(browser is None and request.get("browserStart")is None,"PROTOCOL_BROWSER_PRESENT")
    else:require(type(browser)is int and browser>0 and browser!=node,"NODE_BROWSER_PID_COLLISION")
    profile,profile_sha=private_json(RUNTIME/"execution-profile.json",32768)
    observed_host,boot=host_observation(ctx);facts=instance_facts(ctx,boot)
    require(profile["host"]==observed_host and all(profile["identity"][key]==value for key,value in facts.items()),"HOST_PROFILE_CHANGED")
    verify_executables(ctx)
    rows,chrome,memory=stable_memory_sample(ctx,profile,node,browser,protocol,boot)
    if "nodeStart"in request:require(request["nodeStart"]==rows[node]["startTicks"],"NODE_PID_REUSED")
    if not protocol and "browserStart"in request:require(request["browserStart"]==rows[browser]["startTicks"],"BROWSER_PID_REUSED")
    hz=observed_host["clockTicksPerSecond"];uptime=float(read_text("/proc/uptime").split()[0])
    require(math.isfinite(uptime) and uptime>0,"PROCESS_CPU_CLOCK_INVALID")
    mem=parse_meminfo(read_text("/proc/meminfo"));psi=parse_psi(read_text("/proc/pressure/memory"));vmstat=read_counter_map(read_text("/proc/vmstat",1048576))
    require("oom_kill"in vmstat,"HOST_OOM_COUNTER_MISSING")
    browser_cpu=None
    if not protocol:
        root_start=rows[browser]["startTicks"]
        require(all(int(row["startTicks"])>=int(root_start) for row in chrome.values()),"BROWSER_PREDECESSOR_LEAK")
        browser_cpu=lifetime_percent(sum(row["userTicks"]+row["systemTicks"] for row in chrome.values()),root_start,hz,uptime)
    require(private_json(RUNTIME/"execution-profile.json",32768)[1]==profile_sha,"PROFILE_BYTES_CHANGED")
    return {"platform":"linux","executionProfileSha256":profile_sha,"sampledAtMonotonicMs":time.monotonic_ns()/1000000,"instanceSha256":facts["instanceSha256"],"jobSha256":facts["jobSha256"],"generatorCgroupIdentitySha256":observed_host["cgroupIdentitySha256"],"limitChainSha256":observed_host["limitChainSha256"],"hostMemoryTotalBytes":mem["totalBytes"],"hostLogicalCpu":4,"node":rows[node]["identity"],"browser":None if protocol else rows[browser]["identity"],"treeComplete":None if protocol else True,"browserProcessCount":len(chrome),"nodeRssBytes":memory[node]["rssBytes"],"nodePssBytes":memory[node]["pssBytes"],"browserTreeRssBytes":None if protocol else sum(value["rssBytes"] for pid,value in memory.items() if pid in chrome),"browserTreePssBytes":None if protocol else sum(value["pssBytes"] for pid,value in memory.items() if pid in chrome),"nodeCpuLifetimePercentOfOneCore":lifetime_percent(rows[node]["userTicks"]+rows[node]["systemTicks"],rows[node]["startTicks"],hz,uptime),"browserCpuLifetimePercentOfOneCore":browser_cpu,"hostSwapUsedBytes":mem["swapTotalBytes"]-mem["swapFreeBytes"],"memoryPsiSomeAvg10Percent":psi["some"]["avg10"],"memoryPsiFullAvg10Percent":psi["full"]["avg10"],"hostOomKills":vmstat["oom_kill"],"memoryAccounting":"LINUX_SMAPS_ROLLUP_PSS_WITH_SEPARATE_RSS","readOnly":True}

if __name__=="__main__":
    try:
        require(len(sys.argv)==1,"HOST_SAMPLE_ARGUMENTS_INVALID")
        raw=sys.stdin.read(4097);require(len(raw)<=4096,"HOST_SAMPLE_INPUT_TOO_LARGE")
        print(json.dumps(sample(json.loads(raw))),flush=True)
    except Exception as error:
        code=str(error) if isinstance(error,ValueError) and re.fullmatch(r"[A-Z_]{3,80}",str(error)) else "HOST_SAMPLE_UNAVAILABLE"
        print(json.dumps({"result":"HOST_SAMPLE_UNAVAILABLE","code":code,"rawProviderOutput":False}),flush=True)
        raise SystemExit(1) from None
