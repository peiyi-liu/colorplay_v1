begin;

select plan(41);

select has_table('public', 'live_activities', 'live activities exists');
select has_table('public', 'live_sessions', 'live sessions exists');
select has_table('public', 'live_participants', 'live participants exists');
select has_table('public', 'live_session_questions', 'live questions exists');
select has_table('public', 'live_answers', 'live answers exists');
select has_type('public', 'live_session_state', 'live session state exists');
select has_type(
  'public',
  'live_participant_status',
  'live participant status exists'
);
select is(
  enum_range(null::public.live_session_state)::text,
  '{draft,lobby,question_open,question_feedback,completed,cancelled}',
  'live session states match the contract'
);
select is(
  enum_range(null::public.live_participant_status)::text,
  '{active,left,removed}',
  'live participant statuses match the contract'
);
select col_is_pk('public', 'live_sessions', 'id', 'live sessions use a UUID key');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.live_participants'::regclass
      and conname = 'live_participants_session_user_unique'
  ),
  'one participant row exists per session and user'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.live_session_questions'::regclass
      and conname = 'live_session_questions_session_position_unique'
  ),
  'one question row exists per session position'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.live_answers'::regclass
      and conname = 'live_answers_question_participant_unique'
  ),
  'one authoritative answer exists per participant and question'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.live_answers'::regclass
      and conname = 'live_answers_participant_idempotency_unique'
  ),
  'idempotency keys are unique per participant'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'live_sessions_state_version_idx'
  ),
  'live sessions index their state version'
);
select is(
  (
    select count(*)::integer
    from pg_class relation
    where relation.oid in (
      'public.live_activities'::regclass,
      'public.live_sessions'::regclass,
      'public.live_participants'::regclass,
      'public.live_session_questions'::regclass,
      'public.live_answers'::regclass
    )
      and relation.relrowsecurity
  ),
  5,
  'every live table enables RLS'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.live_session_questions',
    'correct_option_id',
    'SELECT'
  ),
  'hidden answers are excluded from authenticated column grants'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.live_session_questions',
    'explanation',
    'SELECT'
  ),
  'explanations flow only through trusted feedback payloads'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.live_sessions',
    'join_code_hash',
    'SELECT'
  ),
  'live join hashes are never selectable'
);
select ok(
  not has_table_privilege('authenticated', 'public.live_sessions', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot mutate live sessions directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.live_participants',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot mutate participants directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.live_answers', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot mutate live answers directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.live_activities',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot mutate live activities directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.live_session_questions',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot mutate live questions directly'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid in (
      'public.live_activities'::regclass,
      'public.live_sessions'::regclass,
      'public.live_participants'::regclass,
      'public.live_session_questions'::regclass,
      'public.live_answers'::regclass
    )
      and coalesce(pg_get_expr(polqual, polrelid), '') ~* '^\s*true\s*$'
  ),
  0,
  'no live policy uses an unconditional true predicate'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.assignments'::regclass
      and confrelid = 'public.live_activities'::regclass
  ),
  'assignments now reference live activities'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.assignment_attempts'::regclass
      and confrelid = 'public.live_sessions'::regclass
  ),
  'assignment attempts now reference live sessions'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '16000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'live.host.a@colorplay.test',
    crypt('LocalOnly-Live1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '16000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'live.host.b@colorplay.test',
    crypt('LocalOnly-Live2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '16000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'live.student.a@colorplay.test',
    crypt('LocalOnly-Live3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '16000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'live.student.b@colorplay.test',
    crypt('LocalOnly-Live4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '16000000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000002'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '16100000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000001',
  'Live Classroom A', decode(repeat('a7', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '16100000-0000-0000-0000-000000000001',
    '16000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '16200000-0000-0000-0000-000000000001'
  ),
  (
    '16100000-0000-0000-0000-000000000001',
    '16000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '16200000-0000-0000-0000-000000000003'
  );

insert into public.live_activities (
  id, owner_teacher_id, title, quiz_template_id, question_time_limit_seconds,
  status
)
values (
  '16300000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000001',
  'Live 色彩挑戰', '26000000-0000-0000-0000-000000000003', 20, 'active'
);

insert into public.live_sessions (
  id, live_activity_id, host_teacher_id, classroom_id, state, join_code_hash,
  join_code_version, current_position, state_version, question_count
)
values (
  '16400000-0000-0000-0000-000000000001',
  '16300000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000001',
  '16100000-0000-0000-0000-000000000001',
  'lobby', decode(repeat('b8', 32), 'hex'), 1, 0, 1, 0
);

insert into public.live_participants (
  id, session_id, user_id, status, score
)
values (
  '16500000-0000-0000-0000-000000000001',
  '16400000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000003',
  'active', 0
);

insert into public.live_session_questions (
  id, session_id, position, question_stable_code, question_version, prompt,
  public_options, correct_option_id
)
values (
  '16600000-0000-0000-0000-000000000001',
  '16400000-0000-0000-0000-000000000001',
  1, 'live-q-1', 1, 'Live 測試題目',
  '[{"id":"16700000-0000-0000-0000-000000000001","text":"甲"},{"id":"16700000-0000-0000-0000-000000000002","text":"乙"}]',
  '16700000-0000-0000-0000-000000000001'
);

insert into public.live_answers (
  id, session_question_id, participant_id, selected_option_id, answer_status,
  response_ms, score_delta, idempotency_key
)
values (
  '16800000-0000-0000-0000-000000000001',
  '16600000-0000-0000-0000-000000000001',
  '16500000-0000-0000-0000-000000000001',
  '16700000-0000-0000-0000-000000000001',
  'correct', 1200, 150, '16900000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-0000-0000-000000000001',
  true
);
select is(
  (select count(id)::integer from public.live_activities),
  1,
  'the host reads own live activities'
);
select is(
  (select count(id)::integer from public.live_sessions),
  1,
  'the host reads own live sessions'
);
select is(
  (select count(id)::integer from public.live_participants),
  1,
  'the host reads participants of own sessions'
);
select is(
  (select count(id)::integer from public.live_session_questions),
  1,
  'the host reads the frozen questions of own sessions'
);

select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-0000-0000-000000000003',
  true
);
select is(
  (select count(id)::integer from public.live_sessions),
  1,
  'an active participant reads the joined session'
);
select is(
  (
    select count(id)::integer
    from public.live_participants
    where user_id = '16000000-0000-0000-0000-000000000003'
  ),
  1,
  'a participant reads the own participant row'
);
select is(
  (select count(id)::integer from public.live_answers),
  1,
  'a participant reads only own answers'
);
select is(
  (select count(id)::integer from public.live_session_questions),
  0,
  'a participant cannot pre-read unopened questions'
);
select is(
  (select count(id)::integer from public.live_activities),
  0,
  'students cannot browse teacher live activities'
);

select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-0000-0000-000000000004',
  true
);
select is(
  (select count(id)::integer from public.live_sessions),
  0,
  'a non-participant reads no live session'
);
select is(
  (select count(id)::integer from public.live_session_questions),
  0,
  'a non-participant reads no live questions'
);
select is(
  (select count(id)::integer from public.live_answers),
  0,
  'a non-participant reads no live answers'
);

select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-0000-0000-000000000002',
  true
);
select is(
  (select count(id)::integer from public.live_sessions),
  0,
  'another teacher reads no foreign live session'
);

reset role;
set local role anon;
select throws_ok(
  $$select id from public.live_sessions$$,
  '42501',
  null,
  'anonymous cannot read live sessions'
);

reset role;
select * from finish();
rollback;
