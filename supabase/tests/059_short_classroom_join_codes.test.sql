-- New classrooms receive short codes while existing 16-character codes remain usable.

begin;

select plan(6);

select has_function(
  'public',
  'generate_short_classroom_join_code',
  array[]::text[],
  'short classroom join-code generator exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.generate_short_classroom_join_code()',
    'EXECUTE'
  ),
  'clients cannot call the internal generator directly'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '59000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'teacher.short-code@colorplay.test',
    crypt('LocalOnly-Short1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '59000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'student.short-code@colorplay.test',
    crypt('LocalOnly-Short2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '59000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'student.legacy-code@colorplay.test',
    crypt('LocalOnly-Short3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '59000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '59000000-0000-0000-0000-000000000001',
  true
);
select * from public.create_classroom('新短碼班級') \gset short_

select matches(
  :'short_join_code'::text,
  '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$',
  'new classrooms receive an eight-character display code'
);

select set_config(
  'request.jwt.claim.sub',
  '59000000-0000-0000-0000-000000000002',
  true
);
select is(
  (
    select joined.membership_status::text
    from public.join_classroom(
      :'short_join_code',
      '59000000-0000-0000-0000-00000000a001'
    ) as joined
  ),
  'active',
  'students can join with a new eight-character code'
);

reset role;

insert into public.classrooms (
  owner_teacher_id,
  name,
  join_code,
  join_code_hash,
  status
)
values (
  '59000000-0000-0000-0000-000000000001',
  '既有長碼班級',
  'ABCD-1234-EF56-7890',
  extensions.digest('ABCD1234EF567890', 'sha256'),
  'active'
);

select is(
  (
    select classroom.join_code
    from public.classrooms as classroom
    where classroom.name = '既有長碼班級'
  ),
  'ABCD-1234-EF56-7890',
  'the database constraint preserves existing sixteen-character codes'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '59000000-0000-0000-0000-000000000003',
  true
);
select is(
  (
    select joined.membership_status::text
    from public.join_classroom(
      'ABCD-1234-EF56-7890',
      '59000000-0000-0000-0000-00000000a002'
    ) as joined
  ),
  'active',
  'students can still join with an existing sixteen-character code'
);

select * from finish();

rollback;
