begin;

set local search_path = public, extensions;

select plan(44);

select has_table('public', 'content_import_upload_runs',
  'trusted import upload receipts exist');
select has_table('public', 'content_import_runs',
  'trusted import preview and commit receipts exist');
select is((select public::text from storage.buckets
  where id = 'content-import-quarantine'), 'false',
  'import quarantine storage is private');
select is((select file_size_limit::text from storage.buckets
  where id = 'content-import-quarantine'), '10485760',
  'import quarantine enforces the ten MiB package limit');
select ok(not has_table_privilege(
  'authenticated', 'public.content_import_upload_runs', 'SELECT'),
  'authenticated clients cannot inspect upload receipts');
select ok(not has_table_privilege(
  'authenticated', 'public.content_import_runs', 'SELECT'),
  'authenticated clients cannot inspect normalized import payloads');
select ok(has_function_privilege(
  'authenticated',
  'public.admin_begin_content_import_upload(uuid,text,text,integer)',
  'EXECUTE'), 'authenticated callers can reach the authorized begin command');
select ok(has_function_privilege(
  'authenticated',
  'public.admin_preview_content_import_v2(uuid,text,text,jsonb)',
  'EXECUTE'), 'authenticated callers can reach the authorized preview command');
select ok(not has_function_privilege(
  'authenticated',
  'public.svc_finish_content_import_upload(uuid,uuid,uuid,text)',
  'EXECUTE'), 'browser clients cannot finalize upload receipts');
select ok(not has_function_privilege(
  'authenticated', 'public.svc_verify_content_import_media(jsonb)',
  'EXECUTE'), 'browser clients cannot assert trusted media integrity');

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(public.admin_begin_content_import_upload(
  '77000000-0000-4000-8000-000000000001', 'student.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 128
) ->> 'code', 'STALE_PRIVILEGED_SESSION',
  'a student cannot begin an import upload');
select is(public.admin_preview_content_import_v2(
  '77000000-0000-4000-8000-000000000002', repeat('a', 64), 'student.xlsx',
  jsonb_build_array(jsonb_build_object(
    'entity_type', 'review_card', 'stable_code', 'RC-STUDENT',
    'payload', jsonb_build_object('subtopic_code', 'sheet-3-1-all')
  ))
) ->> 'code', 'STALE_PRIVILEGED_SESSION',
  'a student cannot preview normalized import rows');

reset role;
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
set local role authenticated;

select set_config('pgtap.import_begin',
  public.admin_begin_content_import_upload(
    '77000000-0000-4000-8000-000000000003', 'chapter-3.zip',
    'application/zip', 4096)::text, true);
select is(current_setting('pgtap.import_begin')::jsonb ->> 'outcome', 'ok',
  'an Admin with fresh MFA begins one import upload');
select ok((current_setting('pgtap.import_begin')::jsonb ->> 'object_path') like
  'aa000000-0000-0000-0000-000000000001/%/package.zip',
  'the quarantine key is server-generated and actor scoped');
select is(public.admin_begin_content_import_upload(
  '77000000-0000-4000-8000-000000000003', 'chapter-3.zip',
  'application/zip', 4096) ->> 'replayed', 'true',
  'an exact begin retry returns the original upload run');
select is(public.admin_begin_content_import_upload(
  '77000000-0000-4000-8000-000000000003', 'changed.zip',
  'application/zip', 4096) ->> 'code', 'IDEMPOTENCY_CONFLICT',
  'a reused begin request cannot change its package metadata');
select is(public.admin_begin_content_import_upload(
  '77000000-0000-4000-8000-000000000004', '../escape.zip',
  'application/zip', 4096) ->> 'code', 'CONTENT_VALIDATION_FAILED',
  'client filenames cannot escape the run-scoped object path');
select is(public.admin_begin_content_import_upload(
  '77000000-0000-4000-8000-000000000017', 'mismatch.xlsx',
  'application/zip', 4096) ->> 'code', 'CONTENT_VALIDATION_FAILED',
  'declared MIME and source filename extension must agree');

reset role;
set local role service_role;
select is(public.svc_verify_content_import_media(jsonb_build_array(
  jsonb_build_object('asset_id', 'not-a-uuid',
    'source_sha256', repeat('a', 64), 'semantic_role', 'standard')
  ))::text, 'false',
  'malformed media mappings fail closed without a UUID cast error');

reset role;
select set_config('pgtap.draft_count_before',
  (select count(*)::text from public.content_drafts), true);
select set_config('pgtap.published_count_before',
  (select count(*)::text from public.review_cards
    where stable_code = 'RC-IMPORT-TEST'), true);
set local role authenticated;

select set_config('pgtap.import_preview',
  public.admin_preview_content_import_v2(
    '77000000-0000-4000-8000-000000000005', repeat('b', 64),
    'chapter-3.xlsx', jsonb_build_array(jsonb_build_object(
      'entity_type', 'review_card', 'stable_code', 'RC-IMPORT-TEST',
      'payload', jsonb_build_object(
        'subtopic_code', 'sheet-3-1-all', 'group_label', '3-1',
        'title', '匯入草稿', 'content', '僅建立草稿，不直接發布。',
        'requires_recompletion', false, 'sort_order', 998,
        'media', '[]'::jsonb)
    )))::text, true);
select is(current_setting('pgtap.import_preview')::jsonb ->> 'outcome', 'ok',
  'a valid Chapter 3 package receives a dry preview');
select is(current_setting('pgtap.import_preview')::jsonb ->> 'create_count', '1',
  'the preview classifies a new stable code as create');
select is(current_setting('pgtap.import_preview')::jsonb ->> 'error_count', '0',
  'the valid preview has no row errors');

reset role;
select is((select count(*)::text from public.content_drafts),
  current_setting('pgtap.draft_count_before'),
  'preview writes no content drafts');

set local role authenticated;
select is(public.admin_preview_content_import_v2(
  '77000000-0000-4000-8000-000000000005', repeat('b', 64),
  'chapter-3.xlsx', jsonb_build_array(jsonb_build_object(
    'entity_type', 'review_card', 'stable_code', 'RC-IMPORT-TEST',
    'payload', jsonb_build_object(
      'subtopic_code', 'sheet-3-1-all', 'group_label', '3-1',
      'title', '匯入草稿', 'content', '僅建立草稿，不直接發布。',
      'requires_recompletion', false, 'sort_order', 998,
      'media', '[]'::jsonb)
  ))) ->> 'replayed', 'true',
  'an exact preview retry returns the original run');
select is(public.admin_preview_content_import_v2(
  '77000000-0000-4000-8000-000000000005', repeat('c', 64),
  'chapter-3.xlsx', jsonb_build_array(jsonb_build_object(
    'entity_type', 'review_card', 'stable_code', 'RC-IMPORT-TEST',
    'payload', '{}'::jsonb
  ))) ->> 'code', 'IDEMPOTENCY_CONFLICT',
  'a reused preview request cannot change normalized content');

select set_config('pgtap.import_commit', public.admin_commit_content_import_v2(
  (current_setting('pgtap.import_preview')::jsonb ->> 'run_id')::uuid,
  '77000000-0000-4000-8000-000000000006', false)::text, true);
select is(current_setting('pgtap.import_commit')::jsonb ->> 'outcome', 'ok',
  'commit creates drafts from the accepted preview');

reset role;
select is((select source from public.content_drafts
  where stable_code = 'RC-IMPORT-TEST'), 'import',
  'a successful import creates an import-sourced draft');
select is((select count(*)::text from public.review_cards
  where stable_code = 'RC-IMPORT-TEST'),
  current_setting('pgtap.published_count_before'),
  'import commit never publishes the new row');

set local role authenticated;
select is(public.admin_commit_content_import_v2(
  (current_setting('pgtap.import_preview')::jsonb ->> 'run_id')::uuid,
  '77000000-0000-4000-8000-000000000006', false) ->> 'replayed', 'true',
  'an exact commit retry returns the immutable receipt');
select is(public.admin_commit_content_import_v2(
  (current_setting('pgtap.import_preview')::jsonb ->> 'run_id')::uuid,
  '77000000-0000-4000-8000-000000000007', false) ->> 'code',
  'IDEMPOTENCY_CONFLICT',
  'a committed run rejects a different request id');

select set_config('pgtap.invalid_preview',
  public.admin_preview_content_import_v2(
    '77000000-0000-4000-8000-000000000008', repeat('d', 64),
    'invalid.xlsx', jsonb_build_array(jsonb_build_object(
      'entity_type', 'review_card', 'stable_code', 'RC-IMPORT-BAD',
      'payload', jsonb_build_object(
        'subtopic_code', 'missing-subtopic', 'group_label', '3-1',
        'title', '無效匯入', 'content', '父層不存在。',
        'requires_recompletion', false, 'sort_order', 999,
        'media', '[]'::jsonb)
    )))::text, true);
select is(current_setting('pgtap.invalid_preview')::jsonb ->> 'error_count', '1',
  'an invalid parent is reported before any draft mutation');
select is(public.admin_commit_content_import_v2(
  (current_setting('pgtap.invalid_preview')::jsonb ->> 'run_id')::uuid,
  '77000000-0000-4000-8000-000000000009', true) ->> 'code',
  'CONTENT_VALIDATION_FAILED',
  'one invalid row blocks the whole package commit');

reset role;
select is((select count(*)::text from public.content_drafts
  where stable_code = 'RC-IMPORT-BAD'), '0',
  'a blocked package leaves zero partial drafts');

set local role authenticated;
select set_config('pgtap.stale_preview',
  public.admin_preview_content_import_v2(
    '77000000-0000-4000-8000-000000000012', repeat('f', 64),
    'stale.xlsx', jsonb_build_array(jsonb_build_object(
      'entity_type', 'review_card', 'stable_code', 'RC-IMPORT-RACE',
      'payload', jsonb_build_object(
        'subtopic_code', 'sheet-3-1-all', 'group_label', '3-1',
        'title', '匯入競態', 'content', '預覽內容。',
        'requires_recompletion', false, 'sort_order', 997,
        'media', '[]'::jsonb)
    )))::text, true);
select is(public.admin_save_content_draft(
  null, null, 'review_card', 'RC-IMPORT-RACE', 0,
  jsonb_build_object(
    'subtopic_id', (select id from public.subtopics
      where stable_code = 'sheet-3-1-all'),
    'group_label', '3-1', 'title', '人工草稿', 'content', '較新的內容。',
    'requires_recompletion', false, 'sort_order', 997,
    'media', '[]'::jsonb),
  'manual', '77000000-0000-4000-8000-000000000013'
) ->> 'outcome', 'ok',
  'a concurrent manual draft can be created after import preview');
select is(public.admin_commit_content_import_v2(
  (current_setting('pgtap.stale_preview')::jsonb ->> 'run_id')::uuid,
  '77000000-0000-4000-8000-000000000014', false) ->> 'code',
  'CONTENT_IMPORT_STALE_PREVIEW',
  'commit rejects a preview made stale by a concurrent draft');

reset role;
select is((select source from public.content_drafts
  where stable_code = 'RC-IMPORT-RACE'), 'manual',
  'a stale import cannot overwrite the newer manual draft');

select set_config('pgtap.noop_items', (
  select jsonb_build_array(jsonb_build_object(
    'entity_type', 'review_card', 'stable_code', card.stable_code,
    'payload', ((content_private.current_entity('review_card', card.id)
      -> 'payload') - 'subtopic_id') || jsonb_build_object(
        'subtopic_code', subtopic.stable_code)
  ))::text
  from public.review_cards card
  join public.subtopics subtopic on subtopic.id = card.subtopic_id
  where card.stable_code = 'RC3102'
), true);

set local role authenticated;
select set_config('pgtap.noop_preview',
  public.admin_preview_content_import_v2(
    '77000000-0000-4000-8000-000000000015', repeat('1', 64),
    'noop.xlsx', current_setting('pgtap.noop_items')::jsonb
  )::text, true);
select is(current_setting('pgtap.noop_preview')::jsonb ->> 'no_op_count', '1',
  'an unchanged canonical row is classified as no-op');
select is(public.admin_commit_content_import_v2(
  (current_setting('pgtap.noop_preview')::jsonb ->> 'run_id')::uuid,
  '77000000-0000-4000-8000-000000000016', false) ->> 'outcome', 'ok',
  'a no-op package commits an immutable receipt without a draft write');

reset role;
select is((select count(*)::text from public.content_drafts
  where entity_type = 'review_card'
    and entity_id = (select id from public.review_cards
      where stable_code = 'RC3102')), '0',
  'no-op commit leaves current content without a redundant draft');

set local role authenticated;
select set_config('pgtap.update_preview',
  public.admin_preview_content_import_v2(
    '77000000-0000-4000-8000-000000000010', repeat('e', 64),
    'update.xlsx', jsonb_build_array(jsonb_build_object(
      'entity_type', 'review_card', 'stable_code', 'RC3101',
      'payload', jsonb_build_object(
        'subtopic_code', 'sheet-3-1-all', 'group_label', '1',
        'title', '色彩的分類', 'content', '匯入更新內容。',
        'requires_recompletion', false, 'sort_order', 1,
        'media', '[]'::jsonb)
    )))::text, true);
select is(current_setting('pgtap.update_preview')::jsonb ->> 'update_count', '1',
  'an existing stable code is classified as an update');
select is(current_setting('pgtap.update_preview')::jsonb ->> 'warning_count', '1',
  'updates produce an explicit confirmation warning');
select is(public.admin_commit_content_import_v2(
  (current_setting('pgtap.update_preview')::jsonb ->> 'run_id')::uuid,
  '77000000-0000-4000-8000-000000000011', false) ->> 'code',
  'CONTENT_IMPORT_CONFIRMATION_REQUIRED',
  'an update cannot commit without explicit warning confirmation');
select is(public.admin_commit_content_import_v2(
  (current_setting('pgtap.update_preview')::jsonb ->> 'run_id')::uuid,
  '77000000-0000-4000-8000-000000000011', true) ->> 'outcome', 'ok',
  'the same update commits after explicit confirmation');

reset role;
select is((select source from public.content_drafts
  where entity_type = 'review_card'
    and entity_id = (select id from public.review_cards
      where stable_code = 'RC3101')), 'import',
  'confirmed updates remain drafts and never bypass publication');

select * from finish();

rollback;
