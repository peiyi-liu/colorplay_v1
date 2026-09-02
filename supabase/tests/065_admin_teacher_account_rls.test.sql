-- Admin B Task 1: teacher contact-email and read-interface authorization matrix.
begin;
select plan(20);

select ok(not has_column_privilege('anon', 'public.profiles',
  'contact_email', 'SELECT'), 'anonymous cannot select contact email');
select ok(not has_column_privilege('authenticated', 'public.profiles',
  'contact_email', 'SELECT'), 'authenticated users cannot select contact email');
select ok(not has_column_privilege('authenticated', 'public.profiles',
  'contact_email', 'UPDATE'), 'authenticated users cannot update contact email');
select ok(not has_column_privilege('authenticated', 'public.profiles',
  'role', 'UPDATE'), 'authenticated users cannot update role');
select ok(not has_column_privilege('authenticated', 'public.profiles',
  'login_account', 'UPDATE'), 'authenticated users cannot update login account');
select ok(not has_column_privilege('service_role', 'public.profiles',
  'contact_email', 'UPDATE'),
  'service role cannot bypass the named operation with a direct contact update');
select ok(not has_function_privilege('anon',
  'public.admin_list_teachers(text,text,text)', 'EXECUTE'),
  'anonymous cannot execute the teacher list RPC');
select ok(has_function_privilege('authenticated',
  'public.admin_list_teachers(text,text,text)', 'EXECUTE'),
  'authenticated users reach the typed denial boundary');

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at,
  updated_at, confirmation_token, email_change, email_change_token_new,
  recovery_token)
values ('00000000-0000-0000-0000-000000000000',
  '65000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'teacher.rls@internal.invalid', crypt('LocalOnly-Teacher1!', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '');
update public.profiles
   set role = 'teacher', login_account = 'teacher65', full_name = '權限教師',
       display_name = '權限教師', contact_email = 'private@example.test'
 where id = '65000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((public.admin_list_teachers(null, null, null)) ->> 'code',
  'STALE_PRIVILEGED_SESSION', 'student list attempt is denied');
select is((public.admin_get_teacher(
  '65000000-0000-0000-0000-000000000001')) ->> 'code',
  'STALE_PRIVILEGED_SESSION', 'student detail attempt is denied');

set local role authenticated;
select throws_ok($$
  select contact_email from public.profiles
   where id = 'cc000000-0000-0000-0000-000000000001'
$$, '42501', null, 'user cannot select even their own contact email directly');
select throws_ok($$
  update public.profiles set contact_email = 'x@example.test'
   where id = 'cc000000-0000-0000-0000-000000000001'
$$, '42501', null, 'user cannot update contact email directly');
select throws_ok($$
  update public.profiles set role = 'admin', login_account = 'teacher00'
   where id = 'cc000000-0000-0000-0000-000000000001'
$$, '42501', null, 'user cannot mutate protected role or login account');
select lives_ok($$
  select id, display_name, role, timezone, reduced_motion, login_account
    from public.profiles
   where id = 'cc000000-0000-0000-0000-000000000001'
$$, 'safe own-profile columns remain readable');
select lives_ok($$
  update public.profiles set display_name = '安全暱稱'
   where id = 'cc000000-0000-0000-0000-000000000001'
$$, 'existing safe own-profile update remains available');
reset role;

select set_config('request.jwt.claim.sub',
  '65000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  '65000000-0000-0000-0000-0000000000e5', true);
select is((public.admin_list_teachers(null, null, null)) ->> 'code',
  'STALE_PRIVILEGED_SESSION', 'teacher list attempt is denied');

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select is((public.admin_list_teachers(null, null, null)) ->> 'outcome', 'ok',
  'active privileged Admin can list teachers');
select is((public.admin_get_teacher(
  '65000000-0000-0000-0000-000000000001')) ->> 'outcome', 'ok',
  'active privileged Admin can read teacher detail');

select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000ff', true);
select is((public.admin_list_teachers(null, null, null)) ->> 'code',
  'STALE_PRIVILEGED_SESSION', 'mismatched Auth session is denied');
select is((select count(*)::int from public.admin_audit_events
  where action in ('admin_list_teachers', 'admin_get_teacher')
    and result = 'STALE_PRIVILEGED_SESSION'), 4,
  'all typed read denials are audited');

select * from finish();
rollback;
