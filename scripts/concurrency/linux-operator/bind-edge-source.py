"""Restart owned Local Edge; bind reviewed auth or all tracked function sources."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from linux_runtime_common import require_linux, context, inspect_backend

RUNTIME = Path(__file__).resolve().parent
SOURCE = RUNTIME.parent.parent / 'colorplay-live-recovery'
CONTAINER = 'supabase_edge_runtime_cp-whole-site-261115'
ENV = {'PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1'}
ATTEMPT = None
REPORT = None


def run(args, **kwargs):
    return subprocess.run(args, env=ENV, capture_output=True, text=True,
                          timeout=30, **kwargs)


def docker(*args):
    result = run(['/usr/bin/docker','--host','unix:///var/run/docker.sock',*args])
    assert result.returncode == 0, 'OWNED_DOCKER_OPERATION_FAILED'
    return result.stdout


def frozen(sha):
    head = run(['git', 'rev-parse', 'HEAD'], cwd=SOURCE)
    clean = run(['git', 'status', '--porcelain'], cwd=SOURCE)
    return head.returncode == clean.returncode == 0 and head.stdout.strip() == sha and not clean.stdout.strip()


def write_once(path, value):
    with path.open('x') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.write('\n')


def source_manifest(scope):
    if scope == 'auth-login':
        paths = sorted((SOURCE / 'supabase/functions/auth-login').glob('*.ts'))
        assert 3 <= len(paths) <= 12, 'AUTH_SOURCE_SCOPE_UNEXPECTED'
    else:
        assert scope == 'all-functions', 'SOURCE_SCOPE_INVALID'
        tracked = run(['git', 'ls-files', '-z', '--', 'supabase/functions'], cwd=SOURCE)
        assert tracked.returncode == 0, 'TRACKED_SOURCE_LIST_FAILED'
        paths = [SOURCE / name for name in tracked.stdout.split('\0') if name]
        assert 20 <= len(paths) <= 200, 'FUNCTION_SOURCE_SCOPE_UNEXPECTED'
    root = (SOURCE / 'supabase/functions').resolve()
    expected = {}
    for path in paths:
        assert path.is_file() and not path.is_symlink(), 'FUNCTION_SOURCE_NOT_REGULAR'
        assert path.resolve().is_relative_to(root), 'FUNCTION_SOURCE_OUTSIDE_ROOT'
        relative = path.relative_to(root).as_posix()
        assert relative not in expected and '\n' not in relative, 'FUNCTION_SOURCE_PATH_INVALID'
        assert not path.name.startswith('.env'), 'FUNCTION_SECRET_PATH_REJECTED'
        expected[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return dict(sorted(expected.items()))


def main():
    global ATTEMPT, REPORT
    require_linux()
    ctx=context();inspect_backend(ctx)
    sha = sys.argv[1]
    scope = sys.argv[2] if len(sys.argv) == 3 else 'auth-login'
    assert len(sys.argv) in (2, 3) and scope in ('auth-login', 'all-functions'), 'SOURCE_SCOPE_INVALID'
    assert re.fullmatch('[a-f0-9]{40}', sha), 'EXACT_SHA_REQUIRED'
    review = json.loads((RUNTIME / 'reviewed-candidate.json').read_text())
    assert review['result'] == 'ACCEPTED_FOR_LOCAL_VALIDATION'
    assert review['sourceRevision'] == sha, 'SOURCE_NOT_REVIEWED'
    assert frozen(sha), 'SOURCE_NOT_FROZEN'
    owner = json.loads((RUNTIME / 'ownership.json').read_text())
    state = json.loads((RUNTIME / 'status-secret.json').read_text())
    assert owner['projectId'] == 'cp-whole-site-261115'
    assert state['API_URL'] == owner['apiUrl'] == 'http://127.0.0.1:58321'
    ATTEMPT = RUNTIME / ('edge-bind-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    ATTEMPT.mkdir(mode=0o700)
    REPORT = {'sourceRevision': sha, 'projectId': owner['projectId'],
              'result': 'NOT_RUN', 'sourceScope': scope, 'authIdentitiesCreated': 0,
              'loginGrantAttempted': False, 'capacityRun': False,
              'hostedAccess': False, 'rawLogsStored': False}
    write_once(ATTEMPT / 'request.json', REPORT)
    assert next(row for row in ctx['containers'] if row['role']=='edge_runtime')['name']=='/'+CONTAINER,'EDGE_CONTAINER_UNBOUND'
    mounts = json.loads(docker('inspect', '--format', '{{json .Mounts}}', CONTAINER))
    target = str(RUNTIME / 'local-project/supabase/functions')
    assert len([mount for mount in mounts if mount.get('Type') == 'bind'
                and mount.get('Destination') == target and mount.get('RW') is False]) == 1, 'OWNED_SOURCE_MOUNT_MISMATCH'
    expected = source_manifest(scope)
    output = docker('exec', CONTAINER, 'sha256sum',
                    *[target + '/' + relative for relative in expected])
    actual = {}
    for line in output.splitlines():
        digest, pathname = line.split(maxsplit=1)
        assert re.fullmatch('[a-f0-9]{64}', digest), 'SOURCE_HASH_INVALID'
        assert pathname.startswith(target + '/'), 'RUNTIME_HASH_PATH_INVALID'
        relative = pathname[len(target) + 1:]
        assert relative not in actual, 'DUPLICATE_RUNTIME_HASH'
        actual[relative] = digest
    assert actual == expected, 'FUNCTION_RUNTIME_HASH_MISMATCH'
    REPORT['runtimeSourceHashes'] = expected
    REPORT['runtimeSourceFileCount'] = len(expected)
    REPORT['probes'] = []
    for label, body, status, code in [
        ('null_json', b'null', 400, 'INVALID_JSON'),
        ('nonexistent_owned_synthetic_account', json.dumps({
            'account': 'synthetic01', 'password': 'synthetic-password',
            'portal': 'student'}).encode(), 401, 'AUTH_INVALID_CREDENTIALS'),
    ]:
        request = urllib.request.Request(state['API_URL'] + '/functions/v1/auth-login',
                    data=body, method='POST', headers={
                        'apikey': state['ANON_KEY'],
                        'Authorization': 'Bearer ' + state['ANON_KEY'],
                        'Content-Type': 'application/json'})
        started = time.monotonic()
        try:
            response = urllib.request.urlopen(request, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            payload = json.load(response)
            REPORT['probes'].append({
                'case': label, 'status': response.status,
                'elapsedMs': round((time.monotonic() - started) * 1000),
                'safeBodyMatched': payload == {'error': code},
                'passed': response.status == status and payload == {'error': code}})
    inspect_backend(ctx)
    REPORT['sourceStillFrozen'] = frozen(sha)
    passed = all(probe['passed'] for probe in REPORT['probes']) and REPORT['sourceStillFrozen']
    REPORT['result'] = 'LOCAL_EDGE_SOURCE_BOUND' if passed else 'LOCAL_EDGE_PROBE_FAILED'
    write_once(ATTEMPT / 'result.json', REPORT)
    print(json.dumps(REPORT))
    return 0 if passed else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        result = dict(REPORT or {}, result='LOCAL_EDGE_BIND_BLOCKED',
                      errorClass=type(error).__name__, rawLogsStored=False)
        if ATTEMPT and not (ATTEMPT / 'result.json').exists():
            write_once(ATTEMPT / 'result.json', result)
        print(json.dumps(result))
        raise SystemExit(1) from None
