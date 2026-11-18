"""Root-only Linux functional publisher, outside the producer's owned cgroup."""
import datetime,hashlib,json,os,re,signal,stat,subprocess,sys
from pathlib import Path
from linux_runtime_common import require_linux, context, private_read, verify_root_snapshot
from linux_owned_process import run_child, ParentStopDiagnostics
R=Path(__file__).resolve().parent
SOURCE=R.parent.parent/'colorplay-live-recovery'
BUDGET=1500000
ENV={'PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1'}
NODE=None

def digest(data):return hashlib.sha256(data).hexdigest()
def read(path,maximum=131072):return private_read(path,maximum)
def directory(path):
    info=path.lstat();assert path.resolve()==path and stat.S_ISDIR(info.st_mode) and stat.S_IMODE(info.st_mode)==0o700 and info.st_uid==os.getuid(),'PRIVATE_DIRECTORY_INVALID'
def write(path,value):
    data=(json.dumps(value,indent=2,ensure_ascii=False)+'\n').encode()
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
    return digest(data)
def call(args,timeout=10,data=None,env=None):
    actual=ENV if env is None else env
    if NODE:actual={**actual,'PATH':str(Path(NODE).parent)+':/usr/bin:/bin','HOME':str(Path.home())}
    value=subprocess.run(args,cwd=SOURCE,input=data,capture_output=True,timeout=timeout,env=actual)
    assert value.returncode==0 and len(value.stdout)<=262144,'FIXED_COMMAND_FAILED'
    return value.stdout

def frozen(sha):
    return call(['/usr/bin/git','rev-parse','HEAD']).decode().strip()==sha and not call(['/usr/bin/git','status','--porcelain']).strip()

def observe_owned_child(arguments,revision,run_id,scope,profile,leg_id=None,progress_action='LOCAL_FUNCTIONAL_RUNNING'):
    diagnostic=ParentStopDiagnostics()
    try:return run_child(arguments,progress_action=progress_action,diagnostics=diagnostic)
    finally:
        # Independent best-effort private sideband, after original physical close.
        try:
            identity=profile['observed']['identity'];expected=scope['executionProfileSha256']
            assert profile['expectedSha256']==expected and all(isinstance(identity[k],str) and re.fullmatch('[a-f0-9]{64}',identity[k]) for k in ['jobSha256','bootIdSha256'])
            assert re.fullmatch('[a-f0-9]{40}',revision) and re.fullmatch('(wsb|wcr)-[a-z0-9]{6,16}-[a-z0-9]{6,16}',run_id)
            assert leg_id is None or re.fullmatch('[a-z0-9_-]{1,120}',leg_id)
            binding={'sourceRevision':revision,'runId':run_id,'legId':leg_id,'executionProfileSha256':expected,'jobSha256':identity['jobSha256'],'bootIdSha256':identity['bootIdSha256']}
            value=diagnostic.snapshot();observed=value['contextBinding']
            matches=None if observed is None else all(observed[k]==binding[k] for k in ['sourceRevision','jobSha256','bootIdSha256'])
            envelope={'schemaVersion':1,'authority':'NON_AUTHORITY','binding':binding,'contextMatches':matches,'diagnostic':value}
            assert len((json.dumps(envelope,indent=2,ensure_ascii=False)+'\n').encode())<=32768
            prefix='functional' if leg_id is None else 'capacity'
            write(R/(prefix+'-parent-stop-'+run_id+'.json'),envelope)
        except BaseException:pass

def main():
    global NODE
    require_linux()
    NODE=context()['binaries']['node']['path']
    assert len(sys.argv)==4,'REVISION_RUN_AND_APPROVAL_REQUIRED'
    sha,run_id,approved=sys.argv[1:]
    assert re.fullmatch('[a-f0-9]{40}',sha) and re.fullmatch('wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}',run_id) and re.fullmatch('[a-f0-9]{64}',approved),'ARGUMENT_INVALID'
    directory(R);private=R/'functional-private';directory(private)
    approval_bytes=read(R/('functional-launch-approval-'+run_id+'.json'))
    assert digest(approval_bytes)==approved,'ROOT_APPROVAL_MISMATCH'
    approval=json.loads(approval_bytes)
    assert set(approval)=={'schemaVersion','confirmation','projectId','sourceRevision','runId','requestSha256','publisherSha256','validatorSha256','processObserverSha256','networkObserverSha256','executionProfileSha256','outerBudgetMs'},'ROOT_APPROVAL_SHAPE_INVALID'
    assert approval['schemaVersion']==1 and approval['confirmation']=='LOCAL_FUNCTIONAL_ROOT_PUBLISH' and approval['projectId']=='cp-whole-site-261115' and approval['sourceRevision']==sha and approval['runId']==run_id and approval['outerBudgetMs']==BUDGET,'ROOT_APPROVAL_INVALID'
    assert digest(read(R/'linux_owned_process.py'))==approval['processObserverSha256'],'PHYSICAL_OBSERVER_CHANGED'
    validator=R/'validate-functional-publication.mjs'
    assert digest(read(Path(__file__).resolve()))==approval['publisherSha256'] and digest(read(validator))==approval['validatorSha256'],'PUBLISHER_SOURCE_MISMATCH'
    request_path=R/('functional-request-'+run_id+'.json');request_bytes=read(request_path)
    assert digest(request_bytes)==approval['requestSha256'],'REQUEST_APPROVAL_MISMATCH'
    request=json.loads(request_bytes);scope=request['scope']
    assert scope['expectedRevision']==sha and scope['runId']==run_id and scope['projectId']==approval['projectId'] and scope['privateRoot']==str(private),'RUN_SCOPE_MISMATCH'
    review=json.loads(read(R/'reviewed-candidate.json'))
    assert review['result']=='ACCEPTED_FOR_LOCAL_VALIDATION' and review['sourceRevision']==sha and frozen(sha),'CANDIDATE_NOT_FROZEN'
    assert scope['executionProfileSha256']==approval['executionProfileSha256'],'PROFILE_APPROVAL_CHANGED'
    parent_profile=verify_root_snapshot(scope,sha,request['profileRuntime'])
    journal=private/run_id;assert not journal.exists(),'PRIOR_RUN_EXISTS'
    write(R/('functional-launch-intent-'+run_id+'.json'),{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceRevision':sha,'runId':run_id,'approvalSha256':approved,'requestSha256':approval['requestSha256'],'rootPublisherSha256':approval['publisherSha256'],'rootValidatorSha256':approval['validatorSha256'],'outerBudgetMs':BUDGET})
    observer=R/'root-functional-network-observer.mjs'
    assert digest(read(observer))==approval['networkObserverSha256'],'ROOT_NETWORK_OBSERVER_CHANGED'
    observed=observe_owned_child([NODE,'--import','tsx','--import',str(observer),str(SOURCE/'scripts/concurrency/run-functional.ts'),'--request',str(request_path),'--approval-sha256',approval['requestSha256']],sha,run_id,scope,parent_profile)
    if not journal.exists():journal.mkdir(mode=0o700)
    directory(journal)
    assert not (journal/'functional-result.json').exists() and not (journal/'functional-process-close.json').exists(),'PRODUCER_CREATED_AUTHORITY_FILE'
    candidate_bytes=None;candidate=None
    try:candidate_bytes=read(journal/'functional-result-candidate.json');candidate=json.loads(candidate_bytes)
    except FileNotFoundError:pass
    try:stdout=json.loads(observed['stdout'])
    except (ValueError,UnicodeError):stdout=None
    assert digest(read(Path(__file__).resolve()))==approval['publisherSha256'] and digest(read(validator))==approval['validatorSha256'] and digest(read(observer))==approval['networkObserverSha256'],'PUBLISHER_SOURCE_CHANGED'
    profile_attestation=verify_root_snapshot(scope,sha,request['profileRuntime'])
    assert digest(read(R/'linux_owned_process.py'))==approval['processObserverSha256'],'PHYSICAL_OBSERVER_CHANGED'
    unchanged=frozen(sha)
    code=observed['code'];stop_signal=None if code is not None and code>=0 else ('SIGTERM' if code==-signal.SIGTERM else 'SIGKILL' if code==-signal.SIGKILL else 'OTHER')
    process_info={'exitCode':code if code is not None and code>=0 else None,'signal':stop_signal,'elapsedMs':observed['elapsedMs'],'stderrBytes':observed['stderrBytes'],'ownedResourcesClosed':observed['complete'] and observed['sawBrowser'] and observed['residue']==0 and not observed['timedOut'] and not observed['overflow'],'observedOwnedProcessesRemaining':observed['residue'],'sourceStillFrozen':unchanged}
    if unchanged:
        validated=json.loads(call([NODE,'--import','tsx',str(validator)],timeout=15,data=json.dumps({'scope':scope,'artifactSha256':request['artifactSha256'],'stdout':stdout,'candidate':candidate,'process':process_info,'profileAttestation':profile_attestation}).encode()))
        assert validated['result'] in ('PUBLICATION_VALIDATED','PUBLICATION_REJECTED'),'VALIDATOR_FAILED'
        receipt=validated['receipt']
    else:
        validated={'result':'PUBLICATION_REJECTED'}
        receipt={'result':'INCONCLUSIVE','failureStage':'preflight','code':'SOURCE_CHANGED','sourceRevision':sha,'runId':run_id}
    if not frozen(sha):
        process_info['sourceStillFrozen']=False
        receipt={'result':'INCONCLUSIVE','failureStage':'preflight','code':'SOURCE_CHANGED','sourceRevision':sha,'runId':run_id}
    outcome=receipt['result']
    verified=validated['result']=='PUBLICATION_VALIDATED' and outcome=='PASS' and process_info['sourceStillFrozen']
    result_hash=write(journal/'functional-result.json',receipt)
    close={'schemaVersion':1,'executionProfileSha256':scope['executionProfileSha256'],'kind':'ROOT_FUNCTIONAL_PROCESS_CLOSE','projectId':approval['projectId'],'sourceRevision':sha,'runId':run_id,'result':'VERIFIED' if verified else 'INCONCLUSIVE' if outcome=='INCONCLUSIVE' else 'FAILED','runOutcome':outcome,**process_info,'outerBudgetMs':BUDGET,'stdoutSha256':digest(observed['stdout']),'candidateSha256':None if candidate_bytes is None else digest(candidate_bytes),'functionalResultSha256':result_hash,'requestSha256':approval['requestSha256'],'rootPublisherSha256':approval['publisherSha256'],'rootValidatorSha256':approval['validatorSha256'],'resourceVerification':'PRODUCER_CLEANUP_AND_OBSERVED_PROCESS_EXIT'}
    write(journal/'functional-process-close.json',close)
    print(json.dumps({'result':outcome,'sourceRevision':sha,'runId':run_id,'processClose':close,'functionalResultSha256':result_hash,'candidateAuthoritative':False,'rawLogsStored':False}),flush=True)
    raise SystemExit(0 if verified else 1)

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'result':'ROOT_FUNCTIONAL_LAUNCH_BLOCKED','errorClass':type(error).__name__,'rawLogsStored':False}),flush=True);raise SystemExit(1) from None
