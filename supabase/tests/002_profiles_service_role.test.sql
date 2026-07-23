begin;

select plan(4);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT'),
  'service role can read profiles for controlled administration'
);
select ok(
  has_column_privilege('service_role', 'public.profiles', 'role', 'UPDATE'),
  'service role can reconcile the authoritative profile role'
);
select ok(
  not has_table_privilege('service_role', 'public.profiles', 'INSERT'),
  'service role cannot bypass the Auth profile trigger with direct inserts'
);
select ok(
  not has_table_privilege('service_role', 'public.profiles', 'DELETE'),
  'service role cannot delete profiles directly'
);

select * from finish();

rollback;
