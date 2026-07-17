begin;

select plan(18);

select ok(
  exists (
    select 1
    from pg_policy
    where polrelid = 'realtime.messages'::regclass
      and polname = 'live_session_member_receive'
  ),
  'members receive on the private live topic'
);
select ok(
  exists (
    select 1
    from pg_policy
    where polrelid = 'realtime.messages'::regclass
      and polname = 'live_session_host_send'
  ),
  'hosts send on the private live topic'
);
select ok(
  exists (
    select 1
    from pg_policy
    where polrelid = 'realtime.messages'::regclass
      and polname = 'live_session_participant_presence'
  ),
  'participants publish presence only'
);
select ok(
  not exists (
    select 1
    from pg_policy
    where polrelid = 'realtime.messages'::regclass
      and coalesce(pg_get_expr(polqual, polrelid), '') ~* '^\s*true\s*$'
  ),
  'no realtime policy uses an unconditional true predicate'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '19000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'rt.host@colorplay.test',
    crypt('LocalOnly-Rt1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '19000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'rt.student@colorplay.test',
    crypt('LocalOnly-Rt3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '19000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'rt.outsider@colorplay.test',
    crypt('LocalOnly-Rt4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '19000000-0000-0000-0000-000000000001';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '19100000-0000-0000-0000-000000000001',
  '19000000-0000-0000-0000-000000000001',
  'Realtime Classroom', decode(repeat('e2', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '19100000-0000-0000-0000-000000000001',
    '19000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '19200000-0000-0000-0000-000000000001'
  ),
  (
    '19100000-0000-0000-0000-000000000001',
    '19000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '19200000-0000-0000-0000-000000000003'
  );

create function pg_temp.as_user(target_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select set_config('request.jwt.claim.sub', target_user::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('19000000-0000-0000-0000-000000000001');
select set_config(
  'test.activity',
  public.create_live_activity(
    'Realtime 對戰', '26000000-0000-0000-0000-000000000003', 20
  )::text,
  true
);
select set_config(
  'test.session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '19100000-0000-0000-0000-000000000001',
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
  'test.topic',
  'live-session:' || current_setting('test.session_id'),
  true
);
select set_config(
  'test.started',
  public.start_live_session(current_setting('test.session_id')::uuid, 1)::text,
  true
);

select pg_temp.as_user('19000000-0000-0000-0000-000000000003');
select set_config(
  'test.joined',
  public.join_live_session(
    current_setting('test.session')::jsonb ->> 'join_code',
    '19300000-0000-0000-0000-000000000001'
  )::text,
  true
);

select pg_temp.as_user('19000000-0000-0000-0000-000000000001');
select set_config(
  'test.opened',
  public.open_live_question(
    current_setting('test.session_id')::uuid,
    (current_setting('test.started')::jsonb ->> 'state_version')::integer
  )::text,
  true
);

reset role;
select is(
  (
    select count(*)::integer
    from realtime.messages
    where topic = current_setting('test.topic')
  ),
  3,
  'start, join, and open each broadcast exactly one committed message'
);
select is(
  (
    select count(*)::integer
    from realtime.messages
    where topic = current_setting('test.topic')
      and payload ->> 'state' = 'lobby'
      and (payload ->> 'participant_count')::integer = 1
  ),
  1,
  'joining broadcasts the active participant count at the lobby version'
);
select is(
  (
    select count(*)::integer
    from realtime.messages
    where topic = current_setting('test.topic')
      and payload::text like '%correct_option_id%'
  ),
  0,
  'no broadcast before close carries a correct option'
);
select ok(
  (
    select bool_and(private)
    from realtime.messages
    where topic = current_setting('test.topic')
  ),
  'live broadcasts stay on the private channel'
);

set local role authenticated;
select pg_temp.as_user('19000000-0000-0000-0000-000000000001');
select set_config(
  'test.closed',
  public.close_live_question(
    current_setting('test.session_id')::uuid,
    (current_setting('test.opened')::jsonb ->> 'state_version')::integer
  )::text,
  true
);
reset role;
select is(
  (
    select count(*)::integer
    from realtime.messages
    where topic = current_setting('test.topic')
  ),
  4,
  'closing broadcasts the feedback transition'
);
select is(
  (
    select count(*)::integer
    from realtime.messages
    where topic = current_setting('test.topic')
      and payload ->> 'state' = 'question_feedback'
      and payload::text like '%correct_option_id%'
  ),
  1,
  'the feedback broadcast reveals the answer after close'
);
select is(
  (
    select count(*)::integer
    from realtime.messages
    where topic = current_setting('test.topic')
      and payload::text like '%@colorplay.test%'
  ),
  0,
  'no broadcast carries an email'
);

set local role authenticated;
select set_config('realtime.topic', current_setting('test.topic'), true);

select pg_temp.as_user('19000000-0000-0000-0000-000000000001');
select ok(
  (select count(*) from realtime.messages
   where topic = current_setting('test.topic')) >= 3,
  'the host receives on the private topic'
);
select lives_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values (
      current_setting('test.topic'), 'broadcast',
      '{"state":"probe"}', 'live_state', true
    )$$,
  'the host may send broadcast messages'
);

select pg_temp.as_user('19000000-0000-0000-0000-000000000003');
select ok(
  (select count(*) from realtime.messages
   where topic = current_setting('test.topic')) >= 3,
  'an active participant receives on the private topic'
);
select lives_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values (
      current_setting('test.topic'), 'presence',
      '{"state":"here"}', 'presence', true
    )$$,
  'an active participant may publish presence'
);
select throws_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values (
      current_setting('test.topic'), 'broadcast',
      '{"state":"forged"}', 'live_state', true
    )$$,
  '42501',
  null,
  'a participant cannot broadcast host transitions'
);

select pg_temp.as_user('19000000-0000-0000-0000-000000000004');
select is(
  (
    select count(*)::integer
    from realtime.messages
    where topic = current_setting('test.topic')
  ),
  0,
  'an outsider receives nothing on the private topic'
);
select throws_ok(
  $$insert into realtime.messages (topic, extension, payload, event, private)
    values (
      current_setting('test.topic'), 'presence',
      '{"state":"spy"}', 'presence', true
    )$$,
  '42501',
  null,
  'an outsider cannot publish anything'
);

reset role;
select * from finish();
rollback;
