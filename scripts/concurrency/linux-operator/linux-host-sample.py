"""Root Linux host sampler: owned cgroup, complete Chrome set, PSS separate RSS."""
import json
import math
import os
from pathlib import Path
import errno
import sys
import time
from linux_proc import parse_stat, parse_smaps_rollup, parse_meminfo, parse_psi
from linux_cgroup import read_text, read_pid_members, read_counter_map
from linux_runtime_common import RUNTIME, CGROOT, require, context, private_json, host_observation, instance_facts, verify_executables

RESULT="HOST_SAMPLE_UNAVAILABLE"
STATE = {"stage": "REQUEST"}
TIMING = None
CODES = frozenset(['API_TARGET_INVALID', 'BACKEND_CONTAINER_CHANGED', 'BACKEND_INSTANCE_CHANGED', 'BACKEND_PARENT_NOT_SHARED', 'BACKEND_PROCESS_CHANGED', 'BACKEND_PROFILE_CHANGED', 'BACKEND_SAMPLE_ARGUMENTS_INVALID', 'BACKEND_SAMPLE_INPUT_INVALID', 'BACKEND_SERVICE_COUNT_CHANGED', 'BOOT_CHANGED_DURING_PREFLIGHT', 'BOOT_ID_INVALID', 'BROWSER_BINARY_OUTSIDE_APPROVED_CACHE', 'BROWSER_NOT_OWNED', 'BROWSER_PID_REUSED', 'BROWSER_PREDECESSOR_LEAK', 'CGROUP_PATH_INVALID', 'CGROUP_V2_REQUIRED', 'DATABASE_ADAPTER_CHANGED', 'DATABASE_ADAPTER_PATH_INVALID', 'DATABASE_IDENTITY_INVALID', 'DATABASE_PROFILE_CHANGED', 'DATABASE_TARGET_INVALID', 'EXECUTABLE_BYTES_CHANGED', 'EXECUTABLE_IDENTITY_CHANGED', 'EXECUTABLE_PATH_CHANGED', 'EXECUTABLE_TOO_LARGE', 'EXECUTION_CONTEXT_CHANGED', 'FREE_HOST_MISMATCH', 'FRONTEND_LISTENER_MISSING', 'GENERATOR_CGROUP_MISMATCH', 'GENERATOR_CPU_LIMIT_MISMATCH', 'GENERATOR_MEMORY_LIMIT_MISMATCH', 'HELPER_CLOSURE_CHANGED', 'HELPER_CLOSURE_UNBOUND', 'HOST_LISTENER_NOT_LOOPBACK', 'HOST_OOM_COUNTER_MISSING', 'HOST_PROFILE_CHANGED', 'HOST_SAMPLE_ARGUMENTS_INVALID', 'HOST_SAMPLE_CALLER_INVALID', 'HOST_SAMPLE_INPUT_TOO_LARGE', 'HOST_SAMPLE_MODE_INVALID', 'LINUX_CGROUP_INVALID', 'LINUX_PROC_INVALID', 'LINUX_REQUIRED', 'LINUX_RUNTIME_INVALID', 'LINUX_X64_REQUIRED', 'NODE_BINARY_OR_SCOPE_CHANGED', 'NODE_BROWSER_PID_COLLISION', 'NODE_PID_REUSED', 'OS_RELEASE_PATH_INVALID', 'PRIVATE_FILE_INVALID', 'PRIVATE_FILE_TOO_LARGE', 'PRIVATE_PATH_INVALID', 'PROCESS_CPU_CLOCK_INVALID', 'PROCESS_IDENTITY_INVALID', 'PROCESS_OWNER_CHANGED', 'PROCESS_PID_REUSED', 'PROCESS_TREE_INCOMPLETE', 'PROFILE_BYTES_CHANGED', 'PROFILE_KIND_INVALID', 'PROTOCOL_BROWSER_PRESENT', 'PUBLISHED_PORT_NOT_LOOPBACK', 'PUBLISHED_PORT_SET_CHANGED', 'ROOT_CLOSURE_REQUIRED', 'ROOT_COMMAND_FAILED', 'ROOT_HELPER_CHANGED', 'ROOT_PROFILE_OBSERVATION_CHANGED', 'ROOT_PROFILE_REQUIRED', 'ROOT_RUNTIME_CHANGED', 'ROOT_SCOPE_INVALID', 'SOCKET_TABLE_INVALID', 'SOURCE_CHANGED', 'SOURCE_CONTEXT_CHANGED', 'SOURCE_NOT_FROZEN', 'SOURCE_REVISION_INVALID', 'UBUNTU_24_04_REQUIRED', 'UNAPPROVED_BROWSER_BINARY', 'UNDECLARED_BROWSER_PRESENT'])
def mark(stage):
    STATE["stage"] = stage
    if TIMING is not None:
        try: TIMING.visit(stage)
        except Exception: TIMING.bad = "OBSERVER_ERROR"

def failure(error):
    code = error.args[0] if isinstance(error, ValueError) and len(error.args) == 1 and type(error.args[0]) is str and error.args[0] in CODES else "UNKNOWN"
    number = error.errno if isinstance(error, OSError) else None
    names = {errno.EACCES: "EACCES", errno.EPERM: "EPERM", errno.ENOENT: "ENOENT", errno.ESRCH: "ESRCH", errno.EIO: "EIO", errno.ETIMEDOUT: "ETIMEDOUT", errno.EPIPE: "EPIPE"}
    value = {"result": RESULT, "code": code, "stage": STATE["stage"], "errno": None if number is None else names.get(number, "UNKNOWN"), "rawProviderOutput": False}
    diagnostic = stability_failure()
    if code == "PROCESS_TREE_INCOMPLETE" and STATE["stage"] in {"SMAPS", "STABILITY"} and diagnostic is not None:
        value["stability"] = diagnostic
    return value

BROWSER_NAMES={"chrome","headless_shell","chrome-headless-shell","chrome_crashpad_handler"}

def read_process(proc_root,pid,owner_uid,boot):
    mark("PROCESS_METADATA")
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
    mark("CPU")
    elapsed=uptime-int(start_ticks)/hz
    require(elapsed>0 and hz>0 and ticks>=0,"PROCESS_CPU_CLOCK_INVALID")
    value=(ticks/hz)/elapsed*100
    require(math.isfinite(value) and value>=0,"PROCESS_CPU_CLOCK_INVALID")
    return value

def metadata(group,owner_uid,boot,proc_root=Path("/proc")):
    mark("MEMBERS")
    rows={}
    for pid in read_pid_members(group):
        value=read_process(proc_root,pid,owner_uid,boot)
        if value is not None:rows[pid]=value
    return rows

def chrome_members(rows,ctx,browser_cache=None):
    mark("BINARY")
    pins=ctx["binaries"]["browser"];cache=(Path.home()/".cache/ms-playwright" if browser_cache is None else browser_cache).resolve(strict=True);found={}
    for pid,row in rows.items():
        path=Path(row["exe"])
        if any(same_binary(row,pin) for pin in pins):found[pid]=row
        elif cache in path.parents or path.name in BROWSER_NAMES:require(False,"UNAPPROVED_BROWSER_BINARY")
    return found

def stability_failure():
    value=STATE.get("stability")
    if value is None or value["stopReason"] is None:return None
    if value["elapsedMs"] is not None and (not math.isfinite(value["elapsedMs"]) or not 0<=value["elapsedMs"]<=30000):return None
    for key in ["beforeChromeCount","afterChromeCount","addedCount","removedCount","changedIdentityCount"]:
        if value[key] is not None and (type(value[key]) is not int or not 0<=value[key]<=65536):return None
    return {**value,"lastMismatchKinds":list(value["lastMismatchKinds"])}

def stable_memory_sample(ctx,profile,node_pid,browser_pid,protocol,boot,*,proc_root=Path("/proc"),cgroup_root=CGROOT,browser_cache=None):
    group=cgroup_root/ctx["generatorCgroupRelativePath"].lstrip("/")
    diagnostic={"attempts":0,"elapsedMs":None,"stopReason":None,"lastAttemptOutcome":"UNOBSERVED",
                "lastMismatchKinds":[],"comparisonComplete":False,"beforeChromeCount":None,
                "afterChromeCount":None,"addedCount":None,"removedCount":None,"changedIdentityCount":None}
    STATE["stability"]=diagnostic
    mark("STABILITY")
    def stopped(reason):
        diagnostic["stopReason"]=reason
        raise ValueError("PROCESS_TREE_INCOMPLETE")
    started=time.monotonic()
    if type(started) not in {int,float} or not math.isfinite(started):stopped("CLOCK_INVALID")
    last=started;deadline=started+1.5
    if not math.isfinite(deadline) or deadline<=started:stopped("CLOCK_INVALID")
    def clock():
        nonlocal last
        current=time.monotonic()
        if type(current) not in {int,float} or not math.isfinite(current) or current<last:
            diagnostic["elapsedMs"]=None;stopped("CLOCK_INVALID")
        last=current;diagnostic["elapsedMs"]=(current-started)*1000
        return current
    def within_window():
        if clock()>=deadline:stopped("WINDOW_EXHAUSTED")
    for attempt in range(76):
        mark("STABILITY");within_window()
        diagnostic.update(attempts=attempt+1,lastAttemptOutcome="UNOBSERVED",lastMismatchKinds=[],
                          comparisonComplete=False,beforeChromeCount=None,afterChromeCount=None,
                          addedCount=None,removedCount=None,changedIdentityCount=None)
        rows=metadata(group,profile["identity"]["ownerUid"],boot,proc_root)
        require(node_pid in rows and same_binary(rows[node_pid],ctx["binaries"]["node"]),"NODE_BINARY_OR_SCOPE_CHANGED")
        chrome=chrome_members(rows,ctx,browser_cache)
        if protocol:require(not chrome and browser_pid is None,"UNDECLARED_BROWSER_PRESENT")
        else:require(browser_pid in chrome and rows[browser_pid]["ppid"]==node_pid,"BROWSER_NOT_OWNED")
        diagnostic["beforeChromeCount"]=len(chrome)
        values={};missing=False
        try:
            mark("SMAPS")
            for pid in [node_pid,*chrome]:
                within_window()
                values[pid]=parse_smaps_rollup(read_text(proc_root/str(pid)/"smaps_rollup"))
                within_window()
        except (FileNotFoundError,ProcessLookupError):
            missing=True;diagnostic["lastAttemptOutcome"]="SMAPS_DISAPPEARED"
        if not missing:
            after=metadata(group,profile["identity"]["ownerUid"],boot,proc_root)
            after_chrome=chrome_members(after,ctx,browser_cache)
            mark("STABILITY")
            unchanged=node_pid in after and same_binary(after[node_pid],ctx["binaries"]["node"]) and all(after[node_pid][key]==rows[node_pid][key] for key in ["identity","exe","device","inode"]) and set(after_chrome)==set(chrome) and all(all(after_chrome[pid][key]==chrome[pid][key] for key in ["identity","exe","device","inode"]) for pid in chrome)
            shared=set(chrome)&set(after_chrome)
            changed=sum(any(after_chrome[pid][key]!=chrome[pid][key] for key in ["identity","exe","device","inode"]) for pid in shared)
            kinds=[]
            if node_pid not in after:kinds.append("NODE_MISSING")
            else:
                if not same_binary(after[node_pid],ctx["binaries"]["node"]):kinds.append("NODE_BINARY")
                if any(after[node_pid][key]!=rows[node_pid][key] for key in ["identity","exe","device","inode"]):kinds.append("NODE_IDENTITY")
            if set(chrome)!=set(after_chrome):kinds.append("CHROME_SET")
            if changed:kinds.append("CHROME_IDENTITY")
            diagnostic.update(comparisonComplete=True,afterChromeCount=len(after_chrome),
                addedCount=len(set(after_chrome)-set(chrome)),removedCount=len(set(chrome)-set(after_chrome)),
                changedIdentityCount=changed,lastMismatchKinds=kinds,
                lastAttemptOutcome="UNOBSERVED" if unchanged else "COMPLETE_MISMATCH")
            current=clock()
            if current>=deadline:
                if unchanged:diagnostic["lastAttemptOutcome"]="STABLE_AFTER_DEADLINE"
                stopped("WINDOW_EXHAUSTED")
            if unchanged:
                STATE.pop("stability",None)
                return rows,chrome,values
        current=clock()
        if current>=deadline:stopped("WINDOW_EXHAUSTED")
        if attempt==75:stopped("ATTEMPT_CAP")
        time.sleep(min(.02,deadline-current))
    stopped("ATTEMPT_CAP")

def sample(request):
    mark("CONTEXT")
    ctx=context()
    mark("REQUEST")
    require(isinstance(request,dict) and set(request).issubset({"mode","nodePid","browserPid","nodeStart","browserStart"}),"HOST_SAMPLE_ARGUMENTS_INVALID")
    mode=request.get("mode");require(mode in {"NATIVE_BROWSER","HYBRID_BROWSER_SDK","NODE_PROTOCOL"},"HOST_SAMPLE_MODE_INVALID")
    node=request.get("nodePid");browser=request.get("browserPid");protocol=mode=="NODE_PROTOCOL"
    require(type(node)is int and node>0 and node==os.getppid(),"HOST_SAMPLE_CALLER_INVALID")
    if protocol:require(browser is None and request.get("browserStart")is None,"PROTOCOL_BROWSER_PRESENT")
    else:require(type(browser)is int and browser>0 and browser!=node,"NODE_BROWSER_PID_COLLISION")
    mark("PROFILE")
    profile,profile_sha=private_json(RUNTIME/"execution-profile.json",32768)
    mark("HOST_FACTS")
    observed_host,boot=host_observation(ctx);facts=instance_facts(ctx,boot)
    require(profile["host"]==observed_host and all(profile["identity"][key]==value for key,value in facts.items()),"HOST_PROFILE_CHANGED")
    mark("BINARY")
    verify_executables(ctx)
    rows,chrome,memory=stable_memory_sample(ctx,profile,node,browser,protocol,boot)
    if "nodeStart"in request:require(request["nodeStart"]==rows[node]["startTicks"],"NODE_PID_REUSED")
    if not protocol and "browserStart"in request:require(request["browserStart"]==rows[browser]["startTicks"],"BROWSER_PID_REUSED")
    mark("CPU")
    hz=observed_host["clockTicksPerSecond"];uptime=float(read_text("/proc/uptime").split()[0])
    require(math.isfinite(uptime) and uptime>0,"PROCESS_CPU_CLOCK_INVALID")
    mark("MEMINFO")
    mem=parse_meminfo(read_text("/proc/meminfo"))
    mark("PSI")
    psi=parse_psi(read_text("/proc/pressure/memory"))
    mark("OOM")
    vmstat=read_counter_map(read_text("/proc/vmstat",1048576))
    require("oom_kill"in vmstat,"HOST_OOM_COUNTER_MISSING")
    mark("CPU")
    browser_cpu=None
    if not protocol:
        root_start=rows[browser]["startTicks"]
        require(all(int(row["startTicks"])>=int(root_start) for row in chrome.values()),"BROWSER_PREDECESSOR_LEAK")
        browser_cpu=lifetime_percent(sum(row["userTicks"]+row["systemTicks"] for row in chrome.values()),root_start,hz,uptime)
    mark("PROFILE_RECHECK")
    require(private_json(RUNTIME/"execution-profile.json",32768)[1]==profile_sha,"PROFILE_BYTES_CHANGED")
    return {"platform":"linux","executionProfileSha256":profile_sha,"sampledAtMonotonicMs":time.monotonic_ns()/1000000,"instanceSha256":facts["instanceSha256"],"jobSha256":facts["jobSha256"],"generatorCgroupIdentitySha256":observed_host["cgroupIdentitySha256"],"limitChainSha256":observed_host["limitChainSha256"],"hostMemoryTotalBytes":mem["totalBytes"],"hostLogicalCpu":4,"node":rows[node]["identity"],"browser":None if protocol else rows[browser]["identity"],"treeComplete":None if protocol else True,"browserProcessCount":len(chrome),"nodeRssBytes":memory[node]["rssBytes"],"nodePssBytes":memory[node]["pssBytes"],"browserTreeRssBytes":None if protocol else sum(value["rssBytes"] for pid,value in memory.items() if pid in chrome),"browserTreePssBytes":None if protocol else sum(value["pssBytes"] for pid,value in memory.items() if pid in chrome),"nodeCpuLifetimePercentOfOneCore":lifetime_percent(rows[node]["userTicks"]+rows[node]["systemTicks"],rows[node]["startTicks"],hz,uptime),"browserCpuLifetimePercentOfOneCore":browser_cpu,"hostSwapUsedBytes":mem["swapTotalBytes"]-mem["swapFreeBytes"],"memoryPsiSomeAvg10Percent":psi["some"]["avg10"],"memoryPsiFullAvg10Percent":psi["full"]["avg10"],"hostOomKills":vmstat["oom_kill"],"memoryAccounting":"LINUX_SMAPS_ROLLUP_PSS_WITH_SEPARATE_RSS","readOnly":True}


class SamplerTiming:
    def __init__(self):
        self.bad=None;self.rows={};self.stage="REQUEST"
        self.wall=time.monotonic_ns();self.cpu=time.process_time_ns()
        self.started=(self.wall,self.cpu);self.rows[self.stage]=[1,0,0]
    def account(self):
        wall=time.monotonic_ns();cpu=time.process_time_ns()
        if type(wall) is not int or type(cpu) is not int or wall<self.wall or cpu<self.cpu:
            self.bad="CLOCK_INVALID";return
        row=self.rows[self.stage];row[1]+=wall-self.wall;row[2]+=cpu-self.cpu
        self.wall=wall;self.cpu=cpu
    def visit(self,stage):
        if self.bad:return
        self.account()
        if self.bad:return
        if stage not in {"REQUEST","CONTEXT","PROFILE","HOST_FACTS","BINARY","MEMBERS","PROCESS_METADATA","SMAPS","STABILITY","CPU","MEMINFO","PSI","OOM","PROFILE_RECHECK"}:
            self.bad="OBSERVER_ERROR";return
        self.stage=stage
        if stage not in self.rows:self.rows[stage]=[0,0,0]
        self.rows[stage][0]+=1
        if len(self.rows)>24 or self.rows[stage][0]>65536:self.bad="BOUNDS"
    def finish(self):
        try:
            if not self.bad:self.account()
            wall=(self.wall-self.started[0])/1000000;cpu=(self.cpu-self.started[1])/1000000
            if not 0<=wall<=30000 or not 0<=cpu<=30000:self.bad="BOUNDS"
            if not self.bad:return {"collection":"OBSERVED","scope":"PYTHON_REQUEST_TO_RETURN_ONLY","stages":[{"stage":k,"visits":v[0],"wallMs":v[1]/1000000,"ownCpuMs":v[2]/1000000} for k,v in self.rows.items()],"wallMs":wall,"ownCpuMs":cpu,"lastStage":self.stage}
        except Exception:self.bad="OBSERVER_ERROR"
        return {"collection":"UNAVAILABLE","scope":"PYTHON_REQUEST_TO_RETURN_ONLY","reason":self.bad}

def with_timing(value):
    try:
        value["samplerTiming"]=TIMING.finish() if TIMING is not None else {"collection":"UNAVAILABLE","scope":"PYTHON_REQUEST_TO_RETURN_ONLY","reason":"OBSERVER_ERROR"}
    except Exception:value["samplerTiming"]={"collection":"UNAVAILABLE","scope":"PYTHON_REQUEST_TO_RETURN_ONLY","reason":"OBSERVER_ERROR"}
    return value

if __name__=="__main__":
    try: TIMING=SamplerTiming()
    except Exception: pass
    try:
        require(len(sys.argv)==1,"HOST_SAMPLE_ARGUMENTS_INVALID")
        raw=sys.stdin.read(4097);require(len(raw)<=4096,"HOST_SAMPLE_INPUT_TOO_LARGE")
        print(json.dumps(with_timing(sample(json.loads(raw)))),flush=True)
    except Exception as error:
        print(json.dumps(with_timing(failure(error))),flush=True)
        raise SystemExit(1) from None
