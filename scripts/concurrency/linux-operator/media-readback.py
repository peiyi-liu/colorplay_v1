"""Root-only, fixed-Local READ ONLY catalog + bounded owned-object verification."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import stat
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from linux_runtime_common import require_linux, private_json

RUNTIME = Path(__file__).resolve().parent
CANON = runpy.run_path(str(RUNTIME / 'canonical-baseline.py'), run_name='_root_canonical')
MAX_BODY = 2_097_152
ATTEMPT_DIRECTORY = None
PHASE = 'PREFLIGHT'
OUT_KEYS = {'verifiedRuns', 'abortedRuns', 'assets', 'variants', 'masterObjects', 'variantObjects', 'quarantineObjects'}


def fixed_json(path, maximum=131072):
    return private_json(path,maximum)[0]

def uid(value):
    assert isinstance(value, str) and str(uuid.UUID(value)) == value
    return value


def digest(value):
    assert isinstance(value, str) and re.fullmatch('[a-f0-9]{64}', value)
    return value


def quote(value):
    # SQL is sent on stdin, never interpolated into shell code or argv.
    assert isinstance(value, str) and '\x00' not in value
    return "'" + value.replace("'", "''") + "'"


def validate_plan(data, approval, owned):
    assert set(data) == {'scopeRunId', 'actorId', 'runs', 'draftIds', 'expected'}
    assert re.fullmatch('wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}', data['scopeRunId'])
    uid(data['actorId'])
    assert data['scopeRunId'] == approval['runId'] == owned['scopeRunId']
    assert data['actorId'] == owned['actorId']
    assert data['expected'] == approval['expected'] and set(data['expected']) == OUT_KEYS
    assert all(type(n) is int and 0 <= n <= 30 for n in data['expected'].values())
    assert data['expected']['quarantineObjects'] == 0
    assert 4 <= len(data['runs']) <= 9 and len(data['draftIds']) == 2
    assert len(set(data['draftIds'])) == 2
    for value in data['draftIds']: uid(value)
    slots = approval['slots']
    sources = {row['slot']: row for row in owned['sources']}
    assert len(sources) == len(owned['sources']) and set(sources) == set(slots)
    assert set(row['slot'] for row in data['runs']) == set(slots)
    assert len(data['runs']) == len(slots)
    run_ids, request_ids, assets = set(), set(), set()
    verified = aborted = variants = 0
    for run in data['runs']:
        assert set(run) == {'slot', 'runId', 'requestId', 'authSessionId', 'expectedStatus', 'receipt', 'semanticRole', 'sourceSha256'}
        assert re.fullmatch('[a-z][a-z0-9-]{0,30}', run['slot'])
        for key in ('runId', 'requestId', 'authSessionId'): uid(run[key])
        assert run['authSessionId'] == owned['authSessionId']
        assert run['runId'] not in run_ids and run['requestId'] not in request_ids
        run_ids.add(run['runId']); request_ids.add(run['requestId'])
        assert run['expectedStatus'] == slots[run['slot']]['expectedStatus']
        source = sources[run['slot']]
        assert source['filename'].startswith(data['scopeRunId'] + '-')
        assert len(source['filename']) <= 180 and '/' not in source['filename']
        assert type(source['bytes']) is int and 0 < source['bytes'] <= MAX_BODY
        digest(source['sha256'])
        assert digest(run['sourceSha256']) == source['sha256']
        assert run['semanticRole'] == slots[run['slot']]['semanticRole']
        assert run['semanticRole'] in ('standard', 'color_critical')
        if 'semanticRole' in source: assert source['semanticRole'] == run['semanticRole']
        if run['expectedStatus'] == 'aborted':
            aborted += 1; assert run['receipt'] is None; continue
        assert run['expectedStatus'] == 'verified'
        verified += 1; asset = run['receipt']
        assert set(asset) == {'asset_id', 'has_alpha', 'height', 'manifest_sha256', 'semantic_role', 'source_sha256', 'variants', 'width'}
        uid(asset['asset_id']); assert asset['asset_id'] not in assets; assets.add(asset['asset_id'])
        assert asset['semantic_role'] == slots[run['slot']]['semanticRole']
        assert type(asset['has_alpha']) is bool
        assert asset['width'] == asset['height'] == 64
        assert digest(asset['source_sha256']) == source['sha256']; digest(asset['manifest_sha256'])
        kinds = {'thumbnail', 'reading'} | ({'color_critical'} if asset['semantic_role'] == 'color_critical' else set())
        assert asset['semantic_role'] in ('standard', 'color_critical')
        assert {v['kind'] for v in asset['variants']} == kinds and len(asset['variants']) == len(kinds)
        for variant in asset['variants']:
            assert set(variant) == {'bytes', 'height', 'kind', 'mime_type', 'sha256', 'width'}
            digest(variant['sha256']); assert variant['mime_type'] == 'image/webp'
            for dimension in ('width', 'height'): assert type(variant[dimension]) is int and 0 < variant[dimension] <= 4096
            assert type(variant['bytes']) is int and 0 < variant['bytes'] <= 256000
        variants += len(kinds)
    derived = dict(verifiedRuns=verified, abortedRuns=aborted, assets=verified,
                   variants=variants, masterObjects=verified, variantObjects=variants, quarantineObjects=0)
    assert verified >= 3 and aborted >= 1 and data['expected'] == derived
    if 'single-duplicate' in slots:
        first = next(row for row in data['runs'] if row['slot'] == 'single')
        duplicate = next(row for row in data['runs'] if row['slot'] == 'single-duplicate')
        assert first['expectedStatus'] == duplicate['expectedStatus'] == 'verified'
        assert first['semanticRole'] == duplicate['semanticRole'] == 'standard'
        assert sources['single']['filename'] != sources['single-duplicate']['filename']
        assert sources['single']['sha256'] == sources['single-duplicate']['sha256']
        assert sources['single']['bytes'] == sources['single-duplicate']['bytes']
        for key in ('runId', 'requestId'):
            assert first[key] != duplicate[key]
        assert first['receipt']['asset_id'] != duplicate['receipt']['asset_id']
        for key in ('source_sha256', 'manifest_sha256', 'semantic_role', 'width', 'height', 'has_alpha', 'variants'):
            assert first['receipt'][key] == duplicate['receipt'][key]
    return sources


def database_environment(state):
    url = urllib.parse.urlsplit(state['DB_URL'])
    assert url.hostname == '127.0.0.1' and url.port == 58322 and url.path == '/postgres'
    return {**CANON['ENV'], 'PGHOST': '127.0.0.1', 'PGPORT': '58322', 'PGDATABASE': 'postgres',
            'PGUSER': urllib.parse.unquote(url.username), 'PGPASSWORD': urllib.parse.unquote(url.password),
            'PGSSLMODE': 'disable', 'PGCONNECT_TIMEOUT': '5', 'PGOPTIONS': '-c default_transaction_read_only=on'}


def query(sql, env):
    assert sql.startswith('begin read only;') and sql.rstrip().endswith('rollback;')
    result = subprocess.run([str(RUNTIME.parent / 'host-client/bin/psql'), '--no-psqlrc', '--quiet',
                             '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1'],
                            input=sql, env=env, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0 and len(result.stdout) <= 131072, 'ROOT_READ_FAILED'
    return json.loads(result.stdout)


def media_sql(actor, run_id):
    actor, marker = quote(uid(actor)) + '::uuid', quote(run_id)
    return '''begin read only;
set local statement_timeout='10s';
set local standard_conforming_strings=on;
select json_build_object(
 'ownerMatch',exists(select 1 from auth.users where id=ACTOR and raw_user_meta_data->>'whole_site_run_id'=MARKER and raw_user_meta_data->>'whole_site_label'='A1'),
 'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from (select id,asset_id,actor_user_id,auth_session_id,request_id,source_filename,source_mime_type,source_bytes,semantic_role,quarantine_object_path,status from public.content_media_upload_runs where actor_user_id=ACTOR) r),
 'assets',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from (select id,upload_run_id,source_sha256,manifest_sha256,source_mime_type,source_bytes,width,height,has_alpha,semantic_role,master_object_path,created_by from public.content_media_assets where created_by=ACTOR) a),
 'variants',(select coalesce(jsonb_agg(to_jsonb(v) order by v.asset_id,v.kind),'[]'::jsonb) from (select asset_id,kind,object_path,sha256,mime_type,width,height,bytes from public.content_media_variants where asset_id in (select id from public.content_media_assets where created_by=ACTOR)) v),
 'drafts',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb) from (select id,entity_type,entity_id,stable_code,source,actor_user_id,coalesce((select jsonb_agg(item->>'manifest_id') from jsonb_array_elements(payload->'media') item),'[]'::jsonb) manifests from public.content_drafts where actor_user_id=ACTOR) d),
 'objects',(select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'name',o.name) order by o.bucket_id,o.name),'[]'::jsonb) from storage.objects o where
   (o.bucket_id='content-media-quarantine' and o.name in (select quarantine_object_path from public.content_media_upload_runs where actor_user_id=ACTOR)) or
   (o.bucket_id='content-media' and exists(select 1 from public.content_media_assets a where a.created_by=ACTOR and (o.name like 'masters/'||a.id::text||'/%' or o.name like 'variants/'||a.id::text||'/%'))))
);
rollback;
'''.replace('ACTOR', actor).replace('MARKER', marker)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise AssertionError('ROOT_STORAGE_REDIRECT_REJECTED')


def download(state, bucket, path, maximum, absent=False):
    assert bucket in ('content-media', 'content-media-quarantine')
    assert isinstance(path, str) and 0 < len(path) <= 500
    assert not any(part in ('', '.', '..') for part in path.split('/'))
    url = state['API_URL'] + '/storage/v1/object/' + bucket + '/' + urllib.parse.quote(path, safe='/')
    assert urllib.parse.urlsplit(url).netloc == '127.0.0.1:58321'
    request = urllib.request.Request(url, headers={'apikey': state['SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + state['SERVICE_ROLE_KEY']})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        response = opener.open(request, timeout=15)
    except urllib.error.HTTPError as error:
        with error:
            assert absent and error.code in (400, 404), 'ROOT_STORAGE_READ_FAILED'
            raw = error.read(4097)
            assert len(raw) <= 4096, 'ROOT_STORAGE_ERROR_OVERSIZE'
            payload = json.loads(raw)
            assert set(payload) == {'statusCode', 'error', 'message'}
            assert str(payload['statusCode']) == '404'
            assert payload['error'] in ('not_found', 'Not Found')
            assert payload['message'] == 'Object not found', 'ROOT_STORAGE_NOT_ABSENT'
        return None
    with response:
        assert not absent and response.status == 200
        body = response.read(maximum + 1)
        assert 0 < len(body) <= maximum, 'ROOT_STORAGE_SIZE_INVALID'
        return len(body), hashlib.sha256(body).hexdigest(), response.headers.get_content_type()


def verify_catalog(data, catalog, sources, owned):
    assert catalog['ownerMatch'] is True
    assert len(catalog['runs']) == len(data['runs'])
    runs = {r['id']: r for r in catalog['runs']}
    assets = {r['id']: r for r in catalog['assets']}
    expected_assets = {r['receipt']['asset_id'] for r in data['runs'] if r['receipt']}
    assert set(assets) == expected_assets and len(assets) == len(catalog['assets'])
    objects = []
    quarantine = []
    for planned in data['runs']:
        actual = runs[planned['runId']]; source = sources[planned['slot']]
        assert actual['actor_user_id'] == data['actorId']
        assert actual['request_id'] == planned['requestId'] and actual['auth_session_id'] == planned['authSessionId']
        assert actual['source_filename'] == source['filename'] and actual['source_bytes'] == source['bytes']
        assert actual['source_mime_type'] == 'image/png' and actual['status'] == planned['expectedStatus']
        assert actual['semantic_role'] == planned['semanticRole'] and planned['sourceSha256'] == source['sha256']
        quarantine.append(actual['quarantine_object_path'])
        if planned['receipt'] is None: assert actual['asset_id'] not in assets; continue
        receipt = planned['receipt']; asset = assets[receipt['asset_id']]
        assert actual['asset_id'] == asset['id'] and asset['upload_run_id'] == actual['id']
        assert asset['created_by'] == data['actorId'] and asset['source_bytes'] == source['bytes'] and asset['source_mime_type'] == 'image/png'
        for field in ('source_sha256', 'manifest_sha256', 'semantic_role', 'width', 'height', 'has_alpha'): assert asset[field] == receipt[field]
        assert asset['master_object_path'] == 'masters/' + asset['id'] + '/' + source['sha256'] + '.png'
        objects.append((asset['master_object_path'], source['bytes'], source['sha256'], 'image/png'))
        actual_variants = [v for v in catalog['variants'] if v['asset_id'] == asset['id']]
        assert len(actual_variants) == len(receipt['variants'])
        for expected in receipt['variants']:
            matching = [v for v in actual_variants if v['kind'] == expected['kind']]
            assert len(matching) == 1; variant = matching[0]
            for field in expected: assert variant[field] == expected[field]
            assert variant['object_path'] == 'variants/' + asset['id'] + '/' + variant['kind'] + '-' + variant['sha256'] + '.webp'
            objects.append((variant['object_path'], variant['bytes'], variant['sha256'], 'image/webp'))
    assert len(catalog['variants']) == data['expected']['variants']
    assert len(catalog['drafts']) == len(data['draftIds'])
    assert {d['id'] for d in catalog['drafts']} == set(data['draftIds'])
    assert {d['stable_code'] for d in catalog['drafts']} == set(owned['stableCodes'])
    zip_assets = {r['receipt']['asset_id'] for r in data['runs'] if r['slot'] in ('zip1', 'zip2') and r['receipt']}
    for draft in catalog['drafts']:
        assert draft['actor_user_id'] == data['actorId'] and draft['source'] == 'import'
        assert draft['entity_type'] == 'review_card' and draft['entity_id'] is None
        assert len(draft['manifests']) == 1 and draft['manifests'][0] in zip_assets
    assert {d['manifests'][0] for d in catalog['drafts']} == zip_assets
    assert len(catalog['objects']) == len(objects)
    assert {(o['bucket'], o['name']) for o in catalog['objects']} == {('content-media', o[0]) for o in objects}
    return objects, quarantine


def main():
    require_linux()
    global ATTEMPT_DIRECTORY, PHASE
    assert len(sys.argv) == 3, 'EXACT_REVISION_AND_PRIVATE_JOURNAL_REQUIRED'
    revision, directory_text = sys.argv[1:]
    assert re.fullmatch('[a-f0-9]{40}', revision) and CANON['current_revision']() == revision
    directory = Path(directory_text)
    assert directory.is_absolute() and directory.resolve() == directory
    assert directory.parent == RUNTIME / 'functional-private'
    info = directory.stat(); assert stat.S_ISDIR(info.st_mode) and info.st_mode & 0o777 == 0o700 and info.st_uid == os.getuid()
    run_id = directory.name
    assert re.fullmatch('wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}', run_id)
    data_text = sys.stdin.read(65537); assert len(data_text.encode()) <= 65536
    data = json.loads(data_text)
    review = fixed_json(RUNTIME / 'reviewed-candidate.json')
    assert review['result'] == 'ACCEPTED_FOR_LOCAL_VALIDATION' and review['sourceRevision'] == revision
    approval = fixed_json(RUNTIME / ('media-approval-' + run_id + '.json'))
    baseline = fixed_json(RUNTIME / ('canonical-baseline-' + run_id + '.json'))
    for receipt in (approval, baseline):
        assert receipt['sourceRevision'] == revision and receipt['runId'] == run_id and receipt['projectId'] == 'cp-whole-site-261115'
    assert baseline['result'] == 'CANONICAL_BASELINE_CAPTURED'
    assert data == fixed_json(directory / 'media-readback-approved-plan.json')
    owned = fixed_json(directory / 'media-owned-plan.json')
    sources = validate_plan(data, approval, owned)
    created = fixed_json(directory / 'create-a1-confirmed.json')['identity']
    assert created['userId'] == data['actorId'] and created['label'] == 'A1'
    for row in data['runs']:
        intent = fixed_json(directory / ('media-' + row['slot'] + '-intent.json'))
        begun = fixed_json(directory / ('media-' + row['slot'] + '-begun.json'))
        assert intent['actorId'] == begun['actorId'] == data['actorId']
        assert intent['requestId'] == begun['requestId'] == row['requestId'] and begun['runId'] == row['runId']
        assert intent['source'] == sources[row['slot']]
    confirmed = fixed_json(directory / 'media-owned-drafts-confirmed.json')['drafts']
    assert {row['draftId'] for row in confirmed} == set(data['draftIds'])
    output_file = directory / 'media-root-readback.json'
    assert not output_file.exists() and not (directory / 'media-root-readback-failed.json').exists(), 'PRIOR_ORACLE_ATTEMPT_EXISTS'
    owner = fixed_json(RUNTIME / 'ownership.json'); state = fixed_json(RUNTIME / 'status-secret.json')
    assert owner['projectId'] == 'cp-whole-site-261115' and state['API_URL'] == owner['apiUrl'] == 'http://127.0.0.1:58321'
    env = database_environment(state)
    intent_file = directory / 'media-root-readback-intent.json'
    assert not intent_file.exists(), 'PRIOR_ORACLE_ATTEMPT_EXISTS'
    with intent_file.open('x') as stream:
        os.chmod(intent_file, 0o600)
        json.dump({'sourceRevision': revision, 'runId': run_id, 'readOnly': True, 'inputSha256': hashlib.sha256(data_text.encode()).hexdigest()}, stream)
    ATTEMPT_DIRECTORY = directory
    PHASE = 'CANONICAL_BEFORE'
    current = query(CANON['digest_sql'](), env)
    assert digest(current['canonicalSha256']) == digest(baseline['canonicalSha256']), 'CANONICAL_CONTENT_CHANGED'
    sql = media_sql(data['actorId'], run_id)
    PHASE = 'OWNED_CATALOG'
    objects, quarantine = verify_catalog(data, query(sql, env), sources, owned)
    for path, size, expected_hash, mime in objects:
        PHASE = 'MASTER_BYTES' if path.startswith('masters/') else 'VARIANT_BYTES'
        assert download(state, 'content-media', path, min(size, MAX_BODY)) == (size, expected_hash, mime), 'OWNED_OBJECT_HASH_MISMATCH'
    PHASE = 'QUARANTINE_ABSENCE'
    for path in quarantine: download(state, 'content-media-quarantine', path, 4096, absent=True)
    PHASE = 'CANONICAL_AFTER'
    assert query(CANON['digest_sql'](), env)['canonicalSha256'] == baseline['canonicalSha256'], 'CANONICAL_CONTENT_CHANGED'
    assert CANON['current_revision']() == revision
    result = {**data['expected'], 'hashesMatch': True, 'canonicalUnchanged': True}
    receipt = {'result': 'ROOT_MEDIA_READBACK_VERIFIED', 'sourceRevision': revision, 'runId': run_id,
               'projectId': owner['projectId'], 'readOnly': True, 'rawPathsStored': False,
               'recordedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'querySha256': hashlib.sha256(sql.encode()).hexdigest(), 'readback': result}
    with output_file.open('x') as stream:
        os.chmod(output_file, 0o600); json.dump(receipt, stream, indent=2); stream.write('\n')
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        result = {'result': 'ROOT_MEDIA_READBACK_BLOCKED', 'errorClass': type(error).__name__, 'phase': PHASE, 'rawLogsStored': False}
        if ATTEMPT_DIRECTORY and not (ATTEMPT_DIRECTORY / 'media-root-readback.json').exists():
            failed_file = ATTEMPT_DIRECTORY / 'media-root-readback-failed.json'
            if not failed_file.exists():
                with failed_file.open('x') as stream:
                    os.chmod(failed_file, 0o600); json.dump(result, stream); stream.write('\n')
        print(json.dumps(result))
        raise SystemExit(1) from None
