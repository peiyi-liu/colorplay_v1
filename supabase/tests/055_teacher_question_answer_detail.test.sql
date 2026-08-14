begin;

select plan(11);

select ok(
  has_function_privilege(
    'authenticated',
    'public.teacher_question_answer_options(uuid, text, text, uuid)',
    'EXECUTE'
  ),
  'authenticated callers may invoke the teacher-only answer projection'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.teacher_question_answer_options(uuid, text, text, uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke the teacher-only answer projection'
);
select is(
  pg_get_function_result(
    'public.teacher_question_answer_options(uuid, text, text, uuid)'::regprocedure
  ),
  'TABLE(option_key text, option_text text, is_correct boolean)',
  'projection exposes only the three ADR 0007 option fields'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  ('00000000-0000-0000-0000-000000000000', '55700000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'answer.owner@colorplay.test', crypt('LocalOnly-Answer1!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55700000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'answer.student@colorplay.test', crypt('LocalOnly-Answer2!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55700000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'answer.other@colorplay.test', crypt('LocalOnly-Answer3!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

update public.profiles set role = 'teacher'
where id in ('55700000-0000-0000-0000-000000000001', '55700000-0000-0000-0000-000000000003');

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values
  ('55800000-0000-0000-0000-000000000001', '55700000-0000-0000-0000-000000000001', 'Answer Owner Classroom', decode(repeat('b1', 32), 'hex'), 1, now(), 'active'),
  ('55800000-0000-0000-0000-000000000002', '55700000-0000-0000-0000-000000000003', 'Answer Other Classroom', decode(repeat('b2', 32), 'hex'), 1, now(), 'active');

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  ('55800000-0000-0000-0000-000000000001', '55700000-0000-0000-0000-000000000001', 'teacher', 'active', now(), now(), '55900000-0000-0000-0000-000000000001'),
  ('55800000-0000-0000-0000-000000000001', '55700000-0000-0000-0000-000000000002', 'student', 'active', now(), now(), '55900000-0000-0000-0000-000000000002'),
  ('55800000-0000-0000-0000-000000000002', '55700000-0000-0000-0000-000000000003', 'teacher', 'active', now(), now(), '55900000-0000-0000-0000-000000000003');

with target as (
  select question.id, question.stable_code, question.version, question.prompt,
    question.explanation, option.id as correct_option_id
  from public.questions as question
  join public.question_options as option
    on option.question_id = question.id and option.is_correct
  where question.stable_code = 'QB3101'
), session_insert as (
  insert into public.quiz_sessions (
    id, user_id, template_id, client_request_id, chapter_title, question_count,
    status, answered_count, correct_count, total_score, completed_at
  )
  select '55a00000-0000-0000-0000-000000000001', '55700000-0000-0000-0000-000000000002', template.id,
    '55b00000-0000-0000-0000-000000000001', 'Answer scope', 1,
    'completed', 1, 1, 100, now()
  from public.quiz_templates as template limit 1
), session_question as (
  insert into public.quiz_session_questions (
    id, session_id, question_id, position, question_stable_code,
    question_version, prompt, explanation, frozen_options, correct_option_id
  )
  select '55c00000-0000-0000-0000-000000000001', '55a00000-0000-0000-0000-000000000001', target.id, 1,
    target.stable_code, target.version, target.prompt, target.explanation,
    (select jsonb_agg(jsonb_build_object('id', option.id, 'key', option.option_key, 'text', option.option_text) order by option.sort_order)
      from public.question_options as option where option.question_id = target.id),
    target.correct_option_id
  from target
)
insert into public.quiz_answers (
  session_id, session_question_id, user_id, selected_option_id,
  correct_option_id, answer_status, response_ms, score_delta,
  idempotency_key, answered_at
)
select '55a00000-0000-0000-0000-000000000001', '55c00000-0000-0000-0000-000000000001',
  '55700000-0000-0000-0000-000000000002', target.correct_option_id,
  target.correct_option_id, 'correct', 1000, 100,
  '55d00000-0000-0000-0000-000000000001', now()
from target;

set local role anon;
select throws_ok(
  $$select * from public.teacher_question_answer_options(
    '55800000-0000-0000-0000-000000000001', 'QB3101',
    'section_quiz', null
  )$$,
  '42501', null, 'anonymous invocation is denied without existence leakage'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '55700000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.teacher_question_answer_options('55800000-0000-0000-0000-000000000001', 'QB3101', 'section_quiz', null)), 4, 'classroom owner reads all authorized options');
select results_eq(
  $$select option_key, option_text from public.teacher_question_answer_options('55800000-0000-0000-0000-000000000001', 'QB3101', 'section_quiz', null) where is_correct$$,
  $$values ('D'::text, '暗色'::text)$$,
  'classroom owner receives the server-authoritative correct option'
);
select is((select count(*)::integer from public.teacher_question_answer_options('55800000-0000-0000-0000-000000000002', 'QB3101', 'section_quiz', null)), 0, 'owner querying another teacher classroom fails closed');
select is((select count(*)::integer from public.teacher_question_answer_options('55800000-0000-0000-0000-000000000001', 'QB3102', 'section_quiz', null)), 0, 'question outside classroom analysis scope fails closed');

select set_config('request.jwt.claim.sub', '55700000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.teacher_question_answer_options('55800000-0000-0000-0000-000000000001', 'QB3101', 'section_quiz', null)), 0, 'non-owner teacher fails closed across classrooms');

select set_config('request.jwt.claim.sub', '55700000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.teacher_question_answer_options('55800000-0000-0000-0000-000000000001', 'QB3101', 'section_quiz', null)), 0, 'student fails closed in their classroom');

select set_config('request.jwt.claim.sub', '55700000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.teacher_question_detail('55800000-0000-0000-0000-000000000001', 'QB3101') as detail where detail.options::text ~ 'is_correct'),
  0,
  'shared teacher question detail remains answer-free'
);

reset role;
select * from finish();
rollback;
