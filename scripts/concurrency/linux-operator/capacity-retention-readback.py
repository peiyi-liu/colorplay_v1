"""Root whole-cohort custody, immutable-ledger preservation and canonical oracle."""
import json
from pathlib import Path
import re
import runpy
import sys
import uuid

ROOT = runpy.run_path(str(Path(__file__).resolve().with_name('capacity-root-readonly.py')), run_name='_capacity_root')
for _name in ['RUNTIME', 'keys', 'uid', 'utc', 'sha', 'read', 'write', 'context', 'snapshot', 'query', 'frozen', 'owned_roster', 'assert_all_owned']:
    globals()[_name] = ROOT[_name]


def preserved(previous, current):
    for table in ['xp_transactions', 'wallet_transactions']:
        old = {row['id']: row for row in previous[table]}
        new = {row['id']: row for row in current[table]}
        assert len(old) == len(previous[table]) and len(new) == len(current[table]), 'LEDGER_DUPLICATE'
        assert all(new.get(row_id) == value for row_id, value in old.items()), 'IMMUTABLE_LEDGER_CHANGED'
    assert utc(current['checkedAtDatabaseUtc']) >= utc(previous['checkedAtDatabaseUtc']), 'DATABASE_TIME_REVERSED'
    assert {row['id'] for row in previous['auth']} <= {row['id'] for row in current['auth']}, 'RETAINED_AUTH_REMOVED'
    assert {row['id'] for row in previous['classrooms']} <= {row['id'] for row in current['classrooms']}, 'RETAINED_CLASS_REMOVED'


def canonical(ctx):
    baseline, _ = read(RUNTIME / ('canonical-baseline-' + ctx['scope']['functionalRunId'] + '.json'))
    assert baseline['sourceRevision'] == ctx['sourceRevision'] and baseline['runId'] == ctx['scope']['functionalRunId'] and baseline['answerContentsReturned'] is False, 'CANONICAL_BASELINE_INVALID'
    helper = runpy.run_path(str(RUNTIME / 'canonical-baseline.py'), run_name='_canonical_query')
    observed = query(helper['digest_sql']())
    assert observed['canonicalSha256'] == baseline['canonicalSha256'] and observed['counts'] == baseline['counts'], 'CANONICAL_CONTENT_CHANGED'
    return observed['canonicalSha256']


def validate_request(data, ctx):
    keys(data, ['scope', 'legId', 'checkpoint', 'sequence', 'previousProofSha256', 'completedRegistrationCohorts'])
    assert data['scope'] == ctx['scope'], 'SCOPE_CHANGED'
    assert re.fullmatch('(anonymous_entry_prepare|fresh_registration|existing_login_game|backend_game)-(native_browser|node_protocol|hybrid_browser_sdk)-(3|10|20|40|60)', data['legId']), 'LEG_INVALID'
    assert data['checkpoint'] in ['before', 'after', 'partial_failure'], 'CHECKPOINT_INVALID'
    assert type(data['sequence']) is int and 0 <= data['sequence'] <= 50, 'SEQUENCE_INVALID'
    assert data['previousProofSha256'] is None or re.fullmatch('[a-f0-9]{64}', data['previousProofSha256']), 'PREDECESSOR_HASH_INVALID'
    assert data['completedRegistrationCohorts'] in [[], [40], [40, 60]], 'COHORT_ORDER_INVALID'


def completed_roster(ctx, cohorts):
    roster = owned_roster(ctx)
    for size in cohorts:
        for index in range(size):
            proof, _ = read(ctx['proofs'] / ('capture-%d-%02d-completed.json' % (size, index)))
            output = proof['output']
            assert proof['stage'] == 'completed' and output['ownership'] == 'OWNED_BY_OTP_INTENT' and output['role'] == 'student' and output['registrationComplete'] is True and output['membershipConfirmed'] is True and output['loginAccount'] == proof['actor']['account'], 'COHORT_NOT_COMPLETED'
    return roster


def checkpoint(data, ctx, observed, canonical_sha):
    validate_request(data, ctx)
    roster = completed_roster(ctx, data['completedRegistrationCohorts'])
    assert_all_owned(observed, roster)
    assert set(roster) == {'T1', 'T2', 'S1', 'S2', 'A1', 'R1'} | {'REG%d_%02d' % (size, index + 1) for size in data['completedRegistrationCohorts'] for index in range(size)}, 'COHORT_SET_UNEXPECTED'
    # Classes require exact normal-flow journal receipts, not just a known owner.
    expected_classes = set()
    expected_memberships = set()
    def membership(classroom, alias, role):
        expected_memberships.add((classroom, roster[alias]['id'], role, 'active'))
    for name, teacher, students in [('classroom-1-confirmed', 'T1', ['S1', 'S2']), ('classroom-2-confirmed', 'T2', ['R1']), ('teacher-c3-confirmed', 'T1', [])]:
        value, _ = read(ctx['functional'] / (name + '.json'))
        classroom = uid(value['classroomId'])
        expected_classes.add(classroom)
        assert any(row['id'] == classroom and row['ownerId'] == roster[teacher]['id'] and row['status'] == 'active' for row in observed['classrooms']), 'FUNCTIONAL_CLASSROOM_CHANGED'
        membership(classroom, teacher, 'teacher')
        for alias in students:
            membership(classroom, alias, 'student')
    assert len(expected_classes) == 3, 'FUNCTIONAL_CLASSROOMS_NOT_DISTINCT'
    capacity_classes = {}
    for size in [40, 60]:
        path = ctx['journal'] / ('registration-classroom-%d-confirmed.json' % size)
        if path.exists():
            value, _ = read(path)
            assert value['ownerId'] == roster['T1']['id'] and value['cohortSize'] == size, 'CAPACITY_CLASSROOM_INVALID'
            classroom = uid(value['classroomId'])
            assert classroom not in expected_classes, 'CAPACITY_CLASSROOM_NOT_DISTINCT'
            capacity_classes[size] = classroom
            expected_classes.add(classroom)
            assert any(row['id'] == classroom and row['ownerId'] == value['ownerId'] and row['status'] == 'active' for row in observed['classrooms']), 'CAPACITY_CLASSROOM_CHANGED'
            membership(classroom, 'T1', 'teacher')
    assert {row['id'] for row in observed['classrooms']} == expected_classes, 'CLASSROOM_SET_UNEXPECTED'
    for size in data['completedRegistrationCohorts']:
        baseline, _ = read(ctx['proofs'] / ('fresh-%d.json' % size))
        assert baseline['classroomId'] == capacity_classes.get(size), 'REGISTRATION_CLASSROOM_MAPPING_CHANGED'
        for actor in baseline['actors']:
            memberships = [row for row in observed['memberships'] if row['userId'] == roster[actor['alias']]['id']]
            assert len(memberships) == 1 and memberships[0] == {'classroomId': baseline['classroomId'], 'userId': roster[actor['alias']]['id'], 'role': 'student', 'status': 'active'}, 'REGISTRATION_MEMBERSHIP_CHANGED'
            membership(baseline['classroomId'], actor['alias'], 'student')
    actual_memberships = {(row['classroomId'], row['userId'], row['role'], row['status']) for row in observed['memberships']}
    assert len(actual_memberships) == len(observed['memberships']) and actual_memberships == expected_memberships, 'MEMBERSHIP_SET_UNEXPECTED'
    earlier = sorted(ctx['proofs'].glob('retention-*.json'))
    assert len(earlier) == data['sequence'], 'RETENTION_SEQUENCE_UNEXPECTED'
    if not earlier:
        assert data['previousProofSha256'] is None, 'RETENTION_PREDECESSOR_UNEXPECTED'
    else:
        previous, previous_sha = read(earlier[-1], maximum=2097152)
        assert previous_sha == data['previousProofSha256'] and previous['sequence'] == data['sequence'] - 1, 'RETENTION_PREDECESSOR_CHANGED'
        assert previous['planId'] == ctx['planId'] and previous['sourceRevision'] == ctx['sourceRevision'] and previous['canonicalSha256'] == canonical_sha, 'RETENTION_PREDECESSOR_UNBOUND'
        preserved(previous['snapshot'], observed)
    output = {'databaseIdentitySha256': ctx['scope']['databaseIdentitySha256'], 'identities': len(observed['auth']), 'classrooms': len(observed['classrooms']), 'xpTransactions': len(observed['xp_transactions']), 'walletTransactions': len(observed['wallet_transactions']), 'canonicalUnchanged': True, 'ownedSubjects': True, 'immutableRowsPreserved': True}
    proof = {'schemaVersion': 1, 'kind': 'ROOT_CAPACITY_RETENTION', 'planId': ctx['planId'], 'sourceRevision': ctx['sourceRevision'], 'sequence': data['sequence'], 'legId': data['legId'], 'checkpoint': data['checkpoint'], 'previousProofSha256': data['previousProofSha256'], 'canonicalSha256': canonical_sha, 'snapshot': observed, 'output': output}
    output['readOnlyProofSha256'] = write(ctx['proofs'] / ('retention-%02d-%s-%s.json' % (data['sequence'], data['legId'], data['checkpoint'])), proof)
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


def main():
    assert len(sys.argv) == 4, 'ARGUMENTS_REQUIRED'
    revision, plan_id, approval_sha = sys.argv[1:]
    ctx = context(revision, plan_id, approval_sha, Path(__file__).name)
    STATE['context'] = ctx
    STATE['phase'] = 'INPUT'
    raw = sys.stdin.buffer.read(131073)
    assert len(raw) <= 131072, 'INPUT_TOO_LARGE'
    data = json.loads(raw)
    validate_request(data, ctx)
    STATE['phase'] = 'DATABASE_READ'
    observed = snapshot(ctx['scope'])
    STATE['snapshot'] = observed
    STATE['phase'] = 'PROOF_VALIDATION'
    canonical_sha = canonical(ctx)
    result = checkpoint(data, ctx, observed, canonical_sha)
    frozen(revision)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'result': 'CAPACITY_RETENTION_READBACK_BLOCKED', 'errorClass': type(error).__name__, 'safeReason': preserve_failure(error), 'rawLogsStored': False}))
        raise SystemExit(1) from None
