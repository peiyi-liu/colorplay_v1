-- 10D student experience: dual-screen server-side question filtering (state
-- reads and broadcasts), the activity-level display switch, late join with
-- next-question eligibility, and the participant-only personal standing.

begin;

select plan(26);

select has_function(
  'public', 'live_my_standing', 'personal standing command exists'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '42000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'student.exp.host@colorplay.test',
    crypt('LocalOnly-Sexp1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '42000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'student.exp.a@colorplay.test',
    crypt('LocalOnly-Sexp3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '42000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'student.exp.b@colorplay.test',
    crypt('LocalOnly-Sexp4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '42000000-0000-0000-0000-000000000005',
    'authenticated', 'authenticated', 'student.exp.late@colorplay.test',
    crypt('LocalOnly-Sexp5!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '42000000-0000-0000-0000-000000000001';
update public.profiles
set display_name = '甲同學'
where id = '42000000-0000-0000-0000-000000000003';
update public.profiles
set display_name = '乙同學'
where id = '42000000-0000-0000-0000-000000000004';
update public.profiles
set display_name = '遲到同學'
where id = '42000000-0000-0000-0000-000000000005';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '42100000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'Student Experience Classroom', decode(repeat('f2', 32), 'hex'), 1, now(),
  'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '42100000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '42200000-0000-0000-0000-000000000001'
  ),
  (
    '42100000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '42200000-0000-0000-0000-000000000003'
  ),
  (
    '42100000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000004',
    'student', 'active', now(), now(), '42200000-0000-0000-0000-000000000004'
  ),
  (
    '42100000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000005',
    'student', 'active', now(), now(), '42200000-0000-0000-0000-000000000005'
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

create function pg_temp.last_question_broadcast(target_session uuid)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select message.payload
  from realtime.messages message
  where message.topic = 'live-session:' || target_session::text
    and message.payload ? 'question'
  order by message.inserted_at desc, message.id desc
  limit 1;
$$;

set local role authenticated;
select pg_temp.as_user('42000000-0000-0000-0000-000000000001');

-- The display switch validates its value.
select throws_ok(
  $$select public.create_live_activity(
    '壞開關', '26000000-0000-0000-0000-000000000003', 20, 'projector'
  )$$,
  'P0001',
  'LIVE_INVALID_REQUEST',
  'create_live_activity rejects unknown display modes'
);

select set_config(
  'test.activity',
  public.create_live_activity(
    '雙螢幕對戰', '26000000-0000-0000-0000-000000000003', 20
  )::text,
  true
);
select is(
  current_setting('test.activity')::jsonb ->> 'question_display',
  'screen_only',
  'dual-screen is the activity default'
);

select set_config(
  'test.session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '42100000-0000-0000-0000-000000000001',
    null
  )::text,
  true
);
select set_config(
  'test.session_id',
  current_setting('test.session')::jsonb ->> 'session_id',
  true
);
select set_config(
  'test.code',
  current_setting('test.session')::jsonb ->> 'join_code',
  true
);
select set_config(
  'test.started',
  public.start_live_session(current_setting('test.session_id')::uuid, 1)::text,
  true
);

select pg_temp.as_user('42000000-0000-0000-0000-000000000003');
select public.join_live_session(
  current_setting('test.code'), '42300000-0000-0000-0000-000000000001'
);
select pg_temp.as_user('42000000-0000-0000-0000-000000000004');
select public.join_live_session(
  current_setting('test.code'), '42300000-0000-0000-0000-000000000002'
);

select pg_temp.as_user('42000000-0000-0000-0000-000000000001');
select public.open_live_question(
  current_setting('test.session_id')::uuid,
  (current_setting('test.started')::jsonb ->> 'state_version')::integer
);

-- Server-side question filtering.
select is(
  public.get_live_session_state(current_setting('test.session_id')::uuid)
    -> 'question' ->> 'prompt' is not null,
  true,
  'the host keeps the full prompt for the projector'
);
select pg_temp.as_user('42000000-0000-0000-0000-000000000003');
select set_config(
  'test.student_state',
  public.get_live_session_state(current_setting('test.session_id')::uuid)::text,
  true
);
select is(
  current_setting('test.student_state')::jsonb ->> 'question_display',
  'screen_only',
  'the state payload names the display mode'
);
select ok(
  not (current_setting('test.student_state')::jsonb -> 'question' ? 'prompt'),
  'screen_only students never receive the prompt'
);
select is(
  (
    select bool_and(
      not (option_value ? 'text')
      and option_value ? 'id'
      and option_value ? 'key'
    )
    from jsonb_array_elements(
      current_setting('test.student_state')::jsonb
        -> 'question' -> 'public_options'
    ) option_value
  ),
  true,
  'screen_only options carry ids and keys but no text'
);
select ok(
  pg_temp.last_question_broadcast(
    current_setting('test.session_id')::uuid
  ) -> 'question' ->> 'prompt' is null,
  'the shared question_open broadcast is filtered too'
);

-- Late join during an open question.
select pg_temp.as_user('42000000-0000-0000-0000-000000000005');
select is(
  public.join_live_session(
    current_setting('test.code'), '42300000-0000-0000-0000-000000000003'
  ) ->> 'state',
  'question_open',
  'a first-time joiner is admitted mid-question'
);
select is(
  (
    select participant.eligible_from_position
    from public.live_participants participant
    where participant.session_id = current_setting('test.session_id')::uuid
      and participant.user_id = '42000000-0000-0000-0000-000000000005'
  ),
  2,
  'the late joiner becomes eligible from the next question'
);
select set_config(
  'test.late_state',
  public.get_live_session_state(current_setting('test.session_id')::uuid)::text,
  true
);
select is(
  current_setting('test.late_state')::jsonb ->> 'waiting_for_next',
  'true',
  'the late joiner sees the waiting flag'
);
select ok(
  not (current_setting('test.late_state')::jsonb ? 'question'),
  'the waiting payload carries no question data'
);
select throws_ok(
  format(
    $sql$select public.submit_live_answer('%s', '%s', '42400000-0000-0000-0000-000000000009')$sql$,
    (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
    (
      pg_temp.current_live_question(current_setting('test.session_id')::uuid)
    ).correct_option_id
  ),
  'P0001',
  'LIVE_ANSWER_CLOSED',
  'the late joiner cannot answer the question that was already open'
);

-- Both eligible students answer; the auto-close must not wait for the
-- late joiner.
select pg_temp.as_user('42000000-0000-0000-0000-000000000003');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  (
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ).correct_option_id,
  '42400000-0000-0000-0000-000000000001'
);
select pg_temp.as_user('42000000-0000-0000-0000-000000000004');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  pg_temp.wrong_option_of(
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ),
  '42400000-0000-0000-0000-000000000002'
);

select is(
  (
    select live_session.state::text
    from public.live_sessions live_session
    where live_session.id = current_setting('test.session_id')::uuid
  ),
  'question_feedback',
  'the auto-close fires once every eligible participant answered'
);
select is(
  (
    select count(*)::integer
    from public.live_answers answer
    join public.live_participants participant
      on participant.id = answer.participant_id
    where participant.session_id = current_setting('test.session_id')::uuid
      and participant.user_id = '42000000-0000-0000-0000-000000000005'
  ),
  0,
  'the late joiner never receives a timeout backfill row'
);

-- Feedback-phase filtering and the personal standing.
select pg_temp.as_user('42000000-0000-0000-0000-000000000004');
select set_config(
  'test.feedback_state',
  public.get_live_session_state(current_setting('test.session_id')::uuid)::text,
  true
);
select ok(
  not (
    current_setting('test.feedback_state')::jsonb -> 'question' ? 'prompt'
  ),
  'screen_only feedback still hides the prompt on devices'
);
select is(
  current_setting('test.feedback_state')::jsonb -> 'explanation',
  'null'::jsonb,
  'screen_only feedback keeps the explanation on the projector only'
);

select set_config(
  'test.standing_b',
  public.live_my_standing(current_setting('test.session_id')::uuid)::text,
  true
);
select is(
  current_setting('test.standing_b')::jsonb ->> 'rank',
  '2',
  'the personal standing reports my rank'
);
-- The instant correct answer scored the full 150 (same timing assumption as
-- 040); B scored 0, so the gap is exactly 150. RLS hides classmates' rows
-- from a student session, so the expectation is a literal.
select is(
  (current_setting('test.standing_b')::jsonb ->> 'points_behind')::integer,
  150,
  'the gap to the participant directly ahead matches the score difference'
);
select ok(
  not (current_setting('test.standing_b')::jsonb ? 'display_name')
  and current_setting('test.standing_b')::jsonb ->> 'ahead_rank' = '1',
  'the personal standing carries numbers only, never names'
);

select pg_temp.as_user('42000000-0000-0000-0000-000000000003');
select is(
  public.live_my_standing(current_setting('test.session_id')::uuid)
    -> 'points_behind',
  'null'::jsonb,
  'the leader has nobody ahead'
);

select pg_temp.as_user('42000000-0000-0000-0000-000000000001');
select throws_ok(
  format(
    $sql$select public.live_my_standing('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'the host cannot read the participant-only standing'
);

-- The next question admits the late joiner.
select set_config(
  'test.advanced',
  public.advance_live_session(
    current_setting('test.session_id')::uuid,
    (
      select live_session.state_version
      from public.live_sessions live_session
      where live_session.id = current_setting('test.session_id')::uuid
    )
  )::text,
  true
);

select pg_temp.as_user('42000000-0000-0000-0000-000000000005');
select set_config(
  'test.late_state_q2',
  public.get_live_session_state(current_setting('test.session_id')::uuid)::text,
  true
);
select ok(
  not (current_setting('test.late_state_q2')::jsonb ? 'waiting_for_next')
  and current_setting('test.late_state_q2')::jsonb ? 'question',
  'the late joiner enters play on the next question'
);
select is(
  (
    public.submit_live_answer(
      (
        pg_temp.current_live_question(current_setting('test.session_id')::uuid)
      ).id,
      (
        pg_temp.current_live_question(current_setting('test.session_id')::uuid)
      ).correct_option_id,
      '42400000-0000-0000-0000-000000000004'
    ) ->> 'recorded'
  ),
  'true',
  'the late joiner can answer once eligible'
);

-- Device mode keeps the question on student devices.
select pg_temp.as_user('42000000-0000-0000-0000-000000000001');
select set_config(
  'test.device_activity',
  public.create_live_activity(
    '裝置模式對戰', '26000000-0000-0000-0000-000000000003', 20, 'device'
  )::text,
  true
);
select set_config(
  'test.device_session',
  public.create_live_session(
    (current_setting('test.device_activity')::jsonb ->> 'activity_id')::uuid,
    '42100000-0000-0000-0000-000000000001',
    null
  )::text,
  true
);
select set_config(
  'test.device_session_id',
  current_setting('test.device_session')::jsonb ->> 'session_id',
  true
);
select set_config(
  'test.device_started',
  public.start_live_session(
    current_setting('test.device_session_id')::uuid, 1
  )::text,
  true
);

select pg_temp.as_user('42000000-0000-0000-0000-000000000003');
select public.join_live_session(
  current_setting('test.device_session')::jsonb ->> 'join_code',
  '42300000-0000-0000-0000-000000000004'
);

select pg_temp.as_user('42000000-0000-0000-0000-000000000001');
select public.open_live_question(
  current_setting('test.device_session_id')::uuid,
  (current_setting('test.device_started')::jsonb ->> 'state_version')::integer
);

select pg_temp.as_user('42000000-0000-0000-0000-000000000003');
select set_config(
  'test.device_state',
  public.get_live_session_state(
    current_setting('test.device_session_id')::uuid
  )::text,
  true
);
select is(
  current_setting('test.device_state')::jsonb ->> 'question_display',
  'device',
  'device mode is reported to the client'
);
select ok(
  current_setting('test.device_state')::jsonb
    -> 'question' ->> 'prompt' is not null
  and (
    select bool_and(option_value ? 'text')
    from jsonb_array_elements(
      current_setting('test.device_state')::jsonb
        -> 'question' -> 'public_options'
    ) option_value
  ),
  'device mode keeps prompt and option text on student devices'
);

select * from finish();

rollback;
