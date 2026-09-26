begin;

set local search_path = public, extensions;

select plan(32);

select has_table('public', 'content_media_upload_runs',
  'media upload commands have private run receipts');
select has_table('public', 'content_media_assets',
  'verified media manifests are persisted');
select has_table('public', 'content_media_variants',
  'verified responsive variants are persisted');
select has_column('public', 'review_card_media', 'manifest_id',
  'review-card media points to a verified manifest');

select is((select public::text from storage.buckets
  where id = 'content-media-quarantine'), 'false',
  'quarantine storage is private');
select is((select public::text from storage.buckets
  where id = 'content-media'), 'false',
  'delivery storage is private');
select is((select file_size_limit::text from storage.buckets
  where id = 'content-media-quarantine'), '2097152',
  'quarantine enforces the two MiB source limit');
select is((select allowed_mime_types::text from storage.buckets
  where id = 'content-media'), '{image/jpeg,image/png,image/webp}',
  'media buckets reject unapproved MIME declarations');

select ok(not has_table_privilege(
  'authenticated', 'public.content_media_upload_runs', 'SELECT'),
  'authenticated clients cannot inspect upload receipts');
select ok(not has_table_privilege(
  'authenticated', 'public.content_media_assets', 'SELECT'),
  'authenticated clients cannot read physical asset metadata');
select ok(not has_table_privilege(
  'authenticated', 'public.content_media_variants', 'SELECT'),
  'authenticated clients cannot read physical variant paths');
select ok(not has_function_privilege(
  'authenticated',
  'public.svc_complete_content_media_upload(uuid,uuid,uuid,text,text,text,integer,integer,boolean,text,text,jsonb)',
  'EXECUTE'), 'browser clients cannot finalize a verified manifest');
select ok(not has_function_privilege(
  'authenticated', 'public.svc_content_media_delivery(uuid,uuid[])',
  'EXECUTE'), 'browser clients cannot enumerate delivery object paths');
select ok(has_function_privilege(
  'authenticated',
  'public.admin_begin_content_media_upload(uuid,text,text,integer,text)',
  'EXECUTE'), 'authenticated callers can reach the authorized begin command');

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(public.admin_begin_content_media_upload(
  '76000000-0000-4000-8000-000000000001', 'student.png', 'image/png',
  128, 'standard') ->> 'code', 'STALE_PRIVILEGED_SESSION',
  'a student cannot start a trusted media upload');

reset role;
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
set local role authenticated;

select set_config('pgtap.media_begin', public.admin_begin_content_media_upload(
  '76000000-0000-4000-8000-000000000002', 'chapter-3.png', 'image/png',
  1024, 'standard')::text, true);
select is(current_setting('pgtap.media_begin')::jsonb ->> 'outcome', 'ok',
  'an Admin with fresh MFA starts one upload run');
select ok((current_setting('pgtap.media_begin')::jsonb ->> 'object_path') like
  'aa000000-0000-0000-0000-000000000001/%/source.png',
  'the quarantine key is server-generated and actor scoped');

select is(public.admin_begin_content_media_upload(
  '76000000-0000-4000-8000-000000000002', 'chapter-3.png', 'image/png',
  1024, 'standard') ->> 'replayed', 'true',
  'an exact begin retry returns the original run');
select is(public.admin_begin_content_media_upload(
  '76000000-0000-4000-8000-000000000002', 'changed.png', 'image/png',
  1024, 'standard') ->> 'code', 'IDEMPOTENCY_CONFLICT',
  'a reused request id cannot change the upload payload');
select is(public.admin_begin_content_media_upload(
  '76000000-0000-4000-8000-000000000003', '../escape.png', 'image/png',
  1024, 'standard') ->> 'code', 'CONTENT_MEDIA_FILE_INVALID',
  'client filenames cannot escape the run-scoped object path');

select set_config('pgtap.media_claim', public.admin_claim_content_media_upload(
  (current_setting('pgtap.media_begin')::jsonb ->> 'run_id')::uuid,
  '76000000-0000-4000-8000-000000000002')::text, true);
select is(current_setting('pgtap.media_claim')::jsonb ->> 'action', 'claim',
  'the same Admin session claims its exact upload run');

reset role;
set local role service_role;

select is(public.svc_complete_content_media_upload(
  (current_setting('pgtap.media_begin')::jsonb ->> 'run_id')::uuid,
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  repeat('a', 64), repeat('b', 64), repeat('c', 64), 1200, 800, false,
  'magick-wasm@0.0.43', 'masters/wrong.png', '[]'::jsonb
) ->> 'code', 'CONTENT_MEDIA_INTEGRITY_FAILED',
  'service finalization rejects a forged manifest');

reset role;
select is((select count(*)::text from public.content_media_assets), '0',
  'a rejected manifest cannot create a trusted asset');

set local role service_role;
select set_config('pgtap.media_complete', public.svc_complete_content_media_upload(
  (current_setting('pgtap.media_begin')::jsonb ->> 'run_id')::uuid,
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  repeat('a', 64), repeat('b', 64), repeat('c', 64), 1200, 800, false,
  'magick-wasm@0.0.43',
  'masters/' || (current_setting('pgtap.media_begin')::jsonb ->> 'asset_id') ||
    '/' || repeat('a', 64) || '.png',
  jsonb_build_array(
    jsonb_build_object(
      'kind', 'thumbnail', 'object_path', 'variants/' ||
        (current_setting('pgtap.media_begin')::jsonb ->> 'asset_id') ||
        '/thumbnail-' || repeat('d', 64) || '.webp',
      'sha256', repeat('d', 64), 'mime_type', 'image/webp',
      'width', 320, 'height', 213, 'bytes', 12000,
      'quality_mode', 'lossy', 'structural_similarity_distortion', null),
    jsonb_build_object(
      'kind', 'reading', 'object_path', 'variants/' ||
        (current_setting('pgtap.media_begin')::jsonb ->> 'asset_id') ||
        '/reading-' || repeat('e', 64) || '.webp',
      'sha256', repeat('e', 64), 'mime_type', 'image/webp',
      'width', 800, 'height', 533, 'bytes', 48000,
      'quality_mode', 'lossy', 'structural_similarity_distortion', null)
  ))::text, true);
select is(current_setting('pgtap.media_complete')::jsonb ->> 'outcome', 'ok',
  'service finalization stores a verified deterministic manifest');

reset role;
select is((select status from public.content_media_upload_runs
  where id = (current_setting('pgtap.media_begin')::jsonb ->> 'run_id')::uuid),
  'verified', 'successful finalization seals the upload run');
select is((select count(*)::text from public.content_media_variants
  where asset_id = (current_setting('pgtap.media_begin')::jsonb ->> 'asset_id')::uuid),
  '2', 'standard media stores exactly thumbnail and reading variants');

create function pg_temp.try_update_media_asset() returns void
language sql as $$
  update public.content_media_assets set width = width + 1
  where id = (current_setting('pgtap.media_begin')::jsonb ->> 'asset_id')::uuid
$$;
create function pg_temp.try_delete_media_variant() returns void
language sql as $$
  delete from public.content_media_variants
  where asset_id = (current_setting('pgtap.media_begin')::jsonb ->> 'asset_id')::uuid
$$;
select throws_ok('select pg_temp.try_update_media_asset()', '55000',
  'verified content media is immutable', 'verified assets are append-only');
select throws_ok('select pg_temp.try_delete_media_variant()', '55000',
  'verified content media is immutable', 'verified variants are append-only');

set local role authenticated;
select is(public.admin_claim_content_media_upload(
  (current_setting('pgtap.media_begin')::jsonb ->> 'run_id')::uuid,
  '76000000-0000-4000-8000-000000000002') ->> 'replayed', 'true',
  'a verified claim retry returns the sealed receipt');
select is(public.admin_abort_content_media_upload(
  (current_setting('pgtap.media_begin')::jsonb ->> 'run_id')::uuid,
  '76000000-0000-4000-8000-000000000002') ->> 'code',
  'CONTENT_MEDIA_RUN_CONFLICT', 'a verified run cannot be aborted');

reset role;
select card.id as media_card_id, card.version as media_card_version
from public.review_cards card
where card.status = 'published' order by card.created_at limit 1 \gset
insert into public.review_card_media (
  review_card_id, card_version, asset_path, alt_text, sort_order,
  manifest_id, semantic_role
) values (
  :'media_card_id'::uuid, :media_card_version,
  'content-media:' || (current_setting('pgtap.media_begin')::jsonb ->> 'asset_id'),
  '色彩教學示意圖', 999,
  (current_setting('pgtap.media_begin')::jsonb ->> 'asset_id')::uuid,
  'standard'
);

set local role service_role;
select is(public.svc_content_media_delivery(
  'cc000000-0000-0000-0000-000000000001',
  array[(current_setting('pgtap.media_begin')::jsonb ->> 'asset_id')::uuid]
) ->> 'outcome', 'ok',
  'service delivery resolves only media attached to accessible current content');
select is(public.svc_content_media_delivery(
  'cc000000-0000-0000-0000-000000000001',
  array['76000000-0000-4000-8000-000000000099'::uuid]
) ->> 'code', 'CONTENT_MEDIA_NOT_FOUND',
  'unknown or inaccessible media uses the same fail-closed denial');

select * from finish();

rollback;
