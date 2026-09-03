-- Admin B Tasks 1-2: teacher account schema, named commands, saga state, and
-- safe read projections. Auth-provider behavior remains an integration seam.
begin;
select plan(128);

select has_column('public', 'profiles', 'contact_email',
  'profiles stores the optional Admin-managed contact email');
select col_is_null('public', 'profiles', 'contact_email',
  'contact email remains nullable');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at,
  updated_at, confirmation_token, email_change, email_change_token_new,
  recovery_token)
values ('00000000-0000-0000-0000-000000000000',
  '64000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'teacher.schema@internal.invalid', crypt('LocalOnly-Teacher1!', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '');

select lives_ok($$
  update public.profiles
     set full_name = '  ' || repeat('名', 40) || '  ',
         login_account = 'teacher99',
         role = 'teacher',
         contact_email = 'teacher@example.test'
   where id = '64000000-0000-0000-0000-000000000001'
$$, 'teacher full and display names support the approved 40-character limit');
select is((
  select full_name || '|' || display_name from public.profiles
   where id = '64000000-0000-0000-0000-000000000001'
), repeat('名', 40) || '|' || repeat('名', 40),
  'promoting a teacher synchronizes full and display names');
select throws_ok($$
  update public.profiles set display_name = '單邊改名'
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null,
  'an existing teacher cannot persist mismatched full and display names');
select throws_ok($$
  update public.profiles set full_name = null
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'a teacher must retain a non-null synchronized full name');
select throws_ok($$
  update public.profiles
     set display_name = repeat('名', 41), full_name = repeat('名', 41)
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'teacher names reject more than 40 trimmed characters');
select throws_ok($$
  update public.profiles set display_name = '   ', full_name = '   '
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'teacher names reject an empty trimmed value');
select throws_ok($$
  update public.profiles set contact_email = 'Teacher@Example.Test'
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'stored contact email must already be normalized');
select throws_ok($$
  update public.profiles set contact_email = 'not-an-email'
   where id = '64000000-0000-0000-0000-000000000001'
$$, '23514', null, 'malformed contact email is rejected');
select is((select class from public.admin_sensitivity_catalog
  where resource = 'profiles' and column_name = 'contact_email'),
  'personal', 'contact email is classified as personal');
select is((select mask_strategy from public.admin_sensitivity_catalog
  where resource = 'profiles' and column_name = 'contact_email'),
  'email_mask', 'contact email uses the approved email mask');
select ok(not exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name = 'internal_email'
), 'Auth internal email is not persisted in the public profile');

select ok(to_regclass('admin_private.teacher_login_account_seq') is not null,
  'teacher login allocation sequence exists');
select has_function('admin_private', 'reserve_teacher_account',
  array['uuid', 'text', 'text', 'uuid', 'text'],
  'Task 1 exposes an internal atomic teacher reservation helper');
select has_index('admin_private', 'teacher_account_operations',
  'teacher_account_reserved_login_idx',
  'reserved teacher login accounts have a unique index');
select ok(not has_function_privilege('anon',
  'admin_private.reserve_teacher_account(uuid,text,text,uuid,text)',
  'EXECUTE'), 'anonymous cannot call the internal reservation helper');
select ok(not has_function_privilege('authenticated',
  'admin_private.reserve_teacher_account(uuid,text,text,uuid,text)',
  'EXECUTE'), 'authenticated users cannot call the internal reservation helper');
select ok(not has_function_privilege('service_role',
  'admin_private.reserve_teacher_account(uuid,text,text,uuid,text)',
  'EXECUTE'),
  'service role must use the Task 2 named-command boundary, not the helper');

select has_column('admin_private', 'teacher_account_operations',
  'reserved_auth_user_id',
  'create reservations keep the server-generated Auth id private');
select has_column('admin_private', 'teacher_account_operations',
  'cleanup_auth_user_id',
  'create compensation durably binds the exact provider-created Auth id');
select has_index('admin_private', 'teacher_account_operations',
  'teacher_account_cleanup_auth_user_idx',
  'one provider-created Auth id cannot be claimed by two create operations');
select has_column('admin_private', 'teacher_account_operations',
  'reconciliation_action',
  'reconciliation work is selected by a DB-owned semantic action');
select has_column('admin_private', 'teacher_account_operations',
  'reconciliation_claim_token',
  'reconciliation claims use a server-generated lease token');
select has_column('admin_private', 'teacher_account_operations',
  'reconciliation_claim_expires_at',
  'reconciliation claim tokens have a bounded lease');
select has_column('admin_private', 'teacher_account_operations',
  'execution_claim_token',
  'create and reset execution use a separate server-generated fencing token');
select has_column('admin_private', 'teacher_account_operations',
  'execution_claim_expires_at',
  'execution fencing tokens have a bounded lease');
select has_column('admin_private', 'teacher_account_operations',
  'auth_call_kind',
  'provider mutation intent is durable before any Auth call');
select has_column('admin_private', 'teacher_account_operations',
  'auth_call_claim_token',
  'provider mutation intent binds the exact execution epoch');
select has_column('admin_private', 'teacher_account_operations',
  'auth_call_started_at',
  'provider mutation intent records when the uncertain call began');
select ok(not exists (
  select 1 from information_schema.columns
   where table_schema = 'admin_private'
     and table_name = 'teacher_account_operations'
     and column_name in (
       'password', 'plaintext_password', 'internal_email',
       'provider_error', 'provider_error_message')
), 'the operation table has no plaintext or raw-provider persistence field');

select has_function('public', 'create_teacher_account',
  array['uuid', 'text', 'text', 'text', 'text'],
  'create_teacher_account has the exact receipt-bound signature');
select has_function('public', 'update_teacher_account',
  array['uuid', 'text', 'text', 'text', 'text', 'uuid'],
  'update_teacher_account has the exact receipt-bound signature');
select has_function('public', 'reset_teacher_password',
  array['uuid', 'text', 'text', 'uuid'],
  'reset_teacher_password has the exact receipt-bound signature');
select is((select p.proargnames::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_teacher_account'),
  '{p_receipt_id,p_idempotency_key,p_contact_email,p_full_name,p_reason}',
  'create accepts no client-selected account, role, Auth id, or password');
select is((select p.proargnames::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_teacher_account'),
  '{p_receipt_id,p_idempotency_key,p_contact_email,p_full_name,p_reason,p_teacher_id}',
  'update accepts only its exact canonical fields and command controls');
select is((select p.proargnames::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reset_teacher_password'),
  '{p_receipt_id,p_idempotency_key,p_reason,p_teacher_id}',
  'reset accepts no client-selected password or Auth identity');

select is((select count(*)::integer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(array[
    'svc_admin_claim_teacher_account_execution',
    'svc_admin_begin_teacher_auth_call',
    'svc_admin_mark_teacher_auth_applied',
    'svc_admin_commit_teacher_profile',
    'svc_admin_complete_teacher_account_operation',
    'svc_admin_begin_teacher_create_compensation',
    'svc_admin_complete_teacher_create_compensation',
    'svc_admin_require_teacher_reconciliation',
    'svc_admin_list_teacher_reconciliation_candidates',
    'svc_admin_claim_teacher_reconciliation',
    'svc_admin_release_teacher_reconciliation',
    'svc_admin_resolve_teacher_reconciliation'
  ])), 12, 'all semantic teacher saga service functions exist');
select is((select count(*)::integer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'svc\_admin\_%teacher%' escape '\'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  0, 'anonymous and authenticated roles cannot execute teacher service seams');
select is((select count(*)::integer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any(array[
    'svc_admin_claim_teacher_account_execution',
    'svc_admin_begin_teacher_auth_call',
    'svc_admin_mark_teacher_auth_applied',
    'svc_admin_commit_teacher_profile',
    'svc_admin_complete_teacher_account_operation',
    'svc_admin_begin_teacher_create_compensation',
    'svc_admin_complete_teacher_create_compensation',
    'svc_admin_require_teacher_reconciliation',
    'svc_admin_list_teacher_reconciliation_candidates',
    'svc_admin_claim_teacher_reconciliation',
    'svc_admin_release_teacher_reconciliation',
    'svc_admin_resolve_teacher_reconciliation'
  ]) and has_function_privilege('service_role', p.oid, 'EXECUTE')),
  12, 'service role can execute every narrow teacher saga seam');
select is((select count(*)::integer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_teacher_account', 'update_teacher_account',
      'reset_teacher_password')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('service_role', p.oid, 'EXECUTE'))),
  0, 'anonymous and service roles cannot bypass the authenticated command gate');
select is((select count(*)::integer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_teacher_account', 'update_teacher_account',
      'reset_teacher_password')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  3, 'authenticated callers can reach all receipt-bound teacher commands');
select ok(not exists (
  select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
      unnest(coalesce(p.proargnames, array[]::text[])) argument_name
   where n.nspname = 'public'
     and p.proname like 'svc\_admin\_%teacher%' escape '\'
     and argument_name in ('p_state', 'p_next_state')
), 'service callers cannot choose an arbitrary operation state');

delete from auth.users
 where id = '64000000-0000-0000-0000-000000000001';

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select lives_ok($$
  insert into admin_private.teacher_account_operations (
    operation_type, state, actor_principal_id, login_account,
    requested_full_name
  ) values (
    'create_teacher_account', 'identity_reserved',
    (select audit_principal_id from public.admin_security_identities
      where admin_user_id = 'aa000000-0000-0000-0000-000000000001'),
    'teacher900001', '唯一索引測試教師'
  )
$$, 'a teacher login account can be reserved once');
select throws_ok($$
  insert into admin_private.teacher_account_operations (
    operation_type, state, actor_principal_id, login_account,
    requested_full_name
  ) values (
    'create_teacher_account', 'identity_reserved',
    (select audit_principal_id from public.admin_security_identities
      where admin_user_id = 'bb000000-0000-0000-0000-000000000001'),
    'teacher900001', '重複唯一索引測試教師'
  )
$$, '23505', null,
  'the reservation unique index rejects an exact duplicate login account');
select is((public.svc_admin_claim_teacher_account_execution(
    (select id from admin_private.teacher_account_operations
      where login_account = 'teacher900001'),
    'create_teacher_account')) ->> 'code',
  'TEACHER_RECONCILIATION_REQUIRED',
  'execution claim fails closed when an operation has no bound execution');
update admin_private.teacher_account_operations
   set state = 'reconciliation_required',
       cleanup_auth_user_id = '65000000-0000-4000-8000-000000000098',
       reconciliation_action = 'delete_cleanup_auth_user'
 where login_account = 'teacher900001';
select is((public.svc_admin_claim_teacher_reconciliation(
    (select id from admin_private.teacher_account_operations
      where login_account = 'teacher900001'),
    'create_teacher_account')) ->> 'outcome', 'skipped',
  'reconciliation cannot lease an operation with no bound execution');
update admin_private.teacher_account_operations
   set state = 'compensated',
       reconciliation_action = null,
       completed_at = now()
 where login_account = 'teacher900001';

-- Task 2 named commands use the same active Admin/session/factor fixture as
-- the Phase 1 command contract. Every request hash below is independently
-- rebuilt from the documented canonical field set.
select audit_principal_id as teacher_actor
  from public.admin_security_identities
 where admin_user_id = 'aa000000-0000-0000-0000-000000000001' \gset
select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Create: receipt consumption, execution reservation, and operation creation
-- are one transaction. Auth work begins only from the returned operation id.
select public.admin_internal_canonical_hash(jsonb_build_object(
  'contact_email', 'teacher.create@example.test',
  'full_name', '建立流程教師',
  'reason', '建立正式教師帳號供新學期使用')) as teacher_create_hash \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'create_teacher_account', 'teacher-create-1', :'teacher_create_hash'::bytea,
  'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as teacher_create_receipt \gset
select set_config('pgtap.teacher_create', public.create_teacher_account(
  :'teacher_create_receipt'::uuid, 'teacher-create-1',
  '  Teacher.Create@Example.Test  ', '  建立流程教師  ',
  '  建立正式教師帳號供新學期使用  ')::text, true);
select is(current_setting('pgtap.teacher_create')::jsonb ->> 'outcome', 'ok',
  'create reserves a durable teacher operation after receipt authorization');
select ok(not (current_setting('pgtap.teacher_create')::jsonb ?| array[
  'password', 'internal_email', 'auth_user_id', 'role'
]), 'create reservation response is redacted and has no client-forbidden field');
select is((select state::text || '|' || (reserved_auth_user_id is not null)::text
    from admin_private.teacher_account_operations
   where id = (current_setting('pgtap.teacher_create')::jsonb
     ->> 'operation_id')::uuid),
  'identity_reserved|true',
  'create persists an exact private Auth id while identity is reserved');
select is((select count(*)::integer
    from public.admin_command_executions execution
    join admin_private.teacher_account_operations operation
      on operation.command_execution_id = execution.id
   where operation.id = (current_setting('pgtap.teacher_create')::jsonb
       ->> 'operation_id')::uuid
     and execution.command_name = 'create_teacher_account'
     and execution.completed_at is null
     and execution.result_code = 'TEACHER_OPERATION_PENDING'),
  1, 'create atomically persists one incomplete execution linked to its operation');
select is((select count(*)::integer from public.admin_audit_events
   where action = 'create_teacher_account'
     and runbook_operation_id = (current_setting('pgtap.teacher_create')::jsonb
       ->> 'operation_id')::uuid
     and target_type = 'teacher_account'
     and target_principal_id is null),
  1, 'teacher command audit never places a teacher id in the Admin principal FK');

select set_config('pgtap.teacher_create_replay',
  public.svc_admin_issue_command_receipt(
    'aa000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-0000000000e1',
    'create_teacher_account', 'teacher-create-1',
    :'teacher_create_hash'::bytea,
    'aa000000-0000-0000-0000-0000000000a1', true)::text, true);
select is(current_setting('pgtap.teacher_create_replay')::jsonb
  ->> 'outcome', 'replayed',
  'same create idempotency key and hash replays the durable receipt');
select ok((current_setting('pgtap.teacher_create_replay')::jsonb
    #>> '{result,secret_replayable}')::boolean is false
  and not ((current_setting('pgtap.teacher_create_replay')::jsonb -> 'result')
    ?| array['password', 'internal_email', 'auth_user_id']),
  'pending replay is explicitly non-secret and redacted');
select is((public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'create_teacher_account', 'teacher-create-1', sha256('different'::bytea),
  'aa000000-0000-0000-0000-0000000000a1', true)) ->> 'code',
  'IDEMPOTENCY_CONFLICT',
  'same create idempotency key with a different hash fails closed');

select set_config('pgtap.teacher_create_claim',
  public.svc_admin_claim_teacher_account_execution(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account')::text, true);
select is(current_setting('pgtap.teacher_create_claim')::jsonb
    #>> '{operation,state}', 'identity_reserved',
  'service claims the exact reserved create operation');
select ok(not ((current_setting('pgtap.teacher_create_claim')::jsonb
    -> 'operation') ?| array[
      'requested_full_name', 'requested_contact_email', 'password',
      'internal_email', 'provider_error', 'idempotency_key', 'request_hash',
      'execution_claim_token', 'auth_call_claim_token'
    ]), 'execution claim exposes only the minimum operation projection');
select is((public.svc_admin_claim_teacher_account_execution(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'reset_teacher_password')) ->> 'code', 'TEACHER_ACCOUNT_INVALID',
  'execution claim rejects an operation-type mismatch');
select is((public.svc_admin_claim_teacher_account_execution(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account')) ->> 'code', 'TEACHER_OPERATION_PENDING',
  'an active execution lease excludes a second worker before Auth');
select is((public.svc_admin_claim_teacher_account_execution(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account')) ->> 'retryable', 'false',
  'active execution denial requires status lookup rather than blind retry');
update admin_private.teacher_account_operations
   set execution_claimed_at = now() - interval '2 seconds',
       execution_claim_expires_at = now() - interval '1 second'
 where id = (current_setting('pgtap.teacher_create')::jsonb
   ->> 'operation_id')::uuid;
select set_config('pgtap.teacher_create_claim_2',
  public.svc_admin_claim_teacher_account_execution(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account')::text, true);
select isnt(current_setting('pgtap.teacher_create_claim')::jsonb
    ->> 'claim_token', current_setting('pgtap.teacher_create_claim_2')::jsonb
    ->> 'claim_token',
  'lease expiry takeover rotates the execution fencing token');
select is((public.svc_admin_begin_teacher_auth_call(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim')::jsonb
      ->> 'claim_token')::uuid,
    'create_user')) ->> 'code', 'TEACHER_OPERATION_PENDING',
  'the stale worker cannot record a provider mutation after takeover');
select is((public.svc_admin_begin_teacher_auth_call(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim_2')::jsonb
      ->> 'claim_token')::uuid,
    'create_user')) ->> 'outcome', 'ok',
  'the takeover worker durably records exact create intent before Auth');
select is((public.svc_admin_mark_teacher_auth_applied(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim_2')::jsonb
      ->> 'claim_token')::uuid,
    'ffffffff-ffff-ffff-ffff-ffffffffffff')) ->> 'code',
  'TEACHER_ACCOUNT_INVALID',
  'Auth-applied transition rejects a mismatched Auth user id');
select is((select state::text
    from admin_private.teacher_account_operations
   where id = (current_setting('pgtap.teacher_create')::jsonb
     ->> 'operation_id')::uuid), 'identity_reserved',
  'a mismatched Auth id cannot advance the reserved operation');

select reserved_auth_user_id as teacher_create_auth_user
  from admin_private.teacher_account_operations
 where id = (current_setting('pgtap.teacher_create')::jsonb
   ->> 'operation_id')::uuid \gset
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, banned_until, raw_app_meta_data, raw_user_meta_data, created_at,
  updated_at, confirmation_token, email_change, email_change_token_new,
  recovery_token)
values ('00000000-0000-0000-0000-000000000000',
  :'teacher_create_auth_user'::uuid, 'authenticated', 'authenticated',
  'teacher.create@teachers.local.invalid',
  crypt('LocalOnly-ProviderPlaceholder1!', gen_salt('bf')), now(),
  now() + interval '1 hour',
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '');
select is((public.svc_admin_mark_teacher_auth_applied(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim')::jsonb
      ->> 'claim_token')::uuid,
    :'teacher_create_auth_user'::uuid)) ->> 'code',
  'TEACHER_OPERATION_PENDING',
  'a stale worker cannot mark Auth applied after a lease takeover');
select is((public.svc_admin_mark_teacher_auth_applied(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim_2')::jsonb
      ->> 'claim_token')::uuid,
    :'teacher_create_auth_user'::uuid)) ->> 'outcome',
  'ok', 'exact create operation and Auth id advance the Auth-applied step');
select is((public.svc_admin_complete_teacher_account_operation(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim_2')::jsonb
      ->> 'claim_token')::uuid)) ->> 'code', 'TEACHER_OPERATION_PENDING',
  'create cannot become terminal before its profile is committed');
select is((public.svc_admin_commit_teacher_profile(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim_2')::jsonb
      ->> 'claim_token')::uuid)) ->> 'outcome', 'ok',
  'create commits the profile while the external Auth identity remains banned');
select is((select role::text || '|' || full_name || '|' || display_name
      || '|' || contact_email || '|' || login_account
    from public.profiles where id = :'teacher_create_auth_user'::uuid),
  'teacher|建立流程教師|建立流程教師|teacher.create@example.test|'
    || (current_setting('pgtap.teacher_create')::jsonb ->> 'login_account'),
  'profile commit applies normalized account fields and synchronized names');
select is((select operation.state::text || '|'
      || (execution.completed_at is null)::text
    from admin_private.teacher_account_operations operation
    join public.admin_command_executions execution
      on execution.id = operation.command_execution_id
   where operation.id = (current_setting('pgtap.teacher_create')::jsonb
     ->> 'operation_id')::uuid),
  'profile_committed|true',
  'profile commit is durable but does not falsely terminalize the execution');
select is((public.svc_admin_begin_teacher_auth_call(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim_2')::jsonb
      ->> 'claim_token')::uuid,
    'enable_user')) ->> 'outcome', 'ok',
  'create records enable-user intent before the provider unban');
update auth.users set banned_until = null
 where id = :'teacher_create_auth_user'::uuid;
select is((public.svc_admin_complete_teacher_account_operation(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim_2')::jsonb
      ->> 'claim_token')::uuid)) ->> 'newly_completed', 'true',
  'first create terminal completion authorizes a one-time in-memory secret');
select is((public.svc_admin_complete_teacher_account_operation(
    (current_setting('pgtap.teacher_create')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_create_claim_2')::jsonb
      ->> 'claim_token')::uuid)) ->> 'code', 'TEACHER_OPERATION_PENDING',
  'terminal completion clears the claim so its old token cannot replay a secret');
select is((select count(*)::integer
    from public.admin_command_executions execution
    join admin_private.teacher_account_operations operation
      on operation.command_execution_id = execution.id
   where operation.id = (current_setting('pgtap.teacher_create')::jsonb
       ->> 'operation_id')::uuid
     and operation.state = 'completed'
     and execution.completed_at is not null),
  1, 'terminal completion updates the original execution instead of inserting another');
select ok((select execution_claim_token is null
      and execution_claimed_at is null
      and execution_claim_expires_at is null
      and auth_call_kind is null
      and auth_call_claim_token is null
      and auth_call_started_at is null
    from admin_private.teacher_account_operations
   where id = (current_setting('pgtap.teacher_create')::jsonb
     ->> 'operation_id')::uuid),
  'terminal create atomically clears execution ownership and Auth-call intent');
select ok(not exists (
  select 1
  from admin_private.teacher_account_operations operation
  join public.admin_command_executions execution
    on execution.id = operation.command_execution_id
  left join public.admin_audit_events audit
    on audit.id = execution.audit_event_id
  where operation.id = (current_setting('pgtap.teacher_create')::jsonb
      ->> 'operation_id')::uuid
    and (coalesce(execution.redacted_result_receipt::text, '')
      || coalesce(audit.before_after_redacted::text, '')
      || coalesce(audit.source_summary_redacted, '')) ~*
      '(password|internal_email|provider_error|teachers[.]local[.]invalid)'
), 'execution and audit persistence contain no password, internal Email, or provider detail');
select ok((public.svc_admin_issue_command_receipt(
    'aa000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-0000000000e1',
    'create_teacher_account', 'teacher-create-1',
    :'teacher_create_hash'::bytea,
    'aa000000-0000-0000-0000-0000000000a1', true)
    #>> '{result,secret_replayable}')::boolean is false,
  'completed create replay can never replay the one-time secret');

-- Update remains a single PostgreSQL transaction and never touches Auth.
select public.admin_internal_canonical_hash(jsonb_build_object(
  'contact_email', 'updated@example.test',
  'full_name', '更新流程教師',
  'reason', '更新教師姓名與聯絡資料供行政使用',
  'teacher_id', :'teacher_create_auth_user'::text)) as teacher_update_hash \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'update_teacher_account', 'teacher-update-1', :'teacher_update_hash'::bytea,
  'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as teacher_update_receipt \gset
select set_config('pgtap.teacher_update', public.update_teacher_account(
  :'teacher_update_receipt'::uuid, 'teacher-update-1',
  '  Updated@Example.Test  ', '  更新流程教師  ',
  '  更新教師姓名與聯絡資料供行政使用  ',
  :'teacher_create_auth_user'::uuid)::text, true);
select is(current_setting('pgtap.teacher_update')::jsonb ->> 'result',
  'updated', 'update completes its DB-only command in one transaction');
select is((select full_name || '|' || display_name || '|' || contact_email
    from public.profiles where id = :'teacher_create_auth_user'::uuid),
  '更新流程教師|更新流程教師|updated@example.test',
  'update keeps teacher names synchronized and contact Email normalized');
select is((select operation.state::text || '|'
      || (execution.completed_at is not null)::text
    from admin_private.teacher_account_operations operation
    join public.admin_command_executions execution
      on execution.id = operation.command_execution_id
   where operation.id = (current_setting('pgtap.teacher_update')::jsonb
     ->> 'operation_id')::uuid),
  'completed|true', 'update operation and original execution are both terminal');
select is((select count(*)::integer from public.admin_audit_events
   where action = 'update_teacher_account'
     and runbook_operation_id = (current_setting('pgtap.teacher_update')::jsonb
       ->> 'operation_id')::uuid
     and target_type = 'teacher_account'
     and target_principal_id is null),
  1, 'update audit keeps the teacher UUID out of the Admin principal FK');

-- Reset reconciliation deliberately closes without inventing a replacement
-- secret. The operator must issue a fresh reset after the safe closeout.
select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '教師忘記密碼需要由管理員安全重設',
  'teacher_id', :'teacher_create_auth_user'::text)) as teacher_reset_hash \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'reset_teacher_password', 'teacher-reset-1', :'teacher_reset_hash'::bytea,
  'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as teacher_reset_receipt \gset
select set_config('pgtap.teacher_reset', public.reset_teacher_password(
  :'teacher_reset_receipt'::uuid, 'teacher-reset-1',
  '  教師忘記密碼需要由管理員安全重設  ',
  :'teacher_create_auth_user'::uuid)::text, true);
select is(current_setting('pgtap.teacher_reset')::jsonb ->> 'result',
  'operation_pending', 'reset persists a pending operation before Auth mutation');
select is((select state::text || '|'
      || (reserved_auth_user_id = teacher_id)::text
    from admin_private.teacher_account_operations
   where id = (current_setting('pgtap.teacher_reset')::jsonb
     ->> 'operation_id')::uuid),
  'requested|true', 'reset binds the existing teacher Auth identity exactly');

-- A competing update/reset must bind its durable denial to the one exact open
-- operation so both the fresh response and idempotent replay remain actionable.
select public.admin_internal_canonical_hash(jsonb_build_object(
  'contact_email', 'pending@example.test',
  'full_name', '等待中教師',
  'reason', '已有密碼重設時拒絕教師資料更新',
  'teacher_id', :'teacher_create_auth_user'::text))
  as teacher_update_pending_hash \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'update_teacher_account', 'teacher-update-pending-1',
  :'teacher_update_pending_hash'::bytea,
  'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as teacher_update_pending_receipt \gset
select set_config('pgtap.teacher_update_pending', public.update_teacher_account(
  :'teacher_update_pending_receipt'::uuid, 'teacher-update-pending-1',
  'pending@example.test', '等待中教師',
  '已有密碼重設時拒絕教師資料更新',
  :'teacher_create_auth_user'::uuid)::text, true);
select is((current_setting('pgtap.teacher_update_pending')::jsonb ->> 'code')
    || '|' || (current_setting('pgtap.teacher_update_pending')::jsonb
      ->> 'operation_id'),
  'TEACHER_OPERATION_PENDING|'
    || (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id'),
  'fresh update pending denial binds the exact existing operation id');
select is((public.svc_admin_issue_command_receipt(
    'aa000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-0000000000e1',
    'update_teacher_account', 'teacher-update-pending-1',
    :'teacher_update_pending_hash'::bytea,
    'aa000000-0000-0000-0000-0000000000a1', true)
    #>> '{result,operation_id}'),
  current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id',
  'update pending replay preserves the same existing operation id');

select public.admin_internal_canonical_hash(jsonb_build_object(
  'reason', '已有密碼重設時拒絕第二次密碼重設',
  'teacher_id', :'teacher_create_auth_user'::text))
  as teacher_reset_pending_hash \gset
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'reset_teacher_password', 'teacher-reset-pending-1',
  :'teacher_reset_pending_hash'::bytea,
  'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as teacher_reset_pending_receipt \gset
select set_config('pgtap.teacher_reset_pending', public.reset_teacher_password(
  :'teacher_reset_pending_receipt'::uuid, 'teacher-reset-pending-1',
  '已有密碼重設時拒絕第二次密碼重設',
  :'teacher_create_auth_user'::uuid)::text, true);
select is((current_setting('pgtap.teacher_reset_pending')::jsonb ->> 'code')
    || '|' || (current_setting('pgtap.teacher_reset_pending')::jsonb
      ->> 'operation_id'),
  'TEACHER_OPERATION_PENDING|'
    || (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id'),
  'fresh reset pending denial binds the exact existing operation id');
select is((public.svc_admin_issue_command_receipt(
    'aa000000-0000-0000-0000-000000000001',
    'aa000000-0000-0000-0000-0000000000e1',
    'reset_teacher_password', 'teacher-reset-pending-1',
    :'teacher_reset_pending_hash'::bytea,
    'aa000000-0000-0000-0000-0000000000a1', true)
    #>> '{result,operation_id}'),
  current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id',
  'reset pending replay preserves the same existing operation id');
select is((select count(*)::integer
    from public.admin_command_executions execution
    join public.admin_audit_events audit on audit.id = execution.audit_event_id
   where execution.idempotency_key in (
       'teacher-update-pending-1', 'teacher-reset-pending-1')
     and audit.runbook_operation_id =
       (current_setting('pgtap.teacher_reset')::jsonb
         ->> 'operation_id')::uuid),
  2, 'pending denial audits bind the existing operation at insert time');
select throws_ok($$
  update public.admin_audit_events
     set runbook_operation_id = null
   where id = (
     select execution.audit_event_id
       from public.admin_command_executions execution
      where execution.idempotency_key = 'teacher-update-pending-1'
   )
$$, 'P0001', 'ADMIN_AUDIT_APPEND_ONLY',
  'pending denial audit remains append-only after operation binding');

select set_config('pgtap.teacher_reset_claim',
  public.svc_admin_claim_teacher_account_execution(
    (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id')::uuid,
    'reset_teacher_password')::text, true);
select is((public.svc_admin_begin_teacher_auth_call(
    (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id')::uuid,
    'reset_teacher_password',
    (current_setting('pgtap.teacher_reset_claim')::jsonb
      ->> 'claim_token')::uuid,
    'reset_password')) ->> 'outcome', 'ok',
  'reset durably records password-write intent before calling Auth');
update admin_private.teacher_account_operations
   set execution_claimed_at = now() - interval '2 seconds',
       execution_claim_expires_at = now() - interval '1 second'
 where id = (current_setting('pgtap.teacher_reset')::jsonb
   ->> 'operation_id')::uuid;
select set_config('pgtap.teacher_reset_claim_2',
  public.svc_admin_claim_teacher_account_execution(
    (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id')::uuid,
    'reset_teacher_password')::text, true);
select is((public.svc_admin_begin_teacher_auth_call(
    (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id')::uuid,
    'reset_teacher_password',
    (current_setting('pgtap.teacher_reset_claim_2')::jsonb
      ->> 'claim_token')::uuid,
    'reset_password')) ->> 'code', 'TEACHER_OPERATION_PENDING',
  'takeover cannot issue a second password write after prior durable intent');
select is((public.svc_admin_mark_teacher_auth_applied(
    (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id')::uuid,
    'reset_teacher_password',
    (current_setting('pgtap.teacher_reset_claim')::jsonb
      ->> 'claim_token')::uuid,
    :'teacher_create_auth_user'::uuid)) ->> 'code',
  'TEACHER_OPERATION_PENDING',
  'late old worker cannot mark its uncertain password write after takeover');
select is((public.svc_admin_require_teacher_reconciliation(
    (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id')::uuid,
    'reset_teacher_password', 'TEACHER_RECONCILIATION_REQUIRED',
    (current_setting('pgtap.teacher_reset_claim_2')::jsonb
      ->> 'claim_token')::uuid)) ->> 'outcome',
  'ok', 'expired-after-start reset enters redacted reconciliation');
select is((select state::text || '|'
      || (execution_claim_token is null)::text || '|' || auth_call_kind
    from admin_private.teacher_account_operations
   where id = (current_setting('pgtap.teacher_reset')::jsonb
     ->> 'operation_id')::uuid),
  'reconciliation_required|true|reset_password',
  'uncertain reset clears execution ownership but preserves OOB intent evidence');
select ok((select execution.redacted_result_receipt
        ?& array['outcome', 'code', 'message', 'request_id', 'retryable']
      and exists (
        select 1 from public.admin_audit_events audit
         where audit.action = 'teacher_reconciliation_required'
           and audit.runbook_operation_id = operation.id
           and audit.request_id::text
             = execution.redacted_result_receipt ->> 'request_id'
      )
    from admin_private.teacher_account_operations operation
    join public.admin_command_executions execution
      on execution.id = operation.command_execution_id
   where operation.id = (current_setting('pgtap.teacher_reset')::jsonb
     ->> 'operation_id')::uuid),
  'reconciliation pending receipt has a canonical durable denial envelope');
select ok(not exists (
    select 1 from jsonb_array_elements(
      public.svc_admin_list_teacher_reconciliation_candidates(20)
        -> 'operations') candidate
     where candidate ->> 'operation_id'
       = (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id')
  ), 'expired-after-start reset is quarantined from automatic reconciliation');
select is((public.svc_admin_claim_teacher_reconciliation(
    (current_setting('pgtap.teacher_reset')::jsonb ->> 'operation_id')::uuid,
    'reset_teacher_password')) ->> 'outcome', 'skipped',
  'manual-only uncertain reset cannot be auto-claimed or falsely closed');

-- Create cleanup is separately state-gated and verifies exact Auth deletion
-- before it can report compensation complete.
select public.svc_admin_issue_command_receipt(
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-0000000000e1',
  'create_teacher_account', 'teacher-create-compensate',
  public.admin_internal_canonical_hash(jsonb_build_object(
    'contact_email', null, 'full_name', '補償流程教師',
    'reason', '驗證建立失敗時只清理精確身分')),
  'aa000000-0000-0000-0000-0000000000a1', true
) ->> 'receipt_id' as teacher_comp_receipt \gset
select set_config('pgtap.teacher_comp', public.create_teacher_account(
  :'teacher_comp_receipt'::uuid, 'teacher-create-compensate', null,
  '補償流程教師', '驗證建立失敗時只清理精確身分')::text, true);
select '65000000-0000-4000-8000-000000000099'::uuid
  as teacher_comp_cleanup_user \gset
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at,
  updated_at, confirmation_token, email_change, email_change_token_new,
  recovery_token)
values ('00000000-0000-0000-0000-000000000000',
  :'teacher_comp_cleanup_user'::uuid, 'authenticated', 'authenticated',
  'teacher.comp@teachers.local.invalid',
  crypt('LocalOnly-ProviderPlaceholder2!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '');
select set_config('pgtap.teacher_comp_claim',
  public.svc_admin_claim_teacher_account_execution(
    (current_setting('pgtap.teacher_comp')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account')::text, true);
select is((public.svc_admin_begin_teacher_create_compensation(
    (current_setting('pgtap.teacher_comp')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account', 'TEACHER_AUTH_UNAVAILABLE',
    :'teacher_comp_cleanup_user'::uuid,
    (current_setting('pgtap.teacher_comp_claim')::jsonb
      ->> 'claim_token')::uuid)) ->> 'outcome',
  'ok', 'create can enter only its fixed compensation-pending transition');
select is((public.svc_admin_begin_teacher_auth_call(
    (current_setting('pgtap.teacher_comp')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account',
    (current_setting('pgtap.teacher_comp_claim')::jsonb
      ->> 'claim_token')::uuid,
    'delete_user')) ->> 'outcome', 'ok',
  'compensation records exact delete intent before Auth cleanup');
select is((select state::text from admin_private.teacher_account_operations
   where id = (current_setting('pgtap.teacher_comp')::jsonb
     ->> 'operation_id')::uuid), 'compensation_pending',
  'begin compensation durably records the cleanup requirement');
select ok((select execution.redacted_result_receipt
        ?& array['outcome', 'code', 'message', 'request_id', 'retryable']
      and exists (
        select 1 from public.admin_audit_events audit
         where audit.action = 'teacher_create_compensation_begin'
           and audit.runbook_operation_id = operation.id
           and audit.request_id::text
             = execution.redacted_result_receipt ->> 'request_id'
      )
    from admin_private.teacher_account_operations operation
    join public.admin_command_executions execution
      on execution.id = operation.command_execution_id
   where operation.id = (current_setting('pgtap.teacher_comp')::jsonb
     ->> 'operation_id')::uuid),
  'compensation pending receipt has a canonical durable denial envelope');
select is((select cleanup_auth_user_id
    from admin_private.teacher_account_operations
   where id = (current_setting('pgtap.teacher_comp')::jsonb
     ->> 'operation_id')::uuid), :'teacher_comp_cleanup_user'::uuid,
  'provider mismatch binds the actual returned-created Auth id for cleanup');
select is((public.svc_admin_complete_teacher_create_compensation(
    (current_setting('pgtap.teacher_comp')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account', 'TEACHER_AUTH_UNAVAILABLE',
    (current_setting('pgtap.teacher_comp_claim')::jsonb
      ->> 'claim_token')::uuid)) ->> 'code',
  'TEACHER_RECONCILIATION_REQUIRED',
  'compensation cannot complete while the exact Auth user still exists');
delete from auth.users where id = :'teacher_comp_cleanup_user'::uuid;
select is((public.svc_admin_complete_teacher_create_compensation(
    (current_setting('pgtap.teacher_comp')::jsonb ->> 'operation_id')::uuid,
    'create_teacher_account', 'TEACHER_AUTH_UNAVAILABLE',
    (current_setting('pgtap.teacher_comp_claim')::jsonb
      ->> 'claim_token')::uuid)) ->> 'result',
  'compensated', 'exact Auth cleanup allows create compensation to complete');
select ok((select operation.state = 'compensated'
      and execution.completed_at is not null
      and execution.result_code = 'TEACHER_AUTH_UNAVAILABLE'
      and operation.execution_claim_token is null
    from admin_private.teacher_account_operations operation
    join public.admin_command_executions execution
      on execution.id = operation.command_execution_id
   where operation.id = (current_setting('pgtap.teacher_comp')::jsonb
     ->> 'operation_id')::uuid),
  'create compensation terminalizes the original execution with a safe code');
select ok((select execution.redacted_result_receipt
        ?& array['outcome', 'code', 'message', 'request_id', 'retryable']
      and execution.redacted_result_receipt ->> 'request_id'
        = audit.request_id::text
      and execution.redacted_result_receipt ->> 'request_id'
        <> audit.id::text
      and not (execution.redacted_result_receipt ?| array[
        'password', 'internal_email', 'provider_error'])
    from admin_private.teacher_account_operations operation
    join public.admin_command_executions execution
      on execution.id = operation.command_execution_id
    join public.admin_audit_events audit on audit.id = execution.audit_event_id
   where operation.id = (current_setting('pgtap.teacher_comp')::jsonb
     ->> 'operation_id')::uuid),
  'terminal denial replay stores the canonical envelope bound to its audit request');

-- Keep the original read-projection fixture count deterministic. The command
-- tests above intentionally created a real teacher profile in this transaction.
delete from auth.users where id = :'teacher_create_auth_user'::uuid;

do $$
declare
  i integer;
  v_id uuid;
begin
  for i in 1..51 loop
    v_id := ('64' || lpad(i::text, 2, '0') || '0000-0000-0000-0000-'
      || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id,
      'authenticated', 'authenticated',
      'teacher' || lpad(i::text, 2, '0') || '@internal.invalid',
      crypt('LocalOnly-Teacher1!', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', '');
    update public.profiles
       set role = 'teacher', login_account = 'teacher' || lpad(i::text, 2, '0'),
           full_name = '教師 ' || lpad(i::text, 2, '0'),
           display_name = '教師 ' || lpad(i::text, 2, '0'),
           contact_email = case when i = 1 then 'one@example.test' else null end,
           created_at = timestamptz '2026-01-01 00:00:00+00'
             + make_interval(secs => i)
     where id = v_id;
  end loop;
end;
$$;

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('pgtap.teacher_page_1',
  public.admin_list_teachers(null, null, null)::text, true);
select is(current_setting('pgtap.teacher_page_1')::jsonb ->> 'outcome', 'ok',
  'active privileged Admin can list teachers');
select is(jsonb_array_length(
  current_setting('pgtap.teacher_page_1')::jsonb -> 'rows'), 50,
  'teacher list is capped at 50 rows');
select isnt(current_setting('pgtap.teacher_page_1')::jsonb ->> 'next_cursor',
  null, 'a server cursor is issued only when another page exists');
select ok((current_setting('pgtap.teacher_page_1')::jsonb -> 'rows' -> 0)
  ?& array['teacher_id', 'login_account', 'display_name',
    'contact_email_masked', 'contact_email_present', 'created_at',
    'operation_state'], 'teacher summary exposes the stable safe fields');
select ok(not ((current_setting('pgtap.teacher_page_1')::jsonb -> 'rows' -> 0)
  ?| array['contact_email', 'internal_email', 'password', 'auth_user_id']),
  'teacher summary excludes plaintext and Auth-only identity fields');
select is((select row ->> 'contact_email_masked'
  from jsonb_array_elements(
    current_setting('pgtap.teacher_page_1')::jsonb -> 'rows') row
  where row ->> 'login_account' = 'teacher01'), 'o****@example.test',
  'contact email is masked in list results');

select set_config('pgtap.teacher_page_2', public.admin_list_teachers(
  current_setting('pgtap.teacher_page_1')::jsonb ->> 'next_cursor',
  null, null)::text, true);
select is(current_setting('pgtap.teacher_page_2')::jsonb ->> 'outcome', 'ok',
  'server-issued cursor fetches the next page');
select is(jsonb_array_length(
  current_setting('pgtap.teacher_page_2')::jsonb -> 'rows'), 1,
  'the second page contains the remaining row');
select is(current_setting('pgtap.teacher_page_2')::jsonb ->> 'next_cursor',
  null, 'final page has no cursor');
select is((select count(*)::int from (
  select row ->> 'teacher_id' as id from jsonb_array_elements(
    current_setting('pgtap.teacher_page_1')::jsonb -> 'rows') row
  union
  select row ->> 'teacher_id' from jsonb_array_elements(
    current_setting('pgtap.teacher_page_2')::jsonb -> 'rows') row
) pages), 51, 'pagination neither duplicates nor drops a teacher');

select is(jsonb_array_length((public.admin_list_teachers(
  null, 'teacher17', null) -> 'rows')), 1,
  'search matches the login account');
select is(jsonb_array_length((public.admin_list_teachers(
  null, '教師 18', null) -> 'rows')), 1,
  'search matches the display name');
select is(jsonb_array_length((public.admin_list_teachers(
  null, 'one@example.test', null) -> 'rows')), 0,
  'search does not inspect contact email');
select is(jsonb_array_length((public.admin_list_teachers(
  null, null, 'ready') -> 'rows')), 50,
  'state filter accepts the stable ready state');
select is((public.admin_list_teachers(null, null, 'unknown')) ->> 'code',
  'TEACHER_ACCOUNT_INVALID', 'unknown teacher state fails closed');
select is((public.admin_list_teachers('not-a-cursor', null, null)) ->> 'code',
  'TEACHER_ACCOUNT_INVALID', 'malformed teacher cursor fails closed');

select set_config('pgtap.teacher_detail', public.admin_get_teacher(
  '64010000-0000-0000-0000-000000000001')::text, true);
select is(current_setting('pgtap.teacher_detail')::jsonb ->> 'outcome', 'ok',
  'active privileged Admin can read teacher detail');
select is(current_setting('pgtap.teacher_detail')::jsonb
  #>> '{teacher,contact_email_masked}', 'o****@example.test',
  'teacher detail keeps contact email masked');
select ok(not ((current_setting('pgtap.teacher_detail')::jsonb -> 'teacher')
  ?| array['contact_email', 'internal_email', 'password', 'auth_user_id']),
  'teacher detail excludes forbidden identity and secret fields');
select is((current_setting('pgtap.teacher_detail')::jsonb
  #> '{teacher,available_commands}')::jsonb,
  '["update_teacher_account", "reset_teacher_password"]'::jsonb,
  'teacher detail returns server-authorized command names');
select is((public.admin_get_teacher(
  '64000000-0000-0000-0000-00000000ffff')) ->> 'code',
  'TEACHER_ACCOUNT_INVALID', 'missing teacher uses a non-enumerating denial');

select * from finish();
rollback;
