-- supabase/tests/050_admin_service_functions.test.sql
begin;
select plan(30);

-- 種一個 admin 身分供流程測試
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000',
  '50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'admin.svc@colorplay.test', crypt('LocalOnly-Svc1!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

select public.svc_admin_bootstrap_identity(
  '50000000-0000-0000-0000-000000000001', gen_random_uuid());

select is((select state::text from public.admin_security_identities
  where admin_user_id = '50000000-0000-0000-0000-000000000001'),
  'active_pending_mfa', 'bootstrap creates active_pending_mfa identity');

-- enrollment confirm → active + bound_factor_id;不建立 session
select public.svc_admin_confirm_enrollment(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000aa', gen_random_uuid());
select is((select state::text from public.admin_security_identities
  where admin_user_id = '50000000-0000-0000-0000-000000000001'),
  'active', 'confirm enrollment activates identity');
select is((select count(*)::int from public.admin_sessions), 0,
  'confirm enrollment never creates a session');

-- session 建立:factor 不符 → denied FACTOR_BINDING_MISMATCH
select is((public.svc_admin_create_session(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e1'::uuid,
  '50000000-0000-0000-0000-0000000000bb', null, 'c1'))->>'code',
  'FACTOR_BINDING_MISMATCH', 'wrong factor cannot create session');

-- 正確 factor → session;第二次建立 supersede 舊 row(單一 active)
select ok((public.svc_admin_create_session(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e1'::uuid,
  '50000000-0000-0000-0000-0000000000aa', 'Mac Chrome', 'c1'))->>'outcome' = 'ok',
  'bound factor creates session');
select ok((public.svc_admin_create_session(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid,
  '50000000-0000-0000-0000-0000000000aa', 'iPad', 'c2'))->>'outcome' = 'ok',
  'new device session supersedes');
select is((select count(*)::int from public.admin_sessions
  where admin_user_id = '50000000-0000-0000-0000-000000000001'
    and revoked_at is null), 1, 'exactly one active session after supersede');

-- receipt mint:effective TTL 恰 60 秒
select is((select (expires_at - issued_at)::text
  from public.admin_command_authorizations limit 1), null,
  'no receipt exists before mint');
select ok((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid,
  'deactivate_admin', 'idem-1', sha256('{"target":"x"}'::bytea),
  '50000000-0000-0000-0000-0000000000aa', true))->>'outcome' = 'issued',
  'receipt minted for valid actor');
select is((select (expires_at - issued_at)::text
  from public.admin_command_authorizations limit 1),
  '00:01:00', 'minted receipt ttl is exactly 60 seconds');

-- Mint 預期 denial 入帳(Codex 修訂三-1):錯 factor、錯 session、
-- fresh-MFA 逾時、idempotency 衝突各留 typed outcome + audit + counter
select is((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid, 'deactivate_admin', 'idem-f1',
  sha256('{}'::bytea), '50000000-0000-0000-0000-0000000000bb', true))->>'code',
  'FACTOR_BINDING_MISMATCH', 'mint denies wrong factor');
select is((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000ee'::uuid, 'deactivate_admin', 'idem-s1',
  sha256('{}'::bytea), '50000000-0000-0000-0000-0000000000aa', true))->>'code',
  'STALE_PRIVILEGED_SESSION', 'mint denies mismatched auth session');
update public.admin_sessions
  set last_totp_verified_at = now() - interval '11 minutes'
  where admin_user_id = '50000000-0000-0000-0000-000000000001'
    and revoked_at is null;
select is((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid, 'deactivate_admin', 'idem-m1',
  sha256('{}'::bytea), '50000000-0000-0000-0000-0000000000aa', true))->>'code',
  'INSUFFICIENT_MFA', 'mint denies stale fresh-MFA');
update public.admin_sessions
  set last_totp_verified_at = now()
  where admin_user_id = '50000000-0000-0000-0000-000000000001'
    and revoked_at is null;
insert into public.admin_command_executions
  (actor_principal_id, command_name, idempotency_key, request_hash, result_code)
select audit_principal_id, 'deactivate_admin', 'idem-c1',
  sha256('a'::bytea), 'success'
from public.admin_security_identities
where admin_user_id = '50000000-0000-0000-0000-000000000001';
select is((public.svc_admin_issue_command_receipt(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-0000000000e2'::uuid, 'deactivate_admin', 'idem-c1',
  sha256('b'::bytea), '50000000-0000-0000-0000-0000000000aa', true))->>'code',
  'IDEMPOTENCY_CONFLICT', 'mint denies same key with different request');
select is((select count(*)::int from public.admin_denial_counters
  where resource_key = 'service/issue_command_receipt'), 4,
  'each mint denial code recorded its counter row');
select is((select count(*)::int from public.admin_audit_events
  where target_type = 'command_receipt' and result in
    ('FACTOR_BINDING_MISMATCH', 'STALE_PRIVILEGED_SESSION',
     'INSUFFICIENT_MFA', 'IDEMPOTENCY_CONFLICT')
    and actor_type = 'admin' and actor_principal_id is not null
    and target_principal_id is not null), 4,
  'each mint denial audited with admin actor and target evidence');

-- MFA lockout:第 5 次連續失敗鎖定並入帳;鎖定中 probe 亦回 MFA_LOCKED
select public.svc_admin_record_totp_outcome(
  '50000000-0000-0000-0000-000000000001', false)
from generate_series(1, 4);
select is((public.svc_admin_record_totp_outcome(
  '50000000-0000-0000-0000-000000000001', false))->>'code', 'MFA_LOCKED',
  'fifth consecutive failure locks for 15 minutes');
select is((public.svc_admin_record_totp_outcome(
  '50000000-0000-0000-0000-000000000001', true))->>'code', 'MFA_LOCKED',
  'probe during lock stays denied without clearing the counter');
select is((select count(*)::int from public.admin_audit_events
  where action = 'mfa_locked' and result = 'MFA_LOCKED'), 1,
  'lock transition audited exactly once');
select is((select c.count from public.admin_denial_counters c
  where c.resource_key = 'service/totp_attempts'
    and c.safe_reason_code = 'MFA_LOCKED'), 2,
  'both lock denials aggregated in the counter window');
update public.admin_security_identities set locked_until = null
  where admin_user_id = '50000000-0000-0000-0000-000000000001';

-- Edge denial 入帳語意(修訂四-1):已知使用者 → admin actor、target null;
-- 未解析 → unknown actor、actor null
select public.svc_admin_record_edge_denial('edge/admin-mfa',
  'INSUFFICIENT_MFA', 'challenge_admin_mfa',
  '50000000-0000-0000-0000-000000000001');
select is((select (actor_type::text, actor_principal_id is not null,
    target_principal_id is null)::text
  from public.admin_audit_events
  where target_type = 'edge_request' and action = 'challenge_admin_mfa'),
  '(admin,t,t)', 'known edge denial records admin actor with null target');
select public.svc_admin_record_edge_denial('edge/admin-mfa',
  'STALE_PRIVILEGED_SESSION', 'admin_mfa',
  '00000000-0000-0000-0000-00000000dead');
select is((select (actor_type::text, actor_principal_id is null)::text
  from public.admin_audit_events
  where target_type = 'edge_request' and action = 'admin_mfa'),
  '(unknown,t)', 'unresolved edge denial records unknown actor');

-- factor incident:獨立 service 操作,清 binding、撤 session、建 operation
select public.svc_admin_isolate_factor_incident(
  '50000000-0000-0000-0000-000000000001', 'incident-1');
select is((select state::text from public.admin_security_identities
  where admin_user_id = '50000000-0000-0000-0000-000000000001'),
  'recovery_pending', 'factor incident isolates identity');
select is((select count(*)::int from public.admin_sessions
  where admin_user_id = '50000000-0000-0000-0000-000000000001'
    and revoked_at is null), 0, 'factor incident revokes sessions');

-- 事故稽核佐證(Codex 修訂 7):自動路徑 vs OOB 路徑各自的 actor 證據
select is((select count(*)::int from public.admin_audit_events
  where action = 'factor_incident_isolated' and actor_type = 'service'
    and runbook_operation_id is null), 1,
  'automatic isolation audits service actor without runbook id');
select public.svc_admin_isolate_factor_incident_oob(
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-00000000f00b');
select is((select count(*)::int from public.admin_audit_events
  where action = 'factor_incident_isolated'
    and actor_type = 'owner_out_of_band'
    and runbook_operation_id = '50000000-0000-0000-0000-00000000f00b'), 1,
  'oob isolation audits owner actor with its runbook operation id');

-- 非 reset saga 不得被 service reset steps 推進(spec §4.2;Codex P2 guard)
select is((public.svc_admin_complete_reset_step2(
  (select id from public.admin_security_operations
    where operation_type = 'factor_incident_isolation'
    order by created_at limit 1)))->>'code',
  'SECURITY_OPERATION_PENDING',
  'reset step2 rejects a factor-incident operation');
select is((select state::text from public.admin_security_operations
  where operation_type = 'factor_incident_isolation'
  order by created_at limit 1),
  'step1_complete', 'rejected incident operation state is unchanged');

-- 全量 service-only 權限斷言:一次涵蓋本 migration 全部 svc_admin_* function
select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'svc\_admin\_%' escape '\'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
), 0, 'no svc_admin_* function is executable by anon or authenticated');
select ok((
  select count(*) >= 15
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'svc\_admin\_%' escape '\'
    and has_function_privilege('service_role', p.oid, 'EXECUTE')
), 'service_role can execute every svc_admin_* function');

select * from finish();
rollback;
