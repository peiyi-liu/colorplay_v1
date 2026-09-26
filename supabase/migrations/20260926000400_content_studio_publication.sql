-- Phase 2 Content Studio publication boundary. Drafts remain editable working
-- copies; only these trusted commands can mutate current published content.
-- Immutable versions/events preserve history while current progress is derived
-- from the latest published version and its server-classified impact.
-- This migration intentionally exceeds 500 lines because schema hardening,
-- command cutover, immutable receipts, and progress semantics must switch in
-- one transaction; a partial boundary would leave a direct-write bypass.

alter table public.content_versions
  alter column content_type type text using content_type::text,
  alter column created_by drop not null;
alter table public.content_publication_events
  alter column content_type type text using content_type::text,
  alter column event_type type text using event_type::text;

alter table public.content_versions
  add constraint content_versions_type_check check (content_type in (
    'course', 'chapter', 'section', 'subtopic', 'review_card',
    'assessment_bank', 'question'
  )),
  add column stable_code text,
  add column previous_version integer check (previous_version > 0),
  add column impact text not null default 'compatible' check (impact in (
    'compatible', 'requires_recompletion', 'requires_requalification'
  )),
  add column reason text not null default 'legacy baseline'
    check (char_length(btrim(reason)) between 1 and 500),
  add column changed_fields text[] not null default '{}'::text[],
  add column payload_schema_version integer not null default 1
    check (payload_schema_version > 0),
  add column source_draft_id uuid,
  add column auth_session_id uuid,
  add column request_id uuid;

alter table public.content_publication_events
  add constraint content_publication_events_type_check check (content_type in (
    'course', 'chapter', 'section', 'subtopic', 'review_card',
    'assessment_bank', 'question'
  )),
  add constraint content_publication_events_event_check check (event_type in (
    'publish', 'archive', 'rollback'
  )),
  add column version_id uuid references public.content_versions(id),
  add column impact text not null default 'compatible' check (impact in (
    'compatible', 'requires_recompletion', 'requires_requalification'
  )),
  add column reason text not null default 'legacy publication'
    check (char_length(btrim(reason)) between 1 and 500),
  add column changed_fields text[] not null default '{}'::text[],
  add column auth_session_id uuid;

update public.content_versions as version
set stable_code = coalesce(case version.content_type
    when 'question' then (select stable_code from public.questions where id = version.content_id)
    when 'review_card' then (select stable_code from public.review_cards where id = version.content_id)
  end, 'legacy-' || version.content_id::text),
  impact = case
    when version.content_type = 'review_card'
      and coalesce((version.frozen_payload ->> 'requires_recompletion')::boolean, false)
      then 'requires_recompletion'
    when version.content_type = 'question' then 'requires_requalification'
    else 'compatible'
  end,
  reason = 'legacy version history';

alter table public.content_versions
  alter column stable_code set not null;

create table public.content_publication_requests (
  actor_user_id uuid not null,
  auth_session_id uuid not null,
  request_id uuid not null,
  request_hash bytea not null,
  result_receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_user_id, request_id)
);

alter table public.content_publication_requests enable row level security;
revoke all on public.content_publication_requests from public, anon, authenticated;

create function content_private.block_immutable_content_history()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000',
    message = 'content publication history is append-only';
end;
$$;

create trigger content_versions_append_only
before update or delete on public.content_versions
for each row execute function content_private.block_immutable_content_history();

create trigger content_publication_events_append_only
before update or delete on public.content_publication_events
for each row execute function content_private.block_immutable_content_history();

drop policy if exists content_versions_teacher_select
  on public.content_versions;
drop policy if exists content_publication_events_teacher_select
  on public.content_publication_events;
revoke select on public.content_versions from authenticated;
revoke select on public.content_publication_events from authenticated;

create function content_private.changed_fields(p_before jsonb, p_after jsonb)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(array_agg(key order by key), '{}'::text[])
  from (
    select key from jsonb_object_keys(coalesce(p_before, '{}'::jsonb)) as key
    union
    select key from jsonb_object_keys(coalesce(p_after, '{}'::jsonb)) as key
  ) as keys
  where p_before -> keys.key is distinct from p_after -> keys.key
$$;

create function content_private.publication_impact(
  p_entity_type text,
  p_before jsonb,
  p_after jsonb
) returns text
language plpgsql
immutable
set search_path = pg_catalog, content_private
as $$
declare
  v_fields text[] := content_private.changed_fields(p_before, p_after);
begin
  if p_before is null then
    return case
      when p_entity_type = 'review_card' then 'requires_recompletion'
      when p_entity_type in ('question', 'assessment_bank')
        then 'requires_requalification'
      else 'compatible'
    end;
  end if;

  if p_entity_type = 'review_card' then
    if v_fields <@ array['sort_order']::text[] then
      return 'compatible';
    end if;
    return 'requires_recompletion';
  elsif p_entity_type = 'question' then
    if v_fields <@ array['sort_order']::text[] then
      return 'compatible';
    end if;
    return 'requires_requalification';
  elsif p_entity_type = 'assessment_bank' then
    if v_fields <@ array['sort_order']::text[] then
      return 'compatible';
    end if;
    return 'requires_requalification';
  elsif p_entity_type in ('course', 'chapter', 'section', 'subtopic') then
    if v_fields <@ array['sort_order']::text[] then
      return 'compatible';
    end if;
  end if;
  return 'requires_requalification';
end;
$$;

create function content_private.version_hash(p_payload jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, extensions
as $$
  select encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex')
$$;

-- Baseline every current published entity without creating an event. This
-- records the deployment state but deliberately does not alter learner facts.
insert into public.content_versions (
  content_type, content_id, stable_code, version, frozen_payload, payload_hash,
  status, impact, reason, changed_fields, payload_schema_version, created_by
)
select entity.entity_type, entity.entity_id, entity.stable_code, entity.version,
  entity.payload, content_private.version_hash(entity.payload), 'published',
  'compatible', 'accepted current baseline', '{}'::text[], 2, null
from (
  select 'course'::text entity_type, item.id entity_id, item.stable_code,
    item.version, current.payload
  from public.courses item
  cross join lateral content_private.current_entity('course', item.id) current_entity
  cross join lateral (select current_entity -> 'payload' as payload) current
  where item.status = 'published'
  union all
  select 'chapter', item.id, item.stable_code, item.version,
    content_private.current_entity('chapter', item.id) -> 'payload'
  from public.chapters item where item.status = 'published'
  union all
  select 'section', item.id, item.stable_code, item.version,
    content_private.current_entity('section', item.id) -> 'payload'
  from public.sections item where item.status = 'published'
  union all
  select 'subtopic', item.id, item.stable_code, item.version,
    content_private.current_entity('subtopic', item.id) -> 'payload'
  from public.subtopics item where item.status = 'published'
  union all
  select 'review_card', item.id, item.stable_code, item.version,
    content_private.current_entity('review_card', item.id) -> 'payload'
  from public.review_cards item where item.status = 'published'
  union all
  select 'assessment_bank', item.id, item.stable_code, item.version,
    content_private.current_entity('assessment_bank', item.id) -> 'payload'
  from public.assessment_banks item where item.status = 'published'
  union all
  select 'question', item.id, item.stable_code, item.version,
    content_private.current_entity('question', item.id) -> 'payload'
  from public.questions item where item.status = 'published'
) as entity
on conflict on constraint content_versions_identity_unique do nothing;

create function content_private.ensure_content_baseline(
  p_entity_type text,
  p_entity_id uuid
) returns void
language plpgsql
set search_path = pg_catalog, public, content_private
as $$
declare
  v_current jsonb := content_private.current_entity(p_entity_type, p_entity_id);
begin
  if v_current is null or exists (
    select 1 from public.content_versions version
    where version.content_type = p_entity_type
      and version.content_id = p_entity_id
      and version.version = (v_current ->> 'version')::integer
  ) then
    return;
  end if;
  insert into public.content_versions (
    content_type, content_id, stable_code, version, frozen_payload,
    payload_hash, status, impact, reason, changed_fields,
    payload_schema_version, created_by
  ) values (
    p_entity_type, p_entity_id, v_current ->> 'stable_code',
    (v_current ->> 'version')::integer, v_current -> 'payload',
    content_private.version_hash(v_current -> 'payload'),
    (v_current ->> 'status')::public.content_status, 'compatible',
    'accepted current baseline', '{}'::text[], 2, null
  );
end;
$$;

create function content_private.scope_matches(
  p_entity_type text,
  p_current jsonb,
  p_payload jsonb
) returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_entity_type
    when 'chapter' then p_current #>> '{payload,course_id}'
      is not distinct from p_payload ->> 'course_id'
    when 'section' then p_current #>> '{payload,chapter_id}'
      is not distinct from p_payload ->> 'chapter_id'
    when 'subtopic' then p_current #>> '{payload,section_id}'
      is not distinct from p_payload ->> 'section_id'
    when 'review_card' then p_current #>> '{payload,subtopic_id}'
      is not distinct from p_payload ->> 'subtopic_id'
    when 'assessment_bank' then
      p_current #>> '{payload,kind}' is not distinct from p_payload ->> 'kind'
      and p_current #>> '{payload,chapter_id}'
        is not distinct from p_payload ->> 'chapter_id'
      and p_current #>> '{payload,section_id}'
        is not distinct from p_payload ->> 'section_id'
    when 'question' then p_current #>> '{payload,bank_id}'
      is not distinct from p_payload ->> 'bank_id'
    else true
  end
$$;

create function content_private.apply_content_version(
  p_entity_type text,
  p_entity_id uuid,
  p_stable_code text,
  p_payload jsonb,
  p_version integer,
  p_status public.content_status,
  p_actor uuid
) returns uuid
language plpgsql
set search_path = pg_catalog, public, content_private
as $$
declare
  v_id uuid := coalesce(p_entity_id, gen_random_uuid());
  v_bank public.assessment_banks;
  v_subtopic_id uuid;
  v_existing_status public.content_status;
  v_option jsonb;
  v_existing_keys text[];
  v_incoming_keys text[];
begin
  case p_entity_type
    when 'course' then
      insert into public.courses (
        id, stable_code, title, description, status, sort_order, version,
        created_by
      ) values (
        v_id, p_stable_code, btrim(p_payload ->> 'title'),
        coalesce(p_payload ->> 'description', ''), p_status,
        coalesce((p_payload ->> 'sort_order')::integer, 0), p_version, p_actor
      ) on conflict (id) do update set
        title = excluded.title, description = excluded.description,
        status = excluded.status, sort_order = excluded.sort_order,
        version = excluded.version, updated_at = clock_timestamp();
    when 'chapter' then
      insert into public.chapters (
        id, course_id, stable_code, title, description, status, sort_order,
        version, created_by
      ) values (
        v_id, content_private.json_uuid(p_payload, 'course_id'), p_stable_code,
        btrim(p_payload ->> 'title'), coalesce(p_payload ->> 'description', ''),
        p_status, coalesce((p_payload ->> 'sort_order')::integer, 0),
        p_version, p_actor
      ) on conflict (id) do update set
        title = excluded.title, description = excluded.description,
        status = excluded.status, sort_order = excluded.sort_order,
        version = excluded.version, updated_at = clock_timestamp();
    when 'section' then
      insert into public.sections (
        id, chapter_id, stable_code, title, description, status, sort_order,
        version, created_by
      ) values (
        v_id, content_private.json_uuid(p_payload, 'chapter_id'), p_stable_code,
        btrim(p_payload ->> 'title'), coalesce(p_payload ->> 'description', ''),
        p_status, coalesce((p_payload ->> 'sort_order')::integer, 0),
        p_version, p_actor
      ) on conflict (id) do update set
        title = excluded.title, description = excluded.description,
        status = excluded.status, sort_order = excluded.sort_order,
        version = excluded.version, updated_at = clock_timestamp();
    when 'subtopic' then
      insert into public.subtopics (
        id, section_id, stable_code, title, description, status, sort_order,
        version, created_by
      ) values (
        v_id, content_private.json_uuid(p_payload, 'section_id'), p_stable_code,
        btrim(p_payload ->> 'title'), coalesce(p_payload ->> 'description', ''),
        p_status, coalesce((p_payload ->> 'sort_order')::integer, 0),
        p_version, p_actor
      ) on conflict (id) do update set
        title = excluded.title, description = excluded.description,
        status = excluded.status, sort_order = excluded.sort_order,
        version = excluded.version, updated_at = clock_timestamp();
    when 'review_card' then
      insert into public.review_cards (
        id, subtopic_id, stable_code, group_label, title, content, version,
        status, requires_recompletion, sort_order, created_by
      ) values (
        v_id, content_private.json_uuid(p_payload, 'subtopic_id'), p_stable_code,
        coalesce(p_payload ->> 'group_label', ''), btrim(p_payload ->> 'title'),
        btrim(p_payload ->> 'content'), p_version, p_status,
        coalesce((p_payload ->> 'requires_recompletion')::boolean, false),
        coalesce((p_payload ->> 'sort_order')::integer, 0), p_actor
      ) on conflict (id) do update set
        group_label = excluded.group_label, title = excluded.title,
        content = excluded.content, version = excluded.version,
        status = excluded.status,
        requires_recompletion = excluded.requires_recompletion,
        sort_order = excluded.sort_order, updated_at = clock_timestamp();
    when 'assessment_bank' then
      insert into public.assessment_banks (
        id, stable_code, kind, chapter_id, section_id, title, description,
        selection_settings, status, version, created_by, sort_order
      ) values (
        v_id, p_stable_code, p_payload ->> 'kind',
        content_private.json_uuid(p_payload, 'chapter_id'),
        content_private.json_uuid(p_payload, 'section_id'),
        btrim(p_payload ->> 'title'), coalesce(p_payload ->> 'description', ''),
        coalesce(p_payload -> 'selection_settings', '{}'::jsonb), p_status,
        p_version, p_actor, coalesce((p_payload ->> 'sort_order')::integer, 0)
      ) on conflict (id) do update set
        title = excluded.title, description = excluded.description,
        selection_settings = excluded.selection_settings,
        status = excluded.status, version = excluded.version,
        sort_order = excluded.sort_order, updated_at = clock_timestamp();
    when 'question' then
      select bank.* into v_bank from public.assessment_banks bank
      where bank.id = content_private.json_uuid(p_payload, 'bank_id');
      if v_bank.id is null then
        raise exception using errcode = '23514', message = 'question bank not found';
      end if;
      if v_bank.section_id is not null then
        select subtopic.id into v_subtopic_id
        from public.subtopics subtopic
        where subtopic.section_id = v_bank.section_id
        order by subtopic.sort_order, subtopic.id limit 1;
      else
        select subtopic.id into v_subtopic_id
        from public.subtopics subtopic
        join public.sections section on section.id = subtopic.section_id
        where section.chapter_id = v_bank.chapter_id
        order by section.sort_order, subtopic.sort_order, subtopic.id limit 1;
      end if;
      select status into v_existing_status from public.questions where id = v_id;
      insert into public.questions (
        id, subtopic_id, stable_code, question_type, prompt, explanation,
        version, status, sort_order, bank_kind, bank_id, duration_seconds,
        created_by
      ) values (
        v_id, v_subtopic_id, p_stable_code,
        coalesce((p_payload ->> 'question_type')::public.question_type,
          'single_choice'),
        btrim(p_payload ->> 'prompt'), btrim(p_payload ->> 'explanation'),
        p_version, case when p_entity_id is null then 'draft' else p_status end,
        coalesce((p_payload ->> 'sort_order')::integer, 0),
        case v_bank.kind when 'QB' then 'section' when 'CR' then 'chapter'
          else 'live' end,
        v_bank.id, coalesce((p_payload ->> 'duration_seconds')::integer, 20),
        p_actor
      ) on conflict (id) do update set
        prompt = excluded.prompt, explanation = excluded.explanation,
        version = excluded.version, status = excluded.status,
        sort_order = excluded.sort_order,
        duration_seconds = excluded.duration_seconds,
        updated_at = clock_timestamp();

      select array_agg(option_key order by option_key) into v_existing_keys
      from public.question_options where question_id = v_id;
      select array_agg(option ->> 'key' order by option ->> 'key')
      into v_incoming_keys from jsonb_array_elements(p_payload -> 'options') option;
      if v_existing_keys is not null and v_existing_keys is distinct from v_incoming_keys then
        raise exception using errcode = '23514',
          message = 'published question option keys are immutable';
      end if;
      for v_option in select value from jsonb_array_elements(p_payload -> 'options') loop
        insert into public.question_options (
          question_id, option_key, option_text, is_correct, sort_order
        ) values (
          v_id, v_option ->> 'key', btrim(v_option ->> 'text'),
          (v_option ->> 'is_correct')::boolean,
          coalesce((v_option ->> 'sort_order')::integer,
            ascii(v_option ->> 'key') - ascii('A') + 1)
        ) on conflict (question_id, option_key) do update set
          option_text = excluded.option_text,
          is_correct = excluded.is_correct,
          sort_order = excluded.sort_order;
      end loop;
      update public.questions set status = p_status where id = v_id;
    else
      raise exception using errcode = '22023', message = 'unsupported content type';
  end case;
  return v_id;
end;
$$;

create function content_private.store_content_version(
  p_entity_type text, p_entity_id uuid, p_stable_code text,
  p_version integer, p_payload jsonb, p_status public.content_status,
  p_previous_version integer, p_impact text, p_reason text,
  p_changed_fields text[], p_actor uuid, p_auth_session_id uuid,
  p_draft_id uuid, p_request_id uuid
) returns uuid
language plpgsql
set search_path = pg_catalog, public, content_private
as $$
declare
  v_id uuid;
begin
  insert into public.content_versions (
    content_type, content_id, stable_code, version, frozen_payload,
    payload_hash, status, created_by, previous_version, impact, reason,
    changed_fields, payload_schema_version, source_draft_id, auth_session_id,
    request_id
  ) values (
    p_entity_type, p_entity_id, p_stable_code, p_version, p_payload,
    content_private.version_hash(p_payload), p_status, p_actor,
    p_previous_version, p_impact, p_reason, p_changed_fields, 2,
    p_draft_id, p_auth_session_id, p_request_id
  ) returning id into v_id;
  return v_id;
end;
$$;

create function content_private.publication_receipt(
  p_entity_type text, p_entity_id uuid, p_version integer,
  p_event_id uuid, p_impact text, p_changed_fields text[],
  p_request_id uuid, p_replayed boolean
) returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'outcome', 'ok', 'request_id', p_request_id, 'replayed', p_replayed,
    'entity_type', p_entity_type, 'entity_id', p_entity_id,
    'version', p_version, 'event_id', p_event_id, 'impact', p_impact,
    'changed_fields', to_jsonb(p_changed_fields)
  )
$$;

create function content_private.publication_denial(
  p_auth jsonb, p_code text, p_action text
) returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select public.admin_internal_deny(
    'content/publication', p_code, p_action, 'content_version',
    case when p_auth ->> 'principal_id' is null then 'unknown'
      else 'admin' end::public.admin_actor_type,
    (p_auth ->> 'principal_id')::uuid,
    (p_auth ->> 'session_id')::uuid,
    (p_auth ->> 'auth_session_id')::uuid,
    null, null, (p_auth ->> 'mfa_age_seconds')::integer
  )
$$;

create function public.admin_publish_content_draft(
  p_draft_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_request_id uuid
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
  if p_request_id is null or char_length(btrim(coalesce(p_reason, '')))
      not between 1 and 500 then
    return content_private.publication_denial(v_auth,
      'CONTENT_VALIDATION_FAILED', 'admin_publish_content_draft');
  end if;

  v_hash := extensions.digest(convert_to(jsonb_build_object(
    'draft_id', p_draft_id, 'expected_revision', p_expected_revision,
    'reason', btrim(p_reason),
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
  if v_draft.entity_type = 'review_card'
     and jsonb_array_length(coalesce(v_draft.payload -> 'media', '[]'::jsonb)) > 0
  then
    return content_private.publication_denial(v_auth,
      'CONTENT_VALIDATION_FAILED', 'admin_publish_content_draft');
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
    v_draft.entity_type, v_before, v_draft.payload);
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
      'impact', v_impact), p_request_id::text);
  return v_receipt;
end;
$$;

create function content_private.current_version_number(
  p_entity_type text, p_entity_id uuid
) returns integer
language sql
stable
set search_path = pg_catalog, public, content_private
as $$
  select (content_private.current_entity(p_entity_type, p_entity_id)
    ->> 'version')::integer
$$;

create function public.admin_archive_content(
  p_entity_id uuid,
  p_entity_type text,
  p_expected_version integer,
  p_reason text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_request public.content_publication_requests;
  v_current jsonb;
  v_payload jsonb;
  v_version integer;
  v_impact text;
  v_version_id uuid;
  v_event_id uuid;
  v_hash bytea;
  v_receipt jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.publication_denial(v_auth, v_auth ->> 'code',
      'admin_archive_content');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.publication_denial(v_auth, 'INSUFFICIENT_MFA',
      'admin_archive_content');
  end if;
  if p_request_id is null or p_entity_type not in (
      'course','chapter','section','subtopic','review_card','assessment_bank','question'
    ) or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    return content_private.publication_denial(v_auth,
      'CONTENT_VALIDATION_FAILED', 'admin_archive_content');
  end if;
  v_hash := extensions.digest(convert_to(jsonb_build_object(
    'entity_id', p_entity_id, 'entity_type', p_entity_type,
    'expected_version', p_expected_version, 'reason', btrim(p_reason),
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
        'IDEMPOTENCY_CONFLICT', 'admin_archive_content');
    end if;
    return jsonb_set(v_request.result_receipt, '{replayed}', 'true');
  end if;
  v_current := content_private.current_entity(p_entity_type, p_entity_id);
  if v_current is null or (v_current ->> 'version')::integer is distinct from p_expected_version
     or v_current ->> 'status' <> 'published' then
    return content_private.publication_denial(v_auth,
      'CONTENT_PUBLICATION_CONFLICT', 'admin_archive_content');
  end if;
  perform content_private.ensure_content_baseline(p_entity_type, p_entity_id);
  v_payload := v_current -> 'payload';
  v_version := p_expected_version + 1;
  v_impact := case when p_entity_type = 'review_card'
    then 'requires_recompletion' when p_entity_type in ('question','assessment_bank')
    then 'requires_requalification' else 'compatible' end;
  perform content_private.apply_content_version(
    p_entity_type, p_entity_id, v_current ->> 'stable_code', v_payload,
    v_version, 'archived', v_actor);
  v_version_id := content_private.store_content_version(
    p_entity_type, p_entity_id, v_current ->> 'stable_code', v_version,
    v_payload, 'archived', p_expected_version, v_impact, btrim(p_reason),
    array['status'], v_actor, (v_auth ->> 'auth_session_id')::uuid,
    null, p_request_id);
  insert into public.content_publication_events (
    content_type, content_id, version, event_type, actor_id, request_id,
    version_id, impact, reason, changed_fields, auth_session_id
  ) values (
    p_entity_type, p_entity_id, v_version, 'archive', v_actor, p_request_id,
    v_version_id, v_impact, btrim(p_reason), array['status'],
    (v_auth ->> 'auth_session_id')::uuid
  ) returning id into v_event_id;
  v_receipt := content_private.publication_receipt(
    p_entity_type, p_entity_id, v_version, v_event_id, v_impact,
    array['status'], p_request_id, false);
  insert into public.content_publication_requests values (
    v_actor, (v_auth ->> 'auth_session_id')::uuid, p_request_id, v_hash,
    v_receipt, clock_timestamp());
  perform public.admin_internal_append_audit(
    'admin', (v_auth ->> 'principal_id')::uuid,
    (v_auth ->> 'session_id')::uuid,
    (v_auth ->> 'auth_session_id')::uuid,
    'admin_archive_content', 'content_version', null, 'success',
    btrim(p_reason), (v_auth ->> 'mfa_age_seconds')::integer,
    jsonb_build_object('entity_type', p_entity_type,
      'entity_id', p_entity_id, 'version', v_version, 'impact', v_impact),
    p_request_id::text);
  return v_receipt;
end;
$$;

create function public.admin_rollback_content(
  p_entity_id uuid,
  p_entity_type text,
  p_expected_version integer,
  p_target_version integer,
  p_reason text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, content_private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb := public.admin_internal_authorize();
  v_request public.content_publication_requests;
  v_current jsonb;
  v_target public.content_versions;
  v_version integer;
  v_fields text[];
  v_impact text;
  v_version_id uuid;
  v_event_id uuid;
  v_hash bytea;
  v_receipt jsonb;
begin
  perform set_config('statement_timeout', '5000', true);
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.publication_denial(v_auth, v_auth ->> 'code',
      'admin_rollback_content');
  end if;
  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return content_private.publication_denial(v_auth, 'INSUFFICIENT_MFA',
      'admin_rollback_content');
  end if;
  if p_request_id is null or p_target_version < 1
     or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then
    return content_private.publication_denial(v_auth,
      'CONTENT_VALIDATION_FAILED', 'admin_rollback_content');
  end if;
  v_hash := extensions.digest(convert_to(jsonb_build_object(
    'entity_id', p_entity_id, 'entity_type', p_entity_type,
    'expected_version', p_expected_version, 'target_version', p_target_version,
    'reason', btrim(p_reason),
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
        'IDEMPOTENCY_CONFLICT', 'admin_rollback_content');
    end if;
    return jsonb_set(v_request.result_receipt, '{replayed}', 'true');
  end if;
  v_current := content_private.current_entity(p_entity_type, p_entity_id);
  if v_current is not null then
    perform content_private.ensure_content_baseline(p_entity_type, p_entity_id);
  end if;
  select version.* into v_target from public.content_versions version
  where version.content_type = p_entity_type and version.content_id = p_entity_id
    and version.version = p_target_version and version.payload_schema_version = 2;
  if v_current is null or v_target.id is null
     or (v_current ->> 'version')::integer is distinct from p_expected_version then
    return content_private.publication_denial(v_auth,
      'CONTENT_PUBLICATION_CONFLICT', 'admin_rollback_content');
  end if;
  v_fields := content_private.changed_fields(
    v_current -> 'payload', v_target.frozen_payload);
  v_impact := content_private.publication_impact(
    p_entity_type, v_current -> 'payload', v_target.frozen_payload);
  v_version := p_expected_version + 1;
  perform content_private.apply_content_version(
    p_entity_type, p_entity_id, v_current ->> 'stable_code',
    v_target.frozen_payload, v_version, 'published', v_actor);
  v_version_id := content_private.store_content_version(
    p_entity_type, p_entity_id, v_current ->> 'stable_code', v_version,
    v_target.frozen_payload, 'published', p_expected_version, v_impact,
    btrim(p_reason), v_fields, v_actor,
    (v_auth ->> 'auth_session_id')::uuid, null, p_request_id);
  insert into public.content_publication_events (
    content_type, content_id, version, event_type, actor_id, request_id,
    version_id, impact, reason, changed_fields, auth_session_id
  ) values (
    p_entity_type, p_entity_id, v_version, 'rollback', v_actor, p_request_id,
    v_version_id, v_impact, btrim(p_reason), v_fields,
    (v_auth ->> 'auth_session_id')::uuid
  ) returning id into v_event_id;
  v_receipt := content_private.publication_receipt(
    p_entity_type, p_entity_id, v_version, v_event_id, v_impact,
    v_fields, p_request_id, false);
  insert into public.content_publication_requests values (
    v_actor, (v_auth ->> 'auth_session_id')::uuid, p_request_id, v_hash,
    v_receipt, clock_timestamp());
  perform public.admin_internal_append_audit(
    'admin', (v_auth ->> 'principal_id')::uuid,
    (v_auth ->> 'session_id')::uuid,
    (v_auth ->> 'auth_session_id')::uuid,
    'admin_rollback_content', 'content_version', null, 'success',
    btrim(p_reason), (v_auth ->> 'mfa_age_seconds')::integer,
    jsonb_build_object('entity_type', p_entity_type,
      'entity_id', p_entity_id, 'version', v_version, 'impact', v_impact),
    p_request_id::text);
  return v_receipt;
end;
$$;

create function public.admin_list_content_history(
  p_entity_id uuid,
  p_entity_type text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_auth jsonb := public.admin_internal_authorize();
  v_request_id uuid := gen_random_uuid();
  v_entries jsonb;
begin
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return content_private.publication_denial(v_auth, v_auth ->> 'code',
      'admin_list_content_history');
  end if;
  if content_private.current_entity(p_entity_type, p_entity_id) is null then
    return content_private.publication_denial(v_auth, 'CONTENT_SCOPE_INVALID',
      'admin_list_content_history');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', event.id, 'event_type', event.event_type,
    'version_id', event.version_id, 'version', event.version,
    'impact', event.impact, 'reason', event.reason,
    'changed_fields', event.changed_fields, 'created_at', event.created_at
  ) order by event.created_at desc, event.id desc), '[]'::jsonb)
  into v_entries
  from public.content_publication_events event
  where event.content_type = p_entity_type and event.content_id = p_entity_id;
  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_request_id,
    'entity_type', p_entity_type, 'entity_id', p_entity_id,
    'entries', v_entries);
end;
$$;

-- Current RC completion accepts a prior completion only when every intervening
-- version is explicitly compatible. Missing lineage therefore fails closed.
create or replace function public.review_completion_for(
  p_user_id uuid,
  p_chapter_id uuid default null
) returns table (
  subtopic_id uuid, chapter_id uuid, completed_count integer,
  total_count integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select st.id, ch.id,
    count(card.id) filter (where exists (
      select 1 from public.review_progress progress
      where progress.user_id = p_user_id
        and progress.review_card_id = card.id
        and (
          progress.card_version = card.version
          or (
            (
              (select count(*) from public.content_versions version
                where version.content_type = 'review_card'
                  and version.content_id = card.id
                  and version.version > progress.card_version
                  and version.version <= card.version)
                = card.version - progress.card_version
              and not exists (
                select 1 from public.content_versions version
                where version.content_type = 'review_card'
                  and version.content_id = card.id
                  and version.version > progress.card_version
                  and version.version <= card.version
                  and version.impact <> 'compatible'
              )
            )
          )
        )
    ))::integer,
    count(card.id)::integer
  from public.subtopics st
  join public.sections s on s.id = st.section_id
  join public.chapters ch on ch.id = s.chapter_id
  join public.courses c on c.id = ch.course_id
  left join public.review_cards card
    on card.subtopic_id = st.id and card.status = 'published'
  where st.status = 'published' and s.status = 'published'
    and ch.status = 'published' and c.status = 'published'
    and (p_chapter_id is null or ch.id = p_chapter_id)
    and p_user_id is not null
  group by st.id, ch.id, st.sort_order
  order by st.sort_order, st.id
$$;

-- Chapter qualification freezes the canonical CR bank identity/version and
-- its current pool. Any question, pool, or selection-setting publication
-- changes the fingerprint without rewriting an old attempt.
create or replace function public.chapter_challenge_fingerprint(
  p_template_id uuid
) returns text
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with state as (
    select template.id as template_id, template.chapter_id,
      template.section_id, template.question_count,
      template.status as template_status,
      bank.id as bank_id, bank.version as bank_version,
      bank.status as bank_status,
      bank.selection_settings,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'question_id', question.id,
          'version', question.version,
          'subtopic_id', question.subtopic_id,
          'section_id', section.id
        ) order by question.stable_code, question.id)
        from public.questions question
        join public.subtopics subtopic on subtopic.id = question.subtopic_id
        join public.sections section on section.id = subtopic.section_id
        where question.bank_id = bank.id
          and question.status = 'published'
          and subtopic.status = 'published'
          and section.status = 'published'
      ), '[]'::jsonb) as pool
    from public.quiz_templates template
    left join public.assessment_banks bank
      on bank.chapter_id = template.chapter_id and bank.kind = 'CR'
    where template.id = p_template_id and template.section_id is null
  )
  select encode(extensions.digest(convert_to(
    case
      when state.bank_id is not null
        and state.bank_version = 1
        and state.bank_status = 'published'
        and state.selection_settings = '{}'::jsonb
      then jsonb_build_object(
        'rules_version', '2026-09-progression-1',
        'template_id', state.template_id,
        'chapter_id', state.chapter_id,
        'section_id', state.section_id,
        'question_count', state.question_count,
        'status', state.template_status,
        'pool', state.pool
      )
      else jsonb_build_object(
        'rules_version', '2026-09-progression-2',
        'template_id', state.template_id,
        'chapter_id', state.chapter_id,
        'section_id', state.section_id,
        'question_count', state.question_count,
        'status', state.template_status,
        'bank', jsonb_build_object(
          'bank_id', state.bank_id,
          'version', state.bank_version,
          'status', state.bank_status,
          'selection_settings', state.selection_settings,
          'pool', state.pool
        )
      )
    end::text, 'UTF8'), 'sha256'), 'hex')
  from state
$$;

revoke execute on function content_private.block_immutable_content_history()
  from public, anon, authenticated;
revoke execute on function content_private.changed_fields(jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function content_private.publication_impact(text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function content_private.version_hash(jsonb)
  from public, anon, authenticated;
revoke execute on function content_private.ensure_content_baseline(text, uuid)
  from public, anon, authenticated;
revoke execute on function content_private.scope_matches(text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function content_private.apply_content_version(
  text, uuid, text, jsonb, integer, public.content_status, uuid
) from public, anon, authenticated;
revoke execute on function content_private.store_content_version(
  text, uuid, text, integer, jsonb, public.content_status, integer, text,
  text, text[], uuid, uuid, uuid, uuid
) from public, anon, authenticated;
revoke execute on function content_private.publication_receipt(
  text, uuid, integer, uuid, text, text[], uuid, boolean
) from public, anon, authenticated;
revoke execute on function content_private.publication_denial(jsonb, text, text)
  from public, anon, authenticated;
revoke execute on function content_private.current_version_number(text, uuid)
  from public, anon, authenticated;

revoke execute on function public.admin_publish_content_draft(
  uuid, integer, text, uuid
) from public, anon;
grant execute on function public.admin_publish_content_draft(
  uuid, integer, text, uuid
) to authenticated;
revoke execute on function public.admin_archive_content(
  uuid, text, integer, text, uuid
) from public, anon;
grant execute on function public.admin_archive_content(
  uuid, text, integer, text, uuid
) to authenticated;
revoke execute on function public.admin_rollback_content(
  uuid, text, integer, integer, text, uuid
) from public, anon;
grant execute on function public.admin_rollback_content(
  uuid, text, integer, integer, text, uuid
) to authenticated;
revoke execute on function public.admin_list_content_history(uuid, text)
  from public, anon;
grant execute on function public.admin_list_content_history(uuid, text)
  to authenticated;

-- Old teacher-only direct mutation commands are superseded. Keeping their
-- definitions preserves migration lineage, but browser roles can no longer run
-- them and bypass the Admin/MFA publication boundary.
revoke execute on function public.publish_question(uuid, jsonb, uuid)
  from authenticated;
revoke execute on function public.archive_question(uuid, uuid)
  from authenticated;
revoke execute on function public.publish_review_card(uuid, jsonb, uuid)
  from authenticated;
revoke execute on function public.archive_review_card(uuid, uuid)
  from authenticated;
revoke execute on function public.upsert_question_draft(jsonb, uuid)
  from authenticated;
revoke execute on function public.upsert_review_card_draft(jsonb, uuid)
  from authenticated;
revoke execute on function public.commit_content_import(
  jsonb, uuid, text, boolean
) from authenticated;
