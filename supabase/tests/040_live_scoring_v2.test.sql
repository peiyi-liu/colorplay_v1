-- 10A live scoring v2 (2026-07-live-3): speed-based scoring, all-answered
-- auto-close, and the six-digit numeric join code with throttled lookups.

begin;

select plan(44);

select has_table(
  'public', 'live_join_throttle', 'join throttle table exists'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.live_join_throttle'::regclass
  ),
  'join throttle table enforces row level security'
);
select has_function(
  'public',
  'live_close_open_question',
  'internal auto-close helper exists'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'scoring.host@colorplay.test',
    crypt('LocalOnly-Score1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'scoring.student.a@colorplay.test',
    crypt('LocalOnly-Score3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'scoring.student.b@colorplay.test',
    crypt('LocalOnly-Score4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-0000-0000-000000000005',
    'authenticated', 'authenticated', 'scoring.outsider@colorplay.test',
    crypt('LocalOnlyScore5!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '40000000-0000-0000-0000-000000000001';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '40100000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'Scoring Classroom', decode(repeat('e1', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '40100000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '40200000-0000-0000-0000-000000000001'
  ),
  (
    '40100000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '40200000-0000-0000-0000-000000000003'
  ),
  (
    '40100000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000004',
    'student', 'active', now(), now(), '40200000-0000-0000-0000-000000000004'
  );

create function pg_temp.as_user(target_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select set_config('request.jwt.claim.sub', target_user::text, true);
$$;

create function pg_temp.session_state(target_session uuid)
returns public.live_sessions
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select live_session.*
  from public.live_sessions live_session
  where live_session.id = target_session;
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

create function pg_temp.wrong_option_of(
  target_question public.live_session_questions
)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select (option_value ->> 'id')::uuid
  from jsonb_array_elements(target_question.public_options) option_value
  where (option_value ->> 'id')::uuid <> target_question.correct_option_id
  limit 1;
$$;

create function pg_temp.answer_of(
  target_session uuid,
  target_position integer,
  target_user uuid
)
returns public.live_answers
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select answer.*
  from public.live_answers answer
  join public.live_participants participant
    on participant.id = answer.participant_id
  join public.live_session_questions question
    on question.id = answer.session_question_id
  where question.session_id = target_session
    and question."position" = target_position
    and participant.user_id = target_user;
$$;

create function pg_temp.question_at(
  target_session uuid,
  target_position integer
)
returns public.live_session_questions
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select question.*
  from public.live_session_questions question
  where question.session_id = target_session
    and question."position" = target_position;
$$;

-- Mirrors the pinned 2026-07-live-3 formula exactly:
-- score = round(150 - 75 * response_ms / time_limit_ms), clamped to [75, 150].
create function pg_temp.expected_speed_score(
  target_answer public.live_answers,
  target_question public.live_session_questions
)
returns integer
language sql
set search_path = pg_catalog, public, pg_temp
as $$
  select greatest(75, least(150, round(
    150 - (75 * target_answer.response_ms)::numeric
      / greatest(1, round(extract(
          epoch from target_question.deadline_at - target_question.opened_at
        ) * 1000)::integer)
  )::integer));
$$;

create function pg_temp.feedback_broadcast_count(target_session uuid)
returns integer
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select count(*)::integer
  from realtime.messages
  where topic = 'live-session:' || target_session::text
    and payload::text like '%correct_option_id%';
$$;

create function pg_temp.timeout_count(
  target_session uuid,
  target_position integer
)
returns integer
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select count(*)::integer
  from public.live_answers answer
  join public.live_session_questions question
    on question.id = answer.session_question_id
  where question.session_id = target_session
    and question."position" = target_position
    and answer.answer_status = 'timeout';
$$;

set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');

select set_config(
  'test.activity',
  public.create_live_activity(
    'Kahoot 節奏', '26000000-0000-0000-0000-000000000003', 20
  )::text,
  true
);
select is(
  current_setting('test.activity')::jsonb ->> 'rules_version',
  '2026-07-live-3',
  'new live activities pin rules version 2026-07-live-3'
);

select set_config(
  'test.session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '40100000-0000-0000-0000-000000000001',
    null
  )::text,
  true
);
select set_config(
  'test.session_id',
  current_setting('test.session')::jsonb ->> 'session_id',
  true
);
select matches(
  current_setting('test.session')::jsonb ->> 'join_code',
  '^[0-9]{6}$',
  'the join code is six numeric digits'
);
select is(
  (pg_temp.session_state(current_setting('test.session_id')::uuid))
    .rules_version,
  '2026-07-live-3',
  'new live sessions pin rules version 2026-07-live-3'
);

select set_config(
  'test.rotated',
  public.rotate_live_join_code(
    current_setting('test.session_id')::uuid
  )::text,
  true
);
select matches(
  current_setting('test.rotated')::jsonb ->> 'join_code',
  '^[0-9]{6}$',
  'rotated join codes are six numeric digits too'
);
select set_config(
  'test.code',
  current_setting('test.rotated')::jsonb ->> 'join_code',
  true
);
select set_config(
  'test.wrong_code',
  lpad(
    (
      (current_setting('test.code')::integer + 1) % 1000000
    )::text,
    6,
    '0'
  ),
  true
);

-- Only completed/cancelled sessions release their code for reuse.
reset role;
select lives_ok(
  format(
    $sql$insert into public.live_sessions (
      id, live_activity_id, host_teacher_id, classroom_id, state,
      join_code_hash, join_code_version, current_position, state_version,
      question_count, completed_at
    ) values (
      '40900000-0000-0000-0000-000000000001', '%s',
      '40000000-0000-0000-0000-000000000001',
      '40100000-0000-0000-0000-000000000001', 'completed',
      decode(repeat('ab', 32), 'hex'), 1, 0, 1, 0, now()
    )$sql$,
    current_setting('test.activity')::jsonb ->> 'activity_id'
  ),
  'a completed session can hold an arbitrary code'
);
select lives_ok(
  format(
    $sql$insert into public.live_sessions (
      id, live_activity_id, host_teacher_id, classroom_id, state,
      join_code_hash, join_code_version, current_position, state_version,
      question_count
    ) values (
      '40900000-0000-0000-0000-000000000002', '%s',
      '40000000-0000-0000-0000-000000000001',
      '40100000-0000-0000-0000-000000000001', 'draft',
      decode(repeat('ab', 32), 'hex'), 1, 0, 1, 0
    )$sql$,
    current_setting('test.activity')::jsonb ->> 'activity_id'
  ),
  'a finished session releases its code back to the pool'
);
select throws_ok(
  format(
    $sql$insert into public.live_sessions (
      id, live_activity_id, host_teacher_id, classroom_id, state,
      join_code_hash, join_code_version, current_position, state_version,
      question_count
    ) values (
      '40900000-0000-0000-0000-000000000003', '%s',
      '40000000-0000-0000-0000-000000000001',
      '40100000-0000-0000-0000-000000000001', 'lobby',
      decode(repeat('ab', 32), 'hex'), 1, 0, 1, 0
    )$sql$,
    current_setting('test.activity')::jsonb ->> 'activity_id'
  ),
  '23505',
  null,
  'two active sessions can never share a join code'
);

set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');
select set_config(
  'test.started',
  public.start_live_session(current_setting('test.session_id')::uuid, 1)::text,
  true
);

select pg_temp.as_user('40000000-0000-0000-0000-000000000003');
select set_config(
  'test.joined_a',
  public.join_live_session(
    current_setting('test.code'),
    '40300000-0000-0000-0000-000000000001'
  )::text,
  true
);
select is(
  current_setting('test.joined_a')::jsonb ->> 'session_id',
  current_setting('test.session_id'),
  'a classmate joins with the six-digit code'
);

-- Failed lookups return committed payload errors so the throttle can count
-- them; ten failures inside the window block the eleventh attempt.
select pg_temp.as_user('40000000-0000-0000-0000-000000000004');
select is(
  public.join_live_session(
    'ABCDEF', '40300000-0000-0000-0000-000000000002'
  ) ->> 'error',
  'LIVE_JOIN_INVALID_CODE',
  'a non-numeric code is rejected as a payload error'
);
select is(
  public.join_live_session(
    current_setting('test.wrong_code'),
    '40300000-0000-0000-0000-000000000003'
  ) ->> 'error',
  'LIVE_JOIN_INVALID_CODE',
  'an unknown six-digit code is rejected without raising'
);
select is(
  (
    select count(*)::integer
    from (
      select public.join_live_session(
        current_setting('test.wrong_code'), gen_random_uuid()
      ) as receipt
      from generate_series(1, 8)
    ) attempts
    where attempts.receipt ->> 'error' = 'LIVE_JOIN_INVALID_CODE'
  ),
  8,
  'repeated bad codes keep failing as payload errors'
);
select is(
  public.join_live_session(
    current_setting('test.code'), '40300000-0000-0000-0000-000000000004'
  ) ->> 'error',
  'LIVE_JOIN_RATE_LIMITED',
  'the eleventh attempt in the window is throttled even with a valid code'
);
reset role;
select is(
  (
    select failure_count
    from public.live_join_throttle
    where user_id = '40000000-0000-0000-0000-000000000004'
  ),
  10,
  'exactly ten failures are recorded in the window'
);
update public.live_join_throttle
set window_started_at = window_started_at - interval '61 seconds'
where user_id = '40000000-0000-0000-0000-000000000004';

set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-000000000004');
select set_config(
  'test.joined_b',
  public.join_live_session(
    current_setting('test.code'),
    '40300000-0000-0000-0000-000000000005'
  )::text,
  true
);
select is(
  current_setting('test.joined_b')::jsonb ->> 'session_id',
  current_setting('test.session_id'),
  'the throttle window expires after sixty seconds'
);

select pg_temp.as_user('40000000-0000-0000-0000-000000000005');
select is(
  public.join_live_session(
    current_setting('test.code'), '40300000-0000-0000-0000-000000000006'
  ) ->> 'error',
  'LIVE_JOIN_INVALID_CODE',
  'a non-member sees the same invalid-code payload'
);

-- Question 1: instant correct answer scores the full 150; the last answer
-- closes the question automatically without timeout fills.
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');
select set_config(
  'test.q1_open',
  public.open_live_question(
    current_setting('test.session_id')::uuid,
    (current_setting('test.started')::jsonb ->> 'state_version')::integer
  )::text,
  true
);

select pg_temp.as_user('40000000-0000-0000-0000-000000000003');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  (
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ).correct_option_id,
  '40400000-0000-0000-0000-000000000001'
);
select is(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 1,
      '40000000-0000-0000-0000-000000000003'
    )
  ).score_delta,
  150,
  'an instant correct answer scores the full 150'
);
select is(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 1,
      '40000000-0000-0000-0000-000000000003'
    )
  ).score_delta,
  pg_temp.expected_speed_score(
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 1,
      '40000000-0000-0000-0000-000000000003'
    ),
    pg_temp.question_at(current_setting('test.session_id')::uuid, 1)
  ),
  'the stored score matches the pinned linear formula'
);
select is(
  (pg_temp.session_state(current_setting('test.session_id')::uuid)).state::text,
  'question_open',
  'the question stays open while someone has not answered'
);

select pg_temp.as_user('40000000-0000-0000-0000-000000000004');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  pg_temp.wrong_option_of(
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ),
  '40400000-0000-0000-0000-000000000002'
);
select is(
  (pg_temp.session_state(current_setting('test.session_id')::uuid)).state::text,
  'question_feedback',
  'the last answer closes the question automatically'
);
select is(
  (
    pg_temp.session_state(current_setting('test.session_id')::uuid)
  ).state_version,
  4,
  'the automatic close bumps the state version exactly once'
);
select is(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 1,
      '40000000-0000-0000-0000-000000000004'
    )
  ).score_delta,
  0,
  'a wrong answer still scores zero'
);
select is(
  pg_temp.timeout_count(current_setting('test.session_id')::uuid, 1),
  0,
  'auto-close fills no timeout rows when everyone answered'
);
select is(
  pg_temp.feedback_broadcast_count(current_setting('test.session_id')::uuid),
  1,
  'the automatic close broadcasts the feedback payload once'
);

-- The racing manual close is idempotent instead of a conflict.
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');
select set_config(
  'test.q1_manual',
  public.close_live_question(
    current_setting('test.session_id')::uuid,
    (current_setting('test.q1_open')::jsonb ->> 'state_version')::integer
  )::text,
  true
);
select is(
  current_setting('test.q1_manual')::jsonb ->> 'state',
  'question_feedback',
  'a racing manual close returns the feedback receipt idempotently'
);
select is(
  current_setting('test.q1_manual')::jsonb ->> 'correct_option_id',
  (
    pg_temp.question_at(current_setting('test.session_id')::uuid, 1)
  ).correct_option_id::text,
  'the idempotent close reveals the same correct option'
);
select is(
  pg_temp.feedback_broadcast_count(current_setting('test.session_id')::uuid),
  1,
  'the idempotent close does not broadcast again'
);
select throws_ok(
  format(
    $sql$select public.close_live_question('%s', 2)$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_CONFLICT',
  'an older stale version still conflicts'
);
select throws_ok(
  format(
    $sql$select public.close_live_question('%s', 4)$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_INVALID_TRANSITION',
  'closing an already-closed question at the current version is rejected'
);

-- Question 2: a ten-second answer follows the linear curve; the host can
-- still close manually while someone has not answered.
select public.advance_live_session(
  current_setting('test.session_id')::uuid,
  (
    pg_temp.session_state(current_setting('test.session_id')::uuid)
  ).state_version
);
reset role;
update public.live_session_questions
set opened_at = now() - interval '10 seconds',
    deadline_at = now() + interval '10 seconds'
where session_id = current_setting('test.session_id')::uuid
  and "position" = 2;

set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-000000000003');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  (
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ).correct_option_id,
  '40400000-0000-0000-0000-000000000003'
);
select is(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 2,
      '40000000-0000-0000-0000-000000000003'
    )
  ).score_delta,
  pg_temp.expected_speed_score(
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 2,
      '40000000-0000-0000-0000-000000000003'
    ),
    pg_temp.question_at(current_setting('test.session_id')::uuid, 2)
  ),
  'a mid-window answer follows the linear formula'
);
select ok(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 2,
      '40000000-0000-0000-0000-000000000003'
    )
  ).score_delta between 105 and 113,
  'a ten-second answer lands near 113 of 150'
);
select cmp_ok(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 2,
      '40000000-0000-0000-0000-000000000003'
    )
  ).response_ms,
  '>=',
  10000,
  'the response time reflects the ten-second delay'
);
select is(
  (pg_temp.session_state(current_setting('test.session_id')::uuid)).state::text,
  'question_open',
  'auto-close waits for the remaining participant'
);
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');
select set_config(
  'test.q2_closed',
  public.close_live_question(
    current_setting('test.session_id')::uuid,
    (
      pg_temp.session_state(current_setting('test.session_id')::uuid)
    ).state_version
  )::text,
  true
);
select is(
  current_setting('test.q2_closed')::jsonb ->> 'state',
  'question_feedback',
  'the host can still close manually before everyone answers'
);
select is(
  pg_temp.timeout_count(current_setting('test.session_id')::uuid, 2),
  1,
  'the manual close still fills missing answers with timeouts'
);

-- Question 3: answering right at the deadline earns the 75-point floor.
select public.advance_live_session(
  current_setting('test.session_id')::uuid,
  (
    pg_temp.session_state(current_setting('test.session_id')::uuid)
  ).state_version
);
reset role;
update public.live_session_questions
set opened_at = clock_timestamp() - interval '19.5 seconds',
    deadline_at = clock_timestamp() + interval '0.5 seconds'
where session_id = current_setting('test.session_id')::uuid
  and "position" = 3;

set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-000000000003');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  (
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ).correct_option_id,
  '40400000-0000-0000-0000-000000000004'
);
select is(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 3,
      '40000000-0000-0000-0000-000000000003'
    )
  ).score_delta,
  pg_temp.expected_speed_score(
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 3,
      '40000000-0000-0000-0000-000000000003'
    ),
    pg_temp.question_at(current_setting('test.session_id')::uuid, 3)
  ),
  'a buzzer-beater matches the formula'
);
select ok(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 3,
      '40000000-0000-0000-0000-000000000003'
    )
  ).score_delta between 75 and 77,
  'answering at the deadline earns the 75-point floor'
);
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');
select public.close_live_question(
  current_setting('test.session_id')::uuid,
  (
    pg_temp.session_state(current_setting('test.session_id')::uuid)
  ).state_version
);

-- Question 4: submissions after the deadline are timeouts and the second
-- timeout still triggers the automatic close.
select public.advance_live_session(
  current_setting('test.session_id')::uuid,
  (
    pg_temp.session_state(current_setting('test.session_id')::uuid)
  ).state_version
);
reset role;
update public.live_session_questions
set deadline_at = clock_timestamp() - interval '1 second'
where session_id = current_setting('test.session_id')::uuid
  and "position" = 4;

set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-000000000003');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  (
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ).correct_option_id,
  '40400000-0000-0000-0000-000000000005'
);
select is(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 4,
      '40000000-0000-0000-0000-000000000003'
    )
  ).answer_status::text,
  'timeout',
  'submitting after the deadline records a timeout'
);
select is(
  (
    pg_temp.answer_of(
      current_setting('test.session_id')::uuid, 4,
      '40000000-0000-0000-0000-000000000003'
    )
  ).score_delta,
  0,
  'timeouts score zero under the new rules'
);
select pg_temp.as_user('40000000-0000-0000-0000-000000000004');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  (
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ).correct_option_id,
  '40400000-0000-0000-0000-000000000006'
);
select is(
  (pg_temp.session_state(current_setting('test.session_id')::uuid)).state::text,
  'question_feedback',
  'timeout submissions also trigger the automatic close'
);

reset role;
select is(
  (
    select participant.score
    from public.live_participants participant
    where participant.session_id = current_setting('test.session_id')::uuid
      and participant.user_id = '40000000-0000-0000-0000-000000000003'
  ),
  (
    select coalesce(sum(answer.score_delta), 0)::integer
    from public.live_answers answer
    join public.live_participants participant
      on participant.id = answer.participant_id
    join public.live_session_questions question
      on question.id = answer.session_question_id
    where question.session_id = current_setting('test.session_id')::uuid
      and participant.user_id = '40000000-0000-0000-0000-000000000003'
  ),
  'the participant total equals the sum of authoritative answer scores'
);

-- Sessions pinned to the previous rules version keep the two-tier scoring.
set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');
select set_config(
  'test.legacy',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '40100000-0000-0000-0000-000000000001',
    null
  )::text,
  true
);
select set_config(
  'test.legacy_id',
  current_setting('test.legacy')::jsonb ->> 'session_id',
  true
);
reset role;
update public.live_sessions
set rules_version = '2026-07-live-1'
where id = current_setting('test.legacy_id')::uuid;

set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');
select public.start_live_session(current_setting('test.legacy_id')::uuid, 1);
select pg_temp.as_user('40000000-0000-0000-0000-000000000003');
select public.join_live_session(
  current_setting('test.legacy')::jsonb ->> 'join_code',
  '40300000-0000-0000-0000-000000000007'
);
select pg_temp.as_user('40000000-0000-0000-0000-000000000001');
select public.open_live_question(
  current_setting('test.legacy_id')::uuid,
  (
    pg_temp.session_state(current_setting('test.legacy_id')::uuid)
  ).state_version
);
reset role;
update public.live_session_questions
set opened_at = now() - interval '10 seconds',
    deadline_at = now() + interval '10 seconds'
where session_id = current_setting('test.legacy_id')::uuid
  and "position" = 1;

set local role authenticated;
select pg_temp.as_user('40000000-0000-0000-0000-000000000003');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.legacy_id')::uuid)).id,
  (
    pg_temp.current_live_question(current_setting('test.legacy_id')::uuid)
  ).correct_option_id,
  '40400000-0000-0000-0000-000000000007'
);
select is(
  (
    pg_temp.answer_of(
      current_setting('test.legacy_id')::uuid, 1,
      '40000000-0000-0000-0000-000000000003'
    )
  ).score_delta,
  100,
  'sessions pinned to 2026-07-live-1 keep the legacy two-tier scoring'
);

select * from finish();
rollback;
