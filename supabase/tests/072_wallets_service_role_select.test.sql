begin;

select plan(6);

select ok(
  has_table_privilege('service_role', 'public.wallets', 'SELECT'),
  'service role can read wallets for controlled fixture provisioning'
);
select ok(
  not has_any_column_privilege('service_role', 'public.wallets', 'INSERT'),
  'service role cannot insert wallets directly'
);
select ok(
  not has_any_column_privilege('service_role', 'public.wallets', 'UPDATE'),
  'service role cannot update wallets directly'
);
select ok(
  not has_table_privilege('service_role', 'public.wallets', 'DELETE'),
  'service role cannot delete wallets directly'
);
select ok(
  not has_any_column_privilege('anon', 'public.wallets', 'SELECT'),
  'anonymous still cannot read wallets'
);
select ok(
  has_table_privilege('authenticated', 'public.wallets', 'SELECT'),
  'authenticated still can read wallets'
);

select * from finish();

rollback;
