begin;

select plan(36);

select has_function('public', 'create_assignment', 'create assignment exists');
select has_function(
  'public',
  'update_assignment_status',
  'update assignment status exists'
);
select has_function(
  'public',
  'list_classroom_assignments',
  'owner assignment list exists'
);
select has_function('public', 'list_my_assignments', 'student assignment list exists');
select has_function(
  'public',
  'start_assignment_attempt',
  'start assignment attempt exists'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '15000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'command.teacher.a@colorplay.test',
    crypt('LocalOnly-Command1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '15000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'command.teacher.b@colorplay.test',
    crypt('LocalOnly-Command2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '15000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'command.student.a@colorplay.test',
    crypt('LocalOnly-Command3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '15000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'command.student.b@colorplay.test',
    crypt('LocalOnly-Command4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '15000000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000002'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values
  (
    '15100000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000001',
    'Command Classroom A', decode(repeat('e5', 32), 'hex'), 1, now(), 'active'
  ),
  (
    '15100000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000002',
    'Command Classroom B', decode(repeat('f6', 32), 'hex'), 1, now(), 'active'
  );

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '15100000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '15200000-0000-0000-0000-000000000001'
  ),
  (
    '15100000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '15200000-0000-0000-0000-000000000003'
  ),
  (
    '15100000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000002',
    'teacher', 'active', now(), now(), '15200000-0000-0000-0000-000000000002'
  ),
  (
    '15100000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000004',
    'student', 'active', now(), now(), '15200000-0000-0000-0000-000000000004'
  );

create function pg_temp.correct_option_for(target_question_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select correct_option_id
  from public.quiz_session_questions
  where id = target_question_id;
$$;

create function pg_temp.complete_session_correctly(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  question_record record;
begin
  for question_record in
    select id, position
    from public.quiz_session_questions
    where session_id = target_session_id
    order by position
  loop
    if question_record.position > 1 then
      perform public.activate_next_quiz_question(target_session_id);
    end if;
    perform public.submit_quiz_answer(
      question_record.id,
      gen_random_uuid(),
      pg_temp.correct_option_for(question_record.id)
    );
  end loop;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-0000-0000-000000000001',
  true
);

select set_config(
  'test.main_assignment',
  public.create_assignment(
    '15100000-0000-0000-0000-000000000001',
    'Chapter homework',
    'quiz_template',
    '26000000-0000-0000-0000-000000000003',
    clock_timestamp() - interval '1 hour',
    clock_timestamp() + interval '2 days',
    2,
    600
  )::text,
  true
);
select is(
  current_setting('test.main_assignment')::jsonb ->> 'status',
  'draft',
  'a new assignment starts as a draft'
);
select set_config(
  'test.future_assignment',
  public.create_assignment(
    '15100000-0000-0000-0000-000000000001',
    'Future homework',
    'quiz_template',
    '26000000-0000-0000-0000-000000000003',
    clock_timestamp() + interval '1 day',
    clock_timestamp() + interval '2 days',
    null,
    600
  )::text,
  true
);
select throws_ok(
  $$select public.create_assignment(
    '15100000-0000-0000-0000-000000000001', 'Live homework',
    'live_activity', '15900000-0000-0000-0000-000000000001',
    null, null, null, 1
  )$$,
  'P0001',
  'ASSIGNMENT_LIVE_ACTIVITY_NOT_FOUND',
  'a live assignment requires an owned active live activity'
);

select set_config(
  'test.main_id',
  current_setting('test.main_assignment')::jsonb ->> 'assignment_id',
  true
);
select set_config(
  'test.future_id',
  current_setting('test.future_assignment')::jsonb ->> 'assignment_id',
  true
);

select set_config(
  'test.main_published',
  public.update_assignment_status(
    current_setting('test.main_id')::uuid,
    'published',
    (current_setting('test.main_assignment')::jsonb ->> 'updated_at')::timestamptz
  )::text,
  true
);
select is(
  current_setting('test.main_published')::jsonb ->> 'status',
  'published',
  'a draft assignment publishes'
);
select is(
  (
    select count(*)::integer
    from public.assignment_targets
    where assignment_id = current_setting('test.main_id')::uuid
  ),
  1,
  'publishing snapshots the active student members as targets'
);
select throws_ok(
  format(
    $$select public.update_assignment_status(%L, 'draft', null)$$,
    current_setting('test.main_id')
  ),
  'P0001',
  'ASSIGNMENT_STATUS_INVALID_TRANSITION',
  'published assignments cannot return to draft'
);
select throws_ok(
  format(
    $$select public.update_assignment_status(
      %L, 'paused', clock_timestamp() - interval '1 day'
    )$$,
    current_setting('test.main_id')
  ),
  'P0001',
  'ASSIGNMENT_STATUS_CONFLICT',
  'a stale updated_at expectation is rejected'
);
select set_config(
  'test.main_paused',
  public.update_assignment_status(
    current_setting('test.main_id')::uuid,
    'paused',
    (current_setting('test.main_published')::jsonb ->> 'updated_at')::timestamptz
  )::text,
  true
);
select is(
  current_setting('test.main_paused')::jsonb ->> 'status',
  'paused',
  'published assignments can pause'
);
select set_config(
  'test.main_republished',
  public.update_assignment_status(
    current_setting('test.main_id')::uuid,
    'published',
    (current_setting('test.main_paused')::jsonb ->> 'updated_at')::timestamptz
  )::text,
  true
);
select is(
  current_setting('test.main_republished')::jsonb ->> 'status',
  'published',
  'paused assignments can republish'
);

select set_config(
  'test.future_published',
  public.update_assignment_status(
    current_setting('test.future_id')::uuid,
    'published',
    null
  )::text,
  true
);
select set_config(
  'test.future_archived',
  public.update_assignment_status(
    current_setting('test.future_id')::uuid,
    'archived',
    null
  )::text,
  true
);
select throws_ok(
  format(
    $$select public.update_assignment_status(%L, 'published', null)$$,
    current_setting('test.future_id')
  ),
  'P0001',
  'ASSIGNMENT_STATUS_INVALID_TRANSITION',
  'archived assignments never republish'
);
select is(
  (
    select count(*)::integer
    from public.list_classroom_assignments(
      '15100000-0000-0000-0000-000000000001'
    )
  ),
  2,
  'the owner lists every own assignment'
);

select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-0000-0000-000000000002',
  true
);
select throws_ok(
  $$select public.create_assignment(
    '15100000-0000-0000-0000-000000000001', 'Foreign teacher',
    'quiz_template', '26000000-0000-0000-0000-000000000003',
    null, null, null, 1
  )$$,
  'P0001',
  'CLASSROOM_NOT_FOUND',
  'Teacher B cannot create assignments in Teacher A classroom'
);
select throws_ok(
  format(
    $$select public.update_assignment_status(%L, 'paused', null)$$,
    current_setting('test.main_id')
  ),
  'P0001',
  'ASSIGNMENT_NOT_FOUND',
  'Teacher B cannot mutate Teacher A assignments'
);
select throws_ok(
  $$select * from public.list_classroom_assignments(
    '15100000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'CLASSROOM_NOT_FOUND',
  'Teacher B cannot list Teacher A classroom assignments'
);

select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-0000-0000-000000000003',
  true
);
select is(
  (select count(*)::integer from public.list_my_assignments()),
  1,
  'the targeted student sees only startable assignments'
);
select throws_ok(
  $$select public.start_assignment_attempt(
    '15999999-0000-0000-0000-000000000001',
    '15300000-0000-0000-0000-000000000099'
  )$$,
  'P0001',
  'ASSIGNMENT_NOT_FOUND',
  'an unknown assignment is not disclosed'
);

select set_config(
  'test.attempt_one',
  public.start_assignment_attempt(
    current_setting('test.main_id')::uuid,
    '15300000-0000-0000-0000-000000000001'
  )::text,
  true
);
select is(
  (current_setting('test.attempt_one')::jsonb ->> 'attempt_number')::integer,
  1,
  'the first attempt is numbered one'
);
select is(
  current_setting('test.attempt_one')::jsonb #>> '{session,status}',
  'in_progress',
  'starting an attempt opens a real quiz session'
);
select is(
  public.start_assignment_attempt(
    current_setting('test.main_id')::uuid,
    '15300000-0000-0000-0000-000000000001'
  )::text,
  current_setting('test.attempt_one'),
  'replaying the same request id returns the original attempt'
);
select is(
  (
    select count(*)::integer
    from public.assignment_attempts
    where assignment_id = current_setting('test.main_id')::uuid
  ),
  1,
  'replays never create extra attempts'
);
select is(
  (
    select purpose::text
    from public.quiz_sessions
    where id = (
      current_setting('test.attempt_one')::jsonb #>> '{session,session_id}'
    )::uuid
  ),
  'assignment',
  'attempt sessions carry the assignment purpose'
);

select pg_temp.complete_session_correctly(
  (current_setting('test.attempt_one')::jsonb #>> '{session,session_id}')::uuid
);
select set_config(
  'test.finalize_one',
  public.finalize_quiz_session(
    (current_setting('test.attempt_one')::jsonb #>> '{session,session_id}')::uuid
  )::text,
  true
);
select is(
  current_setting('test.finalize_one')::jsonb #>> '{assignment_attempt,status}',
  'completed',
  'finalize derives assignment completion'
);
select is(
  (current_setting('test.finalize_one')::jsonb #>> '{assignment_attempt,passed}')::boolean,
  true,
  'a 1500-point run passes the 600-point threshold'
);
select is(
  (
    select count(*)::integer
    from public.xp_transactions
    where user_id = '15000000-0000-0000-0000-000000000003'
  ),
  1,
  'assignment completion adds no extra XP ledger row'
);
select is(
  (
    select count(*)::integer
    from public.wallet_transactions
    where user_id = '15000000-0000-0000-0000-000000000003'
  ),
  1,
  'assignment completion adds no extra Token ledger row'
);
select is(
  public.finalize_quiz_session(
    (current_setting('test.attempt_one')::jsonb #>> '{session,session_id}')::uuid
  ) #>> '{assignment_attempt,status}',
  'completed',
  'replayed finalize returns the stored completion'
);

select set_config(
  'test.foreign_session',
  public.create_quiz_session(
    '26000000-0000-0000-0000-000000000004',
    '15300000-0000-0000-0000-000000000042'
  )::text,
  true
);
select throws_ok(
  format(
    $$select public.start_assignment_attempt(
      %L, '15300000-0000-0000-0000-000000000042'
    )$$,
    current_setting('test.main_id')
  ),
  'P0001',
  'ASSIGNMENT_INVALID_REQUEST',
  'a reused practice request id cannot hijack an assignment attempt'
);

select set_config(
  'test.attempt_two',
  public.start_assignment_attempt(
    current_setting('test.main_id')::uuid,
    '15300000-0000-0000-0000-000000000002'
  )::text,
  true
);
select throws_ok(
  format(
    $$select public.start_assignment_attempt(
      %L, '15300000-0000-0000-0000-000000000003'
    )$$,
    current_setting('test.main_id')
  ),
  'P0001',
  'ASSIGNMENT_ATTEMPT_LIMIT_REACHED',
  'the attempt limit blocks a third start'
);

reset role;
update public.assignments
set deadline_at = clock_timestamp() - interval '1 minute'
where id = current_setting('test.main_id')::uuid;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-0000-0000-000000000003',
  true
);
select pg_temp.complete_session_correctly(
  (current_setting('test.attempt_two')::jsonb #>> '{session,session_id}')::uuid
);
select is(
  public.finalize_quiz_session(
    (current_setting('test.attempt_two')::jsonb #>> '{session,session_id}')::uuid
  ) #>> '{assignment_attempt,status}',
  'expired',
  'finalizing after the deadline expires the attempt without a pass'
);
select throws_ok(
  format(
    $$select public.start_assignment_attempt(
      %L, '15300000-0000-0000-0000-000000000004'
    )$$,
    current_setting('test.main_id')
  ),
  'P0001',
  'ASSIGNMENT_DEADLINE_PASSED',
  'past-deadline assignments reject new attempts'
);

select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-0000-0000-000000000004',
  true
);
select is(
  (select count(*)::integer from public.list_my_assignments()),
  0,
  'a student in another classroom sees no foreign assignment'
);
select throws_ok(
  format(
    $$select public.start_assignment_attempt(
      %L, '15300000-0000-0000-0000-000000000005'
    )$$,
    current_setting('test.main_id')
  ),
  'P0001',
  'ASSIGNMENT_NOT_FOUND',
  'a non-target student cannot start a foreign assignment'
);

reset role;
select * from finish();
rollback;
