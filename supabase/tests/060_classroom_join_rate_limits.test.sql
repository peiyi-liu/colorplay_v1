begin;

select plan(13);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.join_classroom(text, uuid)',
    'EXECUTE'
  ),
  'authenticated callers cannot bypass the Edge rate-limit boundary'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.svc_join_classroom(uuid, text, uuid, text)',
    'EXECUTE'
  ),
  'authenticated callers cannot invoke the service join command'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.svc_join_classroom(uuid, text, uuid, text)',
    'EXECUTE'
  ),
  'service role can invoke the protected join command'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.classroom_join_rate_limits',
    'SELECT'
  ),
  'authenticated callers cannot read rate-limit subjects or counters'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '96000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'rate.teacher@colorplay.test',
    crypt('LocalOnly-Rate1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '96000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'rate.student.a@colorplay.test',
    crypt('LocalOnly-Rate2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '96000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'rate.student.b@colorplay.test',
    crypt('LocalOnly-Rate3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '96000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'rate.student.c@colorplay.test',
    crypt('LocalOnly-Rate4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '96000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-4000-8000-000000000001',
  true
);
select * from public.create_classroom('Rate Limit Fixture') \gset rate_class_
reset role;

select is(
  (
    with attempts as materialized (
      select public.svc_resolve_classroom_join_code(
        '96000000-0000-4000-8000-000000000002',
        'WRNG-CODE',
        repeat('1', 64)
      ) as result
      from generate_series(1, 9)
    )
    select count(*)::integer
    from attempts
    where result->>'outcome' = 'invalid'
  ),
  9,
  'first nine invalid attempts return the generic invalid result'
);
select is(
  public.svc_resolve_classroom_join_code(
    '96000000-0000-4000-8000-000000000002',
    'WRNG-CODE',
    repeat('1', 64)
  )->>'outcome',
  'rate_limited',
  'the tenth invalid attempt locks the identity for the active window'
);
select is(
  public.svc_resolve_classroom_join_code(
    '96000000-0000-4000-8000-000000000002',
    :'rate_class_join_code',
    repeat('1', 64)
  )->>'outcome',
  'rate_limited',
  'a valid code cannot bypass an already locked identity'
);

insert into public.classroom_join_rate_limits (
  scope,
  subject_hash,
  failure_count
)
values ('ip', repeat('2', 64), 99);
select is(
  public.svc_resolve_classroom_join_code(
    '96000000-0000-4000-8000-000000000003',
    'WRNG-CODE',
    repeat('2', 64)
  )->>'outcome',
  'rate_limited',
  'the hundredth invalid attempt locks a shared IP'
);
select cmp_ok(
  (
    public.svc_resolve_classroom_join_code(
      '96000000-0000-4000-8000-000000000003',
      'WRNG-CODE',
      repeat('2', 64)
    )->>'retry_after_seconds'
  )::integer,
  '>=',
  1,
  'rate-limited responses include a positive retry delay'
);

select is(
  public.svc_join_classroom(
    '96000000-0000-4000-8000-000000000004',
    :'rate_class_join_code',
    '96000000-0000-4000-8000-000000000099',
    repeat('3', 64)
  )->>'outcome',
  'ok',
  'a fresh student and IP can join with a valid code'
);
select is(
  (
    select count(*)::integer
    from public.classroom_members
    where classroom_id = :'rate_class_classroom_id'
      and user_id = '96000000-0000-4000-8000-000000000004'
      and member_role = 'student'
      and status = 'active'
  ),
  1,
  'protected join writes one active membership'
);
select ok(
  not exists (
    select 1
    from public.classroom_join_rate_limits
    where subject_hash !~ '^[0-9a-f]{64}$'
  ),
  'rate-limit storage contains only 64-character fingerprints'
);
select ok(
  not exists (
    select 1
    from public.classroom_join_rate_limits
    where subject_hash in ('203.0.113.9', '198.51.100.7')
  ),
  'rate-limit storage contains no raw IP address'
);

select * from finish();
rollback;
