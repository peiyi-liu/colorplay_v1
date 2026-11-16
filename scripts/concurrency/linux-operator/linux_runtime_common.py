"""Root-only fresh Linux provenance. Never reads cmdline/environ or returns secrets."""
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import stat
import subprocess
import sys
import urllib.parse
from linux_proc import parse_meminfo, parse_stat
from linux_cgroup import read_text, cgroup_limit_chain, effective_cpu_quota, cgroup_identity, checked_group, read_backend_values

RUNTIME=Path(__file__).resolve().parent
SOURCE=RUNTIME.parent.parent/"colorplay-live-recovery"
PROJECT="cp-whole-site-261115"
CGROOT=Path("/sys/fs/cgroup")
GIB=1024**3
ROLES={"db","auth","rest","realtime","storage","edge_runtime","kong","inbucket"}
ENV={"PATH":"/usr/bin:/bin","PYTHONDONTWRITEBYTECODE":"1"}

def require(condition,code="LINUX_RUNTIME_INVALID"):
    if not condition:raise ValueError(code)

def digest(value):
    return hashlib.sha256(value).hexdigest()

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()

def exact(value,keys):
    require(isinstance(value,dict) and set(value)==set(keys))
    return value

def private_read(path,maximum=262144):
    path=Path(path);require(path.is_absolute() and path.resolve()==path and not path.is_symlink(),"PRIVATE_PATH_INVALID")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,"rb") as stream:
        info=os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode)==0o600 and info.st_uid==os.getuid() and info.st_nlink==1 and info.st_size<=maximum,"PRIVATE_FILE_INVALID")
        data=stream.read(maximum+1)
    require(len(data)<=maximum,"PRIVATE_FILE_TOO_LARGE")
    return data

def private_json(path,maximum=262144):
    raw=private_read(path,maximum)
    return json.loads(raw),digest(raw)

def command(args,env=None,data=None,timeout=15,maximum=131072):
    result=subprocess.run(args,cwd=SOURCE,input=data,capture_output=True,timeout=timeout,env=ENV if env is None else env)
    require(result.returncode==0 and len(result.stdout)<=maximum,"ROOT_COMMAND_FAILED")
    return result.stdout.decode("utf-8")

def require_linux():
    require(sys.platform=="linux" and platform.system()=="Linux","LINUX_REQUIRED")
    require(platform.machine() in ("x86_64","amd64"),"LINUX_X64_REQUIRED")

def frozen(revision):
    require(bool(re.fullmatch(r"[a-f0-9]{40}",revision)),"SOURCE_REVISION_INVALID")
    require(command(["/usr/bin/git","rev-parse","HEAD"]).strip()==revision,"SOURCE_CHANGED")
    require(command(["/usr/bin/git","status","--porcelain"]).strip()=="","SOURCE_NOT_FROZEN")

def validate_context(value):
    exact(value,{"schemaVersion","sourceRevision","projectId","job","instanceNonce","generatorCgroupRelativePath","backendCgroupRelativePath","containers","binaries"})
    require(value["schemaVersion"]==1 and value["projectId"]==PROJECT and bool(re.fullmatch(r"[a-f0-9]{40}",value["sourceRevision"])))
    job=exact(value["job"],{"repository","runId","runAttempt","jobName"})
    require(job["repository"]=="peiyi-liu/colorplay_v1" and bool(re.fullmatch(r"[0-9]{1,20}",job["runId"])) and type(job["runAttempt"])is int and job["runAttempt"]==1 and bool(re.fullmatch(r"[A-Za-z0-9_-]{1,64}",job["jobName"])))
    nonce=value["instanceNonce"];require(isinstance(nonce,str) and bool(re.fullmatch(r"[a-f0-9]{32}",nonce)))
    suffix=nonce[:12]
    require(value["generatorCgroupRelativePath"]=="/colorplaygenerator"+suffix+".slice/workload")
    require(value["backendCgroupRelativePath"]=="/colorplaybackend"+suffix+".slice")
    rows=value["containers"];require(isinstance(rows,list) and len(rows)==8)
    roles=set();identities=set()
    for row in rows:
        exact(row,{"role","id","name","imageId"});role=row["role"]
        require(role in ROLES and role not in roles and bool(re.fullmatch(r"[a-f0-9]{64}",row["id"])) and row["id"] not in identities)
        require(row["name"]=="/supabase_"+role+"_"+PROJECT and bool(re.fullmatch(r"sha256:[a-f0-9]{64}",row["imageId"])))
        roles.add(role);identities.add(row["id"])
    require(roles==ROLES)
    binaries=exact(value["binaries"],{"node","browser"})
    require(isinstance(binaries["browser"],list) and 1<=len(binaries["browser"])<=8)
    paths=set()
    for row in [binaries["node"],*binaries["browser"]]:
        exact(row,{"path","sha256","device","inode"})
        require(isinstance(row["path"],str) and Path(row["path"]).is_absolute() and ".." not in Path(row["path"]).parts and row["path"]not in paths)
        require(bool(re.fullmatch(r"[a-f0-9]{64}",row["sha256"])) and type(row["device"])is int and row["device"]>=0 and type(row["inode"])is int and row["inode"]>0)
        paths.add(row["path"])
    require(Path(binaries["node"]["path"]).name=="node")
    require(all(Path(row["path"]).name in {"chrome","headless_shell","chrome-headless-shell","chrome_crashpad_handler"} for row in binaries["browser"]))
    return value

def context():
    require_linux()
    value,_=private_json(RUNTIME/"execution-context.json")
    return validate_context(value)

def boot_sha():
    value=read_text("/proc/sys/kernel/random/boot_id").strip()
    require(bool(re.fullmatch(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",value)),"BOOT_ID_INVALID")
    return digest(value.encode())

def proc_cgroup(pid):
    require(type(pid)is int and pid>0)
    rows=read_text(f"/proc/{pid}/cgroup").splitlines()
    require(len(rows)==1 and rows[0].startswith("0::/"),"CGROUP_V2_REQUIRED")
    relative=rows[0][3:]
    require(".." not in Path(relative).parts,"CGROUP_PATH_INVALID")
    return relative

def distro():
    values={}
    release=Path("/etc/os-release").resolve(strict=True)
    require(release in {Path("/etc/os-release"),Path("/usr/lib/os-release")},"OS_RELEASE_PATH_INVALID")
    for line in read_text(release).splitlines():
        if line and not line.startswith("#") and "=" in line:
            key,value=line.split("=",1);require(key not in values)
            values[key]=value.strip('"')
    require(values.get("ID")=="ubuntu" and values.get("VERSION_ID")=="24.04","UBUNTU_24_04_REQUIRED")
    return "ubuntu-24.04"

def host_observation(ctx,allow_outside_group=False):
    require_linux();boot=boot_sha();relative=ctx["generatorCgroupRelativePath"]
    group=checked_group(CGROOT/relative.lstrip("/"),CGROOT)
    if not allow_outside_group:require(proc_cgroup(os.getpid())==relative,"GENERATOR_CGROUP_MISMATCH")
    mem=parse_meminfo(read_text("/proc/meminfo"));affinity=sorted(os.sched_getaffinity(0))
    require(os.cpu_count()==4 and len(affinity)==4 and 14*GIB<=mem["totalBytes"]<=16*GIB,"FREE_HOST_MISMATCH")
    chain=cgroup_limit_chain(CGROOT,relative);quota=effective_cpu_quota(chain)
    require(quota["quotaUs"]is None or quota["quotaUs"]==4*quota["periodUs"],"GENERATOR_CPU_LIMIT_MISMATCH")
    for row in chain:
        maximum=row["memoryMaxBytes"]
        require(maximum is None or maximum=="NOT_APPLICABLE_AT_HIERARCHY_ROOT" or maximum>=14*GIB,"GENERATOR_MEMORY_LIMIT_MISMATCH")
    host={"platform":"linux","distribution":distro(),"logicalCpu":4,"nominalMemoryBytes":16*GIB,"memTotalBytes":mem["totalBytes"],"affinityCpus":affinity,"cpuQuotaUs":quota["quotaUs"],"cpuPeriodUs":quota["periodUs"],"cgroupIdentitySha256":cgroup_identity(group,CGROOT,boot),"limitChainSha256":digest(canonical(chain)),"clockTicksPerSecond":os.sysconf("SC_CLK_TCK"),"dedicatedGenerator":False}
    return host,boot

def inspect_backend(ctx):
    shape='{"id":{{json .Id}},"name":{{json .Name}},"imageId":{{json .Image}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"ports":{{json .NetworkSettings.Ports}}}'
    body=command(["/usr/bin/docker","--host","unix:///var/run/docker.sock","inspect","--format",shape,*[x["id"] for x in ctx["containers"]]])
    rows=[json.loads(line) for line in body.splitlines()];require(len(rows)==8,"BACKEND_SERVICE_COUNT_CHANGED")
    expected={x["id"]:x for x in ctx["containers"]};actual=set();binding=[];published=[];boot=boot_sha()
    parent=checked_group(CGROOT/ctx["backendCgroupRelativePath"].lstrip("/"),CGROOT)
    for row in rows:
        exact(row,{"id","name","imageId","project","running","pid","ports"})
        identity=row["id"];require(identity in expected and identity not in actual,"BACKEND_CONTAINER_CHANGED")
        pin=expected[identity]
        require(row["name"]==pin["name"] and row["imageId"]==pin["imageId"] and row["project"]==PROJECT and row["running"]is True,"BACKEND_CONTAINER_CHANGED")
        pid=row["pid"];require(type(pid)is int and pid>0)
        start=parse_stat(read_text(f"/proc/{pid}/stat"));require(start["pid"]==pid and start["state"]!="Z","BACKEND_PROCESS_CHANGED")
        child=checked_group(CGROOT/proc_cgroup(pid).lstrip("/"),parent);require(child!=parent,"BACKEND_PARENT_NOT_SHARED")
        require(isinstance(row["ports"],dict))
        for ports in row["ports"].values():
            if ports is None:continue
            require(isinstance(ports,list))
            for port in ports:
                require(port.get("HostIp")=="127.0.0.1" and port.get("HostPort") in {"58321","58322","58324"},"PUBLISHED_PORT_NOT_LOOPBACK")
                published.append(port["HostPort"])
        binding.append({"role":pin["role"],"id":identity,"imageId":row["imageId"],"pid":pid,"startTicks":start["startTicks"],"cgroupIdentitySha256":cgroup_identity(child,CGROOT,boot)})
        actual.add(identity)
    require(sorted(published)==["58321","58322","58324"],"PUBLISHED_PORT_SET_CHANGED")
    binding.sort(key=lambda x:x["role"])
    values=read_backend_values(parent)
    return {"source":"SAME_HOST_CGROUP_V2","cgroupIdentitySha256":cgroup_identity(parent,CGROOT,boot,binding),"cpuQuotaUs":values["cpuQuotaUs"],"cpuPeriodUs":values["cpuPeriodUs"],"memoryMaxBytes":values["memoryMaxBytes"],"services":8}

def validate_host_listeners(ipv4_text,ipv6_text):
    owned_ports={58321,58322,58324,58373};observed=set()
    for text,width in [(ipv4_text,8),(ipv6_text,32)]:
        lines=text.splitlines()
        require(bool(lines) and "local_address" in lines[0],"SOCKET_TABLE_INVALID")
        for line in lines[1:]:
            if not line.strip():continue
            fields=line.split();require(len(fields)>=10,"SOCKET_TABLE_INVALID")
            match=re.fullmatch(r"([A-Fa-f0-9]{%d}):([A-Fa-f0-9]{4})"%width,fields[1])
            require(match is not None and bool(re.fullmatch(r"[A-Fa-f0-9]{2}",fields[3])),"SOCKET_TABLE_INVALID")
            if fields[3].upper()!="0A":continue
            port=int(match[2],16)
            if port not in owned_ports:continue
            require(width==8 and match[1].upper()=="0100007F","HOST_LISTENER_NOT_LOOPBACK")
            observed.add(port)
    require(58373 in observed,"FRONTEND_LISTENER_MISSING")
    return {"frontendLoopbackVerified":True,"observedLocalPorts":sorted(observed)}

def host_listeners():
    return validate_host_listeners(read_text("/proc/net/tcp",1048576),read_text("/proc/net/tcp6",1048576))

def database_identity():
    state,_=private_json(RUNTIME/"status-secret.json");require(state.get("API_URL")=="http://127.0.0.1:58321","API_TARGET_INVALID")
    target=urllib.parse.urlsplit(state["DB_URL"])
    require(target.scheme in {"postgres","postgresql"} and target.hostname=="127.0.0.1" and target.port==58322 and target.path=="/postgres" and not target.query and not target.fragment and target.username=="postgres" and bool(target.password),"DATABASE_TARGET_INVALID")
    wrapper=RUNTIME.parent/"host-client/bin/psql"
    require(wrapper.resolve()==wrapper and wrapper.is_file() and not wrapper.is_symlink(),"DATABASE_ADAPTER_PATH_INVALID")
    approved=SOURCE/"scripts/concurrency/linux-operator/local-psql.py"
    require(approved.resolve()==approved and digest(wrapper.read_bytes())==digest(approved.read_bytes())==digest(private_read(RUNTIME/"local-psql.py")),"DATABASE_ADAPTER_CHANGED")
    env={**ENV,"PGHOST":"127.0.0.1","PGPORT":"58322","PGDATABASE":"postgres","PGUSER":"postgres","PGPASSWORD":urllib.parse.unquote(target.password),"PGSSLMODE":"disable","PGCONNECT_TIMEOUT":"5","PGOPTIONS":"-c default_transaction_read_only=on"}
    result=command([str(RUNTIME.parent/"host-client/bin/psql"),"--no-psqlrc","--quiet","--tuples-only","--no-align","--set=ON_ERROR_STOP=1"],env,b"begin read only;set local statement_timeout='5s';select system_identifier::text from pg_control_system();rollback;").strip()
    require(bool(re.fullmatch(r"[0-9]{1,24}",result)),"DATABASE_IDENTITY_INVALID")
    return digest((PROJECT+":"+result+":postgres").encode())

def instance_facts(ctx,boot):
    raw=private_read(RUNTIME/"execution-context.json")
    require(json.loads(raw)==ctx,"EXECUTION_CONTEXT_CHANGED")
    job_sha=digest(canonical(ctx["job"]))
    return {"jobSha256":job_sha,"instanceSha256":digest(canonical({"contextSha256":digest(raw),"bootIdSha256":boot,"jobSha256":job_sha})),"bootIdSha256":boot,"ownerUid":os.getuid()}

def verify_executables(ctx,full_hash=False):
    browser_root=(Path.home()/".cache/ms-playwright").resolve(strict=True)
    for role,rows in [("node",[ctx["binaries"]["node"]]),("browser",ctx["binaries"]["browser"])]:
        for row in rows:
            path=Path(row["path"]);require(path.resolve(strict=True)==path,"EXECUTABLE_PATH_CHANGED")
            if role=="browser":require(browser_root in path.parents,"BROWSER_BINARY_OUTSIDE_APPROVED_CACHE")
            info=path.stat();require(stat.S_ISREG(info.st_mode) and info.st_dev==row["device"] and info.st_ino==row["inode"],"EXECUTABLE_IDENTITY_CHANGED")
            if full_hash:
                computed=hashlib.sha256();size=0
                descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
                with os.fdopen(descriptor,"rb") as stream:
                    while chunk:=stream.read(1048576):
                        size+=len(chunk);require(size<=1073741824,"EXECUTABLE_TOO_LARGE");computed.update(chunk)
                require(computed.hexdigest()==row["sha256"],"EXECUTABLE_BYTES_CHANGED")

def observe_profile(ctx,allow_outside_group=False):
    frozen(ctx["sourceRevision"]);verify_executables(ctx,True);host,boot=host_observation(ctx,allow_outside_group)
    identity={**instance_facts(ctx,boot),"databaseIdentitySha256":database_identity()}
    backend=inspect_backend(ctx)
    require(boot_sha()==boot,"BOOT_CHANGED_DURING_PREFLIGHT");frozen(ctx["sourceRevision"])
    return {"host":host,"identity":identity,"backend":backend}

def verify_local_profile(revision,profile_sha,full=False):
    ctx=context();require(ctx["sourceRevision"]==revision,"SOURCE_CONTEXT_CHANGED")
    profile,actual_sha=private_json(RUNTIME/"execution-profile.json",32768)
    require(actual_sha==profile_sha,"PROFILE_BYTES_CHANGED")
    host,boot=host_observation(ctx);facts=instance_facts(ctx,boot)
    require(profile.get("schemaVersion")==1 and profile.get("kind")=="LINUX_FREE_4CPU_16G_V1","PROFILE_KIND_INVALID")
    require(profile["host"]==host and all(profile["identity"][key]==value for key,value in facts.items()),"HOST_PROFILE_CHANGED")
    verify_executables(ctx,full_hash=full)
    if full:
        require(profile["backend"]==inspect_backend(ctx),"BACKEND_PROFILE_CHANGED")
        require(profile["identity"]["databaseIdentitySha256"]==database_identity(),"DATABASE_PROFILE_CHANGED")
    return ctx,profile,actual_sha

def verify_root_snapshot(scope,revision,descriptor):
    """Root outside the owned producer: fresh independent post-close attestation."""
    ctx=context();require(ctx["sourceRevision"]==revision,"SOURCE_CONTEXT_CHANGED")
    require(isinstance(scope,dict) and scope.get("environment")=="local" and scope.get("projectId")==PROJECT,"ROOT_SCOPE_INVALID")
    expected=scope.get("executionProfileSha256")
    require(isinstance(expected,str) and bool(re.fullmatch(r"[a-f0-9]{64}",expected)),"ROOT_PROFILE_REQUIRED")
    exact(descriptor,{"helperClosureSha256"})
    require(bool(re.fullmatch(r"[a-f0-9]{64}",descriptor["helperClosureSha256"])),"ROOT_CLOSURE_REQUIRED")
    raw=private_read(RUNTIME/"execution-profile.json",32768);require(digest(raw)==expected,"PROFILE_BYTES_CHANGED")
    profile=json.loads(raw);closure_raw=private_read(RUNTIME/"execution-profile-helper-closure.json",32768)
    require(digest(closure_raw)==descriptor["helperClosureSha256"],"HELPER_CLOSURE_CHANGED")
    closure=json.loads(closure_raw)
    exact(closure,{"schemaVersion","sourceRevision","executionProfileSha256","files"})
    require(closure["schemaVersion"]==1 and closure["sourceRevision"]==revision and closure["executionProfileSha256"]==expected,"HELPER_CLOSURE_UNBOUND")
    names={"functional-preflight.py","canonical-baseline.py","media-readback.py","capacity-root-readonly.py","capacity-registration-readback.py","capacity-retention-readback.py","capacity-preflight-readback.py","execution-profile-preflight.py","linux-host-sample.py","backend-cgroup-sample.py","linux_proc.py","linux_cgroup.py","linux_runtime_common.py"}
    exact(closure["files"],names)
    def unchanged():
        require(private_read(RUNTIME/"execution-profile.json",32768)==raw and private_read(RUNTIME/"execution-profile-helper-closure.json",32768)==closure_raw,"ROOT_RUNTIME_CHANGED")
        for name,expected_hash in closure["files"].items():
            require(digest(private_read(RUNTIME/name,131072))==expected_hash,"ROOT_HELPER_CHANGED")
    unchanged()
    observed=observe_profile(ctx,allow_outside_group=True)
    require(profile=={"schemaVersion":1,"kind":"LINUX_FREE_4CPU_16G_V1",**observed},"ROOT_PROFILE_OBSERVATION_CHANGED")
    require(observed["identity"]["databaseIdentitySha256"]==scope["databaseIdentitySha256"],"DATABASE_PROFILE_CHANGED")
    host_listeners();unchanged()
    return {"bytes":raw.decode("utf-8"),"expectedSha256":expected,"observed":observed}
