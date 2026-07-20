begin;

select plan(8);

-- 種子：兩位學生（trigger 自動建立 profiles）
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', ids.id,
  'authenticated', 'authenticated', ids.email,
  crypt('LocalOnly-Account1!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('10000000-0000-0000-0000-000000000061'::uuid, 'account.one@colorplay.test'),
  ('10000000-0000-0000-0000-000000000062'::uuid, 'account.two@colorplay.test')
) as ids(id, email);

select has_column('public', 'profiles', 'full_name', 'profiles 應有 full_name');
select has_column(
  'public', 'profiles', 'login_account', 'profiles 應有 login_account'
);

-- 服務端可寫入合法帳號與名字
select lives_ok(
  $$update public.profiles
    set login_account = 'cp045001', full_name = '測試 學生'
    where id = '10000000-0000-0000-0000-000000000061'$$,
  '服務端可設定合法 login_account 與 full_name'
);

-- 帳號唯一
select throws_ok(
  $$update public.profiles
    set login_account = 'cp045001'
    where id = '10000000-0000-0000-0000-000000000062'$$,
  '23505',
  null,
  'login_account 重複應被唯一索引拒絕'
);

-- 格式限制：僅小寫英數 3–20 碼
select throws_ok(
  $$update public.profiles
    set login_account = 'ABC123'
    where id = '10000000-0000-0000-0000-000000000062'$$,
  '23514',
  null,
  '大寫帳號應被格式約束拒絕'
);

-- 越權負向：authenticated 不得自改 login_account / full_name
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '10000000-0000-0000-0000-000000000061', true
);

select throws_ok(
  $$update public.profiles
    set login_account = 'hacker01'
    where id = '10000000-0000-0000-0000-000000000061'$$,
  '42501',
  null,
  'authenticated 更新 login_account 應被欄位授權拒絕'
);

select throws_ok(
  $$update public.profiles
    set full_name = '亂改名'
    where id = '10000000-0000-0000-0000-000000000061'$$,
  '42501',
  null,
  'authenticated 更新 full_name 應被欄位授權拒絕'
);

-- 正向：既有的 display_name 自助更新不受影響
select lives_ok(
  $$update public.profiles
    set display_name = '帳號測試暱稱'
    where id = '10000000-0000-0000-0000-000000000061'$$,
  'authenticated 仍可更新自己的 display_name'
);

select * from finish();

rollback;
