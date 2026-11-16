"""Root read-only aggregate of the eight-service backend parent cgroup."""
import json
import re
import sys
import time
from linux_runtime_common import RUNTIME, CGROOT, require, context, private_json, inspect_backend, host_observation, instance_facts
from linux_cgroup import read_backend_values

def sample():
    ctx=context();profile,profile_sha=private_json(RUNTIME/"execution-profile.json",32768)
    host,boot=host_observation(ctx)
    require(profile["host"]==host and all(profile["identity"][key]==value for key,value in instance_facts(ctx,boot).items()),"BACKEND_INSTANCE_CHANGED")
    observed=inspect_backend(ctx);values=read_backend_values(CGROOT/ctx["backendCgroupRelativePath"].lstrip("/"))
    require(private_json(RUNTIME/"execution-profile.json",32768)[1]==profile_sha,"PROFILE_BYTES_CHANGED")
    return {**observed,**values,"executionProfileSha256":profile_sha,"sampledAtMonotonicMs":time.monotonic_ns()/1000000,"readOnly":True}

if __name__=="__main__":
    try:
        require(len(sys.argv)==1,"BACKEND_SAMPLE_ARGUMENTS_INVALID")
        raw=sys.stdin.read(4097);require(len(raw)<=4096 and raw.strip()in {"","null"},"BACKEND_SAMPLE_INPUT_INVALID")
        print(json.dumps(sample()),flush=True)
    except Exception as error:
        code=str(error) if isinstance(error,ValueError) and re.fullmatch(r"[A-Z_]{3,80}",str(error)) else "BACKEND_SAMPLE_UNAVAILABLE"
        print(json.dumps({"result":"BACKEND_SAMPLE_UNAVAILABLE","code":code,"rawProviderOutput":False}),flush=True)
        raise SystemExit(1) from None
