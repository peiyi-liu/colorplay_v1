-- Teacher content commands: draft upsert, publish (with semantic versioning),
-- and archive for questions and review cards. Every command is teacher-only,
-- validates per spec/06 §5 (including server-side unsafe-text rejection),
-- snapshots published payloads into content_versions, and appends to
-- content_publication_events. Historical sessions read frozen copies and are
-- never rewritten. Identical publish payloads are no-ops.

create function public.assert_content_teacher()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = current_user_id
      and profile.role = 'teacher'
  ) then
    raise exception using errcode = 'P0001', message = 'CONTENT_TEACHER_ONLY';
  end if;
  return current_user_id;
end;
$$;

revoke all on function public.assert_content_teacher() from public, anon, authenticated;

create function public.assert_safe_content_text(p_value text)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if p_value is null then return; end if;
  if p_value ~* '<script' or p_value ~* '\mon[a-z]+\s*=' then
    raise exception using errcode = 'P0001', message = 'CONTENT_UNSAFE_TEXT';
  end if;
end;
$$;

revoke all on function public.assert_safe_content_text(text)
from public, anon, authenticated;

-- Canonical semantic payload of a stored question, for change detection and
-- version snapshots.
create function public.question_semantic_payload(p_question_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'stable_code', question.stable_code,
    'subtopic_id', question.subtopic_id,
    'prompt', question.prompt,
    'explanation', question.explanation,
    'options', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'key', o.option_key,
            'text', o.option_text,
            'is_correct', o.is_correct
          )
          order by o.option_key
        ),
        '[]'::jsonb
      )
      from public.question_options o
      where o.question_id = question.id
    )
  )
  from public.questions question
  where question.id = p_question_id;
$$;

revoke all on function public.question_semantic_payload(uuid)
from public, anon, authenticated;

create function public.record_content_version(
  p_type public.versioned_content_type,
  p_content_id uuid,
  p_version integer,
  p_payload jsonb,
  p_status public.content_status,
  p_actor uuid
)
returns void
language sql
set search_path = pg_catalog, public
as $$
  insert into public.content_versions (
    content_type, content_id, version, frozen_payload, payload_hash, status,
    created_by
  )
  values (
    p_type, p_content_id, p_version, p_payload,
    md5(p_payload::text), p_status, p_actor
  )
  on conflict on constraint content_versions_identity_unique do nothing;
$$;

revoke all on function public.record_content_version(
  public.versioned_content_type, uuid, integer, jsonb, public.content_status, uuid
) from public, anon, authenticated;

-- Validates a question payload and applies it to a new or existing question
-- row. Returns the question id. Published targets keep their option rows
-- (updates by key) so historical answer references stay intact.
create function public.apply_question_payload(
  p_question_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  code text := btrim(coalesce(p_payload ->> 'stable_code', ''));
  subtopic uuid := (p_payload ->> 'subtopic_id')::uuid;
  v_prompt text := btrim(coalesce(p_payload ->> 'prompt', ''));
  v_explanation text := btrim(coalesce(p_payload ->> 'explanation', ''));
  options jsonb := p_payload -> 'options';
  option_count integer;
  correct_count integer;
  target_id uuid := p_question_id;
  option_record record;
  existing_option uuid;
begin
  if code !~ '^[0-9]+-[0-9]+-[0-9]{2}$' then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_CODE';
  end if;
  if subtopic is null or not exists (
    select 1 from public.subtopics st where st.id = subtopic
  ) then
    raise exception using errcode = 'P0001', message = 'CONTENT_SUBTOPIC_NOT_FOUND';
  end if;
  if char_length(v_prompt) not between 1 and 1000
    or char_length(v_explanation) not between 1 and 2000 then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_TEXT';
  end if;
  perform public.assert_safe_content_text(v_prompt);
  perform public.assert_safe_content_text(v_explanation);

  if options is null or jsonb_typeof(options) <> 'array' then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_OPTIONS';
  end if;
  select count(*)::integer,
    count(*) filter (where (entry ->> 'is_correct')::boolean)::integer
  into option_count, correct_count
  from jsonb_array_elements(options) entry;
  if option_count not between 2 and 4 or correct_count <> 1 then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_OPTIONS';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(options) entry
    where btrim(coalesce(entry ->> 'text', '')) = ''
      or char_length(entry ->> 'text') > 500
      or coalesce(entry ->> 'key', '') !~ '^[A-D]$'
  ) then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_OPTIONS';
  end if;
  if (
    select count(distinct lower(btrim(entry ->> 'text')))
    from jsonb_array_elements(options) entry
  ) <> option_count or (
    select count(distinct entry ->> 'key')
    from jsonb_array_elements(options) entry
  ) <> option_count then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_OPTIONS';
  end if;
  if target_id is null then
    insert into public.questions (
      subtopic_id, stable_code, prompt, explanation, status, sort_order
    )
    values (
      subtopic, code, v_prompt, v_explanation, 'draft',
      coalesce(
        (
          select max(q.sort_order) + 1
          from public.questions q
          where q.subtopic_id = subtopic
        ),
        1
      )
    )
    returning id into target_id;
  else
    update public.questions
    set subtopic_id = subtopic,
        prompt = v_prompt,
        explanation = v_explanation,
        updated_at = clock_timestamp()
    where id = target_id;
  end if;

  for option_record in
    select
      entry ->> 'key' as option_key,
      btrim(entry ->> 'text') as option_text,
      (entry ->> 'is_correct')::boolean as is_correct,
      row_number() over (order by entry ->> 'key')::integer as sort_order
    from jsonb_array_elements(options) entry
  loop
    perform public.assert_safe_content_text(option_record.option_text);
    select id into existing_option
    from public.question_options
    where question_id = target_id
      and option_key = option_record.option_key;
    if existing_option is null then
      insert into public.question_options (
        question_id, option_key, option_text, is_correct, sort_order
      ) values (
        target_id, option_record.option_key, option_record.option_text,
        option_record.is_correct, option_record.sort_order
      );
    else
      update public.question_options
      set option_text = option_record.option_text,
          is_correct = option_record.is_correct,
          sort_order = option_record.sort_order
      where id = existing_option;
    end if;
  end loop;

  begin
    delete from public.question_options o
    where o.question_id = target_id
      and not exists (
        select 1
        from jsonb_array_elements(options) entry
        where entry ->> 'key' = o.option_key
      );
  exception
    when foreign_key_violation then
      raise exception using errcode = 'P0001', message = 'CONTENT_OPTION_IN_USE';
  end;

  return target_id;
end;
$$;

revoke all on function public.apply_question_payload(uuid, jsonb)
from public, anon, authenticated;

create function public.upsert_question_draft(
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := public.assert_content_teacher();
  code text := btrim(coalesce(p_payload ->> 'stable_code', ''));
  existing public.questions;
  target uuid;
begin
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_REQUEST';
  end if;
  select * into existing
  from public.questions
  where stable_code = code
  for update;
  if existing.id is not null and existing.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'CONTENT_ALREADY_PUBLISHED';
  end if;
  target := public.apply_question_payload(existing.id, p_payload);
  return jsonb_build_object(
    'question_id', target,
    'status', 'draft',
    'version', (select version from public.questions where id = target)
  );
end;
$$;

create function public.publish_question(
  p_question_id uuid,
  p_payload jsonb default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := public.assert_content_teacher();
  question_record public.questions;
  was_published boolean;
  changed boolean := false;
  next_version integer;
begin
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_REQUEST';
  end if;
  select * into question_record
  from public.questions
  where id = p_question_id
  for update;
  if question_record.id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_NOT_FOUND';
  end if;
  was_published := question_record.status = 'published';

  if p_payload is not null then
    if (
      select jsonb_build_object(
        'stable_code', btrim(coalesce(p_payload ->> 'stable_code', '')),
        'subtopic_id', p_payload ->> 'subtopic_id',
        'prompt', btrim(coalesce(p_payload ->> 'prompt', '')),
        'explanation', btrim(coalesce(p_payload ->> 'explanation', '')),
        'options', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'key', entry ->> 'key',
                'text', btrim(entry ->> 'text'),
                'is_correct', (entry ->> 'is_correct')::boolean
              )
              order by entry ->> 'key'
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(p_payload -> 'options') entry
        )
      )
    ) is distinct from
      public.question_semantic_payload(question_record.id) then
      changed := true;
      perform public.apply_question_payload(question_record.id, p_payload);
    end if;
  end if;

  if was_published and changed then
    next_version := question_record.version + 1;
    update public.questions
    set version = next_version, updated_at = clock_timestamp()
    where id = question_record.id;
  else
    next_version := question_record.version;
  end if;

  if was_published and not changed then
    return jsonb_build_object(
      'question_id', question_record.id,
      'status', 'published',
      'version', next_version,
      'changed', false
    );
  end if;

  update public.questions
  set status = 'published', updated_at = clock_timestamp()
  where id = question_record.id;

  perform public.record_content_version(
    'question', question_record.id, next_version,
    public.question_semantic_payload(question_record.id), 'published', actor
  );
  insert into public.content_publication_events (
    content_type, content_id, version, event_type, actor_id, request_id
  ) values (
    'question', question_record.id, next_version, 'publish', actor,
    p_request_id
  );

  return jsonb_build_object(
    'question_id', question_record.id,
    'status', 'published',
    'version', next_version,
    'changed', changed
  );
end;
$$;

create function public.archive_question(
  p_question_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := public.assert_content_teacher();
  question_record public.questions;
begin
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_REQUEST';
  end if;
  select * into question_record
  from public.questions
  where id = p_question_id
  for update;
  if question_record.id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_NOT_FOUND';
  end if;
  if question_record.status = 'archived' then
    return jsonb_build_object(
      'question_id', question_record.id,
      'status', 'archived',
      'version', question_record.version
    );
  end if;
  update public.questions
  set status = 'archived', updated_at = clock_timestamp()
  where id = question_record.id;
  insert into public.content_publication_events (
    content_type, content_id, version, event_type, actor_id, request_id
  ) values (
    'question', question_record.id, question_record.version, 'archive', actor,
    p_request_id
  );
  return jsonb_build_object(
    'question_id', question_record.id,
    'status', 'archived',
    'version', question_record.version
  );
end;
$$;

-- Review card payload application shared by draft and publish paths.
create function public.apply_review_card_payload(
  p_card_id uuid,
  p_payload jsonb,
  p_target_version integer
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  code text := btrim(coalesce(p_payload ->> 'stable_code', ''));
  subtopic uuid := (p_payload ->> 'subtopic_id')::uuid;
  v_group_label text := btrim(coalesce(p_payload ->> 'group_label', ''));
  v_title text := btrim(coalesce(p_payload ->> 'title', ''));
  v_content text := btrim(coalesce(p_payload ->> 'content', ''));
  requires boolean := coalesce((p_payload ->> 'requires_recompletion')::boolean, false);
  media jsonb := p_payload -> 'media';
  target_id uuid := p_card_id;
begin
  if char_length(code) not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_CODE';
  end if;
  if subtopic is null or not exists (
    select 1 from public.subtopics st where st.id = subtopic
  ) then
    raise exception using errcode = 'P0001', message = 'CONTENT_SUBTOPIC_NOT_FOUND';
  end if;
  if char_length(v_title) not between 1 and 200
    or char_length(v_content) not between 1 and 8000
    or char_length(v_group_label) > 120 then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_TEXT';
  end if;
  perform public.assert_safe_content_text(v_title);
  perform public.assert_safe_content_text(v_content);
  perform public.assert_safe_content_text(v_group_label);

  if media is not null then
    if jsonb_typeof(media) <> 'array' or exists (
      select 1
      from jsonb_array_elements(media) entry
      where char_length(btrim(coalesce(entry ->> 'asset_path', '')))
          not between 1 and 500
        or char_length(btrim(coalesce(entry ->> 'alt_text', '')))
          not between 1 and 300
    ) then
      raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_MEDIA';
    end if;
  end if;

  if target_id is null then
    insert into public.review_cards (
      subtopic_id, stable_code, group_label, title, content, version, status,
      requires_recompletion, sort_order
    )
    values (
      subtopic, code, v_group_label, v_title, v_content, 1, 'draft', requires,
      coalesce(
        (
          select max(card.sort_order) + 1
          from public.review_cards card
          where card.subtopic_id = subtopic
        ),
        1
      )
    )
    returning id into target_id;
  else
    update public.review_cards
    set subtopic_id = subtopic,
        group_label = v_group_label,
        title = v_title,
        content = v_content,
        requires_recompletion = requires,
        updated_at = clock_timestamp()
    where id = target_id;
  end if;

  if media is not null then
    delete from public.review_card_media
    where review_card_id = target_id and card_version = p_target_version;
    insert into public.review_card_media (
      review_card_id, card_version, asset_path, alt_text, sort_order
    )
    select
      target_id, p_target_version,
      btrim(entry ->> 'asset_path'), btrim(entry ->> 'alt_text'),
      ordinality::integer
    from jsonb_array_elements(media) with ordinality entry;
  end if;

  return target_id;
end;
$$;

revoke all on function public.apply_review_card_payload(uuid, jsonb, integer)
from public, anon, authenticated;

create function public.review_card_semantic_payload(p_card_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'stable_code', card.stable_code,
    'subtopic_id', card.subtopic_id,
    'group_label', card.group_label,
    'title', card.title,
    'content', card.content,
    'requires_recompletion', card.requires_recompletion,
    'media', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'asset_path', m.asset_path,
            'alt_text', m.alt_text
          )
          order by m.sort_order
        ),
        '[]'::jsonb
      )
      from public.review_card_media m
      where m.review_card_id = card.id and m.card_version = card.version
    )
  )
  from public.review_cards card
  where card.id = p_card_id;
$$;

revoke all on function public.review_card_semantic_payload(uuid)
from public, anon, authenticated;

create function public.upsert_review_card_draft(
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := public.assert_content_teacher();
  code text := btrim(coalesce(p_payload ->> 'stable_code', ''));
  existing public.review_cards;
  target uuid;
begin
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_REQUEST';
  end if;
  select * into existing
  from public.review_cards
  where stable_code = code
  for update;
  if existing.id is not null and existing.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'CONTENT_ALREADY_PUBLISHED';
  end if;
  target := public.apply_review_card_payload(
    existing.id, p_payload, coalesce(existing.version, 1)
  );
  return jsonb_build_object(
    'review_card_id', target,
    'status', 'draft',
    'version', (select version from public.review_cards where id = target)
  );
end;
$$;

create function public.publish_review_card(
  p_card_id uuid,
  p_payload jsonb default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := public.assert_content_teacher();
  card_record public.review_cards;
  was_published boolean;
  changed boolean := false;
  next_version integer;
begin
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_REQUEST';
  end if;
  select * into card_record
  from public.review_cards
  where id = p_card_id
  for update;
  if card_record.id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_NOT_FOUND';
  end if;
  was_published := card_record.status = 'published';

  if p_payload is not null then
    if (
      select jsonb_build_object(
        'stable_code', p_payload ->> 'stable_code',
        'subtopic_id', p_payload ->> 'subtopic_id',
        'group_label', btrim(coalesce(p_payload ->> 'group_label', '')),
        'title', btrim(p_payload ->> 'title'),
        'content', btrim(p_payload ->> 'content'),
        'requires_recompletion',
          coalesce((p_payload ->> 'requires_recompletion')::boolean, false),
        'media', coalesce(p_payload -> 'media', '[]'::jsonb)
      )
    ) is distinct from
      public.review_card_semantic_payload(card_record.id) then
      changed := true;
    end if;
    if changed and was_published then
      next_version := card_record.version + 1;
      update public.review_cards
      set version = next_version, updated_at = clock_timestamp()
      where id = card_record.id;
    else
      next_version := card_record.version;
    end if;
    if changed then
      perform public.apply_review_card_payload(
        card_record.id, p_payload, next_version
      );
    end if;
  else
    next_version := card_record.version;
  end if;

  if was_published and not changed then
    return jsonb_build_object(
      'review_card_id', card_record.id,
      'status', 'published',
      'version', next_version,
      'changed', false
    );
  end if;

  update public.review_cards
  set status = 'published', updated_at = clock_timestamp()
  where id = card_record.id;

  perform public.record_content_version(
    'review_card', card_record.id, next_version,
    public.review_card_semantic_payload(card_record.id), 'published', actor
  );
  insert into public.content_publication_events (
    content_type, content_id, version, event_type, actor_id, request_id
  ) values (
    'review_card', card_record.id, next_version, 'publish', actor, p_request_id
  );

  return jsonb_build_object(
    'review_card_id', card_record.id,
    'status', 'published',
    'version', next_version,
    'changed', changed
  );
end;
$$;

create function public.archive_review_card(
  p_card_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := public.assert_content_teacher();
  card_record public.review_cards;
begin
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_REQUEST';
  end if;
  select * into card_record
  from public.review_cards
  where id = p_card_id
  for update;
  if card_record.id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_NOT_FOUND';
  end if;
  if card_record.status = 'archived' then
    return jsonb_build_object(
      'review_card_id', card_record.id,
      'status', 'archived',
      'version', card_record.version
    );
  end if;
  update public.review_cards
  set status = 'archived', updated_at = clock_timestamp()
  where id = card_record.id;
  insert into public.content_publication_events (
    content_type, content_id, version, event_type, actor_id, request_id
  ) values (
    'review_card', card_record.id, card_record.version, 'archive', actor,
    p_request_id
  );
  return jsonb_build_object(
    'review_card_id', card_record.id,
    'status', 'archived',
    'version', card_record.version
  );
end;
$$;

-- Teachers can read drafts for the workspace (students keep published-only).
create policy questions_teacher_select on public.questions
for select to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'teacher'
  )
);

create policy review_cards_teacher_select on public.review_cards
for select to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'teacher'
  )
);

revoke all on function public.upsert_question_draft(jsonb, uuid)
from public, anon;
revoke all on function public.publish_question(uuid, jsonb, uuid)
from public, anon;
revoke all on function public.archive_question(uuid, uuid) from public, anon;
revoke all on function public.upsert_review_card_draft(jsonb, uuid)
from public, anon;
revoke all on function public.publish_review_card(uuid, jsonb, uuid)
from public, anon;
revoke all on function public.archive_review_card(uuid, uuid)
from public, anon;

grant execute on function public.upsert_question_draft(jsonb, uuid)
to authenticated;
grant execute on function public.publish_question(uuid, jsonb, uuid)
to authenticated;
grant execute on function public.archive_question(uuid, uuid) to authenticated;
grant execute on function public.upsert_review_card_draft(jsonb, uuid)
to authenticated;
grant execute on function public.publish_review_card(uuid, jsonb, uuid)
to authenticated;
grant execute on function public.archive_review_card(uuid, uuid)
to authenticated;
