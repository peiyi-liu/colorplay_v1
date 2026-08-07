-- supabase/tests/049_admin_sensitivity_catalog.test.sql
begin;
select plan(6);
select has_table('public', 'admin_sensitivity_catalog', 'catalog table exists');
select ok(not has_table_privilege('authenticated',
  'public.admin_sensitivity_catalog', 'SELECT'), 'catalog is default-deny');
select is((select count(distinct resource)::int
  from public.admin_sensitivity_catalog), 55, 'exactly 46+9 resources');
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
