begin;
set local search_path = public, extensions;
select plan(16);
\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();
select last_activity_at as activity_before from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001' and revoked_at is null \gset

-- A new password login has its own Auth session, not the earlier MFA session.
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id', 'aa000000-0000-0000-0000-0000000000f1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(public.get_admin_session_state()->>'state', 'mfa_required',
  'a new login reaches MFA instead of being treated as an expired privileged session');
select is(public.admin_list_content_catalog()->>'code', 'STALE_PRIVILEGED_SESSION',
  'requiring MFA grants no access to protected content');
select is(public.admin_touch_session_activity()->>'code', 'STALE_PRIVILEGED_SESSION',
  'a new login cannot touch the earlier privileged session');
reset role;
select is((select last_activity_at from public.admin_sessions
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001' and revoked_at is null),
  :'activity_before'::timestamptz, 'state reads and denied touches do not renew activity');

select set_config('request.jwt.claim.session_id', 'aa000000-0000-0000-0000-0000000000e1', true);
set local role authenticated;
select is(public.get_admin_session_state()->>'state', 'privileged',
  'the already verified and active Auth session remains privileged');
reset role;
update public.admin_sessions set last_activity_at = now() - interval '20 minutes'
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.get_admin_session_state()->>'state', 'stale',
  'exactly twenty minutes idle in the same login still requires sign-out');
select is(public.admin_touch_session_activity()->>'code', 'STALE_PRIVILEGED_SESSION',
  'activity cannot revive an expired session');
reset role;
update public.admin_sessions set last_activity_at = now(), revoked_at = now(),
  revoke_reason = 'pgTAP relogin regression'
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.get_admin_session_state()->>'state', 'stale',
  'a revoked record in the same Auth login is stale, not awaiting MFA');
select set_config('request.jwt.claim.session_id', 'aa000000-0000-0000-0000-0000000000f1', true);
select is(public.get_admin_session_state()->>'state', 'mfa_required',
  'a new login can complete MFA after the earlier session was revoked');
select set_config('request.jwt.claim.session_id', '', true);
select is(public.get_admin_session_state()->>'state', 'stale',
  'missing Auth session binding does not become a new MFA login');
reset role;
update public.admin_security_identities set state = 'recovery_pending', bound_factor_id = null
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.session_id', 'aa000000-0000-0000-0000-0000000000f1', true);
set local role authenticated;
select is(public.get_admin_session_state()->>'state', 'recovery_pending',
  'a new login does not bypass identity recovery');
reset role;
update public.admin_security_identities set state = 'deactivated'
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.get_admin_session_state()->>'state', 'deactivated',
  'a new login does not bypass deactivation');
reset role;
update public.admin_security_identities set state = 'active_pending_mfa', bound_factor_id = null
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.get_admin_session_state()->>'state', 'pending_mfa',
  'a not-yet-enrolled identity still reaches enrollment');
reset role;
select set_config('request.jwt.claim.sub', 'cc000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is(public.get_admin_session_state()->>'state', 'none',
  'a non-admin receives no privileged state');
reset role;
set local role anon;
select throws_ok('select public.get_admin_session_state()', '42501',
  'permission denied for function get_admin_session_state', 'anonymous callers cannot execute the state RPC');
reset role;
update public.admin_security_identities set state = 'active',
  bound_factor_id = 'aa000000-0000-0000-0000-0000000000a1'
  where admin_user_id = 'aa000000-0000-0000-0000-000000000001';
delete from public.admin_sessions where admin_user_id = 'aa000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', 'aa000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is(public.get_admin_session_state()->>'state', 'mfa_required',
  'an enrolled identity without a prior privileged record can start MFA');

select * from finish();
rollback;
