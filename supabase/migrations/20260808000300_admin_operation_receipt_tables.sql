-- 跨系統 saga operation record(spec §8.3)、一次性 authorization receipt(spec §6.2)、
-- idempotent command executions(spec §8.2)。

create type public.admin_operation_type as enum
  ('reset_admin_mfa', 'factor_incident_isolation', 'owner_oob_recovery', 'owner_bootstrap');

create type public.admin_operation_state as enum
  ('pending', 'step1_complete', 'step2_complete', 'completed', 'stuck');

create table public.admin_security_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type public.admin_operation_type not null,
  target_principal_id uuid not null references public.admin_audit_principals (id),
  state public.admin_operation_state not null default 'pending',
  current_step integer not null default 1,
  attempt_count integer not null default 0,
  last_safe_error_code text,
  next_retry_at timestamptz,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_command_authorizations (
  id uuid primary key default gen_random_uuid(),
  actor_principal_id uuid not null,
  auth_session_id uuid not null,
  command_name text not null,
  idempotency_key text not null,
  request_hash bytea not null,
  bound_factor_id_snapshot uuid not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  -- spec §6.2:TTL 固定 60 秒;環境不得覆寫。這條 CHECK 是唯一 TTL 來源,
  -- 任何 mint 實作都無法簽出其他效期。
  constraint receipt_ttl_is_exactly_60s
    check (expires_at = issued_at + interval '60 seconds')
);

create table public.admin_command_executions (
  id uuid primary key default gen_random_uuid(),
  actor_principal_id uuid not null references public.admin_audit_principals (id),
  command_name text not null,
  idempotency_key text not null,
  request_hash bytea not null,
  receipt_id uuid references public.admin_command_authorizations (id),
  audit_event_id uuid,
  request_id uuid not null default gen_random_uuid(),
  result_code text,
  redacted_result_receipt jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- spec §8.2:idempotency 唯一鍵;同 key 同 hash 回原 redacted result,
-- 同 key 不同 hash 回 IDEMPOTENCY_CONFLICT(於 mint function 判斷)。
create unique index admin_command_executions_idempotency_idx
  on public.admin_command_executions (actor_principal_id, command_name, idempotency_key);

alter table public.admin_security_operations enable row level security;
alter table public.admin_command_authorizations enable row level security;
alter table public.admin_command_executions enable row level security;
revoke all on public.admin_security_operations from anon, authenticated;
revoke all on public.admin_command_authorizations from anon, authenticated;
revoke all on public.admin_command_executions from anon, authenticated;
