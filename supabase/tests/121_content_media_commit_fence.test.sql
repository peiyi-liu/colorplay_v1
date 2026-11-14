begin;
set local search_path = public, extensions;
select plan(10);
\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create function pg_temp.complete_media_fence(p_run uuid, p_asset uuid)
returns jsonb language sql as $$
  select public.svc_complete_content_media_upload(
    p_run, 'aa000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-0000000000e1',
    repeat('a', 64), repeat('b', 64), repeat('c', 64), 1200, 800, false,
    'magick-wasm@0.0.43',
    'masters/' || p_asset || '/' || repeat('a', 64) || '.png',
    jsonb_build_array(
      jsonb_build_object('kind', 'thumbnail', 'object_path',
        'variants/' || p_asset || '/thumbnail-' || repeat('d', 64) || '.webp',
        'sha256', repeat('d', 64), 'mime_type', 'image/webp',
        'width', 320, 'height', 213, 'bytes', 12000,
        'quality_mode', 'lossy', 'structural_similarity_distortion', null),
      jsonb_build_object('kind', 'reading', 'object_path',
        'variants/' || p_asset || '/reading-' || repeat('e', 64) || '.webp',
        'sha256', repeat('e', 64), 'mime_type', 'image/webp',
        'width', 800, 'height', 533, 'bytes', 48000,
        'quality_mode', 'lossy', 'structural_similarity_distortion', null)
    ));
$$;

set local role authenticated;
select set_config('pgtap.fence_one', public.admin_begin_content_media_upload(
  '12100000-0000-4000-8000-000000000001', 'synthetic.png', 'image/png',
  1024, 'standard')::text, true);
select is(public.admin_claim_content_media_upload(
  (current_setting('pgtap.fence_one')::jsonb ->> 'run_id')::uuid,
  '12100000-0000-4000-8000-000000000001') ->> 'action', 'claim',
  'first ordering claims one owned run');
reset role;
set local role service_role;
select is(pg_temp.complete_media_fence(
  (current_setting('pgtap.fence_one')::jsonb ->> 'run_id')::uuid,
  (current_setting('pgtap.fence_one')::jsonb ->> 'asset_id')::uuid
) ->> 'outcome', 'ok', 'complete wins the run lock');
select is(public.svc_fail_content_media_upload(
  (current_setting('pgtap.fence_one')::jsonb ->> 'run_id')::uuid,
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'CONTENT_MEDIA_PROCESSING_FAILED') ->> 'outcome', 'denied',
  'fail cannot fence an already verified run');
reset role;
select is((select status from public.content_media_upload_runs where id =
  (current_setting('pgtap.fence_one')::jsonb ->> 'run_id')::uuid), 'verified',
  'denied fail retains verified state');
select is((select count(*)::integer from public.content_media_assets where
  upload_run_id = (current_setting('pgtap.fence_one')::jsonb ->> 'run_id')::uuid),
  1, 'verified asset remains authoritative');

set local role authenticated;
select set_config('pgtap.fence_two', public.admin_begin_content_media_upload(
  '12100000-0000-4000-8000-000000000002', 'synthetic.png', 'image/png',
  1024, 'standard')::text, true);
select is(public.admin_claim_content_media_upload(
  (current_setting('pgtap.fence_two')::jsonb ->> 'run_id')::uuid,
  '12100000-0000-4000-8000-000000000002') ->> 'action', 'claim',
  'second ordering claims another owned run');
reset role;
set local role service_role;
select is(public.svc_fail_content_media_upload(
  (current_setting('pgtap.fence_two')::jsonb ->> 'run_id')::uuid,
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'CONTENT_MEDIA_PROCESSING_FAILED') ->> 'outcome', 'ok',
  'failure fence wins the run lock');
select is(pg_temp.complete_media_fence(
  (current_setting('pgtap.fence_two')::jsonb ->> 'run_id')::uuid,
  (current_setting('pgtap.fence_two')::jsonb ->> 'asset_id')::uuid
) ->> 'outcome', 'denied', 'late complete cannot cross a successful fence');
reset role;
select is((select status from public.content_media_upload_runs where id =
  (current_setting('pgtap.fence_two')::jsonb ->> 'run_id')::uuid), 'failed',
  'late complete retains failed state');
select is((select count(*)::integer from public.content_media_assets where
  upload_run_id = (current_setting('pgtap.fence_two')::jsonb ->> 'run_id')::uuid),
  0, 'late complete creates no asset');
select * from finish();
rollback;
