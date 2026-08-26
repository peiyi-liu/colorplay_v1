-- supabase/migrations/20260809000200_admin_pagination_row_key.sql
--
-- Task 13A-1(spec §7、§1.3.6):server-issued cursor 與 opaque row key。
-- 依賴 20260809000100:本片所有 denial 都經 admin_internal_deny 的新 envelope。

-- ════════════════════════════════════════════════════════════════════
-- 13A-1:server-issued cursor 與 row key
-- ════════════════════════════════════════════════════════════════════

-- 2026-08-19 review 修正(Critical):Postgres 的 encode(bytea,'base64')
-- 每 76 字元插入一個換行(RFC 2045 MIME 慣例)。opaque token 的簽發端
-- (本函式與下方 admin_list_resource／admin_query_audit 的 cursor 簽發)
-- 原本只做 +/→-_ 與去尾端 =,從未移除這個換行;解碼端
-- admin_internal_decode_row_key 重算 padding 時會把換行也算進
-- length(),導致 padding 位數算錯、base64 解碼失敗。任何 payload 超過
-- 76 base64 字元(binding 欄位本身就是 64 hex 字元,幾乎所有 cursor
-- 與雙欄以上的複合主鍵 row key 都會超過)都會中招 —— 意即 13A-1 的
-- keyset 分頁與 13A-4 的複合主鍵定址在此修正前實質上完全不可用
-- (以真實 60 筆資料與真實兩欄 UUID 主鍵各自實測驗證過)。
-- 集中在這裡一次去除,三處簽發端共用,避免各自重造又各自漏改。
create function public.admin_internal_base64url_encode(p_bytes bytea)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select rtrim(
    translate(regexp_replace(encode(p_bytes, 'base64'), '\s+', '', 'g'),
      '+/', '-_'),
    '=');
$$;
revoke execute on function public.admin_internal_base64url_encode(bytea)
  from public, anon, authenticated;

-- base64url(canonical JSON,鍵依字母序;值一律 JSON string)。與
-- admin_internal_canonical_hash 採同一 "C" collation 排序慣例,確保
-- server 自身在簽發/驗證兩端逐字一致。
create function public.admin_internal_encode_row_key(
  p_row jsonb, p_key_columns text[]
) returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select public.admin_internal_base64url_encode(convert_to(
    '{' || coalesce((
      select string_agg(
        to_json(k)::text || ':' || to_json(p_row ->> k)::text,
        ',' order by k collate "C")
      from unnest(p_key_columns) k), '') || '}',
    'utf8'));
$$;
revoke execute on function public.admin_internal_encode_row_key(jsonb, text[])
  from public, anon, authenticated;

-- 解碼 client 帶回的 opaque token。任何格式問題一律回 null,由呼叫端轉成
-- typed denial —— 不得讓 base64/JSON 例外變成裸錯誤。
create function public.admin_internal_decode_row_key(p_token text)
returns jsonb
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  v_padded text;
  v_json jsonb;
begin
  if p_token is null or p_token = '' then return null; end if;
  v_padded := translate(p_token, '-_', '+/');
  v_padded := v_padded || repeat('=', (4 - (length(v_padded) % 4)) % 4);
  begin
    v_json := convert_from(decode(v_padded, 'base64'), 'utf8')::jsonb;
  exception when others then
    return null;
  end;
  if jsonb_typeof(v_json) is distinct from 'object' then return null; end if;
  return v_json;
end;
$$;
revoke execute on function public.admin_internal_decode_row_key(text)
  from public, anon, authenticated;

-- cursor binding:綁 domain、resource、normalized filters、sort。跨 resource／
-- 跨 filter／跨 sort 重用 cursor 會因 binding 不符而 fail closed。
--
-- 2026-08-19 review 修正(Medium):原本用 `k=v,k=v` 裸串接,分隔字元本身
-- 可以出現在 filter 值裡:{group_label:foo, status:draft} 與單一 filter
-- {group_label:"foo,status=draft"} 會正規化成同一個字串,binding 因而
-- 相撞,一個查詢簽出的 cursor 能被另一個語意不同的查詢接受(已實測驗證
-- collision=true)。改為每個欄位／值各自用 to_json()::text 包成獨立的
-- JSON string(帶轉義的雙引號邊界),不同結構不可能序列化成同一個字串
-- (與 admin_internal_canonical_hash 同一原理,但保留本函式 immutable
-- 宣告,不跨呼叫非 immutable 函式)。
create function public.admin_internal_list_binding(
  p_domain text, p_resource text, p_filters jsonb, p_sort_column text
) returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select encode(pg_catalog.sha256(pg_catalog.convert_to(
    to_json(p_domain)::text || '|' || to_json(p_resource)::text || '|'
      || coalesce((
        select string_agg(
          to_json(k)::text || ':'
            || to_json(coalesce(p_filters -> k ->> 'eq', ''))::text,
          ',' order by k collate "C")
        from jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) k), '')
      || '|' || to_json(coalesce(p_sort_column, ''))::text, 'utf8')), 'hex');
$$;
revoke execute on function public.admin_internal_list_binding(
  text, text, jsonb, text) from public, anon, authenticated;

-- admin_list_resource v2(spec §7 + 13A-1):
--  * page size + 1 探測:抓 51 筆,最多回 50 筆,**只有真的存在第 51 筆**才
--    簽發 next_cursor(避免「剛好 50 筆」時給出一個翻過去是空頁的 cursor)。
--  * next_cursor 由最後一筆實際回傳的資料產生,綁 domain/resource/normalized
--    filters/sort 與完整 PK tie-breaker;client opaque、server validated。
--  * 每列附 server-issued row_key token(§1.3.6),client 只當導航用。
--  * sort 欄收緊為 class ∈ {open, internal}:personal 欄會被遮罩,拿遮罩值
--    當 keyset 比較鍵會直接壞掉,也會洩漏個資排序資訊。
create or replace function public.admin_list_resource(
  p_domain text, p_resource text, p_cursor text default null,
  p_filters jsonb default '{}'::jsonb, p_sort jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_select text;
  v_where text := 'true';
  v_rows jsonb;
  v_key text;
  v_sort_column text;
  v_sort_type text;
  v_cursor jsonb;
  v_key_columns text[];
  v_pk_order text;
  v_pk_list text;
  v_pk_vals text;
  v_binding text;
  v_has_more boolean := false;
  v_last jsonb;
  v_next_cursor text := null;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, v_auth ->> 'code',
      'admin_list_resource', 'browser_resource',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;

  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and domain = p_domain and surface = 'browser') then
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, 'RESOURCE_NOT_ALLOWED',
      'admin_list_resource', 'browser_resource', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;

  v_key_columns := public.admin_internal_key_columns(p_resource);
  if v_key_columns is null or exists (
      select 1 from unnest(v_key_columns) kc
      where not exists (select 1 from public.admin_sensitivity_catalog
        where resource = p_resource and column_name = kc
          and surface = 'browser' and class in ('open', 'internal'))) then
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, 'RESOURCE_NOT_ALLOWED',
      'admin_list_resource', 'browser_resource', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  select string_agg(format('%I asc', kc), ', ' order by ord)
    into v_pk_order from unnest(v_key_columns) with ordinality as t(kc, ord);

  v_select := public.admin_internal_catalog_projection(p_resource, 'browser');

  -- 2026-08-19 review 修正(Medium):`jsonb_object_keys` 只接受 object,
  -- 傳入合法但非 object 的 jsonb(如 `[]`、`"x"`、數字)會直接丟出裸例外,
  -- 繞過下面每個 denial 分支都會做的「typed outcome + audit + counter」
  -- 交易(已實測驗證:`p_filters => '[]'::jsonb` 讓整支函式以未捕捉例外
  -- 中止,沒有寫入任何 audit 或 denial counter,且把內部函式名/行號洩漏
  -- 給呼叫端)。在進迴圈前先擋掉形狀不對的 filters。
  if jsonb_typeof(coalesce(p_filters, '{}'::jsonb)) is distinct from 'object' then
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
      'admin_list_resource', 'browser_resource', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;

  for v_key in select jsonb_object_keys(coalesce(p_filters, '{}'::jsonb)) loop
    if not exists (select 1 from public.admin_sensitivity_catalog
        where resource = p_resource and column_name = v_key and filterable
          and surface = 'browser' and class <> 'forbidden') then
      return public.admin_internal_deny(
        p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
        'admin_list_resource', 'browser_resource', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end if;
    v_where := v_where || format(' and %I::text = %L',
      v_key, p_filters -> v_key ->> 'eq');
  end loop;

  v_sort_column := coalesce(p_sort ->> 'column',
    (select column_name from public.admin_sensitivity_catalog
      where resource = p_resource and sortable
        and surface = 'browser' and class in ('open', 'internal')
      order by column_name limit 1));
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and column_name = v_sort_column and sortable
        and surface = 'browser' and class in ('open', 'internal')) then
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
      'admin_list_resource', 'browser_resource', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;

  -- 2026-08-19 review 修正(High):keyset 比較鍵需要排序欄的原生型別,
  -- 不能一律當文字比(見下方 WHERE 組裝的說明)。排序欄已通過上面的
  -- catalog／schema 雙重驗證,理論上一定查得到型別;查不到就 fail
  -- closed,不帶著 null 型別繼續組出畸形的 cast 表達式。
  select format_type(a.atttypid, a.atttypmod) into v_sort_type
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace and c.relname = p_resource
      and a.attname = v_sort_column and not a.attisdropped;
  if v_sort_type is null then
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
      'admin_list_resource', 'browser_resource', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;

  v_binding := public.admin_internal_list_binding(
    p_domain, p_resource, p_filters, v_sort_column);

  if p_cursor is not null then
    v_cursor := public.admin_internal_decode_row_key(p_cursor);
    -- 毀損 / 跨 resource / 跨 filter / 跨 sort 的 cursor 一律 typed deny。
    -- 2026-08-19 review 修正:'k' 改用 `?`(欄位是否存在)而非
    -- `->>'k' is null`(值是否為 null)——排序欄本身可為 NULL(如
    -- completed_at、deadline_at,已用 schema 驗證確實存在可空的排序欄),
    -- cursor 停在該值時 k 合法地是 JSON null,不得被誤判成毀損 cursor。
    if v_cursor is null
       or (v_cursor ->> 'binding') is distinct from v_binding
       or not (v_cursor ? 'k')
       or jsonb_typeof(v_cursor -> 'key') is distinct from 'object'
       or exists (select 1 from unnest(v_key_columns) kc
            where v_cursor -> 'key' ->> kc is null) then
      return public.admin_internal_deny(
        p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
        'admin_list_resource', 'browser_resource', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end if;
    select string_agg(format('%I::text', kc), ', ' order by ord)
      into v_pk_list from unnest(v_key_columns) with ordinality as t(kc, ord);
    select string_agg(format('%L', v_cursor -> 'key' ->> kc), ', ' order by ord)
      into v_pk_vals from unnest(v_key_columns) with ordinality as t(kc, ord);
    -- 2026-08-19 review 修正(High):keyset 比較鍵原本一律 `::text`,但
    -- ORDER BY 走排序欄的原生型別 —— 對 integer 等欄位,文字序與數值序
    -- 不一致(如 1..100 文字序把 10..19 排到 2 之前),cursor 邊界會靜默
    -- 漏掉或重複列(已用 60 筆整數 sort_order 實測驗證跨頁遺漏)。改用
    -- 排序欄自己的原生型別做比較。排序預設是 asc 的 Postgres 預設
    -- NULLS LAST,故:
    --   * cursor 的 k 非 NULL:下一批 = 排序值更大者,或排序值相等但
    --     主鍵更大者,或排序值本身是 NULL(NULL 一定排在任何非 NULL
    --     值之後)。
    --   * cursor 的 k 本身是 NULL(游標已停在「NULL 尾端」):下一批
    --     只能是同樣 NULL、但主鍵更大的列。
    if jsonb_typeof(v_cursor -> 'k') = 'null' then
      v_where := v_where || format(' and %I is null and (%s) > (%s)',
        v_sort_column, v_pk_list, v_pk_vals);
    else
      v_where := v_where || format(
        ' and (%I > %L::%s or (%I = %L::%s and (%s) > (%s)) or %I is null)',
        v_sort_column, v_cursor ->> 'k', v_sort_type,
        v_sort_column, v_cursor ->> 'k', v_sort_type,
        v_pk_list, v_pk_vals, v_sort_column);
    end if;
  end if;

  -- page size + 1
  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.%I where %s
             order by %I asc, %s limit 51) t',
    v_select, p_resource, v_where, v_sort_column, v_pk_order) into v_rows;

  v_has_more := jsonb_array_length(v_rows) > 50;
  if v_has_more then
    select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb) into v_rows
      from jsonb_array_elements(v_rows) with ordinality as t(elem, ord)
      where ord <= 50;
  end if;

  -- 每列附 server-issued row_key(client opaque navigation token)
  select coalesce(jsonb_agg(
      elem || jsonb_build_object('row_key',
        public.admin_internal_encode_row_key(elem, v_key_columns))
      order by ord), '[]'::jsonb)
    into v_rows
    from jsonb_array_elements(v_rows) with ordinality as t(elem, ord);

  if v_has_more and jsonb_array_length(v_rows) > 0 then
    v_last := v_rows -> (jsonb_array_length(v_rows) - 1);
    -- 'k' 一律以文字存(->>),不管排序欄原始型別為何:解碼端只需要能
    -- cast 回排序欄的原生型別即可,不必在 token 裡保留 JSON 型別資訊。
    -- JSON null 與「值是文字 'null'」用 jsonb_typeof 區分(見解碼端)。
    v_next_cursor := public.admin_internal_base64url_encode(convert_to(
      jsonb_build_object(
        'binding', v_binding,
        'k', v_last ->> v_sort_column,
        'key', (select jsonb_object_agg(kc, v_last ->> kc)
                  from unnest(v_key_columns) kc))::text,
      'utf8'));
  end if;

  return jsonb_build_object('outcome', 'ok', 'rows', v_rows,
    'page_size_limit', 50, 'next_cursor', v_next_cursor);
end;
$$;

-- admin_query_audit v2(spec §10 + 13A-1):同樣 page size + 1、真正簽發
-- next_cursor,並把 cursor 綁在時間範圍/actor/action/target type/result 上,
-- 跨查詢條件重用一律 fail closed。排序維持 (occurred_at desc, id desc)。
create or replace function public.admin_query_audit(
  p_from timestamptz default null, p_to timestamptz default null,
  p_actor_principal_id uuid default null, p_action text default null,
  p_target_type text default null, p_result text default null,
  p_cursor text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_cursor jsonb;
  v_rows jsonb;
  v_binding text;
  v_has_more boolean := false;
  v_last jsonb;
  v_next_cursor text := null;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('audit/events', v_auth ->> 'code',
      'admin_query_audit', 'audit_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;

  v_binding := encode(pg_catalog.sha256(pg_catalog.convert_to(
    coalesce(p_from::text, '') || '|' || coalesce(p_to::text, '') || '|'
      || coalesce(p_actor_principal_id::text, '') || '|'
      || coalesce(p_action, '') || '|' || coalesce(p_target_type, '') || '|'
      || coalesce(p_result, ''), 'utf8')), 'hex');

  if p_cursor is not null then
    v_cursor := public.admin_internal_decode_row_key(p_cursor);
    if v_cursor is null
       or (v_cursor ->> 'binding') is distinct from v_binding
       or (v_cursor ->> 'k') is null
       or (v_cursor ->> 'id') is null then
      return public.admin_internal_deny('audit/events', 'COLUMN_NOT_ALLOWED',
        'admin_query_audit', 'audit_screen', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end if;
    -- 型別不合(非 timestamptz / 非 uuid)同樣不得裸例外
    begin
      perform (v_cursor ->> 'k')::timestamptz, (v_cursor ->> 'id')::uuid;
    exception when others then
      return public.admin_internal_deny('audit/events', 'COLUMN_NOT_ALLOWED',
        'admin_query_audit', 'audit_screen', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end;
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.occurred_at desc,
      t.id desc), '[]'::jsonb) into v_rows from (
    select id, occurred_at, action, target_type, result, actor_type,
      actor_principal_id, admin_session_id, target_principal_id, request_id,
      correlation_id, reason_or_purpose_redacted, mfa_age_seconds,
      before_after_redacted, source_summary_redacted, compensates_event_id
    from public.admin_audit_events
    where occurred_at >= coalesce(p_from, now() - interval '7 days')
      and occurred_at < coalesce(p_to, now())
      and (p_actor_principal_id is null
        or actor_principal_id = p_actor_principal_id)
      and (p_action is null or action = p_action)
      and (p_target_type is null or target_type = p_target_type)
      and (p_result is null or result = p_result)
      and (v_cursor is null or (occurred_at, id) <
        ((v_cursor ->> 'k')::timestamptz, (v_cursor ->> 'id')::uuid))
    order by occurred_at desc, id desc
    limit 51) t;

  v_has_more := jsonb_array_length(v_rows) > 50;
  if v_has_more then
    select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb) into v_rows
      from jsonb_array_elements(v_rows) with ordinality as t(elem, ord)
      where ord <= 50;
    v_last := v_rows -> (jsonb_array_length(v_rows) - 1);
    v_next_cursor := public.admin_internal_base64url_encode(convert_to(
      jsonb_build_object('binding', v_binding,
        'k', v_last ->> 'occurred_at', 'id', v_last ->> 'id')::text,
      'utf8'));
  end if;

  return jsonb_build_object('outcome', 'ok', 'rows', v_rows,
    'page_size_limit', 50, 'next_cursor', v_next_cursor);
end;
$$;

-- detail:接受 server-issued row_key token(§1.3.6)。沿用既有 jsonb overload
-- 的全部驗證(PK 欄集合必須完全相符),token 解不出來就 typed deny。
create function public.admin_get_resource_detail(
  p_domain text, p_resource text, p_row_token text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_key jsonb;
begin
  v_key := public.admin_internal_decode_row_key(p_row_token);
  if v_key is null then
    -- 交給 jsonb overload 走同一條 denial 路徑(它會做 authorize + catalog
    -- 檢查後回 COLUMN_NOT_ALLOWED),避免在授權前就洩漏任何判斷結果。
    v_key := '{}'::jsonb;
  end if;
  return public.admin_get_resource_detail(p_domain, p_resource, v_key);
end;
$$;
revoke execute on function public.admin_get_resource_detail(text, text, text)
  from public, anon;
grant execute on function public.admin_get_resource_detail(text, text, text)
  to authenticated;

