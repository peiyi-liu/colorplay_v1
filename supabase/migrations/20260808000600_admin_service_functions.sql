-- supabase/migrations/20260808000600_admin_service_functions.sql
-- Service-role-only:session/fresh-MFA/receipt/incident/tombstone(spec §5.3、§6.1)。

create function public.svc_admin_create_session(
  p_admin_user_id uuid, p_auth_session_id uuid, p_verified_factor_id uuid,
  p_device_summary text, p_correlation_id text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session_id uuid;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  if not found or v_identity.state <> 'active' then
    -- 使用者發起的 session 建立:已解析 admin 即為 actor(修訂四-1)
    return public.admin_internal_service_deny('service/create_session',
      'STALE_PRIVILEGED_SESSION', 'privileged_session_create', 'admin_session',
      case when v_identity.audit_principal_id is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      v_identity.audit_principal_id, v_identity.audit_principal_id,
      p_correlation_id);
  end if;
  if v_identity.bound_factor_id is distinct from p_verified_factor_id then
    return public.admin_internal_service_deny('service/create_session',
      'FACTOR_BINDING_MISMATCH', 'privileged_session_create', 'admin_session',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id,
      p_correlation_id);
  end if;

  -- 同交易 supersede 既有 sessions(spec §4.4-5)
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'superseded_by_new_session'
    where admin_user_id = p_admin_user_id and revoked_at is null;

  insert into public.admin_sessions (
    admin_user_id, audit_principal_id, auth_session_id, bound_factor_id_snapshot,
    absolute_expires_at, device_summary, correlation_id
  ) values (
    p_admin_user_id, v_identity.audit_principal_id, p_auth_session_id,
    p_verified_factor_id, now() + interval '8 hours',
    left(coalesce(p_device_summary, ''), 120), p_correlation_id
  ) returning id into v_session_id;

  perform public.admin_internal_append_audit(
    'admin', v_identity.audit_principal_id, v_session_id, p_auth_session_id,
    'privileged_session_created', 'admin_session', v_identity.audit_principal_id,
    'success', null, 0, null, p_correlation_id);
  return jsonb_build_object('outcome', 'ok', 'session_id', v_session_id);
end;
$$;

create function public.svc_admin_issue_command_receipt(
  p_actor_user_id uuid, p_auth_session_id uuid, p_command_name text,
  p_idempotency_key text, p_request_hash bytea, p_verified_factor_id uuid,
  p_requires_fresh_totp boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session public.admin_sessions;
  v_existing public.admin_command_executions;
  v_receipt_id uuid;
  v_live_receipt public.admin_command_authorizations;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_actor_user_id for update;
  select * into v_session from public.admin_sessions
    where admin_user_id = p_actor_user_id and revoked_at is null for update;
  -- Mint 的預期 denial 一律在此入帳(Edge 收到後原樣回傳,不重複記錄)
  if v_identity.state is distinct from 'active' or v_session.id is null
     or v_session.auth_session_id is distinct from p_auth_session_id
     or now() - v_session.last_activity_at >= interval '15 minutes'
     or now() >= v_session.absolute_expires_at then
    -- 使用者發起的 receipt 請求:actor=已解析 admin(未解析時 unknown/null)
    return public.admin_internal_service_deny('service/issue_command_receipt',
      'STALE_PRIVILEGED_SESSION', p_command_name, 'command_receipt',
      case when v_identity.audit_principal_id is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  if v_identity.bound_factor_id is distinct from p_verified_factor_id
     or v_session.bound_factor_id_snapshot is distinct from p_verified_factor_id then
    return public.admin_internal_service_deny('service/issue_command_receipt',
      'FACTOR_BINDING_MISMATCH', p_command_name, 'command_receipt',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  if p_requires_fresh_totp
     and now() - v_session.last_totp_verified_at > interval '10 minutes' then
    return public.admin_internal_service_deny('service/issue_command_receipt',
      'INSUFFICIENT_MFA', p_command_name, 'command_receipt',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;

  -- idempotency(spec §8.2):同 key 同 hash 回原 redacted result;不同 hash 衝突
  select * into v_existing from public.admin_command_executions
    where actor_principal_id = v_identity.audit_principal_id
      and command_name = p_command_name and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash = p_request_hash then
      return jsonb_build_object('outcome', 'replayed',
        'result', v_existing.redacted_result_receipt);
    end if;
    return public.admin_internal_service_deny('service/issue_command_receipt',
      'IDEMPOTENCY_CONFLICT', p_command_name, 'command_receipt',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;

  -- Receipt-level replay(Codex P2):執行列尚未寫入前的 timeout 重試,
  -- 同 key 同 hash 一律回原張未消耗未過期 receipt,不得鑄第二張活 receipt;
  -- 同 key 不同 hash 在受理層即衝突。
  select * into v_live_receipt from public.admin_command_authorizations
    where actor_principal_id = v_identity.audit_principal_id
      and auth_session_id = p_auth_session_id
      and command_name = p_command_name
      and idempotency_key = p_idempotency_key
      and consumed_at is null and now() < expires_at
    order by issued_at desc limit 1;
  if found then
    if v_live_receipt.request_hash = p_request_hash then
      return jsonb_build_object('outcome', 'issued',
        'receipt_id', v_live_receipt.id, 'replayed', true,
        'mfa_age_seconds',
        extract(epoch from now() - v_session.last_totp_verified_at)::int);
    end if;
    return public.admin_internal_service_deny('service/issue_command_receipt',
      'IDEMPOTENCY_CONFLICT', p_command_name, 'command_receipt',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;

  -- Activity 續期只發生在 service-only path(Codex 修訂 1):成功簽發
  -- 即為一次已驗證的特權活動,於此同交易續期 idle 窗。
  update public.admin_sessions set last_activity_at = now()
    where id = v_session.id;

  -- TTL 由 table CHECK 固定為 60 秒;此處不接受任何覆寫輸入。
  insert into public.admin_command_authorizations (
    actor_principal_id, auth_session_id, command_name, idempotency_key,
    request_hash, bound_factor_id_snapshot, expires_at
  ) values (
    v_identity.audit_principal_id, p_auth_session_id, p_command_name,
    p_idempotency_key, p_request_hash, p_verified_factor_id,
    now() + interval '60 seconds'
  ) returning id into v_receipt_id;
  return jsonb_build_object('outcome', 'issued', 'receipt_id', v_receipt_id,
    'mfa_age_seconds',
    extract(epoch from now() - v_session.last_totp_verified_at)::int);
end;
$$;

-- Factor incident(spec §4.1、§5.3;硬性修正 #2、Codex 修訂 7):獨立隔離。
-- 不受 last-admin availability guard 阻止;絕不因使用者 reason/purpose 文字觸發。
-- 交易本體共用;actor 佐證由 wrapper 以型別化參數決定,不由任何文字推導。
create function public.admin_internal_isolate_factor(
  p_admin_user_id uuid,
  p_actor_type public.admin_actor_type,
  p_correlation_id text,
  p_runbook_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_operation_id uuid;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  if not found then
    return public.admin_internal_service_deny('service/isolate_factor',
      'FACTOR_BINDING_MISMATCH', 'factor_incident_isolated', 'admin_identity',
      p_actor_type, null, null, p_correlation_id, p_runbook_operation_id);
  end if;

  update public.admin_security_identities
    set state = 'recovery_pending', bound_factor_id = null,
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where admin_user_id = p_admin_user_id;
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'factor_incident'
    where admin_user_id = p_admin_user_id and revoked_at is null;

  insert into public.admin_security_operations
    (operation_type, target_principal_id, state, correlation_id)
  values ('factor_incident_isolation', v_identity.audit_principal_id,
          'step1_complete', p_correlation_id)
  returning id into v_operation_id;

  perform public.admin_internal_append_audit(
    p_actor_type, null, null, null, 'factor_incident_isolated', 'admin_identity',
    v_identity.audit_principal_id, 'success', null, null, null,
    p_correlation_id, null, p_runbook_operation_id);
  return jsonb_build_object('outcome', 'ok', 'operation_id', v_operation_id);
end;
$$;
revoke execute on function public.admin_internal_isolate_factor(
  uuid, public.admin_actor_type, text, uuid
) from public, anon, authenticated;

-- 自動偵測路徑(Edge factor 檢查觸發):actor_type='service'、無 runbook id。
create function public.svc_admin_isolate_factor_incident(
  p_admin_user_id uuid, p_correlation_id text
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select public.admin_internal_isolate_factor(
    p_admin_user_id, 'service', p_correlation_id, null);
$$;

-- Owner OOB runbook 路徑:actor_type='owner_out_of_band'、必填 runbook id。
create function public.svc_admin_isolate_factor_incident_oob(
  p_admin_user_id uuid, p_runbook_operation_id uuid
) returns jsonb
language sql security definer set search_path = public, pg_temp
as $$
  select public.admin_internal_isolate_factor(
    p_admin_user_id, 'owner_out_of_band', null, p_runbook_operation_id);
$$;

-- Edge 自身產生的預期 denial 入帳(Codex 修訂三-1):JWT 無效、primary
-- re-auth 逾時、provider verify 失敗、factor binding 不符等在 Edge 判定的
-- denial,經此入 audit+counter;DB 已入帳的 denial(mint、RPC、totp lock)
-- Edge 原樣回傳,不重複記錄。
create function public.svc_admin_record_edge_denial(
  p_resource_key text, p_code text, p_action text, p_admin_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_principal uuid;
begin
  select audit_principal_id into v_principal
    from public.admin_security_identities
    where admin_user_id = p_admin_user_id;
  -- 修訂四-1:已解析的 admin 是 actor,不是 target;target 留 null
  return public.admin_internal_service_deny(p_resource_key, p_code, p_action,
    'edge_request',
    case when v_principal is null then 'unknown' else 'admin'
      end::public.admin_actor_type,
    v_principal, null);
end;
$$;

-- Hash parity 測試用(僅 service_role;產品流程不經此)
create function public.svc_admin_canonical_hash_hex(p_fields jsonb)
returns text
language sql security definer set search_path = public, pg_temp
as $$
  select encode(public.admin_internal_canonical_hash(p_fields), 'hex');
$$;

create function public.svc_admin_refresh_session_mfa(
  p_admin_user_id uuid, p_auth_session_id uuid, p_verified_factor_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session public.admin_sessions;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  select * into v_session from public.admin_sessions
    where admin_user_id = p_admin_user_id and revoked_at is null for update;
  if v_identity.state is distinct from 'active' or v_session.id is null
     or v_session.auth_session_id is distinct from p_auth_session_id
     or now() - v_session.last_activity_at >= interval '15 minutes'
     or now() >= v_session.absolute_expires_at then
    return public.admin_internal_service_deny('service/refresh_session_mfa',
      'STALE_PRIVILEGED_SESSION', 'fresh_mfa_refreshed', 'admin_session',
      case when v_identity.audit_principal_id is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  if v_identity.bound_factor_id is distinct from p_verified_factor_id
     or v_session.bound_factor_id_snapshot
        is distinct from p_verified_factor_id then
    return public.admin_internal_service_deny('service/refresh_session_mfa',
      'FACTOR_BINDING_MISMATCH', 'fresh_mfa_refreshed', 'admin_session',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  -- fresh-MFA 與 activity 續期同屬 service-only path(Codex 修訂 1)
  update public.admin_sessions
    set last_totp_verified_at = now(), last_activity_at = now()
    where id = v_session.id;
  perform public.admin_internal_append_audit('admin',
    v_identity.audit_principal_id, v_session.id, p_auth_session_id,
    'fresh_mfa_refreshed', 'admin_session', v_identity.audit_principal_id,
    'success', null, 0, null, null);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_record_totp_outcome(
  p_admin_user_id uuid, p_success boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  if not found then
    return public.admin_internal_service_deny('service/totp_attempts',
      'STALE_PRIVILEGED_SESSION', 'totp_attempt_denied', 'admin_identity',
      'unknown', null, null);
  end if;
  -- 鎖定中一律回 MFA_LOCKED:不歸零、不累計(Edge 以 p_success=null 作 probe;
  -- 此 denial 在此入帳一次,Edge 不重複記錄)
  if v_identity.locked_until is not null and now() < v_identity.locked_until then
    return public.admin_internal_service_deny('service/totp_attempts',
      'MFA_LOCKED', 'totp_attempt_denied', 'admin_identity',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  -- 純 probe(p_success null;Task 8 Edge 每 action 前檢查鎖定):未鎖定時
  -- 不累計不歸零 —— 歸零語意保留給真正的 provider verify 成功,否則
  -- Edge 的 pre-action probe 會在每次失敗嘗試前清空計數,鎖定永不觸發
  if p_success is null then
    return jsonb_build_object('outcome', 'ok');
  end if;
  if p_success then
    update public.admin_security_identities
      set failed_totp_attempts = 0, locked_until = null, updated_at = now()
      where admin_user_id = p_admin_user_id;
    return jsonb_build_object('outcome', 'ok');
  end if;
  update public.admin_security_identities
    set failed_totp_attempts = failed_totp_attempts + 1, updated_at = now()
    where admin_user_id = p_admin_user_id
    returning * into v_identity;
  if v_identity.failed_totp_attempts >= 5 then
    update public.admin_security_identities
      set locked_until = now() + interval '15 minutes',
          failed_totp_attempts = 0
      where admin_user_id = p_admin_user_id;
    -- 鎖定轉換與其 denial 同一事件入帳(action=mfa_locked),避免雙計
    return public.admin_internal_service_deny('service/totp_attempts',
      'MFA_LOCKED', 'mfa_locked', 'admin_identity',
      'admin', v_identity.audit_principal_id, v_identity.audit_principal_id);
  end if;
  return jsonb_build_object('outcome', 'ok',
    'failed_attempts', v_identity.failed_totp_attempts);
end;
$$;

create function public.svc_admin_confirm_enrollment(
  p_admin_user_id uuid, p_verified_factor_id uuid, p_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_admin_user_id for update;
  if not found then
    return public.admin_internal_service_deny('service/confirm_enrollment',
      'FACTOR_BINDING_MISMATCH', 'confirm_admin_mfa_enrollment',
      'admin_identity', 'unknown', null, null, p_operation_id::text);
  end if;
  -- idempotent finalize(spec §4.4-2/-3):已 active 且 binding 相同 → ok
  if v_identity.state = 'active'
     and v_identity.bound_factor_id = p_verified_factor_id then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  if v_identity.state <> 'active_pending_mfa' then
    -- pre-session 使用者發起:actor=其 principal(修訂四-1)
    return public.admin_internal_service_deny('service/confirm_enrollment',
      'FACTOR_BINDING_MISMATCH', 'confirm_admin_mfa_enrollment',
      'admin_identity', 'pre_session_user', v_identity.audit_principal_id,
      v_identity.audit_principal_id, p_operation_id::text);
  end if;
  update public.admin_security_identities
    set state = 'active', bound_factor_id = p_verified_factor_id,
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where admin_user_id = p_admin_user_id;
  perform public.admin_internal_append_audit('pre_session_user',
    v_identity.audit_principal_id, null, null, 'enrollment_confirmed',
    'admin_identity', v_identity.audit_principal_id, 'success', null, null,
    null, p_operation_id::text);
  -- 不建立 privileged session(spec §4.4-3)
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_complete_reset_step2(p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_operation public.admin_security_operations;
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
  if v_operation.state <> 'step1_complete' then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_step2_complete',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  update public.admin_security_operations
    set state = 'step2_complete', current_step = 2,
        attempt_count = attempt_count + 1, updated_at = now()
    where id = p_operation_id;
  perform public.admin_internal_append_audit('service', null, null, null,
    'reset_step2_complete', 'security_operation',
    v_operation.target_principal_id, 'success', null, null, null,
    v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_complete_reset_step3(p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_operation public.admin_security_operations;
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
  if v_operation.state <> 'step2_complete' then
    return public.admin_internal_service_deny('service/reset_saga',
      'SECURITY_OPERATION_PENDING', 'reset_completed',
      'security_operation', 'service', null,
      v_operation.target_principal_id, v_operation.correlation_id);
  end if;
  update public.admin_security_operations
    set state = 'completed', current_step = 3, updated_at = now()
    where id = p_operation_id;
  update public.admin_security_identities
    set state = 'active_pending_mfa',
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where audit_principal_id = v_operation.target_principal_id
      and state = 'recovery_pending';
  perform public.admin_internal_append_audit('service', null, null, null,
    'reset_completed', 'security_operation', v_operation.target_principal_id,
    'success', null, null, null, v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

-- 擁有 role 提升(Codex 修訂 5):seed 與 runbook 一律經此,不手動改 role。
create function public.svc_admin_bootstrap_identity(
  p_user_id uuid, p_runbook_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_principal uuid;
begin
  perform public.admin_internal_lifecycle_lock();
  if exists (select 1 from public.admin_security_identities
      where admin_user_id = p_user_id) then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  insert into public.admin_audit_principals (user_id) values (p_user_id)
    on conflict (user_id) do update set user_id = excluded.user_id
    returning id into v_principal;
  insert into public.admin_security_identities (admin_user_id, audit_principal_id)
    values (p_user_id, v_principal);
  update public.profiles set role = 'admin' where id = p_user_id;
  perform public.admin_internal_append_audit('owner_out_of_band', v_principal,
    null, null, 'owner_bootstrap', 'admin_identity', v_principal, 'success',
    null, null, null, null, null, p_runbook_operation_id);
  return jsonb_build_object('outcome', 'ok', 'principal_id', v_principal);
end;
$$;

create function public.svc_admin_complete_oob_recovery(
  p_target_user_id uuid, p_runbook_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = p_target_user_id for update;
  if not found then
    return public.admin_internal_service_deny('service/oob_recovery',
      'SECURITY_OPERATION_PENDING', 'oob_recovery_completed',
      'admin_identity', 'owner_out_of_band', null, null, null,
      p_runbook_operation_id);
  end if;
  if v_identity.state = 'active_pending_mfa' then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  if v_identity.state <> 'recovery_pending' then
    -- spec §4.2:OOB 只走 recovery_pending -> active_pending_mfa,不直接設 active
    return public.admin_internal_service_deny('service/oob_recovery',
      'SECURITY_OPERATION_PENDING', 'oob_recovery_completed',
      'admin_identity', 'owner_out_of_band', null,
      v_identity.audit_principal_id, null, p_runbook_operation_id);
  end if;
  update public.admin_security_identities
    set state = 'active_pending_mfa',
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where admin_user_id = p_target_user_id;
  perform public.admin_internal_append_audit('owner_out_of_band',
    v_identity.audit_principal_id, null, null, 'oob_recovery_completed',
    'admin_identity', v_identity.audit_principal_id, 'success', null, null,
    null, null, null, p_runbook_operation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_tombstone_principal(
  p_principal_id uuid, p_runbook_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_principal public.admin_audit_principals;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_principal from public.admin_audit_principals
    where id = p_principal_id for update;
  if not found then
    return public.admin_internal_service_deny('service/tombstone_principal',
      'SECURITY_OPERATION_PENDING', 'principal_tombstoned',
      'audit_principal', 'owner_out_of_band', null, null, null,
      p_runbook_operation_id);
  end if;
  if v_principal.tombstoned_at is not null then
    return jsonb_build_object('outcome', 'ok', 'idempotent', true);
  end if;
  -- 事件本身永久不變;只斷開 principal ↔ user mapping(spec §10)
  update public.admin_audit_principals
    set user_id = null, tombstoned_at = now()
    where id = p_principal_id;
  perform public.admin_internal_append_audit('owner_out_of_band', null, null,
    null, 'principal_tombstoned', 'audit_principal', p_principal_id, 'success',
    null, null, null, null, null, p_runbook_operation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

create function public.svc_admin_mark_operation_stuck(p_operation_id uuid)
returns jsonb
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
  -- 卡住即 incident:不得放寬權限或改回 active(spec §8.3)
  update public.admin_security_operations
    set state = 'stuck', updated_at = now()
    where id = p_operation_id;
  perform public.admin_internal_append_audit('service', null, null, null,
    'reconciliation_timeout_incident', 'security_operation',
    v_operation.target_principal_id, 'stuck', null, null, null,
    v_operation.correlation_id);
  return jsonb_build_object('outcome', 'ok');
end;
$$;

revoke execute on function public.svc_admin_create_session(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.svc_admin_create_session(uuid, uuid, uuid, text, text)
  to service_role;
revoke execute on function public.svc_admin_refresh_session_mfa(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_refresh_session_mfa(uuid, uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_issue_command_receipt(
  uuid, uuid, text, text, bytea, uuid, boolean) from public, anon, authenticated;
grant execute on function public.svc_admin_issue_command_receipt(
  uuid, uuid, text, text, bytea, uuid, boolean) to service_role;
revoke execute on function public.svc_admin_record_totp_outcome(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.svc_admin_record_totp_outcome(uuid, boolean)
  to service_role;
revoke execute on function public.svc_admin_confirm_enrollment(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_confirm_enrollment(uuid, uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_isolate_factor_incident(uuid, text)
  from public, anon, authenticated;
grant execute on function public.svc_admin_isolate_factor_incident(uuid, text)
  to service_role;
revoke execute on function public.svc_admin_isolate_factor_incident_oob(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_isolate_factor_incident_oob(uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_record_edge_denial(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_record_edge_denial(text, text, text, uuid)
  to service_role;
revoke execute on function public.svc_admin_complete_reset_step2(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_complete_reset_step2(uuid)
  to service_role;
revoke execute on function public.svc_admin_complete_reset_step3(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_complete_reset_step3(uuid)
  to service_role;
revoke execute on function public.svc_admin_bootstrap_identity(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_bootstrap_identity(uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_complete_oob_recovery(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_complete_oob_recovery(uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_tombstone_principal(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_tombstone_principal(uuid, uuid)
  to service_role;
revoke execute on function public.svc_admin_mark_operation_stuck(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_admin_mark_operation_stuck(uuid)
  to service_role;
revoke execute on function public.svc_admin_canonical_hash_hex(jsonb)
  from public, anon, authenticated;
grant execute on function public.svc_admin_canonical_hash_hex(jsonb)
  to service_role;
