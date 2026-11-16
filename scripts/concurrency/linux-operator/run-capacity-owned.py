"""Root exact-approved one-leg Local capacity launcher and final publisher."""
import datetime,hashlib,json,os,re,runpy,signal,sys
from pathlib import Path
R=Path(__file__).resolve().parent
SOURCE=R.parent.parent/'colorplay-live-recovery'
from linux_runtime_common import require_linux, context as linux_context, verify_root_snapshot
NODE=None
# No child or service starts on import. Every launch verifies this dependency's hash.
BASE=runpy.run_path(str(R/'run-functional-owned.py'),run_name='_owned_child_observer')
for name in ['read','directory','write','call','frozen','digest']:
    globals()[name]=BASE[name]
BUDGET=1500000
PHASE='ARGUMENTS'
RUN_ID=None

def exact(value,fields):
    assert isinstance(value,dict) and set(value)==set(fields),'ROOT_SHAPE_INVALID'

def safe_json(path,maximum=131072):
    raw=read(path,maximum);return json.loads(raw),digest(raw)

def authority(scope):
    folder=R/'functional-private'/scope['functionalRunId'];directory(folder)
    receipt=read(folder/'functional-result.json').decode()
    close=read(folder/'functional-process-close.json').decode()
    assert digest(receipt.encode())==scope['functionalResultSha256'] and digest(close.encode())==scope['functionalProcessCloseSha256'],'FUNCTIONAL_AUTHORITY_CHANGED'
    return {'receiptBytes':receipt,'processCloseBytes':close}

def verify_fixed_inputs(request,scope):
    plan_dir=R/'capacity-plans'/scope['planId'];directory(plan_dir)
    manifest,manifest_hash=safe_json(plan_dir/'manifest.json')
    assert manifest_hash==request['manifestFileSha256'] and manifest['scope']==scope,'MANIFEST_APPROVAL_CHANGED'
    assert digest(read(plan_dir/'private-plan.json'))==request['privatePlanSha256'],'PRIVATE_PLAN_CHANGED'
    oracle,oracle_hash=safe_json(R/('capacity-oracle-approval-'+scope['planId']+'.json'))
    assert oracle_hash==request['oracleApprovalSha256'] and oracle['scope']==scope,'ORACLE_APPROVAL_CHANGED'
    assert all(oracle[key]==request[key] for key in ['manifestSha256','manifestFileSha256','privatePlanSha256','bundleProofSha256']),'ORACLE_FILE_BINDING_CHANGED'
    assert digest(read(R/'status-secret.json'))==request['secretsSha256'] and digest(read(R/'entry-bundle-proof.json'))==request['bundleProofSha256'],'RUNTIME_INPUT_CHANGED'
    for filename,expected in request['helpers'].items():
        assert filename in {'capacity-root-readonly.py','capacity-registration-readback.py','capacity-retention-readback.py','capacity-preflight-readback.py'} and digest(read(R/filename))==expected,'ORACLE_HELPER_CHANGED'
    assert set(request['helpers'])=={'capacity-root-readonly.py','capacity-registration-readback.py','capacity-retention-readback.py','capacity-preflight-readback.py'},'ORACLE_HELPER_SET_INVALID'
    return manifest,authority(scope)

def prepare_leg_directory(path):
    if not path.exists():path.mkdir(mode=0o700)
    directory(path)
    assert not any(path.iterdir()),'PRIOR_LEG_EXISTS'

def verify_publication_sources(approval):
    assert digest(read(R/'linux_owned_process.py'))==approval['processObserverSha256'],'PHYSICAL_OBSERVER_CHANGED'
    assert digest(read(Path(__file__).resolve()))==approval['publisherSha256'] and digest(read(R/'validate-capacity-publication.mjs'))==approval['validatorSha256'] and digest(read(R/'run-functional-owned.py'))==approval['observerHelperSha256'],'PUBLISHER_SOURCE_CHANGED'

def process_info(observed,mode,unchanged):
    code=observed['code']
    stop_signal=None if code is not None and code>=0 else ('SIGTERM' if code==-signal.SIGTERM else 'SIGKILL' if code==-signal.SIGKILL else 'OTHER')
    browser_ok=not observed['sawBrowser'] if mode=='NODE_PROTOCOL' else observed['sawBrowser']
    return {'exitCode':code if code is not None and code>=0 else None,'signal':stop_signal,'elapsedMs':observed['elapsedMs'],'stderrBytes':observed['stderrBytes'],'ownedResourcesClosed':observed['complete'] and browser_ok and observed['residue']==0 and not observed['timedOut'] and not observed['overflow'],'observedOwnedProcessesRemaining':observed['residue'],'sourceStillFrozen':unchanged}

def main():
    global PHASE,RUN_ID,NODE
    require_linux()
    NODE=linux_context()['binaries']['node']['path']
    BASE['call'].__globals__['NODE']=NODE
    assert len(sys.argv)==4,'SOURCE_RUN_APPROVAL_REQUIRED'
    sha,run_id,approved=sys.argv[1:];RUN_ID=run_id
    assert re.fullmatch('[a-f0-9]{40}',sha) and re.fullmatch('wcr-[a-z0-9]{6,16}-[a-z0-9]{6,16}',run_id) and re.fullmatch('[a-f0-9]{64}',approved),'ARGUMENT_INVALID'
    directory(R)
    PHASE='APPROVAL'
    approval,actual=safe_json(R/('capacity-launch-approval-'+run_id+'.json'))
    assert actual==approved,'ROOT_APPROVAL_CHANGED'
    exact(approval,['schemaVersion','confirmation','projectId','planId','sourceRevision','runId','legId','mode','requestSha256','planSha256','manifestFileSha256','publisherSha256','validatorSha256','observerHelperSha256','processObserverSha256','executionProfileSha256','outerBudgetMs'])
    assert approval['schemaVersion']==1 and approval['confirmation']=='LOCAL_CAPACITY_ROOT_PUBLISH' and approval['projectId']=='cp-whole-site-261115' and approval['sourceRevision']==sha and approval['runId']==run_id and approval['outerBudgetMs']==BUDGET,'ROOT_APPROVAL_INVALID'
    assert re.fullmatch('wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}',approval['planId']),'PLAN_ID_INVALID'
    assert approval['mode'] in ['NATIVE_BROWSER','NODE_PROTOCOL','HYBRID_BROWSER_SDK'],'MODE_INVALID'
    validator=R/'validate-capacity-publication.mjs'
    verify_publication_sources(approval)
    request_path=R/('capacity-request-'+run_id+'.json')
    request,request_hash=safe_json(request_path)
    assert request_hash==approval['requestSha256'],'REQUEST_APPROVAL_CHANGED'
    scope=request['scope']
    assert scope['environment']=='local' and scope['projectId']==approval['projectId'] and scope['sourceRevision']==scope['artifactRevision']==sha and scope['planId']==approval['planId'] and request['legId']==approval['legId'] and request['runId']==run_id,'REQUEST_SCOPE_CHANGED'
    assert request['manifestSha256']==approval['planSha256'] and request['manifestFileSha256']==approval['manifestFileSha256'] and request['rootCapacityPublisherSha256']==approval['publisherSha256'] and request['rootCapacityValidatorSha256']==approval['validatorSha256'] and json.loads(authority(scope)['processCloseBytes'])['rootPublisherSha256']==scope['rootPublisherSha256'],'PUBLISHER_REQUEST_UNBOUND'
    review,_=safe_json(R/'reviewed-candidate.json')
    assert review['result']=='ACCEPTED_FOR_LOCAL_VALIDATION' and review['sourceRevision']==sha and frozen(sha),'SOURCE_NOT_FROZEN'
    assert scope['executionProfileSha256']==approval['executionProfileSha256'],'PROFILE_APPROVAL_CHANGED'
    verify_root_snapshot(scope,sha,request['profileRuntime'])
    manifest,functional=verify_fixed_inputs(request,scope)
    leg=[row for row in manifest['legs'] if row['legId']==request['legId']]
    assert len(leg)==1 and leg[0]['mode']==approval['mode'],'LEG_MODE_CHANGED'
    pred=request['predecessors'][-1]['resultSha256'] if request['predecessors'] else None
    plan_journal=R/'capacity-journals'/scope['planId'];directory(plan_journal)
    journal=plan_journal/request['legId'];prepare_leg_directory(journal)
    write(R/('capacity-launch-intent-'+run_id+'.json'),{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceRevision':sha,'planId':scope['planId'],'runId':run_id,'legId':request['legId'],'mode':approval['mode'],'approvalSha256':approved,'requestSha256':request_hash,'outerBudgetMs':BUDGET})
    PHASE='CHILD'
    observed=BASE['run_child']([NODE,'--import','tsx',str(SOURCE/'scripts/concurrency/run-capacity.ts'),'--request',str(request_path),'--approve',request_hash],progress_action='LOCAL_CAPACITY_RUNNING')
    PHASE='PUBLICATION'
    profile_attestation=verify_root_snapshot(scope,sha,request['profileRuntime'])
    observation=process_info(observed,approval['mode'],frozen(sha))
    write(R/('capacity-observed-process-close-'+run_id+'.json'),{'kind':'ROOT_UNPUBLISHED_CAPACITY_PROCESS_OBSERVATION','sourceRevision':sha,'planId':scope['planId'],'runId':run_id,'legId':request['legId'],'requestSha256':request_hash,'stdoutSha256':digest(observed['stdout']),**observation})
    verify_publication_sources(approval)
    assert digest(read(request_path))==request_hash,'REQUEST_APPROVAL_CHANGED'
    if not journal.exists():journal.mkdir(mode=0o700)
    directory(journal)
    assert not (journal/'capacity-result.json').exists() and not (journal/'capacity-process-close.json').exists(),'PRODUCER_CREATED_AUTHORITY'
    candidate_bytes=None;candidate=None
    try:
        candidate_bytes=read(journal/'capacity-result-candidate.json');candidate=json.loads(candidate_bytes)
    except (FileNotFoundError,ValueError,AssertionError):
        candidate=None
    try:stdout=json.loads(observed['stdout'])
    except (ValueError,UnicodeError):stdout=None
    unchanged=frozen(sha)
    info=process_info(observed,approval['mode'],unchanged)
    validated={'result':'PUBLICATION_REJECTED'}
    if unchanged:
        # Re-read all byte-bound inputs after the child; no loader or journey runs here.
        manifest,functional=verify_fixed_inputs(request,scope)
        data={'scope':scope,'plan':manifest,'functionalAuthority':functional,'runId':run_id,'legId':request['legId'],'predecessorSha256':pred,'stdout':stdout,'candidate':candidate,'process':info,'profileAttestation':profile_attestation}
        validated=json.loads(call([NODE,'--import','tsx',str(validator)],timeout=15,data=json.dumps(data).encode()))
        assert validated['result'] in ['PUBLICATION_VALIDATED','PUBLICATION_REJECTED'],'CAPACITY_VALIDATOR_FAILED'
        receipt=validated['receipt']
    else:
        receipt={'result':'INCONCLUSIVE','sourceRevision':sha,'planId':scope['planId'],'runId':run_id,'legId':request['legId'],'code':'SOURCE_CHANGED'}
    if not frozen(sha):
        info['sourceStillFrozen']=False
        receipt={'result':'INCONCLUSIVE','sourceRevision':sha,'planId':scope['planId'],'runId':run_id,'legId':request['legId'],'code':'SOURCE_CHANGED'}
    verify_publication_sources(approval)
    outcome=receipt['result']
    verified=validated['result']=='PUBLICATION_VALIDATED' and outcome=='PASS' and info['sourceStillFrozen']
    result_hash=write(journal/'capacity-result.json',receipt)
    close={'schemaVersion':1,'executionProfileSha256':scope['executionProfileSha256'],'kind':'ROOT_CAPACITY_PROCESS_CLOSE','projectId':approval['projectId'],'planId':scope['planId'],'planSha256':request['manifestSha256'],'sourceRevision':sha,'artifactSha256':scope['artifactSha256'],'runId':run_id,'legId':request['legId'],'mode':approval['mode'],'result':'VERIFIED' if verified else 'INCONCLUSIVE' if outcome=='INCONCLUSIVE' else 'FAILED','runOutcome':outcome,**info,'outerBudgetMs':BUDGET,'stdoutSha256':digest(observed['stdout']),'candidateSha256':None if candidate_bytes is None else digest(candidate_bytes),'capacityResultSha256':result_hash,'requestSha256':request_hash,'rootCapacityPublisherSha256':approval['publisherSha256'],'rootCapacityValidatorSha256':approval['validatorSha256'],'resourceVerification':'PRODUCER_CLEANUP_AND_OBSERVED_PROCESS_EXIT'}
    write(journal/'capacity-process-close.json',close)
    print(json.dumps({'result':outcome,'sourceRevision':sha,'planId':scope['planId'],'runId':run_id,'legId':request['legId'],'processClose':close,'capacityResultSha256':result_hash,'candidateAuthoritative':False,'rawLogsStored':False}),flush=True)
    raise SystemExit(0 if verified else 1)

if __name__=='__main__':
    try:main()
    except Exception as error:
        safe=str(error) if isinstance(error,AssertionError) and re.fullmatch('[A-Z_]{3,80}',str(error)) else 'UNAVAILABLE'
        failure={'result':'ROOT_CAPACITY_LAUNCH_BLOCKED','phase':PHASE,'runId':RUN_ID if isinstance(RUN_ID,str) and re.fullmatch('wcr-[a-z0-9]{6,16}-[a-z0-9]{6,16}',RUN_ID) else None,'errorClass':type(error).__name__,'safeReason':safe,'rawLogsStored':False}
        if failure['runId']:
            try:write(R/('capacity-root-blocked-'+failure['runId']+'.json'),failure)
            except Exception:pass
        print(json.dumps(failure),flush=True);raise SystemExit(1) from None
