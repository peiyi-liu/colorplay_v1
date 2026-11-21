"""Build and expose only a clean, explicitly reviewed owned Local candidate.

No fixture creation, hosted traffic, dependency installation, or raw log output.
Call with a 40-character reviewed source SHA. Each activation retains receipts.
"""

import gzip
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request
from linux_runtime_common import require_linux, context, private_json, verify_executables, host_listeners
from linux_proc import parse_stat
from linux_cgroup import read_text

RUNTIME = Path(__file__).resolve().parent
SOURCE = RUNTIME.parent.parent / 'colorplay-live-recovery'
NODE = None
BASE_ENV = {'PATH':'/usr/bin:/bin','SUPABASE_TELEMETRY_DISABLED':'1','PYTHONDONTWRITEBYTECODE':'1'}
ACTIVATION_ATTEMPT = None
ACTIVATION_SHA = None


def write_once(path, value):
    with path.open('x') as stream:
        os.chmod(path, 0o600)
        json.dump(value, stream, indent=2)
        stream.write('\n')


def git(*args):
    return subprocess.check_output(
        ['git', *args], cwd=SOURCE, env=BASE_ENV, text=True).strip()


def unchanged(sha):
    assert git('rev-parse', 'HEAD') == sha, 'SOURCE_REVISION_CHANGED'
    assert not git('status', '--porcelain'), 'SOURCE_NOT_CLEAN'


def runtime_private_values(value):
    assert isinstance(value, dict) and set(value) == {'hmacSecret', 'signingKey'}, 'RUNTIME_SECRET_SCHEMA_INVALID'
    key = value['signingKey']
    assert isinstance(key, dict), 'RUNTIME_SIGNING_KEY_INVALID'
    secrets = [value['hmacSecret'], key.get('d')]
    assert all(isinstance(item, str) and len(item) >= 32 for item in secrets), 'RUNTIME_PRIVATE_MATERIAL_INVALID'
    return [item.encode() for item in secrets]


def main():
    global ACTIVATION_ATTEMPT, ACTIVATION_SHA, NODE, BASE_ENV
    require_linux()
    ctx=context();verify_executables(ctx,full_hash=True)
    NODE=ctx['binaries']['node']['path']
    BASE_ENV={**BASE_ENV,'PATH':str(Path(NODE).parent)+':/usr/bin:/bin','HOME':str(Path.home())}
    sha = sys.argv[1]
    assert re.fullmatch('[a-f0-9]{40}', sha), 'EXACT_SHA_REQUIRED'
    ACTIVATION_SHA = sha
    reviewed = json.loads((RUNTIME / 'reviewed-candidate.json').read_text())
    assert reviewed.get('result') == 'ACCEPTED_FOR_LOCAL_VALIDATION'
    assert reviewed.get('sourceRevision') == sha, 'SOURCE_NOT_REVIEWED'
    owner = json.loads((RUNTIME / 'ownership.json').read_text())
    state = json.loads((RUNTIME / 'status-secret.json').read_text())
    assert owner['projectId'] == 'cp-whole-site-261115'
    assert owner['apiUrl'] == state['API_URL'] == 'http://127.0.0.1:58321'
    assert owner['appUrl'] == 'http://127.0.0.1:58373'
    assert not (RUNTIME / 'active-preview.json').exists(), 'OWNED_PREVIEW_NOT_RELEASED'
    unchanged(sha)
    assert not any((SOURCE / name).exists() for name in [
        '.env', '.env.local', '.env.production', '.env.production.local']), 'UNREVIEWED_DOTENV_BUILD_INPUT'
    attempt = RUNTIME / ('activation-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    attempt.mkdir(mode=0o700)
    ACTIVATION_ATTEMPT = attempt
    write_once(attempt / 'request.json', {
        'sourceRevision': sha, 'projectId': owner['projectId'],
        'apiUrl': owner['apiUrl'], 'appUrl': owner['appUrl'],
        'reviewReceiptSha256': hashlib.sha256((RUNTIME / 'reviewed-candidate.json').read_bytes()).hexdigest(),
        'rawLogsStored': False, 'fixturesCreated': False,
    })
    env = dict(BASE_ENV, COLORPLAY_DEPLOYMENT_ENVIRONMENT='local',
               VITE_SUPABASE_URL=state['API_URL'],
               VITE_SUPABASE_ANON_KEY=state['ANON_KEY'])
    started = time.monotonic()
    build = subprocess.run(
        [NODE,str(RUNTIME.parent/'tools/pnpm/bin/pnpm.cjs'),'--config.verify-deps-before-run=false','build','--manifest'],
        cwd=SOURCE, env=env, capture_output=True, timeout=180)
    if build.returncode:
        result = {'result': 'BUILD_FAILED', 'exitCode': build.returncode,
                  'rawLogsStored': False, 'sourceRevision': sha}
        write_once(attempt / 'result.json', result)
        print(json.dumps(result))
        return 1
    unchanged(sha)
    marker = json.loads((SOURCE / 'dist/admin-release.json').read_text())
    assert marker == {'environment': 'local', 'revision': sha}, 'BUILD_MARKER_MISMATCH'
    # Include every private runtime key and any later owned fixture credentials.
    private = [state[key].encode() for key in [
        'SERVICE_ROLE_KEY', 'SECRET_KEY', 'JWT_SECRET', 'S3_PROTOCOL_ACCESS_KEY_SECRET']
        if isinstance(state.get(key), str) and len(state[key]) >= 12]
    private.extend(runtime_private_values(json.loads(
        (RUNTIME / 'runtime-secret.json').read_text())))
    fixtures = RUNTIME / 'fixture-secrets.json'
    if fixtures.exists():
        def collect(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key.lower() in ['password', 'access_token', 'refresh_token', 'totp_secret']:
                        assert isinstance(item, str) and len(item) >= 8
                        private.append(item.encode())
                    else:
                        collect(item)
            elif isinstance(value, list):
                for item in value:
                    collect(item)
        collect(json.loads(fixtures.read_text()))
    files, js_gzip = {}, 0
    local_url_files, public_key_files, hosted_supabase_hosts = [], [], set()
    forbidden_role_tokens, modern_secret_markers = 0, 0
    for path in sorted((SOURCE / 'dist').rglob('*')):
        if not path.is_file():
            continue
        data = path.read_bytes()
        assert not any(secret in data for secret in private), 'PRIVATE_VALUE_IN_ARTIFACT'
        modern_secret_markers += len(re.findall(rb'sb_secret_[A-Za-z0-9_-]{20,}', data))
        for token in re.findall(rb'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}', data):
            try:
                claims = token.split(b'.')[1]
                payload = json.loads(base64.urlsafe_b64decode(claims + b'=' * (-len(claims) % 4)))
                if isinstance(payload, dict) and payload.get('role') in ['service_role', 'supabase_admin']:
                    forbidden_role_tokens += 1
            except (ValueError, UnicodeDecodeError):
                pass
        files[str(path.relative_to(SOURCE / 'dist'))] = hashlib.sha256(data).hexdigest()
        if path.suffix == '.js':
            js_gzip += len(gzip.compress(data, mtime=0))
            if state['API_URL'].encode() in data:
                local_url_files.append(str(path.relative_to(SOURCE / 'dist')))
            if state['ANON_KEY'].encode() in data:
                public_key_files.append(str(path.relative_to(SOURCE / 'dist')))
            hosted_supabase_hosts.update(re.findall(
                rb'https://[a-z0-9-]+\.supabase\.co\b', data))
    assert local_url_files and public_key_files, 'EXPECTED_LOCAL_PUBLIC_CONFIG_ABSENT'
    assert not hosted_supabase_hosts, 'HOSTED_SUPABASE_URL_IN_LOCAL_BUILD'
    assert forbidden_role_tokens == modern_secret_markers == 0, 'PRIVATE_CREDENTIAL_MARKER_IN_ARTIFACT'
    manifest = {
        'sourceRevision': sha, 'projectId': owner['projectId'], 'files': files,
        'publicKeySha256': hashlib.sha256(state['ANON_KEY'].encode()).hexdigest(),
        'localUrlFoundInFiles': local_url_files,
        'expectedPublicKeyFoundInFiles': public_key_files,
        'hostedSupabaseUrlCount': len(hosted_supabase_hosts),
        'forbiddenRoleTokenCount': forbidden_role_tokens,
        'modernSecretMarkerCount': modern_secret_markers,
        'unreviewedDotenvBuildInputsAbsent': True,
        'privateValuesAbsent': True, 'allJsFilesGzipBytes': js_gzip,
        'initialRouteGzipMeasured': False, 'elapsedSeconds': round(time.monotonic()-started, 3),
        'capacityTestRun': False,
    }
    write_once(attempt / 'build-manifest.json', manifest)
    args = [NODE, str(SOURCE / 'node_modules/vite/bin/vite.js'), 'preview',
            '--host', '127.0.0.1', '--port', '58373', '--strictPort']
    child = subprocess.Popen(args, cwd=SOURCE, env=env, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
    process_stat=parse_stat(read_text(f'/proc/{child.pid}/stat'))
    assert process_stat['pid']==child.pid and process_stat['state']!='Z','PREVIEW_PROCESS_UNAVAILABLE'
    process_start=process_stat['startTicks']
    process = {'pid': child.pid, 'processStart': process_start, 'command': args,
               'sourceRevision': sha, 'attemptPath': str(attempt), 'appUrl': owner['appUrl']}
    write_once(RUNTIME / 'active-preview.json', process)
    ready = False
    for _ in range(100):
        if child.poll() is not None:
            break
        try:
            with urllib.request.urlopen(owner['appUrl'] + '/admin-release.json', timeout=1) as response:
                ready = json.load(response) == marker
        except Exception:
            pass
        if ready:
            break
        time.sleep(0.2)
    if ready:host_listeners()
    unchanged(sha)
    result = {'result': 'LOCAL_ARTIFACT_READY' if ready else 'LOCAL_PREVIEW_FAILED',
              'sourceRevision': sha, 'projectId': owner['projectId'],
              'markerMatched': ready, 'privateValuesAbsent': True,
              'files': len(files), 'buildManifestPath': str(attempt / 'build-manifest.json'),
              'capacityTestRun': False, 'rawLogsStored': False}
    write_once(attempt / 'result.json', result)
    print(json.dumps(result))
    return 0 if ready else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        result = {'result': 'LOCAL_ACTIVATION_BLOCKED',
                  'sourceRevision': ACTIVATION_SHA,
                  'errorClass': type(error).__name__, 'rawLogsStored': False}
        if ACTIVATION_ATTEMPT and not (ACTIVATION_ATTEMPT / 'result.json').exists():
            write_once(ACTIVATION_ATTEMPT / 'result.json', result)
        print(json.dumps(result))
        raise SystemExit(1) from None
