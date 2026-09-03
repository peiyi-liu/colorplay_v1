-- Task 4: access-list cursor contract and server-owned Health action metadata.
begin;
select plan(39);

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select audit_principal_id as admin_principal_id
from public.admin_security_identities
where admin_user_id = 'aa000000-0000-0000-0000-000000000001' \gset

-- Add enough identities for a real two-page Admin list.
insert into auth.users (instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, confirmation_token,
    email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', md5('task4-admin-' || n)::uuid,
  'authenticated', 'authenticated', 'task4-admin-' || n || '@colorplay.test',
  crypt('LocalOnly-Task4!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now() + (n || ' seconds')::interval,
  now() + (n || ' seconds')::interval, '', '', '', ''
from generate_series(1, 49) n;
insert into public.admin_audit_principals (user_id)
select md5('task4-admin-' || n)::uuid from generate_series(1, 49) n;
insert into public.admin_security_identities
  (admin_user_id, audit_principal_id, created_at, updated_at)
select p.user_id, p.id, p.created_at, p.created_at
from public.admin_audit_principals p
where p.user_id in (
  select md5('task4-admin-' || n)::uuid from generate_series(1, 49) n
);

select public.admin_list_admins(null) as admins_page1 \gset
select is(jsonb_array_length(:'admins_page1'::jsonb -> 'rows'), 50,
  'Admin list returns at most 50 rows');
select isnt(:'admins_page1'::jsonb ->> 'next_cursor', null,
  'Admin list issues a server cursor only when another row exists');
select public.admin_list_admins(
  :'admins_page1'::jsonb ->> 'next_cursor') as admins_page2 \gset
select is(:'admins_page2'::jsonb ->> 'outcome', 'ok',
  'Admin list accepts its own cursor for the next page');
select is(jsonb_array_length(:'admins_page2'::jsonb -> 'rows'), 1,
  'Admin list second page returns the exact remaining row');
select is((select count(*)::int
    from jsonb_array_elements(:'admins_page1'::jsonb -> 'rows')
      as first_page(row_data)
    join jsonb_array_elements(:'admins_page2'::jsonb -> 'rows')
      as second_page(row_data)
      on first_page.row_data ->> 'admin_user_id'
        = second_page.row_data ->> 'admin_user_id'), 0,
  'Admin pages have no duplicate identities');
select is((select count(distinct page.row_data ->> 'admin_user_id')::int
    from (
      select row_data
      from jsonb_array_elements(:'admins_page1'::jsonb -> 'rows')
        as first_page(row_data)
      union all
      select row_data
      from jsonb_array_elements(:'admins_page2'::jsonb -> 'rows')
        as second_page(row_data)
    ) page),
  (select count(*)::int from public.admin_security_identities),
  'Admin pages cover the complete identity fixture set');
select is(:'admins_page2'::jsonb ->> 'next_cursor', null,
  'Admin list terminal page has no next cursor');

-- Invitation and Session lists use descending (created_at, id) keysets.
insert into public.admin_invitations
  (issuer_principal_id, invited_email, token_hash, created_at, expires_at)
select :'admin_principal_id'::uuid,
  'task4-invite-' || n || '@colorplay.test',
  pg_catalog.sha256(pg_catalog.convert_to('task4-token-' || n, 'utf8')),
  ts, ts + interval '72 hours'
from (
  select n, now() - (n || ' minutes')::interval as ts
  from generate_series(1, 55) n
) fixtures;

select public.admin_list_invitations(null) as invitations_page1 \gset
select is(jsonb_array_length(:'invitations_page1'::jsonb -> 'rows'), 50,
  'Invitation list returns at most 50 rows');
select isnt(:'invitations_page1'::jsonb ->> 'next_cursor', null,
  'Invitation list issues a server cursor');
select public.admin_list_invitations(
  :'invitations_page1'::jsonb ->> 'next_cursor') as invitations_page2 \gset
select is(:'invitations_page2'::jsonb ->> 'outcome', 'ok',
  'Invitation list accepts its own cursor');
select is(jsonb_array_length(:'invitations_page2'::jsonb -> 'rows'), 5,
  'Invitation list second page returns the exact remaining rows');
select is((select count(*)::int
    from jsonb_array_elements(:'invitations_page1'::jsonb -> 'rows')
      as first_page(row_data)
    join jsonb_array_elements(:'invitations_page2'::jsonb -> 'rows')
      as second_page(row_data)
      on first_page.row_data ->> 'id' = second_page.row_data ->> 'id'), 0,
  'Invitation pages have no duplicate invitations');
select is((select count(distinct page.row_data ->> 'id')::int
    from (
      select row_data
      from jsonb_array_elements(:'invitations_page1'::jsonb -> 'rows')
        as first_page(row_data)
      union all
      select row_data
      from jsonb_array_elements(:'invitations_page2'::jsonb -> 'rows')
        as second_page(row_data)
    ) page),
  (select count(*)::int from public.admin_invitations),
  'Invitation pages cover the complete invitation fixture set');
select is(:'invitations_page2'::jsonb ->> 'next_cursor', null,
  'Invitation list terminal page has no next cursor');

insert into public.admin_sessions
  (id, admin_user_id, audit_principal_id, auth_session_id,
   bound_factor_id_snapshot, created_at, last_activity_at,
   last_totp_verified_at, absolute_expires_at, revoked_at, device_summary)
select md5('task4-session-' || n)::uuid,
  'aa000000-0000-0000-0000-000000000001',
  :'admin_principal_id'::uuid,
  md5('task4-auth-session-' || n)::uuid,
  'aa000000-0000-0000-0000-0000000000a1',
  ts, ts, ts, ts + interval '8 hours', ts + interval '1 minute',
  'task4-device-' || n
from (
  select n, now() - (n || ' minutes')::interval as ts
  from generate_series(1, 55) n
) fixtures;

select public.admin_list_sessions(null) as sessions_page1 \gset
select is(jsonb_array_length(:'sessions_page1'::jsonb -> 'rows'), 50,
  'Session list returns at most 50 rows');
select isnt(:'sessions_page1'::jsonb ->> 'next_cursor', null,
  'Session list issues a server cursor');
select public.admin_list_sessions(
  :'sessions_page1'::jsonb ->> 'next_cursor') as sessions_page2 \gset
select is(:'sessions_page2'::jsonb ->> 'outcome', 'ok',
  'Session list accepts its own cursor');
select is(jsonb_array_length(:'sessions_page2'::jsonb -> 'rows'), 7,
  'Session list second page returns the exact remaining rows');
select is((select count(*)::int
    from jsonb_array_elements(:'sessions_page1'::jsonb -> 'rows')
      as first_page(row_data)
    join jsonb_array_elements(:'sessions_page2'::jsonb -> 'rows')
      as second_page(row_data)
      on first_page.row_data ->> 'id' = second_page.row_data ->> 'id'), 0,
  'Session pages have no duplicate sessions');
select is((select count(distinct page.row_data ->> 'id')::int
    from (
      select row_data
      from jsonb_array_elements(:'sessions_page1'::jsonb -> 'rows')
        as first_page(row_data)
      union all
      select row_data
      from jsonb_array_elements(:'sessions_page2'::jsonb -> 'rows')
        as second_page(row_data)
    ) page),
  (select count(*)::int from public.admin_sessions),
  'Session pages cover the complete session fixture set');
select is(:'sessions_page2'::jsonb ->> 'next_cursor', null,
  'Session list terminal page has no next cursor');

select public.admin_list_sessions(
  :'admins_page1'::jsonb ->> 'next_cursor') as cross_cursor \gset
select is(:'cross_cursor'::jsonb ->> 'code', 'COLUMN_NOT_ALLOWED',
  'A cursor cannot cross access resources');
select isnt(:'cross_cursor'::jsonb ->> 'request_id', null,
  'Invalid cursor denial returns a request ID');
select is(:'cross_cursor'::jsonb ->> 'retryable', 'false',
  'Invalid cursor denial is not retryable');
select is((select count(*)::int from public.admin_audit_events
    where request_id = (:'cross_cursor'::jsonb ->> 'request_id')::uuid), 1,
  'Cursor denial request ID identifies its durable audit event');

select public.admin_list_admins('not-a-valid-cursor') as malformed_cursor \gset
select is(:'malformed_cursor'::jsonb ->> 'outcome', 'denied',
  'A malformed cursor returns a typed denial outcome');
select is(:'malformed_cursor'::jsonb ->> 'code', 'COLUMN_NOT_ALLOWED',
  'A malformed cursor returns the safe cursor denial code');
select isnt(:'malformed_cursor'::jsonb ->> 'request_id', null,
  'A malformed cursor denial returns a request ID');
select is(:'malformed_cursor'::jsonb ->> 'retryable', 'false',
  'A malformed cursor denial is not retryable');
select is((select count(*)::int from public.admin_audit_events
    where request_id = (:'malformed_cursor'::jsonb ->> 'request_id')::uuid), 1,
  'Malformed cursor request ID identifies its durable audit event');

insert into public.admin_security_operations
  (id, operation_type, target_principal_id, state, next_retry_at, created_at)
values
  (md5('task4-health-manual')::uuid, 'reset_admin_mfa',
    :'admin_principal_id'::uuid, 'stuck', null, now()),
  (md5('task4-health-oob')::uuid, 'factor_incident_isolation',
    :'admin_principal_id'::uuid, 'pending', null,
    now() - interval '1 second'),
  (md5('task4-health-pending')::uuid, 'reset_admin_mfa',
    :'admin_principal_id'::uuid, 'stuck', now(),
    now() - interval '2 seconds'),
  (md5('task4-health-claimed')::uuid, 'reset_admin_mfa',
    :'admin_principal_id'::uuid, 'stuck', null,
    now() - interval '3 seconds'),
  (md5('task4-health-reconcile')::uuid, 'reset_admin_mfa',
    :'admin_principal_id'::uuid, 'step1_complete', null,
    now() - interval '4 seconds');

update public.admin_security_operations
set manual_retry_claim_token = md5('task4-claim-token')::uuid
where id = md5('task4-health-claimed')::uuid;

select public.admin_health_summary() as health_actions \gset
select is((select operation ->> 'action_kind'
    from jsonb_array_elements(:'health_actions'::jsonb -> 'operations') operation
    where operation ->> 'id' = md5('task4-health-manual')::uuid::text),
  'manual_retry', 'A stuck reset saga exposes one-shot manual retry');
select is((select operation ->> 'action_kind'
    from jsonb_array_elements(:'health_actions'::jsonb -> 'operations') operation
    where operation ->> 'id' = md5('task4-health-oob')::uuid::text),
  'owner_oob', 'Factor incidents expose only owner OOB handling');
select is((select operation ->> 'action_kind'
    from jsonb_array_elements(:'health_actions'::jsonb -> 'operations') operation
    where operation ->> 'id' = md5('task4-health-pending')::uuid::text),
  'pending', 'An already-authorized stuck reset does not expose another action');
select is((select operation ->> 'action_kind'
    from jsonb_array_elements(:'health_actions'::jsonb -> 'operations') operation
    where operation ->> 'id' = md5('task4-health-claimed')::uuid::text),
  'pending', 'A claimed manual retry does not expose another action');
select is((select operation ->> 'action_kind'
    from jsonb_array_elements(:'health_actions'::jsonb -> 'operations') operation
    where operation ->> 'id' = md5('task4-health-reconcile')::uuid::text),
  'reconcile', 'A non-stuck reset saga exposes reconcile');

insert into public.admin_security_operations
  (operation_type, target_principal_id, state, created_at)
select 'factor_incident_isolation',
  :'admin_principal_id'::uuid, 'pending',
  now() - ((n + 10) || ' seconds')::interval
from generate_series(1, 51) n;
insert into public.admin_denial_counters
  (resource_key, safe_reason_code, window_started_at, window_ends_at, count)
select 'task4/resource/' || n, 'COLUMN_NOT_ALLOWED',
  date_trunc('hour', now()), date_trunc('hour', now()) + interval '1 hour', n
from generate_series(1, 51) n;

select public.admin_health_summary() as health_truncated \gset
select is(:'health_truncated'::jsonb ->> 'operations_truncated', 'true',
  'Health declares operation truncation');
select is(:'health_truncated'::jsonb ->> 'denials_truncated', 'true',
  'Health declares denial truncation');
select is(jsonb_array_length(:'health_truncated'::jsonb -> 'operations'), 50,
  'Health returns at most 50 operations');
select is(jsonb_array_length(:'health_truncated'::jsonb -> 'denials'), 50,
  'Health returns at most 50 denial aggregates');

select * from finish();
rollback;
