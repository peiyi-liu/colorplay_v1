"""Strict root registration oracle. All actual database work is READ ONLY."""
import json
import os
from pathlib import Path
import re
import runpy
import sys
import uuid

ROOT = runpy.run_path(str(Path(__file__).resolve().with_name('capacity-root-readonly.py')), run_name='_capacity_root')
for _name in ['RUNTIME', 'keys', 'uid', 'utc', 'sha', 'read', 'write', 'context', 'snapshot', 'frozen', 'owned_roster', 'assert_all_owned']:
    globals()[_name] = ROOT[_name]
ACTOR_KEYS = ['actorIndex', 'alias', 'email', 'account', 'password', 'fullName', 'nickname']
MAPPING_KEYS = ['actorIndex', 'alias', 'email', 'account']


def mapping(actor):
    return {key: actor[key] for key in MAPPING_KEYS}


def validate_actor(actor, size):
    keys(actor, ACTOR_KEYS)
    index = actor['actorIndex']
    assert type(index) is int and 0 <= index < size, 'ACTOR_INDEX_INVALID'
    assert actor['alias'] == 'REG%d_%02d' % (size, index + 1), 'ALIAS_INVALID'
    assert isinstance(actor['email'], str) and re.fullmatch(r'[a-z0-9][a-z0-9.+-]{5,110}@colorplay\.test', actor['email']), 'EMAIL_INVALID'
    assert isinstance(actor['account'], str) and re.fullmatch('[a-z0-9]{3,20}', actor['account']), 'ACCOUNT_INVALID'
    assert isinstance(actor['password'], str) and 8 <= len(actor['password']) <= 100, 'PASSWORD_INVALID'
    assert all(isinstance(actor[key], str) and 1 <= len(actor[key]) <= 80 for key in ['fullName', 'nickname']), 'NAME_INVALID'
    return mapping(actor)


def cohort(ctx, size):
    assert type(size) is int and size in [40, 60], 'COHORT_INVALID'
    rows = ctx['registrationActors']
    assert isinstance(rows, list) and len(rows) == 100, 'APPROVED_COHORTS_INVALID'
    for row in rows:
        keys(row, ['cohortSize', *MAPPING_KEYS])
        assert row['cohortSize'] in [40, 60], 'APPROVED_SIZE_INVALID'
    assert len({r['alias'] for r in rows}) == len({r['account'] for r in rows}) == len({r['email'] for r in rows}) == 100, 'COHORT_COLLISION'
    expected = [mapping(row) for row in rows if row['cohortSize'] == size]
    assert len(expected) == size and [r['actorIndex'] for r in expected] == list(range(size)), 'APPROVED_ORDER_INVALID'
    return expected


def common(data, ctx):
    size = data['cohortSize']
    expected = cohort(ctx, size)
    assert data['scope'] == ctx['scope'], 'SCOPE_CHANGED'
    assert data['legId'] == 'fresh_registration-native_browser-%d' % size, 'LEG_INVALID'
    uid(data['classroomId'])
    return expected


def fresh(data, ctx, observed):
    keys(data, ['scope', 'legId', 'cohortSize', 'classroomId', 'actors'])
    expected = common(data, ctx)
    assert isinstance(data['actors'], list) and len(data['actors']) == data['cohortSize'], 'ACTOR_COUNT_INVALID'
    actual = [validate_actor(actor, data['cohortSize']) for actor in data['actors']]
    assert actual == expected, 'COHORT_MAPPING_CHANGED'
    roster = owned_roster(ctx)
    assert_all_owned(observed, roster)
    teacher = roster['T1']['id']
    assert any(row['id'] == data['classroomId'] and row['ownerId'] == teacher and row['status'] == 'active' for row in observed['classrooms']), 'CLASSROOM_NOT_OWNED'
    emails = {row['email'] for row in observed['auth']}
    accounts = {row['loginAccount'] for row in observed['profiles'] if row['loginAccount'] is not None}
    assert all(row['email'] not in emails and row['account'] not in accounts and row['alias'] not in roster for row in expected), 'COHORT_ALREADY_EXISTS'
    output = {'existingAliases': sorted(roster), 'unownedAuthCount': 0, 'cohortAbsent': True, 'checkedAtDatabaseUtc': observed['checkedAtDatabaseUtc'], 'databaseIdentitySha256': ctx['scope']['databaseIdentitySha256']}
    proof = {'schemaVersion': 1, 'kind': 'ROOT_FRESH_REGISTRATION_BASELINE', 'planId': ctx['planId'], 'sourceRevision': ctx['sourceRevision'], 'legId': data['legId'], 'cohortSize': data['cohortSize'], 'classroomId': data['classroomId'], 'actors': expected, 'output': output, 'snapshot': observed}
    output['readOnlyProofSha256'] = write(ctx['proofs'] / ('fresh-%d.json' % data['cohortSize']), proof)
    return output


def send_intent(data, ctx, baseline):
    stem = data['sendIntentName']
    if stem is None:
        assert data['sendIntentAtUtc'] is None, 'SEND_INTENT_TIME_UNBOUND'
        return None
    expected = 'fresh-registration-native-browser-%d-a%02d-otp-send-intent' % (data['cohortSize'], data['actor']['actorIndex'])
    assert stem == expected, 'SEND_INTENT_NAME_INVALID'
    value, _ = read(ctx['journal'] / (stem + '.json'))
    keys(value, ['schemaVersion', 'kind', 'planId', 'sourceRevision', 'legId', 'cohortSize', 'actorIndex', 'alias', 'email', 'account', 'classroomId', 'freshProofSha256', 'checkedAtDatabaseUtc', 'issuedAtUtc'])
    assert value['schemaVersion'] == 1 and value['kind'] == 'CAPACITY_REGISTRATION_OTP_SEND_INTENT', 'SEND_INTENT_INVALID'
    assert value['planId'] == ctx['planId'] and value['sourceRevision'] == ctx['sourceRevision'], 'SEND_INTENT_SCOPE_INVALID'
    assert all(value[key] == data[key] for key in ['legId', 'cohortSize', 'classroomId', 'freshProofSha256', 'checkedAtDatabaseUtc']), 'SEND_INTENT_UNBOUND'
    assert all(value[key] == data['actor'][key] for key in MAPPING_KEYS), 'SEND_INTENT_ACTOR_INVALID'
    assert value['issuedAtUtc'] == data['sendIntentAtUtc'], 'SEND_INTENT_TIME_INVALID'
    utc(value['issuedAtUtc'])
    assert baseline['output']['checkedAtDatabaseUtc'] == value['checkedAtDatabaseUtc'], 'BASELINE_TIME_CHANGED'
    return value


def capture(data, ctx, observed):
    keys(data, ['scope', 'legId', 'cohortSize', 'classroomId', 'actor', 'sendIntentName', 'sendIntentAtUtc', 'verifiedSubject', 'stage', 'freshProofSha256', 'checkedAtDatabaseUtc'])
    expected = common(data, ctx)
    actor = validate_actor(data['actor'], data['cohortSize'])
    assert actor == expected[actor['actorIndex']], 'ACTOR_MAPPING_CHANGED'
    stage = data['stage']
    assert stage in ['before_send', 'after_verify', 'completed', 'partial_failure'], 'STAGE_INVALID'
    baseline, baseline_sha = read(ctx['proofs'] / ('fresh-%d.json' % data['cohortSize']))
    assert baseline_sha == data['freshProofSha256'] and baseline['sourceRevision'] == ctx['sourceRevision'] and baseline['planId'] == ctx['planId'] and baseline['classroomId'] == data['classroomId'], 'FRESH_PROOF_UNBOUND'
    assert data['checkedAtDatabaseUtc'] == baseline['output']['checkedAtDatabaseUtc'] and utc(observed['checkedAtDatabaseUtc']) >= utc(data['checkedAtDatabaseUtc']), 'DATABASE_TIME_INVALID'
    intent = send_intent(data, ctx, baseline)
    subject = data['verifiedSubject']
    if subject is not None:
        uid(subject)
    rows = [row for row in observed['auth'] if row['email'] == actor['email']]
    profiles = [row for row in observed['profiles'] if row['loginAccount'] == actor['account']]
    output = {'ownership': 'UNKNOWN', 'authUserId': None, 'authCreatedAtUtc': None, 'role': None, 'loginAccount': None, 'registrationComplete': None, 'membershipConfirmed': None, 'databaseIdentitySha256': ctx['scope']['databaseIdentitySha256']}
    if len(rows) == 0 and not profiles and subject is None:
        output['ownership'] = 'NO_AUTH'
    elif len(rows) == 1:
        auth = rows[0]
        uid(auth['id'])
        output.update(authUserId=auth['id'], authCreatedAtUtc=auth['createdAt'])
        profile = next((row for row in observed['profiles'] if row['id'] == auth['id']), None)
        if profile is not None:
            assert profile['role'] in ['student', 'teacher', 'admin'], 'PROFILE_ROLE_INVALID'
            output['role'] = profile['role'] if profile['role'] == 'student' else None
            output['loginAccount'] = profile['loginAccount']
            output['registrationComplete'] = profile['role'] != 'student' or profile['loginAccount'] is not None
        memberships = [row for row in observed['memberships'] if row['userId'] == auth['id']]
        output['membershipConfirmed'] = len(memberships) == 1 and memberships[0]['classroomId'] == data['classroomId'] and memberships[0]['role'] == 'student' and memberships[0]['status'] == 'active'
        collisions = any(row['id'] != auth['id'] for row in profiles)
        if stage != 'before_send' and intent is not None and not collisions and utc(auth['createdAt']) >= utc(data['checkedAtDatabaseUtc']) and (subject is None or subject == auth['id']):
            output['ownership'] = 'OWNED_BY_OTP_INTENT'
        if stage in ['after_verify', 'completed'] and (subject != auth['id'] or auth['emailConfirmedAt'] is None):
            output['ownership'] = 'UNKNOWN'
        if stage == 'completed' and not (output['role'] == 'student' and output['loginAccount'] == actor['account'] and output['registrationComplete'] is True and output['membershipConfirmed'] is True):
            output['ownership'] = 'UNKNOWN'
    # Preserve unknown/partial subjects as private evidence, never promote them.
    proof = {'schemaVersion': 1, 'kind': 'ROOT_REGISTRATION_OWNERSHIP', 'planId': ctx['planId'], 'sourceRevision': ctx['sourceRevision'], 'legId': data['legId'], 'cohortSize': data['cohortSize'], 'classroomId': data['classroomId'], 'actor': actor, 'stage': stage, 'freshProofSha256': baseline_sha, 'checkedAtDatabaseUtc': observed['checkedAtDatabaseUtc'], 'querySha256': observed['querySha256'], 'output': output}
    output['readOnlyProofSha256'] = write(ctx['proofs'] / ('capture-%d-%02d-%s.json' % (data['cohortSize'], actor['actorIndex'], stage)), proof)
    return output


STATE = {'phase': 'CONTEXT', 'context': None, 'snapshot': None}


def preserve_failure(error):
    reason = str(error) if isinstance(error, AssertionError) and re.fullmatch('[A-Z_]{3,80}', str(error)) else 'UNAVAILABLE'
    ctx = STATE['context']
    if ctx is not None:
        try:
            write(ctx['proofs'] / ('blocked-' + str(uuid.uuid4()) + '.json'), {'kind': 'ROOT_READ_ONLY_ORACLE_BLOCKED', 'phase': STATE['phase'], 'safeReason': reason, 'errorClass': type(error).__name__, 'readOnly': True, 'snapshot': STATE['snapshot']})
        except Exception:
            pass
    return reason


def validate_input(data, operation, ctx):
    fields = ['scope', 'legId', 'cohortSize', 'classroomId']
    fields += ['actors'] if operation == 'fresh' else ['actor', 'sendIntentName', 'sendIntentAtUtc', 'verifiedSubject', 'stage', 'freshProofSha256', 'checkedAtDatabaseUtc']
    keys(data, fields)
    expected = common(data, ctx)
    if operation == 'fresh':
        assert isinstance(data['actors'], list) and len(data['actors']) == data['cohortSize'], 'ACTOR_COUNT_INVALID'
        assert [validate_actor(actor, data['cohortSize']) for actor in data['actors']] == expected, 'COHORT_MAPPING_CHANGED'
    else:
        actor = validate_actor(data['actor'], data['cohortSize'])
        assert actor == expected[actor['actorIndex']], 'ACTOR_MAPPING_CHANGED'
        assert data['stage'] in ['before_send', 'after_verify', 'completed', 'partial_failure'], 'STAGE_INVALID'
        assert re.fullmatch('[a-f0-9]{64}', data['freshProofSha256']), 'FRESH_PROOF_HASH_INVALID'
        utc(data['checkedAtDatabaseUtc'])
        if data['verifiedSubject'] is not None:
            uid(data['verifiedSubject'])
        baseline, baseline_sha = read(ctx['proofs'] / ('fresh-%d.json' % data['cohortSize']))
        assert baseline_sha == data['freshProofSha256'], 'FRESH_PROOF_UNBOUND'
        send_intent(data, ctx, baseline)


def main():
    assert len(sys.argv) == 4, 'ARGUMENTS_REQUIRED'
    revision, plan_id, approval_sha = sys.argv[1:]
    ctx = context(revision, plan_id, approval_sha, Path(__file__).name)
    STATE['context'] = ctx
    STATE['phase'] = 'INPUT'
    raw = sys.stdin.buffer.read(131073)
    assert len(raw) <= 131072, 'INPUT_TOO_LARGE'
    request = keys(json.loads(raw), ['operation', 'input'])
    assert request['operation'] in ['fresh', 'capture'], 'OPERATION_INVALID'
    # Validate full shape before database I/O, including cohort and scope.
    data = request['input']
    validate_input(data, request['operation'], ctx)
    STATE['phase'] = 'DATABASE_READ'
    observed = snapshot(ctx['scope'])
    STATE['snapshot'] = observed
    STATE['phase'] = 'PROOF_VALIDATION'
    result = (fresh if request['operation'] == 'fresh' else capture)(data, ctx, observed)
    frozen(revision)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'result': 'CAPACITY_REGISTRATION_READBACK_BLOCKED', 'errorClass': type(error).__name__, 'safeReason': preserve_failure(error), 'rawLogsStored': False}))
        raise SystemExit(1) from None
