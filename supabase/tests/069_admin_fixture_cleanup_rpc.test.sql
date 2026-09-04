-- A1: the Hosted fixture cleanup mutation is service-role-only, exact-ID,
-- transaction-scoped, ledger-bound, and fails closed on reverse identity links.
begin;
select plan(19);

select has_function(
  'public',
  'cleanup_hosted_admin_fixtures',
  array[
    'text', 'text', 'text', 'text', 'uuid', 'uuid[]', 'text[]', 'uuid[]',
    'uuid[]', 'uuid[]', 'uuid[]', 'uuid[]', 'uuid[]', 'uuid[]', 'uuid[]',
    'uuid[]'
  ],
  'cleanup RPC has the exact manifest-bound signature'
);
select ok(has_function_privilege(
  'service_role',
  'public.cleanup_hosted_admin_fixtures(text,text,text,text,uuid,uuid[],text[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[])',
  'EXECUTE'
), 'service role can invoke the cleanup RPC');
select ok(not has_function_privilege(
  'authenticated',
  'public.cleanup_hosted_admin_fixtures(text,text,text,text,uuid,uuid[],text[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[])',
  'EXECUTE'
), 'authenticated callers cannot invoke the cleanup RPC');
select ok(not has_function_privilege(
  'anon',
  'public.cleanup_hosted_admin_fixtures(text,text,text,text,uuid,uuid[],text[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid[])',
  'EXECUTE'
), 'anonymous callers cannot invoke the cleanup RPC');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'cleanup-target@colorplay.test',
    crypt('LocalOnly-Cleanup1!', gen_salt('bf')), now(),
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'colorplay_fixture_environment', 'staging',
      'colorplay_fixture_run_id', 'admin-b-hosted-20260903-01',
      'colorplay_fixture_label', 'fixture-admin'
    ),
    '{}'::jsonb, now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'cleanup-nontarget@colorplay.test',
    crypt('LocalOnly-Cleanup1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now(), '', '', '', ''
  );

insert into public.admin_audit_principals (id, user_id)
values (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001'
);
insert into public.admin_security_identities (
  admin_user_id, audit_principal_id
) values (
  'd1000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000001'
);

select encode(
  pg_catalog.sha256(
    pg_catalog.convert_to(
      coalesce(string_agg(version, E'\n' order by version), ''),
      'UTF8'
    )
  ),
  'hex'
) as migration_ledger_sha256
from supabase_migrations.schema_migrations \gset

create function pg_temp.call_fixture_cleanup(p_ledger_sha256 text)
returns jsonb
language sql
as $$
  select public.cleanup_hosted_admin_fixtures(
    'onkxnkzeixpezetkmocf',
    'admin-b-hosted-20260903-01',
    (select max(version) from supabase_migrations.schema_migrations),
    p_ledger_sha256,
    'd3000000-0000-4000-8000-000000000001',
    array['d1000000-0000-4000-8000-000000000001'::uuid],
    array['fixture-admin'],
    array['d1000000-0000-4000-8000-000000000001'::uuid],
    array['d1000000-0000-4000-8000-000000000001'::uuid],
    array['d2000000-0000-4000-8000-000000000001'::uuid],
    array[]::uuid[], array[]::uuid[], array[]::uuid[], array[]::uuid[],
    array[]::uuid[], array[]::uuid[]
  );
$$;

select set_config('request.jwt.claim.role', 'service_role', true);

select throws_ok(
  format('select pg_temp.call_fixture_cleanup(%L)', repeat('0', 64)),
  'ADMIN_FIXTURE_CLEANUP_MIGRATION_LEDGER_MISMATCH',
  'same migration head with a different ordered ledger fails closed'
);
select ok(exists(
  select 1 from public.profiles
  where id = 'd1000000-0000-4000-8000-000000000001'
), 'ledger mismatch leaves the exact target profile untouched');

select throws_ok(
  format(
    'select pg_temp.call_fixture_cleanup(%L)',
    :'migration_ledger_sha256'
  ),
  'ADMIN_FIXTURE_CLEANUP_IDENTITY_PRINCIPAL_SCOPE_INVALID',
  'a non-target identity linked to the target principal fails closed'
);
select ok(exists(
  select 1 from public.profiles
  where id = 'd1000000-0000-4000-8000-000000000001'
), 'reverse identity guard fails before deleting the target profile');

update public.admin_security_identities
set admin_user_id = 'd1000000-0000-4000-8000-000000000001'
where audit_principal_id = 'd2000000-0000-4000-8000-000000000001';

update public.wallets
set token_balance = 1
where user_id = 'd1000000-0000-4000-8000-000000000001';
select throws_ok(
  format(
    'select pg_temp.call_fixture_cleanup(%L)',
    :'migration_ledger_sha256'
  ),
  'ADMIN_FIXTURE_CLEANUP_BOOTSTRAP_STATE_INVALID',
  'non-zero bootstrap wallet state fails closed'
);
select ok(exists(
  select 1 from public.profiles
  where id = 'd1000000-0000-4000-8000-000000000001'
), 'unsafe bootstrap state fails before deleting the target profile');
update public.wallets
set token_balance = 0
where user_id = 'd1000000-0000-4000-8000-000000000001';

update public.achievement_progress
set last_source_type = null, last_source_id = null
where user_id = 'd1000000-0000-4000-8000-000000000001';
select throws_ok(
  format(
    'select pg_temp.call_fixture_cleanup(%L)',
    :'migration_ledger_sha256'
  ),
  'ADMIN_FIXTURE_CLEANUP_BOOTSTRAP_STATE_INVALID',
  'NULL achievement source fails closed'
);
select ok(exists(
  select 1 from public.profiles
  where id = 'd1000000-0000-4000-8000-000000000001'
), 'NULL achievement source fails before deleting the target profile');
update public.achievement_progress
set last_source_type = 'blook_acquired',
    last_source_id = '50000000-0000-0000-0000-000000000001'
where user_id = 'd1000000-0000-4000-8000-000000000001';

select set_config(
  'pgtap.cleanup_result',
  pg_temp.call_fixture_cleanup(:'migration_ledger_sha256')::text,
  true
);
select is(
  current_setting('pgtap.cleanup_result')::jsonb
    -> 'database_counts' ->> 'profiles',
  '0',
  'successful RPC returns a zero profile residue count'
);
select ok(not exists(
  select 1 from public.admin_security_identities
  where admin_user_id = 'd1000000-0000-4000-8000-000000000001'
), 'successful RPC deletes only the exact Admin identity');
select ok(exists(
  select 1 from public.admin_audit_principals
  where id = 'd2000000-0000-4000-8000-000000000001'
    and user_id is null
    and tombstoned_at is not null
), 'successful RPC tombstones rather than deletes the audit principal');
select ok(exists(
  select 1 from public.admin_audit_events
  where runbook_operation_id = 'd3000000-0000-4000-8000-000000000001'
    and action = 'cleanup_hosted_admin_fixture_database'
    and result = 'database_cleanup_complete'
), 'successful RPC appends an accurate database-stage audit event');
select ok(exists(
  select 1 from auth.users
  where id = 'd1000000-0000-4000-8000-000000000001'
), 'database RPC does not directly delete the Auth user');
select ok(exists(
  select 1 from auth.users
  where id = 'd1000000-0000-4000-8000-000000000002'
), 'non-target Auth user remains');
select ok(exists(
  select 1 from public.profiles
  where id = 'd1000000-0000-4000-8000-000000000002'
), 'non-target profile remains');

select * from finish();
rollback;
