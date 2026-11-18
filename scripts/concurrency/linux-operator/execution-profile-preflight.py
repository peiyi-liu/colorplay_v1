"""Root fresh-observation helper. No baseline mutation or user creation."""
import json
import re
import sys
import linux_host_contract as H
from linux_runtime_common import RUNTIME, require, context, private_read, digest, observe_profile

def main():
    require(len(sys.argv)==4,"PROFILE_ARGUMENTS_REQUIRED")
    revision,profile_sha,challenge=sys.argv[1:]
    require(bool(re.fullmatch(r"[a-f0-9]{40}",revision)) and bool(re.fullmatch(r"[a-f0-9]{64}",profile_sha)) and bool(re.fullmatch(r"[a-f0-9]{32}",challenge)),"PROFILE_ARGUMENTS_INVALID")
    ctx=context();require(ctx["sourceRevision"]==revision,"PROFILE_SOURCE_MISMATCH")
    raw=private_read(RUNTIME/"execution-profile.json",32768)
    require(digest(raw)==profile_sha,"PROFILE_BYTES_CHANGED")
    observed=observe_profile(ctx)
    profile=json.loads(raw)
    require(profile["kind"]==H.profile_kind(observed["host"],profile["kind"]),"ROOT_PROFILE_OBSERVATION_CHANGED")
    require(digest(private_read(RUNTIME/"execution-profile.json",32768))==profile_sha,"PROFILE_BYTES_CHANGED")
    print(json.dumps({"sourceRevision":revision,"challenge":challenge,"observed":observed}),flush=True)

if __name__=="__main__":
    try:main()
    except Exception as error:
        code=str(error) if isinstance(error,ValueError) and re.fullmatch(r"[A-Z_]{3,80}",str(error)) else "PROFILE_PREFLIGHT_UNAVAILABLE"
        print(json.dumps({"result":"PROFILE_PREFLIGHT_REJECTED","code":code,"rawProviderOutput":False}),flush=True)
        raise SystemExit(1) from None
