begin;

set local search_path = public, extensions;

select plan(13);

select ok(not has_function_privilege(
  'authenticated', 'public.upsert_question_draft(jsonb,uuid)', 'EXECUTE'),
  'legacy Teacher question drafts cannot bypass Content Studio');
select ok(not has_function_privilege(
  'authenticated', 'public.publish_question(uuid,jsonb,uuid)', 'EXECUTE'),
  'legacy Teacher question publication stays retired');
select ok(not has_function_privilege(
  'authenticated', 'public.upsert_review_card_draft(jsonb,uuid)', 'EXECUTE'),
  'legacy Teacher review-card drafts stay retired');
select ok(not has_function_privilege(
  'authenticated', 'public.archive_question(uuid,uuid)', 'EXECUTE'),
  'legacy Teacher archive cannot bypass immutable Admin history');
select ok(has_function_privilege(
  'authenticated',
  'public.admin_save_content_draft(uuid,uuid,text,text,integer,jsonb,text,uuid)',
  'EXECUTE'), 'authenticated callers can reach the server-authorized draft command');

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select bank.id as teacher_content_bank_id
from public.assessment_banks bank
join public.sections section on section.id = bank.section_id
where bank.kind = 'QB' and section.stable_code = 'sheet-3-1'
limit 1 \gset

select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(public.admin_save_content_draft(
  null, null, 'question', 'QB3198', 0,
  jsonb_build_object(
    'bank_id', :'teacher_content_bank_id'::uuid,
    'question_type', 'single_choice', 'prompt', '學生不可建立草稿',
    'explanation', '拒絕測試', 'duration_seconds', 20, 'sort_order', 98,
    'options', jsonb_build_array(
      jsonb_build_object('key', 'A', 'text', '甲', 'is_correct', true),
      jsonb_build_object('key', 'B', 'text', '乙', 'is_correct', false)
    )
  ), 'manual', '27100000-0000-4000-8000-000000000001'
) ->> 'code', 'STALE_PRIVILEGED_SESSION',
  'a Student cannot save a Content Studio draft');

reset role;
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
set local role authenticated;

select set_config('pgtap.teacher_content_save',
  public.admin_save_content_draft(
    null, null, 'question', 'QB3198', 0,
    jsonb_build_object(
      'bank_id', :'teacher_content_bank_id'::uuid,
      'question_type', 'single_choice', 'prompt', 'Admin 草稿題目',
      'explanation', '草稿解析', 'duration_seconds', 20, 'sort_order', 98,
      'options', jsonb_build_array(
        jsonb_build_object('key', 'A', 'text', '甲', 'is_correct', true),
        jsonb_build_object('key', 'B', 'text', '乙', 'is_correct', false)
      )
    ), 'manual', '27100000-0000-4000-8000-000000000002'
  )::text, true);
select is(current_setting('pgtap.teacher_content_save')::jsonb ->> 'outcome',
  'ok', 'a fresh-MFA Admin creates the replacement persistent draft');
select is(current_setting('pgtap.teacher_content_save')::jsonb
  #>> '{draft,revision}', '1', 'a new Admin draft starts at revision one');

select set_config('pgtap.teacher_content_validation',
  public.admin_validate_content_draft(
    (current_setting('pgtap.teacher_content_save')::jsonb
      #>> '{draft,draft_id}')::uuid, 1
  )::text, true);
select is(current_setting('pgtap.teacher_content_validation')::jsonb
  ->> 'outcome', 'ok', 'the server returns a deterministic validation report');
select is(current_setting('pgtap.teacher_content_validation')::jsonb
  ->> 'valid', 'true', 'the canonical Admin question draft is valid');

select set_config('pgtap.teacher_content_preview',
  public.admin_preview_content_draft(
    (current_setting('pgtap.teacher_content_save')::jsonb
      #>> '{draft,draft_id}')::uuid, 1
  )::text, true);
select ok(current_setting('pgtap.teacher_content_preview') !~ 'is_correct',
  'the draft preview does not expose answer flags');

reset role;
select is((select source from public.content_drafts
  where stable_code = 'QB3198'), 'manual',
  'the replacement command persists a manual draft in content_drafts');
select is((select count(*)::text from public.questions
  where stable_code = 'QB3198'), '0',
  'saving a draft does not mutate current Student content');

select * from finish();

rollback;
