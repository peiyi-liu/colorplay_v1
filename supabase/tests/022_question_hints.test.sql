begin;

select plan(20);

select has_table('public', 'question_hints', 'question hints exists');
select has_table('public', 'hint_events', 'hint events exists');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.question_hints'::regclass
      and conname = 'question_hints_question_version_level_unique'
  ),
  'one hint exists per question, version, and level'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.hint_events'::regclass
      and conname = 'hint_events_user_question_level_unique'
  ),
  'one event exists per user, session question, and level'
);
select is(
  (
    select count(*)::integer
    from pg_class relation
    where relation.oid in (
      'public.question_hints'::regclass,
      'public.hint_events'::regclass
    )
      and relation.relrowsecurity
  ),
  2,
  'both hint tables enable RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.question_hints', 'SELECT'),
  'hint content is never directly selectable'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.hint_events',
    'INSERT,UPDATE,DELETE'
  ),
  'hint events are only written by the trusted command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.request_question_hint(uuid, integer)',
    'EXECUTE'
  ),
  'students may request hints'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.request_question_hint(uuid, integer)',
    'EXECUTE'
  ),
  'anonymous cannot request hints'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '22000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'hint.student.a@colorplay.test',
    crypt('LocalOnly-Hint1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'hint.student.b@colorplay.test',
    crypt('LocalOnly-Hint2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
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
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
select set_config(
  'test.session',
  public.create_quiz_session(
    '26000000-0000-0000-0000-000000000003',
    '22100000-0000-0000-0000-000000000001'
  )::text,
  true
);

reset role;
select set_config(
  'test.sq1',
  (
    select id::text
    from public.quiz_session_questions
    where session_id = (current_setting('test.session')::jsonb ->> 'session_id')::uuid
      and position = 1
  ),
  true
);
select set_config(
  'test.q1',
  (
    select question_id::text
    from public.quiz_session_questions
    where id = current_setting('test.sq1')::uuid
  ),
  true
);
select set_config(
  'test.q1v',
  (
    select question_version::text
    from public.quiz_session_questions
    where id = current_setting('test.sq1')::uuid
  ),
  true
);

insert into public.question_hints (question_id, question_version, hint_level, content)
values
  (
    current_setting('test.q1')::uuid,
    current_setting('test.q1v')::integer,
    1,
    '提示一：先回想這個小節複習卡的核心概念。'
  ),
  (
    current_setting('test.q1')::uuid,
    current_setting('test.q1v')::integer,
    2,
    '提示二：把每個選項對照定義逐一排除。'
  );

set local role authenticated;
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');

select throws_ok(
  format(
    $sql$select public.request_question_hint('%s', 0)$sql$,
    current_setting('test.sq1')
  ),
  'P0001',
  'HINT_INVALID_REQUEST',
  'hint levels outside 1-3 are rejected'
);
select is(
  (
    public.request_question_hint(current_setting('test.sq1')::uuid, 1)
      ->> 'content'
  ),
  '提示一：先回想這個小節複習卡的核心概念。',
  'level one returns the authored content'
);
select is(
  (
    public.request_question_hint(current_setting('test.sq1')::uuid, 1)
      ->> 'content'
  ),
  '提示一：先回想這個小節複習卡的核心概念。',
  'replaying a granted level returns the same content'
);
select throws_ok(
  format(
    $sql$select public.request_question_hint('%s', 3)$sql$,
    current_setting('test.sq1')
  ),
  'P0001',
  'HINT_SEQUENCE',
  'levels unlock strictly in order'
);
select is(
  (
    public.request_question_hint(current_setting('test.sq1')::uuid, 2)
      - 'hint_level' - 'content' - 'question_version'
  ),
  '{}'::jsonb,
  'the hint payload carries only level, content, and version'
);
select throws_ok(
  format(
    $sql$select public.request_question_hint('%s', 3)$sql$,
    current_setting('test.sq1')
  ),
  'P0001',
  'HINT_UNAVAILABLE',
  'a missing level is reported as unavailable, never fabricated'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.hint_events
    where user_id = '22000000-0000-0000-0000-000000000001'
      and session_question_id = current_setting('test.sq1')::uuid
  ),
  2,
  'exactly one event is recorded per granted level'
);
select is(
  (
    select count(*)::integer
    from public.hint_events
    where session_question_id = current_setting('test.sq1')::uuid
      and question_version = current_setting('test.q1v')::integer
  ),
  2,
  'events freeze the question version they were served against'
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

set local role authenticated;
select pg_temp.as_user('22000000-0000-0000-0000-000000000001');
select lives_ok(
  format(
    $sql$select public.submit_quiz_answer(
      '%s',
      '22200000-0000-0000-0000-000000000001',
      pg_temp.correct_option_for('%s')
    )$sql$,
    current_setting('test.sq1'),
    current_setting('test.sq1')
  ),
  'the student answers the active question'
);
select throws_ok(
  format(
    $sql$select public.request_question_hint('%s', 3)$sql$,
    current_setting('test.sq1')
  ),
  'P0001',
  'HINT_CLOSED',
  'hints close once the question is answered'
);

select pg_temp.as_user('22000000-0000-0000-0000-000000000002');
select throws_ok(
  format(
    $sql$select public.request_question_hint('%s', 1)$sql$,
    current_setting('test.sq1')
  ),
  'P0001',
  'HINT_NOT_FOUND',
  'a foreign session question yields the generic denial'
);

reset role;
select * from finish();
rollback;
