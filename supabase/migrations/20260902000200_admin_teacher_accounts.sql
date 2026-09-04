-- Admin B: Admin-managed teacher identity data and safe read projections.
-- Auth internal email and plaintext credentials intentionally have no column here.

alter table public.profiles
  add column contact_email text;

alter table public.profiles
  add constraint profiles_contact_email_normalized_check check (
    contact_email is null
    or (
      contact_email = lower(btrim(contact_email))
      and char_length(contact_email) between 3 and 254
      and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

-- ADR 0009 permits a 40-character teacher name and requires full/display names
-- to stay synchronized. The original profile constraint stopped at 30.
alter table public.profiles
  drop constraint profiles_display_name_check;
alter table public.profiles
  add constraint profiles_display_name_check check (
    char_length(btrim(display_name)) between 1 and 40
  );

-- A table-level SELECT grant would automatically expose the newly-added column.
-- Replace it with the same historical safe columns, excluding contact_email.
revoke select on public.profiles from authenticated;
grant select (
  id, display_name, role, timezone, created_at, updated_at, reduced_motion,
  active_blook_id, active_frame_id, full_name, login_account
) on public.profiles to authenticated;

create schema admin_private;
revoke all on schema admin_private from public, anon, authenticated, service_role;

-- Teachers are renamed only through the receipt-bound Admin command. Converge
-- historical rows before enforcing that its two public name projections agree.
update public.profiles
   set full_name = coalesce(nullif(btrim(full_name), ''), btrim(display_name)),
       display_name = coalesce(nullif(btrim(full_name), ''), btrim(display_name))
 where role = 'teacher';

-- Auth-created profiles begin as students and are promoted by trusted backend
-- paths. Normalize that transition so existing promotion flows satisfy the same
-- invariant without granting clients access to role or full_name.
create function admin_private.sync_teacher_names_on_promotion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_canonical_name text;
begin
  if old.role is distinct from 'teacher' and new.role = 'teacher' then
    v_canonical_name := coalesce(
      nullif(btrim(new.full_name), ''),
      btrim(new.display_name)
    );
    new.full_name := v_canonical_name;
    new.display_name := v_canonical_name;
  end if;
  return new;
end;
$$;
revoke all on function admin_private.sync_teacher_names_on_promotion()
  from public, anon, authenticated, service_role;

create trigger profiles_sync_teacher_names_on_promotion
before update of role on public.profiles
for each row execute function admin_private.sync_teacher_names_on_promotion();

alter table public.profiles
  add constraint profiles_teacher_names_synchronized_check check (
    role <> 'teacher'
    or (
      full_name is not null
      and full_name = btrim(full_name)
      and display_name = full_name
    )
  );

-- profiles.login_account is limited to 20 characters. Keep the sequence inside
-- the largest suffix that can still form "teacher" + 13 decimal digits.
create sequence admin_private.teacher_login_account_seq
  minvalue 1 maxvalue 9999999999999;
select setval(
  'admin_private.teacher_login_account_seq',
  greatest(coalesce((
    select max(substring(login_account from '^teacher([0-9]+)$')::bigint)
      from public.profiles
     where login_account ~ '^teacher[0-9]+$'
  ), 0) + 1, 1),
  false
);

create type admin_private.teacher_operation_type as enum (
  'create_teacher_account',
  'update_teacher_account',
  'reset_teacher_password'
);

create type admin_private.teacher_operation_state as enum (
  'requested',
  'identity_reserved',
  'auth_created_or_password_updated',
  'profile_committed',
  'completed',
  'compensation_pending',
  'compensated',
  'reconciliation_required'
);

create table admin_private.teacher_account_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type admin_private.teacher_operation_type not null,
  state admin_private.teacher_operation_state not null default 'requested',
  actor_principal_id uuid not null
    references public.admin_audit_principals (id),
  teacher_id uuid references public.profiles (id) on delete set null,
  -- Reserved before the Auth Admin API call so every provider-side action and
  -- compensation targets one DB-authorized UUID. It is deliberately not an
  -- auth.users FK because the row must exist before that external write.
  reserved_auth_user_id uuid,
  -- Exact Auth identity to delete during compensation. Normally this equals
  -- reserved_auth_user_id; a provider contract mismatch binds the actual
  -- returned-created UUID here before any cleanup attempt.
  cleanup_auth_user_id uuid,
  login_account text,
  requested_full_name text,
  requested_contact_email text,
  command_execution_id uuid
    references public.admin_command_executions (id),
  safe_error_code text,
  -- Execution fencing is distinct from reconciliation leasing. Only the
  -- current unexpired token may drive the create/reset saga transitions.
  execution_claim_token uuid,
  execution_claimed_at timestamptz,
  execution_claim_expires_at timestamptz,
  -- Durable provider-call intent closes the lease-expiry ambiguity window.
  -- The claim token that started the call is private evidence only and is
  -- never projected into receipts, audit metadata, logs, or browser payloads.
  auth_call_kind text,
  auth_call_claim_token uuid,
  auth_call_started_at timestamptz,
  reconciliation_action text,
  reconciliation_claim_token uuid,
  reconciliation_claimed_at timestamptz,
  reconciliation_claim_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint teacher_operation_login_shape check (
    login_account is null or login_account ~ '^teacher[0-9]{2,}$'
  ),
  constraint teacher_operation_name_shape check (
    requested_full_name is null
    or char_length(btrim(requested_full_name)) between 1 and 40
  ),
  constraint teacher_operation_contact_shape check (
    requested_contact_email is null
    or (
      requested_contact_email = lower(btrim(requested_contact_email))
      and char_length(requested_contact_email) between 3 and 254
      and requested_contact_email
        ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  constraint teacher_operation_safe_error_code_check check (
    safe_error_code is null or safe_error_code in (
      'TEACHER_ACCOUNT_INVALID',
      'TEACHER_ACCOUNT_CONFLICT',
      'TEACHER_OPERATION_PENDING',
      'TEACHER_AUTH_UNAVAILABLE',
      'TEACHER_RECONCILIATION_REQUIRED'
    )
  ),
  constraint teacher_operation_execution_claim_check check (
    (
      execution_claim_token is null
      and execution_claimed_at is null
      and execution_claim_expires_at is null
    ) or (
      execution_claim_token is not null
      and execution_claimed_at is not null
      and execution_claim_expires_at > execution_claimed_at
      and state not in ('completed', 'compensated', 'reconciliation_required')
    )
  ),
  constraint teacher_operation_auth_call_kind_check check (
    auth_call_kind is null or auth_call_kind in (
      'create_user', 'reset_password', 'enable_user', 'delete_user'
    )
  ),
  constraint teacher_operation_auth_call_intent_check check (
    (
      auth_call_kind is null
      and auth_call_claim_token is null
      and auth_call_started_at is null
    ) or (
      auth_call_kind is not null
      and auth_call_claim_token is not null
      and auth_call_started_at is not null
    )
  ),
  constraint teacher_operation_reconciliation_action_check check (
    reconciliation_action is null or reconciliation_action in (
      'delete_cleanup_auth_user',
      'close_password_reset_redacted'
    )
  ),
  constraint teacher_operation_reconciliation_type_action_check check (
    reconciliation_action is null
    or (
      operation_type = 'create_teacher_account'
      and reconciliation_action = 'delete_cleanup_auth_user'
      and cleanup_auth_user_id is not null
    )
    or (
      operation_type = 'reset_teacher_password'
      and reconciliation_action = 'close_password_reset_redacted'
    )
  ),
  constraint teacher_operation_cleanup_identity_type_check check (
    cleanup_auth_user_id is null or operation_type = 'create_teacher_account'
  ),
  constraint teacher_operation_reconciliation_state_check check (
    (state = 'reconciliation_required')
      = (reconciliation_action is not null)
  ),
  constraint teacher_operation_reconciliation_claim_check check (
    (
      reconciliation_claim_token is null
      and reconciliation_claimed_at is null
      and reconciliation_claim_expires_at is null
    ) or (
      reconciliation_claim_token is not null
      and reconciliation_claimed_at is not null
      and reconciliation_claim_expires_at > reconciliation_claimed_at
      and state = 'reconciliation_required'
    )
  )
);

create unique index teacher_account_one_open_target_idx
  on admin_private.teacher_account_operations (teacher_id)
  where teacher_id is not null
    and state not in ('completed', 'compensated');
create unique index teacher_account_reserved_login_idx
  on admin_private.teacher_account_operations (login_account)
  where login_account is not null
    and operation_type = 'create_teacher_account';
create unique index teacher_account_reserved_auth_user_idx
  on admin_private.teacher_account_operations (reserved_auth_user_id)
  where reserved_auth_user_id is not null
    and operation_type = 'create_teacher_account';
create unique index teacher_account_cleanup_auth_user_idx
  on admin_private.teacher_account_operations (cleanup_auth_user_id)
  where cleanup_auth_user_id is not null
    and operation_type = 'create_teacher_account';
create unique index teacher_account_command_execution_idx
  on admin_private.teacher_account_operations (command_execution_id)
  where command_execution_id is not null;
create index teacher_account_operation_target_created_idx
  on admin_private.teacher_account_operations (teacher_id, created_at desc);

revoke all on admin_private.teacher_account_operations
  from public, anon, authenticated, service_role;
revoke all on sequence admin_private.teacher_login_account_seq
  from public, anon, authenticated, service_role;

-- Task 1 primitive only. Task 2's receipt-bound public command will call this
-- helper after authorization; no API role may invoke it directly. Allocation
-- and durable operation creation occur in the same PostgreSQL transaction.
create function admin_private.reserve_teacher_account(
  p_actor_principal_id uuid,
  p_requested_full_name text,
  p_requested_contact_email text,
  p_command_execution_id uuid,
  p_correlation_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_occupied_max bigint;
  v_suffix bigint;
  v_login_account text;
  v_operation_id uuid;
  v_reserved_auth_user_id uuid;
  v_constraint_name text;
begin
  -- Serialize every formal allocator. nextval itself is atomic; this lock also
  -- makes the cross-table high-water resync deterministic when transitional
  -- tooling inserted a teacherNN profile after the migration was applied.
  perform pg_advisory_xact_lock(
    hashtextextended('admin_teacher_login_account_allocation', 0)
  );

  select greatest(
    coalesce((
      select max(substring(profile.login_account
        from '^teacher([0-9]+)$')::bigint)
        from public.profiles profile
       where profile.login_account ~ '^teacher[0-9]+$'
    ), 0),
    coalesce((
      select max(substring(operation.login_account
        from '^teacher([0-9]+)$')::bigint)
        from admin_private.teacher_account_operations operation
       where operation.login_account ~ '^teacher[0-9]+$'
    ), 0)
  ) into v_occupied_max;

  v_suffix := nextval('admin_private.teacher_login_account_seq');
  if v_suffix <= v_occupied_max then
    perform setval(
      'admin_private.teacher_login_account_seq', v_occupied_max + 1, false
    );
    v_suffix := nextval('admin_private.teacher_login_account_seq');
  end if;

  loop
    -- lpad(text, 2, '0') truncates values wider than two characters. Prefix
    -- only the one-digit case so teacher100 can never collapse to teacher10.
    v_login_account := 'teacher'
      || case when v_suffix < 10 then '0' else '' end
      || v_suffix::text;

    if not exists (
      select 1 from public.profiles profile
       where profile.login_account = v_login_account
    ) and not exists (
      select 1 from admin_private.teacher_account_operations operation
       where operation.login_account = v_login_account
    ) then
      begin
        loop
          v_reserved_auth_user_id := gen_random_uuid();
          exit when not exists (
            select 1 from auth.users auth_user
             where auth_user.id = v_reserved_auth_user_id
          ) and not exists (
            select 1 from admin_private.teacher_account_operations operation
             where operation.reserved_auth_user_id = v_reserved_auth_user_id
          );
        end loop;
        insert into admin_private.teacher_account_operations (
          operation_type,
          state,
          actor_principal_id,
          reserved_auth_user_id,
          cleanup_auth_user_id,
          login_account,
          requested_full_name,
          requested_contact_email,
          command_execution_id,
          correlation_id
        ) values (
          'create_teacher_account',
          'identity_reserved',
          p_actor_principal_id,
          v_reserved_auth_user_id,
          v_reserved_auth_user_id,
          v_login_account,
          btrim(p_requested_full_name),
          nullif(lower(btrim(coalesce(p_requested_contact_email, ''))), ''),
          p_command_execution_id,
          nullif(btrim(coalesce(p_correlation_id, '')), '')
        ) returning id into v_operation_id;
      exception when unique_violation then
        get stacked diagnostics v_constraint_name = constraint_name;
        if v_constraint_name <> 'teacher_account_reserved_login_idx' then
          raise;
        end if;
        v_operation_id := null;
      end;
    end if;

    if v_operation_id is not null then
      return jsonb_build_object(
        'operation_id', v_operation_id::text,
        'login_account', v_login_account
      );
    end if;
    v_suffix := nextval('admin_private.teacher_login_account_seq');
  end loop;
end;
$$;
revoke all on function admin_private.reserve_teacher_account(
  uuid, text, text, uuid, text
) from public, anon, authenticated, service_role;

create function admin_private.teacher_safe_state(p_teacher_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
  select case latest.state
    when 'reconciliation_required' then 'reconciliation_required'
    when 'requested' then 'operation_pending'
    when 'identity_reserved' then 'operation_pending'
    when 'auth_created_or_password_updated' then 'operation_pending'
    when 'profile_committed' then 'operation_pending'
    when 'compensation_pending' then 'operation_pending'
    else 'ready'
  end
  from (select (
    select operation.state
      from admin_private.teacher_account_operations operation
     where operation.teacher_id = p_teacher_id
     -- At most one non-terminal target operation may exist. Prioritize it over
     -- random UUID tie-breaking (pgTAP and bulk callers can share one now()).
     order by
       (operation.state = 'reconciliation_required') desc,
       (operation.state not in ('completed', 'compensated')) desc,
       operation.created_at desc,
       operation.id desc
     limit 1
  ) as state) latest;
$$;
revoke all on function admin_private.teacher_safe_state(uuid)
  from public, anon, authenticated, service_role;

-- Keep the central safe-code mapping authoritative for the new stable outcomes.
create or replace function public.admin_internal_denial_retryable(p_code text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select p_code in ('SECURITY_AUDIT_UNAVAILABLE', 'TEACHER_AUTH_UNAVAILABLE');
$$;

create or replace function public.admin_internal_denial_message(p_code text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_code
    when 'STALE_PRIVILEGED_SESSION' then '特權連線已逾時或失效，請重新驗證。'
    when 'INSUFFICIENT_MFA' then '需要重新完成雙因素驗證。'
    when 'INVITATION_INVALID' then '邀請無效或已失效。'
    when 'LAST_ADMIN_PROTECTED' then '不能對最後一位有效管理員執行此操作。'
    when 'RESOURCE_NOT_ALLOWED' then '此資源不允許這項操作。'
    when 'COLUMN_NOT_ALLOWED' then '此欄位不允許這項操作。'
    when 'MFA_LOCKED' then '驗證失敗次數過多，帳號已暫時鎖定，請稍後再試。'
    when 'FACTOR_BINDING_MISMATCH' then
      '驗證器綁定異常，帳號已進入安全隔離，請聯絡負責人。'
    when 'AUTHORIZATION_RECEIPT_INVALID' then
      '授權憑據無效或已使用，請重新確認後再試。'
    when 'IDEMPOTENCY_CONFLICT' then
      '相同操作代碼已用於不同內容，請重新發起操作。'
    when 'SECURITY_OPERATION_PENDING' then '此安全作業目前無法重新觸發。'
    when 'TARGET_STATE_INVALID' then '目標目前的狀態不允許此操作，請重新確認目標。'
    when 'SECURITY_AUDIT_UNAVAILABLE' then
      '安全稽核暫時無法使用，操作已中止，請稍後再試。'
    when 'TEACHER_ACCOUNT_INVALID' then '教師帳號資料或狀態無效。'
    when 'TEACHER_ACCOUNT_CONFLICT' then '教師帳號操作與目前狀態衝突。'
    when 'TEACHER_OPERATION_PENDING' then '教師帳號已有尚未完成的安全作業。'
    when 'TEACHER_AUTH_UNAVAILABLE' then
      '帳號驗證服務暫時無法使用，請先查詢作業狀態再重試。'
    when 'TEACHER_RECONCILIATION_REQUIRED' then
      '教師帳號作業需要受控對帳，請前往系統健康頁。'
    else '操作未完成，請聯絡負責人。'
  end;
$$;

-- Task 2 command/saga helpers. No helper below accepts a requested next state:
-- callers identify one exact operation and the function owns the transition.
create function admin_private.teacher_safe_error_code(p_code text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case when p_code in (
    'TEACHER_ACCOUNT_INVALID',
    'TEACHER_ACCOUNT_CONFLICT',
    'TEACHER_OPERATION_PENDING',
    'TEACHER_AUTH_UNAVAILABLE',
    'TEACHER_RECONCILIATION_REQUIRED'
  ) then p_code else 'TEACHER_RECONCILIATION_REQUIRED' end;
$$;
revoke all on function admin_private.teacher_safe_error_code(text)
  from public, anon, authenticated, service_role;

create function admin_private.teacher_service_deny(
  p_code text,
  p_action text,
  p_operation_id uuid,
  p_correlation_id text default null
) returns jsonb
language sql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
  select public.admin_internal_service_deny(
    'service/teacher_account',
    admin_private.teacher_safe_error_code(p_code),
    p_action,
    'teacher_account_operation',
    'service',
    null,
    null,
    p_correlation_id,
    p_operation_id
  );
$$;
revoke all on function admin_private.teacher_service_deny(
  text, text, uuid, text
) from public, anon, authenticated, service_role;

-- Once a valid receipt has been consumed, every expected denial must itself be
-- replayable. This helper records a terminal execution around the canonical
-- denial envelope. Pending denials bind the exact existing open operation;
-- they never create a second target-bound operation.
create function admin_private.finalize_teacher_command_denial(
  p_gate jsonb,
  p_command_name text,
  p_idempotency_key text,
  p_request_hash bytea,
  p_receipt_id uuid,
  p_reason text,
  p_code text,
  p_operation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_denial jsonb;
  v_audit_id uuid;
  v_code text := admin_private.teacher_safe_error_code(p_code);
  v_request_id uuid;
  v_result jsonb;
begin
  if v_code = 'TEACHER_OPERATION_PENDING'
     and p_operation_id is null then
    raise exception 'pending teacher denial requires an operation id';
  end if;
  if p_operation_id is not null and not exists (
    select 1 from admin_private.teacher_account_operations operation
     where operation.id = p_operation_id
       and operation.state not in ('completed', 'compensated')
  ) then
    raise exception 'teacher denial operation id is not open';
  end if;
  v_audit_id := public.admin_internal_append_audit(
    'admin',
    (p_gate ->> 'principal_id')::uuid,
    (p_gate ->> 'session_id')::uuid,
    (p_gate ->> 'auth_session_id')::uuid,
    p_command_name,
    'admin_command',
    null,
    v_code,
    p_reason,
    (p_gate ->> 'mfa_age_seconds')::integer,
    null,
    null,
    null,
    p_operation_id
  );
  select audit.request_id into v_request_id
    from public.admin_audit_events audit
   where audit.id = v_audit_id;
  perform public.admin_internal_record_denial(
    'command/' || p_command_name, v_code
  );
  v_denial := public.admin_internal_denial_envelope(v_code, v_request_id);
  v_result := v_denial || jsonb_build_object(
    'result', 'denied',
    'secret_replayable', false
  ) || case when p_operation_id is null then '{}'::jsonb else
    jsonb_build_object('operation_id', p_operation_id::text) end;
  insert into public.admin_command_executions (
    actor_principal_id, command_name, idempotency_key, request_hash,
    receipt_id, audit_event_id, request_id, result_code,
    redacted_result_receipt, completed_at
  ) values (
    (p_gate ->> 'principal_id')::uuid, p_command_name,
    p_idempotency_key, p_request_hash, p_receipt_id, v_audit_id,
    (v_denial ->> 'request_id')::uuid,
    v_code, v_result, now()
  );
  return v_result;
end;
$$;
revoke all on function admin_private.finalize_teacher_command_denial(
  jsonb, text, text, bytea, uuid, text, text, uuid
) from public, anon, authenticated, service_role;

-- Receipt-bound create only reserves identity. Auth creation is performed by
-- the Edge adapter from the exact operation id returned here.
create function public.create_teacher_account(
  p_receipt_id uuid,
  p_idempotency_key text,
  p_contact_email text,
  p_full_name text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  v_contact text := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
  v_reason text := btrim(coalesce(p_reason, ''));
  v_request_hash bytea;
  v_gate jsonb;
  v_execution_id uuid := gen_random_uuid();
  v_request_id uuid := gen_random_uuid();
  v_reservation jsonb;
  v_operation_id uuid;
  v_login_account text;
  v_audit_id uuid;
  v_result jsonb;
begin
  if char_length(v_name) not between 1 and 40
     or char_length(v_reason) < 10
     or (v_contact is not null and (
       char_length(v_contact) not between 3 and 254
       or v_contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     )) then
    return public.admin_internal_command_deny(
      'create_teacher_account', null, 'TEACHER_ACCOUNT_INVALID', p_reason);
  end if;

  v_request_hash := public.admin_internal_canonical_hash(jsonb_build_object(
    'contact_email', v_contact,
    'full_name', v_name,
    'reason', v_reason
  ));
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'create_teacher_account', p_idempotency_key,
    v_request_hash, true
  );
  if not coalesce((v_gate ->> 'ok')::boolean, false) then
    return public.admin_internal_command_deny(
      'create_teacher_account', null, v_gate ->> 'code', p_reason);
  end if;

  insert into public.admin_command_executions (
    id, actor_principal_id, command_name, idempotency_key, request_hash,
    receipt_id, request_id, result_code
  ) values (
    v_execution_id, (v_gate ->> 'principal_id')::uuid,
    'create_teacher_account', p_idempotency_key, v_request_hash,
    p_receipt_id, v_request_id, 'TEACHER_OPERATION_PENDING'
  );

  v_reservation := admin_private.reserve_teacher_account(
    (v_gate ->> 'principal_id')::uuid,
    v_name,
    v_contact,
    v_execution_id,
    v_request_id::text
  );
  v_operation_id := (v_reservation ->> 'operation_id')::uuid;
  v_login_account := v_reservation ->> 'login_account';
  v_result := jsonb_build_object(
    'outcome', 'ok',
    'operation_id', v_operation_id::text,
    'login_account', v_login_account,
    'request_id', v_request_id::text,
    'result', 'operation_pending',
    'secret_replayable', false
  );

  v_audit_id := public.admin_internal_append_audit(
    'admin',
    (v_gate ->> 'principal_id')::uuid,
    (v_gate ->> 'session_id')::uuid,
    (v_gate ->> 'auth_session_id')::uuid,
    'create_teacher_account',
    'teacher_account',
    null,
    'TEACHER_OPERATION_PENDING',
    p_reason,
    (v_gate ->> 'mfa_age_seconds')::integer,
    jsonb_build_object(
      'requested_fields', jsonb_build_array('full_name', 'contact_email'),
      'contact_email_present', v_contact is not null
    ),
    v_request_id::text,
    null,
    v_operation_id
  );
  update public.admin_command_executions
     set audit_event_id = v_audit_id,
         redacted_result_receipt = v_result
   where id = v_execution_id;
  return v_result;
end;
$$;

-- Update is PG-only: target lock, profile mutation, terminal audit, operation,
-- and the original command execution all commit together.
create function public.update_teacher_account(
  p_receipt_id uuid,
  p_idempotency_key text,
  p_contact_email text,
  p_full_name text,
  p_reason text,
  p_teacher_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  v_contact text := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
  v_reason text := btrim(coalesce(p_reason, ''));
  v_request_hash bytea;
  v_gate jsonb;
  v_teacher public.profiles;
  v_execution_id uuid := gen_random_uuid();
  v_operation_id uuid := gen_random_uuid();
  v_existing_operation_id uuid;
  v_request_id uuid := gen_random_uuid();
  v_audit_id uuid;
  v_result jsonb;
begin
  if p_teacher_id is null
     or char_length(v_name) not between 1 and 40
     or char_length(v_reason) < 10
     or (v_contact is not null and (
       char_length(v_contact) not between 3 and 254
       or v_contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     )) then
    return public.admin_internal_command_deny(
      'update_teacher_account', null, 'TEACHER_ACCOUNT_INVALID', p_reason);
  end if;

  v_request_hash := public.admin_internal_canonical_hash(jsonb_build_object(
    'contact_email', v_contact,
    'full_name', v_name,
    'reason', v_reason,
    'teacher_id', p_teacher_id::text
  ));
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'update_teacher_account', p_idempotency_key,
    v_request_hash, true
  );
  if not coalesce((v_gate ->> 'ok')::boolean, false) then
    return public.admin_internal_command_deny(
      'update_teacher_account', null, v_gate ->> 'code', p_reason);
  end if;

  select * into v_teacher
    from public.profiles
   where id = p_teacher_id
   for update;
  if not found or v_teacher.role <> 'teacher'
     or v_teacher.login_account !~ '^teacher[0-9]{2,}$' then
    return admin_private.finalize_teacher_command_denial(
      v_gate, 'update_teacher_account', p_idempotency_key, v_request_hash,
      p_receipt_id, p_reason, 'TEACHER_ACCOUNT_INVALID');
  end if;
  select operation.id into v_existing_operation_id
    from admin_private.teacher_account_operations operation
     where operation.teacher_id = p_teacher_id
       and operation.state not in ('completed', 'compensated')
     for update;
  if v_existing_operation_id is not null then
    return admin_private.finalize_teacher_command_denial(
      v_gate, 'update_teacher_account', p_idempotency_key, v_request_hash,
      p_receipt_id, p_reason, 'TEACHER_OPERATION_PENDING',
      v_existing_operation_id);
  end if;

  insert into public.admin_command_executions (
    id, actor_principal_id, command_name, idempotency_key, request_hash,
    receipt_id, request_id, result_code
  ) values (
    v_execution_id, (v_gate ->> 'principal_id')::uuid,
    'update_teacher_account', p_idempotency_key, v_request_hash,
    p_receipt_id, v_request_id, 'TEACHER_OPERATION_PENDING'
  );
  insert into admin_private.teacher_account_operations (
    id, operation_type, state, actor_principal_id, teacher_id, login_account,
    requested_full_name, requested_contact_email, command_execution_id,
    correlation_id
  ) values (
    v_operation_id, 'update_teacher_account', 'requested',
    (v_gate ->> 'principal_id')::uuid, p_teacher_id,
    v_teacher.login_account, v_name, v_contact, v_execution_id,
    v_request_id::text
  );

  update public.profiles
     set full_name = v_name,
         display_name = v_name,
         contact_email = v_contact,
         updated_at = now()
   where id = p_teacher_id;
  v_result := jsonb_build_object(
    'outcome', 'ok',
    'operation_id', v_operation_id::text,
    'teacher_id', p_teacher_id::text,
    'login_account', v_teacher.login_account,
    'request_id', v_request_id::text,
    'result', 'updated',
    'secret_replayable', false
  );
  v_audit_id := public.admin_internal_append_audit(
    'admin',
    (v_gate ->> 'principal_id')::uuid,
    (v_gate ->> 'session_id')::uuid,
    (v_gate ->> 'auth_session_id')::uuid,
    'update_teacher_account',
    'teacher_account',
    null,
    'success',
    p_reason,
    (v_gate ->> 'mfa_age_seconds')::integer,
    jsonb_build_object(
      'full_name_changed', v_teacher.full_name is distinct from v_name,
      'contact_email_changed', v_teacher.contact_email is distinct from v_contact,
      'contact_email_before_present', v_teacher.contact_email is not null,
      'contact_email_after_present', v_contact is not null
    ),
    v_request_id::text,
    null,
    v_operation_id
  );
  update admin_private.teacher_account_operations
     set state = 'completed', updated_at = now(), completed_at = now()
   where id = v_operation_id;
  update public.admin_command_executions
     set audit_event_id = v_audit_id,
         result_code = 'success',
         redacted_result_receipt = v_result,
         completed_at = now()
   where id = v_execution_id;
  return v_result;
end;
$$;

-- Reset reserves a durable operation before the Edge adapter generates or
-- applies a password. The existing profile id is the exact Auth user id.
create function public.reset_teacher_password(
  p_receipt_id uuid,
  p_idempotency_key text,
  p_reason text,
  p_teacher_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_request_hash bytea;
  v_gate jsonb;
  v_teacher public.profiles;
  v_execution_id uuid := gen_random_uuid();
  v_operation_id uuid := gen_random_uuid();
  v_existing_operation_id uuid;
  v_request_id uuid := gen_random_uuid();
  v_audit_id uuid;
  v_result jsonb;
begin
  if p_teacher_id is null or char_length(v_reason) < 10 then
    return public.admin_internal_command_deny(
      'reset_teacher_password', null, 'TEACHER_ACCOUNT_INVALID', p_reason);
  end if;
  v_request_hash := public.admin_internal_canonical_hash(jsonb_build_object(
    'reason', v_reason,
    'teacher_id', p_teacher_id::text
  ));
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'reset_teacher_password', p_idempotency_key,
    v_request_hash, true
  );
  if not coalesce((v_gate ->> 'ok')::boolean, false) then
    return public.admin_internal_command_deny(
      'reset_teacher_password', null, v_gate ->> 'code', p_reason);
  end if;

  select * into v_teacher
    from public.profiles
   where id = p_teacher_id
   for update;
  if not found or v_teacher.role <> 'teacher'
     or v_teacher.login_account !~ '^teacher[0-9]{2,}$' then
    return admin_private.finalize_teacher_command_denial(
      v_gate, 'reset_teacher_password', p_idempotency_key, v_request_hash,
      p_receipt_id, p_reason, 'TEACHER_ACCOUNT_INVALID');
  end if;
  select operation.id into v_existing_operation_id
    from admin_private.teacher_account_operations operation
     where operation.teacher_id = p_teacher_id
       and operation.state not in ('completed', 'compensated')
     for update;
  if v_existing_operation_id is not null then
    return admin_private.finalize_teacher_command_denial(
      v_gate, 'reset_teacher_password', p_idempotency_key, v_request_hash,
      p_receipt_id, p_reason, 'TEACHER_OPERATION_PENDING',
      v_existing_operation_id);
  end if;

  insert into public.admin_command_executions (
    id, actor_principal_id, command_name, idempotency_key, request_hash,
    receipt_id, request_id, result_code
  ) values (
    v_execution_id, (v_gate ->> 'principal_id')::uuid,
    'reset_teacher_password', p_idempotency_key, v_request_hash,
    p_receipt_id, v_request_id, 'TEACHER_OPERATION_PENDING'
  );
  insert into admin_private.teacher_account_operations (
    id, operation_type, state, actor_principal_id, teacher_id,
    reserved_auth_user_id, login_account, command_execution_id,
    correlation_id
  ) values (
    v_operation_id, 'reset_teacher_password', 'requested',
    (v_gate ->> 'principal_id')::uuid, p_teacher_id, p_teacher_id,
    v_teacher.login_account, v_execution_id, v_request_id::text
  );
  v_result := jsonb_build_object(
    'outcome', 'ok',
    'operation_id', v_operation_id::text,
    'teacher_id', p_teacher_id::text,
    'login_account', v_teacher.login_account,
    'request_id', v_request_id::text,
    'result', 'operation_pending',
    'secret_replayable', false
  );
  v_audit_id := public.admin_internal_append_audit(
    'admin',
    (v_gate ->> 'principal_id')::uuid,
    (v_gate ->> 'session_id')::uuid,
    (v_gate ->> 'auth_session_id')::uuid,
    'reset_teacher_password',
    'teacher_account',
    null,
    'TEACHER_OPERATION_PENDING',
    p_reason,
    (v_gate ->> 'mfa_age_seconds')::integer,
    jsonb_build_object('password_change_requested', true),
    v_request_id::text,
    null,
    v_operation_id
  );
  update public.admin_command_executions
     set audit_event_id = v_audit_id,
         redacted_result_receipt = v_result
   where id = v_execution_id;
  return v_result;
end;
$$;

revoke all on function public.create_teacher_account(
  uuid, text, text, text, text
) from public, anon, service_role;
revoke all on function public.update_teacher_account(
  uuid, text, text, text, text, uuid
) from public, anon, service_role;
revoke all on function public.reset_teacher_password(
  uuid, text, text, uuid
) from public, anon, service_role;
grant execute on function public.create_teacher_account(
  uuid, text, text, text, text
) to authenticated;
grant execute on function public.update_teacher_account(
  uuid, text, text, text, text, uuid
) to authenticated;
grant execute on function public.reset_teacher_password(
  uuid, text, text, uuid
) to authenticated;

-- Atomically acquire the execution lease and return the minimum projection
-- required by Edge. A still-active owner gets a durable typed denial; an
-- expired lease is replaced with a fresh unpredictable fencing token.
create function public.svc_admin_claim_teacher_account_execution(
  p_operation_id uuid,
  p_expected_operation_type text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_redacted_result jsonb;
  v_claim_token uuid;
begin
  select * into v_operation
    from admin_private.teacher_account_operations operation
   where operation.id = p_operation_id
   for update;
  if not found
     or p_expected_operation_type is null
     or p_expected_operation_type not in (
       'create_teacher_account', 'reset_teacher_password')
     or v_operation.operation_type::text is distinct from p_expected_operation_type
  then
    return admin_private.teacher_service_deny(
      'TEACHER_ACCOUNT_INVALID', 'teacher_execution_claim', p_operation_id,
      v_operation.correlation_id);
  end if;
  select execution.redacted_result_receipt into v_redacted_result
    from public.admin_command_executions execution
   where execution.id = v_operation.command_execution_id
     and execution.actor_principal_id = v_operation.actor_principal_id
     and execution.command_name = v_operation.operation_type::text
     and execution.request_id::text = v_operation.correlation_id;
  if not found then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED', 'teacher_execution_claim',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.state in (
    'completed', 'compensated', 'reconciliation_required'
  ) then
    return jsonb_build_object(
      'outcome', 'ok',
      'claim_status', 'terminal',
      'claim_token', null,
      'operation', jsonb_build_object(
        'operation_id', v_operation.id::text,
        'operation_type', v_operation.operation_type::text,
        'state', v_operation.state::text,
        'reserved_auth_user_id', v_operation.reserved_auth_user_id::text,
        'cleanup_auth_user_id', v_operation.cleanup_auth_user_id::text,
        'teacher_id', v_operation.teacher_id::text,
        'login_account', v_operation.login_account,
        'auth_call_kind', v_operation.auth_call_kind,
        'reconciliation_action', v_operation.reconciliation_action,
        'redacted_result', coalesce(v_redacted_result, '{}'::jsonb)
      )
    );
  end if;
  if v_operation.execution_claim_token is not null
     and v_operation.execution_claim_expires_at > now()
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_execution_claim', p_operation_id,
      v_operation.correlation_id
    ) || jsonb_build_object('operation_id', v_operation.id::text);
  end if;
  v_claim_token := gen_random_uuid();
  update admin_private.teacher_account_operations
     set execution_claim_token = v_claim_token,
         execution_claimed_at = now(),
         execution_claim_expires_at = now() + interval '60 seconds',
         updated_at = now()
   where id = v_operation.id
   returning * into v_operation;
  return jsonb_build_object(
    'outcome', 'ok',
    'claim_status', 'acquired',
    'claim_token', v_claim_token::text,
    'claim_expires_at', v_operation.execution_claim_expires_at,
    'operation', jsonb_build_object(
      'operation_id', v_operation.id::text,
      'operation_type', v_operation.operation_type::text,
      'state', v_operation.state::text,
      'reserved_auth_user_id', v_operation.reserved_auth_user_id::text,
      'cleanup_auth_user_id', v_operation.cleanup_auth_user_id::text,
      'teacher_id', v_operation.teacher_id::text,
      'login_account', v_operation.login_account,
      'auth_call_kind', v_operation.auth_call_kind,
      'reconciliation_action', v_operation.reconciliation_action,
      'redacted_result', coalesce(v_redacted_result, '{}'::jsonb)
    )
  );
end;
$$;

-- Record provider-side mutation intent before the Auth Admin API is called.
-- A takeover that sees an old intent must reconcile it; it may not issue a
-- second reset/create blindly merely because the execution lease expired.
create function public.svc_admin_begin_teacher_auth_call(
  p_operation_id uuid,
  p_expected_operation_type text,
  p_execution_claim_token uuid,
  p_auth_call_kind text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_allowed boolean;
begin
  select * into v_operation
    from admin_private.teacher_account_operations operation
   where operation.id = p_operation_id
   for update;
  if not found
     or p_expected_operation_type is null
     or p_expected_operation_type not in (
       'create_teacher_account', 'reset_teacher_password')
     or v_operation.operation_type::text is distinct from p_expected_operation_type
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_auth_call_begin', p_operation_id,
      v_operation.correlation_id);
  end if;
  if v_operation.execution_claim_token is distinct from p_execution_claim_token
     or v_operation.execution_claim_expires_at is null
     or v_operation.execution_claim_expires_at <= now()
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_auth_call_begin',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.auth_call_kind = p_auth_call_kind
     and v_operation.auth_call_claim_token = p_execution_claim_token then
    update admin_private.teacher_account_operations
       set execution_claim_expires_at = now() + interval '60 seconds',
           updated_at = now()
     where id = v_operation.id;
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  v_allowed := case p_auth_call_kind
    when 'create_user' then
      v_operation.operation_type = 'create_teacher_account'
      and v_operation.state = 'identity_reserved'
      and v_operation.auth_call_kind is null
    when 'reset_password' then
      v_operation.operation_type = 'reset_teacher_password'
      and v_operation.state = 'requested'
      and v_operation.auth_call_kind is null
    when 'enable_user' then
      v_operation.operation_type = 'create_teacher_account'
      and v_operation.state = 'profile_committed'
      and v_operation.auth_call_kind is null
    when 'delete_user' then
      v_operation.operation_type = 'create_teacher_account'
      and v_operation.state = 'compensation_pending'
      and (
        v_operation.auth_call_kind is null
        or v_operation.auth_call_kind = 'delete_user'
      )
    else false
  end;
  if not coalesce(v_allowed, false) then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_auth_call_begin', p_operation_id,
      v_operation.correlation_id);
  end if;
  update admin_private.teacher_account_operations
     set auth_call_kind = p_auth_call_kind,
         auth_call_claim_token = p_execution_claim_token,
         auth_call_started_at = now(),
         execution_claim_expires_at = now() + interval '60 seconds',
         updated_at = now()
   where id = v_operation.id;
  return jsonb_build_object('outcome', 'ok', 'idempotent', false);
end;
$$;

create function public.svc_admin_mark_teacher_auth_applied(
  p_operation_id uuid,
  p_expected_operation_type text,
  p_execution_claim_token uuid,
  p_auth_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_expected_state admin_private.teacher_operation_state;
  v_expected_auth_call_kind text;
begin
  select * into v_operation
    from admin_private.teacher_account_operations operation
   where operation.id = p_operation_id
   for update;
  if not found
     or p_expected_operation_type is null
     or p_expected_operation_type not in (
       'create_teacher_account', 'reset_teacher_password')
     or v_operation.operation_type::text is distinct from p_expected_operation_type
     or v_operation.reserved_auth_user_id is distinct from p_auth_user_id
     or not exists (
       select 1
         from auth.users auth_user
        where auth_user.id = p_auth_user_id
          and (
            v_operation.operation_type = 'reset_teacher_password'
            or auth_user.banned_until > now()
          )
     )
  then
    return admin_private.teacher_service_deny(
      'TEACHER_ACCOUNT_INVALID', 'teacher_auth_applied', p_operation_id,
      v_operation.correlation_id);
  end if;
  if v_operation.execution_claim_token is distinct from p_execution_claim_token
     or v_operation.execution_claim_expires_at is null
     or v_operation.execution_claim_expires_at <= now()
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_auth_applied', p_operation_id,
      v_operation.correlation_id);
  end if;
  v_expected_state := case v_operation.operation_type
    when 'create_teacher_account' then 'identity_reserved'
    when 'reset_teacher_password' then 'requested'
    else null
  end;
  v_expected_auth_call_kind := case v_operation.operation_type
    when 'create_teacher_account' then 'create_user'
    when 'reset_teacher_password' then 'reset_password'
    else null
  end;
  if v_operation.state = 'auth_created_or_password_updated' then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  if v_operation.state is distinct from v_expected_state then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_auth_applied', p_operation_id,
      v_operation.correlation_id);
  end if;
  if v_operation.auth_call_claim_token is distinct from p_execution_claim_token
     or v_operation.auth_call_kind is distinct from v_expected_auth_call_kind
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_auth_applied', p_operation_id,
      v_operation.correlation_id);
  end if;
  update admin_private.teacher_account_operations
     set state = 'auth_created_or_password_updated',
         auth_call_kind = null,
         auth_call_claim_token = null,
         auth_call_started_at = null,
         execution_claim_expires_at = now() + interval '60 seconds',
         attempt_count = attempt_count + 1,
         updated_at = now()
   where id = p_operation_id;
  return jsonb_build_object('outcome', 'ok', 'idempotent', false);
end;
$$;

-- Create profile commit is a separate durable step. Edge keeps the newly
-- created Auth user banned until this transition succeeds.
create function public.svc_admin_commit_teacher_profile(
  p_operation_id uuid,
  p_expected_operation_type text,
  p_execution_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_profile public.profiles;
begin
  select * into v_operation
    from admin_private.teacher_account_operations operation
   where operation.id = p_operation_id
   for update;
  if not found
     or p_expected_operation_type is distinct from 'create_teacher_account'
     or v_operation.operation_type <> 'create_teacher_account'
  then
    return admin_private.teacher_service_deny(
      'TEACHER_ACCOUNT_INVALID', 'teacher_profile_commit', p_operation_id,
      v_operation.correlation_id);
  end if;
  if v_operation.execution_claim_token is distinct from p_execution_claim_token
     or v_operation.execution_claim_expires_at is null
     or v_operation.execution_claim_expires_at <= now()
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_profile_commit', p_operation_id,
      v_operation.correlation_id);
  end if;
  if v_operation.state in ('profile_committed', 'completed') then
    return jsonb_build_object(
      'outcome', 'ok',
      'idempotent', true,
      'operation_id', v_operation.id::text,
      'teacher_id', v_operation.teacher_id::text,
      'login_account', v_operation.login_account,
      'result', 'profile_committed',
      'secret_replayable', false
    );
  end if;
  if v_operation.state <> 'auth_created_or_password_updated'
     or v_operation.reserved_auth_user_id is null
     or v_operation.login_account is null
     or v_operation.requested_full_name is null
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_profile_commit', p_operation_id,
      v_operation.correlation_id);
  end if;

  if not exists (
    select 1
      from auth.users auth_user
     where auth_user.id = v_operation.reserved_auth_user_id
       and auth_user.banned_until > now()
  ) then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED', 'teacher_profile_commit',
      p_operation_id, v_operation.correlation_id);
  end if;

  select * into v_profile
    from public.profiles profile
   where profile.id = v_operation.reserved_auth_user_id
   for update;
  if not found
     or v_profile.role <> 'student'
     or v_profile.login_account is not null
  then
    return admin_private.teacher_service_deny(
      'TEACHER_ACCOUNT_INVALID', 'teacher_profile_commit', p_operation_id,
      v_operation.correlation_id);
  end if;

  update public.profiles
     set role = 'teacher',
         full_name = v_operation.requested_full_name,
         display_name = v_operation.requested_full_name,
         login_account = v_operation.login_account,
         contact_email = v_operation.requested_contact_email,
         updated_at = now()
   where id = v_operation.reserved_auth_user_id;
  update admin_private.teacher_account_operations
     set teacher_id = reserved_auth_user_id,
         state = 'profile_committed',
         execution_claim_expires_at = now() + interval '60 seconds',
         updated_at = now()
   where id = p_operation_id;
  perform public.admin_internal_append_audit(
    'service', null, null, null,
    'teacher_profile_committed', 'teacher_account', null, 'success',
    null, null,
    jsonb_build_object('profile_committed', true),
    v_operation.correlation_id, null, p_operation_id
  );
  return jsonb_build_object(
    'outcome', 'ok',
    'idempotent', false,
    'operation_id', v_operation.id::text,
    'teacher_id', v_operation.reserved_auth_user_id::text,
    'login_account', v_operation.login_account,
    'result', 'profile_committed',
    'secret_replayable', false
  );
end;
$$;

-- Terminal create/reset transition. `newly_completed` is the only authority
-- Edge may use to attach the in-memory one-time password to this response.
create function public.svc_admin_complete_teacher_account_operation(
  p_operation_id uuid,
  p_expected_operation_type text,
  p_execution_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_execution public.admin_command_executions;
  v_intent public.admin_audit_events;
  v_audit_id uuid;
  v_result jsonb;
  v_terminal_result text;
begin
  select * into v_operation
    from admin_private.teacher_account_operations operation
   where operation.id = p_operation_id
   for update;
  if not found
     or p_expected_operation_type is null
     or p_expected_operation_type not in (
       'create_teacher_account', 'reset_teacher_password')
     or v_operation.operation_type::text is distinct from p_expected_operation_type
  then
    return admin_private.teacher_service_deny(
      'TEACHER_ACCOUNT_INVALID', 'teacher_operation_complete', p_operation_id,
      v_operation.correlation_id);
  end if;
  if v_operation.execution_claim_token is distinct from p_execution_claim_token
     or v_operation.execution_claim_expires_at is null
     or v_operation.execution_claim_expires_at <= now()
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_operation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  select * into v_execution
    from public.admin_command_executions execution
   where execution.id = v_operation.command_execution_id
     and execution.actor_principal_id = v_operation.actor_principal_id
     and execution.command_name = v_operation.operation_type::text
     and execution.request_id::text = v_operation.correlation_id
   for update;
  if not found then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED', 'teacher_operation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.state = 'completed' and v_execution.completed_at is not null then
    return coalesce(v_execution.redacted_result_receipt, '{}'::jsonb)
      || jsonb_build_object('newly_completed', false);
  end if;
  if (v_operation.operation_type = 'create_teacher_account'
       and v_operation.state <> 'profile_committed')
     or (v_operation.operation_type = 'reset_teacher_password'
       and v_operation.state <> 'auth_created_or_password_updated')
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_operation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;

  if v_operation.reserved_auth_user_id is null
     or v_operation.teacher_id is distinct from v_operation.reserved_auth_user_id
     or not exists (
       select 1
         from auth.users auth_user
        where auth_user.id = v_operation.reserved_auth_user_id
     )
     or not exists (
       select 1
         from public.profiles profile
        where profile.id = v_operation.reserved_auth_user_id
          and profile.role = 'teacher'
          and profile.login_account = v_operation.login_account
          and profile.full_name = profile.display_name
          and (
            v_operation.operation_type = 'reset_teacher_password'
            or (
              profile.full_name = v_operation.requested_full_name
              and profile.contact_email is not distinct from
                v_operation.requested_contact_email
            )
          )
     )
  then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED', 'teacher_operation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.operation_type = 'create_teacher_account'
     and (
       v_operation.auth_call_kind is distinct from 'enable_user'
       or v_operation.auth_call_claim_token is distinct from
         p_execution_claim_token
     )
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_operation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.operation_type = 'reset_teacher_password'
     and v_operation.auth_call_kind is not null
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_operation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.operation_type = 'create_teacher_account'
     and exists (
       select 1
         from auth.users auth_user
        where auth_user.id = v_operation.reserved_auth_user_id
          and auth_user.banned_until > now()
     )
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_operation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;

  select * into v_intent
    from public.admin_audit_events audit
   where audit.id = v_execution.audit_event_id;
  if not found then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED', 'teacher_operation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  v_terminal_result := case v_operation.operation_type
    when 'create_teacher_account' then 'created'
    when 'reset_teacher_password' then 'password_reset'
  end;
  v_result := jsonb_build_object(
    'outcome', 'ok',
    'operation_id', v_operation.id::text,
    'teacher_id', v_operation.teacher_id::text,
    'login_account', v_operation.login_account,
    'request_id', v_execution.request_id::text,
    'result', v_terminal_result,
    'secret_replayable', false
  );
  v_audit_id := public.admin_internal_append_audit(
    'admin', v_operation.actor_principal_id,
    v_intent.admin_session_id, v_intent.auth_session_id,
    v_operation.operation_type::text, 'teacher_account', null, 'success',
    v_intent.reason_or_purpose_redacted, v_intent.mfa_age_seconds,
    case v_operation.operation_type
      when 'create_teacher_account' then
        jsonb_build_object('account_created', true)
      else jsonb_build_object('password_changed', true)
    end,
    v_operation.correlation_id, null, v_operation.id
  );
  update admin_private.teacher_account_operations
     set state = 'completed',
         safe_error_code = null,
         reconciliation_action = null,
         reconciliation_claim_token = null,
         reconciliation_claimed_at = null,
         reconciliation_claim_expires_at = null,
         execution_claim_token = null,
         execution_claimed_at = null,
         execution_claim_expires_at = null,
         auth_call_kind = null,
         auth_call_claim_token = null,
         auth_call_started_at = null,
         updated_at = now(),
         completed_at = now()
   where id = v_operation.id;
  update public.admin_command_executions
     set audit_event_id = v_audit_id,
         result_code = 'success',
         redacted_result_receipt = v_result,
         completed_at = now()
   where id = v_execution.id;
  return v_result || jsonb_build_object('newly_completed', true);
end;
$$;

create function public.svc_admin_begin_teacher_create_compensation(
  p_operation_id uuid,
  p_expected_operation_type text,
  p_safe_code text,
  p_cleanup_auth_user_id uuid,
  p_execution_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_execution public.admin_command_executions;
  v_safe_code text := admin_private.teacher_safe_error_code(p_safe_code);
  v_audit_id uuid;
  v_denial_request_id uuid;
  v_result jsonb;
begin
  select * into v_operation
    from admin_private.teacher_account_operations operation
   where operation.id = p_operation_id
   for update;
  if not found
     or p_expected_operation_type is distinct from 'create_teacher_account'
     or v_operation.operation_type <> 'create_teacher_account'
     or v_safe_code is distinct from p_safe_code
     or p_cleanup_auth_user_id is null
  then
    return admin_private.teacher_service_deny(
      'TEACHER_ACCOUNT_INVALID', 'teacher_create_compensation_begin',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.execution_claim_token is distinct from p_execution_claim_token
     or v_operation.execution_claim_expires_at is null
     or v_operation.execution_claim_expires_at <= now()
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_create_compensation_begin',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.state = 'compensation_pending'
     and v_operation.safe_error_code = v_safe_code
     and v_operation.cleanup_auth_user_id = p_cleanup_auth_user_id then
    update admin_private.teacher_account_operations
       set auth_call_kind = null,
           auth_call_claim_token = null,
           auth_call_started_at = null,
           updated_at = now()
     where id = v_operation.id
       and auth_call_claim_token is distinct from p_execution_claim_token;
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  if v_operation.state not in (
    'identity_reserved',
    'auth_created_or_password_updated',
    'profile_committed'
  ) then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_create_compensation_begin',
      p_operation_id, v_operation.correlation_id);
  end if;
  select * into v_execution
    from public.admin_command_executions execution
   where execution.id = v_operation.command_execution_id
     and execution.actor_principal_id = v_operation.actor_principal_id
     and execution.command_name = v_operation.operation_type::text
     and execution.request_id::text = v_operation.correlation_id
     and execution.completed_at is null
   for update;
  if not found then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED',
      'teacher_create_compensation_begin', p_operation_id,
      v_operation.correlation_id);
  end if;
  v_audit_id := public.admin_internal_append_audit(
    'service', null, null, null,
    'teacher_create_compensation_begin', 'teacher_account', null,
    v_safe_code, null, null,
    jsonb_build_object('compensation_pending', true),
    v_operation.correlation_id, null, v_operation.id
  );
  select request_id into v_denial_request_id
    from public.admin_audit_events where id = v_audit_id;
  v_result := public.admin_internal_denial_envelope(
    v_safe_code, v_denial_request_id
  )
    || jsonb_build_object(
    'operation_id', v_operation.id::text,
    'login_account', v_operation.login_account,
    'result', 'compensation_pending',
    'secret_replayable', false
  );
  update admin_private.teacher_account_operations
     set state = 'compensation_pending',
         safe_error_code = v_safe_code,
         cleanup_auth_user_id = p_cleanup_auth_user_id,
         reconciliation_action = null,
         reconciliation_claim_token = null,
         reconciliation_claimed_at = null,
         reconciliation_claim_expires_at = null,
         auth_call_kind = null,
         auth_call_claim_token = null,
         auth_call_started_at = null,
         execution_claim_expires_at = now() + interval '60 seconds',
         attempt_count = attempt_count + 1,
         updated_at = now()
   where id = v_operation.id;
  update public.admin_command_executions
     set result_code = v_safe_code,
         redacted_result_receipt = v_result
   where id = v_execution.id;
  return jsonb_build_object('outcome', 'ok', 'idempotent', false);
end;
$$;

create function public.svc_admin_complete_teacher_create_compensation(
  p_operation_id uuid,
  p_expected_operation_type text,
  p_safe_code text,
  p_execution_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_execution public.admin_command_executions;
  v_safe_code text := admin_private.teacher_safe_error_code(p_safe_code);
  v_audit_id uuid;
  v_denial_request_id uuid;
  v_result jsonb;
begin
  select * into v_operation
    from admin_private.teacher_account_operations operation
   where operation.id = p_operation_id
   for update;
  if not found
     or p_expected_operation_type is distinct from 'create_teacher_account'
     or v_operation.operation_type <> 'create_teacher_account'
     or v_safe_code is distinct from p_safe_code
     or v_operation.safe_error_code is distinct from v_safe_code
  then
    return admin_private.teacher_service_deny(
      'TEACHER_ACCOUNT_INVALID', 'teacher_create_compensation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.execution_claim_token is distinct from p_execution_claim_token
     or v_operation.execution_claim_expires_at is null
     or v_operation.execution_claim_expires_at <= now()
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_create_compensation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  select * into v_execution
    from public.admin_command_executions execution
   where execution.id = v_operation.command_execution_id
     and execution.actor_principal_id = v_operation.actor_principal_id
     and execution.command_name = v_operation.operation_type::text
     and execution.request_id::text = v_operation.correlation_id
   for update;
  if v_operation.state = 'compensated'
     and v_execution.completed_at is not null then
    return coalesce(v_execution.redacted_result_receipt, '{}'::jsonb)
      || jsonb_build_object('newly_completed', false);
  end if;
  if v_operation.state <> 'compensation_pending' then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_create_compensation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.auth_call_kind is not null
     and (
       v_operation.auth_call_kind is distinct from 'delete_user'
       or v_operation.auth_call_claim_token is distinct from
         p_execution_claim_token
     )
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_create_compensation_complete',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.cleanup_auth_user_id is null
     or exists (
       select 1 from auth.users auth_user
        where auth_user.id = v_operation.cleanup_auth_user_id
     )
     or (
       v_operation.reserved_auth_user_id is distinct from
         v_operation.cleanup_auth_user_id
       and exists (
         select 1 from auth.users auth_user
          where auth_user.id = v_operation.reserved_auth_user_id
       )
     )
  then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED',
      'teacher_create_compensation_complete', p_operation_id,
      v_operation.correlation_id);
  end if;
  if v_execution.id is null then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED',
      'teacher_create_compensation_complete', p_operation_id,
      v_operation.correlation_id);
  end if;
  v_audit_id := public.admin_internal_append_audit(
    'service', null, null, null,
    'teacher_create_compensation_complete', 'teacher_account', null,
    'compensated', null, null,
    jsonb_build_object('exact_auth_cleanup_confirmed', true),
    v_operation.correlation_id, null, v_operation.id
  );
  select request_id into v_denial_request_id
    from public.admin_audit_events where id = v_audit_id;
  v_result := public.admin_internal_denial_envelope(
    v_safe_code, v_denial_request_id
  )
    || jsonb_build_object(
      'operation_id', v_operation.id::text,
      'login_account', v_operation.login_account,
      'result', 'compensated',
      'secret_replayable', false
    );
  update admin_private.teacher_account_operations
     set state = 'compensated',
         reconciliation_action = null,
         reconciliation_claim_token = null,
         reconciliation_claimed_at = null,
         reconciliation_claim_expires_at = null,
         execution_claim_token = null,
         execution_claimed_at = null,
         execution_claim_expires_at = null,
         auth_call_kind = null,
         auth_call_claim_token = null,
         auth_call_started_at = null,
         updated_at = now(),
         completed_at = now()
   where id = v_operation.id;
  update public.admin_command_executions
     set audit_event_id = v_audit_id,
         result_code = v_safe_code,
         redacted_result_receipt = v_result,
         completed_at = now()
   where id = v_execution.id;
  return v_result || jsonb_build_object('newly_completed', false);
end;
$$;

create function public.svc_admin_require_teacher_reconciliation(
  p_operation_id uuid,
  p_expected_operation_type text,
  p_safe_code text,
  p_execution_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_execution public.admin_command_executions;
  v_safe_code text := admin_private.teacher_safe_error_code(p_safe_code);
  v_action text;
  v_audit_id uuid;
  v_denial_request_id uuid;
  v_result jsonb;
begin
  select * into v_operation
    from admin_private.teacher_account_operations operation
   where operation.id = p_operation_id
   for update;
  if not found
     or p_expected_operation_type is null
     or p_expected_operation_type not in (
       'create_teacher_account', 'reset_teacher_password')
     or v_operation.operation_type::text is distinct from p_expected_operation_type
     or v_safe_code is distinct from p_safe_code
  then
    return admin_private.teacher_service_deny(
      'TEACHER_ACCOUNT_INVALID', 'teacher_reconciliation_required',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.execution_claim_token is distinct from p_execution_claim_token
     or v_operation.execution_claim_expires_at is null
     or v_operation.execution_claim_expires_at <= now()
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_reconciliation_required',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.state = 'reconciliation_required' then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  if v_operation.state in ('completed', 'compensated') then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_reconciliation_required',
      p_operation_id, v_operation.correlation_id);
  end if;
  select * into v_execution
    from public.admin_command_executions execution
   where execution.id = v_operation.command_execution_id
     and execution.actor_principal_id = v_operation.actor_principal_id
     and execution.command_name = v_operation.operation_type::text
     and execution.request_id::text = v_operation.correlation_id
     and execution.completed_at is null
   for update;
  if not found then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED', 'teacher_reconciliation_required',
      p_operation_id, v_operation.correlation_id);
  end if;
  v_action := case v_operation.operation_type
    when 'create_teacher_account' then 'delete_cleanup_auth_user'
    when 'reset_teacher_password' then 'close_password_reset_redacted'
  end;
  if v_operation.operation_type = 'create_teacher_account'
     and v_operation.cleanup_auth_user_id is null
  then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED', 'teacher_reconciliation_required',
      p_operation_id, v_operation.correlation_id);
  end if;
  v_audit_id := public.admin_internal_append_audit(
    'service', null, null, null,
    'teacher_reconciliation_required', 'teacher_account', null,
    'TEACHER_RECONCILIATION_REQUIRED', null, null,
    jsonb_build_object('reconciliation_action', v_action),
    v_operation.correlation_id, null, v_operation.id
  );
  select request_id into v_denial_request_id
    from public.admin_audit_events where id = v_audit_id;
  v_result := public.admin_internal_denial_envelope(
    'TEACHER_RECONCILIATION_REQUIRED', v_denial_request_id
  ) || jsonb_build_object(
    'operation_id', v_operation.id::text,
    'teacher_id', v_operation.teacher_id::text,
    'login_account', v_operation.login_account,
    'result', 'reconciliation_required',
    'secret_replayable', false
  );
  update admin_private.teacher_account_operations
     set state = 'reconciliation_required',
         safe_error_code = v_safe_code,
         reconciliation_action = v_action,
         reconciliation_claim_token = null,
         reconciliation_claimed_at = null,
         reconciliation_claim_expires_at = null,
         execution_claim_token = null,
         execution_claimed_at = null,
         execution_claim_expires_at = null,
         updated_at = now()
   where id = v_operation.id;
  update public.admin_command_executions
     set result_code = 'TEACHER_RECONCILIATION_REQUIRED',
         redacted_result_receipt = v_result
   where id = v_execution.id;
  return jsonb_build_object(
    'outcome', 'ok', 'idempotent', false, 'operation_id', v_operation.id::text
  );
end;
$$;

create function public.svc_admin_list_teacher_reconciliation_candidates(
  p_limit integer default 20
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
  select jsonb_build_object(
    'outcome', 'ok',
    'operations', coalesce(jsonb_agg(jsonb_build_object(
      'operation_id', candidate.id::text,
      'operation_type', candidate.operation_type::text
    ) order by candidate.created_at, candidate.id), '[]'::jsonb)
  )
  from (
    select operation.id, operation.operation_type, operation.created_at
      from admin_private.teacher_account_operations operation
     where operation.state = 'reconciliation_required'
       and operation.reconciliation_action is not null
       and (operation.auth_call_kind is null
         or operation.auth_call_kind = 'delete_user')
       and (
         operation.reconciliation_claim_token is null
         or operation.reconciliation_claim_expires_at <= now()
       )
     order by operation.created_at, operation.id
     limit least(greatest(coalesce(p_limit, 20), 1), 20)
  ) candidate;
$$;

create function public.svc_admin_claim_teacher_reconciliation(
  p_operation_id uuid,
  p_expected_operation_type text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_claimed admin_private.teacher_account_operations;
  v_redacted_result jsonb;
begin
  update admin_private.teacher_account_operations operation
     set reconciliation_claim_token = gen_random_uuid(),
         reconciliation_claimed_at = now(),
         reconciliation_claim_expires_at = now() + interval '60 seconds',
         attempt_count = attempt_count + 1,
         updated_at = now()
   where operation.id = p_operation_id
     and operation.operation_type::text = p_expected_operation_type
     and p_expected_operation_type in (
       'create_teacher_account', 'reset_teacher_password')
     and operation.state = 'reconciliation_required'
     and operation.reconciliation_action is not null
     and (operation.auth_call_kind is null
       or operation.auth_call_kind = 'delete_user')
     and exists (
       select 1
         from public.admin_command_executions execution
        where execution.id = operation.command_execution_id
          and execution.actor_principal_id = operation.actor_principal_id
          and execution.command_name = operation.operation_type::text
          and execution.request_id::text = operation.correlation_id
          and execution.completed_at is null
     )
     and (
       operation.reconciliation_claim_token is null
       or operation.reconciliation_claim_expires_at <= now()
     )
   returning * into v_claimed;
  if not found then
    return jsonb_build_object('outcome', 'skipped');
  end if;
  select execution.redacted_result_receipt into v_redacted_result
    from public.admin_command_executions execution
   where execution.id = v_claimed.command_execution_id;
  return jsonb_build_object(
    'outcome', 'ok',
    'claim_token', v_claimed.reconciliation_claim_token::text,
    'claim_expires_at', v_claimed.reconciliation_claim_expires_at,
    'operation', jsonb_build_object(
      'operation_id', v_claimed.id::text,
      'operation_type', v_claimed.operation_type::text,
      'state', v_claimed.state::text,
      'reserved_auth_user_id', v_claimed.reserved_auth_user_id::text,
      'cleanup_auth_user_id', v_claimed.cleanup_auth_user_id::text,
      'teacher_id', v_claimed.teacher_id::text,
      'login_account', v_claimed.login_account,
      'reconciliation_action', v_claimed.reconciliation_action,
      'redacted_result', coalesce(v_redacted_result, '{}'::jsonb)
    )
  );
end;
$$;

create function public.svc_admin_release_teacher_reconciliation(
  p_operation_id uuid,
  p_expected_operation_type text,
  p_claim_token uuid,
  p_safe_code text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_safe_code text := admin_private.teacher_safe_error_code(p_safe_code);
begin
  if v_safe_code is distinct from p_safe_code then
    return admin_private.teacher_service_deny(
      'TEACHER_ACCOUNT_INVALID', 'teacher_reconciliation_release',
      p_operation_id, null);
  end if;
  update admin_private.teacher_account_operations operation
     set reconciliation_claim_token = null,
         reconciliation_claimed_at = null,
         reconciliation_claim_expires_at = null,
         safe_error_code = v_safe_code,
         updated_at = now()
   where operation.id = p_operation_id
     and operation.operation_type::text = p_expected_operation_type
     and operation.state = 'reconciliation_required'
     and operation.reconciliation_claim_token = p_claim_token
     and operation.reconciliation_claim_expires_at > now()
   returning * into v_operation;
  if not found then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_reconciliation_release',
      p_operation_id, null);
  end if;
  perform public.admin_internal_append_audit(
    'service', null, null, null,
    'teacher_reconciliation_released', 'teacher_account', null,
    v_safe_code, null, null,
    jsonb_build_object('lease_released', true),
    v_operation.correlation_id, null, v_operation.id
  );
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_resolve_teacher_reconciliation(
  p_operation_id uuid,
  p_expected_operation_type text,
  p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_operation admin_private.teacher_account_operations;
  v_execution public.admin_command_executions;
  v_audit_id uuid;
  v_denial_request_id uuid;
  v_result_name text;
  v_result jsonb;
begin
  select * into v_operation
    from admin_private.teacher_account_operations operation
   where operation.id = p_operation_id
   for update;
  if not found
     or p_expected_operation_type is null
     or p_expected_operation_type not in (
       'create_teacher_account', 'reset_teacher_password')
     or v_operation.operation_type::text is distinct from p_expected_operation_type
     or v_operation.state <> 'reconciliation_required'
     or v_operation.reconciliation_claim_token is distinct from p_claim_token
     or v_operation.reconciliation_claim_expires_at is null
     or v_operation.reconciliation_claim_expires_at <= now()
  then
    return admin_private.teacher_service_deny(
      'TEACHER_OPERATION_PENDING', 'teacher_reconciliation_resolve',
      p_operation_id, v_operation.correlation_id);
  end if;
  if v_operation.operation_type = 'create_teacher_account'
     and v_operation.reconciliation_action = 'delete_cleanup_auth_user'
  then
    if v_operation.cleanup_auth_user_id is null
       or exists (
         select 1 from auth.users auth_user
          where auth_user.id = v_operation.cleanup_auth_user_id
       )
       or (
         v_operation.reserved_auth_user_id is distinct from
           v_operation.cleanup_auth_user_id
         and exists (
           select 1 from auth.users auth_user
            where auth_user.id = v_operation.reserved_auth_user_id
         )
       ) then
      return admin_private.teacher_service_deny(
        'TEACHER_RECONCILIATION_REQUIRED', 'teacher_reconciliation_resolve',
        p_operation_id, v_operation.correlation_id);
    end if;
    v_result_name := 'compensated';
  elsif v_operation.operation_type = 'reset_teacher_password'
        and v_operation.reconciliation_action = 'close_password_reset_redacted'
  then
    v_result_name := 'reset_requires_fresh_request';
  else
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED', 'teacher_reconciliation_resolve',
      p_operation_id, v_operation.correlation_id);
  end if;

  select * into v_execution
    from public.admin_command_executions execution
   where execution.id = v_operation.command_execution_id
     and execution.actor_principal_id = v_operation.actor_principal_id
     and execution.command_name = v_operation.operation_type::text
     and execution.request_id::text = v_operation.correlation_id
     and execution.completed_at is null
   for update;
  if not found then
    return admin_private.teacher_service_deny(
      'TEACHER_RECONCILIATION_REQUIRED', 'teacher_reconciliation_resolve',
      p_operation_id, v_operation.correlation_id);
  end if;
  v_audit_id := public.admin_internal_append_audit(
    'service', null, null, null,
    'teacher_reconciliation_resolved', 'teacher_account', null,
    v_result_name, null, null,
    jsonb_build_object(
      'reconciliation_action', v_operation.reconciliation_action,
      'secret_replayable', false
    ),
    v_operation.correlation_id, null, v_operation.id
  );
  select request_id into v_denial_request_id
    from public.admin_audit_events where id = v_audit_id;
  v_result := public.admin_internal_denial_envelope(
    'TEACHER_RECONCILIATION_REQUIRED', v_denial_request_id
  ) || jsonb_build_object(
    'operation_id', v_operation.id::text,
    'teacher_id', v_operation.teacher_id::text,
    'login_account', v_operation.login_account,
    'result', v_result_name,
    'secret_replayable', false
  );
  update admin_private.teacher_account_operations
     set state = 'compensated',
         reconciliation_action = null,
         reconciliation_claim_token = null,
         reconciliation_claimed_at = null,
         reconciliation_claim_expires_at = null,
         execution_claim_token = null,
         execution_claimed_at = null,
         execution_claim_expires_at = null,
         updated_at = now(),
         completed_at = now()
   where id = v_operation.id;
  update public.admin_command_executions
     set audit_event_id = v_audit_id,
         result_code = 'TEACHER_RECONCILIATION_REQUIRED',
         redacted_result_receipt = v_result,
         completed_at = now()
   where id = v_execution.id;
  return v_result || jsonb_build_object('newly_completed', false);
end;
$$;

revoke all on function public.svc_admin_claim_teacher_account_execution(
  uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_begin_teacher_auth_call(
  uuid, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_mark_teacher_auth_applied(
  uuid, text, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_commit_teacher_profile(
  uuid, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_complete_teacher_account_operation(
  uuid, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_begin_teacher_create_compensation(
  uuid, text, text, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_complete_teacher_create_compensation(
  uuid, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_require_teacher_reconciliation(
  uuid, text, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_list_teacher_reconciliation_candidates(
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_claim_teacher_reconciliation(
  uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_release_teacher_reconciliation(
  uuid, text, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.svc_admin_resolve_teacher_reconciliation(
  uuid, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.svc_admin_claim_teacher_account_execution(
  uuid, text
) to service_role;
grant execute on function public.svc_admin_begin_teacher_auth_call(
  uuid, text, uuid, text
) to service_role;
grant execute on function public.svc_admin_mark_teacher_auth_applied(
  uuid, text, uuid, uuid
) to service_role;
grant execute on function public.svc_admin_commit_teacher_profile(
  uuid, text, uuid
) to service_role;
grant execute on function public.svc_admin_complete_teacher_account_operation(
  uuid, text, uuid
) to service_role;
grant execute on function public.svc_admin_begin_teacher_create_compensation(
  uuid, text, text, uuid, uuid
) to service_role;
grant execute on function public.svc_admin_complete_teacher_create_compensation(
  uuid, text, text, uuid
) to service_role;
grant execute on function public.svc_admin_require_teacher_reconciliation(
  uuid, text, text, uuid
) to service_role;
grant execute on function public.svc_admin_list_teacher_reconciliation_candidates(
  integer
) to service_role;
grant execute on function public.svc_admin_claim_teacher_reconciliation(
  uuid, text
) to service_role;
grant execute on function public.svc_admin_release_teacher_reconciliation(
  uuid, text, uuid, text
) to service_role;
grant execute on function public.svc_admin_resolve_teacher_reconciliation(
  uuid, text, uuid
) to service_role;

create function admin_private.teacher_cursor_binding(
  p_search text,
  p_state text
) returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select encode(sha256(convert_to(
    to_json(coalesce(p_search, ''))::text || '|'
      || to_json(coalesce(p_state, ''))::text,
    'utf8'
  )), 'hex');
$$;
revoke all on function admin_private.teacher_cursor_binding(text, text)
  from public, anon, authenticated, service_role;

create function public.admin_list_teachers(
  p_cursor text default null,
  p_search text default null,
  p_state text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_auth jsonb;
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_state text := nullif(btrim(coalesce(p_state, '')), '');
  v_cursor jsonb;
  v_cursor_created_at timestamptz;
  v_cursor_id uuid;
  v_binding text;
  v_rows jsonb;
  v_count integer;
  v_last jsonb;
  v_next_cursor text;
  v_request_id uuid := gen_random_uuid();
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'admin/teachers', v_auth ->> 'code', 'admin_list_teachers',
      'teacher_account',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  if (v_search is not null and char_length(v_search) > 80)
     or (v_state is not null and v_state not in (
       'ready', 'operation_pending', 'reconciliation_required')) then
    return public.admin_internal_deny(
      'admin/teachers', 'TEACHER_ACCOUNT_INVALID', 'admin_list_teachers',
      'teacher_account', 'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer);
  end if;

  v_binding := admin_private.teacher_cursor_binding(v_search, v_state);
  if p_cursor is not null then
    v_cursor := public.admin_internal_decode_row_key(p_cursor);
    begin
      if v_cursor is null
         or (v_cursor ->> 'binding') is distinct from v_binding then
        raise invalid_parameter_value;
      end if;
      v_cursor_created_at := (v_cursor ->> 'created_at')::timestamptz;
      v_cursor_id := (v_cursor ->> 'teacher_id')::uuid;
    exception when others then
      return public.admin_internal_deny(
        'admin/teachers', 'TEACHER_ACCOUNT_INVALID', 'admin_list_teachers',
        'teacher_account', 'admin', (v_auth ->> 'principal_id')::uuid,
        (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::integer);
    end;
  end if;

  with teacher_rows as (
    select profile.id, profile.login_account, profile.display_name,
      profile.contact_email, profile.created_at,
      admin_private.teacher_safe_state(profile.id) as operation_state
    from public.profiles profile
    where profile.role = 'teacher'
      and profile.login_account ~ '^teacher[0-9]{2,}$'
      and (v_search is null
        or lower(profile.login_account) like '%' || v_search || '%'
        or lower(profile.display_name) like '%' || v_search || '%')
      and (v_cursor_id is null
        or (profile.created_at, profile.id)
          > (v_cursor_created_at, v_cursor_id))
  ), selected as (
    select * from teacher_rows
     where v_state is null or operation_state = v_state
     order by created_at, id
     limit 51
  ), page as (
    select * from selected order by created_at, id limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'teacher_id', id::text,
      'login_account', login_account,
      'display_name', display_name,
      'contact_email_masked', case when contact_email is null then null
        else public.admin_internal_mask(contact_email, 'email_mask') end,
      'contact_email_present', contact_email is not null,
      'created_at', created_at,
      'operation_state', operation_state
    ) order by created_at, id), '[]'::jsonb),
    (select count(*) from selected)
    into v_rows, v_count
    from page;

  if v_count > 50 then
    v_last := v_rows -> 49;
    v_next_cursor := public.admin_internal_base64url_encode(convert_to(
      jsonb_build_object(
        'binding', v_binding,
        'created_at', v_last ->> 'created_at',
        'teacher_id', v_last ->> 'teacher_id'
      )::text,
      'utf8'
    ));
  end if;
  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_request_id::text,
    'rows', v_rows, 'next_cursor', v_next_cursor
  );
end;
$$;

create function public.admin_get_teacher(p_teacher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_auth jsonb;
  v_teacher jsonb;
  v_state text;
  v_request_id uuid := gen_random_uuid();
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'admin/teachers', v_auth ->> 'code', 'admin_get_teacher',
      'teacher_account',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;

  select admin_private.teacher_safe_state(profile.id),
    jsonb_build_object(
      'teacher_id', profile.id::text,
      'login_account', profile.login_account,
      'display_name', profile.display_name,
      'full_name', profile.full_name,
      'role', profile.role::text,
      'contact_email_masked', case when profile.contact_email is null then null
        else public.admin_internal_mask(profile.contact_email, 'email_mask') end,
      'contact_email_present', profile.contact_email is not null,
      'created_at', profile.created_at
    )
    into v_state, v_teacher
    from public.profiles profile
   where profile.id = p_teacher_id
     and profile.role = 'teacher'
     and profile.login_account ~ '^teacher[0-9]{2,}$';
  if v_teacher is null then
    return public.admin_internal_deny(
      'admin/teachers', 'TEACHER_ACCOUNT_INVALID', 'admin_get_teacher',
      'teacher_account', 'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer);
  end if;

  v_teacher := v_teacher || jsonb_build_object(
    'operation_state', v_state,
    'available_commands', case when v_state = 'ready' then
      jsonb_build_array('update_teacher_account', 'reset_teacher_password')
      else '[]'::jsonb end
  );
  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_request_id::text, 'teacher', v_teacher
  );
end;
$$;

revoke all on function public.admin_list_teachers(text, text, text)
  from public, anon;
revoke all on function public.admin_get_teacher(uuid) from public, anon;
grant execute on function public.admin_list_teachers(text, text, text)
  to authenticated;
grant execute on function public.admin_get_teacher(uuid) to authenticated;

insert into public.admin_sensitivity_catalog (
  resource, domain, surface, column_name, class, mask_strategy,
  searchable, filterable, sortable
) values (
  'profiles', 'users', 'browser', 'contact_email', 'personal', 'email_mask',
  false, false, false
);
