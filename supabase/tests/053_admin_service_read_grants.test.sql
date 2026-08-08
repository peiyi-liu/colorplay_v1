-- supabase/tests/053_admin_service_read_grants.test.sql
-- Task 9:service_role 對 admin 控制面表取得唯讀權限(Edge orchestration
-- 與 integration 斷言需要 server-side 讀取);寫入維持 service-only
-- functions 專屬 —— service_role 仍無 INSERT/UPDATE/DELETE。
begin;
select plan(20);

select ok(has_table_privilege('service_role',
  'public.admin_security_identities', 'SELECT'),
  'service_role can read admin_security_identities');
select ok(not has_table_privilege('service_role',
  'public.admin_security_identities', 'INSERT'),
  'service_role cannot insert admin_security_identities');
select ok(not has_table_privilege('service_role',
  'public.admin_security_identities', 'UPDATE'),
  'service_role cannot update admin_security_identities');
select ok(not has_table_privilege('service_role',
  'public.admin_security_identities', 'DELETE'),
  'service_role cannot delete admin_security_identities');

select ok(has_table_privilege('service_role',
  'public.admin_sessions', 'SELECT'),
  'service_role can read admin_sessions');
select ok(not has_table_privilege('service_role',
  'public.admin_sessions', 'INSERT'),
  'service_role cannot insert admin_sessions');
select ok(not has_table_privilege('service_role',
  'public.admin_sessions', 'UPDATE'),
  'service_role cannot update admin_sessions');
select ok(not has_table_privilege('service_role',
  'public.admin_sessions', 'DELETE'),
  'service_role cannot delete admin_sessions');

select ok(has_table_privilege('service_role',
  'public.admin_invitations', 'SELECT'),
  'service_role can read admin_invitations');
select ok(not has_table_privilege('service_role',
  'public.admin_invitations', 'INSERT'),
  'service_role cannot insert admin_invitations');
select ok(not has_table_privilege('service_role',
  'public.admin_invitations', 'UPDATE'),
  'service_role cannot update admin_invitations');
select ok(not has_table_privilege('service_role',
  'public.admin_invitations', 'DELETE'),
  'service_role cannot delete admin_invitations');

select ok(has_table_privilege('service_role',
  'public.admin_audit_principals', 'SELECT'),
  'service_role can read admin_audit_principals');
select ok(not has_table_privilege('service_role',
  'public.admin_audit_principals', 'INSERT'),
  'service_role cannot insert admin_audit_principals');
select ok(not has_table_privilege('service_role',
  'public.admin_audit_principals', 'UPDATE'),
  'service_role cannot update admin_audit_principals');
select ok(not has_table_privilege('service_role',
  'public.admin_audit_principals', 'DELETE'),
  'service_role cannot delete admin_audit_principals');

select ok(has_table_privilege('service_role',
  'public.admin_security_operations', 'SELECT'),
  'service_role can read admin_security_operations');
select ok(not has_table_privilege('service_role',
  'public.admin_security_operations', 'INSERT'),
  'service_role cannot insert admin_security_operations');
select ok(not has_table_privilege('service_role',
  'public.admin_security_operations', 'UPDATE'),
  'service_role cannot update admin_security_operations');
select ok(not has_table_privilege('service_role',
  'public.admin_security_operations', 'DELETE'),
  'service_role cannot delete admin_security_operations');

select * from finish();
rollback;
