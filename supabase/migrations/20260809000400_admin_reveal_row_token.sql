-- supabase/migrations/20260809000400_admin_reveal_row_token.sql
--
-- Task 13A-4(spec §7、§1.3.6;2026-08-18 owner 裁定):
-- admin_reveal_field 補上 server-issued opaque row token 形態。
--
-- 為什麼需要這一片:13A-1 讓 admin_list_resource 為每列簽發 opaque token,
-- 且 admin_get_resource_detail 已有 token overload,但 reveal 只有 uuid 與
-- jsonb 形態。jsonb 形態的 request hash 綁的是「解碼後物件的 canonical 文字」,
-- Edge 若要湊出相同 hash 就必須解碼 token 並複製 DB 的 collate "C" 正規化
-- 規則 —— 那正是可信邊界禁止的「Edge 自行重建 row_key」,也是 hash drift
-- 的來源。改由 DB 提供 token 形態,Edge 只需把收到的字串原樣入 hash。
--
-- 依賴 20260809000200(admin_internal_decode_row_key)。

-- ════════════════════════════════════════════════════════════════════
-- 共用內部實作:三個 reveal 形態的差異只在「如何建立 canonical 綁定」
-- ════════════════════════════════════════════════════════════════════

-- p_request_hash 由呼叫端(各定址形態的 wrapper)算好後傳入;null 代表該
-- 形態無法建立 canonical 綁定(非 object row_key、無法解碼的 token)。
-- p_audit_locator 為 spec §10 的 before_after_redacted 位置描述,只記位置,
-- 絕不含明文。
create function public.admin_internal_reveal_field_with_key(
  p_receipt_id uuid, p_idempotency_key text, p_domain text, p_resource text,
  p_row_key jsonb, p_column text, p_purpose text,
  p_request_hash bytea, p_audit_locator jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_gate jsonb;
  v_value text;
  v_key_columns text[];
  v_where text;
begin
  if char_length(btrim(coalesce(p_purpose, ''))) < 10 then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'AUTHORIZATION_RECEIPT_INVALID', p_purpose);
  end if;
  -- 無法建立 canonical 綁定 → receipt 未消耗即拒絕。順序刻意排在 purpose
  -- 檢查之後,與既有 jsonb overload 的 pre-gate denial 行為逐字相同
  -- (purpose 與 row_key 同時無效時仍回 AUTHORIZATION_RECEIPT_INVALID)。
  if p_request_hash is null then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'COLUMN_NOT_ALLOWED', p_purpose);
  end if;
  v_gate := public.admin_internal_execute_command(
    p_receipt_id, 'admin_reveal_field', p_idempotency_key, p_request_hash, true);
  if not (v_gate ->> 'ok')::boolean then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, v_gate ->> 'code', p_purpose);
  end if;
  -- personal 欄資格:surface 雙重謂詞(spec §7)
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and domain = p_domain
        and column_name = p_column and class = 'personal'
        and surface = 'browser') then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'COLUMN_NOT_ALLOWED', p_purpose,
      (v_gate ->> 'mfa_age_seconds')::int);
  end if;
  -- 定址資格與形狀:與 Task 6b detail jsonb overload 同一契約
  v_key_columns := public.admin_internal_key_columns(p_resource);
  if v_key_columns is null or exists (
      select 1 from unnest(v_key_columns) kc
      where not exists (select 1 from public.admin_sensitivity_catalog
        where resource = p_resource and column_name = kc
          and surface = 'browser' and class in ('open', 'internal'))) then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'RESOURCE_NOT_ALLOWED', p_purpose,
      (v_gate ->> 'mfa_age_seconds')::int);
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_row_key) k)
       is distinct from
     (select array_agg(kc order by kc) from unnest(v_key_columns) kc)
     or exists (select 1 from unnest(v_key_columns) kc
          where p_row_key ->> kc is null) then
    return public.admin_internal_command_deny('admin_reveal_field',
      null, 'COLUMN_NOT_ALLOWED', p_purpose,
      (v_gate ->> 'mfa_age_seconds')::int);
  end if;
  select string_agg(format('%I::text = %L', kc, p_row_key ->> kc), ' and ')
    into v_where from unnest(v_key_columns) kc;
  execute format('select %I::text from public.%I where %s',
    p_column, p_resource, v_where) into v_value;
  return public.admin_internal_finalize_command(v_gate, 'admin_reveal_field',
    p_idempotency_key, p_request_hash, p_receipt_id, null, p_purpose,
    p_audit_locator,
    jsonb_build_object('resource', p_resource, 'column', p_column,
      'result', 'revealed'))
    || jsonb_build_object('value', v_value);
end;
$$;
revoke execute on function public.admin_internal_reveal_field_with_key(
  uuid, text, text, text, jsonb, text, text, bytea, jsonb)
  from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- jsonb 形態:改為薄 wrapper,對外契約(hash、denial 碼、audit 形狀)不變
-- ════════════════════════════════════════════════════════════════════

create or replace function public.admin_reveal_field(
  p_receipt_id uuid, p_idempotency_key text, p_domain text, p_resource text,
  p_row_key jsonb, p_column text, p_purpose text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_canonical text;
begin
  -- 非 object 無法建立 canonical 綁定;canonical 為 null 時 wrapper 傳 null
  -- hash,由共用實作走 pre-gate denial(碼與順序同修訂前)。
  if jsonb_typeof(p_row_key) = 'object' then
    -- null 值輸出字面 null,與 admin_internal_canonical_hash 同一規則
    -- (§1.3.5);否則 null 值 key 會被 string_agg 靜默丟棄,兩端分歧。
    select '{' || coalesce(string_agg(
        to_json(key)::text || ':' ||
        case when value is null then 'null' else to_json(value)::text end,
        ',' order by key collate "C"), '') || '}'
      into v_canonical from jsonb_each_text(p_row_key);
  end if;
  return public.admin_internal_reveal_field_with_key(
    p_receipt_id, p_idempotency_key, p_domain, p_resource, p_row_key,
    p_column, p_purpose,
    case when v_canonical is null then null
      else public.admin_internal_canonical_hash(jsonb_build_object(
        'column', p_column, 'domain', p_domain,
        'purpose', btrim(coalesce(p_purpose, '')), 'resource', p_resource,
        'row_key', v_canonical)) end,
    jsonb_build_object('resource', p_resource,
      'row_key', v_canonical, 'column', p_column));
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- token 形態:hash 綁「逐字的 opaque token」
-- ════════════════════════════════════════════════════════════════════

-- 為什麼 hash 欄位叫 row_token 而非 row_key:owner 2026-08-18 裁定兩形態
-- 視為不同的邏輯請求 —— 即使指向同一列,token 形態與 jsonb 形態的 hash 必
-- 須不同,receipt 不得跨形態重用。這讓 Edge 完全不需要知道 canonical 規則:
--   * 同一列重試 → server 簽發的 token 逐字相同 → hash 相同(冪等成立)
--   * 手工變造的 token → hash 不同 → receipt 對不上 → fail closed
create function public.admin_reveal_field(
  p_receipt_id uuid, p_idempotency_key text, p_domain text, p_resource text,
  p_row_token text, p_column text, p_purpose text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_key jsonb;
  v_canonical text;
begin
  v_key := public.admin_internal_decode_row_key(p_row_token);
  if v_key is not null then
    select '{' || coalesce(string_agg(
        to_json(key)::text || ':' ||
        case when value is null then 'null' else to_json(value)::text end,
        ',' order by key collate "C"), '') || '}'
      into v_canonical from jsonb_each_text(v_key);
  end if;
  return public.admin_internal_reveal_field_with_key(
    p_receipt_id, p_idempotency_key, p_domain, p_resource, v_key,
    p_column, p_purpose,
    case when v_key is null then null
      else public.admin_internal_canonical_hash(jsonb_build_object(
        'column', p_column, 'domain', p_domain,
        'purpose', btrim(coalesce(p_purpose, '')), 'resource', p_resource,
        'row_token', p_row_token)) end,
    -- audit 同時記解碼後位置與原始 token:前者讓稽核可讀,後者可與 client
    -- 實際送出的請求對帳。兩者都只是 PK 位置,不含明文。
    jsonb_build_object('resource', p_resource, 'row_key', v_canonical,
      'row_token', p_row_token, 'column', p_column));
end;
$$;
revoke execute on function public.admin_reveal_field(
  uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_reveal_field(
  uuid, text, text, text, text, text, text) to authenticated;
