begin;

set local search_path = public, extensions;
select plan(14);

select has_function('public', 'admin_preview_content_publication',
  array['uuid','integer','text'], 'publication impact preview is server-derived');
select ok(not has_function_privilege(
  'anon', 'public.admin_preview_content_publication(uuid,integer,text)', 'EXECUTE'),
  'anonymous callers cannot preview draft impact');
select ok(has_function_privilege(
  'authenticated', 'public.admin_preview_content_publication(uuid,integer,text)',
  'EXECUTE'), 'authenticated callers reach the authorized preview command');
select has_function('public', 'admin_preview_content_archive',
  array['uuid','text','integer'], 'archive impact preview is server-derived');
select ok(not has_function_privilege(
  'anon', 'public.admin_preview_content_archive(uuid,text,integer)', 'EXECUTE'),
  'anonymous callers cannot preview archive impact');
select ok(has_function_privilege(
  'authenticated', 'public.admin_preview_content_archive(uuid,text,integer)',
  'EXECUTE'), 'authenticated callers reach archive preview authorization');

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select id as workflow_subtopic_id from public.subtopics
where stable_code = 'sheet-3-1-all' limit 1 \gset
select id as workflow_review_card_id from public.review_cards
where stable_code = 'RC3101' limit 1 \gset

select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(public.admin_preview_content_publication(
  '78000000-0000-4000-8000-000000000099', 1) ->> 'code',
  'STALE_PRIVILEGED_SESSION', 'Student cannot preview publication impact');
select is(public.admin_preview_content_archive(
  :'workflow_review_card_id', 'review_card', 1) ->> 'code',
  'STALE_PRIVILEGED_SESSION', 'Student cannot preview archive impact');

reset role;
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select set_config('pgtap.workflow_save', public.admin_save_content_draft(
  null, null, 'review_card', 'RC-P2-WORKFLOW', 0,
  jsonb_build_object(
    'subtopic_id', :'workflow_subtopic_id', 'group_label', '3-1',
    'title', '工作流程預覽', 'content', '新增必要教學內容',
    'requires_recompletion', false, 'sort_order', 998, 'media', '[]'::jsonb
  ), 'manual', '78000000-0000-4000-8000-000000000001')::text, true);
select set_config('pgtap.workflow_preview',
  public.admin_preview_content_publication(
    (current_setting('pgtap.workflow_save')::jsonb #>> '{draft,draft_id}')::uuid,
    1)::text, true);
select is(current_setting('pgtap.workflow_preview')::jsonb ->> 'impact',
  'requires_recompletion', 'new required review content requires recompletion');
select is(current_setting('pgtap.workflow_preview')::jsonb ->> 'next_version',
  '1', 'preview reports the exact next version without publishing');
select is(current_setting('pgtap.workflow_preview')::jsonb ->> 'change_classification',
  'semantic', 'preview echoes the classification bound to confirmation');
select is(public.admin_preview_content_publication(
  (current_setting('pgtap.workflow_save')::jsonb #>> '{draft,draft_id}')::uuid,
  1, 'nonsemantic') ->> 'impact', 'requires_recompletion',
  'new required content cannot receive a grandfather-compatible impact');
select is(
  jsonb_typeof(public.admin_list_content_history(
    :'workflow_review_card_id', 'review_card') -> 'entries'),
  'array',
  'history remains an authorized safe projection before the first event');
select is(public.admin_preview_content_archive(
  :'workflow_review_card_id', 'review_card', 1) ->> 'impact',
  'requires_recompletion', 'review-card archive requires recompletion');

select * from finish();
rollback;
