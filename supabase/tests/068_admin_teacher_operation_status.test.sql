-- Task 5A: an Admin can safely reconcile an ambiguous teacher command by the
-- command name and the client-retained idempotency key. No private saga data is
-- exposed through this read boundary.
begin;
select plan(57);

\ir helpers/admin_test_seed.psql
select pg_temp.admin_test_seed();

select audit_principal_id as admin_a_principal_id
  from public.admin_security_identities
 where admin_user_id = 'aa000000-0000-0000-0000-000000000001' \gset
select audit_principal_id as admin_b_principal_id
  from public.admin_security_identities
 where admin_user_id = 'bb000000-0000-0000-0000-000000000001' \gset

select has_function('public', 'admin_get_teacher_operation',
  array['text', 'text'],
  'teacher operation status has the exact public lookup signature');
select ok(has_function_privilege('authenticated',
  'public.admin_get_teacher_operation(text,text)', 'EXECUTE'),
  'authenticated callers can reach the guarded status lookup');
select ok(not has_function_privilege('anon',
  'public.admin_get_teacher_operation(text,text)', 'EXECUTE'),
  'anonymous callers cannot execute the status lookup directly');
select ok(not has_function_privilege('service_role',
  'public.admin_get_teacher_operation(text,text)', 'EXECUTE'),
  'service role does not bypass the active Admin read boundary');

insert into public.admin_command_executions (
  id, actor_principal_id, command_name, idempotency_key, request_hash,
  request_id, result_code, completed_at
) values
  ('68000000-0000-4000-8000-000000000001', :'admin_a_principal_id'::uuid,
   'create_teacher_account', 'status-requested', decode(repeat('01', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000001', 'TEACHER_OPERATION_PENDING', null),
  ('68000000-0000-4000-8000-000000000002', :'admin_a_principal_id'::uuid,
   'update_teacher_account', 'status-identity-reserved', decode(repeat('02', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000002', 'TEACHER_OPERATION_PENDING', null),
  ('68000000-0000-4000-8000-000000000003', :'admin_a_principal_id'::uuid,
   'reset_teacher_password', 'status-auth-applied', decode(repeat('03', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000003', 'TEACHER_OPERATION_PENDING', null),
  ('68000000-0000-4000-8000-000000000004', :'admin_a_principal_id'::uuid,
   'create_teacher_account', 'status-profile-committed', decode(repeat('04', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000004', 'TEACHER_OPERATION_PENDING', null),
  ('68000000-0000-4000-8000-000000000005', :'admin_a_principal_id'::uuid,
   'update_teacher_account', 'status-compensation-pending', decode(repeat('05', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000005', 'TEACHER_OPERATION_PENDING', null),
  ('68000000-0000-4000-8000-000000000006', :'admin_a_principal_id'::uuid,
   'reset_teacher_password', 'status-completed', decode(repeat('06', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000006', 'success', now()),
  ('68000000-0000-4000-8000-000000000007', :'admin_a_principal_id'::uuid,
   'create_teacher_account', 'status-compensated', decode(repeat('07', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000007', 'TEACHER_AUTH_UNAVAILABLE', now()),
  ('68000000-0000-4000-8000-000000000008', :'admin_a_principal_id'::uuid,
   'reset_teacher_password', 'status-reconciliation', decode(repeat('08', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000008', 'TEACHER_RECONCILIATION_REQUIRED', now()),
  ('68000000-0000-4000-8000-000000000009', :'admin_a_principal_id'::uuid,
   'update_teacher_account', 'status-terminal-denial', decode(repeat('09', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000009', 'TEACHER_ACCOUNT_INVALID', now());

insert into public.admin_command_executions (
  id, actor_principal_id, command_name, idempotency_key, request_hash,
  request_id, result_code, redacted_result_receipt, completed_at
) values (
  '68000000-0000-4000-8000-000000000010', :'admin_a_principal_id'::uuid,
  'reset_teacher_password', 'status-blocked-by-create',
  decode(repeat('10', 32), 'hex'),
  '6a000000-0000-4000-8000-000000000010', 'TEACHER_OPERATION_PENDING',
  jsonb_build_object(
    'outcome', 'denied',
    'operation_id', '69000000-0000-4000-8000-000000000001'
  ), now()
);

insert into public.admin_command_executions (
  id, actor_principal_id, command_name, idempotency_key, request_hash,
  request_id, result_code, redacted_result_receipt, completed_at
) values
  ('68000000-0000-4000-8000-000000000011', :'admin_a_principal_id'::uuid,
   'reset_teacher_password', 'status-foreign-blocked',
   decode(repeat('11', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000011', 'TEACHER_OPERATION_PENDING',
   jsonb_build_object(
     'outcome', 'denied',
     'operation_id', '69000000-0000-4000-8000-000000000013'
   ), now()),
  ('68000000-0000-4000-8000-000000000012', :'admin_b_principal_id'::uuid,
   'create_teacher_account', 'status-admin-b-open',
   decode(repeat('12', 32), 'hex'),
   '6a000000-0000-4000-8000-000000000012', 'TEACHER_OPERATION_PENDING',
   null, null);

insert into admin_private.teacher_account_operations (
  id, operation_type, state, actor_principal_id, login_account,
  command_execution_id, reconciliation_action, completed_at
) values
  ('69000000-0000-4000-8000-000000000001', 'create_teacher_account',
   'requested', :'admin_a_principal_id'::uuid, 'teacher800001',
   '68000000-0000-4000-8000-000000000001', null, null),
  ('69000000-0000-4000-8000-000000000002', 'update_teacher_account',
   'identity_reserved', :'admin_a_principal_id'::uuid, 'teacher800002',
   '68000000-0000-4000-8000-000000000002', null, null),
  ('69000000-0000-4000-8000-000000000003', 'reset_teacher_password',
   'auth_created_or_password_updated', :'admin_a_principal_id'::uuid, 'teacher800003',
   '68000000-0000-4000-8000-000000000003', null, null),
  ('69000000-0000-4000-8000-000000000004', 'create_teacher_account',
   'profile_committed', :'admin_a_principal_id'::uuid, 'teacher800004',
   '68000000-0000-4000-8000-000000000004', null, null),
  ('69000000-0000-4000-8000-000000000005', 'update_teacher_account',
   'compensation_pending', :'admin_a_principal_id'::uuid, 'teacher800005',
   '68000000-0000-4000-8000-000000000005', null, null),
  ('69000000-0000-4000-8000-000000000006', 'reset_teacher_password',
   'completed', :'admin_a_principal_id'::uuid, 'teacher800006',
   '68000000-0000-4000-8000-000000000006', null, now()),
  ('69000000-0000-4000-8000-000000000007', 'create_teacher_account',
   'compensated', :'admin_a_principal_id'::uuid, 'teacher800007',
   '68000000-0000-4000-8000-000000000007', null, now()),
  ('69000000-0000-4000-8000-000000000008', 'reset_teacher_password',
   'reconciliation_required', :'admin_a_principal_id'::uuid, 'teacher800008',
   '68000000-0000-4000-8000-000000000008',
   'close_password_reset_redacted', null);

insert into admin_private.teacher_account_operations (
  id, operation_type, state, actor_principal_id, login_account,
  command_execution_id
) values (
  '69000000-0000-4000-8000-000000000013', 'create_teacher_account',
  'requested', :'admin_b_principal_id'::uuid, 'teacher800013',
  '68000000-0000-4000-8000-000000000012'
);

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('pgtap.teacher_status',
  public.admin_get_teacher_operation(
    'create_teacher_account', 'status-requested')::text, true);
select is(current_setting('pgtap.teacher_status')::jsonb ->> 'outcome', 'ok',
  'active Admin receives a typed status result');
select is(current_setting('pgtap.teacher_status')::jsonb ->> 'operation_type',
  'create_teacher_account', 'status returns the bound create command');
select is(current_setting('pgtap.teacher_status')::jsonb ->> 'operation_id',
  '69000000-0000-4000-8000-000000000001',
  'status returns the safe operation identifier');
select is(current_setting('pgtap.teacher_status')::jsonb ->> 'request_id',
  '6a000000-0000-4000-8000-000000000001',
  'status returns the execution request identifier');
select ok(not (current_setting('pgtap.teacher_status')::jsonb ?| array[
  'requested_contact_email', 'requested_full_name', 'internal_email',
  'password', 'claim_token', 'request_hash', 'receipt_id', 'safe_error_code',
  'provider_error', 'redacted_result_receipt', 'result_code'
]), 'status omits all private, secret, receipt, and raw error fields');

select is((public.admin_get_teacher_operation(
  'create_teacher_account', 'status-requested')) ->> 'legal_follow_up',
  'wait', 'requested operations require waiting');
select is((public.admin_get_teacher_operation(
  'update_teacher_account', 'status-identity-reserved')) ->> 'legal_follow_up',
  'wait', 'identity-reserved operations require waiting');
select is((public.admin_get_teacher_operation(
  'reset_teacher_password', 'status-auth-applied')) ->> 'legal_follow_up',
  'wait', 'provider-applied operations require waiting');
select is((public.admin_get_teacher_operation(
  'create_teacher_account', 'status-profile-committed')) ->> 'legal_follow_up',
  'wait', 'profile-committed operations require waiting');
select is((public.admin_get_teacher_operation(
  'update_teacher_account', 'status-compensation-pending')) ->> 'legal_follow_up',
  'wait', 'compensation-pending operations require waiting');
select is((public.admin_get_teacher_operation(
  'reset_teacher_password', 'status-completed')) ->> 'legal_follow_up',
  'none', 'completed operations permit no mutation follow-up');
select is((public.admin_get_teacher_operation(
  'create_teacher_account', 'status-compensated')) ->> 'legal_follow_up',
  'none', 'compensated operations permit no same-key mutation replay');
select is((public.admin_get_teacher_operation(
  'reset_teacher_password', 'status-reconciliation')) ->> 'legal_follow_up',
  'health_reconciliation', 'reconciliation state routes to Health');

select is((public.admin_get_teacher_operation(
  'create_teacher_account', 'status-profile-committed')) ->> 'state',
  'profile_committed', 'create state is projected from its bound operation');
select is((public.admin_get_teacher_operation(
  'update_teacher_account', 'status-identity-reserved')) ->> 'operation_type',
  'update_teacher_account', 'update lookup cannot cross command names');
select is((public.admin_get_teacher_operation(
  'reset_teacher_password', 'status-completed')) ->> 'operation_type',
  'reset_teacher_password', 'reset lookup cannot cross command names');

select set_config('pgtap.teacher_status_unknown',
  public.admin_get_teacher_operation(
    'create_teacher_account', 'status-unknown')::text, true);
select is(current_setting('pgtap.teacher_status_unknown')::jsonb ->> 'outcome',
  'ok', 'an unknown request key returns a safe status rather than an error');
select is(current_setting('pgtap.teacher_status_unknown')::jsonb ->> 'state',
  'not_found', 'an unknown request key has the uniform not-found state');
select is(current_setting('pgtap.teacher_status_unknown')::jsonb
    ->> 'legal_follow_up', 'retry_same_request',
  'no execution row permits retry with the original request key');
select ok((current_setting('pgtap.teacher_status_unknown')::jsonb
    ->> 'operation_id') is null
  and (current_setting('pgtap.teacher_status_unknown')::jsonb
    ->> 'teacher_id') is null
  and (current_setting('pgtap.teacher_status_unknown')::jsonb
    ->> 'login_account') is null,
  'not-found status contains no operation or teacher identity');
select ok(not (current_setting('pgtap.teacher_status_unknown')::jsonb ?| array[
  'idempotency_key', 'request_hash', 'receipt_id', 'redacted_result_receipt'
]), 'not-found status never reflects the lookup key or execution internals');

select set_config('pgtap.teacher_status_terminal_denial',
  public.admin_get_teacher_operation(
    'update_teacher_account', 'status-terminal-denial')::text, true);
select is(current_setting('pgtap.teacher_status_terminal_denial')::jsonb
    ->> 'state', 'completed',
  'a terminal execution without an operation is not reported as not-found');
select is(current_setting('pgtap.teacher_status_terminal_denial')::jsonb
    ->> 'legal_follow_up', 'none',
  'a terminal denial never permits a same-key mutation retry');
select ok((current_setting('pgtap.teacher_status_terminal_denial')::jsonb
    ->> 'operation_id') is null,
  'a terminal denial does not invent an operation identifier');

select set_config('pgtap.teacher_status_blocked',
  public.admin_get_teacher_operation(
    'reset_teacher_password', 'status-blocked-by-create')::text, true);
select is(current_setting('pgtap.teacher_status_blocked')::jsonb
    ->> 'operation_id', '69000000-0000-4000-8000-000000000001',
  'a blocked command resolves its actor-owned blocking operation');
select is(current_setting('pgtap.teacher_status_blocked')::jsonb
    ->> 'operation_type', 'create_teacher_account',
  'a blocked command reports the actual blocking operation type');
select is(current_setting('pgtap.teacher_status_blocked')::jsonb
    ->> 'legal_follow_up', 'wait',
  'a blocked command follows the current blocking operation state');

select set_config('pgtap.teacher_status_foreign_blocked',
  public.admin_get_teacher_operation(
    'reset_teacher_password', 'status-foreign-blocked')::text, true);
select is(current_setting('pgtap.teacher_status_foreign_blocked')::jsonb
    ->> 'state', 'operation_pending',
  'a foreign blocking operation is reported only as anonymous pending');
select is(current_setting('pgtap.teacher_status_foreign_blocked')::jsonb
    ->> 'legal_follow_up', 'wait',
  'a foreign blocking operation never permits mutation retry');
select is(current_setting('pgtap.teacher_status_foreign_blocked')::jsonb
    ->> 'operation_type', 'reset_teacher_password',
  'anonymous pending status retains only the own attempted command');
select ok((current_setting('pgtap.teacher_status_foreign_blocked')::jsonb
    ->> 'operation_id') is null
  and (current_setting('pgtap.teacher_status_foreign_blocked')::jsonb
    ->> 'teacher_id') is null
  and (current_setting('pgtap.teacher_status_foreign_blocked')::jsonb
    ->> 'login_account') is null,
  'anonymous pending status exposes no foreign operation or teacher identity');
select ok(position('69000000-0000-4000-8000-000000000013' in
    current_setting('pgtap.teacher_status_foreign_blocked')) = 0
  and position('teacher800013' in
    current_setting('pgtap.teacher_status_foreign_blocked')) = 0,
  'anonymous pending payload contains no foreign identifier bytes');

select set_config('request.jwt.claim.sub',
  'bb000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'bb000000-0000-0000-0000-0000000000e2', true);
select set_config('pgtap.teacher_status_foreign_key_owner',
  public.admin_get_teacher_operation(
    'reset_teacher_password', 'status-foreign-blocked')::text, true);
select is(current_setting('pgtap.teacher_status_foreign_key_owner')::jsonb
    ->> 'state', 'not_found',
  'the blocking-operation owner cannot see another actor command key');
select is(current_setting('pgtap.teacher_status_foreign_key_owner')::jsonb
    ->> 'legal_follow_up', 'retry_same_request',
  'cross-actor command key remains indistinguishable from an unknown key');

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);

select set_config('request.jwt.claim.sub',
  'bb000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'bb000000-0000-0000-0000-0000000000e2', true);
select set_config('pgtap.teacher_status_cross_actor',
  public.admin_get_teacher_operation(
    'create_teacher_account', 'status-requested')::text, true);
select is(
  current_setting('pgtap.teacher_status_cross_actor')::jsonb - 'request_id',
  current_setting('pgtap.teacher_status_unknown')::jsonb - 'request_id',
  'another Admin sees the same safe result as an unknown request key');

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'aa000000-0000-0000-0000-0000000000e1', true);
select set_config('pgtap.teacher_status_invalid',
  public.admin_get_teacher_operation(
    'delete_teacher_account', 'status-requested')::text, true);
select is(current_setting('pgtap.teacher_status_invalid')::jsonb ->> 'outcome',
  'denied', 'an unsupported command receives a typed denial');
select is(current_setting('pgtap.teacher_status_invalid')::jsonb ->> 'code',
  'TEACHER_ACCOUNT_INVALID', 'unsupported command uses the safe teacher code');
select is(current_setting('pgtap.teacher_status_invalid')::jsonb ->> 'retryable',
  'false', 'unsupported command denial is not retryable');
select isnt(current_setting('pgtap.teacher_status_invalid')::jsonb
    ->> 'request_id', null, 'unsupported command denial has a request ID');
select is((select count(*)::integer from public.admin_audit_events
  where request_id = (current_setting('pgtap.teacher_status_invalid')::jsonb
    ->> 'request_id')::uuid), 1,
  'unsupported command denial request ID resolves to its audit event');

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.session_id', '', true);
select set_config('pgtap.teacher_status_anon',
  public.admin_get_teacher_operation(
    'create_teacher_account', 'status-requested')::text, true);
select is(current_setting('pgtap.teacher_status_anon')::jsonb ->> 'outcome',
  'denied', 'anonymous status lookup is denied');
select is(current_setting('pgtap.teacher_status_anon')::jsonb ->> 'code',
  'STALE_PRIVILEGED_SESSION', 'anonymous lookup uses stale-session semantics');
select is(current_setting('pgtap.teacher_status_anon')::jsonb ->> 'retryable',
  'false', 'anonymous denial is not retryable');
select is((select count(*)::integer from public.admin_audit_events
  where request_id = (current_setting('pgtap.teacher_status_anon')::jsonb
    ->> 'request_id')::uuid), 1, 'anonymous denial is audited');

select set_config('request.jwt.claim.sub',
  'cc000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id', '', true);
select set_config('pgtap.teacher_status_student',
  public.admin_get_teacher_operation(
    'create_teacher_account', 'status-requested')::text, true);
select is(current_setting('pgtap.teacher_status_student')::jsonb ->> 'outcome',
  'denied', 'non-Admin authenticated lookup is denied');
select is(current_setting('pgtap.teacher_status_student')::jsonb ->> 'code',
  'STALE_PRIVILEGED_SESSION', 'non-Admin lookup reveals no role detail');
select is(current_setting('pgtap.teacher_status_student')::jsonb ->> 'retryable',
  'false', 'non-Admin denial is not retryable');
select is((select count(*)::integer from public.admin_audit_events
  where request_id = (current_setting('pgtap.teacher_status_student')::jsonb
    ->> 'request_id')::uuid), 1, 'non-Admin denial is audited');

select set_config('request.jwt.claim.sub',
  'aa000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.session_id',
  'bb000000-0000-0000-0000-0000000000e2', true);
select set_config('pgtap.teacher_status_stale',
  public.admin_get_teacher_operation(
    'create_teacher_account', 'status-requested')::text, true);
select is(current_setting('pgtap.teacher_status_stale')::jsonb ->> 'outcome',
  'denied', 'stale Admin session lookup is denied');
select is(current_setting('pgtap.teacher_status_stale')::jsonb ->> 'code',
  'STALE_PRIVILEGED_SESSION', 'stale Admin receives the stable stale code');
select is(current_setting('pgtap.teacher_status_stale')::jsonb ->> 'retryable',
  'false', 'stale-session denial is not retryable');
select is((select count(*)::integer from public.admin_audit_events
  where request_id = (current_setting('pgtap.teacher_status_stale')::jsonb
    ->> 'request_id')::uuid), 1, 'stale-session denial is audited');

select is((select count(*)::integer from public.admin_command_executions
  where id between '68000000-0000-4000-8000-000000000001'::uuid
    and '68000000-0000-4000-8000-000000000012'::uuid), 12,
  'status reads do not mutate or duplicate command executions');

select * from finish();
rollback;
