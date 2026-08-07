-- Phase 1 Admin 身分核心(spec §4.1、§6.3、§10):
-- admin_audit_principals 是不可逆 audit principal 與 user mapping(可 tombstone);
-- admin_security_identities 是 Admin lifecycle 唯一權威。

create type public.admin_identity_state as enum
  ('active_pending_mfa', 'active', 'recovery_pending', 'deactivated');

create table public.admin_audit_principals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id),
  created_at timestamptz not null default now(),
  tombstoned_at timestamptz,
  -- 非 tombstoned 的 principal 必須保有 user mapping;tombstone 時必清空
  constraint tombstone_clears_mapping
    check ((tombstoned_at is null) = (user_id is not null))
);

create table public.admin_security_identities (
  admin_user_id uuid primary key references auth.users (id),
  audit_principal_id uuid not null unique
    references public.admin_audit_principals (id),
  state public.admin_identity_state not null default 'active_pending_mfa',
  bound_factor_id uuid,
  failed_totp_attempts integer not null default 0,
  locked_until timestamptz,
  lifecycle_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- bound_factor_id 只在 active 存在;reset/incident 進 recovery_pending 時必清空
  constraint active_requires_bound_factor
    check (state <> 'active' or bound_factor_id is not null),
  constraint recovery_clears_bound_factor
    check (state not in ('recovery_pending', 'active_pending_mfa')
           or bound_factor_id is null)
);

alter table public.admin_audit_principals enable row level security;
alter table public.admin_security_identities enable row level security;
revoke all on public.admin_audit_principals from anon, authenticated;
revoke all on public.admin_security_identities from anon, authenticated;

-- 固定 transaction-scoped advisory lock(spec §4.1):所有 lifecycle transition
-- 先取此鎖,再依 admin_user_id 升冪鎖列,避免互相 deactivate/reset 的死鎖與
-- active Admin 歸零競態。
create function public.admin_internal_lifecycle_lock()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select pg_advisory_xact_lock(hashtextextended('admin_security_lifecycle', 0));
$$;
revoke execute on function public.admin_internal_lifecycle_lock() from public, anon, authenticated;
