-- supabase/migrations/20260809000300_admin_stuck_manual_retry.sql
--
-- Task 13A-2(spec §8.3):stuck operation 一次性人工重試授權。
-- 依賴 20260809000100:command／service denial 皆使用新 envelope。

-- ════════════════════════════════════════════════════════════════════
-- 13A-2:stuck operation 一次性人工重試(spec §8.3,2026-08-09 owner 裁定)
-- ════════════════════════════════════════════════════════════════════
--
-- 為什麼不加新欄位:one-shot claim 需要的是「一個只能被成功消耗一次的原子
-- 標記」。`next_retry_at` 在 state='stuck' 時本來就沒有任何排程語意 ——
-- admin-reconcile 的掃描條件是 state in (pending, step1_complete,
-- step2_complete),永遠不會選到 stuck;svc_admin_touch_security_operation
-- 也用同一組 state 過濾。因此在 stuck 這個 state 下,`next_retry_at` 是一個
-- 沒有其他讀者的自由欄位,可以精確承載「已授權一次人工重試、尚未被 claim」。
-- 唯一的前提是 stuck 不能殘留舊的退避時間戳,所以下面同時覆蓋
-- svc_admin_mark_operation_stuck 讓它在標 stuck 時清成 null。
-- 這樣就不必為了 one-shot 而擴張 schema 或新增 state,也不會變成通用 queue。

-- 標 stuck 時一併清掉退避時間戳:stuck 之後 next_retry_at 專用於人工重試授權,
-- 不得殘留自動退避留下的值(否則會被誤判成「已授權」)。
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
    set state = 'stuck', next_retry_at = null, updated_at = now()
    where id = p_operation_id;
  perform public.admin_internal_append_audit('service', null, null, null,
    'reconciliation_timeout_incident', 'security_operation',
    v_operation.target_principal_id, 'stuck', null, null, null,
    v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

-- 原子 claim:只有 state='stuck' 且已授權(next_retry_at not null)才會成功,
-- 且成功當下就把授權消耗掉(設回 null)。兩個 worker 併發時,UPDATE 的
-- row lock + `next_retry_at is not null` 謂詞保證只有一個拿得到 RETURNING。
-- **不動 attempt_count**、不清 incident/audit、不改 state。
create function public.svc_admin_claim_manual_retry(p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_claimed public.admin_security_operations;
begin
  update public.admin_security_operations
    set next_retry_at = null, updated_at = now()
    where id = p_operation_id
      and state = 'stuck'
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
    'target_principal_id', v_claimed.target_principal_id);
end;
$$;
revoke execute on function public.svc_admin_claim_manual_retry(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_claim_manual_retry(uuid)
  to service_role;

-- reconcile_admin_security_operation v2:stuck 改為「授權一次人工重試」。
--  * 非 stuck 的可推進狀態:維持原本「標記立即重試」語意。
--  * stuck:原子建立一次 retry request(next_retry_at = now());若已有一次
--    未被 claim 的授權則回 SECURITY_OPERATION_PENDING,不累積多次授權。
--  * completed / 未知 operation / factor_incident_isolation:typed deny。
--  * 不重設 attempt_count、不清 incident/audit、不放寬任何權限。
create or replace function public.reconcile_admin_security_operation(
  p_receipt_id uuid, p_idempotency_key text, p_operation_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_operation public.admin_security_operations;
  v_authorized boolean := false;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'operation_id', p_operation_id::text,
    'reason', btrim(coalesce(p_reason, ''))));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('reconcile_admin_security_operation',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'reconcile_admin_security_operation', p_idempotency_key,
    v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('reconcile_admin_security_operation',
      null, v_gate ->> 'code', p_reason);
  end if;

  select * into v_operation from public.admin_security_operations
    where id = p_operation_id for update;

  -- 未知 ID、已完成、或只能走 owner OOB 的 factor incident:一律 typed deny
  if not found
     or v_operation.state = 'completed'
     or v_operation.operation_type = 'factor_incident_isolation' then
    return public.admin_internal_command_deny('reconcile_admin_security_operation',
      v_operation.target_principal_id, 'SECURITY_OPERATION_PENDING', p_reason,
      (v_gate ->> 'mfa_age_seconds')::int);
  end if;

  if v_operation.state = 'stuck' then
    -- 一次性授權:已有未被 claim 的授權就不再累加(維持 one-shot)
    update public.admin_security_operations
      set next_retry_at = now(), updated_at = now()
      where id = p_operation_id
        and state = 'stuck'
        and next_retry_at is null;
    v_authorized := found;
    if not v_authorized then
      return public.admin_internal_command_deny('reconcile_admin_security_operation',
        v_operation.target_principal_id, 'SECURITY_OPERATION_PENDING', p_reason,
        (v_gate ->> 'mfa_age_seconds')::int);
    end if;
  else
    -- 既有語意:可推進狀態標記立即重試,交由排程續跑
    update public.admin_security_operations
      set next_retry_at = now(), updated_at = now()
      where id = p_operation_id;
  end if;

  return public.admin_internal_finalize_command(v_gate,
    'reconcile_admin_security_operation', p_idempotency_key, v_request_hash,
    p_receipt_id, v_operation.target_principal_id, p_reason, null,
    jsonb_build_object('operation_id', p_operation_id,
      'result', case when v_operation.state = 'stuck'
        then 'manual_retry_authorized' else 'reconcile_requested' end));
end;
$$;
