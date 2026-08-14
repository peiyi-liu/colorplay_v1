begin;

select plan(6);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '57700000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'provenance.teacher@colorplay.test',
    crypt('LocalOnly-Provenance-1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '57700000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'provenance.student@colorplay.test',
    crypt('LocalOnly-Provenance-2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '57700000-0000-0000-0000-000000000001';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values
  (
    '57800000-0000-0000-0000-000000000001',
    '57700000-0000-0000-0000-000000000001',
    'Current Classroom', decode(repeat('d1', 32), 'hex'), 1, now(), 'active'
  ),
  (
    '57800000-0000-0000-0000-000000000002',
    '57700000-0000-0000-0000-000000000001',
    'Previous Classroom', decode(repeat('d2', 32), 'hex'), 1, now(), 'active'
  );

create function pg_temp.record_completed_quiz(
  p_session_id uuid,
  p_request_id uuid,
  p_stable_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  question_record public.questions;
  correct_option_id uuid;
  session_question_id uuid := gen_random_uuid();
begin
  select question.*
  into question_record
  from public.questions as question
  where question.stable_code = p_stable_code;

  select option.id
  into correct_option_id
  from public.question_options as option
  where option.question_id = question_record.id
    and option.is_correct;

  insert into public.quiz_sessions (
    id, user_id, template_id, client_request_id, chapter_title,
    question_count, status, answered_count, correct_count, total_score,
    completed_at
  )
  select
    p_session_id,
    '57700000-0000-0000-0000-000000000002',
    template.id,
    p_request_id,
    'Provenance Quiz',
    1,
    'completed',
    1,
    1,
    100,
    now()
  from public.quiz_templates as template
  order by template.created_at
  limit 1;

  insert into public.quiz_session_questions (
    id, session_id, question_id, position, question_stable_code,
    question_version, prompt, explanation, frozen_options, correct_option_id
  )
  select
    session_question_id,
    p_session_id,
    question_record.id,
    1,
    question_record.stable_code,
    question_record.version,
    question_record.prompt,
    question_record.explanation,
    jsonb_agg(
      jsonb_build_object(
        'id', option.id,
        'key', option.option_key,
        'text', option.option_text
      ) order by option.sort_order
    ),
    correct_option_id
  from public.question_options as option
  where option.question_id = question_record.id;

  insert into public.quiz_answers (
    session_id, session_question_id, user_id, selected_option_id,
    correct_option_id, answer_status, response_ms, score_delta,
    idempotency_key, answered_at
  ) values (
    p_session_id,
    session_question_id,
    '57700000-0000-0000-0000-000000000002',
    correct_option_id,
    correct_option_id,
    'correct',
    1000,
    100,
    gen_random_uuid(),
    now()
  );
end;
$$;

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values (
  '57800000-0000-0000-0000-000000000002',
  '57700000-0000-0000-0000-000000000002',
  'student', 'active', now(), now(),
  '57900000-0000-0000-0000-000000000001'
);

select pg_temp.record_completed_quiz(
  '57a00000-0000-0000-0000-000000000001',
  '57b00000-0000-0000-0000-000000000001',
  'QB3101'
);

update public.classroom_members
set status = 'inactive',
    deactivated_at = now(),
    updated_at = now()
where classroom_id = '57800000-0000-0000-0000-000000000002'
  and user_id = '57700000-0000-0000-0000-000000000002';

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values (
  '57800000-0000-0000-0000-000000000001',
  '57700000-0000-0000-0000-000000000002',
  'student', 'active', now(), now(),
  '57900000-0000-0000-0000-000000000002'
);

select pg_temp.record_completed_quiz(
  '57a00000-0000-0000-0000-000000000002',
  '57b00000-0000-0000-0000-000000000002',
  'QB3102'
);

select is(
  (
    select classroom_id
    from public.quiz_sessions
    where id = '57a00000-0000-0000-0000-000000000001'
  ),
  '57800000-0000-0000-0000-000000000002'::uuid,
  'the historical Quiz keeps its previous classroom provenance'
);

select is(
  (
    select classroom_id
    from public.quiz_sessions
    where id = '57a00000-0000-0000-0000-000000000002'
  ),
  '57800000-0000-0000-0000-000000000001'::uuid,
  'the current Quiz snapshots the current classroom provenance'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '57700000-0000-0000-0000-000000000001',
  true
);

select is(
  (
    select count(*)::integer
    from public.teacher_assessment_question_analysis(
      '57800000-0000-0000-0000-000000000001',
      'section_quiz', null, null, null
    ) as fact
    where fact.stable_code = 'QB3101'
  ),
  0,
  'a previous classroom Quiz is excluded from current classroom analytics'
);

select is(
  (
    select count(*)::integer
    from public.teacher_question_answer_options(
      '57800000-0000-0000-0000-000000000001',
      'QB3101'
    )
  ),
  0,
  'a previous classroom Quiz cannot unlock an answer in the current classroom'
);

select is(
  (
    select count(*)::integer
    from public.teacher_assessment_question_analysis(
      '57800000-0000-0000-0000-000000000001',
      'section_quiz', null, null, null
    ) as fact
    where fact.stable_code = 'QB3102'
  ),
  1,
  'the current classroom Quiz remains in current classroom analytics'
);

select is(
  (
    select count(*)::integer
    from public.teacher_question_answer_options(
      '57800000-0000-0000-0000-000000000001',
      'QB3102'
    )
  ),
  4,
  'the current classroom Quiz unlocks its authoritative answer'
);

reset role;
select * from finish();
rollback;
