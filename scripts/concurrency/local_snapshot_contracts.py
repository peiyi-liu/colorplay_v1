"""Strict, externally approved Local snapshot scope and private file handling."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
from linux_bootstrap_contracts import (PROJECT, ROLES, directory, read_file, write_once,
                                      fingerprint, binary_hash, toolchain, operator_package)

LIMIT = 2 * 1024**3
MAX_FILES = 20000
HEX = re.compile(r'[a-f0-9]{64}\Z')


class SnapshotError(Exception):
    pass


def require(ok, code='SNAPSHOT_SCOPE_INVALID'):
    if not ok:
        raise SnapshotError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def unique(pairs):
    value = {}
    for key, item in pairs:
        require(key not in value)
        value[key] = item
    return value


def decode(raw):
    return json.loads(raw, object_pairs_hook=unique)


def exact(value, keys):
    require(type(value) is dict and set(value) == set(keys))
    return value


def integer(value, minimum=0):
    return type(value) is int and value >= minimum


def path(value):
    require(isinstance(value, str) and value and '\\' not in value and
            not any(ord(c) < 32 or ord(c) == 127 for c in value))
    target = PurePosixPath(value)
    require(target.is_absolute() and str(target) == value and '..' not in target.parts)
    return target


def parse_plan(raw, approved):
    require(len(raw) <= 1048576 and isinstance(approved, str) and HEX.fullmatch(approved) and
            digest(raw) == approved, 'SNAPSHOT_APPROVAL_INVALID')
    value = exact(decode(raw), ['schemaVersion', 'confirmation', 'sourceRevision', 'executionProfileSha256',
        'executionContextSha256', 'jobIdentitySha256', 'operatorPackageManifestSha256', 'toolchainSha256',
        'bootstrapRequestSha256', 'projectId', 'instanceNonce', 'databases', 'preview', 'containers'])
    require(integer(value['schemaVersion']) and value['schemaVersion'] == 1 and
            value['confirmation'] == 'LOCAL_LINUX_SNAPSHOT_ONCE' and value['projectId'] == PROJECT and
            isinstance(value['sourceRevision'], str) and re.fullmatch('[a-f0-9]{40}', value['sourceRevision']) and
            isinstance(value['instanceNonce'], str) and re.fullmatch('[a-f0-9]{32}', value['instanceNonce']))
    for key in ['executionProfileSha256', 'executionContextSha256', 'jobIdentitySha256',
                'operatorPackageManifestSha256', 'toolchainSha256', 'bootstrapRequestSha256']:
        require(isinstance(value[key], str) and HEX.fullmatch(value[key]))
    databases = value['databases']
    require(type(databases) is list and all(isinstance(v,str) for v in databases) and databases == sorted(set(databases)) and
            'postgres' in databases and set(databases) <= {'postgres', '_supabase'})
    preview = exact(value['preview'], ['pid', 'startTicks', 'uid', 'executablePath',
                                      'executableSha256', 'hostBootIdSha256'])
    require(integer(preview['pid'], 2) and integer(preview['startTicks'], 1) and integer(preview['uid']) and
            all(isinstance(preview[key], str) and HEX.fullmatch(preview[key])
                for key in ['executableSha256', 'hostBootIdSha256']))
    path(preview['executablePath'])
    rows = value['containers']
    require(type(rows) is list and len(rows) == 8)
    roles, ids = set(), set()
    for row in rows:
        exact(row, ['role', 'id', 'name', 'imageId', 'mounts'])
        require(row['role'] in ROLES and row['role'] not in roles and
                isinstance(row['id'], str) and HEX.fullmatch(row['id']) and row['id'] not in ids and
                row['name'] == '/supabase_' + row['role'] + '_' + PROJECT and
                isinstance(row['imageId'], str) and re.fullmatch('sha256:[a-f0-9]{64}', row['imageId']))
        require(type(row['mounts']) is list and len(row['mounts']) <= 20)
        destinations = set()
        for mount in row['mounts']:
            exact(mount, ['type', 'name', 'source', 'destination', 'readWrite', 'driver'])
            require(mount['type'] in {'volume', 'bind'} and type(mount['readWrite']) is bool)
            path(mount['source']); path(mount['destination'])
            require(mount['destination'] not in destinations)
            if mount['type'] == 'volume':
                require(isinstance(mount['name'], str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,200}', mount['name'])
                        and mount['driver'] == 'local')
            else:
                require(mount['name'] is None and mount['driver'] is None)
            destinations.add(mount['destination'])
        roles.add(row['role']); ids.add(row['id'])
    return value


def bindings(source, runtime, plan, environment):
    profile_raw = read_file(runtime / 'execution-profile.json', private=True)
    context_raw = read_file(runtime / 'execution-context.json', private=True)
    require(digest(profile_raw) == plan['executionProfileSha256'] and
            digest(context_raw) == plan['executionContextSha256'], 'SNAPSHOT_PROFILE_CHANGED')
    profile, context = decode(profile_raw), decode(context_raw)
    require(profile['kind'] == 'LINUX_FREE_4CPU_16G_V1' and context['projectId'] == PROJECT and
            context['sourceRevision'] == plan['sourceRevision'] and context['instanceNonce'] == plan['instanceNonce'])
    job = exact(context['job'], ['repository', 'runId', 'runAttempt', 'jobName'])
    require(digest(canonical(job)) == plan['jobIdentitySha256'] and
            job['repository'] == 'peiyi-liu/colorplay_v1' and job['runAttempt'] == 1 and job['jobName'] == 'capacity-linux')
    for key, expected in {'GITHUB_REPOSITORY': job['repository'], 'GITHUB_RUN_ID': job['runId'],
                         'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_JOB': job['jobName']}.items():
        require(environment.get(key) == expected, 'SNAPSHOT_JOB_CHANGED')
    require(not any(v for k, v in environment.items() if k.startswith(('VITE_', 'SUPABASE_')) and
                    not (k == 'SUPABASE_TELEMETRY_DISABLED' and v == '1')), 'SNAPSHOT_AMBIENT_TARGET_REJECTED')
    require(not any(environment.get(k) for k in ['DOCKER_HOST', 'DOCKER_CONTEXT', 'PYTHONPATH']))
    boot = plan['preview']['hostBootIdSha256']
    require(profile['identity']['bootIdSha256'] == boot and profile['identity']['jobSha256'] == plan['jobIdentitySha256'])
    expected = sorted([{k: row[k] for k in ['role', 'id', 'name', 'imageId']} for row in plan['containers']], key=lambda r:r['role'])
    require(sorted(context['containers'], key=lambda r:r['role']) == expected, 'SNAPSHOT_CONTAINERS_CHANGED')
    require(plan['preview']['executablePath'] == context['binaries']['node']['path'] and
            plan['preview']['executableSha256'] == context['binaries']['node']['sha256'])
    bootstrap_raw = read_file(runtime / 'bootstrap-input.json', private=True)
    require(digest(bootstrap_raw) == plan['bootstrapRequestSha256'])
    bootstrap = decode(bootstrap_raw)
    require(bootstrap['sourceRevision'] == plan['sourceRevision'] and bootstrap['instanceNonce'] == plan['instanceNonce'] and
            all(bootstrap[key] == plan[key] for key in ['toolchainSha256', 'operatorPackageManifestSha256']))
    package, installed = operator_package(source, plan['operatorPackageManifestSha256'])
    for name, raw in installed.items():
        require(read_file(runtime / name, private=True) == raw, 'SNAPSHOT_OPERATOR_CHANGED')
    toolchain(runtime.parent, plan['toolchainSha256'])
    suffix = plan['instanceNonce'][:12]
    require(context['generatorCgroupRelativePath'] == '/colorplaygenerator' + suffix + '.slice/workload' and
            context['backendCgroupRelativePath'] == '/colorplaybackend' + suffix + '.slice')
    return context, profile, installed


def copy_runtime(runtime, output, excluded, check):
    records, total = [], 0
    def unreadable(_error):raise SnapshotError('SNAPSHOT_RUNTIME_UNREADABLE')
    for parent, directories, names in os.walk(runtime, followlinks=False,onerror=unreadable):
        check()
        require(len(records) + len(names) <= MAX_FILES, 'SNAPSHOT_FILE_LIMIT')
        parent_path = Path(parent)
        info = parent_path.lstat()
        require(parent_path.resolve() == parent_path and stat.S_ISDIR(info.st_mode))
        require(info.st_uid == os.getuid(),'SNAPSHOT_RUNTIME_OWNER_UNKNOWN')
        records.append({'path':str(parent_path.relative_to(runtime)),'kind':'directory',
            'device':info.st_dev,'inode':info.st_ino,'mode':stat.S_IMODE(info.st_mode),'ownerUid':info.st_uid})
        target = None if output is None else output / parent_path.relative_to(runtime)
        if target is not None:target.mkdir(mode=0o700, parents=False, exist_ok=True)
        for name in sorted(directories):
            require(not any(ord(c)<32 or ord(c)==127 for c in name) and '\\' not in name,'SNAPSHOT_PATH_INVALID')
            child = parent_path / name
            require(stat.S_ISDIR(child.lstat().st_mode) and not child.is_symlink(), 'SNAPSHOT_FILE_TYPE_INVALID')
        for name in sorted(names):
            require(not any(ord(c)<32 or ord(c)==127 for c in name) and '\\' not in name,'SNAPSHOT_PATH_INVALID')
            original = parent_path / name
            relative = str(original.relative_to(runtime))
            fd = os.open(original, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                before = os.fstat(fd)
                require(before.st_uid == os.getuid(),'SNAPSHOT_RUNTIME_OWNER_UNKNOWN')
                require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
                        not before.st_mode & 0o022, 'SNAPSHOT_FILE_TYPE_INVALID')
                result = hashlib.sha256(); size = 0
                skip = relative in excluded
                destination = None if skip or target is None else os.open(target / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                try:
                    while chunk := os.read(fd, 65536):
                        check(); size += len(chunk); total += len(chunk)
                        require(total <= LIMIT, 'SNAPSHOT_SIZE_LIMIT'); result.update(chunk)
                        if destination is not None:
                            view = memoryview(chunk)
                            while view:
                                count = os.write(destination, view); require(count > 0); view = view[count:]
                    if destination is not None: os.fsync(destination)
                finally:
                    if destination is not None: os.close(destination)
                require(fingerprint(os.fstat(fd)) == fingerprint(before) and
                        fingerprint(original.lstat()) == fingerprint(before), 'SNAPSHOT_FILE_CHANGED')
                sha = result.hexdigest()
                require(not skip or sha == excluded[relative], 'SNAPSHOT_EXCLUSION_CHANGED')
                records.append({'path':relative, 'kind':'file','bytes':size, 'sha256':sha, 'device':before.st_dev,
                    'inode':before.st_ino, 'mode':stat.S_IMODE(before.st_mode), 'excludedPublicCode':skip})
            finally:
                os.close(fd)
    return records


def runtime_census(root, excluded, check):
    return copy_runtime(root,None,excluded,check)


def inventory(root, check):
    rows, total = [], 0
    for row in sorted(runtime_census(root,{},check),key=lambda r:r['path']):
        if row['kind']=='directory':continue
        require(row['mode']==0o600,'SNAPSHOT_STAGING_MODE_INVALID')
        total += row['bytes'] + 4096 + len(row['path'].encode())
        require(len(rows) < MAX_FILES and total + 10240 <= LIMIT, 'SNAPSHOT_SIZE_LIMIT')
        rows.append({k:row[k] for k in ['path','bytes','sha256']})
    return rows
