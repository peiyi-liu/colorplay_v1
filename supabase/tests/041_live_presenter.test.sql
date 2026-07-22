-- 10B live presenter backend: the join broadcast carries the joining
-- nickname, the lobby state carries the privacy-safe roster, and the
-- host-only standings power the between-question Top 5.

begin;

select plan(10);

select has_function(
  'public', 'live_session_standings', 'standings command exists'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'presenter.host@colorplay.test',
    crypt('LocalOnly-Pres1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'presenter.student.a@colorplay.test',
    crypt('LocalOnly-Pres3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'presenter.student.b@colorplay.test',
    crypt('LocalOnly-Pres4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-0000-0000-000000000005',
    'authenticated', 'authenticated', 'presenter.outsider@colorplay.test',
    crypt('LocalOnlyPres5!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '41000000-0000-0000-0000-000000000001';
update public.profiles
set display_name = 'A同學'
where id = '41000000-0000-0000-0000-000000000003';
update public.profiles
set display_name = 'B同學'
where id = '41000000-0000-0000-0000-000000000004';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '41100000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'Presenter Classroom', decode(repeat('f1', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '41100000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '41200000-0000-0000-0000-000000000001'
  ),
  (
    '41100000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '41200000-0000-0000-0000-000000000003'
  ),
  (
    '41100000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000004',
    'student', 'active', now(), now(), '41200000-0000-0000-0000-000000000004'
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

create function pg_temp.join_wall_count(
  target_session uuid,
  target_name text
)
returns integer
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select count(*)::integer
  from realtime.messages
  where topic = 'live-session:' || target_session::text
    and payload ->> 'joined_display_name' = target_name;
$$;

set local role authenticated;
select pg_temp.as_user('41000000-0000-0000-0000-000000000001');

select set_config(
  'test.activity',
  public.create_live_activity(
    '投影對戰', '26000000-0000-0000-0000-000000000003', 20
  )::text,
  true
);
select set_config(
  'test.session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '41100000-0000-0000-0000-000000000001',
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

-- The standings only exist between questions.
select throws_ok(
  format(
    $sql$select public.live_session_standings('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_STATE_INVALID_TRANSITION',
  'standings are hidden outside question_feedback'
);

select pg_temp.as_user('41000000-0000-0000-0000-000000000003');
select public.join_live_session(
  current_setting('test.code'), '41300000-0000-0000-0000-000000000001'
);
select is(
  pg_temp.join_wall_count(
    current_setting('test.session_id')::uuid, 'A同學'
  ),
  1,
  'joining broadcasts the privacy-safe nickname for the wall'
);
select is(
  public.get_live_session_state(current_setting('test.session_id')::uuid)
    -> 'participants' -> 0 ->> 'display_name',
  'A同學',
  'the lobby state carries the roster for reconnects'
);

select pg_temp.as_user('41000000-0000-0000-0000-000000000004');
select public.join_live_session(
  current_setting('test.code'), '41300000-0000-0000-0000-000000000002'
);
select is(
  (
    select string_agg(entry ->> 'display_name', ',')
    from jsonb_array_elements(
      public.get_live_session_state(current_setting('test.session_id')::uuid)
        -> 'participants'
    ) entry
  ),
  'A同學,B同學',
  'the roster lists everyone in join order for any session member'
);

-- Question 1: A instant correct, B wrong; the auto-close lands feedback.
select pg_temp.as_user('41000000-0000-0000-0000-000000000001');
select public.open_live_question(
  current_setting('test.session_id')::uuid,
  (current_setting('test.started')::jsonb ->> 'state_version')::integer
);
select ok(
  public.get_live_session_state(current_setting('test.session_id')::uuid)
    -> 'participants' is null,
  'the roster stays out of the question payloads'
);

select pg_temp.as_user('41000000-0000-0000-0000-000000000003');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  (
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ).correct_option_id,
  '41400000-0000-0000-0000-000000000001'
);
select pg_temp.as_user('41000000-0000-0000-0000-000000000004');
select public.submit_live_answer(
  (pg_temp.current_live_question(current_setting('test.session_id')::uuid)).id,
  pg_temp.wrong_option_of(
    pg_temp.current_live_question(current_setting('test.session_id')::uuid)
  ),
  '41400000-0000-0000-0000-000000000002'
);

select pg_temp.as_user('41000000-0000-0000-0000-000000000001');
select set_config(
  'test.standings',
  public.live_session_standings(
    current_setting('test.session_id')::uuid
  )::text,
  true
);
select is(
  (current_setting('test.standings')::jsonb ->> 'participant_count')::integer,
  2,
  'standings carry the active participant count'
);
select is(
  (
    select string_agg(
      (entry ->> 'rank') || ':' || (entry ->> 'display_name')
        || ':' || (entry ->> 'score'),
      ' / '
    )
    from jsonb_array_elements(
      current_setting('test.standings')::jsonb -> 'standings'
    ) entry
  ),
  '1:A同學:150 / 2:B同學:0',
  'standings rank the fast correct answer first'
);

select pg_temp.as_user('41000000-0000-0000-0000-000000000003');
select throws_ok(
  format(
    $sql$select public.live_session_standings('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'students cannot read the presenter standings'
);
select pg_temp.as_user('41000000-0000-0000-0000-000000000005');
select throws_ok(
  format(
    $sql$select public.live_session_standings('%s')$sql$,
    current_setting('test.session_id')
  ),
  'P0001',
  'LIVE_SESSION_NOT_FOUND',
  'outsiders cannot read the presenter standings'
);

select * from finish();
rollback;
