begin;

select plan(13);

select ok(
  exists (
    select 1
    from pg_enum value
    join pg_type type on type.oid = value.enumtypid
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typname = 'quiz_session_status'
      and value.enumlabel = 'abandoned'
  ),
  'quiz session status supports abandoned attempts'
);
select has_column(
  'public',
  'quiz_sessions',
  'abandoned_at',
  'quiz sessions record when an attempt was abandoned'
);
select has_function(
  'public',
  'abandon_quiz_session',
  array['uuid'],
  'abandon quiz session RPC exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.abandon_quiz_session(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot abandon quiz sessions'
);
select ok(
  (
    select procedure.proconfig @> array['search_path=pg_catalog, public']
    from pg_proc procedure
    where procedure.oid = 'public.abandon_quiz_session(uuid)'::regprocedure
  ),
  'abandon quiz session has a fixed search path'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000081',
    'authenticated', 'authenticated', 'abandon.owner@colorplay.test',
    crypt('LocalOnly-Abandon1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000082',
    'authenticated', 'authenticated', 'abandon.other@colorplay.test',
    crypt('LocalOnly-Abandon2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000081',
  true
);
select set_config(
  'test.abandon_session_id',
  public.create_quiz_session(
    '26000000-0000-0000-0000-000000000003',
    '81000000-0000-0000-0000-000000000001'
  ) ->> 'session_id',
  true
);

select is(
  public.abandon_quiz_session(
    current_setting('test.abandon_session_id')::uuid
  ) ->> 'status',
  'abandoned',
  'owner can abandon an in-progress session'
);
select is(
  (
    select status::text
    from public.quiz_sessions
    where id = current_setting('test.abandon_session_id')::uuid
  ),
  'abandoned',
  'abandoned status is persisted'
);
select ok(
  (
    select abandoned_at is not null and completed_at is null
    from public.quiz_sessions
    where id = current_setting('test.abandon_session_id')::uuid
  ),
  'abandonment records its own terminal timestamp without completion'
);
select is(
  public.abandon_quiz_session(
    current_setting('test.abandon_session_id')::uuid
  ) ->> 'status',
  'abandoned',
  'abandon retry is idempotent'
);
select ok(
  (
    select xp_awarded = 0 and tokens_awarded = 0
    from public.quiz_sessions
    where id = current_setting('test.abandon_session_id')::uuid
  ),
  'abandoned sessions award no XP or Token'
);
select isnt(
  public.create_quiz_session(
    '26000000-0000-0000-0000-000000000003',
    '81000000-0000-0000-0000-000000000002'
  ) ->> 'session_id',
  current_setting('test.abandon_session_id'),
  'starting again creates a fresh session'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000082',
  true
);
select throws_ok(
  format(
    $$select public.abandon_quiz_session(%L)$$,
    current_setting('test.abandon_session_id')
  ),
  'P0001',
  'QUIZ_SESSION_NOT_FOUND',
  'another student cannot abandon the owner session'
);

reset role;
select throws_ok(
  format(
    $$update public.quiz_sessions set status = 'completed' where id = %L$$,
    current_setting('test.abandon_session_id')
  ),
  'P0001',
  'QUIZ_SESSION_NOT_ACTIVE',
  'an abandoned session cannot transition to completed'
);

select * from finish();
rollback;
