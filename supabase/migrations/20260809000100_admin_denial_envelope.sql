-- supabase/migrations/20260809000100_admin_denial_envelope.sql
--
-- Task 13A-3(spec §11):統一 denial response envelope。
-- Forward migration —— 不修改 000400/000700/000800,以 CREATE OR REPLACE 覆蓋。
-- 必須排在 13A-1／13A-2 之前:那兩片的 denial 都經由這裡的 envelope 回傳。

-- ════════════════════════════════════════════════════════════════════
-- 13A-3:denial response envelope
-- ════════════════════════════════════════════════════════════════════

-- retryable 集中 mapping(spec §11)。未明確列為可重試者一律 false —— 未知碼
-- fail closed,前端不得自行猜測。
--   SECURITY_AUDIT_UNAVAILABLE:稽核暫時不可用,稍後同一請求可能成功。
--   STALE_PRIVILEGED_SESSION:由 challenge redirect 處理,不提供原地 retry
--     loop(原樣重送只會再被拒)。
--   其餘 authorization／validation／target-state／idempotency conflict 類:
--     決定性拒絕,重送同一輸入必然得到同一結果。
create function public.admin_internal_denial_retryable(p_code text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select p_code = 'SECURITY_AUDIT_UNAVAILABLE';
$$;
revoke execute on function public.admin_internal_denial_retryable(text)
  from public, anon, authenticated;

-- safe message 集中 mapping(spec §11):不得逐 RPC 自行編造文案,也不得洩漏
-- SQL／stack／secret／目標存在性。未知碼回一句不透露任何細節的通用訊息。
create function public.admin_internal_denial_message(p_code text)
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
    else '操作未完成，請聯絡負責人。'
  end;
$$;
revoke execute on function public.admin_internal_denial_message(text)
  from public, anon, authenticated;

-- 統一 envelope 組裝:DB 與 Edge 共用同一 allowlist,只有這五個欄位。
create function public.admin_internal_denial_envelope(
  p_code text, p_request_id uuid
) returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'outcome', 'denied',
    'code', p_code,
    'message', public.admin_internal_denial_message(p_code),
    'request_id', p_request_id::text,
    'retryable', public.admin_internal_denial_retryable(p_code));
$$;
revoke execute on function public.admin_internal_denial_envelope(text, uuid)
  from public, anon, authenticated;

-- admin_internal_deny:改為捕捉 append_audit 回傳的 audit event id 當作
-- request_id(spec §11 要求 request ID 必須對應 durable denial audit,不是
-- 隨機產生的號碼),並回傳完整 envelope。原本這個 id 被 perform 丟掉。
create or replace function public.admin_internal_deny(
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
declare
  v_audit_id uuid;
  v_request_id uuid;
begin
  v_audit_id := public.admin_internal_append_audit(
    p_actor_type, p_actor_principal_id, p_admin_session_id, p_auth_session_id,
    p_action, p_target_type, p_target_principal_id, p_code,
    p_reason_or_purpose, p_mfa_age_seconds, null, null);
  -- 2026-08-19 review 修正(Medium):admin_internal_append_audit 回傳的
  -- 是稽核列的 id(主鍵),而 admin_audit_events 另有獨立生成的
  -- request_id 欄位(admin_query_audit 就是靠這欄給稽核頁顯示/查詢)。
  -- 兩者是不同值 —— 之前把 id 當 request_id 回給 client,client 拿著這個
  -- 「追蹤代碼」去稽核頁查詢，永遠對不上任何一筆記錄。這裡改成插入後
  -- 立刻查回真正的 request_id 欄位;append_audit 本身不改(供 20 個既有
  -- 呼叫端使用,部分依賴它回傳真正的 id 作 FK)。
  select request_id into v_request_id
    from public.admin_audit_events where id = v_audit_id;
  perform public.admin_internal_record_denial(p_resource_key, p_code);
  return public.admin_internal_denial_envelope(p_code, v_request_id);
end;
$$;

-- command denial 沿用同一 envelope(它本來就轉呼 admin_internal_deny,
-- 這裡只是把回傳原樣帶出,不再另組物件)。
create or replace function public.admin_internal_command_deny(
  p_command_name text, p_target_principal_id uuid, p_code text,
  p_reason_or_purpose text, p_mfa_age_seconds integer default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_principal uuid;
  v_session_id uuid;
begin
  select i.audit_principal_id, s.id into v_principal, v_session_id
    from public.admin_security_identities i
    left join public.admin_sessions s
      on s.admin_user_id = i.admin_user_id and s.revoked_at is null
    where i.admin_user_id = auth.uid();
  return public.admin_internal_deny(
    'command/' || p_command_name, p_code, p_command_name, 'admin_command',
    case when v_principal is null then 'unknown' else 'admin'
      end::public.admin_actor_type,
    v_principal, v_session_id,
    nullif(coalesce(auth.jwt() ->> 'session_id',
      current_setting('request.jwt.claim.session_id', true)), '')::uuid,
    p_target_principal_id, p_reason_or_purpose, p_mfa_age_seconds);
end;
$$;

-- service/owner 語境的 denial 同樣帶 envelope,讓 Edge passthrough 的形狀一致。
create or replace function public.admin_internal_service_deny(
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
declare
  v_audit_id uuid;
  v_request_id uuid;
begin
  v_audit_id := public.admin_internal_append_audit(
    p_actor_type, p_actor_principal_id, null, null,
    p_action, p_target_type, p_target_principal_id, p_code,
    null, null, null, p_correlation_id, null, p_runbook_operation_id);
  -- 同 admin_internal_deny:回傳真正的 request_id 欄位,不是稽核列 id
  select request_id into v_request_id
    from public.admin_audit_events where id = v_audit_id;
  perform public.admin_internal_record_denial(p_resource_key, p_code);
  return public.admin_internal_denial_envelope(p_code, v_request_id);
end;
$$;
