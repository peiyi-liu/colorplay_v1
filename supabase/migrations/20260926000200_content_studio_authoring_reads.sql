-- Safe Admin projection for the Content Studio navigation tree. The browser
-- receives curriculum identity and counts only; draft payloads and answer keys
-- remain behind dedicated privileged reads.

alter table public.questions
  add column duration_seconds integer not null default 30
  check (duration_seconds between 5 and 120);

create function content_private.current_entity(
  p_entity_type text,
  p_entity_id uuid
) returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, content_private
as $$
declare
  v_result jsonb;
begin
  case p_entity_type
    when 'course' then
      select jsonb_build_object(
        'entity_id', course.id, 'entity_type', 'course',
        'stable_code', course.stable_code, 'status', course.status,
        'version', null,
        'payload', jsonb_build_object(
          'title', course.title, 'description', course.description,
          'sort_order', course.sort_order
        )
      ) into v_result
      from public.courses as course where course.id = p_entity_id;
    when 'chapter' then
      select jsonb_build_object(
        'entity_id', chapter.id, 'entity_type', 'chapter',
        'stable_code', chapter.stable_code, 'status', chapter.status,
        'version', null,
        'payload', jsonb_build_object(
          'course_id', chapter.course_id, 'title', chapter.title,
          'description', chapter.description, 'sort_order', chapter.sort_order
        )
      ) into v_result
      from public.chapters as chapter where chapter.id = p_entity_id;
    when 'section' then
      select jsonb_build_object(
        'entity_id', section.id, 'entity_type', 'section',
        'stable_code', section.stable_code, 'status', section.status,
        'version', null,
        'payload', jsonb_build_object(
          'chapter_id', section.chapter_id, 'title', section.title,
          'description', section.description, 'sort_order', section.sort_order
        )
      ) into v_result
      from public.sections as section where section.id = p_entity_id;
    when 'subtopic' then
      select jsonb_build_object(
        'entity_id', subtopic.id, 'entity_type', 'subtopic',
        'stable_code', subtopic.stable_code, 'status', subtopic.status,
        'version', null,
        'payload', jsonb_build_object(
          'section_id', subtopic.section_id, 'title', subtopic.title,
          'description', subtopic.description,
          'sort_order', subtopic.sort_order
        )
      ) into v_result
      from public.subtopics as subtopic where subtopic.id = p_entity_id;
    when 'review_card' then
      select jsonb_build_object(
        'entity_id', card.id, 'entity_type', 'review_card',
        'stable_code', card.stable_code, 'status', card.status,
        'version', card.version,
        'payload', jsonb_build_object(
          'subtopic_id', card.subtopic_id, 'group_label', card.group_label,
          'title', card.title, 'content', card.content,
          'requires_recompletion', card.requires_recompletion,
          'sort_order', card.sort_order,
          'media', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', media.id, 'asset_path', media.asset_path,
              'alt_text', media.alt_text, 'sort_order', media.sort_order
            ) order by media.sort_order)
            from public.review_card_media as media
            where media.review_card_id = card.id
              and media.card_version = card.version
          ), '[]'::jsonb)
        )
      ) into v_result
      from public.review_cards as card where card.id = p_entity_id;
    when 'assessment_bank' then
      select jsonb_build_object(
        'entity_id', bank.id, 'entity_type', 'assessment_bank',
        'stable_code', bank.stable_code, 'status', bank.status,
        'version', bank.version,
        'payload', jsonb_build_object(
          'kind', bank.kind, 'chapter_id', bank.chapter_id,
          'section_id', bank.section_id, 'title', bank.title,
          'description', bank.description,
          'selection_settings', bank.selection_settings,
          'sort_order', bank.sort_order
        )
      ) into v_result
      from public.assessment_banks as bank where bank.id = p_entity_id;
    when 'question' then
      select jsonb_build_object(
        'entity_id', question.id, 'entity_type', 'question',
        'stable_code', question.stable_code, 'status', question.status,
        'version', question.version,
        'payload', jsonb_build_object(
          'bank_id', question.bank_id, 'question_type', question.question_type,
          'prompt', question.prompt, 'explanation', question.explanation,
          'duration_seconds', question.duration_seconds,
          'sort_order', question.sort_order,
          'options', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', option.id, 'key', option.option_key,
              'text', option.option_text, 'is_correct', option.is_correct,
              'sort_order', option.sort_order
            ) order by option.sort_order)
            from public.question_options as option
            where option.question_id = question.id
          ), '[]'::jsonb)
        )
      ) into v_result
      from public.questions as question where question.id = p_entity_id;
    else
      return null;
  end case;
  return v_result;
end;
$$;

create function public.admin_list_content_scope(p_chapter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_auth jsonb;
  v_chapter public.chapters;
  v_chapter_banks jsonb;
  v_sections jsonb;
  v_request_id uuid := gen_random_uuid();
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'content/scope', v_auth ->> 'code', 'admin_list_content_scope',
      'content_scope',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null
    );
  end if;

  select chapter.* into v_chapter
  from public.chapters as chapter
  where chapter.id = p_chapter_id;
  if v_chapter.id is null then
    return public.admin_internal_deny(
      'content/scope', 'CONTENT_SCOPE_INVALID',
      'admin_list_content_scope', 'content_scope', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', bank.id,
    'kind', bank.kind,
    'question_count', (
      select count(*)::integer from public.questions as question
      where question.bank_id = bank.id
    ),
    'sort_order', bank.sort_order,
    'stable_code', bank.stable_code,
    'status', bank.status,
    'title', bank.title
  ) order by bank.sort_order, bank.stable_code), '[]'::jsonb)
  into v_chapter_banks
  from public.assessment_banks as bank
  where bank.chapter_id = v_chapter.id and bank.kind = 'CR';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', section.id,
    'stable_code', section.stable_code,
    'title', section.title,
    'status', section.status,
    'sort_order', section.sort_order,
    'banks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bank.id,
        'kind', bank.kind,
        'question_count', (
          select count(*)::integer from public.questions as question
          where question.bank_id = bank.id
        ),
        'sort_order', bank.sort_order,
        'stable_code', bank.stable_code,
        'status', bank.status,
        'title', bank.title
      ) order by bank.sort_order, bank.kind, bank.stable_code)
      from public.assessment_banks as bank
      where bank.section_id = section.id and bank.kind in ('QB', 'LT')
    ), '[]'::jsonb),
    'subtopics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', subtopic.id,
        'stable_code', subtopic.stable_code,
        'title', subtopic.title,
        'status', subtopic.status,
        'sort_order', subtopic.sort_order,
        'review_card_count', (
          select count(*)::integer from public.review_cards as card
          where card.subtopic_id = subtopic.id
        )
      ) order by subtopic.sort_order, subtopic.stable_code)
      from public.subtopics as subtopic
      where subtopic.section_id = section.id
    ), '[]'::jsonb)
  ) order by section.sort_order, section.stable_code), '[]'::jsonb)
  into v_sections
  from public.sections as section
  where section.chapter_id = v_chapter.id;

  return jsonb_build_object(
    'outcome', 'ok',
    'request_id', v_request_id,
    'chapter', jsonb_build_object(
      'id', v_chapter.id,
      'stable_code', v_chapter.stable_code,
      'title', v_chapter.title,
      'status', v_chapter.status,
      'sort_order', v_chapter.sort_order
    ),
    'chapter_banks', v_chapter_banks,
    'sections', v_sections
  );
end;
$$;

revoke execute on function public.admin_list_content_scope(uuid)
  from public, anon;
grant execute on function public.admin_list_content_scope(uuid)
  to authenticated;

create function public.admin_read_content_editor_state(
  p_entity_type text,
  p_entity_id uuid,
  p_draft_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
declare
  v_auth jsonb;
  v_current jsonb;
  v_draft public.content_drafts;
  v_request_id uuid := gen_random_uuid();
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'content/editor-state', v_auth ->> 'code',
      'admin_read_content_editor_state', 'content_editor_state',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null
    );
  end if;
  if p_entity_type not in (
       'course', 'chapter', 'section', 'subtopic', 'review_card',
       'assessment_bank', 'question'
     )
     or (p_entity_id is null and p_draft_id is null) then
    return public.admin_internal_deny(
      'content/editor-state', 'CONTENT_SCOPE_INVALID',
      'admin_read_content_editor_state', 'content_editor_state', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;

  if p_draft_id is not null then
    select draft.* into v_draft
    from public.content_drafts as draft
    where draft.id = p_draft_id;
  elsif p_entity_id is not null then
    select draft.* into v_draft
    from public.content_drafts as draft
    where draft.entity_type = p_entity_type
      and draft.entity_id = p_entity_id;
  end if;
  if v_draft.id is not null
     and (
       v_draft.entity_type is distinct from p_entity_type
       or (p_entity_id is not null
         and v_draft.entity_id is distinct from p_entity_id)
     ) then
    return public.admin_internal_deny(
      'content/editor-state', 'CONTENT_SCOPE_INVALID',
      'admin_read_content_editor_state', 'content_editor_state', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;

  if p_entity_id is not null then
    v_current := content_private.current_entity(p_entity_type, p_entity_id);
  end if;
  if v_current is null and v_draft.id is null then
    return public.admin_internal_deny(
      'content/editor-state', 'CONTENT_SCOPE_INVALID',
      'admin_read_content_editor_state', 'content_editor_state', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;

  return jsonb_build_object(
    'outcome', 'ok',
    'request_id', v_request_id,
    'current', v_current,
    'draft', case when v_draft.id is null then null
      else content_private.draft_receipt(v_draft, v_request_id, false)
        -> 'draft'
    end
  );
end;
$$;

revoke execute on function content_private.current_entity(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.admin_read_content_editor_state(
  text, uuid, uuid
) from public, anon;
grant execute on function public.admin_read_content_editor_state(
  text, uuid, uuid
) to authenticated;
