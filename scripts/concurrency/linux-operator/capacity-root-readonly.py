"""Root-owned fixed-Local proof utilities. No mutation, Auth token or answer reads."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import stat
import subprocess
import urllib.parse
import uuid
from linux_runtime_common import require_linux, private_json, verify_local_profile, host_listeners

RUNTIME = Path(__file__).resolve().parent
SOURCE = RUNTIME.parent.parent / 'colorplay-live-recovery'
PROJECT = 'cp-whole-site-261115'
ENV = {'PATH': '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE': '1'}


def sha(value):
    return hashlib.sha256(value).hexdigest()


def keys(value, expected):
    assert isinstance(value, dict) and set(value) == set(expected), 'SHAPE_INVALID'
    return value


def uid(value):
    assert isinstance(value, str) and str(uuid.UUID(value)) == value, 'UUID_INVALID'
    return value


def utc(value):
    assert isinstance(value, str) and len(value) <= 40, 'TIME_INVALID'
    parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    assert parsed.utcoffset() == datetime.timedelta(0), 'TIME_NOT_UTC'
    return parsed


def private_dir(path):
    assert path.is_absolute() and path.resolve() == path, 'DIRECTORY_INVALID'
    info = path.lstat()
    assert stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700, 'DIRECTORY_NOT_PRIVATE'
    return path


def read(path, maximum=262144):
    return private_json(path, maximum)

def write(path, value):
    raw = (json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(',', ':')) + '\n').encode()
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return sha(raw)


def command(args, env=ENV, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True, env=env, timeout=15)
    assert result.returncode == 0 and len(result.stdout.encode()) <= 2097152, 'READ_ONLY_COMMAND_FAILED'
    return result.stdout


def frozen(revision):
    env = {**ENV, 'GIT_DIR': str(SOURCE / '.git'), 'GIT_WORK_TREE': str(SOURCE)}
    assert command(['/usr/bin/git', 'rev-parse', 'HEAD'], env).strip() == revision, 'SOURCE_CHANGED'
    assert not command(['/usr/bin/git', 'status', '--porcelain'], env).strip(), 'SOURCE_NOT_FROZEN'


def context(revision, plan_id, approval_sha, helper):
    require_linux()
    assert re.fullmatch('[a-f0-9]{40}', revision) and re.fullmatch('wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}', plan_id), 'ARGUMENT_INVALID'
    assert re.fullmatch('[a-f0-9]{64}', approval_sha), 'APPROVAL_HASH_INVALID'
    approval, actual = read(RUNTIME / ('capacity-oracle-approval-' + plan_id + '.json'))
    assert actual == approval_sha, 'APPROVAL_CHANGED'
    keys(approval, ['schemaVersion', 'confirmation', 'projectId', 'planId', 'sourceRevision', 'scope', 'manifestSha256', 'manifestFileSha256', 'privatePlanSha256', 'bundleProofSha256', 'journalDir', 'functionalJournalDir', 'helpers', 'registrationActors'])
    assert approval['schemaVersion'] == 1 and approval['confirmation'] == 'LOCAL_CAPACITY_READ_ONLY_ORACLES', 'APPROVAL_INVALID'
    assert approval['projectId'] == PROJECT and approval['planId'] == plan_id and approval['sourceRevision'] == revision, 'APPROVAL_SCOPE_INVALID'
    scope = approval['scope']
    assert all(re.fullmatch('[a-f0-9]{64}', approval[key]) for key in ['manifestSha256', 'manifestFileSha256', 'privatePlanSha256', 'bundleProofSha256']), 'PLAN_BINDING_INVALID'
    keys(scope, ['schemaVersion', 'environment', 'projectId', 'planId', 'sourceRevision', 'artifactRevision', 'artifactSha256', 'anonKeySha256', 'serviceKeySha256', 'databaseIdentitySha256', 'appUrl', 'supabaseUrl', 'databaseUrl', 'mailpitUrl', 'functionalRunId', 'functionalResultSha256', 'functionalProcessCloseSha256', 'functionalRequestSha256', 'rootPublisherSha256', 'rootValidatorSha256', 'helpers', 'executionProfileSha256'])
    assert scope['schemaVersion'] == 1 and scope['environment'] == 'local' and re.fullmatch('wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}', scope['functionalRunId']), 'SCOPE_HEADER_INVALID'
    assert all(re.fullmatch('[a-f0-9]{64}', scope[key]) for key in ['artifactSha256', 'anonKeySha256', 'serviceKeySha256', 'databaseIdentitySha256', 'functionalResultSha256', 'functionalProcessCloseSha256', 'functionalRequestSha256', 'rootPublisherSha256', 'rootValidatorSha256']), 'SCOPE_DIGEST_INVALID'
    assert scope['planId'] == plan_id and scope['sourceRevision'] == scope['artifactRevision'] == revision and scope['projectId'] == PROJECT, 'SCOPE_INVALID'
    assert scope['appUrl'] == 'http://127.0.0.1:58373' and scope['supabaseUrl'] == 'http://127.0.0.1:58321' and scope['mailpitUrl'] == 'http://127.0.0.1:58324' and scope['databaseUrl'] == 'postgresql://127.0.0.1:58322/postgres', 'TARGET_INVALID'
    for filename in ['capacity-root-readonly.py', helper]:
        assert re.fullmatch('[a-f0-9]{64}', approval['helpers'][filename]) and sha((RUNTIME / filename).read_bytes()) == approval['helpers'][filename], 'ROOT_HELPER_CHANGED'
    functional_helpers={'functional-preflight.py','canonical-baseline.py','media-readback.py','execution-profile-preflight.py','linux-host-sample.py','backend-cgroup-sample.py','linux_proc.py','linux_cgroup.py','linux_runtime_common.py','linux_host_contract.py'}
    capacity_helpers={'capacity-root-readonly.py','capacity-registration-readback.py','capacity-retention-readback.py','capacity-preflight-readback.py'}
    keys(scope['helpers'], functional_helpers)
    keys(approval['helpers'], capacity_helpers)
    hashes={**scope['helpers'],**approval['helpers']}
    closure,_=read(RUNTIME/'execution-profile-helper-closure.json',32768)
    keys(closure,['schemaVersion','sourceRevision','executionProfileSha256','files'])
    assert closure['schemaVersion']==1 and closure['sourceRevision']==revision and closure['executionProfileSha256']==scope['executionProfileSha256'] and closure['files']==hashes,'HELPER_CLOSURE_UNBOUND'
    for filename,expected in hashes.items():
        assert re.fullmatch('[a-f0-9]{64}',expected) and sha((RUNTIME/filename).read_bytes())==expected,'SCOPE_HELPER_CHANGED'
    _,profile,_=verify_local_profile(revision,scope['executionProfileSha256'])
    assert profile['identity']['databaseIdentitySha256']==scope['databaseIdentitySha256'],'DATABASE_PROFILE_CHANGED'
    review, _ = read(RUNTIME / 'reviewed-candidate.json')
    assert review['result'] == 'ACCEPTED_FOR_LOCAL_VALIDATION' and review['sourceRevision'] == revision, 'REVIEW_NOT_CURRENT'
    journal = private_dir(Path(approval['journalDir']))
    functional = private_dir(Path(approval['functionalJournalDir']))
    assert journal == RUNTIME / 'capacity-journals' / plan_id and functional.name == scope['functionalRunId'] and functional.is_relative_to(RUNTIME), 'JOURNAL_SCOPE_INVALID'
    result, result_hash = read(functional / 'functional-result.json')
    close, close_hash = read(functional / 'functional-process-close.json')
    assert result_hash == scope['functionalResultSha256'] and close_hash == scope['functionalProcessCloseSha256'], 'FUNCTIONAL_AUTHORITY_CHANGED'
    assert result['result'] == 'PASS' and result['sourceRevision'] == revision and result['runId'] == scope['functionalRunId'], 'FUNCTIONAL_NOT_PASS'
    assert all(result[key] == scope[key] for key in ['artifactSha256', 'anonKeySha256', 'serviceKeySha256', 'executionProfileSha256']), 'FUNCTIONAL_ARTIFACT_CHANGED'
    assert close['executionProfileSha256']==scope['executionProfileSha256'],'FUNCTIONAL_PROFILE_CHANGED'
    assert close['result'] == 'VERIFIED' and close['runOutcome'] == 'PASS' and close['sourceStillFrozen'] is True and close['observedOwnedProcessesRemaining'] == 0 and close['ownedResourcesClosed'] is True and close['exitCode'] == 0 and close['signal'] is None and close['stderrBytes'] == 0 and 0 <= close['elapsedMs'] <= close['outerBudgetMs'] == 1500000, 'FUNCTIONAL_NOT_CLOSED'
    assert close['sourceRevision'] == revision and close['runId'] == scope['functionalRunId'] and close['functionalResultSha256'] == result_hash and close['requestSha256'] == scope['functionalRequestSha256'] and close['rootPublisherSha256'] == scope['rootPublisherSha256'] and close['rootValidatorSha256'] == scope['rootValidatorSha256'], 'FUNCTIONAL_CLOSE_UNBOUND'
    state, _ = read(RUNTIME / 'status-secret.json')
    assert state['API_URL'] == scope['supabaseUrl'] and sha(state['ANON_KEY'].encode()) == scope['anonKeySha256'] and sha(state['SERVICE_ROLE_KEY'].encode()) == scope['serviceKeySha256'], 'RUNTIME_KEYS_CHANGED'
    proof_dir = private_dir(RUNTIME / 'capacity-root-proofs' / plan_id)
    host_listeners()
    frozen(revision)
    return {**approval, 'journal': journal, 'functional': functional, 'proofs': proof_dir}


def database_environment():
    state, _ = read(RUNTIME / 'status-secret.json')
    target = urllib.parse.urlsplit(state['DB_URL'])
    assert target.hostname == '127.0.0.1' and target.port == 58322 and target.path == '/postgres' and target.username and target.password, 'DATABASE_TARGET_INVALID'
    return {**ENV, 'PGHOST': '127.0.0.1', 'PGPORT': '58322', 'PGDATABASE': 'postgres', 'PGUSER': urllib.parse.unquote(target.username), 'PGPASSWORD': urllib.parse.unquote(target.password), 'PGSSLMODE': 'disable', 'PGCONNECT_TIMEOUT': '5', 'PGOPTIONS': '-c default_transaction_read_only=on'}


def query(sql):
    assert sql.startswith('begin read only;') and sql.rstrip().endswith('rollback;'), 'QUERY_NOT_READ_ONLY'
    return json.loads(command([str(RUNTIME.parent / 'host-client/bin/psql'), '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1'], database_environment(), sql))


def snapshot(scope):
    members = {
        'auth': "select id::text, email, created_at as \"createdAt\", email_confirmed_at as \"emailConfirmedAt\" from auth.users order by id",
        'profiles': 'select id::text, role::text, login_account as "loginAccount" from public.profiles order by id',
        'classrooms': 'select id::text, owner_teacher_id::text as "ownerId", status::text from public.classrooms order by id',
        'memberships': 'select classroom_id::text as "classroomId",user_id::text as "userId",member_role::text as role,status::text from public.classroom_members order by classroom_id,user_id',
    }
    for table in ['xp_transactions', 'wallet_transactions']:
        members[table] = "select id::text,user_id::text as \"userId\",encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') as digest from public." + table + ' t order by id'
    fields = ["'checkedAtDatabaseUtc',transaction_timestamp()", "'systemIdentifier',(select system_identifier::text from pg_control_system())", "'migrations',(select count(*) from supabase_migrations.schema_migrations)", "'publicTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')", "'publicWithoutRls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity)"]
    for name, select_sql in members.items():
        fields.append("'%s',(select coalesce(json_agg(t),'[]'::json) from (%s) t)" % (name, select_sql))
    sql = "begin read only;set local statement_timeout='10s';select json_build_object(" + ','.join(fields) + ');rollback;'
    result = query(sql)
    identity = PROJECT + ':' + result['systemIdentifier'] + ':postgres'
    assert sha(identity.encode()) == scope['databaseIdentitySha256'] and result['migrations'] == 123 and result['publicTables'] == 71 and result['publicWithoutRls'] == 0, 'DATABASE_IDENTITY_INVALID'
    utc(result['checkedAtDatabaseUtc'])
    result['querySha256'] = sha(sql.encode())
    return result


def functional_roster(ctx):
    plan, _ = read(ctx['functional'] / 'identity-plan.json')
    assert plan['runId'] == ctx['scope']['functionalRunId'], 'FUNCTIONAL_PLAN_INVALID'
    result = {}
    for label in ['T1', 'T2', 'S1', 'S2', 'A1', 'R1']:
        identity = plan['identities'][label]
        if label == 'R1':
            confirmed, _ = read(ctx['functional'] / 'r1-active-password-confirmed.json')
        else:
            confirmed, _ = read(ctx['functional'] / ('create-' + label.lower() + '-confirmed.json'))
        confirmed = confirmed['identity']
        assert all(confirmed[key] == identity[key] for key in ['label', 'email', 'account']), 'FUNCTIONAL_IDENTITY_CHANGED'
        uid(confirmed['userId'])
        result[label] = {'id': confirmed['userId'], 'email': identity['email'], 'account': identity['account'], 'role': 'teacher' if label in ['T1', 'T2'] else 'admin' if label == 'A1' else 'student'}
    assert len({r['id'] for r in result.values()}) == 6, 'FUNCTIONAL_IDENTITIES_DUPLICATED'
    return result


def owned_roster(ctx):
    roster = functional_roster(ctx)
    for path in sorted(ctx['proofs'].glob('capture-*.json')):
        proof, _ = read(path)
        if proof['output']['ownership'] != 'OWNED_BY_OTP_INTENT':
            continue
        actor = proof['actor']
        row = {'id': proof['output']['authUserId'], 'email': actor['email'], 'account': actor['account'], 'role': 'student'}
        previous = roster.get(actor['alias'])
        assert previous is None or previous == row, 'OWNERSHIP_CHANGED'
        roster[actor['alias']] = row
    return roster


def assert_all_owned(snapshot, roster):
    expected = {row['id']: row for row in roster.values()}
    assert len(expected) == len(roster) and len(snapshot['auth']) == len(expected), 'UNOWNED_OR_MISSING_AUTH'
    assert all(row['id'] in expected and row['email'] == expected[row['id']]['email'] for row in snapshot['auth']), 'AUTH_OWNERSHIP_INVALID'
    assert {row['id'] for row in snapshot['profiles']} == set(expected), 'UNOWNED_OR_MISSING_PROFILE'
    assert all(row['role'] == expected[row['id']]['role'] and row['loginAccount'] == expected[row['id']]['account'] for row in snapshot['profiles']), 'OWNED_PROFILE_CHANGED'
    assert all(row['userId'] in expected for table in ['xp_transactions', 'wallet_transactions'] for row in snapshot[table]), 'UNOWNED_LEDGER'
    assert all(row['ownerId'] in expected and expected[row['ownerId']]['role'] == 'teacher' for row in snapshot['classrooms']), 'UNOWNED_CLASS'
    assert all(row['userId'] in expected and row['classroomId'] in {c['id'] for c in snapshot['classrooms']} for row in snapshot['memberships']), 'UNOWNED_MEMBERSHIP'
