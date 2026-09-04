-- supabase/tests/049_admin_sensitivity_catalog.test.sql
begin;
select plan(13);
select has_table('public', 'admin_sensitivity_catalog', 'catalog table exists');
-- Phase 1 gate:每張 admin_* 表都要有完整的 anon/authenticated ×
-- SELECT/INSERT/UPDATE/DELETE default-deny 矩陣(比照 047/048),這張表原本
-- 只驗過 authenticated SELECT 一格,補齊其餘 7 格。
select ok(not has_table_privilege('anon',
  'public.admin_sensitivity_catalog', 'SELECT'), 'anon cannot select catalog');
select ok(not has_table_privilege('anon',
  'public.admin_sensitivity_catalog', 'INSERT'), 'anon cannot insert catalog');
select ok(not has_table_privilege('anon',
  'public.admin_sensitivity_catalog', 'UPDATE'), 'anon cannot update catalog');
select ok(not has_table_privilege('anon',
  'public.admin_sensitivity_catalog', 'DELETE'), 'anon cannot delete catalog');
select ok(not has_table_privilege('authenticated',
  'public.admin_sensitivity_catalog', 'SELECT'), 'catalog is default-deny');
select ok(not has_table_privilege('authenticated',
  'public.admin_sensitivity_catalog', 'INSERT'), 'authenticated cannot insert catalog');
select ok(not has_table_privilege('authenticated',
  'public.admin_sensitivity_catalog', 'UPDATE'), 'authenticated cannot update catalog');
select ok(not has_table_privilege('authenticated',
  'public.admin_sensitivity_catalog', 'DELETE'), 'authenticated cannot delete catalog');
select is((select count(distinct resource)::int
  from public.admin_sensitivity_catalog), 58, 'exactly 46+12 resources');
select is((select class from public.admin_sensitivity_catalog
  where resource = 'profiles' and column_name = 'full_name'),
  'personal', 'profiles.full_name is personal');
select is((select class from public.admin_sensitivity_catalog
  where resource = 'classrooms' and column_name = 'join_code'),
  'forbidden', 'classrooms.join_code is forbidden');
select is((select count(*)::int from public.admin_sensitivity_catalog
  where class = 'personal' and mask_strategy is null),
  0, 'every personal column has a mask strategy');
select * from finish();
rollback;
