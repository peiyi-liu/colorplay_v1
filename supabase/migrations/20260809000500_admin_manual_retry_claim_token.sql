-- supabase/migrations/20260809000500_admin_manual_retry_claim_token.sql
--
-- Task 13A-5(spec §8.3;2026-08-18 owner 裁定選項 c):
-- 讓已授權的一次性人工重試真的推得動 saga。
--
-- 為什麼需要這一片:13A-2 讓 svc_admin_claim_manual_retry 能原子取得執行權,
-- 但 svc_admin_complete_reset_step2／step3 是以 state 判斷是否可推進
-- (分別要求 step1_complete／step2_complete),而 svc_admin_mark_operation_stuck
-- 已把 state 覆寫成 stuck —— 於是 claim 拿得到、卻沒有任何函式肯接手,
-- 一次性授權被消耗掉但什麼都沒發生。
--
-- 為什麼不用「claim 時把 state 還原」:那會讓作業在續跑期間離開 stuck。
-- 續跑中途失敗(Edge 崩潰、網路中斷)就會留下一筆「可推進狀態 + 沒有退避
-- 時間戳」的資料,正好符合 admin-reconcile 掃描條件,被自動重試迴圈撿回去
-- —— stuck 的用意就失效了,而且沒有任何訊號。
--
-- 為什麼不用「step RPC 直接接受 stuck」:claim 在前一步就被消耗且不留痕跡,
-- DB 無從分辨呼叫者是正當取得執行權、還是直接跳過授權呼叫 step。那等於把
-- 「只能一次」的保證交給 Edge 自律,牴觸 AGENTS.md §5 可信邊界。
--
-- 本片作法:claim 成功時由 DB 產生一次性憑證並回傳;step2／step3 只有在
-- 「state = stuck 且憑證相符」時才接受 stuck,成功即作廢憑證。保證留在 DB,
-- Edge 只負責搬運憑證(與 13A-4 的 row_token 同一設計哲學)。
--
-- 依賴 20260809000300。

alter table public.admin_security_operations
  add column manual_retry_claim_token uuid;

comment on column public.admin_security_operations.manual_retry_claim_token is
  'One-shot manual retry claim token issued by svc_admin_claim_manual_retry; '
  'voided by the reset step that redeems it. Never exposed to the browser.';

-- ════════════════════════════════════════════════════════════════════
-- 標 stuck:同時清掉退避時間戳與任何未兌現的憑證
-- ════════════════════════════════════════════════════════════════════

-- 重新標 stuck 代表上一輪授權的續跑已經失敗:殘留憑證必須作廢,否則舊憑證
-- 會在下一次 incident 期間仍可兌現。
create or replace function public.svc_admin_mark_operation_stuck(
  p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_operation public.admin_security_operations;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_operation from public.admin_security_operations
    where id = p_operation_id for update;
  if not found or v_operation.state = 'completed' then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reconciliation_timeout_incident',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  if v_operation.state = 'stuck' then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  update public.admin_security_operations
    set state = 'stuck', next_retry_at = null,
        manual_retry_claim_token = null, updated_at = now()
    where id = p_operation_id;
  perform public.admin_internal_append_audit('service', null, null, null,
    'reconciliation_timeout_incident', 'security_operation',
    v_operation.target_principal_id, 'stuck', null, null, null,
    v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- claim:取得執行權的同時簽發一次性憑證
-- ════════════════════════════════════════════════════════════════════

-- 原子性不變:UPDATE 的 row lock + `next_retry_at is not null` 謂詞保證併發
-- 時只有一個 worker 拿得到 RETURNING,因此也只有一個 worker 拿得到憑證。
-- 重新授權會覆寫舊憑證,任何時刻最多只有一張有效憑證。
--
-- 縱深防禦:額外要求 operation_type = 'reset_admin_mfa'。factor incident 的
-- 復原只能走 owner OOB(spec §4.2),即使有殘留的 next_retry_at 也不該讓它
-- 拿到憑證 —— step 閘門雖然也擋得住,但沒有理由先發出一張兌現不了的憑證。
create or replace function public.svc_admin_claim_manual_retry(
  p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_claimed public.admin_security_operations;
begin
  update public.admin_security_operations
    set next_retry_at = null,
        manual_retry_claim_token = gen_random_uuid(),
        updated_at = now()
    where id = p_operation_id
      and state = 'stuck'
      and operation_type = 'reset_admin_mfa'
      and next_retry_at is not null
    returning * into v_claimed;
  if not found then
    return jsonb_build_object('outcome', 'skipped');
  end if;
  return jsonb_build_object('outcome', 'ok',
    'operation_id', v_claimed.id,
    'operation_type', v_claimed.operation_type,
    'current_step', v_claimed.current_step,
    'attempt_count', v_claimed.attempt_count,
    'claim_token', v_claimed.manual_retry_claim_token,
    'target_principal_id', v_claimed.target_principal_id);
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- reset saga step2／step3:共用實作 + 憑證閘門
-- ════════════════════════════════════════════════════════════════════

-- p_claim_token 為 null 代表排程路徑(只接受正常的可推進狀態);非 null 時
-- 額外允許 stuck,但必須與 DB 內的憑證完全相符。憑證於成功時作廢。
create function public.admin_internal_complete_reset_step2(
  p_operation_id uuid, p_claim_token uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_operation public.admin_security_operations;
  v_manual boolean;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_operation from public.admin_security_operations
    where id = p_operation_id for update;
  if not found then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_step2_complete',
      'security_operation', 'service', null, null);
  end if;
  -- 只有 reset saga 可被 service 推進;factor incident 的復原走 owner OOB
  -- (spec §4.2),不得經 reset steps 改變 operation/identity 狀態。
  if v_operation.operation_type <> 'reset_admin_mfa' then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_step2_complete',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  if v_operation.state in ('step2_complete', 'completed') then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  -- 憑證閘門:stuck 只在持有相符憑證時可推進(spec §8.3 一次性人工重試)
  v_manual := v_operation.state = 'stuck'
    and p_claim_token is not null
    and v_operation.manual_retry_claim_token is not null
    and v_operation.manual_retry_claim_token = p_claim_token;
  if v_operation.state <> 'step1_complete' and not v_manual then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_step2_complete',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  update public.admin_security_operations
    set state = 'step2_complete', current_step = 2,
        attempt_count = attempt_count + 1,
        manual_retry_claim_token = null, updated_at = now()
    where id = p_operation_id;
  perform public.admin_internal_append_audit('service', null, null, null,
    'reset_step2_complete', 'security_operation',
    v_operation.target_principal_id, 'success', null, null, null,
    v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok',
    'manual_retry', v_manual);
end;
$$;
revoke execute on function public.admin_internal_complete_reset_step2(uuid, uuid)
  from public, anon, authenticated;

create function public.admin_internal_complete_reset_step3(
  p_operation_id uuid, p_claim_token uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_operation public.admin_security_operations;
  v_manual boolean;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_operation from public.admin_security_operations
    where id = p_operation_id for update;
  if not found then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_completed',
      'security_operation', 'service', null, null);
  end if;
  -- 同 step2:非 reset saga 一律拒絕(spec §4.2)
  if v_operation.operation_type <> 'reset_admin_mfa' then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_completed',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  if v_operation.state = 'completed' then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  v_manual := v_operation.state = 'stuck'
    and p_claim_token is not null
    and v_operation.manual_retry_claim_token is not null
    and v_operation.manual_retry_claim_token = p_claim_token;
  if v_operation.state <> 'step2_complete' and not v_manual then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_completed',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  update public.admin_security_operations
    set state = 'completed', current_step = 3,
        manual_retry_claim_token = null, updated_at = now()
    where id = p_operation_id;
  update public.admin_security_identities
    set state = 'active_pending_mfa',
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where audit_principal_id = v_operation.target_principal_id
      and state = 'recovery_pending';
  perform public.admin_internal_append_audit('service', null, null, null,
    'reset_completed', 'security_operation', v_operation.target_principal_id,
    'success', null, null, null, v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok', 'manual_retry', v_manual);
end;
$$;
revoke execute on function public.admin_internal_complete_reset_step3(uuid, uuid)
  from public, anon, authenticated;

-- 排程路徑:語意與修訂前逐字相同(stuck 依然推不動)
create or replace function public.svc_admin_complete_reset_step2(
  p_operation_id uuid
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select public.admin_internal_complete_reset_step2(p_operation_id, null);
$$;

create or replace function public.svc_admin_complete_reset_step3(
  p_operation_id uuid
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select public.admin_internal_complete_reset_step3(p_operation_id, null);
$$;

-- 人工重試路徑:必須交回 claim 當下拿到的憑證
create function public.svc_admin_complete_reset_step2(
  p_operation_id uuid, p_claim_token uuid
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select public.admin_internal_complete_reset_step2(
    p_operation_id, p_claim_token);
$$;
revoke execute on function public.svc_admin_complete_reset_step2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_complete_reset_step2(uuid, uuid)
  to service_role;

create function public.svc_admin_complete_reset_step3(
  p_operation_id uuid, p_claim_token uuid
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select public.admin_internal_complete_reset_step3(
    p_operation_id, p_claim_token);
$$;
revoke execute on function public.svc_admin_complete_reset_step3(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_complete_reset_step3(uuid, uuid)
  to service_role;
