-- supabase/tests/048_admin_receipt_audit_tables.test.sql
-- Phase 1 控制表 II:operations/receipts/executions/audit/denial。
-- 行為式覆蓋:receipt TTL 60s 邊界、consumed 標記、idempotency 唯一鍵、
-- audit append-only(含 superuser 直寫防禦)、denial 聚合與統一出口、
-- canonical hash 確定性、五個 internal functions 的 default-deny。
-- TC 編號對齊 implementation plan Task 3(M2)。
begin;
set local search_path = public, extensions;
select plan(78);

-- ---------------------------------------------------------------------------
-- TC-048-01 存在性(8)
-- ---------------------------------------------------------------------------
select has_table('public', 'admin_security_operations', 'operations table exists');
select has_table('public', 'admin_command_authorizations', 'receipts table exists');
select has_table('public', 'admin_command_executions', 'executions table exists');
select has_table('public', 'admin_audit_events', 'audit events table exists');
select has_table('public', 'admin_denial_counters', 'denial counters table exists');
select is(
  (select count(*)::int from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'admin_operation_type'),
  4, 'operation type enum has exactly four values');
select is(
  (select count(*)::int from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'admin_operation_state'),
  5, 'operation state enum has exactly five values');
select is(
  (select count(*)::int from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'admin_actor_type'),
  5, 'actor type enum has exactly five values');

-- ---------------------------------------------------------------------------
-- TC-048-02 default-deny 矩陣(40):5 表 × SELECT/INSERT/UPDATE/DELETE × anon/authenticated
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.admin_security_operations', 'SELECT'), 'anon cannot select operations');
select ok(not has_table_privilege('anon', 'public.admin_security_operations', 'INSERT'), 'anon cannot insert operations');
select ok(not has_table_privilege('anon', 'public.admin_security_operations', 'UPDATE'), 'anon cannot update operations');
select ok(not has_table_privilege('anon', 'public.admin_security_operations', 'DELETE'), 'anon cannot delete operations');
select ok(not has_table_privilege('authenticated', 'public.admin_security_operations', 'SELECT'), 'authenticated cannot select operations');
select ok(not has_table_privilege('authenticated', 'public.admin_security_operations', 'INSERT'), 'authenticated cannot insert operations');
select ok(not has_table_privilege('authenticated', 'public.admin_security_operations', 'UPDATE'), 'authenticated cannot update operations');
select ok(not has_table_privilege('authenticated', 'public.admin_security_operations', 'DELETE'), 'authenticated cannot delete operations');
select ok(not has_table_privilege('anon', 'public.admin_command_authorizations', 'SELECT'), 'anon cannot select receipts');
select ok(not has_table_privilege('anon', 'public.admin_command_authorizations', 'INSERT'), 'anon cannot insert receipts');
select ok(not has_table_privilege('anon', 'public.admin_command_authorizations', 'UPDATE'), 'anon cannot update receipts');
select ok(not has_table_privilege('anon', 'public.admin_command_authorizations', 'DELETE'), 'anon cannot delete receipts');
select ok(not has_table_privilege('authenticated', 'public.admin_command_authorizations', 'SELECT'), 'authenticated cannot select receipts');
select ok(not has_table_privilege('authenticated', 'public.admin_command_authorizations', 'INSERT'), 'authenticated cannot insert receipts');
select ok(not has_table_privilege('authenticated', 'public.admin_command_authorizations', 'UPDATE'), 'authenticated cannot update receipts');
select ok(not has_table_privilege('authenticated', 'public.admin_command_authorizations', 'DELETE'), 'authenticated cannot delete receipts');
select ok(not has_table_privilege('anon', 'public.admin_command_executions', 'SELECT'), 'anon cannot select executions');
select ok(not has_table_privilege('anon', 'public.admin_command_executions', 'INSERT'), 'anon cannot insert executions');
select ok(not has_table_privilege('anon', 'public.admin_command_executions', 'UPDATE'), 'anon cannot update executions');
select ok(not has_table_privilege('anon', 'public.admin_command_executions', 'DELETE'), 'anon cannot delete executions');
select ok(not has_table_privilege('authenticated', 'public.admin_command_executions', 'SELECT'), 'authenticated cannot select executions');
select ok(not has_table_privilege('authenticated', 'public.admin_command_executions', 'INSERT'), 'authenticated cannot insert executions');
select ok(not has_table_privilege('authenticated', 'public.admin_command_executions', 'UPDATE'), 'authenticated cannot update executions');
select ok(not has_table_privilege('authenticated', 'public.admin_command_executions', 'DELETE'), 'authenticated cannot delete executions');
select ok(not has_table_privilege('anon', 'public.admin_audit_events', 'SELECT'), 'anon cannot select audit events');
select ok(not has_table_privilege('anon', 'public.admin_audit_events', 'INSERT'), 'anon cannot insert audit events');
select ok(not has_table_privilege('anon', 'public.admin_audit_events', 'UPDATE'), 'anon cannot update audit events');
select ok(not has_table_privilege('anon', 'public.admin_audit_events', 'DELETE'), 'anon cannot delete audit events');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_events', 'SELECT'), 'authenticated cannot select audit events');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_events', 'INSERT'), 'authenticated cannot insert audit events');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_events', 'UPDATE'), 'authenticated cannot update audit events');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_events', 'DELETE'), 'authenticated cannot delete audit events');
select ok(not has_table_privilege('anon', 'public.admin_denial_counters', 'SELECT'), 'anon cannot select denial counters');
select ok(not has_table_privilege('anon', 'public.admin_denial_counters', 'INSERT'), 'anon cannot insert denial counters');
select ok(not has_table_privilege('anon', 'public.admin_denial_counters', 'UPDATE'), 'anon cannot update denial counters');
select ok(not has_table_privilege('anon', 'public.admin_denial_counters', 'DELETE'), 'anon cannot delete denial counters');
select ok(not has_table_privilege('authenticated', 'public.admin_denial_counters', 'SELECT'), 'authenticated cannot select denial counters');
select ok(not has_table_privilege('authenticated', 'public.admin_denial_counters', 'INSERT'), 'authenticated cannot insert denial counters');
select ok(not has_table_privilege('authenticated', 'public.admin_denial_counters', 'UPDATE'), 'authenticated cannot update denial counters');
select ok(not has_table_privilege('authenticated', 'public.admin_denial_counters', 'DELETE'), 'authenticated cannot delete denial counters');

-- ---------------------------------------------------------------------------
-- Fixtures(superuser 佈建;交易結尾 rollback,不留資料)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  'aa000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated',
  'admin.receipt.one@colorplay.test',
  crypt('LocalOnly-AdminReceipt1!', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into public.admin_audit_principals (id, user_id)
values ('bb000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- TC-048-03 receipt TTL 恰 60 秒(3)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.admin_command_authorizations
      (actor_principal_id, auth_session_id, command_name, idempotency_key,
       request_hash, bound_factor_id_snapshot, issued_at, expires_at)
    values ('bb000000-0000-0000-0000-000000000001',
            'dd000000-0000-0000-0000-000000000001', 'deactivate_admin', 'tc048-ttl-ok',
            '\x00', 'cc000000-0000-0000-0000-000000000001',
            timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-07 00:01:00+00')$$,
  'receipt expiring exactly 60 seconds after issuance is accepted');

select throws_ok(
  $$insert into public.admin_command_authorizations
      (actor_principal_id, auth_session_id, command_name, idempotency_key,
       request_hash, bound_factor_id_snapshot, issued_at, expires_at)
    values ('bb000000-0000-0000-0000-000000000001',
            'dd000000-0000-0000-0000-000000000001', 'deactivate_admin', 'tc048-ttl-59',
            '\x00', 'cc000000-0000-0000-0000-000000000001',
            timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-07 00:00:59+00')$$,
  '23514', null, 'receipt with 59-second ttl is rejected');

select throws_ok(
  $$insert into public.admin_command_authorizations
      (actor_principal_id, auth_session_id, command_name, idempotency_key,
       request_hash, bound_factor_id_snapshot, issued_at, expires_at)
    values ('bb000000-0000-0000-0000-000000000001',
            'dd000000-0000-0000-0000-000000000001', 'deactivate_admin', 'tc048-ttl-61',
            '\x00', 'cc000000-0000-0000-0000-000000000001',
            timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-07 00:01:01+00')$$,
  '23514', null, 'receipt with 61-second ttl is rejected');

-- ---------------------------------------------------------------------------
-- TC-048-04 consumed 標記(2):一次性語意的資料面
-- (拒絕重複 consume 的完整 once 行為由 Task 5 mint/consume functions 交付)
-- ---------------------------------------------------------------------------
select is(
  (select consumed_at from public.admin_command_authorizations
    where idempotency_key = 'tc048-ttl-ok'),
  null::timestamptz, 'a fresh receipt is unconsumed');

select lives_ok(
  $$update public.admin_command_authorizations
       set consumed_at = now()
     where idempotency_key = 'tc048-ttl-ok'$$,
  'a receipt can be marked consumed exactly once at the data layer');

-- ---------------------------------------------------------------------------
-- TC-048-05 idempotency 唯一鍵(3)
-- ---------------------------------------------------------------------------
select has_index('public', 'admin_command_executions',
  'admin_command_executions_idempotency_idx', 'idempotency unique index exists');

insert into public.admin_command_executions
  (actor_principal_id, command_name, idempotency_key, request_hash)
values ('bb000000-0000-0000-0000-000000000001', 'deactivate_admin',
        'tc048-idem-1', '\x01');

select throws_ok(
  $$insert into public.admin_command_executions
      (actor_principal_id, command_name, idempotency_key, request_hash)
    values ('bb000000-0000-0000-0000-000000000001', 'deactivate_admin',
            'tc048-idem-1', '\x02')$$,
  '23505', null,
  'same actor/command/idempotency key cannot create a second execution');

select lives_ok(
  $$insert into public.admin_command_executions
      (actor_principal_id, command_name, idempotency_key, request_hash)
    values ('bb000000-0000-0000-0000-000000000001', 'deactivate_admin',
            'tc048-idem-2', '\x01')$$,
  'a different idempotency key creates a new execution');

-- ---------------------------------------------------------------------------
-- TC-048-06 audit append-only(4):superuser 直寫也被 trigger 封鎖
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.admin_audit_events (actor_type, action, target_type, result)
    values ('service', 'tc048_probe', 'none', 'success')$$,
  'an audit event can be appended');

select throws_ok(
  $$update public.admin_audit_events set result = 'tampered'
     where action = 'tc048_probe'$$,
  'P0001', 'ADMIN_AUDIT_APPEND_ONLY',
  'audit update is blocked by trigger even for the superuser');

select throws_ok(
  $$delete from public.admin_audit_events where action = 'tc048_probe'$$,
  'P0001', 'ADMIN_AUDIT_APPEND_ONLY',
  'audit delete is blocked by trigger even for the superuser');

select throws_ok(
  $$insert into public.admin_audit_events
      (actor_type, action, target_type, result, reason_or_purpose_redacted)
    values ('service', 'tc048_long_reason', 'none', 'success', repeat('x', 201))$$,
  '23514', null, 'reason longer than 200 characters is rejected');

-- ---------------------------------------------------------------------------
-- TC-048-07 denial 聚合與統一出口(6)
-- ---------------------------------------------------------------------------
select public.admin_internal_record_denial('tc048:resource', 'TC048_CODE');
select public.admin_internal_record_denial('tc048:resource', 'TC048_CODE');

select is(
  (select count(*)::int from public.admin_denial_counters
    where resource_key = 'tc048:resource' and safe_reason_code = 'TC048_CODE'),
  1, 'repeated denials aggregate into a single window row');

select is(
  (select count from public.admin_denial_counters
    where resource_key = 'tc048:resource' and safe_reason_code = 'TC048_CODE'),
  2, 'the window row counts both denials');

select is(
  (public.admin_internal_deny(
     'tc048:deny', 'TC048_DENIED', 'tc048_deny', 'none', 'admin',
     'bb000000-0000-0000-0000-000000000001', null, null, null,
     'pgTAP denial probe', 5))->>'outcome',
  'denied', 'user-scoped deny helper returns a typed denied outcome');

select is(
  (select count(*)::int from public.admin_audit_events
    where action = 'tc048_deny' and result = 'TC048_DENIED'),
  1, 'user-scoped deny helper writes exactly one audit event');

select is(
  (public.admin_internal_service_deny(
     'tc048:svc-deny', 'TC048_S_DENIED', 'tc048_service_deny', 'none', 'service',
     null, 'bb000000-0000-0000-0000-000000000001', 'tc048-corr', null))->>'outcome',
  'denied', 'service deny helper returns a typed denied outcome');

select is(
  (select count(*)::int from public.admin_audit_events
    where action = 'tc048_service_deny' and result = 'TC048_S_DENIED'
      and target_principal_id = 'bb000000-0000-0000-0000-000000000001'),
  1, 'service deny helper audits with actor and target strictly separated');

-- ---------------------------------------------------------------------------
-- TC-048-08 canonical hash 確定性(2)
-- ---------------------------------------------------------------------------
select is(
  public.admin_internal_canonical_hash('{"b":"2","a":"1"}'::jsonb),
  public.admin_internal_canonical_hash('{"a":"1","b":"2"}'::jsonb),
  'canonical hash is independent of key order');

select isnt(
  public.admin_internal_canonical_hash('{"a":"1"}'::jsonb),
  public.admin_internal_canonical_hash('{"a":"2"}'::jsonb),
  'canonical hash is sensitive to values');

-- ---------------------------------------------------------------------------
-- TC-048-09 五個 internal functions 的 default-deny(10)
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon',
  'public.admin_internal_append_audit(public.admin_actor_type, uuid, uuid, uuid, text, text, uuid, text, text, integer, jsonb, text, uuid, uuid)',
  'EXECUTE'), 'anon cannot execute append audit');
select ok(not has_function_privilege('authenticated',
  'public.admin_internal_append_audit(public.admin_actor_type, uuid, uuid, uuid, text, text, uuid, text, text, integer, jsonb, text, uuid, uuid)',
  'EXECUTE'), 'authenticated cannot execute append audit');
select ok(not has_function_privilege('anon',
  'public.admin_internal_record_denial(text, text)', 'EXECUTE'),
  'anon cannot execute denial recorder');
select ok(not has_function_privilege('authenticated',
  'public.admin_internal_record_denial(text, text)', 'EXECUTE'),
  'authenticated cannot execute denial recorder');
select ok(not has_function_privilege('anon',
  'public.admin_internal_deny(text, text, text, text, public.admin_actor_type, uuid, uuid, uuid, uuid, text, integer)',
  'EXECUTE'), 'anon cannot execute deny helper');
select ok(not has_function_privilege('authenticated',
  'public.admin_internal_deny(text, text, text, text, public.admin_actor_type, uuid, uuid, uuid, uuid, text, integer)',
  'EXECUTE'), 'authenticated cannot execute deny helper');
select ok(not has_function_privilege('anon',
  'public.admin_internal_service_deny(text, text, text, text, public.admin_actor_type, uuid, uuid, text, uuid)',
  'EXECUTE'), 'anon cannot execute service deny helper');
select ok(not has_function_privilege('authenticated',
  'public.admin_internal_service_deny(text, text, text, text, public.admin_actor_type, uuid, uuid, text, uuid)',
  'EXECUTE'), 'authenticated cannot execute service deny helper');
select ok(not has_function_privilege('anon',
  'public.admin_internal_canonical_hash(jsonb)', 'EXECUTE'),
  'anon cannot execute canonical hash');
select ok(not has_function_privilege('authenticated',
  'public.admin_internal_canonical_hash(jsonb)', 'EXECUTE'),
  'authenticated cannot execute canonical hash');

select * from finish();
rollback;
