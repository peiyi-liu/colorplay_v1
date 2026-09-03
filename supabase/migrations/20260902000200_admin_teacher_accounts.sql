-- Admin B: Admin-managed teacher identity data and safe read projections.
-- Auth internal email and plaintext credentials intentionally have no column here.

alter table public.profiles
  add column contact_email text;

alter table public.profiles
  add constraint profiles_contact_email_normalized_check check (
    contact_email is null
    or (
      contact_email = lower(btrim(contact_email))
      and char_length(contact_email) between 3 and 254
      and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

-- ADR 0009 permits a 40-character teacher name and requires full/display names
-- to stay synchronized. The original profile constraint stopped at 30.
alter table public.profiles
  drop constraint profiles_display_name_check;
alter table public.profiles
  add constraint profiles_display_name_check check (
    char_length(btrim(display_name)) between 1 and 40
  );

-- A table-level SELECT grant would automatically expose the newly-added column.
-- Replace it with the same historical safe columns, excluding contact_email.
revoke select on public.profiles from authenticated;
grant select (
  id, display_name, role, timezone, created_at, updated_at, reduced_motion,
  active_blook_id, active_frame_id, full_name, login_account
) on public.profiles to authenticated;

create schema admin_private;
revoke all on schema admin_private from public, anon, authenticated, service_role;

-- Teachers are renamed only through the receipt-bound Admin command. Converge
-- historical rows before enforcing that its two public name projections agree.
update public.profiles
   set full_name = coalesce(nullif(btrim(full_name), ''), btrim(display_name)),
       display_name = coalesce(nullif(btrim(full_name), ''), btrim(display_name))
 where role = 'teacher';

-- Auth-created profiles begin as students and are promoted by trusted backend
-- paths. Normalize that transition so existing promotion flows satisfy the same
-- invariant without granting clients access to role or full_name.
create function admin_private.sync_teacher_names_on_promotion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_canonical_name text;
begin
  if old.role is distinct from 'teacher' and new.role = 'teacher' then
    v_canonical_name := coalesce(
      nullif(btrim(new.full_name), ''),
      btrim(new.display_name)
    );
    new.full_name := v_canonical_name;
    new.display_name := v_canonical_name;
  end if;
  return new;
end;
$$;
revoke all on function admin_private.sync_teacher_names_on_promotion()
  from public, anon, authenticated, service_role;

create trigger profiles_sync_teacher_names_on_promotion
before update of role on public.profiles
for each row execute function admin_private.sync_teacher_names_on_promotion();

alter table public.profiles
  add constraint profiles_teacher_names_synchronized_check check (
    role <> 'teacher'
    or (
      full_name is not null
      and full_name = btrim(full_name)
      and display_name = full_name
    )
  );

-- profiles.login_account is limited to 20 characters. Keep the sequence inside
-- the largest suffix that can still form "teacher" + 13 decimal digits.
create sequence admin_private.teacher_login_account_seq
  minvalue 1 maxvalue 9999999999999;
select setval(
  'admin_private.teacher_login_account_seq',
  greatest(coalesce((
    select max(substring(login_account from '^teacher([0-9]+)$')::bigint)
      from public.profiles
     where login_account ~ '^teacher[0-9]+$'
  ), 0) + 1, 1),
  false
);

create type admin_private.teacher_operation_type as enum (
  'create_teacher_account',
  'update_teacher_account',
  'reset_teacher_password'
);

create type admin_private.teacher_operation_state as enum (
  'requested',
  'identity_reserved',
  'auth_created_or_password_updated',
  'profile_committed',
  'completed',
  'compensation_pending',
  'compensated',
  'reconciliation_required'
);

create table admin_private.teacher_account_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type admin_private.teacher_operation_type not null,
  state admin_private.teacher_operation_state not null default 'requested',
  actor_principal_id uuid not null
    references public.admin_audit_principals (id),
  teacher_id uuid references public.profiles (id) on delete set null,
  login_account text,
  requested_full_name text,
  requested_contact_email text,
  command_execution_id uuid
    references public.admin_command_executions (id),
  safe_error_code text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint teacher_operation_login_shape check (
    login_account is null or login_account ~ '^teacher[0-9]{2,}$'
  ),
  constraint teacher_operation_name_shape check (
    requested_full_name is null
    or char_length(btrim(requested_full_name)) between 1 and 40
  ),
  constraint teacher_operation_contact_shape check (
    requested_contact_email is null
    or (
      requested_contact_email = lower(btrim(requested_contact_email))
      and char_length(requested_contact_email) between 3 and 254
      and requested_contact_email
        ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  )
);

create unique index teacher_account_one_open_target_idx
  on admin_private.teacher_account_operations (teacher_id)
  where teacher_id is not null
    and state not in ('completed', 'compensated');
create unique index teacher_account_reserved_login_idx
  on admin_private.teacher_account_operations (login_account)
  where login_account is not null;
create index teacher_account_operation_target_created_idx
  on admin_private.teacher_account_operations (teacher_id, created_at desc);

revoke all on admin_private.teacher_account_operations
  from public, anon, authenticated, service_role;
revoke all on sequence admin_private.teacher_login_account_seq
  from public, anon, authenticated, service_role;

-- Task 1 primitive only. Task 2's receipt-bound public command will call this
-- helper after authorization; no API role may invoke it directly. Allocation
-- and durable operation creation occur in the same PostgreSQL transaction.
create function admin_private.reserve_teacher_account(
  p_actor_principal_id uuid,
  p_requested_full_name text,
  p_requested_contact_email text,
  p_command_execution_id uuid,
  p_correlation_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_occupied_max bigint;
  v_suffix bigint;
  v_login_account text;
  v_operation_id uuid;
  v_constraint_name text;
begin
  -- Serialize every formal allocator. nextval itself is atomic; this lock also
  -- makes the cross-table high-water resync deterministic when transitional
  -- tooling inserted a teacherNN profile after the migration was applied.
  perform pg_advisory_xact_lock(
    hashtextextended('admin_teacher_login_account_allocation', 0)
  );

  select greatest(
    coalesce((
      select max(substring(profile.login_account
        from '^teacher([0-9]+)$')::bigint)
        from public.profiles profile
       where profile.login_account ~ '^teacher[0-9]+$'
    ), 0),
    coalesce((
      select max(substring(operation.login_account
        from '^teacher([0-9]+)$')::bigint)
        from admin_private.teacher_account_operations operation
       where operation.login_account ~ '^teacher[0-9]+$'
    ), 0)
  ) into v_occupied_max;

  v_suffix := nextval('admin_private.teacher_login_account_seq');
  if v_suffix <= v_occupied_max then
    perform setval(
      'admin_private.teacher_login_account_seq', v_occupied_max + 1, false
    );
    v_suffix := nextval('admin_private.teacher_login_account_seq');
  end if;

  loop
    -- lpad(text, 2, '0') truncates values wider than two characters. Prefix
    -- only the one-digit case so teacher100 can never collapse to teacher10.
    v_login_account := 'teacher'
      || case when v_suffix < 10 then '0' else '' end
      || v_suffix::text;

    if not exists (
      select 1 from public.profiles profile
       where profile.login_account = v_login_account
    ) and not exists (
      select 1 from admin_private.teacher_account_operations operation
       where operation.login_account = v_login_account
    ) then
      begin
        insert into admin_private.teacher_account_operations (
          operation_type,
          state,
          actor_principal_id,
          login_account,
          requested_full_name,
          requested_contact_email,
          command_execution_id,
          correlation_id
        ) values (
          'create_teacher_account',
          'identity_reserved',
          p_actor_principal_id,
          v_login_account,
          btrim(p_requested_full_name),
          nullif(lower(btrim(coalesce(p_requested_contact_email, ''))), ''),
          p_command_execution_id,
          nullif(btrim(coalesce(p_correlation_id, '')), '')
        ) returning id into v_operation_id;
      exception when unique_violation then
        get stacked diagnostics v_constraint_name = constraint_name;
        if v_constraint_name <> 'teacher_account_reserved_login_idx' then
          raise;
        end if;
        v_operation_id := null;
      end;
    end if;

    if v_operation_id is not null then
      return jsonb_build_object(
        'operation_id', v_operation_id::text,
        'login_account', v_login_account
      );
    end if;
    v_suffix := nextval('admin_private.teacher_login_account_seq');
  end loop;
end;
$$;
revoke all on function admin_private.reserve_teacher_account(
  uuid, text, text, uuid, text
) from public, anon, authenticated, service_role;

create function admin_private.teacher_safe_state(p_teacher_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
  select case latest.state
    when 'reconciliation_required' then 'reconciliation_required'
    when 'requested' then 'operation_pending'
    when 'identity_reserved' then 'operation_pending'
    when 'auth_created_or_password_updated' then 'operation_pending'
    when 'profile_committed' then 'operation_pending'
    when 'compensation_pending' then 'operation_pending'
    else 'ready'
  end
  from (select (
    select operation.state
      from admin_private.teacher_account_operations operation
     where operation.teacher_id = p_teacher_id
     order by operation.created_at desc, operation.id desc
     limit 1
  ) as state) latest;
$$;
revoke all on function admin_private.teacher_safe_state(uuid)
  from public, anon, authenticated, service_role;

-- Keep the central safe-code mapping authoritative for the new stable outcomes.
create or replace function public.admin_internal_denial_retryable(p_code text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select p_code in ('SECURITY_AUDIT_UNAVAILABLE', 'TEACHER_AUTH_UNAVAILABLE');
$$;

create or replace function public.admin_internal_denial_message(p_code text)
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
    when 'TEACHER_ACCOUNT_INVALID' then '教師帳號資料或狀態無效。'
    when 'TEACHER_ACCOUNT_CONFLICT' then '教師帳號操作與目前狀態衝突。'
    when 'TEACHER_OPERATION_PENDING' then '教師帳號已有尚未完成的安全作業。'
    when 'TEACHER_AUTH_UNAVAILABLE' then
      '帳號驗證服務暫時無法使用，請先查詢作業狀態再重試。'
    when 'TEACHER_RECONCILIATION_REQUIRED' then
      '教師帳號作業需要受控對帳，請前往系統健康頁。'
    else '操作未完成，請聯絡負責人。'
  end;
$$;

create function admin_private.teacher_cursor_binding(
  p_search text,
  p_state text
) returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select encode(sha256(convert_to(
    to_json(coalesce(p_search, ''))::text || '|'
      || to_json(coalesce(p_state, ''))::text,
    'utf8'
  )), 'hex');
$$;
revoke all on function admin_private.teacher_cursor_binding(text, text)
  from public, anon, authenticated, service_role;

create function public.admin_list_teachers(
  p_cursor text default null,
  p_search text default null,
  p_state text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_auth jsonb;
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_state text := nullif(btrim(coalesce(p_state, '')), '');
  v_cursor jsonb;
  v_cursor_created_at timestamptz;
  v_cursor_id uuid;
  v_binding text;
  v_rows jsonb;
  v_count integer;
  v_last jsonb;
  v_next_cursor text;
  v_request_id uuid := gen_random_uuid();
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'admin/teachers', v_auth ->> 'code', 'admin_list_teachers',
      'teacher_account',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  if (v_search is not null and char_length(v_search) > 80)
     or (v_state is not null and v_state not in (
       'ready', 'operation_pending', 'reconciliation_required')) then
    return public.admin_internal_deny(
      'admin/teachers', 'TEACHER_ACCOUNT_INVALID', 'admin_list_teachers',
      'teacher_account', 'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer);
  end if;

  v_binding := admin_private.teacher_cursor_binding(v_search, v_state);
  if p_cursor is not null then
    v_cursor := public.admin_internal_decode_row_key(p_cursor);
    begin
      if v_cursor is null
         or (v_cursor ->> 'binding') is distinct from v_binding then
        raise invalid_parameter_value;
      end if;
      v_cursor_created_at := (v_cursor ->> 'created_at')::timestamptz;
      v_cursor_id := (v_cursor ->> 'teacher_id')::uuid;
    exception when others then
      return public.admin_internal_deny(
        'admin/teachers', 'TEACHER_ACCOUNT_INVALID', 'admin_list_teachers',
        'teacher_account', 'admin', (v_auth ->> 'principal_id')::uuid,
        (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::integer);
    end;
  end if;

  with teacher_rows as (
    select profile.id, profile.login_account, profile.display_name,
      profile.contact_email, profile.created_at,
      admin_private.teacher_safe_state(profile.id) as operation_state
    from public.profiles profile
    where profile.role = 'teacher'
      and profile.login_account ~ '^teacher[0-9]{2,}$'
      and (v_search is null
        or lower(profile.login_account) like '%' || v_search || '%'
        or lower(profile.display_name) like '%' || v_search || '%')
      and (v_cursor_id is null
        or (profile.created_at, profile.id)
          > (v_cursor_created_at, v_cursor_id))
  ), selected as (
    select * from teacher_rows
     where v_state is null or operation_state = v_state
     order by created_at, id
     limit 51
  ), page as (
    select * from selected order by created_at, id limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'teacher_id', id::text,
      'login_account', login_account,
      'display_name', display_name,
      'contact_email_masked', case when contact_email is null then null
        else public.admin_internal_mask(contact_email, 'email_mask') end,
      'contact_email_present', contact_email is not null,
      'created_at', created_at,
      'operation_state', operation_state
    ) order by created_at, id), '[]'::jsonb),
    (select count(*) from selected)
    into v_rows, v_count
    from page;

  if v_count > 50 then
    v_last := v_rows -> 49;
    v_next_cursor := public.admin_internal_base64url_encode(convert_to(
      jsonb_build_object(
        'binding', v_binding,
        'created_at', v_last ->> 'created_at',
        'teacher_id', v_last ->> 'teacher_id'
      )::text,
      'utf8'
    ));
  end if;
  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_request_id::text,
    'rows', v_rows, 'next_cursor', v_next_cursor
  );
end;
$$;

create function public.admin_get_teacher(p_teacher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, admin_private, pg_temp
as $$
declare
  v_auth jsonb;
  v_teacher jsonb;
  v_state text;
  v_request_id uuid := gen_random_uuid();
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'admin/teachers', v_auth ->> 'code', 'admin_get_teacher',
      'teacher_account',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;

  select admin_private.teacher_safe_state(profile.id),
    jsonb_build_object(
      'teacher_id', profile.id::text,
      'login_account', profile.login_account,
      'display_name', profile.display_name,
      'full_name', profile.full_name,
      'role', profile.role::text,
      'contact_email_masked', case when profile.contact_email is null then null
        else public.admin_internal_mask(profile.contact_email, 'email_mask') end,
      'contact_email_present', profile.contact_email is not null,
      'created_at', profile.created_at
    )
    into v_state, v_teacher
    from public.profiles profile
   where profile.id = p_teacher_id
     and profile.role = 'teacher'
     and profile.login_account ~ '^teacher[0-9]{2,}$';
  if v_teacher is null then
    return public.admin_internal_deny(
      'admin/teachers', 'TEACHER_ACCOUNT_INVALID', 'admin_get_teacher',
      'teacher_account', 'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer);
  end if;

  v_teacher := v_teacher || jsonb_build_object(
    'operation_state', v_state,
    'available_commands', case when v_state = 'ready' then
      jsonb_build_array('update_teacher_account', 'reset_teacher_password')
      else '[]'::jsonb end
  );
  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_request_id::text, 'teacher', v_teacher
  );
end;
$$;

revoke all on function public.admin_list_teachers(text, text, text)
  from public, anon;
revoke all on function public.admin_get_teacher(uuid) from public, anon;
grant execute on function public.admin_list_teachers(text, text, text)
  to authenticated;
grant execute on function public.admin_get_teacher(uuid) to authenticated;

insert into public.admin_sensitivity_catalog (
  resource, domain, surface, column_name, class, mask_strategy,
  searchable, filterable, sortable
) values (
  'profiles', 'users', 'browser', 'contact_email', 'personal', 'email_mask',
  false, false, false
);
