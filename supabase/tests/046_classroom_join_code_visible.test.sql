-- 固定可見加入碼（owner 2026-07-27 裁定）：明碼與雜湊一致、owner RPC 可讀、
-- 學生無 column 讀取權、rotate 同步明碼。

begin;

select plan(7);

select has_column(
  'public', 'classrooms', 'join_code', 'plaintext join code column exists'
);

select ok(
  not has_column_privilege(
    'authenticated', 'public.classrooms', 'join_code', 'SELECT'
  ),
  'authenticated cannot select the plaintext column directly'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '46000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'teacher.jc@colorplay.test',
    crypt('LocalOnly-Jc1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '46000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'student.jc@colorplay.test',
    crypt('LocalOnly-Jc2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles set role = 'teacher'
where id = '46000000-0000-0000-0000-000000000001';

select set_config(
  'request.jwt.claim.sub', '46000000-0000-0000-0000-000000000001', true
);
select * from public.create_classroom('可見碼測試班') \gset created_

select is(
  (
    select owned.join_code
    from public.list_owned_classrooms() owned
    where owned.classroom_id = :'created_classroom_id'
  ),
  :'created_join_code'::text,
  'list_owned_classrooms returns the same fixed code create returned'
);

select matches(
  :'created_join_code'::text,
  '^[0-9A-F]{4}(-[0-9A-F]{4}){3}$',
  'visible code keeps the display format'
);

-- 明碼↔雜湊一致：學生用可見碼實際加入成功。
select set_config(
  'request.jwt.claim.sub', '46000000-0000-0000-0000-000000000002', true
);
select is(
  (
    select joined.membership_status::text
    from public.join_classroom(
      :'created_join_code', '46000000-0000-0000-0000-00000000a001'
    ) joined
  ),
  'active',
  'joining with the visible code succeeds (plaintext matches hash)'
);

-- rotate 仍同步明碼（UI 已無入口，函式一致性保底）。
select set_config(
  'request.jwt.claim.sub', '46000000-0000-0000-0000-000000000001', true
);
select * from public.rotate_classroom_join_code(:'created_classroom_id')
  \gset rotated_

select is(
  (
    select owned.join_code
    from public.list_owned_classrooms() owned
    where owned.classroom_id = :'created_classroom_id'
  ),
  :'rotated_join_code'::text,
  'rotation keeps plaintext and hash in sync'
);

select isnt(
  :'rotated_join_code'::text,
  :'created_join_code'::text,
  'rotated code differs from the original'
);

select * from finish();

rollback;
