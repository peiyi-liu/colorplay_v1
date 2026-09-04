-- Task 4: cursor-backed Admin access lists and server-owned Health actions.
-- Depends on 20260809000100 (typed denial envelope) and 20260809000200
-- (opaque base64url encode/decode helpers).

create function public.admin_internal_access_page(
  p_resource text,
  p_id_column text,
  p_direction text,
  p_cursor text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cursor jsonb;
  v_created_at timestamptz;
  v_id uuid;
  v_rows jsonb;
  v_has_more boolean;
  v_last jsonb;
  v_next_cursor text := null;
  v_where text := '';
begin
  if (p_resource, p_id_column, p_direction) not in (
    ('admin_security_identities', 'admin_user_id', 'asc'),
    ('admin_invitations', 'id', 'desc'),
    ('admin_sessions', 'id', 'desc')
  ) then
    return jsonb_build_object('outcome', 'invalid_cursor');
  end if;

  if p_cursor is not null then
    v_cursor := public.admin_internal_decode_row_key(p_cursor);
    if v_cursor is null
       or (v_cursor ->> 'resource') is distinct from p_resource
       or v_cursor ->> 'k' is null
       or v_cursor ->> 'id' is null then
      return jsonb_build_object('outcome', 'invalid_cursor');
    end if;
    begin
      v_created_at := (v_cursor ->> 'k')::timestamptz;
      v_id := (v_cursor ->> 'id')::uuid;
    exception when others then
      return jsonb_build_object('outcome', 'invalid_cursor');
    end;
    v_where := format(
      'where (created_at, %I) %s (%L::timestamptz, %L::uuid)',
      p_id_column,
      case when p_direction = 'asc' then '>' else '<' end,
      v_created_at,
      v_id
    );
  end if;

  execute format(
    'select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
       from (select %s from public.%I %s
             order by created_at %s, %I %s limit 51) t',
    public.admin_internal_catalog_projection(p_resource, 'access'),
    p_resource,
    v_where,
    p_direction,
    p_id_column,
    p_direction
  ) into v_rows;

  v_has_more := jsonb_array_length(v_rows) > 50;
  if v_has_more then
    select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
      into v_rows
      from jsonb_array_elements(v_rows) with ordinality as t(elem, ord)
      where ord <= 50;
  end if;

  if v_has_more and jsonb_array_length(v_rows) > 0 then
    v_last := v_rows -> (jsonb_array_length(v_rows) - 1);
    v_next_cursor := public.admin_internal_base64url_encode(convert_to(
      jsonb_build_object(
        'resource', p_resource,
        'k', v_last ->> 'created_at',
        'id', v_last ->> p_id_column
      )::text,
      'utf8'
    ));
  end if;

  return jsonb_build_object(
    'outcome', 'ok',
    'rows', v_rows,
    'page_size_limit', 50,
    'next_cursor', v_next_cursor
  );
end;
$$;
revoke execute on function public.admin_internal_access_page(
  text, text, text, text) from public, anon, authenticated;

drop function public.admin_list_admins();
create function public.admin_list_admins(p_cursor text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_page jsonb;
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
  v_page := public.admin_internal_access_page(
    'admin_security_identities', 'admin_user_id', 'asc', p_cursor);
  if v_page ->> 'outcome' = 'invalid_cursor' then
    return public.admin_internal_deny('access/admins', 'COLUMN_NOT_ALLOWED',
      'admin_list_admins', 'access_screen', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  return v_page;
end;
$$;
revoke execute on function public.admin_list_admins(text) from public, anon;
grant execute on function public.admin_list_admins(text) to authenticated;

drop function public.admin_list_invitations();
create function public.admin_list_invitations(p_cursor text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_page jsonb;
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
  v_page := public.admin_internal_access_page(
    'admin_invitations', 'id', 'desc', p_cursor);
  if v_page ->> 'outcome' = 'invalid_cursor' then
    return public.admin_internal_deny('access/invitations',
      'COLUMN_NOT_ALLOWED', 'admin_list_invitations', 'access_screen', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  return v_page;
end;
$$;
revoke execute on function public.admin_list_invitations(text)
  from public, anon;
grant execute on function public.admin_list_invitations(text)
  to authenticated;

drop function public.admin_list_sessions();
create function public.admin_list_sessions(p_cursor text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_page jsonb;
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
  v_page := public.admin_internal_access_page(
    'admin_sessions', 'id', 'desc', p_cursor);
  if v_page ->> 'outcome' = 'invalid_cursor' then
    return public.admin_internal_deny('access/sessions', 'COLUMN_NOT_ALLOWED',
      'admin_list_sessions', 'access_screen', 'admin',
      (v_auth ->> 'principal_id')::uuid, (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  return v_page;
end;
$$;
revoke execute on function public.admin_list_sessions(text) from public, anon;
grant execute on function public.admin_list_sessions(text) to authenticated;

create or replace function public.admin_health_summary()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_operations jsonb;
  v_denials jsonb;
  v_operations_truncated boolean;
  v_denials_truncated boolean;
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

  select coalesce(jsonb_agg(row_to_json(o)), '[]'::jsonb) into v_operations
    from (
      select id, operation_type, state, current_step, attempt_count,
        last_safe_error_code, target_principal_id, next_retry_at,
        correlation_id, created_at, updated_at,
        case
          when operation_type = 'reset_admin_mfa' and state = 'stuck'
            and next_retry_at is null
            and manual_retry_claim_token is null then 'manual_retry'
          when operation_type = 'reset_admin_mfa' and state = 'stuck'
            then 'pending'
          when operation_type = 'reset_admin_mfa' then 'reconcile'
          else 'owner_oob'
        end as action_kind
      from public.admin_security_operations
      where state <> 'completed'
      order by created_at desc, id desc
      limit 51
    ) o;
  v_operations_truncated := jsonb_array_length(v_operations) > 50;
  if v_operations_truncated then
    select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
      into v_operations
      from jsonb_array_elements(v_operations) with ordinality as t(elem, ord)
      where ord <= 50;
  end if;

  select coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb) into v_denials
    from (
      select resource_key, safe_reason_code, window_started_at,
        window_ends_at, count
      from public.admin_denial_counters
      where window_ends_at > now() - interval '24 hours'
      order by count desc, resource_key, safe_reason_code
      limit 51
    ) d;
  v_denials_truncated := jsonb_array_length(v_denials) > 50;
  if v_denials_truncated then
    select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
      into v_denials
      from jsonb_array_elements(v_denials) with ordinality as t(elem, ord)
      where ord <= 50;
  end if;

  return jsonb_build_object(
    'outcome', 'ok',
    'operations', v_operations,
    'operations_truncated', v_operations_truncated,
    'denials', v_denials,
    'denials_truncated', v_denials_truncated,
    'incidents', jsonb_build_object(
      'stuck_operations', (select count(*)
        from public.admin_security_operations where state = 'stuck'),
      'denial_threshold_breaches', (select count(*)
        from public.admin_denial_counters where count >= 20),
      'locked_identities', (select count(*)
        from public.admin_security_identities
        where locked_until is not null and now() < locked_until)
    )
  );
end;
$$;
