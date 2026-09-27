-- Admin inactivity/session correction and generic Content Studio hierarchy catalog.

alter table public.admin_sessions
  drop constraint if exists absolute_expiry_is_8h;

update public.admin_sessions
set absolute_expires_at = 'infinity'::timestamptz
where revoked_at is null;

create or replace function public.admin_internal_unbounded_active_session()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.absolute_expires_at := 'infinity'::timestamptz;
  return new;
end;
$$;

drop trigger if exists admin_sessions_unbounded_active_session
  on public.admin_sessions;
create trigger admin_sessions_unbounded_active_session
before insert or update of absolute_expires_at on public.admin_sessions
for each row execute function public.admin_internal_unbounded_active_session();

revoke execute on function public.admin_internal_unbounded_active_session()
  from public, anon, authenticated;

-- Preserve the already-reviewed authorization bodies while changing the single
-- idle-window constant from 15 to 20 minutes. Abort migration if definitions
-- drift, rather than silently leaving one path inconsistent.
do $$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.admin_internal_authorize()'::regprocedure,
    'public.admin_internal_execute_command(uuid,text,text,bytea,boolean)'::regprocedure,
    'public.svc_admin_issue_command_receipt(uuid,uuid,text,text,bytea,uuid,boolean)'::regprocedure,
    'public.svc_admin_refresh_session_mfa(uuid,uuid,uuid)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_signature);
    if position('15 minutes' in v_definition) = 0 then
      raise exception 'ADMIN_IDLE_DEFINITION_DRIFT: %', v_signature;
    end if;
    execute replace(v_definition, '15 minutes', '20 minutes');
  end loop;
end;
$$;

create or replace function public.admin_touch_session_activity()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_auth jsonb := public.admin_internal_authorize();
begin
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return jsonb_build_object(
      'outcome', 'denied',
      'code', coalesce(v_auth ->> 'code', 'STALE_PRIVILEGED_SESSION')
    );
  end if;
  update public.admin_sessions
  set last_activity_at = clock_timestamp()
  where id = (v_auth ->> 'session_id')::uuid;
  return jsonb_build_object('outcome', 'ok');
end;
$$;
revoke execute on function public.admin_touch_session_activity()
  from public, anon;
grant execute on function public.admin_touch_session_activity()
  to authenticated;

-- Draft authoring is ordinary active-session work. Fresh MFA remains on publish,
-- archive, rollback, and draft deletion.
do $$
declare
  v_signature regprocedure :=
    'public.admin_save_content_draft(uuid,uuid,text,text,integer,jsonb,text,uuid)'::regprocedure;
  v_definition text := pg_get_functiondef(v_signature);
  v_guard text := $guard$
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return public.admin_internal_deny(
      'content/drafts', 'INSUFFICIENT_MFA', 'admin_save_content_draft',
      'content_draft', 'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;
$guard$;
begin
  if position(v_guard in v_definition) = 0 then
    raise exception 'CONTENT_DRAFT_MFA_DEFINITION_DRIFT';
  end if;
  execute replace(v_definition, v_guard, E'\n');
end;
$$;

create or replace function public.admin_list_content_catalog()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_auth jsonb := public.admin_internal_authorize();
  v_request_id uuid := gen_random_uuid();
  v_courses jsonb;
  v_chapters jsonb;
  v_drafts jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'content/catalog', v_auth ->> 'code', 'admin_list_content_catalog',
      'content_catalog',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', course.id, 'stable_code', course.stable_code,
    'title', course.title, 'status', course.status,
    'sort_order', course.sort_order
  ) order by course.sort_order, course.stable_code), '[]'::jsonb)
  into v_courses from public.courses as course;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', chapter.id, 'course_id', chapter.course_id,
    'stable_code', chapter.stable_code, 'title', chapter.title,
    'status', chapter.status, 'sort_order', chapter.sort_order
  ) order by chapter.sort_order, chapter.stable_code), '[]'::jsonb)
  into v_chapters from public.chapters as chapter;

  select coalesce(jsonb_agg(jsonb_build_object(
    'draft_id', draft.id, 'entity_type', draft.entity_type,
    'stable_code', draft.stable_code, 'revision', draft.revision,
    'payload', draft.payload, 'updated_at', draft.updated_at
  ) order by draft.updated_at desc), '[]'::jsonb)
  into v_drafts
  from public.content_drafts as draft
  where draft.entity_id is null
    and draft.entity_type in ('course', 'chapter');

  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_request_id,
    'courses', v_courses, 'chapters', v_chapters,
    'hierarchy_drafts', v_drafts
  );
end;
$$;
revoke execute on function public.admin_list_content_catalog()
  from public, anon;
grant execute on function public.admin_list_content_catalog()
  to authenticated;

create table public.content_draft_deletion_requests (
  actor_user_id uuid not null,
  request_id uuid not null,
  request_hash bytea not null,
  result_receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, request_id)
);
alter table public.content_draft_deletion_requests enable row level security;
revoke all on table public.content_draft_deletion_requests
  from public, anon, authenticated;

create or replace function public.admin_delete_content_draft(
  p_draft_id uuid,
  p_expected_revision integer,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_draft public.content_drafts;
  v_existing public.content_draft_deletion_requests;
  v_hash bytea;
  v_receipt jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'content/drafts', v_auth ->> 'code', 'admin_delete_content_draft',
      'content_draft', 'unknown', null, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null
    );
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 600 then
    return public.admin_internal_deny(
      'content/drafts', 'INSUFFICIENT_MFA', 'admin_delete_content_draft',
      'content_draft', 'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;
  if p_draft_id is null or p_request_id is null
     or p_expected_revision is null or p_expected_revision < 1 then
    return public.admin_internal_deny(
      'content/drafts', 'CONTENT_VALIDATION_FAILED',
      'admin_delete_content_draft', 'content_draft', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;

  v_hash := extensions.digest(convert_to(jsonb_build_object(
    'draft_id', p_draft_id,
    'expected_revision', p_expected_revision,
    'auth_session_id', v_auth ->> 'auth_session_id'
  )::text, 'utf8'), 'sha256');
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor::text || ':' || p_request_id::text, 0
  ));
  select * into v_existing
  from public.content_draft_deletion_requests
  where actor_user_id = v_actor and request_id = p_request_id;
  if found then
    if v_existing.request_hash is distinct from v_hash then
      return public.admin_internal_deny(
        'content/drafts', 'IDEMPOTENCY_CONFLICT',
        'admin_delete_content_draft', 'content_draft', 'admin',
        (v_auth ->> 'principal_id')::uuid,
        (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::integer
      );
    end if;
    return jsonb_set(v_existing.result_receipt, '{replayed}', 'true');
  end if;

  select * into v_draft from public.content_drafts
  where id = p_draft_id for update;
  if not found or v_draft.revision is distinct from p_expected_revision then
    return public.admin_internal_deny(
      'content/drafts', 'CONTENT_DRAFT_CONFLICT',
      'admin_delete_content_draft', 'content_draft', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;

  delete from public.content_draft_requests where draft_id = v_draft.id;
  delete from public.content_drafts where id = v_draft.id;
  v_receipt := jsonb_build_object(
    'outcome', 'ok', 'request_id', p_request_id,
    'deleted_draft_id', p_draft_id, 'replayed', false
  );
  insert into public.content_draft_deletion_requests (
    actor_user_id, request_id, request_hash, result_receipt
  ) values (v_actor, p_request_id, v_hash, v_receipt);
  perform public.admin_internal_append_audit(
    'admin', (v_auth ->> 'principal_id')::uuid,
    (v_auth ->> 'session_id')::uuid,
    (v_auth ->> 'auth_session_id')::uuid,
    'admin_delete_content_draft', 'content_draft', null, 'success', null,
    (v_auth ->> 'mfa_age_seconds')::integer,
    jsonb_build_object(
      'entity_type', v_draft.entity_type,
      'stable_code', v_draft.stable_code,
      'revision', v_draft.revision
    ), p_request_id::text
  );
  return v_receipt;
end;
$$;
revoke execute on function public.admin_delete_content_draft(uuid, integer, uuid)
  from public, anon;
grant execute on function public.admin_delete_content_draft(uuid, integer, uuid)
  to authenticated;
