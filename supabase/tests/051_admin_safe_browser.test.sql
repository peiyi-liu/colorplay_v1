-- supabase/tests/051_admin_safe_browser.test.sql
begin;
select plan(21);

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((public.get_admin_session_state())->>'state', 'privileged',
  'active bound session reports privileged');
select is(current_setting('statement_timeout'), '5s',
  'session state RPC arms the local statement timeout');

-- 唯讀契約(Codex 修訂 1):user-scoped read 絕不寫 session
select last_activity_at as activity_before from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null \gset
select ok((public.admin_list_resource('users', 'profiles', null, '{}', null))
  ->> 'outcome' = 'ok', 'profiles list succeeds');
select is((select last_activity_at from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001'
    and revoked_at is null), :'activity_before'::timestamptz,
  'authenticated list RPC never touches last_activity_at');

-- 未知 resource → typed denial + counter + audit(修訂 3)
select is((public.admin_list_resource('users', 'auth_users_shadow', null, '{}', null))->>'code',
  'RESOURCE_NOT_ALLOWED', 'unknown resource denied without existence leak');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'RESOURCE_NOT_ALLOWED'), 1, 'denial counter recorded');
select is((select count(*)::int from public.admin_audit_events
  where action = 'admin_list_resource' and result = 'RESOURCE_NOT_ALLOWED'
    and actor_principal_id is not null), 1,
  'browser denial audits the authenticated principal evidence');

-- 遮罩、排除與查詢限制
select ok(((public.admin_list_resource('users', 'profiles', null, '{}', null))
  -> 'rows' -> 0) ? 'display_name', 'open column projected');
select ok(not (((public.admin_list_resource('classrooms', 'classrooms', null, '{}', null))
  -> 'rows' -> 0) ? 'join_code'), 'forbidden column never in projection');
update public.profiles set full_name = '王小明'
  where id = 'cc000000-0000-0000-0000-000000000001';
select is((select count(*)::int
  from jsonb_array_elements(
    (public.admin_list_resource('users', 'profiles', null, '{}', null)) -> 'rows') r
  where r ->> 'full_name' = '王小明'), 0,
  'personal column never returns plaintext in list projection');
select is((public.admin_list_resource('users', 'profiles', null,
  '{"full_name": {"eq": "x"}}', null))->>'code',
  'COLUMN_NOT_ALLOWED', 'personal column cannot filter');
select is((select count(*)::int from public.admin_denial_counters
  where safe_reason_code = 'COLUMN_NOT_ALLOWED'), 1,
  'column denial counter recorded');

-- 毀損 cursor → typed denial,不得裸例外(denial 必須入帳,審計不可繞過)
select is((public.admin_list_resource('users', 'profiles', 'not-valid-base64!!', '{}', null))->>'code',
  'COLUMN_NOT_ALLOWED', 'malformed cursor yields typed denial, not an exception');
select is((public.admin_query_audit(null, null, null, null, null, null, 'not-valid-base64!!'))->>'code',
  'COLUMN_NOT_ALLOWED', 'audit malformed cursor yields typed denial');

-- 防守深度:catalog 誤旗標 forbidden 欄不得成為 filter/sort oracle
insert into public.admin_sensitivity_catalog
  (resource, domain, surface, column_name, class, mask_strategy,
   searchable, filterable, sortable)
values ('profiles', 'users', 'browser', 'synthetic_forbidden_probe',
  'forbidden', null, false, true, true);
select is((public.admin_list_resource('users', 'profiles', null,
  '{"synthetic_forbidden_probe": {"eq": "x"}}', null))->>'code',
  'COLUMN_NOT_ALLOWED', 'forbidden-class column cannot filter even if flagged filterable');
select is((public.admin_list_resource('users', 'profiles', null, '{}',
  '{"column": "synthetic_forbidden_probe"}'))->>'code',
  'COLUMN_NOT_ALLOWED', 'forbidden-class column cannot sort even if flagged sortable');

-- id-less 資源(複合主鍵表)→ typed denial,不得裸 column-does-not-exist 例外
select is((public.admin_list_resource('rewards', 'wallets', null, '{}', null))->>'code',
  'RESOURCE_NOT_ALLOWED', 'id-less resource list denies typed instead of raising');
select is((public.admin_get_resource_detail('rewards', 'wallets',
  '00000000-0000-0000-0000-00000000dead'))->>'code',
  'RESOURCE_NOT_ALLOWED', 'id-less resource detail denies typed instead of raising');

-- detail:未知列回 ok + null row,不洩漏存在性
select is(((public.admin_get_resource_detail('users', 'profiles',
  '00000000-0000-0000-0000-00000000dead')) ->> 'outcome'), 'ok',
  'detail for unknown row returns ok with null row');

-- 非 admin 呼叫 → typed denial + 安全 actor 佐證 audit
select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'cc000000-0000-0000-0000-0000000000e3', true);
select is((public.admin_list_resource('users', 'profiles', null, '{}', null))->>'code',
  'STALE_PRIVILEGED_SESSION', 'non-admin denied');
select is((select count(*)::int from public.admin_audit_events
  where action = 'admin_list_resource' and result = 'STALE_PRIVILEGED_SESSION'
    and actor_type = 'unknown' and actor_principal_id is null), 1,
  'principal-less denial audited with safe unknown actor context');

select * from finish();
rollback;
