-- supabase/migrations/20260808000900_admin_service_read_grants.sql

-- Task 9:service_role 取得 admin 控制面表的唯讀權限。Edge orchestration
-- (admin-command 的 factor binding 確認、admin-reconcile 的逾時掃描)與
-- integration 斷言需要 server-side 讀取;Task 2 的全鎖姿態原本連
-- service_role 都無 SELECT,使 plan Task 9 的 service 讀取全數靜默失敗。
-- 寫入維持 service-only functions 專屬 —— service_role 仍無
-- INSERT/UPDATE/DELETE(spec §5.3/§6.1 的鎖定對象是 anon/authenticated,
-- 此處不變;pgTAP 053 同時斷言可讀與不可寫)。
grant select on
  public.admin_security_identities,
  public.admin_sessions,
  public.admin_invitations,
  public.admin_audit_principals,
  public.admin_security_operations
to service_role;
