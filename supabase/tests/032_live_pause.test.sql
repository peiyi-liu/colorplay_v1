begin;

select plan(18);

select has_function('public', 'pause_live_session', 'pause command exists');
select has_function('public', 'resume_live_session', 'resume command exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '32000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'pause.host@colorplay.test',
    crypt('LocalOnly-Pause1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '32000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'pause.teacher.b@colorplay.test',
    crypt('LocalOnly-Pause2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '32000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'pause.student.a@colorplay.test',
    crypt('LocalOnly-Pause3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '32000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000002'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '32100000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  'Pause Classroom', decode(repeat('a2', 32), 'hex'), 1, now(), 'active'
);
insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '32100000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '32200000-0000-0000-0000-000000000001'
  ),
  (
    '32100000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '32200000-0000-0000-0000-000000000003'
  );

create function pg_temp.as_user(target_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select set_config('request.jwt.claim.sub', target_user::text, true);
$$;

create function pg_temp.current_live_question(target_session uuid)
returns public.live_session_questions
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select question.*
  from public.live_session_questions question
  join public.live_sessions live_session
    on live_session.id = question.session_id
  where question.session_id = target_session
    and question."position" = live_session.current_position;
$$;

set local role authenticated;
select pg_temp.as_user('32000000-0000-0000-0000-000000000001');

select set_config(
  'test.activity',
  public.create_live_activity(
    'Pause 對戰', '26000000-0000-0000-0000-000000000003', 20
  )::text,
  true
);
select set_config(
  'test.session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '32100000-0000-0000-0000-000000000001'
  )::text,
  true
);
select set_config(
  'test.session_id',
  current_setting('test.session')::jsonb ->> 'session_id',
  true
);
select set_config(
  'test.started',
  public.start_live_session(current_setting('test.session_id')::uuid, 1)::text,
  true
);

select pg_temp.as_user('32000000-0000-0000-0000-000000000003');
select set_config(
  'test.joined',
  public.join_live_session(
    current_setting('test.session')::jsonb ->> 'join_code',
    '32300000-0000-0000-0000-000000000001'
  )::text,
  true
);

-- Pausing from the lobby is not a legal transition.
select pg_temp.as_user('32000000-0000-0000-0000-000000000001');
select throws_ok(
  format(
    $sql$select public.pause_live_session('%s', (
      select state_version from public.live_sessions where id = '%s'
    ))$sql$,
    current_setting('test.session_id'),
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_INVALID_TRANSITION',
  'pause is rejected outside question_open'
);

select set_config(
  'test.opened',
  public.open_live_question(
    current_setting('test.session_id')::uuid,
    (
      select state_version from public.live_sessions
      where id = current_setting('test.session_id')::uuid
    )
  )::text,
  true
);

-- Only the owning host may pause.
select pg_temp.as_user('32000000-0000-0000-0000-000000000003');
select throws_ok(
  format(
    $sql$select public.pause_live_session('%s', (
      select state_version from public.live_sessions where id = '%s'
    ))$sql$,
    current_setting('test.session_id'),
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'students cannot pause'
);
select pg_temp.as_user('32000000-0000-0000-0000-000000000002');
select throws_ok(
  format(
    $sql$select public.pause_live_session('%s', (
      select state_version from public.live_sessions where id = '%s'
    ))$sql$,
    current_setting('test.session_id'),
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'another teacher cannot pause'
);

select pg_temp.as_user('32000000-0000-0000-0000-000000000001');
select throws_ok(
  format(
    $sql$select public.pause_live_session('%s', 999)$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_CONFLICT',
  'a stale state version cannot pause'
);

select set_config(
  'test.paused',
  public.pause_live_session(
    current_setting('test.session_id')::uuid,
    (
      select state_version from public.live_sessions
      where id = current_setting('test.session_id')::uuid
    )
  )::text,
  true
);
select is(
  (
    select state::text from public.live_sessions
    where id = current_setting('test.session_id')::uuid
  ),
  'paused',
  'pausing moves the session to paused'
);
select ok(
  (
    select paused_remaining_ms between 1 and 20000
    from public.live_sessions
    where id = current_setting('test.session_id')::uuid
  ),
  'the remaining time is frozen inside the question window'
);
select is(
  (
    select state_version from public.live_sessions
    where id = current_setting('test.session_id')::uuid
  ),
  (current_setting('test.opened')::jsonb ->> 'state_version')::integer + 1,
  'pausing bumps the state version exactly once'
);

-- Answers are rejected while paused.
select pg_temp.as_user('32000000-0000-0000-0000-000000000003');
select throws_ok(
  format(
    $sql$select public.submit_live_answer('%s', '%s', gen_random_uuid())$sql$,
    (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
    (
      pg_temp.current_live_question(current_setting('test.session_id')::uuid)
    ).correct_option_id
  ),
  'P0001',
  'LIVE_ANSWER_CLOSED',
  'answers are rejected while paused'
);

-- Refresh recovery carries the paused question payload.
select is(
  public.get_live_session_state(current_setting('test.session_id')::uuid)
    ->> 'state',
  'paused',
  'refresh recovery reports the paused state'
);
select ok(
  public.get_live_session_state(current_setting('test.session_id')::uuid)
    -> 'question' is not null,
  'refresh recovery keeps the frozen question visible'
);

select pg_temp.as_user('32000000-0000-0000-0000-000000000001');
select throws_ok(
  format(
    $sql$select public.pause_live_session('%s', (
      select state_version from public.live_sessions where id = '%s'
    ))$sql$,
    current_setting('test.session_id'),
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_INVALID_TRANSITION',
  'pausing twice is rejected'
);

select set_config(
  'test.resumed',
  public.resume_live_session(
    current_setting('test.session_id')::uuid,
    (
      select state_version from public.live_sessions
      where id = current_setting('test.session_id')::uuid
    )
  )::text,
  true
);
select ok(
  (
    select state = 'question_open' and paused_remaining_ms is null
    from public.live_sessions
    where id = current_setting('test.session_id')::uuid
  ),
  'resuming returns to question_open and clears the frozen remainder'
);
select ok(
  (
    select deadline_at > clock_timestamp()
      and deadline_at <= clock_timestamp() + interval '21 seconds'
    from pg_temp.current_live_question(
      current_setting('test.session_id')::uuid
    )
  ),
  'the resumed deadline restores the frozen remaining window'
);

-- Answers flow again after resume.
select pg_temp.as_user('32000000-0000-0000-0000-000000000003');
select lives_ok(
  format(
    $sql$select public.submit_live_answer('%s', '%s', gen_random_uuid())$sql$,
    (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
    (
      pg_temp.current_live_question(current_setting('test.session_id')::uuid)
    ).correct_option_id
  ),
  'answers are accepted after resume'
);

-- The streak-bearing submit must keep broadcasting the answered count
-- (the hardening behavior a later replacement must never drop again).
reset role;
select is(
  (
    select count(*)::integer
    from realtime.messages
    where topic = 'live-session:' || current_setting('test.session_id')
      and (payload ->> 'answered_count')::integer = 1
  ),
  1,
  'submitting an answer still broadcasts the answered count'
);

set local role authenticated;
select pg_temp.as_user('32000000-0000-0000-0000-000000000001');
select throws_ok(
  format(
    $sql$select public.resume_live_session('%s', (
      select state_version from public.live_sessions where id = '%s'
    ))$sql$,
    current_setting('test.session_id'),
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_INVALID_TRANSITION',
  'resume outside paused is rejected'
);

reset role;
select * from finish();
rollback;
