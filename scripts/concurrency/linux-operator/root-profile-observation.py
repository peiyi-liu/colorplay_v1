"""Root launcher fresh observation only; no authority or test execution."""
import json,re,sys
from linux_runtime_common import RUNTIME,require,require_linux,private_json,verify_root_snapshot

def main():
    require_linux();require(len(sys.argv)==4,"ROOT_OBSERVATION_ARGUMENTS_INVALID")
    revision,profile_sha,closure_sha=sys.argv[1:]
    require(bool(re.fullmatch(r"[a-f0-9]{40}",revision)) and all(re.fullmatch(r"[a-f0-9]{64}",value) for value in [profile_sha,closure_sha]),"ROOT_OBSERVATION_ARGUMENTS_INVALID")
    profile,_=private_json(RUNTIME/"execution-profile.json",32768)
    scope={"environment":"local","projectId":"cp-whole-site-261115","executionProfileSha256":profile_sha,"databaseIdentitySha256":profile["identity"]["databaseIdentitySha256"]}
    print(json.dumps(verify_root_snapshot(scope,revision,{"helperClosureSha256":closure_sha})),flush=True)

if __name__=="__main__":
    try:main()
    except Exception:
        print(json.dumps({"result":"ROOT_PROFILE_OBSERVATION_BLOCKED","rawLogsStored":False}),flush=True);raise SystemExit(1) from None
