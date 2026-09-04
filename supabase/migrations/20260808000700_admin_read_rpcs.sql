-- supabase/migrations/20260808000700_admin_read_rpcs.sql

-- 遮罩實作(spec §9.3 括號註記的機器化;與 catalog mask_strategy 一一對應)
create function public.admin_internal_mask(p_value text, p_strategy text)
returns text
language sql immutable security definer set search_path = public, pg_temp
as $$
  select case p_strategy
    when 'first_char_mask' then left(p_value, 1) || '＊＊'
    when 'last3_mask' then '＊＊＊' || right(p_value, 3)
    when 'email_mask' then left(p_value, 1) || '****@'
      || split_part(p_value, '@', 2)
    when 'truncate_120' then left(p_value, 120)
    else null
  end;
$$;
revoke execute on function public.admin_internal_mask(text, text)
  from public, anon, authenticated;

-- Catalog 驅動投影字串(open/internal 原值、personal 遮罩、forbidden 排除)
create function public.admin_internal_catalog_projection(
  p_resource text, p_surface text
) returns text
language sql security definer set search_path = public, pg_temp
as $$
  select string_agg(case class
      when 'personal' then format(
        'case when %1$I is null then null else public.admin_internal_mask(%1$I::text, %2$L) end as %1$I',
        column_name, mask_strategy)
      else format('%I', column_name) end, ', ')
  from public.admin_sensitivity_catalog
  where resource = p_resource and surface = p_surface
    and class in ('open', 'internal', 'personal');
$$;
revoke execute on function public.admin_internal_catalog_projection(text, text)
  from public, anon, authenticated;

-- 該表 PRIMARY KEY 欄位,依 constraint ordinal(spec §1.3:row key 權威在 DB schema)
create function public.admin_internal_key_columns(p_resource text)
returns text[]
language sql stable security definer set search_path = public, pg_temp
as $$
  select array_agg(a.attname::text order by array_position(c.conkey, a.attnum))
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'p'
    and c.conrelid = to_regclass(format('public.%I', p_resource));
$$;
revoke execute on function public.admin_internal_key_columns(text)
  from public, anon, authenticated;

-- 統一授權(spec §5.1、§6.1;Codex 修訂 1):JWT 有效 + auth.uid()=identity +
-- JWT session_id=auth_session_id + identity active + factor snapshot 相同 +
-- 未撤銷未逾時。純判斷、絕不寫入 —— activity 續期只存在於 service-only path。
create function public.admin_internal_authorize()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_identity public.admin_security_identities;
  v_session public.admin_sessions;
  v_jwt_session uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'STALE_PRIVILEGED_SESSION');
  end if;
  v_jwt_session := nullif(coalesce(auth.jwt() ->> 'session_id',
    current_setting('request.jwt.claim.session_id', true)), '')::uuid;
  select * into v_identity from public.admin_security_identities
    where admin_user_id = auth.uid();
  select * into v_session from public.admin_sessions
    where admin_user_id = auth.uid() and revoked_at is null;
  if v_identity.state is distinct from 'active' or v_session.id is null
     or v_session.auth_session_id is distinct from v_jwt_session
     or v_session.bound_factor_id_snapshot
        is distinct from v_identity.bound_factor_id
     or now() - v_session.last_activity_at >= interval '15 minutes'
     or now() >= v_session.absolute_expires_at then
    return jsonb_build_object('ok', false, 'code', 'STALE_PRIVILEGED_SESSION',
      'principal_id', v_identity.audit_principal_id,
      'auth_session_id', v_jwt_session);
  end if;
  return jsonb_build_object('ok', true, 'session_id', v_session.id,
    'principal_id', v_identity.audit_principal_id,
    'auth_session_id', v_session.auth_session_id,
    'mfa_age_seconds',
    extract(epoch from now() - v_session.last_totp_verified_at)::int);
end;
$$;
revoke execute on function public.admin_internal_authorize()
  from public, anon, authenticated;

create function public.admin_list_resource(
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
  v_cursor jsonb;
  v_key_columns text[];
  v_pk_order text;
  v_pk_list text;
  v_pk_vals text;
begin
  perform set_config('statement_timeout', '5000', true); -- spec §7:5 秒
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    -- 修訂 3:denial 一律 audit+counter+typed outcome,含可解析 actor 佐證
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

  -- spec §1.3:tie-breaker=全部 PK 欄;key columns 必須 catalog-listed open/internal
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

  -- projection:open/internal 原值;personal 固定遮罩 SQL;forbidden 永不出現
  v_select := public.admin_internal_catalog_projection(p_resource, 'browser');

  -- filters:只允許 browser surface 的 catalog filterable 欄(forbidden 永不可);
  -- operator 僅 eq
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

  -- sort:單欄,必須 sortable;固定 tie-breaker 主鍵;cursor 為 server-issued
  -- opaque base64(jsonb),綁 resource/filters/sort hash,不含 SQL 片段。
  v_sort_column := coalesce(p_sort ->> 'column',
    (select column_name from public.admin_sensitivity_catalog
      where resource = p_resource and sortable
        and surface = 'browser' and class <> 'forbidden'
      order by column_name limit 1));
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and column_name = v_sort_column and sortable
        and surface = 'browser' and class <> 'forbidden') then
    return public.admin_internal_deny(
      p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
      'admin_list_resource', 'browser_resource', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  if p_cursor is not null then
    -- 毀損 cursor 不得裸例外:denial 必須經 helper 入帳(000400 不變式)
    begin
      v_cursor := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
    exception when others then
      return public.admin_internal_deny(
        p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
        'admin_list_resource', 'browser_resource', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end;
    if (v_cursor ->> 'binding') is distinct from
       md5(p_resource || coalesce(p_filters::text, '') || v_sort_column) then
      return public.admin_internal_deny(
        p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
        'admin_list_resource', 'browser_resource', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end if;
    -- keyset 比較鍵=(sort, pk…);cursor 'key' object 必須含每個 PK 欄(spec §1.3)
    if exists (select 1 from unnest(v_key_columns) kc
        where v_cursor -> 'key' ->> kc is null) then
      return public.admin_internal_deny(
        p_domain || '/' || p_resource, 'COLUMN_NOT_ALLOWED',
        'admin_list_resource', 'browser_resource', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end if;
    -- 三個聚合必須同序(WITH ORDINALITY):欄名/值配對不可依賴實作順序
    select string_agg(format('%I::text', kc), ', ' order by ord)
      into v_pk_list from unnest(v_key_columns) with ordinality as t(kc, ord);
    select string_agg(format('%L', v_cursor -> 'key' ->> kc), ', ' order by ord)
      into v_pk_vals from unnest(v_key_columns) with ordinality as t(kc, ord);
    v_where := v_where || format(' and (%I::text, %s) > (%L, %s)',
      v_sort_column, v_pk_list, v_cursor ->> 'k', v_pk_vals);
  end if;

  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.%I where %s
             order by %I asc, %s limit 50) t',
    v_select, p_resource, v_where, v_sort_column, v_pk_order) into v_rows;

  return jsonb_build_object('outcome', 'ok', 'rows', v_rows,
    'page_size_limit', 50);
end;
$$;
revoke execute on function public.admin_list_resource(text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.admin_list_resource(text, text, text, jsonb, jsonb)
  to authenticated;

-- Session state(唯讀;不更新 activity)
create function public.get_admin_session_state()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_identity public.admin_security_identities;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if (v_auth ->> 'ok')::boolean then
    return jsonb_build_object('state', 'privileged',
      'mfa_age_seconds', (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  if auth.uid() is null then
    return jsonb_build_object('state', 'none');
  end if;
  select * into v_identity from public.admin_security_identities
    where admin_user_id = auth.uid();
  if not found then
    return jsonb_build_object('state', 'none');
  end if;
  return jsonb_build_object('state', case v_identity.state
    when 'active_pending_mfa' then 'pending_mfa'
    when 'recovery_pending' then 'recovery_pending'
    when 'deactivated' then 'deactivated'
    else 'stale' end);
end;
$$;
revoke execute on function public.get_admin_session_state() from public, anon;
grant execute on function public.get_admin_session_state() to authenticated;

create function public.admin_get_resource_detail(
  p_domain text, p_resource text, p_row_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_row jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny(p_domain || '/' || p_resource,
      v_auth ->> 'code', 'admin_get_resource_detail', 'browser_resource',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and domain = p_domain
        and surface = 'browser') then
    return public.admin_internal_deny(p_domain || '/' || p_resource,
      'RESOURCE_NOT_ALLOWED', 'admin_get_resource_detail', 'browser_resource',
      'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid, (v_auth ->> 'auth_session_id')::uuid,
      null, null, (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  -- uuid overload 僅適用具 id 欄且 id 為 catalog open/internal 的表(spec §1.3);
  -- id-less 表走 jsonb overload:typed deny,不得裸例外
  if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_resource
        and column_name = 'id')
     or not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and column_name = 'id'
        and surface = 'browser' and class in ('open', 'internal')) then
    return public.admin_internal_deny(p_domain || '/' || p_resource,
      'RESOURCE_NOT_ALLOWED', 'admin_get_resource_detail', 'browser_resource',
      'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid, (v_auth ->> 'auth_session_id')::uuid,
      null, null, (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  execute format(
    'select row_to_json(t)::jsonb from (select %s from public.%I where id = $1) t',
    public.admin_internal_catalog_projection(p_resource, 'browser'), p_resource)
    into v_row using p_row_id;
  -- 未知列回 null row,不洩漏存在性;Phase 1 relations 固定空陣列(介面保留)
  return jsonb_build_object('outcome', 'ok', 'row', v_row,
    'relations', '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_get_resource_detail(text, text, uuid)
  from public, anon;
grant execute on function public.admin_get_resource_detail(text, text, uuid)
  to authenticated;

-- 複合主鍵定址 overload(spec §1.3):row_key 恰為全部 PK 欄的 object,值以 text 比對
create function public.admin_get_resource_detail(
  p_domain text, p_resource text, p_row_key jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_row jsonb;
  v_key_columns text[];
  v_where text;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny(p_domain || '/' || p_resource,
      v_auth ->> 'code', 'admin_get_resource_detail', 'browser_resource',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  if not exists (select 1 from public.admin_sensitivity_catalog
      where resource = p_resource and domain = p_domain
        and surface = 'browser') then
    return public.admin_internal_deny(p_domain || '/' || p_resource,
      'RESOURCE_NOT_ALLOWED', 'admin_get_resource_detail', 'browser_resource',
      'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid, (v_auth ->> 'auth_session_id')::uuid,
      null, null, (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  -- key columns 必須存在且全數 catalog-listed open/internal(spec §1.3)
  v_key_columns := public.admin_internal_key_columns(p_resource);
  if v_key_columns is null or exists (
      select 1 from unnest(v_key_columns) kc
      where not exists (select 1 from public.admin_sensitivity_catalog
        where resource = p_resource and column_name = kc
          and surface = 'browser' and class in ('open', 'internal'))) then
    return public.admin_internal_deny(p_domain || '/' || p_resource,
      'RESOURCE_NOT_ALLOWED', 'admin_get_resource_detail', 'browser_resource',
      'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid, (v_auth ->> 'auth_session_id')::uuid,
      null, null, (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  -- row_key 形狀:object、鍵集合恰等於 PK 欄集合、值不得為 JSON null;否則 typed denial
  if jsonb_typeof(p_row_key) is distinct from 'object'
     or (select array_agg(k order by k)
           from jsonb_object_keys(p_row_key) k) is distinct from
        (select array_agg(kc order by kc) from unnest(v_key_columns) kc)
     or exists (select 1 from unnest(v_key_columns) kc
          where p_row_key ->> kc is null) then
    return public.admin_internal_deny(p_domain || '/' || p_resource,
      'COLUMN_NOT_ALLOWED', 'admin_get_resource_detail', 'browser_resource',
      'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid, (v_auth ->> 'auth_session_id')::uuid,
      null, null, (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  select string_agg(format('%I::text = %L', kc, p_row_key ->> kc), ' and ')
    into v_where from unnest(v_key_columns) kc;
  execute format(
    'select row_to_json(t)::jsonb from (select %s from public.%I where %s limit 1) t',
    public.admin_internal_catalog_projection(p_resource, 'browser'), p_resource,
    v_where) into v_row;
  -- 未知列回 null row,不洩漏存在性;relations 介面與 uuid overload 一致
  return jsonb_build_object('outcome', 'ok', 'row', v_row,
    'relations', '[]'::jsonb);
end;
$$;
revoke execute on function public.admin_get_resource_detail(text, text, jsonb)
  from public, anon;
grant execute on function public.admin_get_resource_detail(text, text, jsonb)
  to authenticated;

-- Access screens(§9.4 surface=access;三個 function 僅表名/排序不同)
create function public.admin_list_admins()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_rows jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('access/admins', v_auth ->> 'code',
      'admin_list_admins', 'access_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.admin_security_identities
             order by created_at asc limit 50) t',
    public.admin_internal_catalog_projection(
      'admin_security_identities', 'access')) into v_rows;
  return jsonb_build_object('outcome', 'ok', 'rows', v_rows);
end;
$$;
revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;

create function public.admin_list_invitations()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_rows jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('access/invitations', v_auth ->> 'code',
      'admin_list_invitations', 'access_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.admin_invitations
             order by created_at desc limit 50) t',
    public.admin_internal_catalog_projection('admin_invitations', 'access'))
    into v_rows;
  return jsonb_build_object('outcome', 'ok', 'rows', v_rows);
end;
$$;
revoke execute on function public.admin_list_invitations() from public, anon;
grant execute on function public.admin_list_invitations() to authenticated;

create function public.admin_list_sessions()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_rows jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('access/sessions', v_auth ->> 'code',
      'admin_list_sessions', 'access_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.admin_sessions
             order by created_at desc limit 50) t',
    public.admin_internal_catalog_projection('admin_sessions', 'access'))
    into v_rows;
  return jsonb_build_object('outcome', 'ok', 'rows', v_rows);
end;
$$;
revoke execute on function public.admin_list_sessions() from public, anon;
grant execute on function public.admin_list_sessions() to authenticated;

-- Audit 查詢(spec §10:filter 僅限五欄;keyset;無 export)
create function public.admin_query_audit(
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
  if p_cursor is not null then
    -- 毀損 cursor(含欄位型別)不得裸例外:denial 必須經 helper 入帳
    begin
      v_cursor := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
      perform (v_cursor ->> 'k')::timestamptz, (v_cursor ->> 'id')::uuid;
    exception when others then
      return public.admin_internal_deny('audit/events', 'COLUMN_NOT_ALLOWED',
        'admin_query_audit', 'audit_screen', 'admin',
        (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::int);
    end;
  end if;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows from (
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
    limit 50) t;
  return jsonb_build_object('outcome', 'ok', 'rows', v_rows);
end;
$$;
revoke execute on function public.admin_query_audit(
  timestamptz, timestamptz, uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_query_audit(
  timestamptz, timestamptz, uuid, text, text, text, text) to authenticated;

-- Health 摘要(§9.4 surface=health + incident 旗標)
create function public.admin_health_summary()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not (v_auth ->> 'ok')::boolean then
    return public.admin_internal_deny('health/summary', v_auth ->> 'code',
      'admin_health_summary', 'health_screen',
      case when (v_auth ->> 'principal_id') is not null
        then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  return jsonb_build_object('outcome', 'ok',
    'operations', (select coalesce(jsonb_agg(row_to_json(o)), '[]'::jsonb)
      from (select id, operation_type, state, current_step, attempt_count,
          last_safe_error_code, target_principal_id, next_retry_at,
          correlation_id, created_at, updated_at
        from public.admin_security_operations
        where state <> 'completed'
        order by created_at desc limit 50) o),
    'denials', (select coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb)
      from (select resource_key, safe_reason_code, window_started_at,
          window_ends_at, count
        from public.admin_denial_counters
        where window_ends_at > now() - interval '24 hours'
        order by count desc limit 50) d),
    'incidents', jsonb_build_object(
      'stuck_operations', (select count(*)
        from public.admin_security_operations where state = 'stuck'),
      'denial_threshold_breaches', (select count(*)
        from public.admin_denial_counters where count >= 20),
      'locked_identities', (select count(*)
        from public.admin_security_identities
        where locked_until is not null and now() < locked_until)));
end;
$$;
revoke execute on function public.admin_health_summary() from public, anon;
grant execute on function public.admin_health_summary() to authenticated;
