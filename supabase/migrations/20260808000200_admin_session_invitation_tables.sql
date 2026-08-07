-- 特權 session record(spec §5.1)與一次性邀請(spec §4.3)。

create type public.admin_invitation_status as enum
  ('pending', 'accepted', 'revoked');

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_security_identities (admin_user_id),
  audit_principal_id uuid not null references public.admin_audit_principals (id),
  auth_session_id uuid not null,
  bound_factor_id_snapshot uuid not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  last_totp_verified_at timestamptz not null default now(),
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  device_summary text,
  correlation_id text,
  constraint absolute_expiry_is_8h
    check (absolute_expires_at = created_at + interval '8 hours'),
  constraint device_summary_truncated
    check (device_summary is null or char_length(device_summary) <= 120)
);

-- 單一 privileged session(spec §2.3、§5.1):同 identity 只允許一筆未撤銷 row。
create unique index admin_sessions_one_active_idx
  on public.admin_sessions (admin_user_id)
  where revoked_at is null;

create table public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  issuer_principal_id uuid not null references public.admin_audit_principals (id),
  accepted_principal_id uuid references public.admin_audit_principals (id),
  invited_email text not null,
  token_hash bytea not null unique,
  status public.admin_invitation_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  -- 72 小時一次性(spec §4.3);明文 token 只在簽發 response 出現一次
  constraint invitation_expiry_is_72h
    check (expires_at = created_at + interval '72 hours'),
  -- 過期不可生效、狀態與時間戳一致(fail closed)
  constraint accepted_within_validity
    check (accepted_at is null or accepted_at <= expires_at),
  constraint status_matches_timestamps
    check (
      (status = 'pending' and accepted_at is null and revoked_at is null)
      or (status = 'accepted' and accepted_at is not null and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null and accepted_at is null)
    )
);

alter table public.admin_sessions enable row level security;
alter table public.admin_invitations enable row level security;
revoke all on public.admin_sessions from anon, authenticated;
revoke all on public.admin_invitations from anon, authenticated;

-- service-only session helpers(Task 5 svc 函式包裝重用;
-- 預期 denial 以 null/false 回傳,不 RAISE,typed outcome 由呼叫端組裝)。
create function public.create_admin_identity_session(
  p_admin_user_id uuid,
  p_auth_session_id uuid,
  p_bound_factor_id uuid,
  p_device_summary text,
  p_correlation_id text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
  v_id uuid;
begin
  perform public.admin_internal_lifecycle_lock();

  -- 冪等:同一 identity + auth session + correlation 重送回原 active session
  select id into v_existing
    from public.admin_sessions
   where admin_user_id = p_admin_user_id
     and revoked_at is null
     and auth_session_id = p_auth_session_id
     and correlation_id is not distinct from p_correlation_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- supersede:同交易撤銷既有 active 列(spec §5.3)
  update public.admin_sessions
     set revoked_at = now(), revoke_reason = 'superseded'
   where admin_user_id = p_admin_user_id
     and revoked_at is null;

  -- 只有 active 且 factor 綁定相符的 identity 能建立 session(spec §4.1/§5.1)
  insert into public.admin_sessions
    (admin_user_id, audit_principal_id, auth_session_id,
     bound_factor_id_snapshot, absolute_expires_at,
     device_summary, correlation_id)
  select i.admin_user_id, i.audit_principal_id, p_auth_session_id,
         p_bound_factor_id, now() + interval '8 hours',
         left(p_device_summary, 120), p_correlation_id
    from public.admin_security_identities i
   where i.admin_user_id = p_admin_user_id
     and i.state = 'active'
     and i.bound_factor_id = p_bound_factor_id
  returning id into v_id;

  return v_id;  -- 不合格回 null(fail closed,不 RAISE)
end;
$$;

create function public.close_admin_identity_session(
  p_session_id uuid,
  p_revoke_reason text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.admin_sessions
     set revoked_at = now(),
         revoke_reason = coalesce(p_revoke_reason, 'revoked_by_admin')
   where id = p_session_id
     and revoked_at is null;
  return found;  -- 已撤銷/不存在回 false,冪等不丟錯
end;
$$;

revoke execute on function
  public.create_admin_identity_session(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function
  public.close_admin_identity_session(uuid, text)
  from public, anon, authenticated;
