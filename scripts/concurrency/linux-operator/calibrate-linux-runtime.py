"""Root genuine kernel calibration. No application fixture or capacity verdict."""
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import signal
import stat
import subprocess
import sys
import linux_host_contract as H
from linux_runtime_common import RUNTIME, require, require_linux, private_json, private_read, digest, context, observe_profile, CGROOT, proc_cgroup
from linux_cgroup import checked_group
from linux_owned_process import run_child


PHASE='ADMISSION'
PERMISSIONS=None
ERRNOS={13:'EACCES',1:'EPERM',2:'ENOENT',95:'EOPNOTSUPP',16:'EBUSY',3:'ESRCH',22:'EINVAL'}

def kernel_permission_snapshot(ctx):
    source=proc_cgroup(os.getpid());destination=ctx['generatorCgroupRelativePath']
    require(source.startswith('/') and destination.startswith('/') and '..' not in Path(source).parts and '..' not in Path(destination).parts,'CGROUP_PATH_INVALID')
    common=os.path.commonpath([source,destination])
    def row(relative):
        path=checked_group(CGROOT/relative.lstrip('/'),CGROOT)
        info=(path/'cgroup.procs').stat(follow_symlinks=False)
        require(stat.S_ISREG(info.st_mode),'CGROUP_PROCS_INVALID')
        return {'pathSha256':digest(relative.encode()),'hierarchyRoot':path==CGROOT,
                'procsUid':info.st_uid,'procsGid':info.st_gid,'procsMode':stat.S_IMODE(info.st_mode),
                'effectiveWritable':os.access(path/'cgroup.procs',os.W_OK,effective_ids=True)}
    return {'uid':os.getuid(),'euid':os.geteuid(),'namespaceInode':os.stat('/proc/self/ns/cgroup').st_ino,
            'source':row(source),'destination':row(destination),'commonAncestor':row(common)}

def blocked_outcome(error):
    return {'result':'ROOT_LINUX_KERNEL_CALIBRATION_BLOCKED','kernelOutcome':{
        'phase':PHASE,'errno':ERRNOS.get(error.errno,'UNKNOWN') if isinstance(error,OSError) else None,
        'permissions':PERMISSIONS,'cleanup':'UNKNOWN','executionAuthority':'NONE'},'rawLogsStored':False}


def load_pinner():
    spec=importlib.util.spec_from_file_location("root_profile_pinner",RUNTIME/"pin-execution-profile.py")
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def closed(observed):
    return observed["residue"]==0 and observed["stderrBytes"]==0 and not observed["overflow"] and not observed["timedOut"]

def kernel_pidfd_control():
    first=second=None;fd=None
    try:
        first=subprocess.Popen(["/usr/bin/sleep","0.05"],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env={"PATH":"/usr/bin:/bin"})
        fd=os.pidfd_open(first.pid,0);first.wait(timeout=2)
        require(bool(select.select([fd],[],[],0)[0]),"EXITED_PIDFD_NOT_READABLE")
        second=subprocess.Popen(["/usr/bin/sleep","30"],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env={"PATH":"/usr/bin:/bin"})
        try:signal.pidfd_send_signal(fd,signal.SIGKILL)
        except ProcessLookupError:pass
        require(second.poll() is None,"STALE_PIDFD_SIGNALED_OTHER_PROCESS")
        return {"name":"stale_pidfd_does_not_signal_another_process","result":"PASS","forcedPidReuseTested":False}
    finally:
        if fd is not None:os.close(fd)
        for process in (first,second):
            if process is not None:
                if process.poll() is None:process.kill()
                process.wait(timeout=3)

def control_program(kind):
    if kind=="abort":
        return "process.kill(process.ppid,'SIGTERM');await new Promise(resolve=>setTimeout(resolve,30000));"
    marker=RUNTIME/"kernel-late-child-proof.json"
    if kind=="late":
        program="""import json,os,signal,time
from pathlib import Path
def stop(_signal,_frame):
    pid=os.fork()
    if pid==0:
        signal.signal(signal.SIGTERM,signal.SIG_IGN)
        fd=os.open(MARKER,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as stream:json.dump({'pid':os.getpid(),'cgroup':Path('/proc/self/cgroup').read_text()},stream)
        time.sleep(30)
        os._exit(0)
    time.sleep(30)
signal.signal(signal.SIGTERM,stop)
print('READY',flush=True)
time.sleep(30)
""".replace("MARKER",repr(str(marker)))
    else:
        program="import time;print('READY',flush=True);time.sleep(30)"
    # A real child survives the producer's exit. Its stdout is detached only
    # after the OS process confirms readiness, preventing a setup race.
    return "import {spawn} from 'node:child_process';const child=spawn('/usr/bin/python3',['-I','-B','-c',"+json.dumps(program)+"],{stdio:['ignore','pipe','ignore'],detached:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.once('data',resolve)});child.stdout.destroy();child.unref();"

def main():
    global PHASE, PERMISSIONS
    PHASE, PERMISSIONS = 'ADMISSION', None
    require_linux()
    require(RUNTIME.name=="whole-site-261115" and len(sys.argv)==3,"CALIBRATION_ARGUMENTS_INVALID")
    revision,pin_sha=sys.argv[1:]
    require(bool(re.fullmatch(r"[a-f0-9]{40}",revision)) and bool(re.fullmatch(r"[a-f0-9]{64}",pin_sha)),"CALIBRATION_ARGUMENTS_INVALID")
    pin,pin_actual=private_json(RUNTIME/"profile-pin-receipt.json",32768)
    require(pin_actual==pin_sha and pin["sourceRevision"]==revision and pin["result"]=="LOCAL_PROFILE_PINNED_PENDING_CALIBRATION","PROFILE_PIN_UNBOUND")
    require(not any((RUNTIME/name).exists() for name in ["kernel-calibration.json","reviewed-candidate.json","kernel-late-child-proof.json","kernel-permission-observation.json"]),"PRIOR_CALIBRATION_EXISTS")
    pinner=load_pinner();pinner.approved_inputs(revision,pin["bootstrapRequestSha256"])
    ctx=context();profile,profile_sha=private_json(RUNTIME/"execution-profile.json",32768)
    require(profile_sha==pin["executionProfileSha256"],"PROFILE_CHANGED")
    observed=observe_profile(ctx,allow_outside_group=True)
    require(profile=={"schemaVersion":1,"kind":H.profile_kind(observed["host"],profile["kind"]),**observed},"PROFILE_OBSERVATION_CHANGED")
    node=ctx["binaries"]["node"]["path"];checks=[];processes=[]
    PHASE='PERMISSIONS'
    PERMISSIONS=kernel_permission_snapshot(ctx)
    pinner.write_once(RUNTIME/'kernel-permission-observation.json',PERMISSIONS)
    for mode in ["NATIVE_BROWSER","NODE_PROTOCOL"]:
        PHASE=mode
        result=run_child([node,"--import","tsx",str(RUNTIME/"calibration-sample.mjs"),revision,profile_sha,pin["helperClosureSha256"],mode])
        require(closed(result) and result["complete"] and result["code"]==0 and result["sawBrowser"]==(mode=="NATIVE_BROWSER"),"SAMPLE_PROCESS_NOT_CLOSED")
        sample=json.loads(result["stdout"])
        require(sample["result"]=="ROOT_KERNEL_SAMPLE_VERIFIED" and sample["mode"]==mode and sample["executionProfileSha256"]==profile_sha and sample["applicationRequests"]==sample["authIdentitiesCreated"]==0,"KERNEL_SAMPLE_NOT_VERIFIED")
        host=sample["host"]
        require(host["node"]["pid"]>0 and host["nodeRssBytes"]>=host["nodePssBytes"]>0,"NODE_MEMORY_UNAVAILABLE")
        if mode=="NATIVE_BROWSER":
            require(host["treeComplete"] is True and host["browserProcessCount"]>0 and host["browserTreeRssBytes"]>=host["browserTreePssBytes"]>0,"BROWSER_MEMORY_UNAVAILABLE")
        else:
            require(host["browser"] is None and host["browserProcessCount"]==0 and host["browserTreePssBytes"] is None,"PROTOCOL_BROWSER_PRESENT")
        name="native_chrome_pss_rss_psi_backend_and_complete_close" if mode=="NATIVE_BROWSER" else "protocol_has_no_browser_and_complete_close"
        checks.append({"name":name,"result":"PASS"})
        processes.append({"control":name,"observation":{**result,"stdout":sample}})
    for kind in ["orphan","late","abort"]:
        PHASE=kind.upper()
        result=run_child([node,"--input-type=module","-e",control_program(kind)])
        require(closed(result) and not result["complete"],"NEGATIVE_CONTROL_PROMOTED_OR_LEAKED")
        if kind=="late":
            late,_=private_json(RUNTIME/"kernel-late-child-proof.json",4096)
            require(type(late["pid"]) is int and late["pid"]>0 and late["cgroup"].strip()=="0::"+ctx["generatorCgroupRelativePath"],"LATE_CHILD_NOT_OBSERVED_IN_OWNED_CGROUP")
        name={"orphan":"orphan_detected_and_reaped_without_pass","late":"late_child_killed_in_owned_cgroup_without_pass","abort":"parent_abort_closes_owned_workload_without_pass"}[kind]
        checks.append({"name":name,"result":"PASS"})
        processes.append({"control":name,"observation":{**result,"stdoutSha256":digest(result["stdout"]),"stdout":None}})
    PHASE="PIDFD"
    checks.append(kernel_pidfd_control())
    PHASE="FINAL"
    pinner.approved_inputs(revision,pin["bootstrapRequestSha256"])
    require(private_json(RUNTIME/"execution-profile.json",32768)[1]==profile_sha and observe_profile(ctx,allow_outside_group=True)==observed,"POST_CALIBRATION_PROFILE_CHANGED")
    receipt={"schemaVersion":1,"kind":"ROOT_LINUX_KERNEL_CALIBRATION","result":"VERIFIED","sourceRevision":revision,"executionProfileSha256":profile_sha,"helperClosureSha256":pin["helperClosureSha256"],"profilePinReceiptSha256":pin_sha,"checks":checks,"processes":processes,"realLinuxKernel":True,"applicationRequests":0,"authIdentitiesCreated":0,"capacityProof":False,"hostedAuthority":"NONE"}
    calibration_sha=pinner.write_once(RUNTIME/"kernel-calibration.json",receipt)
    review_sha=pinner.write_once(RUNTIME/"reviewed-candidate.json",{"result":"ACCEPTED_FOR_LOCAL_VALIDATION","sourceRevision":revision,"executionProfileSha256":profile_sha,"helperClosureSha256":pin["helperClosureSha256"],"bootstrapRequestSha256":pin["bootstrapRequestSha256"],"operatorPackageManifestSha256":pin["operatorPackageManifestSha256"],"kernelCalibrationSha256":calibration_sha,"capacity":"NOT_RUN","hostedAuthority":"NONE"})
    print(json.dumps({"result":"ROOT_LINUX_KERNEL_CALIBRATION_VERIFIED","sourceRevision":revision,"executionProfileSha256":profile_sha,"kernelCalibrationSha256":calibration_sha,"reviewReceiptSha256":review_sha,"controls":len(checks),"capacityProof":False}),flush=True)

if __name__=="__main__":
    try:main()
    except Exception as error:
        print(json.dumps(blocked_outcome(error)),flush=True);raise SystemExit(1) from None
