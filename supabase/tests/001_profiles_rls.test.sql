begin;

select plan(8);

select has_table('public', 'profiles', 'profiles exists');
select has_column('public', 'profiles', 'role', 'profiles.role exists');

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'rls.one@colorplay.test',
    crypt('LocalOnly-Rls1!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'rls.two@colorplay.test',
    crypt('LocalOnly-Rls2!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

select is(
  (select count(*)::integer from public.profiles),
  1,
  'student reads only own profile'
);
select lives_ok(
  $$update public.profiles set display_name = '學生一' where id = '10000000-0000-0000-0000-000000000001'$$,
  'student updates own display name'
);
select throws_ok(
  $$update public.profiles set role = 'teacher' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'student cannot update role'
);
select is(
  (
    select count(*)::integer
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000002'
  ),
  0,
  'student cannot read another profile'
);
select results_eq(
  $$
    with changed as (
      update public.profiles
      set display_name = '越權'
      where id = '10000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::integer from changed
  $$,
  array[0],
  'student cannot update another profile'
);
select throws_ok(
  $$delete from public.profiles where id = '10000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'student has no delete privilege'
);

select * from finish();

rollback;
