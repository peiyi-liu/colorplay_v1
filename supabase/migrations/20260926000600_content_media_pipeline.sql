-- Phase 2 trusted media pipeline. Browser uploads are confined to one signed
-- quarantine object; verified manifests and derivatives are immutable. Only
-- the Edge service sees physical final paths, while published content stores a
-- stable logical media reference.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values
  ('content-media-quarantine', 'content-media-quarantine', false, 2097152,
    array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('content-media', 'content-media', false, 2097152,
    array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.content_media_upload_runs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null unique default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  auth_session_id uuid not null,
  request_id uuid not null,
  request_hash bytea not null,
  source_filename text not null
    check (char_length(source_filename) between 1 and 200),
  source_mime_type text not null
    check (source_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  source_bytes integer not null check (source_bytes between 1 and 2097152),
  semantic_role text not null
    check (semantic_role in ('standard', 'color_critical')),
  quarantine_object_path text not null unique
    check (char_length(quarantine_object_path) between 1 and 500),
  status text not null default 'awaiting_upload'
    check (status in (
      'awaiting_upload', 'processing', 'verified', 'failed', 'aborted'
    )),
  failure_code text check (
    failure_code is null or failure_code in (
      'CONTENT_MEDIA_FILE_INVALID', 'CONTENT_MEDIA_INTEGRITY_FAILED',
      'CONTENT_MEDIA_PROCESSING_FAILED', 'CONTENT_MEDIA_QUALITY_FAILED',
      'CONTENT_MEDIA_STORAGE_FAILED'
    )
  ),
  result_receipt jsonb,
  expires_at timestamptz not null default clock_timestamp() + interval '15 minutes',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (actor_user_id, request_id)
);

create table public.content_media_assets (
  id uuid primary key,
  upload_run_id uuid not null unique
    references public.content_media_upload_runs(id) on delete restrict,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  pixel_semantic_sha256 text not null
    check (pixel_semantic_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null unique
    check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_mime_type text not null
    check (source_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  source_bytes integer not null check (source_bytes between 1 and 2097152),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  has_alpha boolean not null,
  semantic_role text not null
    check (semantic_role in ('standard', 'color_critical')),
  processor_version text not null
    check (char_length(processor_version) between 1 and 200),
  master_object_path text not null unique
    check (char_length(master_object_path) between 1 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  verified_at timestamptz not null default clock_timestamp()
);

create table public.content_media_variants (
  asset_id uuid not null
    references public.content_media_assets(id) on delete restrict,
  kind text not null
    check (kind in ('thumbnail', 'reading', 'color_critical')),
  object_path text not null unique
    check (char_length(object_path) between 1 and 500),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null default 'image/webp'
    check (mime_type = 'image/webp'),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  bytes integer not null check (bytes between 1 and 256000),
  quality_mode text not null
    check (quality_mode in ('lossy', 'lossless', 'high_quality')),
  structural_similarity_distortion double precision check (
    structural_similarity_distortion is null
    or structural_similarity_distortion between 0 and 1
  ),
  primary key (asset_id, kind)
);

alter table public.content_media_upload_runs enable row level security;
alter table public.content_media_assets enable row level security;
alter table public.content_media_variants enable row level security;
revoke all on public.content_media_upload_runs from public, anon, authenticated;
revoke all on public.content_media_assets from public, anon, authenticated;
revoke all on public.content_media_variants from public, anon, authenticated;

create function content_private.block_immutable_media()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000',
    message = 'verified content media is immutable';
end;
$$;

create trigger content_media_assets_immutable
before update or delete on public.content_media_assets
for each row execute function content_private.block_immutable_media();
create trigger content_media_variants_immutable
before update or delete on public.content_media_variants
for each row execute function content_private.block_immutable_media();

alter table public.review_card_media
  add column manifest_id uuid references public.content_media_assets(id)
    on delete restrict,
  add column semantic_role text check (
    semantic_role is null or semantic_role in ('standard', 'color_critical')
  );

create unique index review_card_media_manifest_version_unique
on public.review_card_media(review_card_id, card_version, manifest_id)
where manifest_id is not null;

create function content_private.media_denial(
  p_auth jsonb, p_code text, p_action text
) returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select public.admin_internal_deny(
    'content/media', p_code, p_action, 'content_media',
    case when p_auth ->> 'principal_id' is null then 'unknown'
      else 'admin' end::public.admin_actor_type,
    (p_auth ->> 'principal_id')::uuid,
    (p_auth ->> 'session_id')::uuid,
    (p_auth ->> 'auth_session_id')::uuid,
    null, null, (p_auth ->> 'mfa_age_seconds')::integer
  )
$$;

create function public.admin_begin_content_media_upload(
  p_request_id uuid,
  p_source_filename text,
  p_source_mime_type text,
  p_source_bytes integer,
  p_semantic_role text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_existing public.content_media_upload_runs;
  v_run_id uuid := gen_random_uuid();
  v_asset_id uuid := gen_random_uuid();
  v_extension text;
  v_path text;
  v_hash bytea;
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.media_denial(
      v_auth, v_auth ->> 'code', 'admin_begin_content_media_upload');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.media_denial(
      v_auth, 'INSUFFICIENT_MFA', 'admin_begin_content_media_upload');
  end if;
  if p_request_id is null
     or char_length(btrim(coalesce(p_source_filename, ''))) not between 1 and 200
     or position('/' in p_source_filename) > 0
     or position(chr(92) in p_source_filename) > 0
     or p_source_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or p_source_bytes not between 1 and 2097152
     or p_semantic_role not in ('standard', 'color_critical') then
    return content_private.media_denial(
      v_auth, 'CONTENT_MEDIA_FILE_INVALID',
      'admin_begin_content_media_upload');
  end if;
  v_hash := extensions.digest(convert_to(jsonb_build_object(
    'source_filename', btrim(p_source_filename),
    'source_mime_type', p_source_mime_type,
    'source_bytes', p_source_bytes,
    'semantic_role', p_semantic_role,
    'auth_session_id', v_auth ->> 'auth_session_id'
  )::text, 'UTF8'), 'sha256');
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor::text || ':' || p_request_id::text, 0));
  select run.* into v_existing
  from public.content_media_upload_runs run
  where run.actor_user_id = v_actor and run.request_id = p_request_id;
  if v_existing.id is not null then
    if v_existing.request_hash is distinct from v_hash
       or v_existing.auth_session_id is distinct from
          (v_auth ->> 'auth_session_id')::uuid then
      return content_private.media_denial(
        v_auth, 'IDEMPOTENCY_CONFLICT',
        'admin_begin_content_media_upload');
    end if;
    if v_existing.status <> 'awaiting_upload'
       or clock_timestamp() >= v_existing.expires_at then
      return content_private.media_denial(
        v_auth, 'CONTENT_MEDIA_RUN_CONFLICT',
        'admin_begin_content_media_upload');
    end if;
    return jsonb_build_object(
      'outcome', 'ok', 'action', 'begin', 'run_id', v_existing.id,
      'asset_id', v_existing.asset_id,
      'bucket', 'content-media-quarantine',
      'object_path', v_existing.quarantine_object_path,
      'expires_at', v_existing.expires_at, 'replayed', true
    );
  end if;
  v_extension := case p_source_mime_type
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
  v_path := v_actor::text || '/' || v_run_id::text || '/source.' || v_extension;
  insert into public.content_media_upload_runs (
    id, asset_id, actor_user_id, auth_session_id, request_id, request_hash,
    source_filename, source_mime_type, source_bytes, semantic_role,
    quarantine_object_path
  ) values (
    v_run_id, v_asset_id, v_actor, (v_auth ->> 'auth_session_id')::uuid,
    p_request_id, v_hash, btrim(p_source_filename), p_source_mime_type,
    p_source_bytes, p_semantic_role, v_path
  );
  perform public.admin_internal_append_audit(
    'admin', (v_auth ->> 'principal_id')::uuid,
    (v_auth ->> 'session_id')::uuid,
    (v_auth ->> 'auth_session_id')::uuid,
    'admin_begin_content_media_upload', 'content_media', null, 'success',
    null, (v_auth ->> 'mfa_age_seconds')::integer,
    jsonb_build_object('run_id', v_run_id, 'semantic_role', p_semantic_role,
      'source_bytes', p_source_bytes), p_request_id::text);
  return jsonb_build_object(
    'outcome', 'ok', 'action', 'begin', 'run_id', v_run_id,
    'asset_id', v_asset_id, 'bucket', 'content-media-quarantine',
    'object_path', v_path,
    'expires_at', clock_timestamp() + interval '15 minutes',
    'replayed', false
  );
end;
$$;

create function public.admin_claim_content_media_upload(
  p_run_id uuid, p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_run public.content_media_upload_runs;
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.media_denial(
      v_auth, v_auth ->> 'code', 'admin_claim_content_media_upload');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.media_denial(
      v_auth, 'INSUFFICIENT_MFA', 'admin_claim_content_media_upload');
  end if;
  select run.* into v_run from public.content_media_upload_runs run
  where run.id = p_run_id for update;
  if v_run.id is null or v_run.actor_user_id is distinct from v_actor
     or v_run.request_id is distinct from p_request_id
     or v_run.auth_session_id is distinct from
        (v_auth ->> 'auth_session_id')::uuid then
    return content_private.media_denial(
      v_auth, 'CONTENT_MEDIA_NOT_FOUND',
      'admin_claim_content_media_upload');
  end if;
  if v_run.status = 'verified' then
    return jsonb_build_object(
      'outcome', 'ok', 'action', 'verified', 'run_id', v_run.id,
      'request_id', v_run.request_id, 'replayed', true,
      'receipt', v_run.result_receipt
    );
  end if;
  if v_run.status not in ('awaiting_upload', 'processing')
     or clock_timestamp() >= v_run.expires_at then
    return content_private.media_denial(
      v_auth, 'CONTENT_MEDIA_RUN_CONFLICT',
      'admin_claim_content_media_upload');
  end if;
  update public.content_media_upload_runs set
    status = 'processing', updated_at = clock_timestamp()
  where id = v_run.id;
  return jsonb_build_object(
    'outcome', 'ok', 'action', 'claim', 'run_id', v_run.id,
    'asset_id', v_run.asset_id, 'request_id', v_run.request_id,
    'actor_user_id', v_run.actor_user_id,
    'auth_session_id', v_run.auth_session_id,
    'source_mime_type', v_run.source_mime_type,
    'source_bytes', v_run.source_bytes,
    'semantic_role', v_run.semantic_role,
    'bucket', 'content-media-quarantine',
    'object_path', v_run.quarantine_object_path,
    'replayed', v_run.status = 'processing'
  );
end;
$$;

create function public.admin_abort_content_media_upload(
  p_run_id uuid, p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_run public.content_media_upload_runs;
begin
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.media_denial(
      v_auth, v_auth ->> 'code', 'admin_abort_content_media_upload');
  end if;
  select run.* into v_run from public.content_media_upload_runs run
  where run.id = p_run_id for update;
  if v_run.id is null or v_run.actor_user_id is distinct from v_actor
     or v_run.request_id is distinct from p_request_id
     or v_run.auth_session_id is distinct from
        (v_auth ->> 'auth_session_id')::uuid then
    return content_private.media_denial(
      v_auth, 'CONTENT_MEDIA_NOT_FOUND',
      'admin_abort_content_media_upload');
  end if;
  if v_run.status = 'verified' then
    return content_private.media_denial(
      v_auth, 'CONTENT_MEDIA_RUN_CONFLICT',
      'admin_abort_content_media_upload');
  end if;
  update public.content_media_upload_runs set
    status = 'aborted', updated_at = clock_timestamp()
  where id = v_run.id and status <> 'aborted';
  return jsonb_build_object(
    'outcome', 'ok', 'action', 'abort', 'run_id', v_run.id,
    'bucket', 'content-media-quarantine',
    'object_path', v_run.quarantine_object_path
  );
end;
$$;

create function public.svc_complete_content_media_upload(
  p_run_id uuid,
  p_actor_user_id uuid,
  p_auth_session_id uuid,
  p_source_sha256 text,
  p_pixel_semantic_sha256 text,
  p_manifest_sha256 text,
  p_width integer,
  p_height integer,
  p_has_alpha boolean,
  p_processor_version text,
  p_master_object_path text,
  p_variants jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_run public.content_media_upload_runs;
  v_variant jsonb;
  v_expected_kinds text[];
  v_actual_kinds text[];
  v_receipt jsonb;
  v_principal uuid;
begin
  perform set_config('statement_timeout', '5000', true);
  select run.* into v_run from public.content_media_upload_runs run
  where run.id = p_run_id for update;
  if v_run.id is null or v_run.status <> 'processing'
     or v_run.actor_user_id is distinct from p_actor_user_id
     or v_run.auth_session_id is distinct from p_auth_session_id then
    return jsonb_build_object(
      'outcome', 'denied', 'code', 'CONTENT_MEDIA_RUN_CONFLICT',
      'message', '媒體處理狀態已變更。', 'retryable', false,
      'request_id', coalesce(v_run.request_id, gen_random_uuid())
    );
  end if;
  v_expected_kinds := case when v_run.semantic_role = 'color_critical'
    then array['color_critical', 'reading', 'thumbnail']::text[]
    else array['reading', 'thumbnail']::text[] end;
  select array_agg(value ->> 'kind' order by value ->> 'kind')
  into v_actual_kinds from jsonb_array_elements(coalesce(p_variants, '[]'));
  if p_source_sha256 !~ '^[0-9a-f]{64}$'
     or p_pixel_semantic_sha256 !~ '^[0-9a-f]{64}$'
     or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
     or p_width not between 1 and 4096 or p_height not between 1 and 4096
     or char_length(p_processor_version) not between 1 and 200
     or p_master_object_path <> 'masters/' || v_run.asset_id::text || '/'
        || p_source_sha256 || (case v_run.source_mime_type
          when 'image/jpeg' then '.jpg' when 'image/png' then '.png'
          else '.webp' end)
     or jsonb_typeof(p_variants) is distinct from 'array'
     or v_actual_kinds is distinct from v_expected_kinds
     or exists (
       select 1 from jsonb_array_elements(p_variants) item
       where item ->> 'mime_type' <> 'image/webp'
         or coalesce(item ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
         or coalesce(item ->> 'object_path', '') <>
           'variants/' || v_run.asset_id::text || '/'
             || (item ->> 'kind') || '-' || (item ->> 'sha256') || '.webp'
         or coalesce(item ->> 'width', '') !~ '^[0-9]+$'
         or coalesce(item ->> 'height', '') !~ '^[0-9]+$'
         or coalesce(item ->> 'bytes', '') !~ '^[0-9]+$'
         or (item ->> 'width')::integer not between 1 and 4096
         or (item ->> 'height')::integer not between 1 and 4096
         or (item ->> 'bytes')::integer not between 1 and 256000
         or item ->> 'quality_mode' not in ('lossy','lossless','high_quality')
         or (item ->> 'kind' = 'color_critical' and (
           item ->> 'structural_similarity_distortion' is null
           or (item ->> 'structural_similarity_distortion')::double precision
              > 0.01
         ))
     ) then
    return jsonb_build_object(
      'outcome', 'denied', 'code', 'CONTENT_MEDIA_INTEGRITY_FAILED',
      'message', '媒體 manifest 完整性驗證失敗。', 'retryable', false,
      'request_id', v_run.request_id
    );
  end if;
  insert into public.content_media_assets (
    id, upload_run_id, source_sha256, pixel_semantic_sha256,
    manifest_sha256, source_mime_type, source_bytes, width, height, has_alpha,
    semantic_role, processor_version, master_object_path, created_by
  ) values (
    v_run.asset_id, v_run.id, p_source_sha256, p_pixel_semantic_sha256,
    p_manifest_sha256, v_run.source_mime_type, v_run.source_bytes,
    p_width, p_height, p_has_alpha, v_run.semantic_role,
    p_processor_version, p_master_object_path, v_run.actor_user_id
  );
  for v_variant in select value from jsonb_array_elements(p_variants) loop
    insert into public.content_media_variants (
      asset_id, kind, object_path, sha256, mime_type, width, height, bytes,
      quality_mode, structural_similarity_distortion
    ) values (
      v_run.asset_id, v_variant ->> 'kind', v_variant ->> 'object_path',
      v_variant ->> 'sha256', v_variant ->> 'mime_type',
      (v_variant ->> 'width')::integer, (v_variant ->> 'height')::integer,
      (v_variant ->> 'bytes')::integer, v_variant ->> 'quality_mode',
      (v_variant ->> 'structural_similarity_distortion')::double precision
    );
  end loop;
  v_receipt := jsonb_build_object(
    'asset_id', v_run.asset_id, 'source_sha256', p_source_sha256,
    'manifest_sha256', p_manifest_sha256,
    'semantic_role', v_run.semantic_role, 'width', p_width,
    'height', p_height, 'has_alpha', p_has_alpha,
    'variants', (
      select jsonb_agg(jsonb_build_object(
        'kind', variant.kind, 'sha256', variant.sha256,
        'mime_type', variant.mime_type, 'width', variant.width,
        'height', variant.height, 'bytes', variant.bytes,
        'quality_mode', variant.quality_mode,
        'structural_similarity_distortion',
          variant.structural_similarity_distortion
      ) order by case variant.kind when 'thumbnail' then 1
        when 'reading' then 2 else 3 end)
      from public.content_media_variants variant
      where variant.asset_id = v_run.asset_id
    )
  );
  update public.content_media_upload_runs set
    status = 'verified', result_receipt = v_receipt,
    updated_at = clock_timestamp()
  where id = v_run.id;
  select identity.audit_principal_id into v_principal
  from public.admin_security_identities identity
  where identity.admin_user_id = v_run.actor_user_id;
  perform public.admin_internal_append_audit(
    'admin', v_principal, null, v_run.auth_session_id,
    'content_media_verified', 'content_media', null, 'success', null, null,
    jsonb_build_object('asset_id', v_run.asset_id,
      'manifest_sha256', p_manifest_sha256,
      'semantic_role', v_run.semantic_role), v_run.request_id::text);
  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_run.request_id,
    'run_id', v_run.id, 'receipt', v_receipt
  );
end;
$$;

create function public.svc_fail_content_media_upload(
  p_run_id uuid, p_actor_user_id uuid, p_auth_session_id uuid,
  p_failure_code text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_run public.content_media_upload_runs;
begin
  select run.* into v_run from public.content_media_upload_runs run
  where run.id = p_run_id for update;
  if v_run.id is null or v_run.status = 'verified'
     or v_run.actor_user_id is distinct from p_actor_user_id
     or v_run.auth_session_id is distinct from p_auth_session_id
     or p_failure_code not in (
       'CONTENT_MEDIA_FILE_INVALID', 'CONTENT_MEDIA_INTEGRITY_FAILED',
       'CONTENT_MEDIA_PROCESSING_FAILED', 'CONTENT_MEDIA_QUALITY_FAILED',
       'CONTENT_MEDIA_STORAGE_FAILED'
     ) then
    return jsonb_build_object('outcome', 'denied',
      'code', 'CONTENT_MEDIA_RUN_CONFLICT');
  end if;
  update public.content_media_upload_runs set
    status = 'failed', failure_code = p_failure_code,
    updated_at = clock_timestamp()
  where id = v_run.id;
  return jsonb_build_object('outcome', 'ok', 'run_id', v_run.id);
end;
$$;

create function content_private.student_can_access_chapter_for(
  p_actor_id uuid, p_chapter_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_chapter public.chapters;
  v_mode text;
begin
  if p_actor_id is null then return false; end if;
  select chapter.* into v_chapter
  from public.chapters chapter
  join public.courses course on course.id = chapter.course_id
  where chapter.id = p_chapter_id and chapter.status = 'published'
    and course.status = 'published';
  if v_chapter.id is null
     or not public.chapter_content_is_available(p_chapter_id) then
    return false;
  end if;
  select coalesce(setting.mode, 'open') into v_mode
  from (select v_chapter.course_id course_id) target
  left join public.course_progression_settings setting
    on setting.course_id = target.course_id;
  return v_mode = 'open' or v_chapter.sort_order = 1 or exists (
    select 1 from public.student_chapter_unlocks unlock
    where unlock.user_id = p_actor_id and unlock.chapter_id = p_chapter_id
  );
end;
$$;

create function public.svc_content_media_delivery(
  p_actor_user_id uuid, p_asset_ids uuid[]
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
begin
  if p_actor_user_id is null or p_asset_ids is null
     or cardinality(p_asset_ids) not between 1 and 6
     or cardinality(p_asset_ids) is distinct from
        cardinality(array(select distinct unnest(p_asset_ids)))
     or exists (
       select 1 from unnest(p_asset_ids) requested(asset_id)
       where not exists (
         select 1
         from public.review_card_media media
         join public.review_cards card on card.id = media.review_card_id
           and card.version = media.card_version and card.status = 'published'
         join public.subtopics subtopic on subtopic.id = card.subtopic_id
           and subtopic.status = 'published'
         join public.sections section on section.id = subtopic.section_id
           and section.status = 'published'
         join public.chapters chapter on chapter.id = section.chapter_id
           and chapter.status = 'published'
         join public.courses course on course.id = chapter.course_id
           and course.status = 'published'
         where media.manifest_id = requested.asset_id
           and content_private.student_can_access_chapter_for(
             p_actor_user_id, chapter.id)
       )
     ) then
    return jsonb_build_object('outcome', 'denied',
      'code', 'CONTENT_MEDIA_NOT_FOUND');
  end if;
  return jsonb_build_object('outcome', 'ok', 'assets', (
    select jsonb_agg(jsonb_build_object(
      'asset_id', asset.id, 'width', asset.width, 'height', asset.height,
      'variants', (
        select jsonb_agg(jsonb_build_object(
          'kind', variant.kind, 'object_path', variant.object_path,
          'width', variant.width, 'height', variant.height,
          'mime_type', variant.mime_type
        ) order by case variant.kind when 'thumbnail' then 1
          when 'reading' then 2 else 3 end)
        from public.content_media_variants variant
        where variant.asset_id = asset.id
      )
    ) order by asset.id)
    from public.content_media_assets asset where asset.id = any(p_asset_ids)
  ));
end;
$$;

create function content_private.validate_media_manifest_refs(
  p_draft public.content_drafts
) returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, content_private
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_manifest_id uuid;
  v_asset_path text;
  v_role text;
begin
  if p_draft.entity_type <> 'review_card' then return v_issues; end if;
  if jsonb_typeof(coalesce(p_draft.payload -> 'media', '[]')) <> 'array' then
    return v_issues;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_draft.payload -> 'media') entry
    group by entry ->> 'sort_order' having count(*) > 1
  ) then
    v_issues := v_issues || jsonb_build_array(content_private.issue(
      'CONTENT_MEDIA_INVALID', 'media', '圖片排序不可重複。'));
  end if;
  for v_entry in select value from jsonb_array_elements(
    coalesce(p_draft.payload -> 'media', '[]')) loop
    v_manifest_id := content_private.json_uuid(v_entry, 'manifest_id');
    v_asset_path := nullif(btrim(coalesce(v_entry ->> 'asset_path', '')), '');
    v_role := coalesce(v_entry ->> 'semantic_role', 'standard');
    if (v_manifest_id is null) = (v_asset_path is null) then
      v_issues := v_issues || jsonb_build_array(content_private.issue(
        'CONTENT_MEDIA_INVALID', 'media',
        '每張圖片必須且只能指定 verified manifest 或既有媒體。'));
    elsif v_manifest_id is not null and not exists (
      select 1 from public.content_media_assets asset
      where asset.id = v_manifest_id and asset.semantic_role = v_role
    ) then
      v_issues := v_issues || jsonb_build_array(content_private.issue(
        'CONTENT_MEDIA_INTEGRITY_FAILED', 'media',
        '圖片尚未完成可信處理，不能發布。'));
    elsif v_asset_path is not null and (
      p_draft.entity_id is null or p_draft.base_version is null or not exists (
        select 1 from public.review_card_media media
        where media.review_card_id = p_draft.entity_id
          and media.card_version = p_draft.base_version
          and media.asset_path = v_asset_path and media.manifest_id is null
      )
    ) then
      v_issues := v_issues || jsonb_build_array(content_private.issue(
        'CONTENT_MEDIA_INTEGRITY_FAILED', 'media',
        '既有媒體引用與目前版本不一致。'));
    end if;
  end loop;
  return v_issues;
end;
$$;

alter function content_private.validate_draft(public.content_drafts)
rename to validate_draft_without_trusted_media;

create function content_private.validate_draft(p_draft public.content_drafts)
returns jsonb
language sql
stable
set search_path = pg_catalog, content_private
as $$
  select content_private.validate_draft_without_trusted_media(p_draft)
    || content_private.validate_media_manifest_refs(p_draft)
$$;

alter function content_private.current_entity(text, uuid)
rename to current_entity_without_trusted_media;

create function content_private.current_entity(
  p_entity_type text, p_entity_id uuid
) returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, content_private
as $$
declare
  v_result jsonb;
  v_version integer;
begin
  v_result := content_private.current_entity_without_trusted_media(
    p_entity_type, p_entity_id);
  if p_entity_type <> 'review_card' or v_result is null then return v_result; end if;
  v_version := (v_result ->> 'version')::integer;
  return jsonb_set(v_result, '{payload,media}', coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'manifest_id', media.manifest_id,
      'asset_path', case when media.manifest_id is null
        then media.asset_path else null end,
      'semantic_role', media.semantic_role,
      'alt_text', media.alt_text, 'sort_order', media.sort_order
    )) order by media.sort_order, media.id)
    from public.review_card_media media
    where media.review_card_id = p_entity_id and media.card_version = v_version
  ), '[]'::jsonb));
end;
$$;

alter function content_private.apply_content_version(
  text, uuid, text, jsonb, integer, public.content_status, uuid
) rename to apply_content_version_without_trusted_media;

create function content_private.apply_content_version(
  p_entity_type text, p_entity_id uuid, p_stable_code text,
  p_payload jsonb, p_version integer, p_status public.content_status,
  p_actor uuid
) returns uuid
language plpgsql
set search_path = pg_catalog, public, content_private
as $$
declare
  v_id uuid;
  v_media jsonb;
  v_manifest_id uuid;
begin
  v_id := content_private.apply_content_version_without_trusted_media(
    p_entity_type, p_entity_id, p_stable_code, p_payload, p_version,
    p_status, p_actor);
  if p_entity_type = 'review_card' then
    for v_media in select value from jsonb_array_elements(
      coalesce(p_payload -> 'media', '[]')) loop
      v_manifest_id := content_private.json_uuid(v_media, 'manifest_id');
      insert into public.review_card_media (
        review_card_id, card_version, asset_path, alt_text, sort_order,
        manifest_id, semantic_role
      ) values (
        v_id, p_version,
        case when v_manifest_id is not null
          then 'content-media:' || v_manifest_id::text
          else v_media ->> 'asset_path' end,
        btrim(v_media ->> 'alt_text'), (v_media ->> 'sort_order')::integer,
        v_manifest_id, case when v_manifest_id is not null
          then coalesce(v_media ->> 'semantic_role', 'standard') else null end
      );
    end loop;
  end if;
  return v_id;
end;
$$;

-- Replace the publication command only to remove the temporary PR 2 media
-- stop-gap. The command still revalidates the draft through the wrapped
-- validator and the wrapped apply function inserts immutable media rows.
create or replace function public.admin_publish_content_draft(
  p_draft_id uuid, p_expected_revision integer, p_reason text,
  p_request_id uuid, p_change_classification text default 'semantic'
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_draft public.content_drafts;
  v_request public.content_publication_requests;
  v_current jsonb;
  v_before jsonb;
  v_fields text[];
  v_impact text;
  v_entity_id uuid;
  v_next_version integer;
  v_version_id uuid;
  v_event_id uuid;
  v_hash bytea;
  v_receipt jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.publication_denial(v_auth, v_auth ->> 'code',
      'admin_publish_content_draft');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.publication_denial(v_auth, 'INSUFFICIENT_MFA',
      'admin_publish_content_draft');
  end if;
  if p_request_id is null
     or p_change_classification not in ('semantic', 'nonsemantic')
     or char_length(btrim(coalesce(p_reason, '')))
      not between 1 and 500 then
    return content_private.publication_denial(v_auth,
      'CONTENT_VALIDATION_FAILED', 'admin_publish_content_draft');
  end if;
  v_hash := extensions.digest(convert_to(jsonb_build_object(
    'draft_id', p_draft_id, 'expected_revision', p_expected_revision,
    'reason', btrim(p_reason),
    'change_classification', p_change_classification,
    'auth_session_id', v_auth ->> 'auth_session_id'
  )::text, 'UTF8'), 'sha256');
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor::text || ':' || p_request_id::text, 0));
  select request.* into v_request from public.content_publication_requests request
  where request.actor_user_id = v_actor and request.request_id = p_request_id;
  if v_request.request_id is not null then
    if v_request.auth_session_id is distinct from
         (v_auth ->> 'auth_session_id')::uuid
       or v_request.request_hash is distinct from v_hash then
      return content_private.publication_denial(v_auth,
        'IDEMPOTENCY_CONFLICT', 'admin_publish_content_draft');
    end if;
    return jsonb_set(v_request.result_receipt, '{replayed}', 'true');
  end if;
  select draft.* into v_draft from public.content_drafts draft
  where draft.id = p_draft_id for update;
  if v_draft.id is null or v_draft.revision is distinct from p_expected_revision
     or jsonb_array_length(content_private.validate_draft(v_draft)) > 0 then
    return content_private.publication_denial(v_auth,
      case when v_draft.id is null
        or v_draft.revision is distinct from p_expected_revision
        then 'CONTENT_DRAFT_CONFLICT' else 'CONTENT_VALIDATION_FAILED' end,
      'admin_publish_content_draft');
  end if;
  v_current := case when v_draft.entity_id is null then null
    else content_private.current_entity(v_draft.entity_type, v_draft.entity_id)
  end;
  if v_current is not null
     and (v_current ->> 'version')::integer is distinct from v_draft.base_version then
    return content_private.publication_denial(v_auth,
      'CONTENT_PUBLICATION_CONFLICT', 'admin_publish_content_draft');
  end if;
  if v_current is not null and not content_private.scope_matches(
      v_draft.entity_type, v_current, v_draft.payload) then
    return content_private.publication_denial(v_auth,
      'CONTENT_SCOPE_INVALID', 'admin_publish_content_draft');
  end if;
  if v_current is not null then
    perform content_private.ensure_content_baseline(
      v_draft.entity_type, v_draft.entity_id);
  end if;
  v_before := v_current -> 'payload';
  v_fields := content_private.changed_fields(v_before, v_draft.payload);
  if v_current is not null and cardinality(v_fields) = 0 then
    return content_private.publication_denial(v_auth,
      'CONTENT_VALIDATION_FAILED', 'admin_publish_content_draft');
  end if;
  v_impact := content_private.publication_impact(
    v_draft.entity_type, v_before, v_draft.payload,
    p_change_classification);
  v_next_version := coalesce((v_current ->> 'version')::integer, 0) + 1;
  v_entity_id := content_private.apply_content_version(
    v_draft.entity_type, v_draft.entity_id, v_draft.stable_code,
    v_draft.payload, v_next_version, 'published', v_actor);
  v_version_id := content_private.store_content_version(
    v_draft.entity_type, v_entity_id, v_draft.stable_code, v_next_version,
    v_draft.payload, 'published', (v_current ->> 'version')::integer,
    v_impact, btrim(p_reason), v_fields, v_actor,
    (v_auth ->> 'auth_session_id')::uuid, v_draft.id, p_request_id);
  insert into public.content_publication_events (
    content_type, content_id, version, event_type, actor_id, request_id,
    version_id, impact, reason, changed_fields, auth_session_id
  ) values (
    v_draft.entity_type, v_entity_id, v_next_version, 'publish', v_actor,
    p_request_id, v_version_id, v_impact, btrim(p_reason), v_fields,
    (v_auth ->> 'auth_session_id')::uuid
  ) returning id into v_event_id;
  update public.content_drafts set
    entity_id = v_entity_id, base_version = v_next_version,
    updated_at = clock_timestamp()
  where id = v_draft.id;
  v_receipt := content_private.publication_receipt(
    v_draft.entity_type, v_entity_id, v_next_version, v_event_id, v_impact,
    v_fields, p_request_id, false);
  insert into public.content_publication_requests (
    actor_user_id, auth_session_id, request_id, request_hash, result_receipt
  ) values (
    v_actor, (v_auth ->> 'auth_session_id')::uuid, p_request_id, v_hash,
    v_receipt);
  perform public.admin_internal_append_audit(
    'admin', (v_auth ->> 'principal_id')::uuid,
    (v_auth ->> 'session_id')::uuid,
    (v_auth ->> 'auth_session_id')::uuid,
    'admin_publish_content_draft', 'content_version', null, 'success',
    btrim(p_reason), (v_auth ->> 'mfa_age_seconds')::integer,
    jsonb_build_object('entity_type', v_draft.entity_type,
      'stable_code', v_draft.stable_code, 'version', v_next_version,
      'impact', v_impact,
      'change_classification', p_change_classification), p_request_id::text);
  return v_receipt;
end;
$$;

create or replace function public.get_accessible_chapter_review(p_chapter_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_payload jsonb;
begin
  perform public.assert_student_chapter_access(p_chapter_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', section.id, 'stable_code', section.stable_code,
    'title', section.title, 'sort_order', section.sort_order,
    'quiz_template_id', (
      select template.id from public.quiz_templates template
      where template.section_id = section.id and template.status = 'published'
      order by template.created_at, template.id limit 1),
    'subtopics', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', subtopic.id, 'stable_code', subtopic.stable_code,
        'title', subtopic.title, 'sort_order', subtopic.sort_order,
        'review_cards', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', card.id, 'group_label', card.group_label,
            'title', card.title, 'content', card.content,
            'version', card.version,
            'requires_recompletion', card.requires_recompletion,
            'sort_order', card.sort_order, 'review_card_media', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'asset_path', case when media.manifest_id is null
                  then media.asset_path
                  else 'content-media:' || media.manifest_id::text end,
                'alt_text', media.alt_text, 'sort_order', media.sort_order
              ) order by media.sort_order, media.id), '[]'::jsonb)
              from public.review_card_media media
              where media.review_card_id = card.id
                and media.card_version = card.version
            )
          ) order by card.sort_order, card.id), '[]'::jsonb)
          from public.review_cards card
          where card.subtopic_id = subtopic.id and card.status = 'published'
        )
      ) order by subtopic.sort_order, subtopic.id), '[]'::jsonb)
      from public.subtopics subtopic
      where subtopic.section_id = section.id
        and subtopic.status = 'published'
        and exists (select 1 from public.review_cards card
          where card.subtopic_id = subtopic.id and card.status = 'published')
    )
  ) order by section.sort_order, section.id), '[]'::jsonb) into v_payload
  from public.sections section
  join public.chapters chapter on chapter.id = section.chapter_id
  join public.courses course on course.id = chapter.course_id
  where section.chapter_id = p_chapter_id and section.status = 'published'
    and chapter.status = 'published' and course.status = 'published'
    and exists (select 1 from public.subtopics subtopic
      join public.review_cards card on card.subtopic_id = subtopic.id
      where subtopic.section_id = section.id and subtopic.status = 'published'
        and card.status = 'published');
  return v_payload;
end;
$$;

revoke execute on function content_private.block_immutable_media()
  from public, anon, authenticated;
revoke execute on function content_private.media_denial(jsonb, text, text)
  from public, anon, authenticated;
revoke execute on function content_private.student_can_access_chapter_for(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function content_private.validate_media_manifest_refs(
  public.content_drafts) from public, anon, authenticated;
revoke execute on function content_private.validate_draft_without_trusted_media(
  public.content_drafts) from public, anon, authenticated;
revoke execute on function content_private.validate_draft(public.content_drafts)
  from public, anon, authenticated;
revoke execute on function content_private.current_entity_without_trusted_media(
  text, uuid) from public, anon, authenticated;
revoke execute on function content_private.current_entity(text, uuid)
  from public, anon, authenticated;
revoke execute on function content_private.apply_content_version_without_trusted_media(
  text, uuid, text, jsonb, integer, public.content_status, uuid)
  from public, anon, authenticated;
revoke execute on function content_private.apply_content_version(
  text, uuid, text, jsonb, integer, public.content_status, uuid)
  from public, anon, authenticated;

revoke all on function public.admin_begin_content_media_upload(
  uuid, text, text, integer, text) from public, anon;
grant execute on function public.admin_begin_content_media_upload(
  uuid, text, text, integer, text) to authenticated;
revoke all on function public.admin_claim_content_media_upload(uuid, uuid)
  from public, anon;
grant execute on function public.admin_claim_content_media_upload(uuid, uuid)
  to authenticated;
revoke all on function public.admin_abort_content_media_upload(uuid, uuid)
  from public, anon;
grant execute on function public.admin_abort_content_media_upload(uuid, uuid)
  to authenticated;
revoke all on function public.svc_complete_content_media_upload(
  uuid, uuid, uuid, text, text, text, integer, integer, boolean, text,
  text, jsonb) from public, anon, authenticated;
grant execute on function public.svc_complete_content_media_upload(
  uuid, uuid, uuid, text, text, text, integer, integer, boolean, text,
  text, jsonb) to service_role;
revoke all on function public.svc_fail_content_media_upload(
  uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.svc_fail_content_media_upload(
  uuid, uuid, uuid, text) to service_role;
revoke all on function public.svc_content_media_delivery(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.svc_content_media_delivery(uuid, uuid[])
  to service_role;
