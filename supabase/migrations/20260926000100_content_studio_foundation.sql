-- Phase 2 Content Studio foundation: explicit assessment banks and
-- server-persisted Admin drafts. Existing frozen quiz/live references remain
-- unchanged; current questions receive a deterministic canonical bank id.
-- This migration intentionally stays as one 500+ line atomic foundation: the
-- bank compatibility trigger must exist before repository seeds are loaded,
-- while the draft tables, private helpers, RPC grants, and revokes must become
-- visible together without an intermediate browser-write surface.

create schema if not exists content_private;
revoke all on schema content_private from public, anon, authenticated;

-- Rebaseline the legacy taxonomy onto the version/creator contract used by the
-- Content Studio. Existing seeded rows remain attributable as imported legacy
-- content (null creator); trusted publication commands fill future creators.
alter table public.courses
  add column version integer not null default 1 check (version > 0),
  add column created_by uuid references auth.users(id) on delete set null;
alter table public.chapters
  add column version integer not null default 1 check (version > 0),
  add column created_by uuid references auth.users(id) on delete set null;
alter table public.sections
  add column version integer not null default 1 check (version > 0),
  add column created_by uuid references auth.users(id) on delete set null;
alter table public.subtopics
  add column version integer not null default 1 check (version > 0),
  add column created_by uuid references auth.users(id) on delete set null;
alter table public.review_cards
  add column created_by uuid references auth.users(id) on delete set null;
alter table public.questions
  add column created_by uuid references auth.users(id) on delete set null;

alter table public.questions drop constraint questions_stable_code_check;
alter table public.questions add constraint questions_stable_code_check check (
  stable_code ~ '^[0-9]+-[0-9]+-[0-9]{2}$'
  or stable_code ~ '^(QB|CR|LT)[0-9]{4}$'
);

create table public.assessment_banks (
  id uuid primary key default gen_random_uuid(),
  stable_code text not null unique
    check (char_length(btrim(stable_code)) between 1 and 200),
  kind text not null check (kind in ('QB', 'CR', 'LT')),
  chapter_id uuid references public.chapters(id),
  section_id uuid references public.sections(id),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '',
  selection_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(selection_settings) = 'object'),
  status public.content_status not null default 'draft',
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_banks_scope_shape_check check (
    (kind in ('QB', 'LT') and section_id is not null and chapter_id is null)
    or (kind = 'CR' and chapter_id is not null and section_id is null)
  )
);

create unique index assessment_banks_section_kind_unique
  on public.assessment_banks(section_id, kind)
  where section_id is not null;
create unique index assessment_banks_chapter_kind_unique
  on public.assessment_banks(chapter_id, kind)
  where chapter_id is not null;
create index assessment_banks_status_sort_order_idx
  on public.assessment_banks(status, sort_order, stable_code);

insert into public.assessment_banks (
  stable_code, kind, section_id, title, status, sort_order
)
select
  'QB-' || section.stable_code,
  'QB',
  section.id,
  section.title || ' 小節題庫',
  case when bool_or(question.status = 'published')
    then 'published'::public.content_status
    else 'draft'::public.content_status
  end,
  section.sort_order
from public.questions as question
join public.subtopics as subtopic on subtopic.id = question.subtopic_id
join public.sections as section on section.id = subtopic.section_id
where question.bank_kind = 'section'
group by section.id, section.stable_code, section.title, section.sort_order;

insert into public.assessment_banks (
  stable_code, kind, section_id, title, status, sort_order
)
select
  'LT-' || section.stable_code,
  'LT',
  section.id,
  section.title || ' Live 題庫',
  case when bool_or(question.status = 'published')
    then 'published'::public.content_status
    else 'draft'::public.content_status
  end,
  section.sort_order
from public.questions as question
join public.subtopics as subtopic on subtopic.id = question.subtopic_id
join public.sections as section on section.id = subtopic.section_id
where question.bank_kind = 'live'
group by section.id, section.stable_code, section.title, section.sort_order;

insert into public.assessment_banks (
  stable_code, kind, chapter_id, title, status, sort_order
)
select
  'CR-' || chapter.stable_code,
  'CR',
  chapter.id,
  chapter.title || ' 章節總題庫',
  case when bool_or(question.status = 'published')
    then 'published'::public.content_status
    else 'draft'::public.content_status
  end,
  chapter.sort_order
from public.questions as question
join public.subtopics as subtopic on subtopic.id = question.subtopic_id
join public.sections as section on section.id = subtopic.section_id
join public.chapters as chapter on chapter.id = section.chapter_id
where question.bank_kind = 'chapter'
group by chapter.id, chapter.stable_code, chapter.title, chapter.sort_order;

alter table public.questions
  add column bank_id uuid references public.assessment_banks(id);

update public.questions as question
set bank_id = bank.id
from public.subtopics as subtopic
join public.sections as section on section.id = subtopic.section_id
join public.assessment_banks as bank
  on bank.section_id = section.id and bank.kind = 'QB'
where subtopic.id = question.subtopic_id
  and question.bank_kind = 'section';

update public.questions as question
set bank_id = bank.id
from public.subtopics as subtopic
join public.sections as section on section.id = subtopic.section_id
join public.assessment_banks as bank
  on bank.section_id = section.id and bank.kind = 'LT'
where subtopic.id = question.subtopic_id
  and question.bank_kind = 'live';

update public.questions as question
set bank_id = bank.id
from public.subtopics as subtopic
join public.sections as section on section.id = subtopic.section_id
join public.assessment_banks as bank
  on bank.chapter_id = section.chapter_id and bank.kind = 'CR'
where subtopic.id = question.subtopic_id
  and question.bank_kind = 'chapter';

alter table public.questions
  add constraint questions_canonical_bank_shape_check check (
    (bank_kind = 'legacy' and bank_id is null)
    or (bank_kind in ('section', 'chapter', 'live') and bank_id is not null)
  );

create index questions_bank_id_status_sort_order_idx
  on public.questions(bank_id, status, sort_order, stable_code);

create function content_private.validate_question_bank()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_bank public.assessment_banks;
  v_chapter_id uuid;
  v_section_id uuid;
  v_expected_kind text;
begin
  if new.bank_kind = 'legacy' then
    if new.bank_id is not null then
      raise exception using errcode = '23514',
        message = 'legacy questions cannot use a current assessment bank';
    end if;
    return new;
  end if;

  select section.id, section.chapter_id
  into v_section_id, v_chapter_id
  from public.subtopics as subtopic
  join public.sections as section on section.id = subtopic.section_id
  where subtopic.id = new.subtopic_id;

  v_expected_kind := case new.bank_kind
    when 'section' then 'QB'
    when 'chapter' then 'CR'
    when 'live' then 'LT'
    else null
  end;

  if v_expected_kind is null or v_section_id is null then
    raise exception using errcode = '23514',
      message = 'question assessment scope is invalid';
  end if;

  if new.bank_id is null then
    select bank.* into v_bank
    from public.assessment_banks as bank
    where bank.kind = v_expected_kind
      and (
        (v_expected_kind in ('QB', 'LT') and bank.section_id = v_section_id)
        or (v_expected_kind = 'CR' and bank.chapter_id = v_chapter_id)
      );
    if v_bank.id is null and v_expected_kind in ('QB', 'LT') then
      insert into public.assessment_banks (
        stable_code, kind, section_id, title, status, sort_order
      )
      select
        v_expected_kind || '-' || section.stable_code,
        v_expected_kind,
        section.id,
        section.title || case v_expected_kind
          when 'QB' then ' 小節題庫'
          else ' Live 題庫'
        end,
        case when new.status = 'published'
          then 'published'::public.content_status
          else 'draft'::public.content_status
        end,
        section.sort_order
      from public.sections as section
      where section.id = v_section_id
      on conflict (section_id, kind) where section_id is not null do nothing;
    elsif v_bank.id is null and v_expected_kind = 'CR' then
      insert into public.assessment_banks (
        stable_code, kind, chapter_id, title, status, sort_order
      )
      select
        'CR-' || chapter.stable_code,
        'CR',
        chapter.id,
        chapter.title || ' 章節總題庫',
        case when new.status = 'published'
          then 'published'::public.content_status
          else 'draft'::public.content_status
        end,
        chapter.sort_order
      from public.chapters as chapter
      where chapter.id = v_chapter_id
      on conflict (chapter_id, kind) where chapter_id is not null do nothing;
    end if;
    if v_bank.id is null then
      select bank.* into v_bank
      from public.assessment_banks as bank
      where bank.kind = v_expected_kind
        and (
          (v_expected_kind in ('QB', 'LT')
            and bank.section_id = v_section_id)
          or (v_expected_kind = 'CR' and bank.chapter_id = v_chapter_id)
        );
    end if;
    new.bank_id := v_bank.id;
  else
    select bank.* into v_bank
    from public.assessment_banks as bank
    where bank.id = new.bank_id;
  end if;

  if v_bank.id is null
     or v_bank.kind is distinct from v_expected_kind
     or (v_expected_kind in ('QB', 'LT')
       and v_bank.section_id is distinct from v_section_id)
     or (v_expected_kind = 'CR'
       and v_bank.chapter_id is distinct from v_chapter_id) then
    raise exception using errcode = '23514',
      message = 'question assessment bank does not match its scope';
  end if;

  if new.status = 'published' and v_bank.status <> 'published' then
    update public.assessment_banks
    set status = 'published', updated_at = clock_timestamp()
    where id = v_bank.id;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published'
     and (
       new.stable_code is distinct from old.stable_code
       or new.bank_id is distinct from old.bank_id
       or new.bank_kind is distinct from old.bank_kind
       or new.subtopic_id is distinct from old.subtopic_id
     ) then
    raise exception using errcode = '23514',
      message = 'published question identity and scope are immutable';
  end if;

  return new;
end;
$$;

create trigger questions_validate_canonical_bank
before insert or update of bank_id, bank_kind, stable_code, subtopic_id
on public.questions
for each row execute function content_private.validate_question_bank();

create function content_private.protect_published_bank()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'published'
     and (
       new.stable_code is distinct from old.stable_code
       or new.kind is distinct from old.kind
       or new.chapter_id is distinct from old.chapter_id
       or new.section_id is distinct from old.section_id
     ) then
    raise exception using errcode = '23514',
      message = 'published assessment bank identity and scope are immutable';
  end if;
  return new;
end;
$$;

create trigger assessment_banks_protect_published_identity
before update of stable_code, kind, chapter_id, section_id
on public.assessment_banks
for each row execute function content_private.protect_published_bank();

create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'course', 'chapter', 'section', 'subtopic', 'review_card',
    'assessment_bank', 'question'
  )),
  entity_id uuid,
  stable_code text not null
    check (char_length(btrim(stable_code)) between 1 and 200),
  base_version integer check (base_version > 0),
  revision integer not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  source text not null check (source in ('manual', 'import')),
  actor_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index content_drafts_entity_unique
  on public.content_drafts(entity_type, entity_id)
  where entity_id is not null;
create index content_drafts_scope_idx
  on public.content_drafts(entity_type, stable_code, updated_at desc);

create table public.content_draft_requests (
  actor_user_id uuid not null,
  auth_session_id uuid not null,
  request_id uuid not null,
  request_hash bytea not null,
  draft_id uuid not null references public.content_drafts(id),
  result_receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id)
);

alter table public.assessment_banks enable row level security;
alter table public.content_drafts enable row level security;
alter table public.content_draft_requests enable row level security;

revoke all on public.assessment_banks from anon, authenticated;
revoke all on public.content_drafts from anon, authenticated;
revoke all on public.content_draft_requests from anon, authenticated;

create function content_private.draft_receipt(
  p_draft public.content_drafts,
  p_request_id uuid,
  p_replayed boolean
) returns jsonb
language sql
stable
set search_path = pg_catalog, public, content_private
as $$
  select jsonb_build_object(
    'outcome', 'ok',
    'request_id', p_request_id::text,
    'replayed', p_replayed,
    'draft', jsonb_build_object(
      'draft_id', p_draft.id,
      'entity_type', p_draft.entity_type,
      'entity_id', p_draft.entity_id,
      'stable_code', p_draft.stable_code,
      'base_version', p_draft.base_version,
      'revision', p_draft.revision,
      'payload', p_draft.payload,
      'source', p_draft.source,
      'updated_at', p_draft.updated_at
    )
  );
$$;

create function public.admin_save_content_draft(
  p_draft_id uuid,
  p_entity_id uuid,
  p_entity_type text,
  p_stable_code text,
  p_expected_revision integer,
  p_payload jsonb,
  p_source text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_auth jsonb;
  v_draft public.content_drafts;
  v_existing_request public.content_draft_requests;
  v_request_hash bytea;
  v_receipt jsonb;
  v_base_version integer;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'content/drafts', v_auth ->> 'code', 'admin_save_content_draft',
      'content_draft',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null
    );
  end if;

  if (v_auth ->> 'mfa_age_seconds')::integer > 300 then
    return public.admin_internal_deny(
      'content/drafts', 'INSUFFICIENT_MFA', 'admin_save_content_draft',
      'content_draft', 'admin', (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;

  if p_entity_id is not null then
    case p_entity_type
      when 'course' then select version into v_base_version
        from public.courses where id = p_entity_id;
      when 'chapter' then select version into v_base_version
        from public.chapters where id = p_entity_id;
      when 'section' then select version into v_base_version
        from public.sections where id = p_entity_id;
      when 'subtopic' then select version into v_base_version
        from public.subtopics where id = p_entity_id;
      when 'review_card' then select version into v_base_version
        from public.review_cards where id = p_entity_id;
      when 'assessment_bank' then select version into v_base_version
        from public.assessment_banks where id = p_entity_id;
      when 'question' then select version into v_base_version
        from public.questions where id = p_entity_id;
      else null;
    end case;
    if v_base_version is null then
      return public.admin_internal_deny(
        'content/drafts', 'CONTENT_SCOPE_INVALID',
        'admin_save_content_draft', 'content_draft', 'admin',
        (v_auth ->> 'principal_id')::uuid,
        (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::integer
      );
    end if;
  end if;

  if p_request_id is null
     or p_expected_revision is null or p_expected_revision < 0
     or p_entity_type not in (
       'course', 'chapter', 'section', 'subtopic', 'review_card',
       'assessment_bank', 'question'
     )
     or p_source not in ('manual', 'import')
     or char_length(btrim(coalesce(p_stable_code, ''))) not between 1 and 200
     or jsonb_typeof(p_payload) is distinct from 'object' then
    return public.admin_internal_deny(
      'content/drafts', 'CONTENT_VALIDATION_FAILED',
      'admin_save_content_draft', 'content_draft', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;

  v_request_hash := extensions.digest(convert_to(jsonb_build_object(
    'draft_id', p_draft_id,
    'entity_id', p_entity_id,
    'entity_type', p_entity_type,
    'stable_code', btrim(p_stable_code),
    'expected_revision', p_expected_revision,
    'payload', p_payload,
    'source', p_source,
    'auth_session_id', v_auth ->> 'auth_session_id'
  )::text, 'utf8'), 'sha256');

  perform pg_advisory_xact_lock(hashtextextended(
    v_actor::text || ':' || p_request_id::text, 0
  ));

  select request.* into v_existing_request
  from public.content_draft_requests as request
  where request.actor_user_id = v_actor
    and request.request_id = p_request_id;
  if v_existing_request.request_id is not null then
    if v_existing_request.auth_session_id is distinct from
         (v_auth ->> 'auth_session_id')::uuid
       or v_existing_request.request_hash is distinct from v_request_hash then
      return public.admin_internal_deny(
        'content/drafts', 'IDEMPOTENCY_CONFLICT',
        'admin_save_content_draft', 'content_draft', 'admin',
        (v_auth ->> 'principal_id')::uuid,
        (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::integer
      );
    end if;
    return jsonb_set(v_existing_request.result_receipt, '{replayed}', 'true');
  end if;

  if p_draft_id is not null then
    select draft.* into v_draft
    from public.content_drafts as draft
    where draft.id = p_draft_id
    for update;
  elsif p_entity_id is not null then
    select draft.* into v_draft
    from public.content_drafts as draft
    where draft.entity_type = p_entity_type
      and draft.entity_id = p_entity_id
    for update;
  end if;

  if v_draft.id is null then
    if p_draft_id is not null or p_expected_revision <> 0 then
      return public.admin_internal_deny(
        'content/drafts', 'CONTENT_DRAFT_CONFLICT',
        'admin_save_content_draft', 'content_draft', 'admin',
        (v_auth ->> 'principal_id')::uuid,
        (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::integer
      );
    end if;
    insert into public.content_drafts (
      entity_type, entity_id, stable_code, base_version, revision, payload,
      source, actor_user_id
    ) values (
      p_entity_type, p_entity_id, btrim(p_stable_code), v_base_version, 1, p_payload,
      p_source, v_actor
    ) returning * into v_draft;
  else
    if v_draft.entity_type is distinct from p_entity_type
       or v_draft.entity_id is distinct from p_entity_id
       or v_draft.revision is distinct from p_expected_revision then
      return public.admin_internal_deny(
        'content/drafts', 'CONTENT_DRAFT_CONFLICT',
        'admin_save_content_draft', 'content_draft', 'admin',
        (v_auth ->> 'principal_id')::uuid,
        (v_auth ->> 'session_id')::uuid,
        (v_auth ->> 'auth_session_id')::uuid, null, null,
        (v_auth ->> 'mfa_age_seconds')::integer
      );
    end if;
    update public.content_drafts
    set stable_code = btrim(p_stable_code),
        payload = p_payload,
        source = p_source,
        actor_user_id = v_actor,
        revision = revision + 1,
        updated_at = clock_timestamp()
    where id = v_draft.id
    returning * into v_draft;
  end if;

  v_receipt := content_private.draft_receipt(v_draft, p_request_id, false);
  insert into public.content_draft_requests (
    actor_user_id, auth_session_id, request_id, request_hash, draft_id,
    result_receipt
  ) values (
    v_actor, (v_auth ->> 'auth_session_id')::uuid, p_request_id,
    v_request_hash, v_draft.id, v_receipt
  );

  perform public.admin_internal_append_audit(
    'admin', (v_auth ->> 'principal_id')::uuid,
    (v_auth ->> 'session_id')::uuid,
    (v_auth ->> 'auth_session_id')::uuid,
    'admin_save_content_draft', 'content_draft', null, 'success', null,
    (v_auth ->> 'mfa_age_seconds')::integer,
    jsonb_build_object(
      'entity_type', v_draft.entity_type,
      'stable_code', v_draft.stable_code,
      'revision', v_draft.revision
    ),
    p_request_id::text
  );

  return v_receipt;
end;
$$;

revoke execute on function content_private.validate_question_bank()
  from public, anon, authenticated;
revoke execute on function content_private.protect_published_bank()
  from public, anon, authenticated;
revoke execute on function content_private.draft_receipt(
  public.content_drafts, uuid, boolean
) from public, anon, authenticated;
revoke execute on function public.admin_save_content_draft(
  uuid, uuid, text, text, integer, jsonb, text, uuid
) from public, anon;
grant execute on function public.admin_save_content_draft(
  uuid, uuid, text, text, integer, jsonb, text, uuid
) to authenticated;
