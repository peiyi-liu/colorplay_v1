-- Admin B Task 1: teacher account schema and safe read projections.
begin;
select plan(42);

select has_column('public', 'profiles', 'contact_email',
  'profiles stores the optional Admin-managed contact email');
select col_is_null('public', 'profiles', 'contact_email',
  'contact email remains nullable');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at,
  updated_at, confirmation_token, email_change, email_change_token_new,
  recovery_token)
values ('00000000-0000-0000-0000-000000000000',
  '64000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'teacher.schema@internal.invalid', crypt('LocalOnly-Teacher1!', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '');

select lives_ok($$
  update public.profiles
     set full_name = '  ' || repeat('名', 40) || '  ',
         login_account = 'teacher99',
         role = 'teacher',
         contact_email = 'teacher@example.test'
   where id = '64000000-0000-0000-0000-000000000001'
$$, 'teacher full and display names support the approved 40-character limit');
select is((
  select full_name || '|' || display_name from public.profiles
   where id = '64000000-0000-0000-0000-000000000001'
), repeat('名', 40) || '|' || repeat('名', 40),
  'promoting a teacher synchronizes full and display names');
select throws_ok($$
  update public.profiles set display_name = '單邊改名'
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null,
  'an existing teacher cannot persist mismatched full and display names');
select throws_ok($$
  update public.profiles set full_name = null
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'a teacher must retain a non-null synchronized full name');
select throws_ok($$
  update public.profiles
     set display_name = repeat('名', 41), full_name = repeat('名', 41)
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'teacher names reject more than 40 trimmed characters');
select throws_ok($$
  update public.profiles set display_name = '   ', full_name = '   '
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'teacher names reject an empty trimmed value');
select throws_ok($$
  update public.profiles set contact_email = 'Teacher@Example.Test'
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'stored contact email must already be normalized');
select throws_ok($$
  update public.profiles set contact_email = 'not-an-email'
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'malformed contact email is rejected');
select is((select class from public.admin_sensitivity_catalog
  where resource = 'profiles' and column_name = 'contact_email'),
  'personal', 'contact email is classified as personal');
select is((select mask_strategy from public.admin_sensitivity_catalog
  where resource = 'profiles' and column_name = 'contact_email'),
  'email_mask', 'contact email uses the approved email mask');
select ok(not exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name = 'internal_email'
), 'Auth internal email is not persisted in the public profile');

select ok(to_regclass('admin_private.teacher_login_account_seq') is not null,
  'teacher login allocation sequence exists');
select has_function('admin_private', 'reserve_teacher_account',
  array['uuid', 'text', 'text', 'uuid', 'text'],
  'Task 1 exposes an internal atomic teacher reservation helper');
select has_index('admin_private', 'teacher_account_operations',
  'teacher_account_reserved_login_idx',
  'reserved teacher login accounts have a unique index');
select ok(not has_function_privilege('anon',
  'admin_private.reserve_teacher_account(uuid,text,text,uuid,text)',
  'EXECUTE'), 'anonymous cannot call the internal reservation helper');
select ok(not has_function_privilege('authenticated',
  'admin_private.reserve_teacher_account(uuid,text,text,uuid,text)',
  'EXECUTE'), 'authenticated users cannot call the internal reservation helper');
select ok(not has_function_privilege('service_role',
  'admin_private.reserve_teacher_account(uuid,text,text,uuid,text)',
  'EXECUTE'),
  'service role must use the Task 2 named-command boundary, not the helper');

delete from auth.users
 where id = '64000000-0000-0000-0000-000000000001';

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select lives_ok($$
  insert into admin_private.teacher_account_operations (
    operation_type, state, actor_principal_id, login_account,
    requested_full_name
  ) values (
    'create_teacher_account', 'identity_reserved',
    (select audit_principal_id from public.admin_security_identities
      where admin_user_id = 'aa000000-0000-0000-0000-000000000001'),
    'teacher900001', '唯一索引測試教師'
  )
$$, 'a teacher login account can be reserved once');
select throws_ok($$
  insert into admin_private.teacher_account_operations (
    operation_type, state, actor_principal_id, login_account,
    requested_full_name
  ) values (
    'create_teacher_account', 'identity_reserved',
    (select audit_principal_id from public.admin_security_identities
      where admin_user_id = 'bb000000-0000-0000-0000-000000000001'),
    'teacher900001', '重複唯一索引測試教師'
  )
$$, '23505', null,
  'the reservation unique index rejects an exact duplicate login account');

do $$
declare
  i integer;
  v_id uuid;
begin
  for i in 1..51 loop
    v_id := ('64' || lpad(i::text, 2, '0') || '0000-0000-0000-0000-'
      || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id,
      'authenticated', 'authenticated',
      'teacher' || lpad(i::text, 2, '0') || '@internal.invalid',
      crypt('LocalOnly-Teacher1!', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', '');
    update public.profiles
       set role = 'teacher', login_account = 'teacher' || lpad(i::text, 2, '0'),
           full_name = '教師 ' || lpad(i::text, 2, '0'),
           display_name = '教師 ' || lpad(i::text, 2, '0'),
           contact_email = case when i = 1 then 'one@example.test' else null end,
           created_at = timestamptz '2026-01-01 00:00:00+00'
             + make_interval(secs => i)
     where id = v_id;
  end loop;
end;
$$;

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('pgtap.teacher_page_1',
  public.admin_list_teachers(null, null, null)::text, true);
select is(current_setting('pgtap.teacher_page_1')::jsonb ->> 'outcome', 'ok',
  'active privileged Admin can list teachers');
select is(jsonb_array_length(
  current_setting('pgtap.teacher_page_1')::jsonb -> 'rows'), 50,
  'teacher list is capped at 50 rows');
select isnt(current_setting('pgtap.teacher_page_1')::jsonb ->> 'next_cursor',
  null, 'a server cursor is issued only when another page exists');
select ok((current_setting('pgtap.teacher_page_1')::jsonb -> 'rows' -> 0)
  ?& array['teacher_id', 'login_account', 'display_name',
    'contact_email_masked', 'contact_email_present', 'created_at',
    'operation_state'], 'teacher summary exposes the stable safe fields');
select ok(not ((current_setting('pgtap.teacher_page_1')::jsonb -> 'rows' -> 0)
  ?| array['contact_email', 'internal_email', 'password', 'auth_user_id']),
  'teacher summary excludes plaintext and Auth-only identity fields');
select is((select row ->> 'contact_email_masked'
  from jsonb_array_elements(
    current_setting('pgtap.teacher_page_1')::jsonb -> 'rows') row
  where row ->> 'login_account' = 'teacher01'), 'o****@example.test',
  'contact email is masked in list results');

select set_config('pgtap.teacher_page_2', public.admin_list_teachers(
  current_setting('pgtap.teacher_page_1')::jsonb ->> 'next_cursor',
  null, null)::text, true);
select is(current_setting('pgtap.teacher_page_2')::jsonb ->> 'outcome', 'ok',
  'server-issued cursor fetches the next page');
select is(jsonb_array_length(
  current_setting('pgtap.teacher_page_2')::jsonb -> 'rows'), 1,
  'the second page contains the remaining row');
select is(current_setting('pgtap.teacher_page_2')::jsonb ->> 'next_cursor',
  null, 'final page has no cursor');
select is((select count(*)::int from (
  select row ->> 'teacher_id' as id from jsonb_array_elements(
    current_setting('pgtap.teacher_page_1')::jsonb -> 'rows') row
  union
  select row ->> 'teacher_id' from jsonb_array_elements(
    current_setting('pgtap.teacher_page_2')::jsonb -> 'rows') row
) pages), 51, 'pagination neither duplicates nor drops a teacher');

select is(jsonb_array_length((public.admin_list_teachers(
  null, 'teacher17', null) -> 'rows')), 1,
  'search matches the login account');
select is(jsonb_array_length((public.admin_list_teachers(
  null, '教師 18', null) -> 'rows')), 1,
  'search matches the display name');
select is(jsonb_array_length((public.admin_list_teachers(
  null, 'one@example.test', null) -> 'rows')), 0,
  'search does not inspect contact email');
select is(jsonb_array_length((public.admin_list_teachers(
  null, null, 'ready') -> 'rows')), 50,
  'state filter accepts the stable ready state');
select is((public.admin_list_teachers(null, null, 'unknown')) ->> 'code',
  'TEACHER_ACCOUNT_INVALID', 'unknown teacher state fails closed');
select is((public.admin_list_teachers('not-a-cursor', null, null)) ->> 'code',
  'TEACHER_ACCOUNT_INVALID', 'malformed teacher cursor fails closed');

select set_config('pgtap.teacher_detail', public.admin_get_teacher(
  '64010000-0000-0000-0000-000000000001')::text, true);
select is(current_setting('pgtap.teacher_detail')::jsonb ->> 'outcome', 'ok',
  'active privileged Admin can read teacher detail');
select is(current_setting('pgtap.teacher_detail')::jsonb
  #>> '{teacher,contact_email_masked}', 'o****@example.test',
  'teacher detail keeps contact email masked');
select ok(not ((current_setting('pgtap.teacher_detail')::jsonb -> 'teacher')
  ?| array['contact_email', 'internal_email', 'password', 'auth_user_id']),
  'teacher detail excludes forbidden identity and secret fields');
select is((current_setting('pgtap.teacher_detail')::jsonb
  #> '{teacher,available_commands}')::jsonb,
  '["update_teacher_account", "reset_teacher_password"]'::jsonb,
  'teacher detail returns server-authorized command names');
select is((public.admin_get_teacher(
  '64000000-0000-0000-0000-00000000ffff')) ->> 'code',
  'TEACHER_ACCOUNT_INVALID', 'missing teacher uses a non-enumerating denial');

select * from finish();
rollback;
