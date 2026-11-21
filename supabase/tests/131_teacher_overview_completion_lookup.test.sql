begin;
set local search_path = public, extensions;
-- Diagnostic limits only; no product timeout or performance assertion is changed.
set local statement_timeout = '10s';
set local lock_timeout = '1s';
select no_plan();

-- Reconstruct only the old completion fragment, not a second product function.
-- Offline inverse checks bind this reference to the c730 original SQL body.
do $reference$
declare
  definition text := pg_get_functiondef(
    'public.teacher_classroom_overview(uuid,date,date,uuid)'::regprocedure
  );
  current_completion text := $new$bool_and(exists (
        select 1
        from public.chapter_challenge_finalize_facts as fact
        where fact.user_id = student.user_id
          and fact.chapter_id = chapter.id
      )) as is_complete$new$;
begin
  if position(current_completion in definition) = 0 then
    raise exception 'M119_REFERENCE_FRAGMENT_MISSING';
  end if;
  definition := replace(definition, current_completion,
    'bool_and(challenge.status in (''completed'', ''mastered'')) as is_complete');
  definition := replace(definition, '    group by student.user_id',
    '    cross join lateral public.chapter_challenge_progress_for('
    || E'\n      student.user_id, chapter.id\n    ) as challenge\n'
    || '    group by student.user_id');
  definition := replace(definition, 'FUNCTION public.teacher_classroom_overview(',
    'FUNCTION pg_temp.before_overview(');
  execute definition;
end;
$reference$;

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000',
  ('6f119000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'overview-fixture-' || n || '@colorplay.test',
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
from generate_series(1, 4) n;
update public.profiles set role = 'teacher'
where id in ('6f119000-0000-0000-0000-000000000001',
  '6f119000-0000-0000-0000-000000000002');
insert into public.classrooms (id, owner_teacher_id, name, join_code_hash)
select ('6f119100-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  case when n = 2 then '6f119000-0000-0000-0000-000000000002'::uuid
    else '6f119000-0000-0000-0000-000000000001'::uuid end,
  'Overview fixture ' || n, decode(repeat(n::text, 64), 'hex')
from generate_series(1, 3) n;
insert into public.classroom_members (
  classroom_id, user_id, member_role, status, deactivated_at, last_join_request_id
) values
  ('6f119100-0000-0000-0000-000000000001',
   '6f119000-0000-0000-0000-000000000001', 'teacher', 'active', null, gen_random_uuid()),
  ('6f119100-0000-0000-0000-000000000001',
   '6f119000-0000-0000-0000-000000000003', 'student', 'active', null, gen_random_uuid()),
  ('6f119100-0000-0000-0000-000000000001',
   '6f119000-0000-0000-0000-000000000004', 'student', 'inactive', now(), gen_random_uuid()),
  ('6f119100-0000-0000-0000-000000000002',
   '6f119000-0000-0000-0000-000000000004', 'student', 'active', null, gen_random_uuid());

create function pg_temp.add_chapter_attempt(
  p_user uuid,
  p_correct_count integer,
  p_purpose public.quiz_session_purpose default 'practice'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  answer_status public.quiz_answer_status;
  correct_option uuid;
  incorrect_option uuid;
  position integer := 0;
  question_record public.questions;
  selected_option uuid;
  session_id uuid;
  session_question_id uuid;
begin
  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title,
    question_count, purpose
  ) values (
    p_user,
    '26000000-0000-0000-0000-000000000003', gen_random_uuid(),
    '色彩表示',
    10, p_purpose
  ) returning id into session_id;

  for question_record in
    select question.*
    from public.questions as question
    join public.subtopics as subtopic on subtopic.id = question.subtopic_id
    join public.sections as section on section.id = subtopic.section_id
    where section.chapter_id = '21000000-0000-0000-0000-000000000003'
      and question.bank_kind = 'chapter'
      and question.status = 'published'
    order by question.stable_code
    limit 10
  loop
    position := position + 1;
    select option.id into correct_option
    from public.question_options as option
    where option.question_id = question_record.id and option.is_correct;
    select option.id into incorrect_option
    from public.question_options as option
    where option.question_id = question_record.id and not option.is_correct
    order by option.sort_order
    limit 1;
    if position <= p_correct_count then
      selected_option := correct_option;
      answer_status := 'correct';
    else
      selected_option := incorrect_option;
      answer_status := 'incorrect';
    end if;

    insert into public.quiz_session_questions (
      session_id, question_id, position, question_stable_code, question_version,
      prompt, explanation, frozen_options, correct_option_id
    ) values (
      session_id, question_record.id, position, question_record.stable_code,
      question_record.version, question_record.prompt, question_record.explanation,
      (
        select jsonb_agg(jsonb_build_object(
          'id', option.id, 'key', option.option_key, 'text', option.option_text
        ) order by option.sort_order)
        from public.question_options as option
        where option.question_id = question_record.id
      ),
      correct_option
    ) returning id into session_question_id;

    insert into public.quiz_answers (
      session_id, session_question_id, user_id, selected_option_id,
      correct_option_id, answer_status, response_ms, score_delta,
      idempotency_key, answered_at
    ) values (
      session_id, session_question_id,
      p_user, selected_option,
      correct_option, answer_status, 1000,
      case when answer_status = 'correct' then 100 else 0 end,
      gen_random_uuid(), clock_timestamp()
    );
  end loop;

  update public.quiz_sessions
  set status = 'completed',
      answered_count = 10,
      correct_count = p_correct_count,
      total_score = p_correct_count * 100,
      completed_at = clock_timestamp()
  where id = session_id;

  return session_id;
end;
$$;

-- Invoker context remains authenticated; both RPCs evaluate the same auth.uid().
create function pg_temp.check_overview(
  label text, expected_completed integer, expected_total integer,
  chapter uuid default '21000000-0000-0000-0000-000000000003',
  from_date date default null, to_date date default null,
  classroom uuid default '6f119100-0000-0000-0000-000000000001'
)
returns setof text language plpgsql as $$
begin
  return query select is(
    (select to_jsonb(overview) from public.teacher_classroom_overview(
      classroom, from_date, to_date, chapter) overview),
    (select to_jsonb(overview) from pg_temp.before_overview(
      classroom, from_date, to_date, chapter) overview),
    label || ': all five fields including NULL agree with old RPC'
  );
  return query select results_eq(
    format('select completed_students, total_students from '
      || 'public.teacher_classroom_overview(%L::uuid,%L::date,%L::date,%L::uuid)',
      classroom, from_date, to_date, chapter),
    format('values (%s::integer,%s::integer)', expected_completed, expected_total),
    label || ': literal completion and denominator'
  );
end;
$$;

-- Plans use the real completed-attempt fixture, BEFORE then AFTER with shared
-- warmed buffers. One active student, not a Native workload reproduction.
create function pg_temp.observe_body_plan(variant text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare
  body text;
  plan jsonb;
  root jsonb;
  result jsonb;
begin
  if variant = 'BEFORE' then
    select prosrc into body from pg_proc
    where oid = 'pg_temp.before_overview(uuid,date,date,uuid)'::regprocedure;
  elsif variant = 'AFTER' then
    select prosrc into body from pg_proc
    where oid = 'public.teacher_classroom_overview(uuid,date,date,uuid)'::regprocedure;
  else
    raise exception 'M119_PLAN_VARIANT_INVALID';
  end if;
  body := regexp_replace(body, '\mp_classroom_id\M', '$1::uuid', 'g');
  body := regexp_replace(body, '\mp_from\M', '$2::date', 'g');
  body := regexp_replace(body, '\mp_to\M', '$3::date', 'g');
  body := regexp_replace(body, '\mp_chapter_id\M', '$4::uuid', 'g');
  execute 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || body into plan
  using '6f119100-0000-0000-0000-000000000001'::uuid,
    null::date, null::date, '21000000-0000-0000-0000-000000000003'::uuid;
  root := plan -> 0 -> 'Plan';
  result := jsonb_build_object('variant', variant,
    'planningMs', plan -> 0 -> 'Planning Time',
    'executionMs', plan -> 0 -> 'Execution Time',
    'rootRows', root -> 'Actual Rows', 'rootLoops', root -> 'Actual Loops',
    'rootTotalMs', root -> 'Actual Total Time',
    'sharedHitBlocks', root -> 'Shared Hit Blocks',
    'sharedReadBlocks', root -> 'Shared Read Blocks');
  if length(result::text) > 1024 or exists (
    select 1 from jsonb_each(result) field
    where field.key <> 'variant' and jsonb_typeof(field.value) <> 'number'
  ) then
    raise exception 'M119_PLAN_SUMMARY_INVALID';
  end if;
  return result;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '6f119000-0000-0000-0000-000000000001', true);
select * from pg_temp.check_overview('no finalized fact', 0, 1);
reset role;
select pg_temp.add_chapter_attempt('6f119000-0000-0000-0000-000000000003', 10, 'remediation');
select is((select count(*)::integer from public.chapter_challenge_finalize_facts
  where user_id = '6f119000-0000-0000-0000-000000000003'), 0,
  'real remediation completion creates no chapter completion fact');
select pg_temp.add_chapter_attempt('6f119000-0000-0000-0000-000000000004', 7);
select pg_temp.add_chapter_attempt('6f119000-0000-0000-0000-000000000001', 8);
set local role authenticated;
select * from pg_temp.check_overview('inactive, other-class and teacher facts excluded', 0, 1);
reset role;
select pg_temp.add_chapter_attempt('6f119000-0000-0000-0000-000000000003', 7);
set local role authenticated;
select * from pg_temp.check_overview('below 80 percent still complete', 1, 1);
select is((select average_accuracy from public.teacher_classroom_overview(
  '6f119100-0000-0000-0000-000000000001', null, null,
  '21000000-0000-0000-0000-000000000003')), 70.0::numeric,
  'assessment accuracy remains independent from completion lookup');
reset role;
select pg_temp.add_chapter_attempt('6f119000-0000-0000-0000-000000000003', 8);
set local role authenticated;
select * from pg_temp.check_overview('80 percent and duplicate attempts count once', 1, 1);
reset role;
select is((select status from public.chapter_challenge_progress_for(
  '6f119000-0000-0000-0000-000000000003',
  '21000000-0000-0000-0000-000000000003')), 'mastered',
  'test fixture really reaches current-version mastery');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '6f119000-0000-0000-0000-000000000001', true);
select diag('M119_BODY_PLAN_WARMED_NON_NATIVE ' || pg_temp.observe_body_plan('BEFORE')::text);
select diag('M119_BODY_PLAN_WARMED_NON_NATIVE ' || pg_temp.observe_body_plan('AFTER')::text);
select ok(true, 'both real body EXPLAIN observations completed without a timing threshold');
reset role;
update public.quiz_templates set question_count = 9
where id = '26000000-0000-0000-0000-000000000003';
set local role authenticated;
select * from pg_temp.check_overview('template change preserves completion', 1, 1);
reset role;
select is((select status from public.chapter_challenge_progress_for(
  '6f119000-0000-0000-0000-000000000003',
  '21000000-0000-0000-0000-000000000003')), 'completed',
  'old mastery is revoked while immutable completion survives');
-- Model the existing backfill's NULL fingerprint, using already valid real facts.
update public.chapter_challenge_finalize_facts set challenge_fingerprint = null
where user_id = '6f119000-0000-0000-0000-000000000003';
set local role authenticated;
select * from pg_temp.check_overview('historical NULL fingerprint remains complete', 1, 1);
select * from pg_temp.check_overview('future dates do not filter completion', 1, 1,
  '21000000-0000-0000-0000-000000000003', '2100-01-01', '2100-01-02');
select is((select average_accuracy from public.teacher_classroom_overview(
  '6f119100-0000-0000-0000-000000000001', '2100-01-01', '2100-01-02',
  '21000000-0000-0000-0000-000000000003')), null::numeric,
  'date filter still removes assessment accuracy');
reset role;
insert into public.chapters (id, course_id, stable_code, title, status)
select '6f119200-0000-0000-0000-000000000001', course_id,
  'overview-extra', 'Overview extra chapter', 'published'
from public.chapters where id = '21000000-0000-0000-0000-000000000003';
set local role authenticated;
select * from pg_temp.check_overview('all published chapters require AND', 0, 1, null);
reset role;
update public.chapters set status = 'draft'
where id <> '21000000-0000-0000-0000-000000000003';
set local role authenticated;
select * from pg_temp.check_overview('unpublished chapters are excluded', 1, 1, null);
reset role;
update public.chapters set status = 'published'
where id = '6f119200-0000-0000-0000-000000000001';
set local role authenticated;
select * from pg_temp.check_overview('another published chapter is not complete', 0, 1, null);
select * from pg_temp.check_overview('explicit chapter filter is retained', 1, 1);
reset role;
update public.courses set status = 'draft' where id = (
  select course_id from public.chapters where id = '21000000-0000-0000-0000-000000000003');
set local role authenticated;
select * from pg_temp.check_overview('unpublished course gives empty selected set', 0, 0);
reset role;
update public.courses set status = 'published' where id = (
  select course_id from public.chapters where id = '21000000-0000-0000-0000-000000000003');
update public.chapters set status = 'draft' where id = '21000000-0000-0000-0000-000000000003';
set local role authenticated;
select * from pg_temp.check_overview('unpublished selected chapter gives 0/0', 0, 0);
select * from pg_temp.check_overview('missing selected chapter gives 0/0', 0, 0,
  '6f119200-0000-0000-0000-000000000099');
select * from pg_temp.check_overview('owned zero-student classroom', 0, 0, null,
  null, null, '6f119100-0000-0000-0000-000000000003');
reset role;
update public.chapters set status = 'published' where id = '21000000-0000-0000-0000-000000000003';
update public.classroom_members set status = 'inactive', deactivated_at = now()
where classroom_id = '6f119100-0000-0000-0000-000000000001'
  and user_id = '6f119000-0000-0000-0000-000000000003';
set local role authenticated;
select * from pg_temp.check_overview('inactive completed student excluded', 0, 0);
reset role;
update public.classroom_members set status = 'active', deactivated_at = null
where classroom_id = '6f119100-0000-0000-0000-000000000001'
  and user_id = '6f119000-0000-0000-0000-000000000003';

set local role authenticated;
select throws_ok($$select * from public.chapter_challenge_finalize_facts$$,
  '42501', null, 'authenticated cannot read private completion facts');
reset role;
select ok(not has_table_privilege('authenticated',
  'public.chapter_challenge_finalize_facts', 'INSERT'), 'cannot forge completion');
select ok(not has_table_privilege('authenticated',
  'public.chapter_challenge_finalize_facts', 'UPDATE'), 'cannot rewrite completion');
select ok(not has_table_privilege('authenticated',
  'public.chapter_challenge_finalize_facts', 'DELETE'), 'cannot erase completion');
set local role authenticated;
select set_config('request.jwt.claim.sub', '6f119000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.teacher_classroom_overview(
  '6f119100-0000-0000-0000-000000000001')), 0, 'other teacher sees no rows');
select is((select count(*)::integer from pg_temp.before_overview(
  '6f119100-0000-0000-0000-000000000001')), 0, 'old reference also rejects other teacher');
select set_config('request.jwt.claim.sub', '6f119000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.teacher_classroom_overview(
  '6f119100-0000-0000-0000-000000000001')), 0, 'student sees no rows');
reset role;
update public.classrooms set status = 'archived'
where id = '6f119100-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '6f119000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.teacher_classroom_overview(
  '6f119100-0000-0000-0000-000000000001')), 0, 'archived owned classroom sees no rows');
reset role;
set local role anon;
select throws_ok($$select * from public.teacher_classroom_overview(
  '6f119100-0000-0000-0000-000000000001')$$,
  '42501', null, 'anonymous cannot execute overview');
reset role;
select * from finish();
rollback;
