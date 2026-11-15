begin;
set local search_path = public, extensions;
select plan(20);
select set_config('pgtap.duplicate_asset_baseline',
  (select count(*)::text from public.content_media_assets), true);
select set_config('pgtap.duplicate_variant_baseline',
  (select count(*)::text from public.content_media_variants), true);
\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
create function pg_temp.complete_duplicate_media(p_run uuid, p_asset uuid)
returns jsonb language sql as $$
  select public.svc_complete_content_media_upload(
    p_run, 'aa000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-0000000000e1',
    repeat('7', 64), repeat('8', 64), repeat('9', 64), 1200, 800, false,
    'magick-wasm@0.0.43',
    'masters/' || p_asset || '/' || repeat('7', 64) || '.png',
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
select set_config('pgtap.duplicate_one', public.admin_begin_content_media_upload(
  '12200000-0000-4000-8000-000000000001', 'synthetic-one.png',
  'image/png', 1024, 'standard')::text, true);
select is(public.admin_claim_content_media_upload(
  (current_setting('pgtap.duplicate_one')::jsonb ->> 'run_id')::uuid,
  '12200000-0000-4000-8000-000000000001') ->> 'action', 'claim', 'first run claims');
reset role;
set local role service_role;
select is(pg_temp.complete_duplicate_media(
  (current_setting('pgtap.duplicate_one')::jsonb ->> 'run_id')::uuid,
  (current_setting('pgtap.duplicate_one')::jsonb ->> 'asset_id')::uuid
) ->> 'outcome', 'ok', 'first legal manifest commits');
reset role;
select set_config('pgtap.duplicate_first_snapshot', (select jsonb_build_object(
  'asset', to_jsonb(asset), 'variants', (select jsonb_agg(to_jsonb(variant) order by kind)
    from public.content_media_variants variant where variant.asset_id = asset.id)
)::text from public.content_media_assets asset where asset.id =
  (current_setting('pgtap.duplicate_one')::jsonb ->> 'asset_id')::uuid), true);
set local role authenticated;
select set_config('pgtap.duplicate_two', public.admin_begin_content_media_upload(
  '12200000-0000-4000-8000-000000000002', 'synthetic-renamed.png',
  'image/png', 1024, 'standard')::text, true);
select is(public.admin_claim_content_media_upload(
  (current_setting('pgtap.duplicate_two')::jsonb ->> 'run_id')::uuid,
  '12200000-0000-4000-8000-000000000002') ->> 'action', 'claim', 'second run claims');
reset role;
set local role service_role;
-- On the old schema this exact completion must reach SQLSTATE23505 before any
-- new-index assertion. Root performs this RED only inside a rolled-back test.
select is(pg_temp.complete_duplicate_media(
  (current_setting('pgtap.duplicate_two')::jsonb ->> 'run_id')::uuid,
  (current_setting('pgtap.duplicate_two')::jsonb ->> 'asset_id')::uuid
) ->> 'outcome', 'ok', 'same digest commits a distinct second asset');
reset role;
select isnt(current_setting('pgtap.duplicate_one')::jsonb ->> 'asset_id',
  current_setting('pgtap.duplicate_two')::jsonb ->> 'asset_id', 'asset identities remain distinct');
select is((select count(*)::bigint from public.content_media_assets),
  current_setting('pgtap.duplicate_asset_baseline')::bigint + 2, 'exactly two assets added globally');
select is((select count(*)::bigint from public.content_media_variants),
  current_setting('pgtap.duplicate_variant_baseline')::bigint + 4, 'exactly four variants added globally');
select is((select count(*)::integer from public.content_media_assets where id in (
  (current_setting('pgtap.duplicate_one')::jsonb ->> 'asset_id')::uuid,
  (current_setting('pgtap.duplicate_two')::jsonb ->> 'asset_id')::uuid
) and manifest_sha256 = repeat('9', 64)), 2, 'both assets retain equal trusted digest');
select is((select jsonb_build_object('asset', to_jsonb(asset), 'variants',
  (select jsonb_agg(to_jsonb(variant) order by kind) from public.content_media_variants variant where variant.asset_id = asset.id))
  from public.content_media_assets asset where asset.id =
    (current_setting('pgtap.duplicate_one')::jsonb ->> 'asset_id')::uuid),
  current_setting('pgtap.duplicate_first_snapshot')::jsonb, 'first asset and variants unchanged');
set local role authenticated;
select is(public.admin_claim_content_media_upload(
  (current_setting('pgtap.duplicate_two')::jsonb ->> 'run_id')::uuid,
  '12200000-0000-4000-8000-000000000002') -> 'receipt' ->> 'asset_id',
  current_setting('pgtap.duplicate_two')::jsonb ->> 'asset_id', 'same-run replay returns its own asset');
reset role;
set local role service_role;
select is(pg_temp.complete_duplicate_media(
  (current_setting('pgtap.duplicate_two')::jsonb ->> 'run_id')::uuid,
  (current_setting('pgtap.duplicate_two')::jsonb ->> 'asset_id')::uuid
) ->> 'code', 'CONTENT_MEDIA_RUN_CONFLICT', 'late second completion stays denied');
select is(public.svc_fail_content_media_upload(
  (current_setting('pgtap.duplicate_one')::jsonb ->> 'run_id')::uuid,
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'CONTENT_MEDIA_PROCESSING_FAILED') ->> 'outcome', 'denied', 'verified run cannot be failed');
reset role;
select throws_ok(format('update public.content_media_assets set width = width + 1 where id = %L',
  current_setting('pgtap.duplicate_one')::jsonb ->> 'asset_id'), '55000', null, 'asset remains immutable');
select throws_ok(format('delete from public.content_media_variants where asset_id = %L',
  current_setting('pgtap.duplicate_two')::jsonb ->> 'asset_id'), '55000', null, 'variants remain immutable');
select ok(not has_table_privilege('authenticated', 'public.content_media_assets', 'INSERT'), 'untrusted direct asset insertion denied');
select ok(not has_table_privilege('authenticated', 'public.content_media_variants', 'UPDATE'), 'untrusted variant update denied');
select ok((select relrowsecurity from pg_class where oid = 'public.content_media_assets'::regclass), 'assets RLS remains enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.content_media_variants'::regclass), 'variants RLS remains enabled');
select ok(exists(select 1 from pg_index where indexrelid = 'public.content_media_assets_manifest_sha256_idx'::regclass and not indisunique), 'digest lookup index is nonunique');
select ok(not exists(select 1 from pg_constraint where conrelid = 'public.content_media_assets'::regclass and conname = 'content_media_assets_manifest_sha256_key'), 'global digest uniqueness removed only');
select * from finish();
rollback;
