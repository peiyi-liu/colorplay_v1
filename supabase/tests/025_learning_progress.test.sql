begin;

select plan(15);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_learning_progress(uuid)',
    'EXECUTE'
  ),
  'students may read their learning progress'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_learning_progress(uuid)',
    'EXECUTE'
  ),
  'anonymous cannot read learning progress'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_classroom_progress(uuid)',
    'EXECUTE'
  ),
  'anonymous cannot read classroom progress'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '25000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'progressx.student.a@colorplay.test',
    crypt('LocalOnly-ProgressX1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '25000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'progressx.teacher.a@colorplay.test',
    crypt('LocalOnly-ProgressX2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '25000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'progressx.teacher.b@colorplay.test',
    crypt('LocalOnly-ProgressX3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '25000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'progressx.outsider@colorplay.test',
    crypt('LocalOnly-ProgressX4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '25000000-0000-0000-0000-000000000002',
  '25000000-0000-0000-0000-000000000003'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '25100000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000002',
  'Progress Classroom', decode(repeat('c9', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '25100000-0000-0000-0000-000000000001',
    '25000000-0000-0000-0000-000000000002',
    'teacher', 'active', now(), now(), '25200000-0000-0000-0000-000000000001'
  ),
  (
    '25100000-0000-0000-0000-000000000001',
    '25000000-0000-0000-0000-000000000001',
    'student', 'active', now(), now(), '25200000-0000-0000-0000-000000000002'
  );

create function pg_temp.build_session(
  target_user uuid,
  question_code text,
  answer_kind text,
  session_purpose public.quiz_session_purpose,
  request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  question_record public.questions;
  correct_option uuid;
  wrong_option uuid;
  new_session uuid;
  new_question uuid;
  selected uuid;
  status public.quiz_answer_status := answer_kind::public.quiz_answer_status;
begin
  select * into question_record
  from public.questions
  where stable_code = question_code;

  select id into correct_option
  from public.question_options
  where question_id = question_record.id and is_correct;
  select id into wrong_option
  from public.question_options
  where question_id = question_record.id and not is_correct
  order by sort_order
  limit 1;

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count,
    purpose
  ) values (
    target_user, '26000000-0000-0000-0000-000000000003', request_id,
    '色彩體系與應用', 1, session_purpose
  )
  returning id into new_session;

  insert into public.quiz_session_questions (
    session_id, question_id, position, question_stable_code, question_version,
    prompt, explanation, frozen_options, correct_option_id, started_at,
    deadline_at
  ) values (
    new_session, question_record.id, 1, question_record.stable_code,
    question_record.version, question_record.prompt,
    question_record.explanation,
    (
      select jsonb_agg(
        jsonb_build_object('id', o.id, 'key', o.option_key, 'text', o.option_text)
        order by o.sort_order
      )
      from public.question_options o
      where o.question_id = question_record.id
    ),
    correct_option, clock_timestamp(), clock_timestamp() + interval '30 seconds'
  )
  returning id into new_question;

  selected := case status
    when 'correct' then correct_option
    when 'incorrect' then wrong_option
    else null
  end;
  insert into public.quiz_answers (
    session_id, session_question_id, user_id, selected_option_id,
    correct_option_id, answer_status, response_ms, score_delta, idempotency_key
  ) values (
    new_session, new_question, target_user, selected, correct_option, status,
    2000, case when status = 'correct' then 150 else 0 end, gen_random_uuid()
  );

  return new_session;
end;
$$;

create function pg_temp.drill(
  target_user uuid,
  question_code text,
  answer_kind text,
  session_purpose public.quiz_session_purpose
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  new_session uuid;
begin
  new_session := pg_temp.build_session(
    target_user, question_code, answer_kind, session_purpose,
    gen_random_uuid()
  );
  perform public.finalize_quiz_session(new_session);
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '25000000-0000-0000-0000-000000000001',
  true
);

-- Subtopic 3-1 (13 published questions):
--   3-1-01 latest correct; 3-1-02 correct then wrong (latest wrong counts);
--   3-1-03 answered then version-bumped (old version excluded);
--   3-1-04 unfinished session (excluded); 3-1-05 correct via remediation.
select pg_temp.drill(
  '25000000-0000-0000-0000-000000000001', '3-1-01', 'correct', 'practice'
);
select pg_temp.drill(
  '25000000-0000-0000-0000-000000000001', '3-1-02', 'correct', 'practice'
);
select pg_temp.drill(
  '25000000-0000-0000-0000-000000000001', '3-1-02', 'incorrect', 'practice'
);
select pg_temp.drill(
  '25000000-0000-0000-0000-000000000001', '3-1-03', 'correct', 'practice'
);
update public.questions set version = 2 where stable_code = '3-1-03';
select pg_temp.build_session(
  '25000000-0000-0000-0000-000000000001', '3-1-04', 'correct', 'practice',
  '25300000-0000-0000-0000-000000000001'
);
select pg_temp.drill(
  '25000000-0000-0000-0000-000000000001', '3-1-05', 'correct', 'remediation'
);

-- Subtopic 3-2: nine of thirteen correct -> developing.
select pg_temp.drill(
  '25000000-0000-0000-0000-000000000001', code, 'correct', 'practice'
)
from unnest(array[
  '3-2-01', '3-2-02', '3-2-03', '3-2-04', '3-2-05', '3-2-06', '3-2-07',
  '3-2-08', '3-2-09'
]) as code;

-- Subtopic 3-3: all eleven correct -> mastered.
select pg_temp.drill(
  '25000000-0000-0000-0000-000000000001', code, 'correct', 'practice'
)
from unnest(array[
  '3-3-01', '3-3-02', '3-3-03', '3-3-04', '3-3-05', '3-3-06', '3-3-07',
  '3-3-08', '3-3-09', '3-3-10', '3-3-11'
]) as code;

-- One completed review card in 3-1 (three published cards exist).
set local role authenticated;
select public.complete_review_card(
  (
    select id from public.review_cards
    where status = 'published'
    order by sort_order
    limit 1
  ),
  '25300000-0000-0000-0000-000000000002'
);

select results_eq(
  $$select review_completed, review_total, coverage, accuracy, mastery, status
    from public.get_learning_progress('21000000-0000-0000-0000-000000000003')
    where scope = 'subtopic'
      and subtopic_id = 'f929cde5-c294-46ce-5faf-c866b3cb9583'$$,
  $$values (
    1, 3, round(3 * 100.0 / 13, 1), round(2 * 100.0 / 3, 1),
    round(2 * 100.0 / 13, 1), 'learning'
  )$$,
  'the 3-1 subtopic counts only latest current-version qualifying answers'
);
select results_eq(
  $$select coverage, accuracy, mastery, status
    from public.get_learning_progress('21000000-0000-0000-0000-000000000003')
    where scope = 'subtopic'
      and subtopic_id = (
        select st.id from public.subtopics st
        where st.stable_code = 'sheet-3-2-all'
      )$$,
  $$values (
    round(9 * 100.0 / 13, 1), 100.0::numeric, round(9 * 100.0 / 13, 1),
    'developing'
  )$$,
  'nine of thirteen correct lands in developing'
);
select results_eq(
  $$select coverage, accuracy, mastery, status
    from public.get_learning_progress('21000000-0000-0000-0000-000000000003')
    where scope = 'subtopic'
      and subtopic_id = (
        select st.id from public.subtopics st
        where st.stable_code = 'sheet-3-3-all'
      )$$,
  $$values (100.0::numeric, 100.0::numeric, 100.0::numeric, 'mastered')$$,
  'a fully correct subtopic is mastered'
);
select results_eq(
  $$select review_completed, review_total, coverage, accuracy, mastery, status
    from public.get_learning_progress('21000000-0000-0000-0000-000000000004')
    where scope = 'subtopic'$$,
  $$values (0, null::integer, 0.0::numeric, null::numeric, 0.0::numeric,
    'not_started')$$,
  'an untouched subtopic reports not started with dash denominators'
);
select results_eq(
  $$select review_completed, review_total, coverage, accuracy, mastery, status
    from public.get_learning_progress('21000000-0000-0000-0000-000000000003')
    where scope = 'chapter'$$,
  $$values (
    1, 3, round(23 * 100.0 / 37, 1), round(22 * 100.0 / 23, 1),
    round(22 * 100.0 / 37, 1), 'learning'
  )$$,
  'the chapter aggregates over all current versions, not subtopic averages'
);
select is(
  (
    select distinct rules_version
    from public.get_learning_progress('21000000-0000-0000-0000-000000000003')
  ),
  '2026-07-progress-1',
  'progress rows stamp the rules version'
);

-- A different student sees an empty slate, not this student's numbers.
select set_config(
  'request.jwt.claim.sub',
  '25000000-0000-0000-0000-000000000004',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_learning_progress('21000000-0000-0000-0000-000000000003')
    where coverage > 0
  ),
  0,
  'progress is always scoped to the caller'
);

-- Teacher analytics: the owner reads exact chapter mastery per student.
select set_config(
  'request.jwt.claim.sub',
  '25000000-0000-0000-0000-000000000002',
  true
);
select results_eq(
  $$select user_id, chapter_id, mastery, status
    from public.get_classroom_progress('25100000-0000-0000-0000-000000000001')
    where chapter_id = '21000000-0000-0000-0000-000000000003'$$,
  $$values (
    '25000000-0000-0000-0000-000000000001'::uuid,
    '21000000-0000-0000-0000-000000000003'::uuid,
    round(22 * 100.0 / 37, 1), 'learning'
  )$$,
  'the owning teacher reads DB-exact classroom mastery'
);
select ok(
  (
    select bool_and(display_name is not null and display_name !~ '@')
    from public.get_classroom_progress('25100000-0000-0000-0000-000000000001')
  ),
  'classroom progress exposes display names, never emails'
);

select set_config(
  'request.jwt.claim.sub',
  '25000000-0000-0000-0000-000000000003',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_classroom_progress('25100000-0000-0000-0000-000000000001')
  ),
  0,
  'another teacher reads zero rows without existence leaks'
);

select set_config(
  'request.jwt.claim.sub',
  '25000000-0000-0000-0000-000000000004',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_classroom_progress('25100000-0000-0000-0000-000000000001')
  ),
  0,
  'an outsider reads zero rows'
);

reset role;
select is(
  (
    select status::text
    from public.quiz_sessions
    where client_request_id = '25300000-0000-0000-0000-000000000001'
      and user_id = '25000000-0000-0000-0000-000000000001'
  ),
  'in_progress',
  'the unfinished session really stayed unfinished'
);

reset role;
select * from finish();
rollback;
