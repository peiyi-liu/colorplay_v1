"""One CLI-only failure capture; no backend or Native admission authority."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys

ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = 'peiyi-liu/colorplay_v1'
BRANCH = 'refs/heads/codex/local-chapter-map-diagnostic-20261119'
WORKFLOW = '.github/workflows/local-chapter-map-diagnostic.yml'
RECIPIENT = 'age1aslp3c6jwkpyzndmq9wuctkl3v4y5u6mywalc8lc73lt5dq9recq5mghpw'
RECIPIENT_SHA = 'e641774024f5d252f3636273f1d7f47e1aec4be85fc82ca7afe3008c4582a1e0'
STREAM_LIMIT = 65536
ARTIFACT_LIMIT = 262144
FOLDER = 'chapter-map-cli-failure'


def need(value):
    if not value:
        raise ValueError('CLI_FAILURE_EXPORT_UNAVAILABLE')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def decode(raw):
    def pairs(rows):
        result = {}
        for key, value in rows:
            need(key not in result)
            result[key] = value
        return result
    def invalid(_value):
        raise ValueError('CLI_FAILURE_EXPORT_UNAVAILABLE')
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)


def context(environment):
    need(environment.get('GITHUB_REPOSITORY') == REPOSITORY)
    need(environment.get('GITHUB_REF') == BRANCH and environment.get('GITHUB_JOB') == 'chapter-map-diagnostic')
    need(environment.get('GITHUB_WORKFLOW_REF') == REPOSITORY + '/' + WORKFLOW + '@' + BRANCH)
    need(environment.get('GITHUB_RUN_ATTEMPT') == '1')
    source, run = environment.get('GITHUB_SHA', ''), environment.get('GITHUB_RUN_ID', '')
    need(re.fullmatch('[a-f0-9]{40}', source) and re.fullmatch('[1-9][0-9]{0,19}', run))
    return {'sourceRevision': source, 'runId': int(run), 'attempt': 1}


def directory(path):
    info = path.lstat()
    need(path.is_absolute() and path.resolve() == path and stat.S_ISDIR(info.st_mode))
    need(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700)


def write_once(path, raw):
    directory(path.parent)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)


def read_fixed(folder, name, maximum):
    need(name in ('receipt.json', 'command-output.age'))
    directory(folder)
    fd = os.open(folder / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1)
        need(stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= maximum)
        raw = stream.read(maximum + 1)
        need(len(raw) == info.st_size <= maximum)
        return raw


def manifest(binding, code, stdout, stderr, clean_after):
    need(type(code) is int and -255 <= code <= 255 and code != 0)
    need(type(stdout) is bytes and type(stderr) is bytes and len(stdout) + len(stderr) <= STREAM_LIMIT)
    need(type(clean_after) is bool)
    return {'schemaVersion': 1, 'kind': 'LOCAL_CLI_PREFLIGHT_FAILURE', 'executionAuthority': 'NONE',
            'cannotClearNativeGate': True, **binding, 'stage': 'PREFLIGHT', 'operation': 'SUPABASE_VERSION',
            'exitCode': code, 'captureComplete': True, 'controlChildExitObserved': True,
            'backendStartedByTool': False, 'terminationUnknown': True,
            'gitCleanBefore': True, 'gitCleanAfter': clean_after,
            'stdoutBytes': len(stdout), 'stdoutSha256': digest(stdout),
            'stderrBytes': len(stderr), 'stderrSha256': digest(stderr), 'recipientSha256': RECIPIENT_SHA}


def validate_receipt(value, binding, cipher):
    fixed = {'schemaVersion': 1, 'kind': 'LOCAL_CLI_PREFLIGHT_FAILURE', 'executionAuthority': 'NONE',
             'cannotClearNativeGate': True, **binding, 'stage': 'PREFLIGHT', 'operation': 'SUPABASE_VERSION',
             'captureComplete': True, 'controlChildExitObserved': True, 'backendStartedByTool': False,
             'terminationUnknown': True, 'gitCleanBefore': True, 'recipientSha256': RECIPIENT_SHA}
    additional = {'exitCode', 'gitCleanAfter', 'stdoutBytes', 'stdoutSha256', 'stderrBytes', 'stderrSha256', 'cipherBytes', 'cipherSha256'}
    need(type(value) is dict and set(value) == set(fixed) | additional)
    for key, expected in fixed.items():
        need(type(value[key]) is type(expected) and value[key] == expected)
    need(type(value['exitCode']) is int and -255 <= value['exitCode'] <= 255 and value['exitCode'] != 0)
    need(type(value['gitCleanAfter']) is bool)
    for key in ('stdoutBytes', 'stderrBytes'):
        need(type(value[key]) is int and 0 <= value[key] <= STREAM_LIMIT)
    need(value['stdoutBytes'] + value['stderrBytes'] <= STREAM_LIMIT)
    for key in ('stdoutSha256', 'stderrSha256', 'cipherSha256'):
        need(type(value[key]) is str and re.fullmatch('[a-f0-9]{64}', value[key]))
    need(type(cipher) is bytes and cipher.startswith(b'age-encryption.org/v1\n'))
    need(type(value['cipherBytes']) is int and value['cipherBytes'] == len(cipher) and digest(cipher) == value['cipherSha256'])
    raw = json.dumps(value, allow_nan=False, separators=(',', ':')).encode()
    need(len(raw) + len(cipher) <= ARTIFACT_LIMIT)
    return raw


def capture(environment, bounded, node, pnpm):
    binding = context(environment)
    parent = Path(environment['RUNNER_TEMP'])
    need(parent.is_absolute() and parent.resolve() == parent)
    private = parent / FOLDER
    private.mkdir(mode=0o700)
    directory(private)
    need(type(node) is str and type(pnpm) is str and Path(node).is_absolute() and Path(pnpm).is_absolute())
    command_env = {'PATH': str(Path(node).parent) + ':/usr/bin:/bin'}
    def call(args, timeout=30, maximum=65536, data=None):
        return bounded(args, ROOT, data=data, env=command_env, timeout=timeout, maximum=maximum, checked=False, capture_stderr=True)
    code, out, _ = call(['/usr/bin/git', 'rev-parse', 'HEAD'])
    need(code == 0 and out.decode().strip() == binding['sourceRevision'])
    code, out, _ = call(['/usr/bin/git', 'status', '--porcelain'])
    need(code == 0 and not out.strip())
    code, out, _ = call([node, '--version'])
    need(code == 0 and out.strip() == b'v24.13.1')
    complete = False
    try:
        code, stdout, stderr = call([pnpm, 'exec', 'supabase', '--version'], timeout=60, maximum=4194304)
        complete = True
    except Exception:
        code, stdout, stderr = None, None, None
    git_code, git_out, _ = call(['/usr/bin/git', 'status', '--porcelain'])
    need(git_code == 0)
    clean_after = not git_out.strip()
    if not complete:
        print(json.dumps({'kind': 'CLI_CAPTURE_UNAVAILABLE', 'captureComplete': False,
                          'exitCode': None, 'stdoutBytes': None, 'stderrBytes': None,
                          'terminationUnknown': True, 'gitCleanAfter': clean_after}))
        return 1
    if code == 0:
        need(stdout.strip() == b'2.109.1')
        print(json.dumps({'kind': 'CLI_VERSION_COMMAND_SUCCEEDED', 'gitCleanAfter': clean_after,
                          'executionAuthority': 'NONE', 'cannotClearNativeGate': True}))
        return 0 if clean_after else 1
    safe = manifest(binding, code, stdout, stderr, clean_after)
    write_once(private / 'stdout-private.bin', stdout)
    write_once(private / 'stderr-private.bin', stderr)
    plain = json.dumps({'manifest': safe, 'stdoutBase64': base64.b64encode(stdout).decode('ascii'),
                        'stderrBase64': base64.b64encode(stderr).decode('ascii')}, allow_nan=False, separators=(',', ':')).encode()
    need(digest(RECIPIENT.encode()) == RECIPIENT_SHA)
    age_code, cipher, _ = call(['/usr/bin/age', '--encrypt', '--recipient', RECIPIENT], timeout=30, maximum=ARTIFACT_LIMIT, data=plain)
    need(age_code == 0)
    receipt = {**safe, 'cipherBytes': len(cipher), 'cipherSha256': digest(cipher)}
    raw = validate_receipt(receipt, binding, cipher)
    public = private / 'public'
    public.mkdir(mode=0o700)
    write_once(public / 'command-output.age', cipher)
    write_once(public / 'receipt.json', raw)
    print(json.dumps(receipt, separators=(',', ':')))
    return 1  # Cipher evidence never turns the original CLI failure into success.


def validate_artifact(environment):
    binding = context(environment)
    parent = Path(environment['RUNNER_TEMP'])
    need(parent.is_absolute() and parent.resolve() == parent)
    private = parent / FOLDER
    directory(private)
    public = private / 'public'
    if not public.exists():
        return False
    cipher = read_fixed(public, 'command-output.age', ARTIFACT_LIMIT)
    raw = read_fixed(public, 'receipt.json', ARTIFACT_LIMIT)
    value = decode(raw)
    validate_receipt(value, binding, cipher)
    need(len(raw) + len(cipher) <= ARTIFACT_LIMIT)
    return True



DRIVER_FOLDER = 'chapter-map-diagnostic'
DRIVER_FILES = ('outcome-private.json', 'diagnostic-context-private.json', 'control-failure-private.json', 'first-command-stdout-private.bin', 'first-command-stderr-private.bin')
DRIVER_FILE_LIMIT = 4 * 1024**2
DRIVER_PLAIN_LIMIT = 8 * 1024**2
DRIVER_ARTIFACT_LIMIT = 12 * 1024**2


def read_driver_leaf(folder, name):
    need(name in (*DRIVER_FILES, 'receipt.json', 'diagnostic-output.age'))
    directory(folder)
    fd = os.open(folder / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        maximum = DRIVER_ARTIFACT_LIMIT if name == 'diagnostic-output.age' else DRIVER_FILE_LIMIT
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1)
        need(stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= maximum)
        raw = stream.read(maximum + 1)
        need(len(raw) == info.st_size <= maximum)
        return raw


def validate_driver_inputs(files, binding):
    outcome = decode(files['outcome-private.json'])
    diagnostic = decode(files['diagnostic-context-private.json'])
    allowed = {'schemaVersion', 'kind', 'executionAuthority', 'fixtureHistory', 'nativeHistoryEquivalent', 'cannotClearNativeGate', 'sourceRevision', 'collection', 'stage', 'resourceFacts', 'versions', 'settings', 'fixtureCounts', 'batches', 'plans', 'resourcesClosed', 'controlCommandFailure', 'terminationUnknown', 'shutdown'}
    need(type(outcome) is dict and set(outcome) == allowed)
    need(outcome['sourceRevision'] == binding['sourceRevision'] and outcome['kind'] == 'LOCAL_CHAPTER_MAP_DIAGNOSTIC' and outcome['executionAuthority'] == 'NONE')
    need(type(diagnostic) is dict and set(diagnostic) == {'sourceRevision', 'stage', 'primaryCompleted', 'primaryException', 'cleanupException', 'publicationException', 'postFailureInspect'})
    need(outcome['collection'] == 'UNAVAILABLE' or outcome['resourcesClosed'] is False or outcome['controlCommandFailure'] is True or diagnostic['publicationException'] is not None)
    need(diagnostic['sourceRevision'] == binding['sourceRevision'] and type(diagnostic['primaryCompleted']) is bool)
    for key in ('primaryException', 'cleanupException', 'publicationException'):
        item = diagnostic[key]
        need(item is None or type(item) is dict and set(item) == {'stage', 'errorClass', 'code', 'frames', 'truncated'})
    need(type(diagnostic['postFailureInspect']) is dict and set(diagnostic['postFailureInspect']) == {'collection', 'rows'})


def driver_folder(environment):
    parent = Path(environment['RUNNER_TEMP'])
    need(parent.is_absolute() and parent.resolve() == parent)
    folder = parent / DRIVER_FOLDER
    directory(folder)
    return folder


def validate_driver_receipt(value, binding, cipher):
    fixed = {'schemaVersion': 1, 'kind': 'LOCAL_RPC_DIAGNOSTIC_FAILURE', 'executionAuthority': 'NONE', 'cannotClearNativeGate': True, **binding, 'recipientSha256': RECIPIENT_SHA}
    additional = {'fileCount', 'payloadBytes', 'payloadSha256', 'cipherBytes', 'cipherSha256'}
    need(type(value) is dict and set(value) == set(fixed) | additional)
    for key, expected in fixed.items():need(type(value[key]) is type(expected) and value[key] == expected)
    need(type(value['fileCount']) is int and 2 <= value['fileCount'] <= 5)
    need(type(value['payloadBytes']) is int and 0 < value['payloadBytes'] <= DRIVER_PLAIN_LIMIT)
    for key in ('payloadSha256', 'cipherSha256'):need(type(value[key]) is str and re.fullmatch('[a-f0-9]{64}', value[key]))
    need(type(cipher) is bytes and cipher.startswith(b'age-encryption.org/v1\n'))
    need(type(value['cipherBytes']) is int and value['cipherBytes'] == len(cipher) and digest(cipher) == value['cipherSha256'])
    raw = json.dumps(value, allow_nan=False, separators=(',', ':')).encode()
    need(len(raw) + len(cipher) <= DRIVER_ARTIFACT_LIMIT)
    return raw


def export_driver_failure(environment, bounded):
    binding = context(environment)
    folder = driver_folder(environment)
    files = {}
    for index, name in enumerate(DRIVER_FILES):
        try:files[name] = read_driver_leaf(folder, name)
        except FileNotFoundError:
            need(index >= 2)
    need(sum(len(raw) for raw in files.values()) <= DRIVER_PLAIN_LIMIT)
    validate_driver_inputs(files, binding)
    manifest = {'schemaVersion': 1, 'kind': 'LOCAL_RPC_DIAGNOSTIC_FAILURE', 'executionAuthority': 'NONE', 'cannotClearNativeGate': True, **binding, 'recipientSha256': RECIPIENT_SHA, 'fileCount': len(files)}
    entries = [{'leaf': name, 'bytes': len(raw), 'sha256': digest(raw), 'base64': base64.b64encode(raw).decode('ascii')} for name, raw in files.items()]
    plain = json.dumps({'manifest': manifest, 'files': entries}, allow_nan=False, separators=(',', ':')).encode()
    need(len(plain) <= DRIVER_PLAIN_LIMIT and digest(RECIPIENT.encode()) == RECIPIENT_SHA)
    code, cipher, _ = bounded(['/usr/bin/age', '--encrypt', '--recipient', RECIPIENT], ROOT, data=plain, timeout=30, maximum=DRIVER_ARTIFACT_LIMIT, checked=False, capture_stderr=True)
    need(code == 0)
    receipt = {**manifest, 'payloadBytes': len(plain), 'payloadSha256': digest(plain), 'cipherBytes': len(cipher), 'cipherSha256': digest(cipher)}
    raw = validate_driver_receipt(receipt, binding, cipher)
    public = folder / 'failure-public'
    public.mkdir(mode=0o700)
    write_once(public / 'diagnostic-output.age', cipher)
    write_once(public / 'receipt.json', raw)
    print(json.dumps(receipt, separators=(',', ':')))
    return 0


def validate_driver_failure(environment):
    binding = context(environment)
    public = driver_folder(environment) / 'failure-public'
    if not public.exists():return False
    cipher = read_driver_leaf(public, 'diagnostic-output.age')
    raw = read_driver_leaf(public, 'receipt.json')
    validate_driver_receipt(decode(raw), binding, cipher)
    need(len(raw) + len(cipher) <= DRIVER_ARTIFACT_LIMIT)
    return True


def main():
    if sys.argv[1:] in (['--capture'], ['--export-driver-failure']):
        sys.path.insert(0, str(ROOT / 'scripts/concurrency'))
        spec = importlib.util.spec_from_file_location('original_native_io', ROOT / 'scripts/concurrency/linux-local-bootstrap.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if sys.argv[1:] == ['--export-driver-failure']:
            return export_driver_failure(os.environ, module.bounded)
        return capture(os.environ, module.bounded, shutil.which('node'), shutil.which('pnpm'))
    if sys.argv[1:] == ['--validate-driver-failure']:
        allowed = validate_driver_failure(os.environ)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            stream.write('driver_failure_artifact=' + ('true' if allowed else 'false') + '\n')
        return 0
    if sys.argv[1:] == ['--validate']:
        allowed = validate_artifact(os.environ)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            stream.write('failure_artifact=' + ('true' if allowed else 'false') + '\n')
        return 0
    return 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('CLI_FAILURE_EXPORT_UNAVAILABLE')
        sys.exit(1)
