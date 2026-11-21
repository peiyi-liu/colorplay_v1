"""Root read-only aggregate of the eight-service backend parent cgroup."""
import json
import errno
import sys
import time
from linux_runtime_common import RUNTIME, CGROOT, require, context, private_json, inspect_backend, host_observation, instance_facts
from linux_cgroup import read_backend_values

RESULT="BACKEND_SAMPLE_UNAVAILABLE"
STATE = {"stage": "REQUEST"}
CODES = frozenset(['API_TARGET_INVALID', 'BACKEND_CONTAINER_CHANGED', 'BACKEND_INSTANCE_CHANGED', 'BACKEND_PARENT_NOT_SHARED', 'BACKEND_PROCESS_CHANGED', 'BACKEND_PROFILE_CHANGED', 'BACKEND_SAMPLE_ARGUMENTS_INVALID', 'BACKEND_SAMPLE_INPUT_INVALID', 'BACKEND_SERVICE_COUNT_CHANGED', 'BOOT_CHANGED_DURING_PREFLIGHT', 'BOOT_ID_INVALID', 'BROWSER_BINARY_OUTSIDE_APPROVED_CACHE', 'BROWSER_NOT_OWNED', 'BROWSER_PID_REUSED', 'BROWSER_PREDECESSOR_LEAK', 'CGROUP_PATH_INVALID', 'CGROUP_V2_REQUIRED', 'DATABASE_ADAPTER_CHANGED', 'DATABASE_ADAPTER_PATH_INVALID', 'DATABASE_IDENTITY_INVALID', 'DATABASE_PROFILE_CHANGED', 'DATABASE_TARGET_INVALID', 'EXECUTABLE_BYTES_CHANGED', 'EXECUTABLE_IDENTITY_CHANGED', 'EXECUTABLE_PATH_CHANGED', 'EXECUTABLE_TOO_LARGE', 'EXECUTION_CONTEXT_CHANGED', 'FREE_HOST_MISMATCH', 'FRONTEND_LISTENER_MISSING', 'GENERATOR_CGROUP_MISMATCH', 'GENERATOR_CPU_LIMIT_MISMATCH', 'GENERATOR_MEMORY_LIMIT_MISMATCH', 'HELPER_CLOSURE_CHANGED', 'HELPER_CLOSURE_UNBOUND', 'HOST_LISTENER_NOT_LOOPBACK', 'HOST_OOM_COUNTER_MISSING', 'HOST_PROFILE_CHANGED', 'HOST_SAMPLE_ARGUMENTS_INVALID', 'HOST_SAMPLE_CALLER_INVALID', 'HOST_SAMPLE_INPUT_TOO_LARGE', 'HOST_SAMPLE_MODE_INVALID', 'LINUX_CGROUP_INVALID', 'LINUX_PROC_INVALID', 'LINUX_REQUIRED', 'LINUX_RUNTIME_INVALID', 'LINUX_X64_REQUIRED', 'NODE_BINARY_OR_SCOPE_CHANGED', 'NODE_BROWSER_PID_COLLISION', 'NODE_PID_REUSED', 'OS_RELEASE_PATH_INVALID', 'PRIVATE_FILE_INVALID', 'PRIVATE_FILE_TOO_LARGE', 'PRIVATE_PATH_INVALID', 'PROCESS_CPU_CLOCK_INVALID', 'PROCESS_IDENTITY_INVALID', 'PROCESS_OWNER_CHANGED', 'PROCESS_PID_REUSED', 'PROCESS_TREE_INCOMPLETE', 'PROFILE_BYTES_CHANGED', 'PROFILE_KIND_INVALID', 'PROTOCOL_BROWSER_PRESENT', 'PUBLISHED_PORT_NOT_LOOPBACK', 'PUBLISHED_PORT_SET_CHANGED', 'ROOT_CLOSURE_REQUIRED', 'ROOT_COMMAND_FAILED', 'ROOT_HELPER_CHANGED', 'ROOT_PROFILE_OBSERVATION_CHANGED', 'ROOT_PROFILE_REQUIRED', 'ROOT_RUNTIME_CHANGED', 'ROOT_SCOPE_INVALID', 'SOCKET_TABLE_INVALID', 'SOURCE_CHANGED', 'SOURCE_CONTEXT_CHANGED', 'SOURCE_NOT_FROZEN', 'SOURCE_REVISION_INVALID', 'UBUNTU_24_04_REQUIRED', 'UNAPPROVED_BROWSER_BINARY', 'UNDECLARED_BROWSER_PRESENT'])
def mark(stage):
    STATE["stage"] = stage

def failure(error):
    code = error.args[0] if isinstance(error, ValueError) and len(error.args) == 1 and type(error.args[0]) is str and error.args[0] in CODES else "UNKNOWN"
    number = error.errno if isinstance(error, OSError) else None
    names = {errno.EACCES: "EACCES", errno.EPERM: "EPERM", errno.ENOENT: "ENOENT", errno.ESRCH: "ESRCH", errno.EIO: "EIO", errno.ETIMEDOUT: "ETIMEDOUT", errno.EPIPE: "EPIPE"}
    return {"result": RESULT, "code": code, "stage": STATE["stage"], "errno": None if number is None else names.get(number, "UNKNOWN"), "rawProviderOutput": False}

def sample():
    mark("CONTEXT")
    ctx=context()
    mark("PROFILE")
    profile,profile_sha=private_json(RUNTIME/"execution-profile.json",32768)
    mark("HOST_FACTS")
    host,boot=host_observation(ctx)
    require(profile["host"]==host and all(profile["identity"][key]==value for key,value in instance_facts(ctx,boot).items()),"BACKEND_INSTANCE_CHANGED")
    mark("INSPECT")
    observed=inspect_backend(ctx)
    mark("CGROUP_VALUES")
    values=read_backend_values(CGROOT/ctx["backendCgroupRelativePath"].lstrip("/"))
    mark("PROFILE_RECHECK")
    require(private_json(RUNTIME/"execution-profile.json",32768)[1]==profile_sha,"PROFILE_BYTES_CHANGED")
    return {**observed,**values,"executionProfileSha256":profile_sha,"sampledAtMonotonicMs":time.monotonic_ns()/1000000,"readOnly":True}

if __name__=="__main__":
    try:
        require(len(sys.argv)==1,"BACKEND_SAMPLE_ARGUMENTS_INVALID")
        raw=sys.stdin.read(4097);require(len(raw)<=4096 and raw.strip()in {"","null"},"BACKEND_SAMPLE_INPUT_INVALID")
        print(json.dumps(sample()),flush=True)
    except Exception as error:
        print(json.dumps(failure(error)),flush=True)
        raise SystemExit(1) from None
