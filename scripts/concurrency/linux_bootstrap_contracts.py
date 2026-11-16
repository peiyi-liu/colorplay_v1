"""Strict Local bootstrap admission. No service execution in this module."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

PROJECT = 'cp-whole-site-261115'
REPOSITORY = 'peiyi-liu/colorplay_v1'
DIGEST = re.compile(r'[a-f0-9]{64}\Z')
ROLES = {'db', 'auth', 'rest', 'realtime', 'storage', 'edge_runtime', 'kong', 'inbucket'}

class BootstrapError(Exception):
    pass

def require(ok, code='BOOTSTRAP_ADMISSION_INVALID'):
    if not ok:
        raise BootstrapError(code)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def unique(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result)
        result[key] = value
    return result

def decode(raw):
    return json.loads(raw, object_pairs_hook=unique)

def exact(value, keys):
    require(type(value) is dict and set(value) == set(keys))
    return value

def parse_request(raw, approval, environment):
    require(len(raw) <= 32768 and isinstance(approval, str) and
            DIGEST.fullmatch(approval) and digest(raw) == approval)
    value = exact(decode(raw), {'schemaVersion', 'confirmation', 'sourceRevision',
        'repository', 'job', 'instanceNonce', 'operatorPackageManifestSha256', 'toolchainSha256'})
    require(type(value['schemaVersion']) is int and value['schemaVersion'] == 1 and
            value['confirmation'] == 'LOCAL_LINUX_FREE_BOOTSTRAP_ONCE' and value['repository'] == REPOSITORY)
    require(isinstance(value['sourceRevision'], str) and re.fullmatch('[a-f0-9]{40}', value['sourceRevision']))
    require(isinstance(value['instanceNonce'], str) and re.fullmatch('[a-f0-9]{32}', value['instanceNonce']))
    for name in ['operatorPackageManifestSha256', 'toolchainSha256']:
        require(isinstance(value[name], str) and DIGEST.fullmatch(value[name]))
    job = exact(value['job'], ['runId', 'runAttempt', 'jobName'])
    require(isinstance(job['runId'], str) and re.fullmatch('[0-9]{1,20}', job['runId']) and
            type(job['runAttempt']) is int and job['runAttempt'] == 1 and job['jobName'] == 'capacity-linux')
    for name, expected in {'GITHUB_REPOSITORY': REPOSITORY, 'GITHUB_RUN_ID': job['runId'],
                           'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_JOB': 'capacity-linux'}.items():
        require(environment.get(name) == expected, 'BOOTSTRAP_JOB_MISMATCH')
    require(not any(value for key, value in environment.items()
                    if (key.startswith(('SUPABASE_', 'VITE_')) and not
                        (key == 'SUPABASE_TELEMETRY_DISABLED' and value == '1')) or key in
                    {'DOCKER_HOST', 'DOCKER_CONTEXT', 'CONTAINER_HOST', 'PYTHONPATH'}),
            'BOOTSTRAP_AMBIENT_TARGET_REJECTED')
    return value

def fingerprint(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_mode, info.st_nlink,
            info.st_size, info.st_mtime_ns, info.st_ctime_ns)

def read_file(path, maximum=2097152, private=False):
    path = Path(path)
    require(path.is_absolute() and path.resolve() == path, 'BOOTSTRAP_PATH_INVALID')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and
                info.st_uid == os.getuid() and info.st_size <= maximum, 'BOOTSTRAP_FILE_INVALID')
        if private:
            require(stat.S_IMODE(info.st_mode) == 0o600, 'BOOTSTRAP_FILE_INVALID')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(maximum + 1)
        require(len(raw) <= maximum and fingerprint(os.fstat(fd)) == fingerprint(info), 'BOOTSTRAP_FILE_CHANGED')
        require(fingerprint(path.stat(follow_symlinks=False)) == fingerprint(info), 'BOOTSTRAP_FILE_CHANGED')
        return raw
    finally:
        os.close(fd)

def directory(path):
    path = Path(path)
    require(path.is_absolute() and path.resolve() == path and not path.is_symlink())
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o700 and info.st_uid == os.getuid())

def write_once(path, value):
    path = Path(path)
    directory(path.parent)
    raw = value if isinstance(value, bytes) else (json.dumps(value, sort_keys=True) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return digest(raw)

def binary_hash(path):
    path = Path(path)
    require(path.is_absolute() and path.resolve() == path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_uid == os.getuid()
                and before.st_size <= 512 * 1024**2 and before.st_mode & 0o111)
        result = hashlib.sha256()
        while chunk := os.read(fd, 65536):
            result.update(chunk)
        require(fingerprint(os.fstat(fd)) == fingerprint(before) and fingerprint(path.stat(follow_symlinks=False)) == fingerprint(before))
        return result.hexdigest()
    finally:
        os.close(fd)

def toolchain(parent, expected):
    tools = parent / 'tools'
    directory(tools)
    raw = read_file(tools / 'toolchain.json', private=True)
    require(digest(raw) == expected, 'BOOTSTRAP_TOOLCHAIN_INVALID')
    values = exact(decode(raw), ['schemaVersion', 'node', 'supabase', 'supabaseGo'])
    require(type(values['schemaVersion']) is int and values['schemaVersion'] == 2)
    for name, filename, version in [('node','node','24.18.0'), ('supabase','supabase','2.109.1'), ('supabaseGo','supabase-go','2.109.1')]:
        row = exact(values[name], ['path', 'version', 'sha256'])
        require(row['path'] == str(tools / filename) and row['version'] == version and
                DIGEST.fullmatch(row['sha256']) and stat.S_IMODE(Path(row['path']).lstat().st_mode) == 0o700 and
                binary_hash(row['path']) == row['sha256'],
                'BOOTSTRAP_TOOLCHAIN_INVALID')
    return values

def operator_package(source, expected):
    package = source / 'scripts/concurrency/linux-operator'
    raw = read_file(package / 'package-manifest.json')
    require(digest(raw) == expected, 'BOOTSTRAP_PACKAGE_INVALID')
    values = exact(decode(raw), ['schemaVersion', 'files', 'executionAuthority',
        'nativeLinuxValidated', 'noCredentials', 'package', 'runtimeDirectory',
        'sourceDirectory', 'sourceRevisionBinding'])
    require(type(values['schemaVersion']) is int and values['schemaVersion'] == 1 and
            type(values['nativeLinuxValidated']) is bool and values['noCredentials'] is True and
            values['executionAuthority'] == 'NONE_UNTIL_ROOT_JOB_APPROVAL' and
            values['package'] == 'COLORPLAY_LOCAL_LINUX_ROOT_OPERATOR_DRAFT' and
            values['runtimeDirectory'] == 'live-recovery-runtime/whole-site-261115' and
            values['sourceDirectory'] == source.name == 'colorplay-live-recovery' and
            values['sourceRevisionBinding'] == 'ROOT_APPROVED_GITHUB_JOB_AND_CLEAN_HEAD')
    require(type(values['files']) is dict and 1 <= len(values['files']) <= 100)
    installed = {}
    for name, row in values['files'].items():
        require(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9_-]+\.(py|mjs|json)', name))
        exact(row, ['bytes', 'role', 'sha256'])
        require(type(row['bytes']) is int and 0 <= row['bytes'] <= 1048576 and
                DIGEST.fullmatch(row['sha256']) and row['role'] in {'OPERATOR', 'PUBLIC_IMAGE_PINS', 'TEST'})
        body = read_file(package / name, 1048576)
        require(len(body) == row['bytes'] and digest(body) == row['sha256'], 'BOOTSTRAP_PACKAGE_INVALID')
        if row['role'] == 'PUBLIC_IMAGE_PINS':
            require(name == 'linux-image-pins.json')
        if row['role'] != 'TEST':
            installed[name] = body
    require(all(name in installed for name in ['linux-image-pins.json', 'collect_readiness.py', 'linux_proc.py']))
    require(values['files']['linux-image-pins.json']['role'] == 'PUBLIC_IMAGE_PINS' and
            all(values['files'][name]['role'] == 'OPERATOR' for name in ['collect_readiness.py', 'linux_proc.py']))
    require({p.name for p in package.iterdir()} == set(values['files']) | {'package-manifest.json', 'README.md'})
    return package, installed

def hardware(facts):
    require(facts['platform'] == 'linux' and facts['architecture'] in {'x86_64', 'amd64'} and
            facts['distribution'] == 'ubuntu-24.04' and facts['logicalCpu'] == 4 and
            len(facts['affinity']) == len(set(facts['affinity'])) == 4 and
            14 * 1024**3 <= facts['memTotalBytes'] <= 16 * 1024**3 and
            facts['freeDiskBytes'] >= 10 * 1024**3 and
            all(facts[k] is True for k in ['cgroupV2', 'pidfd', 'pss', 'psi']),
            'BOOTSTRAP_HARDWARE_UNSUPPORTED')
