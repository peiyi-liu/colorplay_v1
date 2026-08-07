-- supabase/tests/047_admin_identity_tables.test.sql
-- Phase 1 控制表 I:存在性、default-deny 矩陣、單一 active session、
-- 8h expiry 邊界、identity/factor 綁定、邀請 token 安全、service-only helpers。
-- TC 編號對齊 implementation plan Task 2(2026-08-07 amendment)。
begin;
set local search_path = public, extensions;
select plan(68);

-- ---------------------------------------------------------------------------
-- TC-047-01 存在性(6)
-- ---------------------------------------------------------------------------
select has_table('public', 'admin_audit_principals', 'principals table exists');
select has_table('public', 'admin_security_identities', 'identities table exists');
select has_table('public', 'admin_sessions', 'sessions table exists');
select has_table('public', 'admin_invitations', 'invitations table exists');
select is(
  (select count(*)::int from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'admin_identity_state'),
  4, 'identity state enum has exactly four states');
select is(
  (select count(*)::int from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'admin_invitation_status'),
  3, 'invitation status enum has exactly three states');

-- ---------------------------------------------------------------------------
-- TC-047-02 default-deny 矩陣(32):4 表 × SELECT/INSERT/UPDATE/DELETE × anon/authenticated
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.admin_audit_principals', 'SELECT'), 'anon cannot select principals');
select ok(not has_table_privilege('anon', 'public.admin_audit_principals', 'INSERT'), 'anon cannot insert principals');
select ok(not has_table_privilege('anon', 'public.admin_audit_principals', 'UPDATE'), 'anon cannot update principals');
select ok(not has_table_privilege('anon', 'public.admin_audit_principals', 'DELETE'), 'anon cannot delete principals');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_principals', 'SELECT'), 'authenticated cannot select principals');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_principals', 'INSERT'), 'authenticated cannot insert principals');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_principals', 'UPDATE'), 'authenticated cannot update principals');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_principals', 'DELETE'), 'authenticated cannot delete principals');
select ok(not has_table_privilege('anon', 'public.admin_security_identities', 'SELECT'), 'anon cannot select identities');
select ok(not has_table_privilege('anon', 'public.admin_security_identities', 'INSERT'), 'anon cannot insert identities');
select ok(not has_table_privilege('anon', 'public.admin_security_identities', 'UPDATE'), 'anon cannot update identities');
select ok(not has_table_privilege('anon', 'public.admin_security_identities', 'DELETE'), 'anon cannot delete identities');
select ok(not has_table_privilege('authenticated', 'public.admin_security_identities', 'SELECT'), 'authenticated cannot select identities');
select ok(not has_table_privilege('authenticated', 'public.admin_security_identities', 'INSERT'), 'authenticated cannot insert identities');
select ok(not has_table_privilege('authenticated', 'public.admin_security_identities', 'UPDATE'), 'authenticated cannot update identities');
select ok(not has_table_privilege('authenticated', 'public.admin_security_identities', 'DELETE'), 'authenticated cannot delete identities');
select ok(not has_table_privilege('anon', 'public.admin_sessions', 'SELECT'), 'anon cannot select sessions');
select ok(not has_table_privilege('anon', 'public.admin_sessions', 'INSERT'), 'anon cannot insert sessions');
select ok(not has_table_privilege('anon', 'public.admin_sessions', 'UPDATE'), 'anon cannot update sessions');
select ok(not has_table_privilege('anon', 'public.admin_sessions', 'DELETE'), 'anon cannot delete sessions');
select ok(not has_table_privilege('authenticated', 'public.admin_sessions', 'SELECT'), 'authenticated cannot select sessions');
select ok(not has_table_privilege('authenticated', 'public.admin_sessions', 'INSERT'), 'authenticated cannot insert sessions');
select ok(not has_table_privilege('authenticated', 'public.admin_sessions', 'UPDATE'), 'authenticated cannot update sessions');
select ok(not has_table_privilege('authenticated', 'public.admin_sessions', 'DELETE'), 'authenticated cannot delete sessions');
select ok(not has_table_privilege('anon', 'public.admin_invitations', 'SELECT'), 'anon cannot select invitations');
select ok(not has_table_privilege('anon', 'public.admin_invitations', 'INSERT'), 'anon cannot insert invitations');
select ok(not has_table_privilege('anon', 'public.admin_invitations', 'UPDATE'), 'anon cannot update invitations');
select ok(not has_table_privilege('anon', 'public.admin_invitations', 'DELETE'), 'anon cannot delete invitations');
select ok(not has_table_privilege('authenticated', 'public.admin_invitations', 'SELECT'), 'authenticated cannot select invitations');
select ok(not has_table_privilege('authenticated', 'public.admin_invitations', 'INSERT'), 'authenticated cannot insert invitations');
select ok(not has_table_privilege('authenticated', 'public.admin_invitations', 'UPDATE'), 'authenticated cannot update invitations');
select ok(not has_table_privilege('authenticated', 'public.admin_invitations', 'DELETE'), 'authenticated cannot delete invitations');

-- ---------------------------------------------------------------------------
-- Fixtures(superuser 佈建;交易結尾 rollback,不留資料)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  crypt('LocalOnly-AdminTables1!', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin.tables.one@colorplay.test'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'admin.tables.two@colorplay.test'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, 'admin.tables.three@colorplay.test'),
  ('a0000000-0000-0000-0000-000000000004'::uuid, 'admin.tables.four@colorplay.test'),
  ('a0000000-0000-0000-0000-000000000005'::uuid, 'admin.tables.five@colorplay.test')
) as u(id, email);

insert into public.admin_audit_principals (id, user_id)
values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005');

insert into public.admin_security_identities
  (admin_user_id, audit_principal_id, state, bound_factor_id)
values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'active', 'c0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
   'active', 'c0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003',
   'active', 'c0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004',
   'active', 'c0000000-0000-0000-0000-000000000004');

-- ---------------------------------------------------------------------------
-- TC-047-03 單一 active session(3)
-- ---------------------------------------------------------------------------
select has_index('public', 'admin_sessions', 'admin_sessions_one_active_idx',
  'partial unique index for single active session exists');

insert into public.admin_sessions
  (admin_user_id, audit_principal_id, auth_session_id,
   bound_factor_id_snapshot, absolute_expires_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   now() + interval '8 hours');

select throws_ok(
  $$insert into public.admin_sessions
      (admin_user_id, audit_principal_id, auth_session_id,
       bound_factor_id_snapshot, absolute_expires_at)
    values
      ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
       'd0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001',
       now() + interval '8 hours')$$,
  '23505',
  null,
  'second active session for the same identity violates the partial unique index');

update public.admin_sessions
   set revoked_at = now(), revoke_reason = 'revoked_by_admin'
 where admin_user_id = 'a0000000-0000-0000-0000-000000000001'
   and revoked_at is null;

select lives_ok(
  $$insert into public.admin_sessions
      (admin_user_id, audit_principal_id, auth_session_id,
       bound_factor_id_snapshot, absolute_expires_at)
    values
      ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
       'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001',
       now() + interval '8 hours')$$,
  'a new active session is allowed after the previous one is revoked');

-- ---------------------------------------------------------------------------
-- TC-047-04 8 小時 absolute expiry 邊界(3)
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.admin_sessions
      (admin_user_id, audit_principal_id, auth_session_id,
       bound_factor_id_snapshot, created_at, absolute_expires_at)
    values
      ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
       'd0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002',
       timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-07 08:00:00+00')$$,
  'absolute expiry exactly created_at + 8 hours is accepted');

update public.admin_sessions
   set revoked_at = now(), revoke_reason = 'revoked_by_admin'
 where admin_user_id = 'a0000000-0000-0000-0000-000000000002'
   and revoked_at is null;

select throws_ok(
  $$insert into public.admin_sessions
      (admin_user_id, audit_principal_id, auth_session_id,
       bound_factor_id_snapshot, created_at, absolute_expires_at)
    values
      ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
       'd0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002',
       timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-07 07:59:59+00')$$,
  '23514',
  null,
  'absolute expiry one second short of 8 hours is rejected');

select throws_ok(
  $$insert into public.admin_sessions
      (admin_user_id, audit_principal_id, auth_session_id,
       bound_factor_id_snapshot, created_at, absolute_expires_at)
    values
      ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
       'd0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002',
       timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-07 08:00:01+00')$$,
  '23514',
  null,
  'absolute expiry one second past 8 hours is rejected');

-- ---------------------------------------------------------------------------
-- TC-047-05 identity/factor 綁定(4)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.admin_security_identities
      (admin_user_id, audit_principal_id, state, bound_factor_id)
    values
      ('a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005',
       'active', null)$$,
  '23514',
  null,
  'active identity without a bound factor is rejected');

select throws_ok(
  $$insert into public.admin_security_identities
      (admin_user_id, audit_principal_id, state, bound_factor_id)
    values
      ('a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005',
       'recovery_pending', 'c0000000-0000-0000-0000-000000000005')$$,
  '23514',
  null,
  'recovery_pending identity with a bound factor is rejected');

select throws_ok(
  $$insert into public.admin_security_identities
      (admin_user_id, audit_principal_id, state, bound_factor_id)
    values
      ('a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005',
       'active_pending_mfa', 'c0000000-0000-0000-0000-000000000005')$$,
  '23514',
  null,
  'active_pending_mfa identity with a bound factor is rejected');

select lives_ok(
  $$update public.admin_security_identities
       set state = 'recovery_pending', bound_factor_id = null
     where admin_user_id = 'a0000000-0000-0000-0000-000000000004'$$,
  'active identity can transition to recovery_pending when the factor is cleared');

-- ---------------------------------------------------------------------------
-- TC-047-06 邀請 token 安全(4)
-- ---------------------------------------------------------------------------
insert into public.admin_invitations
  (issuer_principal_id, invited_email, token_hash, created_at, expires_at)
values
  ('b0000000-0000-0000-0000-000000000001', 'invitee.one@colorplay.test',
   '\x01', timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-10 00:00:00+00');

select throws_ok(
  $$insert into public.admin_invitations
      (issuer_principal_id, invited_email, token_hash, created_at, expires_at)
    values
      ('b0000000-0000-0000-0000-000000000001', 'invitee.dup@colorplay.test',
       '\x01', timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-10 00:00:00+00')$$,
  '23505',
  null,
  'duplicate invitation token_hash is rejected');

select throws_ok(
  $$insert into public.admin_invitations
      (issuer_principal_id, invited_email, token_hash, created_at, expires_at)
    values
      ('b0000000-0000-0000-0000-000000000001', 'invitee.two@colorplay.test',
       '\x02', timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-09 00:00:00+00')$$,
  '23514',
  null,
  'invitation expiry different from 72 hours is rejected');

select throws_ok(
  $$insert into public.admin_invitations
      (issuer_principal_id, invited_email, token_hash, status,
       created_at, expires_at, accepted_at)
    values
      ('b0000000-0000-0000-0000-000000000001', 'invitee.three@colorplay.test',
       '\x03', 'accepted',
       timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-10 00:00:00+00',
       timestamptz '2026-08-10 01:00:00+00')$$,
  '23514',
  null,
  'acceptance after expiry is rejected');

select lives_ok(
  $$insert into public.admin_invitations
      (issuer_principal_id, accepted_principal_id, invited_email, token_hash,
       status, created_at, expires_at, accepted_at)
    values
      ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002',
       'invitee.four@colorplay.test', '\x04', 'accepted',
       timestamptz '2026-08-07 00:00:00+00', timestamptz '2026-08-10 00:00:00+00',
       timestamptz '2026-08-07 01:00:00+00')$$,
  'acceptance within validity is accepted');

-- ---------------------------------------------------------------------------
-- TC-047-07 service-only helpers(16)
-- ---------------------------------------------------------------------------
select has_function('public', 'admin_internal_lifecycle_lock',
  array[]::name[], 'lifecycle lock helper exists');
select has_function('public', 'create_admin_identity_session',
  array['uuid', 'uuid', 'uuid', 'text', 'text']::name[],
  'create session helper exists');
select has_function('public', 'close_admin_identity_session',
  array['uuid', 'text']::name[], 'close session helper exists');

select ok(not has_function_privilege('anon',
  'public.admin_internal_lifecycle_lock()', 'EXECUTE'),
  'anon cannot execute lifecycle lock helper');
select ok(not has_function_privilege('authenticated',
  'public.admin_internal_lifecycle_lock()', 'EXECUTE'),
  'authenticated cannot execute lifecycle lock helper');
select ok(not has_function_privilege('anon',
  'public.create_admin_identity_session(uuid, uuid, uuid, text, text)', 'EXECUTE'),
  'anon cannot execute create session helper');
select ok(not has_function_privilege('authenticated',
  'public.create_admin_identity_session(uuid, uuid, uuid, text, text)', 'EXECUTE'),
  'authenticated cannot execute create session helper');
select ok(not has_function_privilege('anon',
  'public.close_admin_identity_session(uuid, text)', 'EXECUTE'),
  'anon cannot execute close session helper');
select ok(not has_function_privilege('authenticated',
  'public.close_admin_identity_session(uuid, text)', 'EXECUTE'),
  'authenticated cannot execute close session helper');

select ok(
  public.create_admin_identity_session(
    'a0000000-0000-0000-0000-000000000003',
    'd0000000-0000-0000-0000-000000000007',
    'c0000000-0000-0000-0000-000000000003',
    'pgTAP fixture device', 'tc-047-07-first') is not null,
  'create helper returns a session id for an eligible active identity');

select public.create_admin_identity_session(
  'a0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000008',
  'c0000000-0000-0000-0000-000000000003',
  'pgTAP fixture device', 'tc-047-07-second');

select is(
  (select count(*)::int from public.admin_sessions
    where admin_user_id = 'a0000000-0000-0000-0000-000000000003'
      and revoked_at is null),
  1, 'supersede keeps exactly one active session');

select is(
  (select auth_session_id from public.admin_sessions
    where admin_user_id = 'a0000000-0000-0000-0000-000000000003'
      and revoked_at is null),
  'd0000000-0000-0000-0000-000000000008'::uuid,
  'the surviving active session belongs to the latest login');

select is(
  public.create_admin_identity_session(
    'a0000000-0000-0000-0000-000000000003',
    'd0000000-0000-0000-0000-000000000008',
    'c0000000-0000-0000-0000-000000000003',
    'pgTAP fixture device', 'tc-047-07-second'),
  (select id from public.admin_sessions
    where admin_user_id = 'a0000000-0000-0000-0000-000000000003'
      and revoked_at is null),
  'replaying the same login returns the existing active session id');

select is(
  public.close_admin_identity_session(
    (select id from public.admin_sessions
      where admin_user_id = 'a0000000-0000-0000-0000-000000000003'
        and auth_session_id = 'd0000000-0000-0000-0000-000000000008'
      order by created_at desc limit 1),
    'revoked_by_admin'),
  true, 'closing an active session returns true');

select is(
  public.close_admin_identity_session(
    (select id from public.admin_sessions
      where admin_user_id = 'a0000000-0000-0000-0000-000000000003'
        and auth_session_id = 'd0000000-0000-0000-0000-000000000008'
      order by created_at desc limit 1),
    'revoked_by_admin'),
  false, 'closing the same session again is idempotent and returns false');

select is(
  (select count(*)::int from public.admin_sessions
    where admin_user_id = 'a0000000-0000-0000-0000-000000000003'
      and revoked_at is null),
  0, 'no active session remains after close');

select * from finish();
rollback;
