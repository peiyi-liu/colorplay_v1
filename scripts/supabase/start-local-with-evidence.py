"""One unchanged Local start; bounded private evidence only on failure."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import stat
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
COMMAND = ['pnpm', 'exec', 'supabase', 'start']
CAPTURE_LIMIT = 8 * 1024 * 1024
CIPHER_LIMIT = 12 * 1024 * 1024
OUTPUT = ROOT / 'artifacts/ci-local-start/start-failure.age'
RECIPIENT_FILE = ROOT / 'scripts/concurrency/local-export-recipient.json'


def _public(value):
    try:
        print(json.dumps(value, sort_keys=True), flush=True)
    except OSError:
        pass


def _context():
    raw = subprocess.check_output(['git', 'rev-parse', '--verify', 'HEAD'], stderr=subprocess.DEVNULL)
    if not re.fullmatch(rb'[a-f0-9]{40}\n', raw):
        raise ValueError('CONTEXT')
    result = {'checkoutSha': raw.decode().strip(), 'sourceHeadSha': None,
              'eventSha': None, 'runId': None, 'attempt': None, 'job': None,
              'numericJobId': 'UNOBSERVED'}
    for key, field in [('LOCAL_START_SOURCE_HEAD', 'sourceHeadSha'), ('GITHUB_SHA', 'eventSha')]:
        value = os.environ.get(key)
        if value is not None:
            if not re.fullmatch(r'[a-f0-9]{40}', value):
                raise ValueError('CONTEXT')
            result[field] = value
    for key, field in [('GITHUB_RUN_ID', 'runId'), ('GITHUB_RUN_ATTEMPT', 'attempt')]:
        value = os.environ.get(key)
        if value is not None:
            if not re.fullmatch(r'[1-9][0-9]{0,15}', value) or int(value) > 9007199254740991:
                raise ValueError('CONTEXT')
            result[field] = int(value)
    job = os.environ.get('GITHUB_JOB')
    if job is not None and job not in ('local-database', 'chromium-e2e'):
        raise ValueError('CONTEXT')
    result['job'] = job
    result['qualification'] = 'ACTUAL_CHECKOUT_SEPARATE_FROM_DECLARED_PR_HEAD_NOT_PLATFORM_ATTESTATION'
    return result


def _recipient():
    raw = RECIPIENT_FILE.read_bytes()
    if len(raw) > 4096:
        raise ValueError('RECIPIENT')
    value = json.loads(raw)
    if set(value) != {'schemaVersion', 'recipient', 'privateIdentityUploaded'} or value['schemaVersion'] != 1 or value['privateIdentityUploaded'] is not False:
        raise ValueError('RECIPIENT')
    recipient = value['recipient']
    if type(recipient) is not str or not re.fullmatch(r'age1[a-z0-9]{58}', recipient):
        raise ValueError('RECIPIENT')
    return recipient


def _drain(child):
    streams = {name: {'hash': hashlib.sha256(), 'bytes': 0, 'capture': bytearray()}
               for name in ('stdout', 'stderr')}
    retained = 0
    with selectors.DefaultSelector() as selector:
        for name in streams:
            selector.register(getattr(child, name), selectors.EVENT_READ, name)
        while selector.get_map():
            for key, _ in selector.select():
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                value = streams[key.data]
                value['bytes'] += len(chunk)
                value['hash'].update(chunk)
                take = min(len(chunk), CAPTURE_LIMIT - retained)
                value['capture'].extend(chunk[:take])
                retained += take
    return {name: {'bytes': value['bytes'], 'sha256': value['hash'].hexdigest(),
                   'capturedBytes': len(value['capture']),
                   'truncated': value['bytes'] > len(value['capture']),
                   'captureBase64': base64.b64encode(value['capture']).decode('ascii')}
            for name, value in streams.items()}


def _encrypt(envelope, destination, recipient):
    result = subprocess.run(['age', '--encrypt', '--recipient', recipient,
                             '--output', str(destination), str(envelope)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode != 0:
        raise ValueError('ENCRYPTION')


def _private_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        os.fchmod(output.fileno(), 0o600)
        output.write(data)


def _publish(path):
    data = path.read_bytes()
    if not 0 < len(data) <= CIPHER_LIMIT:
        raise ValueError('CIPHER_BOUND')
    for parent in [ROOT / 'artifacts', OUTPUT.parent]:
        if parent.is_symlink():
            raise ValueError('OUTPUT_PATH')
        parent.mkdir(mode=0o700, exist_ok=True)
    info = OUTPUT.parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('OUTPUT_PATH')
    try:
        _private_write(OUTPUT, data)
    except FileExistsError:
        raise ValueError('OUTPUT_EXISTS') from None
    return len(data), hashlib.sha256(data).hexdigest()


def _ready_output():
    target = os.environ.get('GITHUB_OUTPUT')
    if target:
        fd = os.open(target, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
        with os.fdopen(fd, 'w') as output:
            output.write('local_start_cipher=true\n')


def run_start():
    child_started = False
    streams = {name: {'bytes': 0, 'sha256': hashlib.sha256(b'').hexdigest(),
                      'capturedBytes': 0, 'truncated': False, 'captureBase64': ''}
               for name in ('stdout', 'stderr')}
    try:
        child = subprocess.Popen(COMMAND, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        child_started = True
    except FileNotFoundError:
        code = 127
    except OSError:
        code = 126
    else:
        streams = _drain(child)
        original = child.wait()
        code = original if original >= 0 else 128 - original
    if code == 0:
        _public({'status': 'LOCAL_START_SUCCEEDED', 'exitCode': 0})
        return 0
    status = 'UNAVAILABLE'
    temporary = None
    facts = {'status': status, 'exitCode': code, 'childStarted': child_started,
             'childExitObserved': child_started, 'captureComplete': True,
             'descendantClosure': 'UNOBSERVED'}
    try:
        context = _context()
        recipient = _recipient()
        temporary = tempfile.TemporaryDirectory(prefix='colorplay-local-start-')
        private = Path(temporary.name)
        os.chmod(private, 0o700)
        envelope = {'schemaVersion': 1, 'kind': 'LOCAL_START_FAILURE', 'authority': 'NONE',
                    'context': context, 'exitCode': code, 'childStarted': child_started,
                    'childExitObserved': child_started, 'captureComplete': True,
                    'descendantClosure': 'UNOBSERVED', 'streams': streams,
                    'captureLimitBytes': CAPTURE_LIMIT}
        plain = private / 'envelope.json'
        _private_write(plain, json.dumps(envelope, sort_keys=True).encode())
        cipher = private / 'failure.age'
        _encrypt(plain, cipher, recipient)
        cipher.chmod(0o600)
        length, digest = _publish(cipher)
        _ready_output()
        status = 'ENCRYPTED'
        facts.update(cipherBytes=length, cipherSha256=digest)
    except Exception:
        # No raw fallback, error string, environment, or child output is public.
        pass
    finally:
        if temporary is not None:
            try:
                temporary.cleanup()
            except OSError:
                status = 'UNAVAILABLE'
    facts['status'] = status
    _public(facts)
    return code


if __name__ == '__main__':
    if len(sys.argv) != 1:
        _public({'status': 'UNAVAILABLE', 'stage': 'ARGUMENTS'})
        raise SystemExit(2)
    raise SystemExit(run_start())
