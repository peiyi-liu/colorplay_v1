begin;

select plan(14);

select ok(
  has_function_privilege(
    'authenticated',
    'public.teacher_classroom_summary(uuid, date, date, uuid, uuid)',
    'EXECUTE'
  ),
  'teachers may read the classroom summary'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.teacher_classroom_summary(uuid, date, date, uuid, uuid)',
    'EXECUTE'
  ),
  'anonymous cannot read analytics'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '29000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'analytics.teacher.a@colorplay.test',
    crypt('LocalOnly-Analytics1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '29000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'analytics.student.a@colorplay.test',
    crypt('LocalOnly-Analytics2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '29000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'analytics.teacher.b@colorplay.test',
    crypt('LocalOnly-Analytics3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '29000000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000003'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '29100000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000001',
  'Analytics Classroom', decode(repeat('d1', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '29100000-0000-0000-0000-000000000001',
    '29000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '29200000-0000-0000-0000-000000000001'
  ),
  (
    '29100000-0000-0000-0000-000000000001',
    '29000000-0000-0000-0000-000000000002',
    'student', 'active', now(), now(), '29200000-0000-0000-0000-000000000002'
  );

create function pg_temp.fact_session(
  question_code text,
  answered_correctly boolean,
  answered_at_utc timestamptz,
  request_id uuid
)
returns void
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
begin
  select * into question_record
  from public.questions where stable_code = question_code;
  select id into correct_option from public.question_options
  where question_id = question_record.id and question_options.is_correct;
  select id into wrong_option from public.question_options
  where question_id = question_record.id and not is_correct
  order by sort_order limit 1;

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count,
    status, answered_count, correct_count, total_score, completed_at
  ) values (
    '29000000-0000-0000-0000-000000000002',
    '26000000-0000-0000-0000-000000000003', request_id, '分析', 1,
    'completed', 1, case when answered_correctly then 1 else 0 end,
    case when answered_correctly then 150 else 0 end, answered_at_utc
  ) returning id into new_session;

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
    correct_option,
    answered_at_utc - interval '10 seconds', answered_at_utc + interval '10 seconds'
  ) returning id into new_question;

  insert into public.quiz_answers (
    session_id, session_question_id, user_id, selected_option_id,
    correct_option_id, answer_status, response_ms, score_delta,
    idempotency_key, answered_at
  ) values (
    new_session, new_question, '29000000-0000-0000-0000-000000000002',
    case when answered_correctly then correct_option else wrong_option end,
    correct_option,
    case when answered_correctly then 'correct'::public.quiz_answer_status
      else 'incorrect'::public.quiz_answer_status end,
    2000, case when answered_correctly then 150 else 0 end,
    gen_random_uuid(), answered_at_utc
  );
end;
$$;

-- 2026-07-17T15:59Z = 台北 7/17 23:59；2026-07-17T16:01Z = 台北 7/18 00:01。
select pg_temp.fact_session(
  '3-1-01', true, '2026-07-17T15:59:00+00:00',
  '29300000-0000-0000-0000-000000000001'
);
select pg_temp.fact_session(
  '3-1-02', false, '2026-07-17T16:01:00+00:00',
  '29300000-0000-0000-0000-000000000002'
);
select pg_temp.fact_session(
  '3-2-01', true, '2026-07-18T03:00:00+00:00',
  '29300000-0000-0000-0000-000000000003'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '29000000-0000-0000-0000-000000000001',
  true
);

select results_eq(
  $$select attempts, unique_students, average_accuracy
    from public.teacher_classroom_summary(
      '29100000-0000-0000-0000-000000000001', null, null, null, null
    )$$,
  $$values (3, 1, round(2 * 100.0 / 3, 1))$$,
  'the unfiltered summary matches independent recomputation'
);
select is(
  (
    select worst_subtopic_code
    from public.teacher_classroom_summary(
      '29100000-0000-0000-0000-000000000001', null, null, null, null
    )
  ),
  'sheet-3-1-all',
  'the worst subtopic is the lowest-accuracy one'
);
select results_eq(
  $$select attempts, average_accuracy
    from public.teacher_classroom_summary(
      '29100000-0000-0000-0000-000000000001',
      '2026-07-18', '2026-07-18', null, null
    )$$,
  $$values (2, 50.0::numeric)$$,
  'Taipei date boundaries split midnight correctly'
);
select results_eq(
  $$select attempts, average_accuracy
    from public.teacher_classroom_summary(
      '29100000-0000-0000-0000-000000000001', null, null,
      '21000000-0000-0000-0000-000000000004', null
    )$$,
  $$values (0, null::numeric)$$,
  'an empty scope reports null accuracy, never a misleading zero'
);
select results_eq(
  $$select attempts, correct_rate
    from public.teacher_question_analysis(
      '29100000-0000-0000-0000-000000000001', null, null, null, null
    )
    where stable_code = '3-1-01'$$,
  $$values (1, 100.0::numeric)$$,
  'question analysis matches the facts'
);
select results_eq(
  $$select answers, accuracy
    from public.teacher_subtopic_mastery(
      '29100000-0000-0000-0000-000000000001', null, null, null, null
    )
    where subtopic_code = 'sheet-3-1-all'$$,
  $$values (2, 50.0::numeric)$$,
  'subtopic mastery aggregates per subtopic'
);

reset role;
insert into public.assignments (
  id, owner_teacher_id, classroom_id, title, activity_type, quiz_template_id,
  status, passing_rule
) values (
  '29400000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000001',
  '29100000-0000-0000-0000-000000000001',
  '分析測試作業', 'quiz_template', '26000000-0000-0000-0000-000000000003',
  'published', '{"threshold": 600}'
);
insert into public.assignment_targets (assignment_id, user_id)
values (
  '29400000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000002'
);
insert into public.assignment_attempts (
  assignment_id, user_id, attempt_number, status, passed, completed_at
) values (
  '29400000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000002', 1, 'completed', true,
  '2026-07-18T04:00:00+00:00'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '29000000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  $$select targets, completed, passed
    from public.teacher_assignment_summary(
      '29100000-0000-0000-0000-000000000001', null, null
    )
    where title = '分析測試作業'$$,
  $$values (1, 1, 1)$$,
  'assignment summary counts targets, completions, and passes'
);

reset role;
insert into public.live_activities (
  id, owner_teacher_id, title, quiz_template_id, question_time_limit_seconds,
  status
) values (
  '29500000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000001',
  '分析 Live', '26000000-0000-0000-0000-000000000003', 20, 'active'
);
insert into public.live_sessions (
  id, live_activity_id, host_teacher_id, classroom_id, state, join_code_hash,
  join_code_version, current_position, state_version, question_count,
  completed_at
) values (
  '29600000-0000-0000-0000-000000000001',
  '29500000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000001',
  '29100000-0000-0000-0000-000000000001',
  'completed', decode(repeat('e2', 32), 'hex'), 1, 10, 30, 10,
  '2026-07-18T05:00:00+00:00'
);
insert into public.live_participants (
  session_id, user_id, status, score
) values (
  '29600000-0000-0000-0000-000000000001',
  '29000000-0000-0000-0000-000000000002', 'active', 1200
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '29000000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  $$select participants
    from public.teacher_live_session_report(
      '29100000-0000-0000-0000-000000000001', null, null
    )
    where activity_title = '分析 Live'$$,
  $$values (1)$$,
  'live reports list completed sessions with participants'
);

select set_config(
  'request.jwt.claim.sub',
  '29000000-0000-0000-0000-000000000003',
  true
);
select is(
  (
    select count(*)::integer
    from public.teacher_classroom_summary(
      '29100000-0000-0000-0000-000000000001', null, null, null, null
    )
  ),
  0,
  'another teacher reads zero summary rows'
);
select is(
  (
    select count(*)::integer
    from public.teacher_question_analysis(
      '29100000-0000-0000-0000-000000000001', null, null, null, null
    )
  ),
  0,
  'another teacher reads zero analysis rows'
);

select set_config(
  'request.jwt.claim.sub',
  '29000000-0000-0000-0000-000000000002',
  true
);
select is(
  (
    select count(*)::integer
    from public.teacher_assignment_summary(
      '29100000-0000-0000-0000-000000000001', null, null
    )
  ),
  0,
  'students read zero analytics rows'
);
select is(
  (
    select count(*)::integer
    from public.teacher_live_session_report(
      '29100000-0000-0000-0000-000000000001', null, null
    )
  ),
  0,
  'students read zero live report rows'
);

reset role;
select * from finish();
rollback;
