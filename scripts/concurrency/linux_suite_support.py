"""Root orchestration IO for one isolated Linux Local suite, never a verdict oracle."""
import hashlib
import importlib.util
import json
import linux_status_contracts as D
import os
from pathlib import Path
import re
import stat
import sys
import urllib.parse

SOURCE = Path(__file__).resolve().parents[2]
PARENT = SOURCE.parent / 'live-recovery-runtime'
RUNTIME = PARENT / 'whole-site-261115'
TOOLS = PARENT / 'tools'
PROJECT = 'cp-whole-site-261115'
JOB_KEYS = ('GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_JOB', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_WORKFLOW_REF', 'GITHUB_EVENT_NAME')
ENV = {'PATH': str(TOOLS) + ':/usr/bin:/bin', 'HOME': str(Path.home()), 'PYTHONDONTWRITEBYTECODE': '1', 'SUPABASE_TELEMETRY_DISABLED': '1', **{key: os.environ[key] for key in JOB_KEYS if key in os.environ}}


def require(ok, code='LOCAL_SUITE_ADMISSION_FAILED'):
    if not ok:
        raise ValueError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def write(path, value, mode=0o600):
    raw = value if isinstance(value, bytes) else canonical(value) + b'\n'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return digest(raw)


def private(path, maximum=8 * 1024**2):
    require(path.is_absolute() and path.resolve() == path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= maximum)
        raw = stream.read(maximum + 1)
        require(len(raw) <= maximum)
    return raw


def load(path):
    return json.loads(private(path))


def module(name):
    spec = importlib.util.spec_from_file_location('suite_' + name.replace('-', '_'), SOURCE / 'scripts/concurrency' / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def run(argv, timeout=60, environment=None):
    return module('linux-local-bootstrap').bounded(argv, SOURCE, timeout=timeout, maximum=4 * 1024**2, env=environment or ENV)


BOOTSTRAP_CODES = {'BOOTSTRAP_' + name for name in (
    'ADMISSION_INVALID AMBIENT_TARGET_REJECTED ARGUMENTS_INVALID BASELINE_INVALID CGROUP_EXISTS '
    'CGROUP_IDENTITY_INVALID CGROUP_KILL_UNAVAILABLE COMMAND_FAILED COMMAND_TIMEOUT CONFIG_UNSUPPORTED '
    'DIAGNOSTIC_SCOPE_INVALID DOCKER_UNSUPPORTED FILE_CHANGED FILE_INVALID GENERATOR_NOT_EMPTY HARDWARE_UNSUPPORTED JOB_MISMATCH '
    'JWKS_INVALID LINUX_REQUIRED OPERATION_FAILED OUTPUT_LIMIT PACKAGE_INVALID PATH_INVALID PROJECT_INPUT_INVALID REDIRECT_REJECTED '
    'RESOURCES_CHANGED RESOURCES_EXIST RUNTIME_EXISTS SERVICE_COUNT_INVALID SOURCE_CHANGED SOURCE_NOT_FROZEN '
    'STATUS_INVALID TOKEN_SIGNATURE_INVALID TOOLCHAIN_INVALID').split()}
COMMAND_OPERATIONS = set(('UNKNOWN GIT_HEAD GIT_STATUS GIT_TRACKED_FILES NODE_VERSION NODE_KEY_GENERATION NODE_TOKEN_SIGNATURE_VERIFY '
    'SUPABASE_VERSION SUPABASE_GO_VERSION SUPABASE_START_HELP SUPABASE_START SUPABASE_STATUS SYSTEM_READ SYSTEM_WRITE SYSTEMD_RELOAD SYSTEMD_START '
    'SYSTEMD_DOCKER_RESTART CGROUP_MKDIR CGROUP_CHOWN DOCKER_CONFIG_VALIDATE DOCKER_LIST_CONTAINERS '
    'DOCKER_LIST_VOLUMES DOCKER_INSPECT_CONTAINERS DOCKER_INSPECT_VOLUMES DOCKER_INFO DOCKER_IMAGE_PULL '
    'DOCKER_IMAGE_TAG DOCKER_IMAGE_INSPECT DOCKER_EXEC_READONLY').split())
COMMAND_CLASSES = {'UNKNOWN_FLAG','CONFIG_PARSE','PERMISSION','HEALTH','IMAGE_PULL','PORT','CONNECTION','UNKNOWN'}


def safe_bootstrap_outcome(value):
    # This parent independently validates the producer's small public shape.
    keys = {'result','code','stage','upstreamAutoRemovalPossible','newVolumesMayHaveBeenRemoved',
            'remainingResources','command','hardware','readback','executionAuthority','retention'}
    if type(value) is not dict or not set(value) <= keys or value.get('result') != 'FAILED' or not isinstance(value.get('code'),str) or value['code'] not in BOOTSTRAP_CODES:return None
    if value.get('executionAuthority','NONE') != 'NONE' or value.get('retention','UNVERIFIED') != 'UNVERIFIED':return None
    result = {key:value[key] for key in ['result','code']}
    if 'stage' in value:
        if not isinstance(value['stage'],str) or value['stage'] not in {'admission','isolation','project','start','readback'}:return None
        result['stage'] = value['stage']
    for key in ['upstreamAutoRemovalPossible','newVolumesMayHaveBeenRemoved']:
        if key in value:
            if type(value[key]) is not bool:return None
            result[key] = value[key]
    if all(key in value for key in ['upstreamAutoRemovalPossible','newVolumesMayHaveBeenRemoved']) and value['upstreamAutoRemovalPossible'] != value['newVolumesMayHaveBeenRemoved']:return None
    if 'remainingResources' in value:
        if value['remainingResources'] != 'UNKNOWN':return None
        result['remainingResources'] = 'UNKNOWN'
    if 'command' in value:
        command = value['command']
        if type(command) is not dict or set(command) != {'operation','exitCode','stderrBytes','stderrSha256','classification'}:return None
        if not all(isinstance(command[k],str) for k in ['operation','classification']) or command['operation'] not in COMMAND_OPERATIONS or command['classification'] not in COMMAND_CLASSES:return None
        code, size, sha = command['exitCode'], command['stderrBytes'], command['stderrSha256']
        if code is None:
            if size is not None or sha is not None or command['classification'] != 'UNKNOWN':return None
        else:
            if type(code) is not int or not -128 <= code <= 255 or code == 0:return None
            if type(size) is not int or not 0 <= size <= 2097152 or not isinstance(sha,str) or not re.fullmatch('[a-f0-9]{64}',sha):return None
            if size == 0 and sha != digest(b''):return None
        result['command'] = dict(command)
    if 'hardware' in value:
        hardware = value['hardware']
        if type(hardware) is not dict or set(hardware) != {'distribution','logicalCpu','affinityCount','memTotalBytes','freeDiskBytes','cgroupV2','pidfd','pss','psi'}:return None
        if hardware['distribution'] != 'ubuntu-24.04':return None
        if not all(type(hardware[k]) is int and 0 <= hardware[k] <= 1024 for k in ['logicalCpu','affinityCount']):return None
        if not all(type(hardware[k]) is int and 0 <= hardware[k] <= 2**60 for k in ['memTotalBytes','freeDiskBytes']):return None
        if not all(type(hardware[k]) is bool for k in ['cgroupV2','pidfd','pss','psi']):return None
        result['hardware'] = dict(hardware)
    if 'readback' in value:
        readback = D.safe_readback(value['readback'])
        if readback is None:return None
        result['readback'] = readback
    return result


def safe_kernel_outcome(value):
    try:
        require(type(value) is dict and set(value)=={'result','kernelOutcome','rawLogsStored'} and value['result']=='ROOT_LINUX_KERNEL_CALIBRATION_BLOCKED' and value['rawLogsStored'] is False)
        row=value['kernelOutcome'];require(type(row) is dict and set(row)=={'phase','errno','permissions','cleanup','executionAuthority'})
        require(isinstance(row['phase'],str) and row['phase'] in {'ADMISSION','PERMISSIONS','NATIVE_BROWSER','NODE_PROTOCOL','ORPHAN','LATE','ABORT','PIDFD','FINAL'})
        require(row['errno'] is None or isinstance(row['errno'],str) and row['errno'] in {'EACCES','EPERM','ENOENT','EOPNOTSUPP','EBUSY','ESRCH','EINVAL','UNKNOWN'})
        require(row['cleanup']=='UNKNOWN' and row['executionAuthority']=='NONE')
        p=row['permissions']
        if p is not None:
            require(type(p) is dict and set(p)=={'uid','euid','namespaceInode','source','destination','commonAncestor'})
            require(all(type(p[k]) is int and 0<=p[k]<=2**64 for k in ['uid','euid','namespaceInode']))
            for key in ['source','destination','commonAncestor']:
                info=p[key];require(type(info) is dict and set(info)=={'pathSha256','hierarchyRoot','procsUid','procsGid','procsMode','effectiveWritable'})
                require(isinstance(info['pathSha256'],str) and re.fullmatch('[a-f0-9]{64}',info['pathSha256']))
                require(all(type(info[k]) is bool for k in ['hierarchyRoot','effectiveWritable']))
                require(all(type(info[k]) is int and 0<=info[k]<=2**32 for k in ['procsUid','procsGid']) and type(info['procsMode']) is int and 0<=info['procsMode']<=0o7777)
        return json.loads(json.dumps(row))
    except Exception:return None


class StageRejected(ValueError):
    def __init__(self, outcome, kernel=None):
        super().__init__('LOCAL_SUITE_STAGE_REJECTED')
        self.bootstrapOutcome = outcome
        self.kernelOutcome = kernel


def stage(name, argv, expected=None, timeout=60):
    require(bool(re.fullmatch('[a-z][a-z0-9-]{1,70}', name)))
    print(json.dumps({'stage': name, 'capacityVerdict': 'PENDING', 'hostedAuthority': 'NONE'}), flush=True)
    bootstrap = module('linux-local-bootstrap')
    if name in {'kernel-calibration','functional-run'} or name.startswith('capacity-run-'):
        authority = module('linux_attach_authority')
        def install(args, data, timeout):
            return bootstrap.bounded(args, SOURCE, data=data, timeout=timeout, maximum=262144, env=ENV)
        timeout = authority.prepare_stage(name, argv, timeout, install, write)
    code, raw = bootstrap.bounded(argv, SOURCE, timeout=timeout, maximum=4 * 1024**2, env=ENV, checked=False)
    # Preserve failed-stage output privately before rejecting it. Never print it.
    write_error = None
    try:write(PARENT / 'requests' / (name + '-stdout.jsonl'), raw)
    except OSError as error:write_error = error
    lines = [line for line in raw.splitlines() if line.strip()]
    require(bool(lines), 'LOCAL_SUITE_RESULT_MISSING')
    value = json.loads(lines[-1])
    require(isinstance(value, dict), 'LOCAL_SUITE_RESULT_INVALID')
    outcome = safe_bootstrap_outcome(value) if name == 'bootstrap' else None
    kernel = safe_kernel_outcome(value) if name == 'kernel-calibration' else None
    rejected = code != 0 or (expected and value.get('result') != expected)
    if write_error is not None:
        if rejected:raise StageRejected(outcome, kernel) from None
        raise write_error
    try:
        write(PARENT / 'requests' / (name + '-result.json'), value)
        if outcome is not None:write(PARENT / 'requests' / (name + '-diagnostic.json'), outcome)
        if kernel is not None:write(PARENT / 'requests' / (name + '-diagnostic.json'), kernel)
    except OSError:
        if rejected:raise StageRejected(outcome, kernel) from None
        raise
    if rejected:raise StageRejected(outcome, kernel)
    return value


def create_bootstrap_request(revision):
    import secrets
    host = module('linux_bootstrap_contracts').H
    target = host.environment_target(ENV)
    request = {'schemaVersion': 1, 'confirmation': target['confirmation'], 'sourceRevision': revision, 'repository': 'peiyi-liu/colorplay_v1', 'job': {'runId': os.environ['GITHUB_RUN_ID'], 'runAttempt': 1, 'jobName': 'capacity-linux'}, 'instanceNonce': secrets.token_hex(16), 'operatorPackageManifestSha256': digest((SOURCE / 'scripts/concurrency/linux-operator/package-manifest.json').read_bytes()), 'toolchainSha256': digest(private(TOOLS / 'toolchain.json'))}
    if target['kind'] == host.VM:request['provenance'] = host.provenance(host.VM)
    folder = PARENT / 'requests'
    folder.mkdir(mode=0o700)
    path = folder / 'bootstrap-input.json'
    approved = write(path, request)
    return path, approved, request


def install_psql_adapter():
    target = PARENT / 'host-client/bin'
    target.mkdir(mode=0o700, parents=True)
    os.chmod(target.parent, 0o700)
    raw = private(RUNTIME / 'local-psql.py')
    require(raw == (SOURCE / 'scripts/concurrency/linux-operator/local-psql.py').read_bytes(), 'LOCAL_PSQL_SOURCE_CHANGED')
    write(target / 'psql', raw, 0o700)


def create_snapshot_plan(revision, request_sha):
    ctx = load(RUNTIME / 'execution-context.json')
    profile_raw = private(RUNTIME / 'execution-profile.json')
    profile = json.loads(profile_raw)
    active = load(RUNTIME / 'active-preview.json')
    pid = active['pid']
    require(type(pid) is int and pid > 0 and active['sourceRevision'] == revision)
    tick_text = active['processStart']
    require(type(tick_text) is str and re.fullmatch('[1-9][0-9]{0,18}', tick_text) is not None)
    start_ticks = int(tick_text)
    require(start_ticks <= 2**63 - 1)
    # The preview uses the same pinned Node executable, outside the workload leaf.
    executable = Path(os.readlink('/proc/' + str(pid) + '/exe'))
    require(str(executable) == ctx['binaries']['node']['path'] and digest(executable.read_bytes()) == ctx['binaries']['node']['sha256'])
    process_status = Path('/proc/' + str(pid) + '/status').read_text()
    uid_rows = [line.split()[1:] for line in process_status.splitlines() if line.startswith('Uid:')]
    require(uid_rows == [[str(os.getuid())] * 4])
    stat_text = Path('/proc/' + str(pid) + '/stat').read_text()
    suffix = stat_text[stat_text.rfind(')') + 2:].split()
    require(int(suffix[19]) == start_ticks)
    containers = []
    for row in ctx['containers']:
        actual = json.loads(run(['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', 'inspect', row['id']]))
        require(len(actual) == 1)
        item = actual[0]
        require(item['Id'] == row['id'] and item['Name'] == row['name'] and item['Image'] == row['imageId'] and item['State']['Running'] is True)
        mounts = sorted([{'type': mount['Type'], 'name': mount.get('Name') or None, 'source': mount['Source'], 'destination': mount['Destination'], 'readWrite': mount['RW'], 'driver': mount.get('Driver') or None} for mount in item['Mounts']], key=lambda value: value['destination'])
        containers.append({**row, 'mounts': mounts})
    state = load(RUNTIME / 'status-secret.json')
    target = urllib.parse.urlsplit(state['DB_URL'])
    database_env = {**ENV, 'PGHOST': '127.0.0.1', 'PGPORT': '58322', 'PGDATABASE': 'postgres', 'PGUSER': 'postgres', 'PGPASSWORD': urllib.parse.unquote(target.password or ''), 'PGSSLMODE': 'disable', 'PGCONNECT_TIMEOUT': '5', 'PGOPTIONS': '-c default_transaction_read_only=on'}
    sql = b"begin read only;select coalesce(json_agg(datname order by datname),'[]'::json) from pg_database where not datistemplate;rollback;"
    adapter = module('linux-local-bootstrap')
    raw = adapter.bounded([str(PARENT / 'host-client/bin/psql'), '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1'], SOURCE, data=sql, env=database_env, timeout=20, maximum=4096)
    databases = json.loads(raw)
    require(databases == sorted(set(databases)) and databases and set(databases) <= {'postgres', '_supabase'}, 'LOCAL_DATABASE_CENSUS_UNKNOWN')
    plan = {'schemaVersion': 1, 'confirmation': 'LOCAL_LINUX_SNAPSHOT_ONCE', 'sourceRevision': revision, 'executionProfileSha256': digest(profile_raw), 'executionContextSha256': digest(private(RUNTIME / 'execution-context.json')), 'jobIdentitySha256': digest(canonical(ctx['job'])), 'operatorPackageManifestSha256': digest((SOURCE / 'scripts/concurrency/linux-operator/package-manifest.json').read_bytes()), 'toolchainSha256': digest(private(TOOLS / 'toolchain.json')), 'bootstrapRequestSha256': request_sha, 'projectId': PROJECT, 'instanceNonce': ctx['instanceNonce'], 'databases': databases, 'preview': {'pid': pid, 'startTicks': start_ticks, 'uid': os.getuid(), 'executablePath': str(executable), 'executableSha256': ctx['binaries']['node']['sha256'], 'hostBootIdSha256': profile['identity']['bootIdSha256']}, 'containers': sorted(containers, key=lambda item: item['role'])}
    path = PARENT / 'requests/snapshot-plan.json'
    return path, write(path, plan)


def fingerprint(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def file_record(path, root):
    require(path.resolve() == path and path.is_relative_to(root))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600 and before.st_size <= 2 * 1024**3)
        hasher, count = hashlib.sha256(), 0
        while chunk := stream.read(65536):
            count += len(chunk)
            require(count <= before.st_size)
            hasher.update(chunk)
        require(count == before.st_size and fingerprint(os.fstat(stream.fileno())) == fingerprint(before) == fingerprint(path.lstat()), 'LOCAL_EXPORT_FILE_CHANGED')
    return {'path': path.relative_to(root).as_posix(), 'bytes': count, 'sha256': hasher.hexdigest()}


def capture_partial_diagnostic(snapshot, summary):
    # Failure evidence only: never a replacement for M5's cold-volume snapshot.
    require(snapshot.parent == PARENT / 'snapshots' and snapshot.resolve() == snapshot)
    if not snapshot.exists():
        snapshot.mkdir(mode=0o700, parents=True)
        os.chmod(snapshot.parent, 0o700)
    for directory in [snapshot.parent, snapshot]:
        info = directory.lstat()
        require(directory.resolve() == directory and stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700)
    target = snapshot / 'root-partial-diagnostic'
    target.mkdir(mode=0o700)
    runtime_copy = target / 'runtime'
    runtime_copy.mkdir(mode=0o700)
    omissions = []
    copied = 0
    for parent, directories, names in os.walk(RUNTIME, followlinks=False):
        parent = Path(parent)
        relative = parent.relative_to(RUNTIME)
        for name in list(directories):
            source = parent / name
            info = source.lstat()
            if source.is_symlink() or info.st_uid != os.getuid() or not stat.S_ISDIR(info.st_mode):
                omissions.append({'path': (relative / name).as_posix(), 'reason': 'DIRECTORY_NOT_ATTESTED'})
                directories.remove(name)
            else:
                (runtime_copy / relative / name).mkdir(mode=0o700)
        for name in names:
            source = parent / name
            info = source.lstat()
            if source.is_symlink() or info.st_uid != os.getuid() or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                omissions.append({'path': (relative / name).as_posix(), 'reason': 'FILE_NOT_ATTESTED'})
                continue
            # CLI-generated files may be 0644 beneath private Runtime. Harden
            # only the new diagnostic copy, never mutate the original.
            require(info.st_size <= 2 * 1024**3)
            fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            output = os.open(runtime_copy / relative / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'rb') as reader, os.fdopen(output, 'wb') as writer:
                before = os.fstat(reader.fileno())
                require(fingerprint(before) == fingerprint(info), 'PARTIAL_DIAGNOSTIC_SOURCE_CHANGED')
                while chunk := reader.read(65536):
                    copied += len(chunk)
                    require(copied <= 2 * 1024**3, 'PARTIAL_DIAGNOSTIC_LIMIT')
                    writer.write(chunk)
                require(fingerprint(os.fstat(reader.fileno())) == fingerprint(before) == fingerprint(source.lstat()), 'PARTIAL_DIAGNOSTIC_SOURCE_CHANGED')
    controls = target / 'requests'
    controls.mkdir(mode=0o700)
    for source in sorted((PARENT / 'requests').iterdir()):
        write(controls / source.name, private(source))
    write(target / 'diagnostic-scope.json', {'captureCompleteness': 'PARTIAL', 'mode': 'DIAGNOSTIC_ONLY_DATABASE_AND_VOLUMES_NOT_ATTESTED', 'omissions': omissions, 'copiedRuntimeBytes': copied, 'retention': 'UNVERIFIED', 'suite': summary})
    return snapshot


def export_snapshot(snapshot, revision, profile_sha, job_sha, completeness='COMPLETE'):
    require(completeness in {'COMPLETE', 'PARTIAL'})
    require(snapshot.resolve() == snapshot and snapshot.parent == PARENT / 'snapshots')
    recipient = json.loads((SOURCE / 'scripts/concurrency/local-export-recipient.json').read_bytes())
    require(recipient == {'schemaVersion': 1, 'recipient': recipient.get('recipient'), 'privateIdentityUploaded': False})
    files = []
    for path in sorted(snapshot.rglob('*')):
        info = path.lstat()
        require(not path.is_symlink() and info.st_uid == os.getuid())
        if stat.S_ISDIR(info.st_mode):
            require(stat.S_IMODE(info.st_mode) == 0o700)
            continue
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600)
        files.append(file_record(path, snapshot))
    require(0 < len(files) <= 20000)
    manifest = {'schemaVersion': 1, 'environment': 'local', 'sourceRevision': revision, 'executionProfileSha256': profile_sha, 'jobSha256': job_sha, 'recipient': recipient['recipient'], 'files': files}
    manifest_path = PARENT / 'requests/export-manifest.json'
    approved = write(manifest_path, manifest)
    output = PARENT / 'exports'
    output.mkdir(mode=0o700)
    value = stage('encrypt-evidence', ['/usr/bin/python3', '-B', str(SOURCE / 'scripts/concurrency/export-local-evidence.py'), '--source-root', str(snapshot), '--manifest', str(manifest_path), '--approve', approved, '--output', str(output / 'evidence.age')], 'CIPHER_ARCHIVE_CREATED', timeout=140)
    require(value.get('retention') == 'UNVERIFIED' and value.get('ownedProcessClosed') is True)
    write(output / 'export-complete.json', {'result': 'CIPHER_ARCHIVE_CREATED', 'captureCompleteness': completeness, 'cipherSha256': value['cipherSha256'], 'cipherBytes': value['cipherBytes'], 'retention': 'UNVERIFIED'})
    return value


def prebusiness_state(summary, code='PREBUSINESS_NOT_ADMITTED'):
    phase = summary.get('failedStage')
    require(sys.platform == 'linux' and summary.get('functional') == 'NOT_RUN' and
            type(summary.get('passedLegs')) is int and summary['passedLegs'] == 0 and
            summary.get('capacityVerdict') == 'NOT_VERIFIED' and isinstance(phase, str) and phase in
            {'bootstrap','profile-pin','kernel-calibration','build-and-preview','entry-bundle','edge-source-bind','snapshot-plan'},
            code)
    require(not any(os.path.lexists(RUNTIME / name) for name in ['functional-private','capacity-journals']), code)
    if os.path.lexists(RUNTIME):
        info = RUNTIME.lstat()
        require(RUNTIME.resolve() == RUNTIME and stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and
                stat.S_IMODE(info.st_mode) == 0o700, code)
    markers = []
    for name in ['execution-profile.json','execution-context.json','reviewed-candidate.json']:
        path = RUNTIME / name
        if os.path.lexists(path):
            info = path.lstat()
            require(phase != 'bootstrap' and stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and
                    info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == 0o600, code)
            markers.append((name, fingerprint(info)))
    return phase, markers


def export_prebusiness_diagnostic(revision, request_path, request_sha, summary):
    initial_state = prebusiness_state(summary)
    require(request_path == PARENT / 'requests/bootstrap-input.json', 'PREBUSINESS_NOT_ADMITTED')
    raw = private(request_path)
    request = module('linux-local-bootstrap').C.parse_request(raw, request_sha, os.environ)
    require(request['sourceRevision'] == revision == os.environ.get('GITHUB_SHA'), 'PREBUSINESS_SOURCE_CHANGED')
    job = {'repository':request['repository'], **request['job']}
    job_sha = digest(canonical(job))
    source = PARENT / 'requests'
    info = source.lstat()
    require(source.resolve() == source and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700)
    target = PARENT / 'prebusiness-diagnostic'
    require(not os.path.lexists(target) and not os.path.lexists(PARENT / 'exports'), 'PREBUSINESS_OUTPUT_EXISTS')
    target.mkdir(mode=0o700)
    copied = target / 'requests';copied.mkdir(mode=0o700)
    names = sorted(source.iterdir())
    require(len(names) <= 20000)
    for path in names:
        before = file_record(path, source)
        body = private(path)
        require(digest(body) == before['sha256'] and len(body) == before['bytes'])
        write(copied / path.name, body)
        require(file_record(path, source) == before, 'PREBUSINESS_INPUT_CHANGED')
    require(sorted(source.iterdir()) == names, 'PREBUSINESS_INPUT_CHANGED')
    raw_status = 'UNKNOWN'
    metadata_path = copied / 'bootstrap-command-raw.json'
    if metadata_path.exists():
        try:
            metadata = load(metadata_path)
            require(set(metadata) == {'schemaVersion','bootstrapRequestSha256','operation','exitCode','complete',
                'status','stdoutBytes','stdoutSha256','stderrBytes','stderrSha256'})
            require(metadata['schemaVersion'] == 1 and metadata['bootstrapRequestSha256'] == request_sha and
                    metadata['operation'] in COMMAND_OPERATIONS and type(metadata['exitCode']) is int and
                    metadata['exitCode'] != 0 and metadata['complete'] is True and metadata['status'] == 'SAVED')
            for name in ['stdout','stderr']:
                record = file_record(copied / ('bootstrap-command-' + name + '.bin'), copied)
                require(record['bytes'] == metadata[name+'Bytes'] and record['sha256'] == metadata[name+'Sha256'])
            require(metadata['stdoutBytes'] + metadata['stderrBytes'] <= 2097152)
            raw_status = 'SAVED'
        except Exception:
            pass  # Preserve original private evidence; never invent missing byte counts.
    write(target / 'diagnostic-scope.json', {'schemaVersion':1,'purpose':'PREBUSINESS_DIAGNOSTIC',
        'captureCompleteness':'PREBUSINESS_DIAGNOSTIC_ONLY','sourceRevision':revision,'executionProfileSha256':None,
        'bootstrapRequestSha256':request_sha,'jobSha256':job_sha,'rawCapture':raw_status,
        'failedStage':initial_state[0],'profileAttested':False,'uncaptured':['RUNTIME','EXECUTION_PROFILE','DATABASES','VOLUMES'],
        'retention':'UNVERIFIED','executionAuthority':'NONE'})
    recipient = json.loads((SOURCE / 'scripts/concurrency/local-export-recipient.json').read_bytes())
    require(recipient == {'schemaVersion':1,'recipient':recipient.get('recipient'),'privateIdentityUploaded':False})
    manifest = {'schemaVersion':2,'purpose':'PREBUSINESS_DIAGNOSTIC','environment':'local',
        'sourceRevision':revision,'executionProfileSha256':None,'bootstrapRequestSha256':request_sha,
        'jobSha256':job_sha,'recipient':recipient['recipient'],
        'files':[file_record(path,target) for path in sorted(target.rglob('*')) if path.is_file()]}
    manifest_path = source / 'prebusiness-export-manifest.json'
    approved = write(manifest_path, manifest)
    output = PARENT / 'exports';output.mkdir(mode=0o700)
    result = stage('encrypt-prebusiness-diagnostic', ['/usr/bin/python3','-B',str(SOURCE / 'scripts/concurrency/export-local-evidence.py'),
        '--source-root',str(target),'--manifest',str(manifest_path),'--approve',approved,'--output',str(output / 'evidence.age')],
        'CIPHER_CREATED', timeout=140)
    require(result.get('purpose') == 'PREBUSINESS_DIAGNOSTIC' and result.get('executionProfileSha256',False) is None and
            result.get('executionAuthority') == 'NONE' and result.get('retention') == 'UNVERIFIED' and
            result.get('ownedProcessClosed') is True and result.get('sourceRevision') == revision and
            result.get('bootstrapRequestSha256') == request_sha and result.get('jobSha256') == job_sha and
            result.get('approvedManifestSha256') == approved, 'PREBUSINESS_EXPORT_UNVERIFIED')
    cipher = file_record(output / 'evidence.age', output)
    require(cipher['sha256'] == result.get('cipherSha256') and cipher['bytes'] == result.get('cipherBytes') and
            cipher['bytes'] <= 100*1024**2 and private(request_path) == raw and
            prebusiness_state(summary, 'PREBUSINESS_EXPORT_UNVERIFIED') == initial_state, 'PREBUSINESS_EXPORT_UNVERIFIED')
    marker = {'result':'CIPHER_CREATED','purpose':'PREBUSINESS_DIAGNOSTIC',
        'captureCompleteness':'PREBUSINESS_DIAGNOSTIC_ONLY','executionProfileSha256':None,
        'bootstrapRequestSha256':request_sha,'jobSha256':job_sha,'rawCapture':raw_status,
        'failedStage':initial_state[0],'profileAttested':False,'uncaptured':['RUNTIME','EXECUTION_PROFILE','DATABASES','VOLUMES'],
        'cipherSha256':cipher['sha256'],'cipherBytes':cipher['bytes'],'retention':'UNVERIFIED','executionAuthority':'NONE'}
    write(output / 'export-complete.json', marker)
    return marker
