begin;

select plan(33);

select has_function('public', 'create_live_activity', 'create live activity exists');
select has_function('public', 'create_live_session', 'create live session exists');
select has_function(
  'public',
  'rotate_live_join_code',
  'rotate live join code exists'
);
select has_function('public', 'join_live_session', 'join live session exists');
select has_function(
  'public',
  'get_live_session_state',
  'live session state exists'
);
select has_function('public', 'start_live_session', 'start live session exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '17000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'setup.host.a@colorplay.test',
    crypt('LocalOnly-Setup1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '17000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'setup.host.b@colorplay.test',
    crypt('LocalOnly-Setup2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '17000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'setup.student.a@colorplay.test',
    crypt('LocalOnly-Setup3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '17000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'setup.student.b@colorplay.test',
    crypt('LocalOnly-Setup4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '17000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000002'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '17100000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000001',
  'Setup Classroom A', decode(repeat('c9', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '17100000-0000-0000-0000-000000000001',
    '17000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '17200000-0000-0000-0000-000000000001'
  ),
  (
    '17100000-0000-0000-0000-000000000001',
    '17000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '17200000-0000-0000-0000-000000000003'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-0000-0000-000000000001',
  true
);

select set_config(
  'test.activity',
  public.create_live_activity(
    'Live 色彩對戰', '26000000-0000-0000-0000-000000000003', 20
  )::text,
  true
);
select is(
  current_setting('test.activity')::jsonb ->> 'status',
  'active',
  'a new live activity is active'
);

select set_config(
  'test.session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '17100000-0000-0000-0000-000000000001',
    null
  )::text,
  true
);
select is(
  current_setting('test.session')::jsonb ->> 'state',
  'draft',
  'a new live session starts as a draft'
);
select matches(
  current_setting('test.session')::jsonb ->> 'join_code',
  '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$',
  'the one-time join code uses four hex groups'
);
select is(
  (current_setting('test.session')::jsonb ->> 'state_version')::integer,
  1,
  'a new live session starts at state version one'
);

select set_config(
  'test.session_id',
  current_setting('test.session')::jsonb ->> 'session_id',
  true
);

select set_config(
  'test.rotated',
  public.rotate_live_join_code(current_setting('test.session_id')::uuid)::text,
  true
);
select is(
  (current_setting('test.rotated')::jsonb ->> 'join_code_version')::integer,
  2,
  'rotation increments the join code version'
);

select set_config(
  'test.started',
  public.start_live_session(
    current_setting('test.session_id')::uuid,
    1
  )::text,
  true
);
select is(
  current_setting('test.started')::jsonb ->> 'state',
  'lobby',
  'starting opens the lobby'
);
select is(
  (current_setting('test.started')::jsonb ->> 'state_version')::integer,
  2,
  'starting increments the state version'
);
select is(
  (current_setting('test.started')::jsonb ->> 'question_count')::integer,
  10,
  'starting freezes the template question count'
);
select is(
  (
    select count(*)::integer
    from public.live_session_questions
    where session_id = current_setting('test.session_id')::uuid
  ),
  10,
  'frozen live questions exist for every position'
);
select throws_ok(
  format(
    $$select public.start_live_session(%L, 1)$$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_CONFLICT',
  'a stale state version cannot repeat the transition'
);
select throws_ok(
  format(
    $$select public.start_live_session(%L, 2)$$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_INVALID_TRANSITION',
  'a lobby session cannot start twice'
);

select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-0000-0000-000000000002',
  true
);
select throws_ok(
  $$select public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '17100000-0000-0000-0000-000000000001',
    null
  )$$,
  'P0001',
  'LIVE_ACTIVITY_NOT_FOUND',
  'another teacher cannot host a foreign activity'
);
select throws_ok(
  format(
    $$select public.rotate_live_join_code(%L)$$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'another teacher cannot rotate a foreign session code'
);
select throws_ok(
  format(
    $$select public.get_live_session_state(%L)$$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'another teacher cannot read a foreign session state'
);

select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-0000-0000-000000000003',
  true
);
select throws_ok(
  $$select public.create_live_activity(
    '學生活動', '26000000-0000-0000-0000-000000000003', 20
  )$$,
  'P0001',
  'LIVE_TEACHER_ROLE_REQUIRED',
  'students cannot create live activities'
);
select throws_ok(
  format(
    $$select public.join_live_session(%L, '17300000-0000-0000-0000-000000000001')$$,
    'ZZZZ-ZZZZ-ZZZZ-ZZZZ'
  ),
  'P0001',
  'LIVE_JOIN_INVALID_CODE',
  'an unknown code joins nothing'
);
select set_config(
  'test.joined',
  public.join_live_session(
    current_setting('test.rotated')::jsonb ->> 'join_code',
    '17300000-0000-0000-0000-000000000002'
  )::text,
  true
);
select is(
  current_setting('test.joined')::jsonb ->> 'session_id',
  current_setting('test.session_id'),
  'a valid rotated code joins the lobby'
);
select is(
  public.join_live_session(
    current_setting('test.rotated')::jsonb ->> 'join_code',
    '17300000-0000-0000-0000-000000000003'
  )::text,
  current_setting('test.joined'),
  'replayed joins return the original membership'
);
select is(
  (
    select count(*)::integer
    from public.live_participants
    where session_id = current_setting('test.session_id')::uuid
  ),
  1,
  'ten joins produce one participant row'
);
select set_config(
  'test.participant_state',
  public.get_live_session_state(
    current_setting('test.session_id')::uuid
  )::text,
  true
);
select is(
  current_setting('test.participant_state')::jsonb ->> 'state',
  'lobby',
  'a participant reads the authoritative lobby state'
);
select is(
  (
    current_setting('test.participant_state')::jsonb ->> 'participant_count'
  )::integer,
  1,
  'the lobby projection counts active participants'
);
select ok(
  position(
    'correct_option_id' in current_setting('test.participant_state')
  ) = 0,
  'the participant projection never carries a correct option'
);
select ok(
  position('@colorplay.test' in current_setting('test.participant_state')) = 0,
  'the participant projection never carries an email'
);

select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'test.q1_opened',
  public.open_live_question(
    current_setting('test.session_id')::uuid, 2
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-0000-0000-000000000003',
  true
);
select is(
  public.join_live_session(
    current_setting('test.rotated')::jsonb ->> 'join_code',
    '17300000-0000-0000-0000-000000000009'
  ) ->> 'state',
  'question_open',
  'an active participant re-admits after the lobby closes'
);

select set_config(
  'request.jwt.claim.sub',
  '17000000-0000-0000-0000-000000000004',
  true
);
select throws_ok(
  format(
    $$select public.join_live_session(
      %L, '17300000-0000-0000-0000-000000000004'
    )$$,
    current_setting('test.rotated')::jsonb ->> 'join_code'
  ),
  'P0001',
  'LIVE_JOIN_INVALID_CODE',
  'a non-member cannot join even with a valid code'
);
select throws_ok(
  format(
    $$select public.get_live_session_state(%L)$$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'an outsider cannot read the session state'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.live_session_questions
    where session_id = current_setting('test.session_id')::uuid
      and correct_option_id is not null
  ),
  10,
  'every frozen question stores its hidden answer server-side'
);

select * from finish();
rollback;
