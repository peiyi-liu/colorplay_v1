-- supabase/migrations/20260808000800_admin_lifecycle_commands.sql

-- supabase/migrations/20260808000800_admin_lifecycle_commands.sql

-- 命令共用前置(spec §6.2 步驟 5;Codex 修訂 2):鎖定順序固定 identity →
-- session → receipt。先 SELECT ... FOR UPDATE 取回候選 receipt,逐欄驗證
-- ownership、session、command、idempotency key、request hash、factor snapshot、
-- identity/session 狀態與 fresh-MFA 要求;**全部通過後**才以重複全部已驗證
-- 綁定條件的謂詞 UPDATE 消耗。任何不符都不寫 consumed_at —— 錯誤的 caller
-- 或不符的 request 永遠無法消耗 receipt。本 function 不寫 admin_sessions
--(修訂 1:activity 續期只在 service-only path)。
create function public.admin_internal_execute_command(
  p_receipt_id uuid, p_command_name text, p_idempotency_key text,
  p_request_hash bytea, p_requires_fresh_totp boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session public.admin_sessions;
  v_receipt public.admin_command_authorizations;
  v_consumed uuid;
begin
  perform public.admin_internal_lifecycle_lock();
  select * into v_identity from public.admin_security_identities
    where admin_user_id = auth.uid() for update;
  select * into v_session from public.admin_sessions
    where admin_user_id = auth.uid() and revoked_at is null for update;
  select * into v_receipt from public.admin_command_authorizations
    where id = p_receipt_id for update;

  -- 先驗證,不消耗
  if v_receipt.id is null
     or v_receipt.consumed_at is not null
     or now() >= v_receipt.expires_at
     or v_identity.admin_user_id is null
     or v_session.id is null
     or v_receipt.actor_principal_id is distinct from v_identity.audit_principal_id
     or v_receipt.auth_session_id is distinct from v_session.auth_session_id
     or v_receipt.command_name is distinct from p_command_name
     or v_receipt.idempotency_key is distinct from p_idempotency_key
     or v_receipt.request_hash is distinct from p_request_hash
     or v_receipt.bound_factor_id_snapshot
        is distinct from v_identity.bound_factor_id
     or v_receipt.bound_factor_id_snapshot
        is distinct from v_session.bound_factor_id_snapshot then
    return jsonb_build_object('ok', false, 'code', 'AUTHORIZATION_RECEIPT_INVALID');
  end if;
  if v_identity.state is distinct from 'active'
     or now() - v_session.last_activity_at >= interval '15 minutes'
     or now() >= v_session.absolute_expires_at then
    return jsonb_build_object('ok', false, 'code', 'STALE_PRIVILEGED_SESSION');
  end if;
  if p_requires_fresh_totp
     and now() - v_session.last_totp_verified_at > interval '10 minutes' then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_MFA');
  end if;

  -- 消耗:謂詞重複全部已驗證綁定;行鎖 + consumed_at 謂詞使並發第二消耗落空
  update public.admin_command_authorizations
    set consumed_at = now()
    where id = p_receipt_id and consumed_at is null and expires_at > now()
      and actor_principal_id = v_identity.audit_principal_id
      and auth_session_id = v_session.auth_session_id
      and command_name = p_command_name
      and idempotency_key = p_idempotency_key
      and request_hash = p_request_hash
      and bound_factor_id_snapshot = v_identity.bound_factor_id
    returning id into v_consumed;
  if v_consumed is null then
    return jsonb_build_object('ok', false, 'code', 'AUTHORIZATION_RECEIPT_INVALID');
  end if;

  return jsonb_build_object('ok', true,
    'principal_id', v_identity.audit_principal_id,
    'session_id', v_session.id,
    'auth_session_id', v_session.auth_session_id,
    'mfa_age_seconds',
    extract(epoch from now() - v_session.last_totp_verified_at)::int);
end;
$$;
revoke execute on function public.admin_internal_execute_command(
  uuid, text, text, bytea, boolean) from public, anon, authenticated;

-- 命令 denial 佐證解析(Codex 修訂 3):唯讀取得 caller 的 principal/session
-- 佐證,轉呼統一 admin_internal_deny(audit + counter + typed outcome 同交易)。
create function public.admin_internal_command_deny(
  p_command_name text, p_target_principal_id uuid, p_code text,
  p_reason_or_purpose text
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
    p_target_principal_id, p_reason_or_purpose, null);
end;
$$;
revoke execute on function public.admin_internal_command_deny(text, uuid, text, text)
  from public, anon, authenticated;

-- 成功收尾:audit + execution row + 統一回傳(redacted result 不含任何明文)
create function public.admin_internal_finalize_command(
  p_gate jsonb, p_command_name text, p_idempotency_key text,
  p_request_hash bytea, p_receipt_id uuid, p_target_principal_id uuid,
  p_reason_or_purpose text, p_before_after jsonb, p_result jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_audit_id uuid;
begin
  v_audit_id := public.admin_internal_append_audit('admin',
    (p_gate ->> 'principal_id')::uuid, (p_gate ->> 'session_id')::uuid,
    (p_gate ->> 'auth_session_id')::uuid, p_command_name, 'admin_command',
    p_target_principal_id, 'success', p_reason_or_purpose,
    (p_gate ->> 'mfa_age_seconds')::int, p_before_after, null);
  insert into public.admin_command_executions (
    actor_principal_id, command_name, idempotency_key, request_hash,
    receipt_id, audit_event_id, result_code, redacted_result_receipt,
    completed_at
  ) values (
    (p_gate ->> 'principal_id')::uuid, p_command_name, p_idempotency_key,
    p_request_hash, p_receipt_id, v_audit_id, 'success', p_result, now());
  return jsonb_build_object('outcome', 'ok', 'audit_event_id', v_audit_id)
    || coalesce(p_result, '{}'::jsonb);
end;
$$;
revoke execute on function public.admin_internal_finalize_command(
  jsonb, text, text, bytea, uuid, uuid, text, jsonb, jsonb
) from public, anon, authenticated;

-- 代表命令全文:deactivate_admin。全部命令共用同一流程:reason 重驗 →
-- gate(鎖定+逐欄驗證+謂詞消耗)→ 業務交易 → finalize;
-- 每個 denial 一律 admin_internal_command_deny(修訂 3)。
create function public.deactivate_admin(
  p_receipt_id uuid, p_idempotency_key text,
  p_target_principal_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_target public.admin_security_identities;
  v_remaining integer;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'reason', btrim(coalesce(p_reason, '')),
    'target_principal_id', p_target_principal_id::text));
begin
  -- reason server 重驗(spec §8.2);denial 前不做任何狀態變更
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('deactivate_admin',
      p_target_principal_id, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;

  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'deactivate_admin', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('deactivate_admin',
      p_target_principal_id, v_gate ->> 'code', p_reason);
  end if;

  select * into v_target from public.admin_security_identities
    where audit_principal_id = p_target_principal_id for update;
  if not found or v_target.state <> 'active' then
    return public.admin_internal_command_deny('deactivate_admin',
      p_target_principal_id, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;

  -- last-admin 保護(spec §4.1):轉換後至少一位 active
  select count(*) into v_remaining from public.admin_security_identities
    where state = 'active' and audit_principal_id <> p_target_principal_id;
  if v_remaining = 0 then
    return public.admin_internal_command_deny('deactivate_admin',
      p_target_principal_id, 'LAST_ADMIN_PROTECTED', p_reason);
  end if;

  update public.admin_security_identities
    set state = 'deactivated', bound_factor_id = null,
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where audit_principal_id = p_target_principal_id;
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'admin_deactivated'
    where admin_user_id = v_target.admin_user_id and revoked_at is null;

  return public.admin_internal_finalize_command(v_gate, 'deactivate_admin',
    p_idempotency_key, v_request_hash, p_receipt_id, p_target_principal_id,
    p_reason, jsonb_build_object('before', 'active', 'after', 'deactivated'),
    jsonb_build_object('target_principal_id', p_target_principal_id,
      'result', 'deactivated'));
end;
$$;
revoke execute on function public.deactivate_admin(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.deactivate_admin(uuid, text, uuid, text)
  to authenticated;

create function public.reactivate_admin(
  p_receipt_id uuid, p_idempotency_key text,
  p_target_principal_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_target public.admin_security_identities;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'reason', btrim(coalesce(p_reason, '')),
    'target_principal_id', p_target_principal_id::text));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('reactivate_admin',
      p_target_principal_id, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'reactivate_admin', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('reactivate_admin',
      p_target_principal_id, v_gate ->> 'code', p_reason);
  end if;
  select * into v_target from public.admin_security_identities
    where audit_principal_id = p_target_principal_id for update;
  if not found or v_target.state <> 'deactivated' then
    return public.admin_internal_command_deny('reactivate_admin',
      p_target_principal_id, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  update public.admin_security_identities
    set state = 'active_pending_mfa', lifecycle_version = lifecycle_version + 1,
        updated_at = now()
    where audit_principal_id = p_target_principal_id;
  return public.admin_internal_finalize_command(v_gate, 'reactivate_admin',
    p_idempotency_key, v_request_hash, p_receipt_id, p_target_principal_id,
    p_reason,
    jsonb_build_object('before', 'deactivated', 'after', 'active_pending_mfa'),
    jsonb_build_object('target_principal_id', p_target_principal_id,
      'result', 'active_pending_mfa'));
end;
$$;
revoke execute on function public.reactivate_admin(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.reactivate_admin(uuid, text, uuid, text)
  to authenticated;

create function public.revoke_admin_session(
  p_receipt_id uuid, p_idempotency_key text, p_session_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_target_session public.admin_sessions;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'reason', btrim(coalesce(p_reason, '')),
    'session_id', p_session_id::text));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('revoke_admin_session',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'revoke_admin_session', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('revoke_admin_session',
      null, v_gate ->> 'code', p_reason);
  end if;
  select * into v_target_session from public.admin_sessions
    where id = p_session_id for update;
  if not found or v_target_session.revoked_at is not null then
    return public.admin_internal_command_deny('revoke_admin_session',
      v_target_session.audit_principal_id, 'AUTHORIZATION_RECEIPT_INVALID',
      p_reason);
  end if;
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'revoked_by_admin'
    where id = p_session_id;
  return public.admin_internal_finalize_command(v_gate, 'revoke_admin_session',
    p_idempotency_key, v_request_hash, p_receipt_id,
    v_target_session.audit_principal_id, p_reason,
    jsonb_build_object('before', 'active', 'after', 'revoked'),
    jsonb_build_object('session_id', p_session_id, 'result', 'revoked'));
end;
$$;
revoke execute on function public.revoke_admin_session(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.revoke_admin_session(uuid, text, uuid, text)
  to authenticated;

-- reset saga step 1(spec §4.5):PG 原子;step 2/3 由 Edge/reconcile 走
-- service path 完成。回傳含 operation_id 與 target_user_id 供 Edge 續跑。
create function public.reset_admin_mfa(
  p_receipt_id uuid, p_idempotency_key text,
  p_target_principal_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_target public.admin_security_identities;
  v_remaining integer;
  v_operation_id uuid;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'reason', btrim(coalesce(p_reason, '')),
    'target_principal_id', p_target_principal_id::text));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('reset_admin_mfa',
      p_target_principal_id, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'reset_admin_mfa', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('reset_admin_mfa',
      p_target_principal_id, v_gate ->> 'code', p_reason);
  end if;
  select * into v_target from public.admin_security_identities
    where audit_principal_id = p_target_principal_id for update;
  if not found or v_target.state <> 'active' then
    return public.admin_internal_command_deny('reset_admin_mfa',
      p_target_principal_id, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  select count(*) into v_remaining from public.admin_security_identities
    where state = 'active' and audit_principal_id <> p_target_principal_id;
  if v_remaining = 0 then
    -- 最後一位不能由產品 reset(spec §4.5);已知事故走 OOB isolation
    return public.admin_internal_command_deny('reset_admin_mfa',
      p_target_principal_id, 'LAST_ADMIN_PROTECTED', p_reason);
  end if;
  update public.admin_security_identities
    set state = 'recovery_pending', bound_factor_id = null,
        lifecycle_version = lifecycle_version + 1, updated_at = now()
    where audit_principal_id = p_target_principal_id;
  update public.admin_sessions
    set revoked_at = now(), revoke_reason = 'mfa_reset'
    where admin_user_id = v_target.admin_user_id and revoked_at is null;
  insert into public.admin_security_operations
    (operation_type, target_principal_id, state)
  values ('reset_admin_mfa', p_target_principal_id, 'step1_complete')
  returning id into v_operation_id;
  return public.admin_internal_finalize_command(v_gate, 'reset_admin_mfa',
    p_idempotency_key, v_request_hash, p_receipt_id, p_target_principal_id,
    p_reason,
    jsonb_build_object('before', 'active', 'after', 'recovery_pending'),
    jsonb_build_object('operation_id', v_operation_id,
      'target_user_id', v_target.admin_user_id::text,
      'result', 'recovery_pending'));
end;
$$;
revoke execute on function public.reset_admin_mfa(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.reset_admin_mfa(uuid, text, uuid, text)
  to authenticated;

create function public.issue_admin_invitation(
  p_receipt_id uuid, p_idempotency_key text, p_invited_email text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_token text;
  v_invitation_id uuid;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'invited_email', lower(btrim(coalesce(p_invited_email, ''))),
    'reason', btrim(coalesce(p_reason, ''))));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    return public.admin_internal_command_deny('issue_admin_invitation',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'issue_admin_invitation', p_idempotency_key,
    v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('issue_admin_invitation',
      null, v_gate ->> 'code', p_reason);
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.admin_invitations
    (issuer_principal_id, invited_email, token_hash, expires_at)
  values ((v_gate ->> 'principal_id')::uuid, v_email,
    sha256(convert_to(v_token, 'utf8')), now() + interval '72 hours')
  returning id into v_invitation_id;
  -- 明文 token 只在最終回傳附加;finalize 的 redacted result 不含 token
  return public.admin_internal_finalize_command(v_gate,
    'issue_admin_invitation', p_idempotency_key, v_request_hash, p_receipt_id,
    null, p_reason, null,
    jsonb_build_object('invitation_id', v_invitation_id, 'result', 'issued'))
    || jsonb_build_object('invitation_token', v_token);
end;
$$;
revoke execute on function public.issue_admin_invitation(uuid, text, text, text)
  from public, anon;
grant execute on function public.issue_admin_invitation(uuid, text, text, text)
  to authenticated;

create function public.revoke_admin_invitation(
  p_receipt_id uuid, p_idempotency_key text, p_invitation_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_invitation public.admin_invitations;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'invitation_id', p_invitation_id::text,
    'reason', btrim(coalesce(p_reason, ''))));
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    return public.admin_internal_command_deny('revoke_admin_invitation',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_reason);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'revoke_admin_invitation', p_idempotency_key,
    v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('revoke_admin_invitation',
      null, v_gate ->> 'code', p_reason);
  end if;
  select * into v_invitation from public.admin_invitations
    where id = p_invitation_id for update;
  if not found or v_invitation.status <> 'pending' then
    return public.admin_internal_command_deny('revoke_admin_invitation',
      null, 'INVITATION_INVALID', p_reason);
  end if;
  update public.admin_invitations
    set status = 'revoked', revoked_at = now()
    where id = p_invitation_id;
  return public.admin_internal_finalize_command(v_gate,
    'revoke_admin_invitation', p_idempotency_key, v_request_hash, p_receipt_id,
    null, p_reason,
    jsonb_build_object('before', 'pending', 'after', 'revoked'),
    jsonb_build_object('invitation_id', p_invitation_id, 'result', 'revoked'));
end;
$$;
revoke execute on function public.revoke_admin_invitation(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.revoke_admin_invitation(uuid, text, uuid, text)
  to authenticated;

-- Reveal(spec §7):一次一列一欄;audit 不含明文;明文只在回傳 value。
create function public.admin_reveal_field(
  p_receipt_id uuid, p_idempotency_key text, p_domain text, p_resource text,
  p_row_id uuid, p_column text, p_purpose text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_value text;
  v_request_hash bytea := public.admin_internal_canonical_hash(jsonb_build_object(
    'column', p_column,
    'domain', p_domain,
    'purpose', btrim(coalesce(p_purpose, '')),
    'resource', p_resource,
    'row_id', p_row_id::text));
begin
  if char_length(btrim(coalesce(p_purpose, ''))) < 10 then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_purpose);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'admin_reveal_field', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, v_gate ->> 'code', p_purpose);
  end if;
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and domain = p_domain
        and column_name = p_column and class = 'personal') then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'COLUMN_NOT_ALLOWED', p_purpose);
  end if;
  -- uuid 形態僅適用具 id 欄且 id 為 catalog open/internal 的表(spec §1.3);
  -- id-less 表走 row_key overload
  if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_resource
        and column_name = 'id')
     or not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and column_name = 'id'
        and surface = 'browser' and class in ('open', 'internal')) then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'RESOURCE_NOT_ALLOWED', p_purpose);
  end if;
  execute format('select %I::text from public.%I where id = $1',
    p_column, p_resource) into v_value using p_row_id;
  -- before_after_redacted 只記位置與 purpose,絕不記明文(spec §10)
  return public.admin_internal_finalize_command(v_gate, 'admin_reveal_field',
    p_idempotency_key, v_request_hash, p_receipt_id, null, p_purpose,
    jsonb_build_object('resource', p_resource, 'row_id', p_row_id::text,
      'column', p_column),
    jsonb_build_object('resource', p_resource, 'column', p_column,
      'result', 'revealed'))
    || jsonb_build_object('value', v_value);
end;
$$;
revoke execute on function public.admin_reveal_field(
  uuid, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.admin_reveal_field(
  uuid, text, text, text, uuid, text, text) to authenticated;

-- Reveal row_key 形態(spec §1.3):與 admin_get_resource_detail jsonb overload
-- 同一定址契約;hash 的 row_key 欄位值=canonical JSON 文字(鍵依字母序,
-- 同 §1.3.5 的 URL 編碼規則,Edge 端可精確重現)。
create function public.admin_reveal_field(
  p_receipt_id uuid, p_idempotency_key text, p_domain text, p_resource text,
  p_row_key jsonb, p_column text, p_purpose text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_value text;
  v_key_columns text[];
  v_where text;
  v_row_key_canonical text;
  v_request_hash bytea;
begin
  if char_length(btrim(coalesce(p_purpose, ''))) < 10 then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_purpose);
  end if;
  -- 非 object 無法建立 canonical 綁定;receipt 未消耗即拒絕
  if jsonb_typeof(p_row_key) is distinct from 'object' then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'COLUMN_NOT_ALLOWED', p_purpose);
  end if;
  select '{' || coalesce(string_agg(
      to_json(key)::text || ':' || to_json(value)::text,
      ',' order by key collate "C"), '') || '}'
    into v_row_key_canonical from jsonb_each_text(p_row_key);
  v_request_hash := public.admin_internal_canonical_hash(jsonb_build_object(
    'column', p_column, 'domain', p_domain,
    'purpose', btrim(coalesce(p_purpose, '')), 'resource', p_resource,
    'row_key', v_row_key_canonical));
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'admin_reveal_field', p_idempotency_key, v_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, v_gate ->> 'code', p_purpose);
  end if;
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and domain = p_domain
        and column_name = p_column and class = 'personal') then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'COLUMN_NOT_ALLOWED', p_purpose);
  end if;
  -- 定址資格與形狀:與 Task 6b detail jsonb overload 同一契約
  v_key_columns := public.admin_internal_key_columns(p_resource);
  if v_key_columns is null or exists (
      select 1 from unnest(v_key_columns) kc
      where not exists (select 1 from public.admin_sensitivity_catalog
        where resource = p_resource and column_name = kc
          and surface = 'browser' and class in ('open', 'internal'))) then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'RESOURCE_NOT_ALLOWED', p_purpose);
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_row_key) k)
       is distinct from
     (select array_agg(kc order by kc) from unnest(v_key_columns) kc)
     or exists (select 1 from unnest(v_key_columns) kc
          where p_row_key ->> kc is null) then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'COLUMN_NOT_ALLOWED', p_purpose);
  end if;
  select string_agg(format('%I::text = %L', kc, p_row_key ->> kc), ' and ')
    into v_where from unnest(v_key_columns) kc;
  execute format('select %I::text from public.%I where %s',
    p_column, p_resource, v_where) into v_value;
  -- before_after_redacted 只記位置與 purpose,絕不記明文(spec §10)
  return public.admin_internal_finalize_command(v_gate, 'admin_reveal_field',
    p_idempotency_key, v_request_hash, p_receipt_id, null, p_purpose,
    jsonb_build_object('resource', p_resource,
      'row_key', v_row_key_canonical, 'column', p_column),
    jsonb_build_object('resource', p_resource, 'column', p_column,
      'result', 'revealed'))
    || jsonb_build_object('value', v_value);
end;
$$;
revoke execute on function public.admin_reveal_field(
  uuid, text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.admin_reveal_field(
  uuid, text, text, text, jsonb, text, text) to authenticated;

create function public.reconcile_admin_security_operation(
  p_receipt_id uuid, p_idempotency_key text, p_operation_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_operation public.admin_security_operations;
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
  if not found or v_operation.state in ('completed', 'stuck') then
    return public.admin_internal_command_deny('reconcile_admin_security_operation',
      v_operation.target_principal_id, 'SECURITY_OPERATION_PENDING', p_reason);
  end if;
  -- 只標記立即重試;實際續跑由 admin-reconcile 的 service path 執行
  update public.admin_security_operations
    set next_retry_at = now(), updated_at = now()
    where id = p_operation_id;
  return public.admin_internal_finalize_command(v_gate,
    'reconcile_admin_security_operation', p_idempotency_key, v_request_hash,
    p_receipt_id, v_operation.target_principal_id, p_reason, null,
    jsonb_build_object('operation_id', p_operation_id,
      'result', 'reconcile_requested'));
end;
$$;
revoke execute on function public.reconcile_admin_security_operation(
  uuid, text, uuid, text) from public, anon;
grant execute on function public.reconcile_admin_security_operation(
  uuid, text, uuid, text) to authenticated;

create function public.accept_admin_invitation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_invitation public.admin_invitations;
  v_email text;
  v_principal uuid;
begin
  if auth.uid() is null then
    -- 未登入的預期 denial 也入帳(修訂三-1):unknown actor、無 principal
    return public.admin_internal_deny('command/accept_admin_invitation',
      'INVITATION_INVALID', 'accept_admin_invitation', 'admin_invitation',
      'unknown', null, null, null, null, null, null);
  end if;
  perform public.admin_internal_lifecycle_lock();
  select u.email into v_email from auth.users u where u.id = auth.uid();
  select * into v_invitation from public.admin_invitations
    where token_hash = sha256(convert_to(p_token, 'utf8')) for update;
  -- 重放、逾期、撤銷、錯帳號一律同碼,不洩漏存在性(spec §4.3)
  if v_invitation.id is null or v_invitation.status <> 'pending'
     or now() >= v_invitation.expires_at
     or lower(v_invitation.invited_email) is distinct from lower(v_email) then
    -- 修訂 3:denial 三件套(audit+counter+typed outcome)經統一 helper 提交
    return public.admin_internal_deny('command/accept_admin_invitation',
      'INVITATION_INVALID', 'accept_admin_invitation', 'admin_invitation',
      'pre_session_user', null, null,
      nullif(coalesce(auth.jwt() ->> 'session_id',
        current_setting('request.jwt.claim.session_id', true)), '')::uuid,
      null, null, null);
  end if;

  insert into public.admin_audit_principals (user_id) values (auth.uid())
    on conflict (user_id) do update set user_id = excluded.user_id
    returning id into v_principal;
  insert into public.admin_security_identities (admin_user_id, audit_principal_id)
    values (auth.uid(), v_principal)
    on conflict (admin_user_id) do nothing;
  update public.profiles set role = 'admin' where id = auth.uid();
  update public.admin_invitations
    set status = 'accepted', accepted_at = now(), accepted_principal_id = v_principal
    where id = v_invitation.id;

  perform public.admin_internal_append_audit('pre_session_user', v_principal, null,
    nullif(coalesce(auth.jwt() ->> 'session_id',
      current_setting('request.jwt.claim.session_id', true)), '')::uuid,
    'accept_admin_invitation', 'admin_invitation', v_principal,
    'success', null, null, null, null);
  return jsonb_build_object('outcome', 'ok');
end;
$$;
revoke execute on function public.accept_admin_invitation(text) from public, anon;
grant execute on function public.accept_admin_invitation(text) to authenticated;
