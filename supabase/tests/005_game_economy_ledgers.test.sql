begin;

select plan(34);

select has_type('public', 'economy_source_type', 'economy source enum exists');
select has_table('public', 'xp_transactions', 'XP ledger exists');
select has_table('public', 'wallets', 'wallet cache exists');
select has_table('public', 'wallet_transactions', 'Token ledger exists');
select has_function(
  'public',
  'get_my_economy_summary',
  array[]::text[],
  'economy summary RPC exists'
);
select has_function(
  'public',
  'reconcile_wallet_cache',
  array['uuid'],
  'wallet reconciliation function exists'
);
select results_eq(
  $$select unnest(enum_range(null::public.economy_source_type))::text$$,
  array[
    'quiz_finalize',
    'blook_purchase',
    'achievement',
    'assignment',
    'live'
  ],
  'source enum reserves only the approved Phase 1 and future labels'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.xp_transactions'::regclass),
  true,
  'XP ledger has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.wallets'::regclass),
  true,
  'wallet cache has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.wallet_transactions'::regclass),
  true,
  'Token ledger has RLS enabled'
);
select has_index(
  'public',
  'xp_transactions',
  'xp_transactions_user_created_idx',
  'XP ledger has the own-history index'
);
select has_index(
  'public',
  'wallet_transactions',
  'wallet_transactions_user_created_idx',
  'Token ledger has the own-history index'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000011',
    'authenticated', 'authenticated', 'economy.one@colorplay.test',
    crypt('LocalOnly-Economy1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000012',
    'authenticated', 'authenticated', 'economy.two@colorplay.test',
    crypt('LocalOnly-Economy2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

select is(
  (
    select count(*)::integer
    from public.wallets
    where user_id in (
      '10000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000012'
    )
  ),
  2,
  'profile trigger creates one wallet per user'
);

insert into public.xp_transactions (
  user_id, amount, reason, source_type, source_id
)
values (
  '10000000-0000-0000-0000-000000000011', 500, 'quiz reward',
  'quiz_finalize', '40000000-0000-0000-0000-000000000001'
);
insert into public.wallet_transactions (
  user_id, amount, reason, source_type, source_id
)
values (
  '10000000-0000-0000-0000-000000000011', 100, 'quiz reward',
  'quiz_finalize', '40000000-0000-0000-0000-000000000001'
);
update public.wallets
set token_balance = 100
where user_id = '10000000-0000-0000-0000-000000000011';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000011',
  true
);

select is((select count(*)::integer from public.wallets), 1, 'student reads own wallet only');
select is(
  (
    select count(*)::integer from public.wallets
    where user_id = '10000000-0000-0000-0000-000000000012'
  ),
  0,
  'student cannot read another wallet'
);
select is((select count(*)::integer from public.xp_transactions), 1, 'student reads own XP history');
select is((select count(*)::integer from public.wallet_transactions), 1, 'student reads own Token history');
select throws_ok(
  $$insert into public.xp_transactions (user_id, amount, reason, source_type, source_id)
    values (auth.uid(), 10, 'forged', 'quiz_finalize', gen_random_uuid())$$,
  '42501',
  null,
  'student cannot insert XP ledger rows'
);
select throws_ok(
  $$insert into public.wallet_transactions (user_id, amount, reason, source_type, source_id)
    values (auth.uid(), 10, 'forged', 'quiz_finalize', gen_random_uuid())$$,
  '42501',
  null,
  'student cannot insert Token ledger rows'
);
select throws_ok(
  $$update public.wallets set token_balance = 999 where user_id = auth.uid()$$,
  '42501',
  null,
  'student cannot update wallet cache'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reconcile_wallet_cache(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute reconciliation'
);
select is(
  public.get_my_economy_summary(),
  jsonb_build_object(
    'total_xp', 500,
    'level', 2,
    'current_level_xp', 0,
    'xp_per_level', 500,
    'token_balance', 100,
    'wallet_reconciled', true
  ),
  'summary returns only authoritative own projections'
);
select is(
  (
    select count(*)::integer from public.wallet_transactions
    where user_id = '10000000-0000-0000-0000-000000000012'
  ),
  0,
  'student cannot read another Token history'
);

reset role;
select throws_ok(
  $$update public.xp_transactions set amount = 501$$,
  'P0001',
  'ECONOMY_LEDGER_IMMUTABLE',
  'XP ledger rejects privileged update'
);
select throws_ok(
  $$delete from public.wallet_transactions$$,
  'P0001',
  'ECONOMY_LEDGER_IMMUTABLE',
  'Token ledger rejects privileged delete'
);
update public.wallets
set token_balance = 1
where user_id = '10000000-0000-0000-0000-000000000011';
select is(
  public.reconcile_wallet_cache('10000000-0000-0000-0000-000000000011'),
  100,
  'reconciliation returns exact ledger sum'
);
select is(
  (
    select token_balance from public.wallets
    where user_id = '10000000-0000-0000-0000-000000000011'
  ),
  100,
  'reconciliation corrects wallet cache'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from public.wallets$$,
  '42501',
  null,
  'anonymous cannot read wallets'
);
select throws_ok(
  $$select public.get_my_economy_summary()$$,
  '42501',
  null,
  'anonymous cannot execute economy summary'
);

reset role;
select ok(
  (
    select p.proconfig @> array['search_path=pg_catalog, public']
    from pg_proc p
    where p.oid = 'public.get_my_economy_summary()'::regprocedure
  ),
  'economy summary fixes search path'
);
select ok(
  (
    select p.proconfig @> array['search_path=pg_catalog, public']
    from pg_proc p
    where p.oid = 'public.reconcile_wallet_cache(uuid)'::regprocedure
  ),
  'reconciliation fixes search path'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_my_economy_summary()',
    'EXECUTE'
  ),
  'authenticated can execute economy summary'
);
select ok(
  not has_function_privilege('anon', 'public.get_my_economy_summary()', 'EXECUTE'),
  'anonymous cannot execute economy summary'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reconcile_wallet_cache(uuid)',
    'EXECUTE'
  ),
  'reconciliation remains unavailable to browser role'
);

select * from finish();
rollback;
