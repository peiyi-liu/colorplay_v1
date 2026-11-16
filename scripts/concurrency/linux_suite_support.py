"""Root orchestration IO for one isolated Linux Local suite, never a verdict oracle."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import urllib.parse

SOURCE = Path(__file__).resolve().parents[2]
PARENT = SOURCE.parent / 'live-recovery-runtime'
RUNTIME = PARENT / 'whole-site-261115'
TOOLS = PARENT / 'tools'
PROJECT = 'cp-whole-site-261115'
JOB_KEYS = ('GITHUB_REPOSITORY', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_JOB', 'GITHUB_SHA')
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


def stage(name, argv, expected=None, timeout=60):
    require(bool(re.fullmatch('[a-z][a-z0-9-]{1,70}', name)))
    print(json.dumps({'stage': name, 'capacityVerdict': 'PENDING', 'hostedAuthority': 'NONE'}), flush=True)
    code, raw = module('linux-local-bootstrap').bounded(argv, SOURCE, timeout=timeout, maximum=4 * 1024**2, env=ENV, checked=False)
    # Preserve failed-stage output privately before rejecting it. Never print it.
    write(PARENT / 'requests' / (name + '-stdout.jsonl'), raw)
    lines = [line for line in raw.splitlines() if line.strip()]
    require(bool(lines), 'LOCAL_SUITE_RESULT_MISSING')
    value = json.loads(lines[-1])
    require(isinstance(value, dict), 'LOCAL_SUITE_RESULT_INVALID')
    write(PARENT / 'requests' / (name + '-result.json'), value)
    require(code == 0 and (not expected or value.get('result') == expected), 'LOCAL_SUITE_STAGE_REJECTED')
    return value


def create_bootstrap_request(revision):
    import secrets
    request = {'schemaVersion': 1, 'confirmation': 'LOCAL_LINUX_FREE_BOOTSTRAP_ONCE', 'sourceRevision': revision, 'repository': 'peiyi-liu/colorplay_v1', 'job': {'runId': os.environ['GITHUB_RUN_ID'], 'runAttempt': 1, 'jobName': 'capacity-linux'}, 'instanceNonce': secrets.token_hex(16), 'operatorPackageManifestSha256': digest((SOURCE / 'scripts/concurrency/linux-operator/package-manifest.json').read_bytes()), 'toolchainSha256': digest(private(TOOLS / 'toolchain.json'))}
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
    # The preview uses the same pinned Node executable, outside the workload leaf.
    executable = Path(os.readlink('/proc/' + str(pid) + '/exe'))
    require(str(executable) == ctx['binaries']['node']['path'] and digest(executable.read_bytes()) == ctx['binaries']['node']['sha256'])
    process_status = Path('/proc/' + str(pid) + '/status').read_text()
    uid_rows = [line.split()[1:] for line in process_status.splitlines() if line.startswith('Uid:')]
    require(uid_rows == [[str(os.getuid())] * 4])
    stat_text = Path('/proc/' + str(pid) + '/stat').read_text()
    suffix = stat_text[stat_text.rfind(')') + 2:].split()
    require(int(suffix[19]) == active['processStart'])
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
    plan = {'schemaVersion': 1, 'confirmation': 'LOCAL_LINUX_SNAPSHOT_ONCE', 'sourceRevision': revision, 'executionProfileSha256': digest(profile_raw), 'executionContextSha256': digest(private(RUNTIME / 'execution-context.json')), 'jobIdentitySha256': digest(canonical(ctx['job'])), 'operatorPackageManifestSha256': digest((SOURCE / 'scripts/concurrency/linux-operator/package-manifest.json').read_bytes()), 'toolchainSha256': digest(private(TOOLS / 'toolchain.json')), 'bootstrapRequestSha256': request_sha, 'projectId': PROJECT, 'instanceNonce': ctx['instanceNonce'], 'databases': databases, 'preview': {'pid': pid, 'startTicks': active['processStart'], 'uid': os.getuid(), 'executablePath': str(executable), 'executableSha256': ctx['binaries']['node']['sha256'], 'hostBootIdSha256': profile['identity']['bootIdSha256']}, 'containers': sorted(containers, key=lambda item: item['role'])}
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
