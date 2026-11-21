"""Capture exact-candidate canonical digest on the fixed owned Local DB only."""

import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
from linux_runtime_common import require_linux, private_json, verify_local_profile, database_identity, host_listeners

RUNTIME = Path(__file__).resolve().parent
SOURCE = RUNTIME.parent.parent / 'colorplay-live-recovery'
TABLES = ('courses', 'chapters', 'sections', 'subtopics', 'questions',
          'question_options', 'question_hints', 'review_cards', 'quiz_templates', 'blooks')
ENV = {'PATH': '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE': '1'}


def digest_sql():
    # Table names are this constant whitelist, never caller-controlled. Answers
    # stay inside PostgreSQL; only a digest and non-sensitive row counts return.
    members = []
    counts = []
    for table in TABLES:
        members.append("'%s', (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) from public.%s t)" % (table, table))
        counts.append("'%s', (select count(*) from public.%s)" % (table, table))
    return "begin read only;\nset local statement_timeout='10s';\nselect json_build_object('canonicalSha256', encode(sha256(convert_to(jsonb_build_object(%s)::text, 'UTF8')), 'hex'), 'counts', json_build_object(%s));\nrollback;\n" % (', '.join(members), ', '.join(counts))


def current_revision():
    head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=SOURCE, env=ENV,
                          capture_output=True, text=True, timeout=10)
    clean = subprocess.run(['git', 'status', '--porcelain'], cwd=SOURCE, env=ENV,
                           capture_output=True, text=True, timeout=10)
    assert head.returncode == clean.returncode == 0 and not clean.stdout.strip(), 'SOURCE_NOT_FROZEN'
    return head.stdout.strip()


def main():
    require_linux()
    assert len(sys.argv) == 3, 'EXACT_REVISION_AND_RUN_REQUIRED'
    revision, run_id = sys.argv[1:]
    assert re.fullmatch('[a-f0-9]{40}', revision), 'REVISION_INVALID'
    assert re.fullmatch('[a-z0-9][a-z0-9-]{5,59}', run_id), 'RUN_ID_INVALID'
    review, _ = private_json(RUNTIME / 'reviewed-candidate.json')
    _, profile, _ = verify_local_profile(revision, review['executionProfileSha256'])
    assert database_identity() == profile['identity']['databaseIdentitySha256'], 'DATABASE_PROFILE_CHANGED'
    host_listeners()
    assert review['result'] == 'ACCEPTED_FOR_LOCAL_VALIDATION' and review['sourceRevision'] == revision
    assert current_revision() == revision, 'REVIEWED_REVISION_MISMATCH'
    owner, _ = private_json(RUNTIME / 'ownership.json')
    state, _ = private_json(RUNTIME / 'status-secret.json')
    assert owner['projectId'] == 'cp-whole-site-261115'
    assert state['API_URL'] == owner['apiUrl'] == 'http://127.0.0.1:58321'
    url = urllib.parse.urlsplit(state['DB_URL'])
    assert url.hostname == '127.0.0.1' and url.port == 58322 and url.path == '/postgres'
    target = RUNTIME / ('canonical-baseline-' + run_id + '.json')
    assert not target.exists(), 'PRIOR_CANONICAL_BASELINE_EXISTS'
    env = {**ENV, 'PGHOST': '127.0.0.1', 'PGPORT': '58322',
           'PGDATABASE': 'postgres', 'PGUSER': urllib.parse.unquote(url.username),
           'PGPASSWORD': urllib.parse.unquote(url.password), 'PGSSLMODE': 'disable',
           'PGCONNECT_TIMEOUT': '5', 'PGOPTIONS': '-c default_transaction_read_only=on'}
    sql = digest_sql()
    process = subprocess.run([str(RUNTIME.parent / 'host-client/bin/psql'),
                              '--no-psqlrc', '--quiet', '--tuples-only', '--no-align',
                              '--set=ON_ERROR_STOP=1'], input=sql, env=env,
                             capture_output=True, text=True, timeout=20)
    assert process.returncode == 0, 'CANONICAL_READ_FAILED'
    snapshot = json.loads(process.stdout)
    assert re.fullmatch('[a-f0-9]{64}', snapshot['canonicalSha256'])
    assert set(snapshot['counts']) == set(TABLES)
    assert all(type(v) is int and 0 <= v <= 100000 for v in snapshot['counts'].values())
    assert current_revision() == revision, 'SOURCE_CHANGED_DURING_READ'
    receipt = {'result': 'CANONICAL_BASELINE_CAPTURED', 'projectId': owner['projectId'],
               'sourceRevision': revision, 'runId': run_id, 'readOnly': True,
               'recordedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'querySha256': hashlib.sha256(sql.encode()).hexdigest(),
               'answerContentsReturned': False, **snapshot}
    with target.open('x') as stream:
        os.chmod(target, 0o600)
        json.dump(receipt, stream, indent=2)
        stream.write('\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'result': 'CANONICAL_BASELINE_BLOCKED',
                          'errorClass': type(error).__name__, 'rawLogsStored': False}))
        raise SystemExit(1) from None
