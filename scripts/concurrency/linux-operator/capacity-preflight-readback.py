"""Root preflight, owned subjects and anonymous metadata proof on fixed Local."""
import hashlib
import json
from pathlib import Path
import re
import runpy
import sys
import urllib.request
import uuid

ROOT = runpy.run_path(str(Path(__file__).resolve().with_name('capacity-root-readonly.py')), run_name='_capacity_root')
for _name in ['RUNTIME', 'SOURCE', 'keys', 'uid', 'sha', 'read', 'write', 'context', 'snapshot', 'frozen', 'owned_roster', 'assert_all_owned']:
    globals()[_name] = ROOT[_name]
STATE = {'phase': 'CONTEXT', 'context': None, 'snapshot': None}


def validate(data, operation, ctx):
    expected = ['scope', 'legId']
    if operation == 'subjects':
        expected += ['aliases']
    if operation == 'anonymous':
        expected += ['checkpoint']
    keys(data, expected)
    assert data['scope'] == ctx['scope'], 'SCOPE_CHANGED'
    assert re.fullmatch('(anonymous_entry_prepare|fresh_registration|existing_login_game|backend_game)-(native_browser|node_protocol|hybrid_browser_sdk)-(3|10|20|40|60)', data['legId']), 'LEG_INVALID'
    if operation == 'subjects':
        aliases = data['aliases']
        assert isinstance(aliases, list) and 1 <= len(aliases) <= 106 and all(isinstance(alias, str) for alias in aliases) and len(set(aliases)) == len(aliases), 'ALIASES_INVALID'
    if operation == 'anonymous':
        assert re.fullmatch('anonymous_entry_prepare-native_browser-(3|10|20)', data['legId']) and data['checkpoint'] in ['before', 'after'], 'ANONYMOUS_SCOPE_INVALID'


def approved_artifact(ctx):
    directory = RUNTIME / 'capacity-plans' / ctx['planId']
    ROOT['private_dir'](directory)
    manifest, manifest_hash = read(directory / 'manifest.json')
    _, plan_hash = read(directory / 'private-plan.json')
    assert manifest_hash == ctx['manifestFileSha256'] and plan_hash == ctx['privatePlanSha256'], 'APPROVED_PLAN_FILE_CHANGED'
    assert manifest['scope'] == ctx['scope'], 'MANIFEST_SCOPE_CHANGED'
    bundle, bundle_hash = read(RUNTIME / 'entry-bundle-proof.json')
    assert bundle_hash == ctx['bundleProofSha256'] and bundle['sourceRevision'] == ctx['sourceRevision'] and bundle['artifactSha256'] == ctx['scope']['artifactSha256'], 'BUNDLE_PROOF_CHANGED'
    active, _ = read(RUNTIME / 'active-preview.json')
    attempt = Path(active['attemptPath'])
    assert attempt.parent == RUNTIME and attempt.name.startswith('activation-') and active['sourceRevision'] == ctx['sourceRevision'] and active['appUrl'] == 'http://127.0.0.1:58373', 'ACTIVATION_CHANGED'
    ROOT['private_dir'](attempt)
    artifact, artifact_hash = read(attempt / 'build-manifest.json', maximum=2097152)
    detailed, _ = read(attempt / 'entry-bundle-proof.json')
    assert artifact['files'].get('admin-release.json') == ctx['scope']['artifactSha256'] and detailed.get('buildManifestSha256') == artifact_hash and detailed.get('artifactDigestKind') == 'ADMIN_RELEASE_RESPONSE_BYTES' and artifact['sourceRevision'] == ctx['sourceRevision'] and artifact['privateValuesAbsent'] is True and detailed['measurement'] == bundle, 'ARTIFACT_PROOF_CHANGED'
    dist = SOURCE / 'dist'
    actual = {}
    for path in sorted(dist.rglob('*')):
        assert not path.is_symlink(), 'ARTIFACT_SYMLINK'
        if path.is_file():
            assert path.resolve().is_relative_to(dist.resolve()), 'ARTIFACT_PATH_ESCAPED'
            actual[str(path.relative_to(dist))] = sha(path.read_bytes())
    assert actual and actual == artifact['files'], 'ARTIFACT_CONTENT_CHANGED'
    return True


def subjects(data, ctx, observed):
    roster = owned_roster(ctx)
    assert_all_owned(observed, roster)
    assert all(alias in roster for alias in data['aliases']), 'SUBJECT_NOT_OWNED'
    result = []
    profiles = {row['id']: row for row in observed['profiles']}
    for alias in data['aliases']:
        owned = roster[alias]
        profile = profiles[owned['id']]
        rows = [row for row in observed['memberships'] if row['userId'] == owned['id'] and row['status'] == 'active']
        if profile['role'] == 'student':
            assert len(rows) == 1 and rows[0]['role'] == 'student', 'STUDENT_MEMBERSHIP_UNKNOWN'
            classroom = rows[0]['classroomId']
        else:
            classroom = None
        result.append({'alias': alias, 'userId': uid(owned['id']), 'role': profile['role'], 'loginAccount': profile['loginAccount'], 'classroomId': classroom})
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, target):
        return None


def mail_metadata(roster):
    allowed = {row['email'] for row in roster.values()}
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    rows, ids = [], set()
    total = None
    for page in range(4):
        start = len(rows)
        url = 'http://127.0.0.1:58324/api/v1/messages?start=%d&limit=100' % start
        with opener.open(urllib.request.Request(url, method='GET'), timeout=5) as response:
            assert response.status == 200 and response.geturl() == url, 'MAILBOX_RESPONSE_INVALID'
            raw = response.read(262145)
        assert len(raw) <= 262144, 'MAILBOX_METADATA_TOO_LARGE'
        value = json.loads(raw)
        assert type(value['messages_count']) is int and 0 <= value['messages_count'] <= 240 and value['start'] == start and isinstance(value['messages'], list) and len(value['messages']) <= 100, 'MAILBOX_METADATA_INVALID'
        if total is not None:
            assert value['messages_count'] == total, 'ANONYMOUS_MAILBOX_CHANGED_DURING_READ'
        total = value['messages_count']
        for message in value['messages']:
            message_id = message['ID']
            assert isinstance(message_id, str) and re.fullmatch('[A-Za-z0-9_-]{1,100}', message_id) and message_id not in ids, 'MAILBOX_ID_INVALID'
            assert isinstance(message['To'], list) and len(message['To']) == 1 and message['To'][0]['Address'] in allowed, 'MAILBOX_RECIPIENT_NOT_OWNED'
            ids.add(message_id)
            rows.append({'id': message_id, 'to': message['To'][0]['Address']})
        assert len(rows) <= total, 'MAILBOX_COUNT_INVALID'
        if len(rows) == total:
            return sorted(rows, key=lambda row: row['id'])
        assert value['messages'], 'MAILBOX_PAGE_EMPTY'
    raise AssertionError('MAILBOX_PAGINATION_LIMIT')


def main():
    assert len(sys.argv) == 4, 'ARGUMENTS_REQUIRED'
    revision, plan_id, approval_sha = sys.argv[1:]
    ctx = context(revision, plan_id, approval_sha, Path(__file__).name)
    STATE['context'] = ctx
    STATE['phase'] = 'INPUT'
    raw = sys.stdin.buffer.read(131073)
    assert len(raw) <= 131072, 'INPUT_TOO_LARGE'
    request = keys(json.loads(raw), ['operation', 'input'])
    operation, data = request['operation'], request['input']
    assert operation in ['preflight', 'subjects', 'anonymous'], 'OPERATION_INVALID'
    validate(data, operation, ctx)
    STATE['phase'] = 'DATABASE_READ'
    observed = snapshot(ctx['scope'])
    STATE['snapshot'] = observed
    roster = owned_roster(ctx)
    assert_all_owned(observed, roster)
    output = {'databaseIdentitySha256': ctx['scope']['databaseIdentitySha256']}
    private = {}
    if operation == 'preflight':
        STATE['phase'] = 'ARTIFACT'
        approved_artifact(ctx)
        output.update(sourceFrozen=True, artifactMatched=True, approvedPlanMatched=True)
    elif operation == 'subjects':
        output['subjects'] = subjects(data, ctx, observed)
    else:
        STATE['phase'] = 'MAILBOX_METADATA'
        messages = mail_metadata(roster)
        auth = sorted(observed['auth'], key=lambda row: row['id'])
        compact = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
        output.update(authSetSha256=sha(compact(auth)), ownedMailpitIdsSha256=sha(compact(messages)), authCount=len(auth), messageCount=len(messages))
        private['mailMetadata'] = messages
    frozen(revision)
    suffix = data.get('checkpoint', str(uuid.uuid4()))
    proof = {'kind': 'ROOT_CAPACITY_' + operation.upper(), 'planId': plan_id, 'sourceRevision': revision, 'legId': data['legId'], 'checkedAtDatabaseUtc': observed['checkedAtDatabaseUtc'], 'querySha256': observed['querySha256'], 'output': output, **private}
    output['readOnlyProofSha256'] = write(ctx['proofs'] / ('%s-%s-%s.json' % (operation, data['legId'], suffix)), proof)
    print(json.dumps(output))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        safe = str(error) if isinstance(error, AssertionError) and re.fullmatch('[A-Z_]{3,80}', str(error)) else 'UNAVAILABLE'
        ctx = STATE['context']
        if ctx is not None:
            try:
                write(ctx['proofs'] / ('blocked-' + str(uuid.uuid4()) + '.json'), {'kind': 'ROOT_READ_ONLY_ORACLE_BLOCKED', 'phase': STATE['phase'], 'safeReason': safe, 'snapshot': STATE['snapshot'], 'readOnly': True})
            except Exception:
                pass
        print(json.dumps({'result': 'CAPACITY_PREFLIGHT_READBACK_BLOCKED', 'errorClass': type(error).__name__, 'safeReason': safe, 'rawLogsStored': False}))
        raise SystemExit(1) from None
