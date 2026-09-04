-- Admin B Task 5A: safe status reconciliation for a teacher command whose
-- client response was lost. The lookup key is actor-bound and contains no
-- operation identifier that the client would have needed to receive first.

create function public.admin_get_teacher_operation(
  p_command_name text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_auth jsonb;
  v_request_id uuid := gen_random_uuid();
  v_operation_id uuid;
  v_operation_type text;
  v_state text;
  v_teacher_id uuid;
  v_login_account text;
  v_execution_request_id uuid;
  v_execution_completed_at timestamptz;
  v_execution_result_code text;
  v_redacted_result jsonb;
  v_legal_follow_up text;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'admin/teachers/operations', v_auth ->> 'code',
      'admin_get_teacher_operation', 'teacher_account',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;

  if p_command_name is null
     or p_command_name not in (
       'create_teacher_account',
       'update_teacher_account',
       'reset_teacher_password'
     )
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    return public.admin_internal_deny(
      'admin/teachers/operations', 'TEACHER_ACCOUNT_INVALID',
      'admin_get_teacher_operation', 'teacher_account', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer);
  end if;

  select execution.request_id,
         execution.completed_at,
         execution.result_code,
         execution.redacted_result_receipt,
         operation.id,
         operation.operation_type::text,
         operation.state::text,
         operation.teacher_id,
         operation.login_account
    into v_execution_request_id, v_execution_completed_at,
         v_execution_result_code, v_redacted_result, v_operation_id,
         v_operation_type, v_state, v_teacher_id, v_login_account
    from public.admin_command_executions execution
    left join admin_private.teacher_account_operations operation
      on operation.command_execution_id = execution.id
     and operation.actor_principal_id = execution.actor_principal_id
   where execution.actor_principal_id
       = (v_auth ->> 'principal_id')::uuid
     and execution.command_name = p_command_name
     and execution.idempotency_key = p_idempotency_key;

  if v_execution_request_id is null then
    return jsonb_build_object(
      'outcome', 'ok',
      'operation_id', null,
      'operation_type', p_command_name,
      'state', 'not_found',
      'teacher_id', null,
      'login_account', null,
      'legal_follow_up', 'retry_same_request',
      'request_id', v_request_id::text
    );
  end if;

  -- A rejected command can point at the already-open operation that blocked
  -- it. Resolve that private receipt link only after the exact actor/command/
  -- idempotency execution has been found. A foreign identifier is never
  -- returned; its safe pending result is handled below from the own execution.
  if v_operation_id is null
     and coalesce(v_redacted_result ->> 'operation_id', '')
       ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    select operation.id,
           operation.operation_type::text,
           operation.state::text,
           operation.teacher_id,
           operation.login_account
      into v_operation_id, v_operation_type, v_state, v_teacher_id,
           v_login_account
      from admin_private.teacher_account_operations operation
     where operation.id = (v_redacted_result ->> 'operation_id')::uuid
       and operation.actor_principal_id
         = (v_auth ->> 'principal_id')::uuid;
  end if;

  if v_operation_id is null
     and v_execution_result_code = 'TEACHER_OPERATION_PENDING' then
    return jsonb_build_object(
      'outcome', 'ok',
      'operation_id', null,
      'operation_type', p_command_name,
      'state', 'operation_pending',
      'teacher_id', null,
      'login_account', null,
      'legal_follow_up', 'wait',
      'request_id', v_execution_request_id::text
    );
  end if;

  if v_operation_id is null then
    v_operation_type := p_command_name;
    v_state := case when v_execution_completed_at is null
      then 'reconciliation_required' else 'completed' end;
  end if;

  v_legal_follow_up := case
    when v_state = 'reconciliation_required' then 'health_reconciliation'
    when v_state in ('completed', 'compensated') then 'none'
    else 'wait'
  end;

  return jsonb_build_object(
    'outcome', 'ok',
    'operation_id', v_operation_id::text,
    'operation_type', v_operation_type,
    'state', v_state,
    'teacher_id', v_teacher_id::text,
    'login_account', v_login_account,
    'legal_follow_up', v_legal_follow_up,
    'request_id', v_execution_request_id::text
  );
end;
$$;

revoke all on function public.admin_get_teacher_operation(text, text)
  from public, anon, service_role;
grant execute on function public.admin_get_teacher_operation(text, text)
  to authenticated;
