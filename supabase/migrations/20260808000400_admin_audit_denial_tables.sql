-- Append-only audit(spec §10)與分離的 denial aggregation(spec §1.2-9、§10)。

create type public.admin_actor_type as enum
  ('admin', 'pre_session_user', 'service', 'owner_out_of_band', 'unknown');

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_type public.admin_actor_type not null,
  actor_principal_id uuid references public.admin_audit_principals (id),
  admin_session_id uuid,
  auth_session_id uuid,
  action text not null,
  target_type text not null,
  target_principal_id uuid references public.admin_audit_principals (id),
  result text not null,
  request_id uuid not null default gen_random_uuid(),
  correlation_id text,
  reason_or_purpose_redacted text,
  mfa_age_seconds integer,
  before_after_redacted jsonb,
  source_summary_redacted text,
  compensates_event_id uuid references public.admin_audit_events (id),
  runbook_operation_id uuid,
  -- reason/purpose 持久化前截斷(spec §10)
  constraint reason_redacted_bounded
    check (reason_or_purpose_redacted is null
           or char_length(reason_or_purpose_redacted) <= 200)
);

alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from anon, authenticated;

-- 無 UPDATE/DELETE grant 之外,trigger 再封鎖(spec §10),連 table owner
-- 誤操作也會被擋;tombstone 不改寫事件,只動 principals mapping。
create function public.admin_internal_block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ADMIN_AUDIT_APPEND_ONLY';
end;
$$;

create trigger admin_audit_events_append_only
  before update or delete on public.admin_audit_events
  for each row execute function public.admin_internal_block_audit_mutation();

create table public.admin_denial_counters (
  resource_key text not null,
  safe_reason_code text not null,
  window_started_at timestamptz not null default date_trunc('hour', now()),
  window_ends_at timestamptz not null default date_trunc('hour', now()) + interval '1 hour',
  count integer not null default 0,
  primary key (resource_key, safe_reason_code, window_started_at)
);

alter table public.admin_denial_counters enable row level security;
revoke all on public.admin_denial_counters from anon, authenticated;

-- Internal append helper:所有 DEFINER RPC 經此寫 audit;它不是 user API。
create function public.admin_internal_append_audit(
  p_actor_type public.admin_actor_type,
  p_actor_principal_id uuid,
  p_admin_session_id uuid,
  p_auth_session_id uuid,
  p_action text,
  p_target_type text,
  p_target_principal_id uuid,
  p_result text,
  p_reason_or_purpose text default null,
  p_mfa_age_seconds integer default null,
  p_before_after jsonb default null,
  p_correlation_id text default null,
  p_compensates_event_id uuid default null,
  p_runbook_operation_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_events (
    actor_type, actor_principal_id, admin_session_id, auth_session_id,
    action, target_type, target_principal_id, result,
    reason_or_purpose_redacted, mfa_age_seconds, before_after_redacted,
    correlation_id, compensates_event_id, runbook_operation_id
  ) values (
    p_actor_type, p_actor_principal_id, p_admin_session_id, p_auth_session_id,
    p_action, p_target_type, p_target_principal_id, p_result,
    left(btrim(coalesce(p_reason_or_purpose, '')), 200),
    p_mfa_age_seconds, p_before_after, p_correlation_id,
    p_compensates_event_id, p_runbook_operation_id
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.admin_internal_append_audit(
  public.admin_actor_type, uuid, uuid, uuid, text, text, uuid, text,
  text, integer, jsonb, text, uuid, uuid
) from public, anon, authenticated;

-- Denial counter:非正式 audit(spec §10);窗口聚合,門檻事件由 health/reconcile 追加。
create function public.admin_internal_record_denial(
  p_resource_key text, p_safe_reason_code text
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_denial_counters as c
    (resource_key, safe_reason_code, count)
  values (p_resource_key, p_safe_reason_code, 1)
  on conflict (resource_key, safe_reason_code, window_started_at)
  do update set count = c.count + 1;
$$;
revoke execute on function public.admin_internal_record_denial(text, text)
  from public, anon, authenticated;

-- 統一 denial 記帳(Codex 修訂 3):每個預期 denial 必須在同一提交交易內
-- 留下 typed outcome + audit(含可解析的 actor 佐證)+ denial counter。
-- 所有 user-scoped RPC 的 denial 一律經此 helper,不得各自湊寫。
create function public.admin_internal_deny(
  p_resource_key text,
  p_code text,
  p_action text,
  p_target_type text,
  p_actor_type public.admin_actor_type,
  p_actor_principal_id uuid,
  p_admin_session_id uuid,
  p_auth_session_id uuid,
  p_target_principal_id uuid,
  p_reason_or_purpose text default null,
  p_mfa_age_seconds integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_internal_append_audit(
    p_actor_type, p_actor_principal_id, p_admin_session_id, p_auth_session_id,
    p_action, p_target_type, p_target_principal_id, p_code,
    p_reason_or_purpose, p_mfa_age_seconds, null, null);
  perform public.admin_internal_record_denial(p_resource_key, p_code);
  return jsonb_build_object('outcome', 'denied', 'code', p_code);
end;
$$;
revoke execute on function public.admin_internal_deny(
  text, text, text, text, public.admin_actor_type, uuid, uuid, uuid, uuid,
  text, integer
) from public, anon, authenticated;

-- Service-path 統一 denial(Codex 修訂三-1、四-1):service/owner 語境的預期
-- denial 也必須 typed outcome + audit + counter 同交易提交。actor 與 target
-- 嚴格分離:actor 是「語意上的發起者」(已解析的 admin principal、或
-- service/owner/unknown 的 null actor),target 是受影響的 admin principal;
-- 絕不把已知 actor 錯置為 target。
create function public.admin_internal_service_deny(
  p_resource_key text,
  p_code text,
  p_action text,
  p_target_type text,
  p_actor_type public.admin_actor_type,
  p_actor_principal_id uuid,
  p_target_principal_id uuid,
  p_correlation_id text default null,
  p_runbook_operation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_internal_append_audit(
    p_actor_type, p_actor_principal_id, null, null, p_action, p_target_type,
    p_target_principal_id, p_code, null, null, null, p_correlation_id,
    null, p_runbook_operation_id);
  perform public.admin_internal_record_denial(p_resource_key, p_code);
  return jsonb_build_object('outcome', 'denied', 'code', p_code);
end;
$$;
revoke execute on function public.admin_internal_service_deny(
  text, text, text, text, public.admin_actor_type, uuid, uuid, text, uuid
) from public, anon, authenticated;

-- Canonical request hash(Codex 修訂 8):Edge 與 SQL 共用同一 byte-identical
-- 編碼:key 依 "C" collation 升冪、無任何空白、值一律 JSON string(PostgreSQL
-- to_json(text) 與 JS JSON.stringify 對字串採相同標準跳脫,非 ASCII 均輸出
-- 原始 UTF-8)、null 輸出字面 null。呼叫端一律先把值轉為 text(uuid::text、
-- btrim(reason));數值/布林不允許直接入場。
create function public.admin_internal_canonical_hash(p_fields jsonb)
returns bytea
language sql
security definer
set search_path = public, pg_temp
as $$
  select sha256(convert_to(
    '{' || coalesce((
      select string_agg(
        to_json(key)::text || ':' ||
        case when value is null then 'null' else to_json(value)::text end,
        ',' order by key collate "C")
      from jsonb_each_text(p_fields)
    ), '') || '}', 'utf8'));
$$;
revoke execute on function public.admin_internal_canonical_hash(jsonb)
  from public, anon, authenticated;
