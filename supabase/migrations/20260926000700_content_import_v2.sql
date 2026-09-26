-- Unified trusted import: external packages are parsed by the Edge adapter,
-- revalidated here, and may create/update drafts only. Missing rows never
-- archive or delete current content.
-- This migration intentionally exceeds 500 lines because quarantine receipts,
-- dry-preview conflict detection, and the atomic draft-only commit boundary
-- must deploy together; splitting them would expose a partial trusted RPC.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'content-import-quarantine', 'content-import-quarantine', false, 10485760,
  array[
    'application/zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.content_import_upload_runs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  auth_session_id uuid not null,
  request_id uuid not null,
  source_filename text not null,
  source_mime_type text not null check (source_mime_type in (
    'application/zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )),
  source_bytes integer not null check (source_bytes between 1 and 10485760),
  object_path text not null unique,
  status text not null default 'awaiting_upload'
    check (status in ('awaiting_upload', 'processing', 'consumed', 'failed')),
  expires_at timestamptz not null default clock_timestamp() + interval '15 minutes',
  created_at timestamptz not null default clock_timestamp(),
  unique (actor_user_id, request_id)
);

alter table public.content_import_upload_runs enable row level security;
revoke all on public.content_import_upload_runs from public, anon, authenticated;

create function content_private.import_denial(
  p_auth jsonb, p_code text, p_action text
) returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public, content_private
as $$
  select public.admin_internal_deny(
    'content/import', p_code, p_action, 'content_import',
    case when p_auth ->> 'principal_id' is null then 'unknown'
      else 'admin' end::public.admin_actor_type,
    (p_auth ->> 'principal_id')::uuid,
    (p_auth ->> 'session_id')::uuid,
    (p_auth ->> 'auth_session_id')::uuid,
    null, null, (p_auth ->> 'mfa_age_seconds')::integer
  )
$$;

create function public.admin_begin_content_import_upload(
  p_request_id uuid, p_source_filename text, p_source_mime_type text,
  p_source_bytes integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_run public.content_import_upload_runs;
  v_id uuid := gen_random_uuid();
  v_ext text;
  v_path text;
begin
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.import_denial(
      v_auth, v_auth ->> 'code', 'admin_begin_content_import_upload');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.import_denial(
      v_auth, 'INSUFFICIENT_MFA', 'admin_begin_content_import_upload');
  end if;
  if p_request_id is null or p_source_bytes not between 1 and 10485760
     or char_length(btrim(coalesce(p_source_filename, ''))) not between 1 and 200
     or p_source_filename ~ '[/\\]'
     or p_source_mime_type not in (
       'application/zip',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     )
     or (p_source_mime_type = 'application/zip'
       and p_source_filename !~* '\.zip$')
     or (p_source_mime_type =
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       and p_source_filename !~* '\.xlsx$') then
    return content_private.import_denial(
      v_auth, 'CONTENT_VALIDATION_FAILED',
      'admin_begin_content_import_upload');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor::text || ':' || p_request_id::text, 0));
  select run.* into v_run from public.content_import_upload_runs run
  where run.actor_user_id = v_actor and run.request_id = p_request_id;
  if v_run.id is not null then
    if v_run.auth_session_id is distinct from
        (v_auth ->> 'auth_session_id')::uuid
       or v_run.source_filename is distinct from btrim(p_source_filename)
       or v_run.source_mime_type is distinct from p_source_mime_type
       or v_run.source_bytes is distinct from p_source_bytes
       or v_run.status <> 'awaiting_upload'
       or clock_timestamp() >= v_run.expires_at then
      return content_private.import_denial(
        v_auth, 'IDEMPOTENCY_CONFLICT',
        'admin_begin_content_import_upload');
    end if;
    return jsonb_build_object('outcome', 'ok', 'run_id', v_run.id,
      'object_path', v_run.object_path, 'expires_at', v_run.expires_at,
      'replayed', true);
  end if;
  v_ext := case when p_source_mime_type = 'application/zip'
    then 'zip' else 'xlsx' end;
  v_path := v_actor::text || '/' || v_id::text || '/package.' || v_ext;
  insert into public.content_import_upload_runs (
    id, actor_user_id, auth_session_id, request_id, source_filename,
    source_mime_type, source_bytes, object_path
  ) values (
    v_id, v_actor, (v_auth ->> 'auth_session_id')::uuid, p_request_id,
    btrim(p_source_filename), p_source_mime_type, p_source_bytes, v_path
  );
  return jsonb_build_object('outcome', 'ok', 'run_id', v_id,
    'object_path', v_path,
    'expires_at', clock_timestamp() + interval '15 minutes',
    'replayed', false);
end;
$$;

create function public.admin_claim_content_import_upload(
  p_run_id uuid, p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_run public.content_import_upload_runs;
begin
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.import_denial(
      v_auth, v_auth ->> 'code', 'admin_claim_content_import_upload');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.import_denial(
      v_auth, 'INSUFFICIENT_MFA', 'admin_claim_content_import_upload');
  end if;
  select run.* into v_run from public.content_import_upload_runs run
  where run.id = p_run_id for update;
  if v_run.id is null or v_run.actor_user_id is distinct from v_actor
     or v_run.auth_session_id is distinct from
        (v_auth ->> 'auth_session_id')::uuid
     or v_run.request_id is distinct from p_request_id
     or v_run.status not in ('awaiting_upload', 'processing')
     or clock_timestamp() >= v_run.expires_at then
    return content_private.import_denial(
      v_auth, 'CONTENT_IMPORT_NOT_FOUND',
      'admin_claim_content_import_upload');
  end if;
  update public.content_import_upload_runs set status = 'processing'
  where id = v_run.id;
  return jsonb_build_object('outcome', 'ok', 'run_id', v_run.id,
    'actor_user_id', v_run.actor_user_id,
    'auth_session_id', v_run.auth_session_id,
    'source_filename', v_run.source_filename,
    'source_mime_type', v_run.source_mime_type,
    'source_bytes', v_run.source_bytes, 'object_path', v_run.object_path,
    'replayed', v_run.status = 'processing');
end;
$$;

create function public.svc_finish_content_import_upload(
  p_run_id uuid, p_actor_user_id uuid, p_auth_session_id uuid,
  p_status text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_status not in ('consumed', 'failed') then
    raise exception using errcode = '22023', message = 'invalid import status';
  end if;
  update public.content_import_upload_runs set status = p_status
  where id = p_run_id and actor_user_id = p_actor_user_id
    and auth_session_id = p_auth_session_id and status = 'processing';
  if not found then
    raise exception using errcode = 'P0001', message = 'CONTENT_IMPORT_NOT_FOUND';
  end if;
end;
$$;

create function public.svc_verify_content_import_media(p_mappings jsonb)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, content_private
as $$
  select jsonb_typeof(p_mappings) = 'array'
    and jsonb_array_length(p_mappings) <= 30
    and not exists (
      select 1 from jsonb_array_elements(p_mappings) mapping
      where coalesce(mapping ->> 'asset_id', '') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or coalesce(mapping ->> 'source_sha256', '') !~ '^[0-9a-f]{64}$'
        or coalesce(mapping ->> 'semantic_role', '')
          not in ('standard', 'color_critical')
        or not exists (
          select 1 from public.content_media_assets asset
          where asset.id = content_private.json_uuid(mapping, 'asset_id')
            and asset.source_sha256 = mapping ->> 'source_sha256'
            and asset.semantic_role = mapping ->> 'semantic_role'
        )
    )
$$;

create table public.content_import_runs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  auth_session_id uuid not null,
  preview_request_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_filename text not null check (
    char_length(source_filename) between 1 and 200
    and source_filename !~ '[/\\]'
  ),
  normalized_items jsonb not null check (jsonb_typeof(normalized_items) = 'array'),
  preview jsonb not null,
  status text not null default 'previewed'
    check (status in ('previewed', 'committed')),
  commit_request_id uuid,
  result_receipt jsonb,
  created_at timestamptz not null default clock_timestamp(),
  committed_at timestamptz,
  unique (actor_user_id, preview_request_id)
);

alter table public.content_import_runs enable row level security;
revoke all on public.content_import_runs from public, anon, authenticated;

create function content_private.import_entity_id(
  p_entity_type text, p_stable_code text
) returns uuid
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare v_id uuid;
begin
  case p_entity_type
    when 'course' then select id into v_id from public.courses
      where stable_code = p_stable_code;
    when 'chapter' then select id into v_id from public.chapters
      where stable_code = p_stable_code;
    when 'section' then select id into v_id from public.sections
      where stable_code = p_stable_code;
    when 'subtopic' then select id into v_id from public.subtopics
      where stable_code = p_stable_code;
    when 'review_card' then select id into v_id from public.review_cards
      where stable_code = p_stable_code;
    when 'assessment_bank' then select id into v_id from public.assessment_banks
      where stable_code = p_stable_code;
    when 'question' then select id into v_id from public.questions
      where stable_code = p_stable_code;
    else return null;
  end case;
  return v_id;
end;
$$;

create function content_private.resolve_import_item(p_item jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, content_private
as $$
declare
  v_type text := p_item ->> 'entity_type';
  v_code text := btrim(coalesce(p_item ->> 'stable_code', ''));
  v_sheet text := nullif(btrim(coalesce(p_item ->> 'sheet', '')), '');
  v_row_number integer := case
    when p_item ->> 'row_number' ~ '^[1-9][0-9]*$'
      then (p_item ->> 'row_number')::integer
    else null end;
  v_payload jsonb := coalesce(p_item -> 'payload', '{}'::jsonb);
  v_parent uuid;
  v_entity_id uuid;
  v_current jsonb;
  v_current_payload jsonb;
  v_draft public.content_drafts;
  v_candidate public.content_drafts;
  v_issues jsonb;
  v_disposition text;
begin
  if v_type not in (
    'course', 'chapter', 'section', 'subtopic', 'review_card',
    'assessment_bank', 'question'
  ) or v_code = '' or jsonb_typeof(v_payload) is distinct from 'object' then
    return jsonb_build_object(
      'sheet', v_sheet, 'row_number', v_row_number,
      'entity_type', v_type, 'stable_code', v_code,
      'disposition', 'error', 'issues', jsonb_build_array(
        content_private.issue('IMPORT_ROW_INVALID', 'row', '匯入列格式不正確。')));
  end if;

  case v_type
    when 'chapter' then
      v_parent := content_private.import_entity_id(
        'course', v_payload ->> 'course_code');
      v_payload := (v_payload - 'course_code') ||
        jsonb_build_object('course_id', v_parent);
    when 'section' then
      v_parent := content_private.import_entity_id(
        'chapter', v_payload ->> 'chapter_code');
      v_payload := (v_payload - 'chapter_code') ||
        jsonb_build_object('chapter_id', v_parent);
    when 'subtopic' then
      v_parent := content_private.import_entity_id(
        'section', v_payload ->> 'section_code');
      v_payload := (v_payload - 'section_code') ||
        jsonb_build_object('section_id', v_parent);
    when 'review_card' then
      v_parent := content_private.import_entity_id(
        'subtopic', v_payload ->> 'subtopic_code');
      v_payload := (v_payload - 'subtopic_code') ||
        jsonb_build_object('subtopic_id', v_parent);
    when 'assessment_bank' then
      if v_payload ->> 'kind' in ('QB', 'LT') then
        v_parent := content_private.import_entity_id(
          'section', v_payload ->> 'section_code');
        v_payload := (v_payload - 'section_code' - 'chapter_code') ||
          jsonb_build_object('section_id', v_parent);
      else
        v_parent := content_private.import_entity_id(
          'chapter', v_payload ->> 'chapter_code');
        v_payload := (v_payload - 'chapter_code' - 'section_code') ||
          jsonb_build_object('chapter_id', v_parent);
      end if;
    when 'question' then
      v_parent := content_private.import_entity_id(
        'assessment_bank', v_payload ->> 'bank_code');
      v_payload := (v_payload - 'bank_code') ||
        jsonb_build_object('bank_id', v_parent);
    else null;
  end case;

  v_entity_id := content_private.import_entity_id(v_type, v_code);
  if v_entity_id is not null then
    v_current := content_private.current_entity(v_type, v_entity_id);
    v_current_payload := v_current -> 'payload';
    if v_type = 'question' and jsonb_typeof(v_current_payload -> 'options') = 'array'
    then
      v_current_payload := jsonb_set(v_current_payload, '{options}', (
        select jsonb_agg(option.value - 'id' order by option.ordinality)
        from jsonb_array_elements(v_current_payload -> 'options')
          with ordinality option
      ));
    end if;
    select draft.* into v_draft from public.content_drafts draft
    where draft.entity_type = v_type and draft.entity_id = v_entity_id;
  else
    select draft.* into v_draft from public.content_drafts draft
    where draft.entity_type = v_type and draft.entity_id is null
      and draft.stable_code = v_code
    order by draft.updated_at desc, draft.id limit 1;
  end if;
  v_candidate := jsonb_populate_record(null::public.content_drafts,
    jsonb_build_object(
      'id', coalesce(v_draft.id, gen_random_uuid()),
      'entity_type', v_type, 'entity_id', v_entity_id,
      'stable_code', v_code,
      'base_version', (v_current ->> 'version')::integer,
      'revision', coalesce(v_draft.revision, 1), 'payload', v_payload,
      'source', 'import', 'actor_user_id', auth.uid(),
      'created_at', clock_timestamp(), 'updated_at', clock_timestamp()
    ));
  v_issues := content_private.validate_draft(v_candidate);
  v_disposition := case
    when jsonb_array_length(v_issues) > 0 then 'error'
    when v_draft.id is not null and v_draft.payload = v_payload then 'no_op'
    when v_current is not null and v_current_payload = v_payload then 'no_op'
    when v_entity_id is null then 'create'
    else 'update' end;
  return jsonb_build_object(
    'sheet', v_sheet, 'row_number', v_row_number,
    'entity_type', v_type, 'stable_code', v_code,
    'entity_id', v_entity_id, 'draft_id', v_draft.id,
    'base_version', (v_current ->> 'version')::integer,
    'expected_revision', coalesce(v_draft.revision, 0),
    'payload', v_payload, 'disposition', v_disposition,
    'issues', v_issues,
    'warnings', case when v_disposition = 'update'
      then jsonb_build_array(content_private.issue(
        'IMPORT_UPDATE_REQUIRES_CONFIRMATION', 'stable_code',
        '此列會更新既有內容草稿，提交前需確認。', 'warning'))
      else '[]'::jsonb end
  );
end;
$$;

create function content_private.import_item_stale(p_item jsonb)
returns boolean
language plpgsql
stable
set search_path = pg_catalog, public, content_private
as $$
declare
  v_type text := p_item ->> 'entity_type';
  v_code text := p_item ->> 'stable_code';
  v_expected_entity_id uuid := content_private.json_uuid(p_item, 'entity_id');
  v_expected_draft_id uuid := content_private.json_uuid(p_item, 'draft_id');
  v_expected_revision integer := coalesce(
    nullif(p_item ->> 'expected_revision', '')::integer, 0);
  v_expected_base_version integer := nullif(
    p_item ->> 'base_version', '')::integer;
  v_entity_id uuid;
  v_current jsonb;
  v_draft public.content_drafts;
begin
  v_entity_id := content_private.import_entity_id(v_type, v_code);
  if v_entity_id is distinct from v_expected_entity_id then return true; end if;
  if v_entity_id is not null then
    v_current := content_private.current_entity(v_type, v_entity_id);
    select draft.* into v_draft from public.content_drafts draft
    where draft.entity_type = v_type and draft.entity_id = v_entity_id;
  else
    select draft.* into v_draft from public.content_drafts draft
    where draft.entity_type = v_type and draft.entity_id is null
      and draft.stable_code = v_code
    order by draft.updated_at desc, draft.id limit 1;
  end if;
  return v_draft.id is distinct from v_expected_draft_id
    or coalesce(v_draft.revision, 0) is distinct from v_expected_revision
    or (v_current ->> 'version')::integer
      is distinct from v_expected_base_version;
exception when invalid_text_representation then
  return true;
end;
$$;

create function public.admin_preview_content_import_v2(
  p_request_id uuid, p_source_sha256 text, p_source_filename text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_existing public.content_import_runs;
  v_resolved jsonb;
  v_preview jsonb;
  v_run_id uuid;
begin
  perform set_config('statement_timeout', '8000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.import_denial(
      v_auth, v_auth ->> 'code', 'admin_preview_content_import_v2');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.import_denial(
      v_auth, 'INSUFFICIENT_MFA', 'admin_preview_content_import_v2');
  end if;
  if p_request_id is null or p_source_sha256 !~ '^[0-9a-f]{64}$'
     or char_length(btrim(coalesce(p_source_filename, ''))) not between 1 and 200
     or p_source_filename ~ '[/\\]' or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 5000 then
    return content_private.import_denial(
      v_auth, 'CONTENT_VALIDATION_FAILED', 'admin_preview_content_import_v2');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor::text || ':' || p_request_id::text, 0));
  select run.* into v_existing from public.content_import_runs run
  where run.actor_user_id = v_actor and run.preview_request_id = p_request_id;
  if v_existing.id is not null then
    if v_existing.auth_session_id is distinct from
        (v_auth ->> 'auth_session_id')::uuid
       or v_existing.source_sha256 is distinct from p_source_sha256
       or v_existing.normalized_items is distinct from p_items then
      return content_private.import_denial(
        v_auth, 'IDEMPOTENCY_CONFLICT', 'admin_preview_content_import_v2');
    end if;
    return v_existing.preview || jsonb_build_object(
      'run_id', v_existing.id, 'replayed', true);
  end if;
  select jsonb_agg(content_private.resolve_import_item(item.value)
    order by item.ordinality)
  into v_resolved from jsonb_array_elements(p_items) with ordinality item;
  v_preview := jsonb_build_object(
    'outcome', 'ok', 'action', 'preview', 'replayed', false,
    'source_sha256', p_source_sha256,
    'items', v_resolved,
    'create_count', (select count(*) from jsonb_array_elements(v_resolved) row
      where row ->> 'disposition' = 'create'),
    'update_count', (select count(*) from jsonb_array_elements(v_resolved) row
      where row ->> 'disposition' = 'update'),
    'no_op_count', (select count(*) from jsonb_array_elements(v_resolved) row
      where row ->> 'disposition' = 'no_op'),
    'error_count', (select count(*) from jsonb_array_elements(v_resolved) row
      where row ->> 'disposition' = 'error'),
    'warning_count', (select coalesce(sum(jsonb_array_length(
      coalesce(row -> 'warnings', '[]'::jsonb))), 0)
      from jsonb_array_elements(v_resolved) row)
  );
  insert into public.content_import_runs (
    actor_user_id, auth_session_id, preview_request_id, source_sha256,
    source_filename, normalized_items, preview
  ) values (
    v_actor, (v_auth ->> 'auth_session_id')::uuid, p_request_id,
    p_source_sha256, btrim(p_source_filename), p_items, v_preview
  ) returning id into v_run_id;
  return v_preview || jsonb_build_object('run_id', v_run_id);
end;
$$;

create function public.admin_commit_content_import_v2(
  p_run_id uuid, p_request_id uuid, p_confirm_warnings boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_run public.content_import_runs;
  v_item jsonb;
  v_saved jsonb;
  v_results jsonb := '[]'::jsonb;
  v_receipt jsonb;
begin
  perform set_config('statement_timeout', '15000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.import_denial(
      v_auth, v_auth ->> 'code', 'admin_commit_content_import_v2');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.import_denial(
      v_auth, 'INSUFFICIENT_MFA', 'admin_commit_content_import_v2');
  end if;
  select run.* into v_run from public.content_import_runs run
  where run.id = p_run_id for update;
  if v_run.id is null or v_run.actor_user_id is distinct from v_actor
     or v_run.auth_session_id is distinct from
        (v_auth ->> 'auth_session_id')::uuid then
    return content_private.import_denial(
      v_auth, 'CONTENT_IMPORT_NOT_FOUND', 'admin_commit_content_import_v2');
  end if;
  if v_run.status = 'committed' then
    if v_run.commit_request_id is distinct from p_request_id then
      return content_private.import_denial(
        v_auth, 'IDEMPOTENCY_CONFLICT', 'admin_commit_content_import_v2');
    end if;
    return v_run.result_receipt || jsonb_build_object('replayed', true);
  end if;
  if (v_run.preview ->> 'error_count')::integer > 0 then
    return content_private.import_denial(
      v_auth, 'CONTENT_VALIDATION_FAILED', 'admin_commit_content_import_v2');
  end if;
  if (v_run.preview ->> 'warning_count')::integer > 0
     and not coalesce(p_confirm_warnings, false) then
    return content_private.import_denial(
      v_auth, 'CONTENT_IMPORT_CONFIRMATION_REQUIRED',
      'admin_commit_content_import_v2');
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_run.preview -> 'items') item
    where content_private.import_item_stale(item.value)
  ) then
    return content_private.import_denial(
      v_auth, 'CONTENT_IMPORT_STALE_PREVIEW',
      'admin_commit_content_import_v2');
  end if;
  for v_item in select value from jsonb_array_elements(v_run.preview -> 'items')
  loop
    if v_item ->> 'disposition' in ('create', 'update') then
      v_saved := public.admin_save_content_draft(
        (v_item ->> 'draft_id')::uuid, (v_item ->> 'entity_id')::uuid,
        v_item ->> 'entity_type', v_item ->> 'stable_code',
        (v_item ->> 'expected_revision')::integer, v_item -> 'payload',
        'import', gen_random_uuid());
      if v_saved ->> 'outcome' is distinct from 'ok' then
        raise exception using errcode = 'P0001',
          message = 'CONTENT_IMPORT_TRANSACTION_FAILED';
      end if;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'stable_code', v_item ->> 'stable_code',
        'entity_type', v_item ->> 'entity_type',
        'disposition', v_item ->> 'disposition',
        'draft_id', v_saved #>> '{draft,draft_id}',
        'draft_revision', v_saved #>> '{draft,revision}'));
    else
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'stable_code', v_item ->> 'stable_code',
        'entity_type', v_item ->> 'entity_type',
        'disposition', 'no_op'));
    end if;
  end loop;
  v_receipt := jsonb_build_object(
    'outcome', 'ok', 'action', 'commit', 'run_id', v_run.id,
    'request_id', p_request_id, 'replayed', false,
    'source_sha256', v_run.source_sha256, 'results', v_results);
  update public.content_import_runs set status = 'committed',
    commit_request_id = p_request_id, result_receipt = v_receipt,
    committed_at = clock_timestamp() where id = v_run.id;
  perform public.admin_internal_append_audit(
    'admin', (v_auth ->> 'principal_id')::uuid,
    (v_auth ->> 'session_id')::uuid,
    (v_auth ->> 'auth_session_id')::uuid,
    'admin_commit_content_import_v2', 'content_import', null, 'success',
    null, (v_auth ->> 'mfa_age_seconds')::integer,
    jsonb_build_object('run_id', v_run.id,
      'source_sha256', v_run.source_sha256,
      'result_count', jsonb_array_length(v_results)), p_request_id::text);
  return v_receipt;
end;
$$;

revoke execute on function content_private.import_entity_id(text, text)
  from public, anon, authenticated;
revoke execute on function content_private.resolve_import_item(jsonb)
  from public, anon, authenticated;
revoke execute on function content_private.import_item_stale(jsonb)
  from public, anon, authenticated;
revoke execute on function content_private.import_denial(jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_begin_content_import_upload(
  uuid, text, text, integer) from public, anon;
grant execute on function public.admin_begin_content_import_upload(
  uuid, text, text, integer) to authenticated;
revoke all on function public.admin_claim_content_import_upload(uuid, uuid)
  from public, anon;
grant execute on function public.admin_claim_content_import_upload(uuid, uuid)
  to authenticated;
revoke all on function public.svc_finish_content_import_upload(
  uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.svc_finish_content_import_upload(
  uuid, uuid, uuid, text) to service_role;
revoke all on function public.svc_verify_content_import_media(jsonb)
  from public, anon, authenticated;
grant execute on function public.svc_verify_content_import_media(jsonb)
  to service_role;
revoke all on function public.admin_preview_content_import_v2(
  uuid, text, text, jsonb) from public, anon;
grant execute on function public.admin_preview_content_import_v2(
  uuid, text, text, jsonb) to authenticated;
revoke all on function public.admin_commit_content_import_v2(
  uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_commit_content_import_v2(
  uuid, uuid, boolean) to authenticated;
