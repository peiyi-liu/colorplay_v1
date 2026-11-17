"""Root observes a new Linux job before creating its byte-pinned profile."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import linux_host_contract as H
from linux_runtime_common import RUNTIME, SOURCE, PROJECT, ROLES, require, require_linux, private_read, private_json, digest, command, frozen, validate_context, observe_profile

def fingerprint_binary(path,expected_sha=None):
    path=Path(path)
    require(path.is_absolute() and path.resolve(strict=True)==path,"BINARY_PATH_INVALID")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    def identity(info):
        return (info.st_dev,info.st_ino,info.st_uid,info.st_mode,info.st_size,info.st_nlink,info.st_mtime_ns,info.st_ctime_ns)
    with os.fdopen(fd,"rb") as stream:
        before=os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_mode&0o111 and 0<before.st_size<=1024**3,"BINARY_FILE_INVALID")
        hasher=hashlib.sha256();count=0
        while True:
            chunk=stream.read(1048576)
            if not chunk:break
            count+=len(chunk);require(count<=1024**3,"BINARY_FILE_TOO_LARGE");hasher.update(chunk)
        require(identity(os.fstat(stream.fileno()))==identity(before) and identity(path.lstat())==identity(before),"BINARY_CHANGED")
    actual=hasher.hexdigest()
    require(expected_sha is None or actual==expected_sha,"BINARY_DIGEST_CHANGED")
    return {"path":str(path),"sha256":actual,"device":before.st_dev,"inode":before.st_ino}

def write_once(path,value):
    raw=(json.dumps(value,sort_keys=True,separators=(",",":"))+"\n").encode()
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as stream:
        stream.write(raw);stream.flush();os.fsync(stream.fileno())
    return digest(raw)

def approved_inputs(revision,request_sha):
    raw=private_read(RUNTIME/"bootstrap-input.json",65536)
    require(digest(raw)==request_sha,"BOOTSTRAP_REQUEST_CHANGED")
    value=json.loads(raw)
    require(value.get("schemaVersion")==1 and value.get("confirmation")in{H.target(H.FREE)["confirmation"],H.target(H.VM)["confirmation"]} and value.get("sourceRevision")==revision and value.get("repository")=="peiyi-liu/colorplay_v1","BOOTSTRAP_APPROVAL_INVALID")
    target=H.request_target(value,os.environ)
    job=value["job"]
    require(job=={"runId":os.environ.get("GITHUB_RUN_ID"),"runAttempt":1,"jobName":"capacity-linux"} and os.environ.get("GITHUB_RUN_ATTEMPT")=="1" and os.environ.get("GITHUB_REPOSITORY")==value["repository"] and os.environ.get("GITHUB_JOB")==job["jobName"] and os.environ.get("GITHUB_SHA")==revision,"JOB_IDENTITY_CHANGED")
    require(bool(re.fullmatch(r"[a-f0-9]{32}",value["instanceNonce"])),"INSTANCE_NONCE_INVALID")
    package=SOURCE/"scripts/concurrency/linux-operator"
    manifest_raw=(package/"package-manifest.json").read_bytes()
    require(digest(manifest_raw)==value["operatorPackageManifestSha256"],"OPERATOR_PACKAGE_CHANGED")
    manifest=json.loads(manifest_raw)
    require(manifest["schemaVersion"]==1 and manifest["package"]=="COLORPLAY_LOCAL_LINUX_ROOT_OPERATOR_DRAFT" and isinstance(manifest["files"],dict),"OPERATOR_PACKAGE_INVALID")
    for name,row in manifest["files"].items():
        require(re.fullmatch(r"[a-z][a-z0-9_.-]{0,100}",name) is not None,"OPERATOR_PATH_INVALID")
        source_path=package/name;require(source_path.resolve()==source_path and source_path.is_file(),"OPERATOR_SOURCE_INVALID")
        body=source_path.read_bytes();require(digest(body)==row["sha256"] and len(body)==row["bytes"],"OPERATOR_SOURCE_CHANGED")
        if row["role"] in {"OPERATOR","PUBLIC_IMAGE_PINS"}:
            require(private_read(RUNTIME/name,262144)==body,"INSTALLED_OPERATOR_CHANGED")
    tools_raw=private_read(RUNTIME.parent/"tools/toolchain.json",32768)
    require(digest(tools_raw)==value["toolchainSha256"],"TOOLCHAIN_APPROVAL_CHANGED")
    tools=json.loads(tools_raw)
    require(isinstance(tools,dict) and set(tools)=={"schemaVersion","node","supabase","supabaseGo"} and type(tools["schemaVersion"]) is int and tools["schemaVersion"]==2,"TOOLCHAIN_INVALID")
    for name,filename,version in [("node","node","24.18.0"),("supabase","supabase","2.109.1"),("supabaseGo","supabase-go","2.109.1")]:
        row=tools[name]
        require(isinstance(row,dict) and set(row)=={"path","version","sha256"},"TOOLCHAIN_INVALID")
        require(row["path"]==str(RUNTIME.parent/"tools"/filename) and row["version"]==version and isinstance(row["sha256"],str) and re.fullmatch(r"[a-f0-9]{64}",row["sha256"]),"TOOLCHAIN_INVALID")
        info=Path(row["path"]).lstat()
        require(info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==0o700,"TOOLCHAIN_FILE_INVALID")
        fingerprint_binary(row["path"],row["sha256"])
    require(command([tools["supabaseGo"]["path"],"--version"]).strip()=="2.109.1","SUPABASE_GO_VERSION_CHANGED")
    require(bool(command([tools["supabase"]["path"],"start","--help"]).strip()),"SUPABASE_SHIM_PROBE_FAILED")
    return value,tools

def actual_containers():
    pins,_=private_json(RUNTIME/"linux-image-pins.json",65536)
    expected={row["role"]:row["configDigest"] for row in pins["images"]}
    require(set(expected)==ROLES and len(pins["images"])==8,"IMAGE_PIN_SET_INVALID")
    names=["supabase_"+role+"_"+PROJECT for role in sorted(ROLES)]
    shape='{"id":{{json .Id}},"name":{{json .Name}},"imageId":{{json .Image}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}}}'
    rows=[json.loads(line) for line in command(["/usr/bin/docker","--host","unix:///var/run/docker.sock","inspect","--format",shape,*names]).splitlines()]
    require(len(rows)==8,"BACKEND_SERVICE_COUNT_CHANGED")
    result=[]
    for role,row in zip(sorted(ROLES),rows):
        require(row["name"]=="/supabase_"+role+"_"+PROJECT and row["project"]==PROJECT and row["running"] is True and row["imageId"]==expected[role],"BACKEND_IMAGE_OR_SCOPE_CHANGED")
        require(bool(re.fullmatch(r"[a-f0-9]{64}",row["id"])),"BACKEND_ID_INVALID")
        result.append({"role":role,"id":row["id"],"name":row["name"],"imageId":row["imageId"]})
    all_ids=set(command(["/usr/bin/docker","--host","unix:///var/run/docker.sock","ps","-aq","--no-trunc"]).splitlines())
    require(all_ids=={row["id"] for row in result},"UNOWNED_CONTAINER_PRESENT")
    return result

def main():
    require_linux()
    require(RUNTIME.name=="whole-site-261115" and len(sys.argv)==3,"ROOT_PROFILE_ARGUMENTS_INVALID")
    revision,request_sha=sys.argv[1:]
    require(bool(re.fullmatch(r"[a-f0-9]{40}",revision)) and bool(re.fullmatch(r"[a-f0-9]{64}",request_sha)),"ROOT_PROFILE_ARGUMENTS_INVALID")
    frozen(revision);request,tools=approved_inputs(revision,request_sha)
    owner,_=private_json(RUNTIME/"ownership.json")
    require(owner["projectId"]==PROJECT and owner["apiUrl"]=="http://127.0.0.1:58321" and owner["appUrl"]=="http://127.0.0.1:58373","OWNERSHIP_TARGET_CHANGED")
    require(not any((RUNTIME/name).exists() for name in ["execution-context.json","execution-profile.json","reviewed-candidate.json","execution-profile-helper-closure.json"]),"PRIOR_PROFILE_EXISTS")
    node=Path(tools["node"]["path"])
    require(node.parent==RUNTIME.parent/"tools" and node.name=="node" and tools["node"]["version"]=="24.18.0","NODE_TOOLCHAIN_INVALID")
    node_pin=fingerprint_binary(node,tools["node"]["sha256"])
    require(command([str(node),"--version"]).strip()=="v24.18.0","NODE_VERSION_CHANGED")
    cache=(Path.home()/".cache/ms-playwright").resolve(strict=True)
    browser_paths=sorted(path for path in cache.rglob("*") if path.name in {"chrome","headless_shell","chrome-headless-shell","chrome_crashpad_handler"})
    require(1<=len(browser_paths)<=8,"BROWSER_INSTALLATION_INVALID")
    browsers=[fingerprint_binary(path) for path in browser_paths]
    suffix=request["instanceNonce"][:12]
    ctx=validate_context({"schemaVersion":1,"sourceRevision":revision,"projectId":PROJECT,"job":{"repository":request["repository"],**request["job"]},"instanceNonce":request["instanceNonce"],"generatorCgroupRelativePath":"/colorplaygenerator"+suffix+".slice/workload","backendCgroupRelativePath":"/colorplaybackend"+suffix+".slice","containers":actual_containers(),"binaries":{"node":node_pin,"browser":browsers}})
    write_once(RUNTIME/"execution-context.json",ctx)
    observed=observe_profile(ctx,allow_outside_group=True)
    require(H.profile_kind(observed["host"])==H.request_target(request)["kind"],"ROOT_PROFILE_OBSERVATION_CHANGED")
    profile={"schemaVersion":1,"kind":H.profile_kind(observed["host"]),**observed}
    profile_sha=write_once(RUNTIME/"execution-profile.json",profile)
    names={"functional-preflight.py","canonical-baseline.py","media-readback.py","capacity-root-readonly.py","capacity-registration-readback.py","capacity-retention-readback.py","capacity-preflight-readback.py","execution-profile-preflight.py","linux-host-sample.py","backend-cgroup-sample.py","linux_proc.py","linux_cgroup.py","linux_runtime_common.py","linux_host_contract.py"}
    closure_sha=write_once(RUNTIME/"execution-profile-helper-closure.json",{"schemaVersion":1,"sourceRevision":revision,"executionProfileSha256":profile_sha,"files":{name:digest(private_read(RUNTIME/name,131072)) for name in sorted(names)}})
    approved_inputs(revision,request_sha);frozen(revision)
    pin_sha=write_once(RUNTIME/"profile-pin-receipt.json",{"result":"LOCAL_PROFILE_PINNED_PENDING_CALIBRATION","sourceRevision":revision,"executionProfileSha256":profile_sha,"helperClosureSha256":closure_sha,"bootstrapRequestSha256":request_sha,"operatorPackageManifestSha256":request["operatorPackageManifestSha256"],"calibration":"PENDING","capacity":"NOT_RUN","hostedAuthority":"NONE"})
    print(json.dumps({"result":"LOCAL_PROFILE_PINNED_PENDING_CALIBRATION","sourceRevision":revision,"executionProfileSha256":profile_sha,"helperClosureSha256":closure_sha,"pinReceiptSha256":pin_sha,"nativeCapacity":"NOT_RUN","hostedAuthority":"NONE"}),flush=True)

if __name__=="__main__":
    try:main()
    except Exception:
        print(json.dumps({"result":"ROOT_PROFILE_PIN_BLOCKED","rawLogsStored":False}),flush=True);raise SystemExit(1) from None
