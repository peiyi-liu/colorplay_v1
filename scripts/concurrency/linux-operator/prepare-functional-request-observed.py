"""Prepare one byte-approved Local functional run; no process/API/fixture starts."""
import datetime, errno, hashlib, json, os, re, runpy, sys, uuid
from pathlib import Path
from linux_runtime_common import require_linux, private_json, verify_root_snapshot, digest, read_text

R = Path(__file__).resolve().parent
ROOT = runpy.run_path(str(R / 'run-functional-owned.py'), run_name='_prepare_functional')
read, directory, write, frozen = [ROOT[n] for n in ('read', 'directory', 'write', 'frozen')]
SOURCE = ROOT['SOURCE']
PHASE, OPERATION, PATH_KIND = 'ADMISSION', 'CHECK', 'UNKNOWN'
PHASES = {'ADMISSION','REVIEW','ARTIFACT','EDGE_BIND','PROFILE','DAEMON','PRIVATE_SETUP','PUBLICATION','FINAL'}
OPERATIONS = {'CHECK','READ_PRIVATE','VERIFY_SOURCE','HASH_FILES','VERIFY_ROOT','ROOT_READ','CREATE_PRIVATE','WRITE_MANIFEST'}
PATH_KINDS = {'UNKNOWN','RUNTIME_PRIVATE','SOURCE_GIT','SOURCE_DIST','SOURCE_FUNCTIONS','ROOT_PROBE','PROC','CGROUP','DAEMON_CONFIG','RUN_MANIFEST'}


def checkpoint(phase, operation, path_kind):
    global PHASE, OPERATION, PATH_KIND
    assert phase in PHASES and operation in OPERATIONS and path_kind in PATH_KINDS
    PHASE, OPERATION, PATH_KIND = phase, operation, path_kind


def blocked_outcome(error):
    number = error.errno if isinstance(error, OSError) else None
    code = {errno.EACCES:'EACCES',errno.EPERM:'EPERM',errno.ENOENT:'ENOENT'}.get(number, 'UNKNOWN' if number is None else 'OTHER')
    path_kind = PATH_KIND if PATH_KIND in PATH_KINDS else 'UNKNOWN'
    filename = getattr(error, 'filename', None)
    if isinstance(filename, str):
        if filename.startswith('/proc/'):path_kind = 'PROC'
        elif filename.startswith('/sys/fs/cgroup/'):path_kind = 'CGROUP'
    return {'result':'LOCAL_FUNCTIONAL_PREPARATION_BLOCKED','errorClass':type(error).__name__,
        'safeReason':str(error) if isinstance(error, AssertionError) and re.fullmatch('[A-Z_]{3,80}', str(error)) else 'UNAVAILABLE',
        'diagnostic':{'phase':PHASE if PHASE in PHASES else 'ADMISSION',
            'operation':OPERATION if OPERATION in OPERATIONS else 'CHECK','errno':code,'pathKind':path_kind},'rawLogsStored':False}


def read_daemon_config():
    # Import only the fixed, frozen Source port; sudo executes its self-contained
    # SYSTEM_READ literal, never a runner-writable Runtime module.
    previous = list(sys.path)
    try:
        sys.path.insert(0, str(SOURCE / 'scripts/concurrency'))
        bootstrap = runpy.run_path(str(SOURCE / 'scripts/concurrency/linux-local-bootstrap.py'), run_name='_fixed_daemon_read')
        return bootstrap['NativeIO']().system_read('/etc/docker/daemon.json')
    finally:sys.path[:] = previous


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def load(path, maximum=131072):
    raw = read(path, maximum)
    return json.loads(raw), sha(raw)


def media_approval(revision, run_id):
    assert re.fullmatch('[a-f0-9]{40}', revision), 'REVISION_REQUIRED'
    assert re.fullmatch('wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}', run_id), 'RUN_ID_REQUIRED'
    slots = {slot: {'expectedStatus': 'aborted' if slot in ('cancel', 'single-cancel') else 'verified',
                    'semanticRole': 'color_critical' if slot == 'single-recovery' else 'standard'}
             for slot in ('single', 'single-recovery', 'single-cancel', 'single-duplicate', 'zip1', 'zip2', 'cancel')}
    return {'sourceRevision': revision, 'runId': run_id, 'projectId': 'cp-whole-site-261115',
            'expected': {'verifiedRuns': 5, 'abortedRuns': 2, 'assets': 5, 'variants': 11,
                         'masterObjects': 5, 'variantObjects': 11, 'quarantineObjects': 0},
            'slots': slots}


def main():
    checkpoint('ADMISSION','CHECK','UNKNOWN')
    require_linux()
    assert len(sys.argv) == 2 and re.fullmatch('[a-f0-9]{40}', sys.argv[1]), 'REVISION_REQUIRED'
    revision = sys.argv[1]
    checkpoint('REVIEW','READ_PRIVATE','RUNTIME_PRIVATE')
    directory(R)
    review, review_sha = load(R / 'reviewed-candidate.json')
    checkpoint('REVIEW','VERIFY_SOURCE','SOURCE_GIT')
    assert review['sourceRevision'] == revision and review['result'] == 'ACCEPTED_FOR_LOCAL_VALIDATION' and frozen(revision), 'REVIEW_NOT_FROZEN'
    checkpoint('REVIEW','READ_PRIVATE','RUNTIME_PRIVATE')
    owner, _ = load(R / 'ownership.json')
    state, secret_sha = load(R / 'status-secret.json')
    assert owner['projectId'] == 'cp-whole-site-261115' and state['API_URL'] == owner['apiUrl'] == 'http://127.0.0.1:58321' and owner['appUrl'] == 'http://127.0.0.1:58373', 'TARGET_INVALID'
    active, _ = load(R / 'active-preview.json')
    attempt = Path(active['attemptPath'])
    assert attempt.parent == R and attempt.name.startswith('activation-') and active['sourceRevision'] == revision, 'ACTIVATION_INVALID'
    directory(attempt)
    artifact, artifact_sha = load(attempt / 'build-manifest.json', 2097152)
    assert artifact['sourceRevision'] == revision and artifact['privateValuesAbsent'] is True, 'ARTIFACT_INVALID'
    checkpoint('ARTIFACT','HASH_FILES','SOURCE_DIST')
    actual = {}
    for path in sorted((SOURCE / 'dist').rglob('*')):
        assert not path.is_symlink(), 'ARTIFACT_SYMLINK'
        if path.is_file():
            actual[str(path.relative_to(SOURCE / 'dist'))] = sha(path.read_bytes())
    assert actual == artifact['files'], 'ARTIFACT_CHANGED'
    marker = (SOURCE / 'dist/admin-release.json').read_bytes()
    assert json.loads(marker) == {'environment': 'local', 'revision': revision}, 'MARKER_CHANGED'
    bundle, _ = load(R / 'entry-bundle-proof.json')
    detail, _ = load(attempt / 'entry-bundle-proof.json')
    assert bundle['sourceRevision'] == revision and bundle['artifactSha256'] == sha(marker) and detail['measurement'] == bundle and detail['buildManifestSha256'] == artifact_sha, 'BUNDLE_CHANGED'
    # The all-functions bind is separately executed once before this preparation.
    checkpoint('EDGE_BIND','READ_PRIVATE','RUNTIME_PRIVATE')
    binds = []
    for path in R.glob('edge-bind-*/result.json'):
        value, _ = load(path)
        if value.get('sourceRevision') == revision and value.get('sourceScope') == 'all-functions' and value.get('result') == 'LOCAL_EDGE_SOURCE_BOUND':
            binds.append((path, value))
    assert len(binds) == 1, 'EXACT_EDGE_BIND_REQUIRED'
    bind_path, bind = binds[0]
    expected = bind['runtimeSourceHashes']
    assert len(expected) == bind['runtimeSourceFileCount'] and len(expected) >= 20, 'EDGE_SOURCE_SCOPE_INVALID'
    checkpoint('EDGE_BIND','HASH_FILES','SOURCE_FUNCTIONS')
    assert all(sha((SOURCE / 'supabase/functions' / name).read_bytes()) == digest for name, digest in expected.items()), 'EDGE_SOURCE_CHANGED'
    checkpoint('PROFILE','READ_PRIVATE','RUNTIME_PRIVATE')
    profile,profile_sha=private_json(R/'execution-profile.json',32768)
    _,closure_sha=private_json(R/'execution-profile-helper-closure.json',32768)
    descriptor={'helperClosureSha256':closure_sha}
    assert review['executionProfileSha256']==profile_sha,'REVIEW_PROFILE_CHANGED'
    checkpoint('PROFILE','VERIFY_ROOT','ROOT_PROBE')
    verify_root_snapshot({'environment':'local','projectId':owner['projectId'],'executionProfileSha256':profile_sha,'databaseIdentitySha256':profile['identity']['databaseIdentitySha256']},revision,descriptor)
    checkpoint('DAEMON','READ_PRIVATE','RUNTIME_PRIVATE')
    isolation,_=load(R/'linux-isolation-result.json')
    checkpoint('DAEMON','ROOT_READ','DAEMON_CONFIG')
    assert isolation['result']=='LOCAL_LOOPBACK_ISOLATED' and digest(read_daemon_config())==isolation['afterConfigSha256'],'LOOPBACK_CONFIG_CHANGED'
    identity_sha=profile['identity']['databaseIdentitySha256']
    checkpoint('PRIVATE_SETUP','CREATE_PRIVATE','RUNTIME_PRIVATE')
    private = R / 'functional-private'
    if not private.exists():
        private.mkdir(mode=0o700)
    directory(private)
    assert not any(private.iterdir()), 'PRIOR_FUNCTIONAL_DATA_REQUIRES_DIAGNOSIS'
    run_id = 'wsb-' + datetime.datetime.now(datetime.timezone.utc).strftime('%y%m%d') + '-' + uuid.uuid4().hex[:12]
    approved_images = sorted('/' + name for name in artifact['files']
                             if re.fullmatch(r'assets/blooks/[A-Za-z0-9_-]+-(?:128|256)\.webp', name))
    assert 1 <= len(approved_images) <= 1000 and len(set(approved_images)) == len(approved_images), 'APPROVED_IMAGES_INVALID'
    assert all(len(path) <= 512 for path in approved_images), 'APPROVED_IMAGES_INVALID'
    attestation = {
        'projectId': owner['projectId'], 'appUrl': owner['appUrl'], 'supabaseUrl': state['API_URL'],
        'mailpitUrl': 'http://127.0.0.1:58324', 'databaseIdentitySha256': identity_sha, 'executionProfileSha256':profile_sha,
        'anonKeySha256': sha(state['ANON_KEY'].encode()), 'serviceKeySha256': sha(state['SERVICE_ROLE_KEY'].encode()),
        'sourceRevision': revision, 'reviewReceiptSha256': review_sha, 'buildManifestSha256': artifact_sha,
        'edgeBindReceiptSha256': sha(read(bind_path)), 'loopbackConfigSha256': isolation['afterConfigSha256'],
        'freshDatabaseCheckedByRunnerBeforeFixtures': True,
        'approvedStaticImagePaths': approved_images,
        'approvedStaticAssetPaths': sorted('/' + name for name in artifact['files']
                                          if re.fullmatch(r'assets/[A-Za-z0-9_.-]+\.(?:js|css)', name)),
    }
    checkpoint('PUBLICATION','WRITE_MANIFEST','RUN_MANIFEST')
    media_approval_sha = write(R / ('media-approval-' + run_id + '.json'), media_approval(revision, run_id))
    attestation_sha = write(R / 'functional-runtime-attestation.json', attestation)
    scope = {
        'schemaVersion': 1, 'environment': 'local', 'projectId': owner['projectId'], 'runId': run_id,
        'expectedRevision': revision, 'appUrl': owner['appUrl'], 'supabaseUrl': state['API_URL'],
        'mailpitUrl': 'http://127.0.0.1:58324', 'databaseUrl': 'postgresql://postgres@127.0.0.1:58322/postgres',
        'privateRoot': str(private), 'anonKeySha256': attestation['anonKeySha256'],
        'serviceKeySha256': attestation['serviceKeySha256'], 'databaseIdentitySha256': attestation['databaseIdentitySha256'],
        'executionProfileSha256':profile_sha,'runtimeAttestationSha256': attestation_sha, 'confirmation': 'LOCAL_WHOLE_SITE_FUNCTIONAL',
    }
    request = {'schemaVersion': 1, 'profileRuntime':descriptor, 'scope': scope, 'artifactSha256': sha(marker), 'secretsSha256': secret_sha,
               'helpers': {name: sha(read(R / name)) for name in ('functional-preflight.py', 'canonical-baseline.py', 'media-readback.py')}}
    request_sha = write(R / ('functional-request-' + run_id + '.json'), request)
    approval = {'schemaVersion': 1, 'confirmation': 'LOCAL_FUNCTIONAL_ROOT_PUBLISH', 'projectId': owner['projectId'],
                'sourceRevision': revision, 'runId': run_id, 'requestSha256': request_sha,
                'publisherSha256': sha(read(R / 'run-functional-owned.py')), 'validatorSha256': sha(read(R / 'validate-functional-publication.mjs')),
                'networkObserverSha256':sha(read(R/'root-functional-network-observer.mjs')),'processObserverSha256':sha(read(R/'linux_owned_process.py')),'executionProfileSha256':profile_sha,'outerBudgetMs': 1500000}
    approval_sha = write(R / ('functional-launch-approval-' + run_id + '.json'), approval)
    checkpoint('FINAL','VERIFY_SOURCE','SOURCE_GIT')
    assert frozen(revision), 'SOURCE_CHANGED'
    print(json.dumps({'result': 'LOCAL_FUNCTIONAL_REQUEST_PREPARED', 'sourceRevision': revision, 'runId': run_id,
                      'approvalSha256': approval_sha, 'requestSha256': request_sha, 'mediaApprovalSha256': media_approval_sha, 'fixturesCreated': 0, 'capacityPass': False}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps(blocked_outcome(error)))
        raise SystemExit(1) from None
