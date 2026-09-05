begin;
select plan(15);
\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();
select has_function('public', 'admin_platform_health', array[]::text[], 'platform summary exists');
select ok(not has_function_privilege('anon', 'public.admin_platform_health()', 'execute'), 'anonymous cannot execute platform summary');
select ok(not has_schema_privilege('authenticated', 'admin_monitoring', 'usage'), 'API users cannot read or forge collector observations');
select ok((select relrowsecurity from pg_class where oid = 'admin_monitoring.observations'::regclass), 'observations enable RLS with no client policies');
select ok(not has_function_privilege('authenticated', 'public.svc_admin_monitor_state()', 'execute'), 'API users cannot read collection state');
select ok(not has_function_privilege('authenticated', 'public.svc_admin_record_monitor_observations(jsonb)', 'execute'), 'API users cannot forge metrics');
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.admin_platform_health()->>'outcome', 'denied', 'ordinary authenticated user denied');
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id', 'aa000000-0000-0000-0000-0000000000e1', true);
select is(public.admin_platform_health()->>'outcome', 'ok', 'privileged admin accepted');
select ok(jsonb_array_length(public.admin_platform_health()->'metrics') >= 10, 'all database checks returned');
select ok(not (public.admin_platform_health()::text ~ 'user_id|correct_answer|correct_option|password|token_hash'), 'summary never exposes personal rows or answer fields');
insert into admin_monitoring.observations(signal, environment, status, checked_at, observed_at, sample_count)
values ('login_http', 'staging', 'ok', now() - interval '1 hour', now() - interval '1 hour', 10);
select is((select m->>'status' from jsonb_array_elements(public.admin_platform_health()->'metrics') m where m->>'signal' = 'login_http'), 'stale', 'old successful collector result cannot look healthy');
select coalesce((select (m->>'value')::int from jsonb_array_elements(public.admin_platform_health()->'metrics') m where m->>'signal' = 'wallet_ledger_mismatch'), 0) as before_mismatches \gset
update public.wallets set token_balance = 100 where user_id = 'cc000000-0000-0000-0000-000000000001';
select is((select (m->>'value')::int from jsonb_array_elements(public.admin_platform_health()->'metrics') m where m->>'signal' = 'wallet_ledger_mismatch'), :before_mismatches + 1, 'wallet drift detected without correcting ledger or balance');
select is((select token_balance from public.wallets where user_id = 'cc000000-0000-0000-0000-000000000001'), 100, 'monitor is read only');
select set_config('request.jwt.claim.session_id', 'aa000000-0000-0000-0000-000000000099', true);
select is(public.admin_platform_health()->>'outcome', 'denied', 'stale privileged session denied');
select throws_ok($test$insert into admin_monitoring.observations(signal,environment,status) values ('restore_drill','production','ok')$test$, '23514', null, 'Production proof cannot enter Staging monitor');
select * from finish();
rollback;
