-- Deterministic draft validation and student-safe preview. Saving a draft may
-- preserve incomplete WIP; validation is the server-authoritative readiness
-- boundary and preview never returns answer flags or internal media paths.

create function content_private.json_uuid(p_payload jsonb, p_key text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  return nullif(btrim(coalesce(p_payload ->> p_key, '')), '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create function content_private.issue(
  p_code text,
  p_field text,
  p_message text,
  p_severity text default 'error'
) returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'code', p_code,
    'field', p_field,
    'message', p_message,
    'severity', p_severity
  );
$$;

create function content_private.validate_draft(p_draft public.content_drafts)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, content_private
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_current jsonb;
  v_parent_id uuid;
  v_bank public.assessment_banks;
  v_options jsonb;
  v_option_count integer;
  v_correct_count integer;
  v_duplicate_count integer;
  v_has_duplicate boolean := false;
  v_has_database_duplicate boolean := false;
begin
  v_current := case when p_draft.entity_id is null then null
    else content_private.current_entity(p_draft.entity_type, p_draft.entity_id)
  end;

  if v_current is not null
     and v_current ->> 'status' = 'published'
     and v_current ->> 'stable_code' is distinct from p_draft.stable_code then
    v_issues := v_issues || jsonb_build_array(content_private.issue(
      'CONTENT_STABLE_CODE_IMMUTABLE', 'stable_code',
      '已發布內容不可修改 stable code。'
    ));
  end if;

  if exists (
    select 1 from public.content_drafts as other
    where other.id <> p_draft.id
      and other.entity_type = p_draft.entity_type
      and other.stable_code = p_draft.stable_code
  ) then
    v_has_duplicate := true;
  end if;
  case p_draft.entity_type
    when 'course' then
      select exists(select 1 from public.courses item
        where item.stable_code = p_draft.stable_code
          and item.id is distinct from p_draft.entity_id)
      into v_has_database_duplicate;
    when 'chapter' then
      select exists(select 1 from public.chapters item
        where item.stable_code = p_draft.stable_code
          and item.id is distinct from p_draft.entity_id)
      into v_has_database_duplicate;
    when 'section' then
      select exists(select 1 from public.sections item
        where item.stable_code = p_draft.stable_code
          and item.id is distinct from p_draft.entity_id)
      into v_has_database_duplicate;
    when 'subtopic' then
      select exists(select 1 from public.subtopics item
        where item.stable_code = p_draft.stable_code
          and item.id is distinct from p_draft.entity_id)
      into v_has_database_duplicate;
    when 'review_card' then
      select exists(select 1 from public.review_cards item
        where item.stable_code = p_draft.stable_code
          and item.id is distinct from p_draft.entity_id)
      into v_has_database_duplicate;
    when 'assessment_bank' then
      select exists(select 1 from public.assessment_banks item
        where item.stable_code = p_draft.stable_code
          and item.id is distinct from p_draft.entity_id)
      into v_has_database_duplicate;
    when 'question' then
      select exists(select 1 from public.questions item
        where item.stable_code = p_draft.stable_code
          and item.id is distinct from p_draft.entity_id)
      into v_has_database_duplicate;
    else null;
  end case;
  if v_has_duplicate or v_has_database_duplicate then
    v_issues := v_issues || jsonb_build_array(content_private.issue(
      'CONTENT_DUPLICATE_STABLE_CODE', 'stable_code',
      'stable code 已被其他內容使用。'
    ));
  end if;

  if p_draft.payload ? 'sort_order'
     and coalesce(p_draft.payload ->> 'sort_order', '') !~ '^[0-9]+$' then
    v_issues := v_issues || jsonb_build_array(content_private.issue(
      'CONTENT_SORT_ORDER_INVALID', 'sort_order',
      '排序必須是零或正整數。'
    ));
  end if;
  if p_draft.payload::text ~* '<script|\mon[a-z]+\s*=' then
    v_issues := v_issues || jsonb_build_array(content_private.issue(
      'CONTENT_UNSAFE_TEXT', 'payload', '內容包含不允許的標記或事件屬性。'
    ));
  end if;

  if p_draft.entity_type in (
    'course', 'chapter', 'section', 'subtopic', 'assessment_bank'
  ) and char_length(btrim(coalesce(p_draft.payload ->> 'title', '')))
      not between 1 and 100 then
    v_issues := v_issues || jsonb_build_array(content_private.issue(
      'CONTENT_TITLE_INVALID', 'title', '標題長度不符合規格。'
    ));
  end if;

  case p_draft.entity_type
    when 'chapter' then
      v_parent_id := content_private.json_uuid(p_draft.payload, 'course_id');
      if v_parent_id is null or not exists (
        select 1 from public.courses where id = v_parent_id
      ) then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_PARENT_INVALID', 'course_id', '章節必須屬於有效課程。'
        ));
      end if;
    when 'section' then
      v_parent_id := content_private.json_uuid(p_draft.payload, 'chapter_id');
      if v_parent_id is null or not exists (
        select 1 from public.chapters where id = v_parent_id
      ) then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_PARENT_INVALID', 'chapter_id', '小節必須屬於有效章節。'
        ));
      end if;
    when 'subtopic' then
      v_parent_id := content_private.json_uuid(p_draft.payload, 'section_id');
      if v_parent_id is null or not exists (
        select 1 from public.sections where id = v_parent_id
      ) then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_PARENT_INVALID', 'section_id', '子主題必須屬於有效小節。'
        ));
      end if;
    when 'review_card' then
      v_parent_id := content_private.json_uuid(p_draft.payload, 'subtopic_id');
      if v_parent_id is null or not exists (
        select 1 from public.subtopics where id = v_parent_id
      ) then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_PARENT_INVALID', 'subtopic_id', '複習卡必須屬於有效子主題。'
        ));
      end if;
      if char_length(btrim(coalesce(p_draft.payload ->> 'title', '')))
          not between 1 and 200
         or char_length(btrim(coalesce(p_draft.payload ->> 'content', '')))
          not between 1 and 8000 then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_REVIEW_CARD_INVALID', 'content',
          '複習卡標題或正文不符合規格。'
        ));
      end if;
    when 'assessment_bank' then
      if coalesce(p_draft.payload ->> 'kind', '') not in ('QB', 'CR', 'LT') then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_BANK_KIND_INVALID', 'kind', '題庫類型必須是 QB、CR 或 LT。'
        ));
      elsif p_draft.payload ->> 'kind' in ('QB', 'LT') then
        v_parent_id := content_private.json_uuid(p_draft.payload, 'section_id');
        if v_parent_id is null
           or p_draft.payload ->> 'chapter_id' is not null
           or not exists (select 1 from public.sections where id = v_parent_id)
        then
          v_issues := v_issues || jsonb_build_array(content_private.issue(
            'CONTENT_BANK_SCOPE_INVALID', 'section_id',
            'QB 與 LT 題庫必須且只能屬於有效小節。'
          ));
        end if;
      else
        v_parent_id := content_private.json_uuid(p_draft.payload, 'chapter_id');
        if v_parent_id is null
           or p_draft.payload ->> 'section_id' is not null
           or not exists (select 1 from public.chapters where id = v_parent_id)
        then
          v_issues := v_issues || jsonb_build_array(content_private.issue(
            'CONTENT_BANK_SCOPE_INVALID', 'chapter_id',
            'CR 題庫必須且只能屬於有效章節。'
          ));
        end if;
      end if;
      if v_current is not null and v_current ->> 'status' = 'published'
         and (
           v_current #>> '{payload,kind}'
             is distinct from p_draft.payload ->> 'kind'
           or v_current #>> '{payload,chapter_id}'
             is distinct from p_draft.payload ->> 'chapter_id'
           or v_current #>> '{payload,section_id}'
             is distinct from p_draft.payload ->> 'section_id'
         ) then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_BANK_SCOPE_IMMUTABLE', 'kind',
          '已發布題庫不可跨類型或移動 scope。'
        ));
      end if;
    when 'question' then
      v_parent_id := content_private.json_uuid(p_draft.payload, 'bank_id');
      select bank.* into v_bank from public.assessment_banks as bank
      where bank.id = v_parent_id;
      if v_bank.id is null then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_PARENT_INVALID', 'bank_id', '題目必須屬於有效題庫。'
        ));
      end if;
      if p_draft.payload ->> 'question_type' is distinct from 'single_choice'
         or char_length(btrim(coalesce(p_draft.payload ->> 'prompt', '')))
          not between 1 and 1000
         or char_length(btrim(coalesce(p_draft.payload ->> 'explanation', '')))
          not between 1 and 2000 then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_QUESTION_INVALID', 'prompt',
          '題型、題幹或解析不符合規格。'
        ));
      end if;
      if coalesce(p_draft.payload ->> 'duration_seconds', '') !~ '^[0-9]+$'
      then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_DURATION_INVALID', 'duration_seconds',
          '答題時間必須介於 5 到 120 秒。'
        ));
      elsif (p_draft.payload ->> 'duration_seconds')::integer
          not between 5 and 120 then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_DURATION_INVALID', 'duration_seconds',
          '答題時間必須介於 5 到 120 秒。'
        ));
      end if;
      v_options := p_draft.payload -> 'options';
      if jsonb_typeof(v_options) is distinct from 'array' then
        v_issues := v_issues || jsonb_build_array(content_private.issue(
          'CONTENT_OPTIONS_INVALID', 'options', '選項必須是陣列。'
        ));
      else
        v_option_count := jsonb_array_length(v_options);
        select count(*)::integer,
          count(distinct lower(btrim(option ->> 'text')))::integer
        into v_correct_count, v_duplicate_count
        from jsonb_array_elements(v_options) as option
        where option ->> 'is_correct' = 'true';
        select count(distinct lower(btrim(option ->> 'text')))::integer
        into v_duplicate_count
        from jsonb_array_elements(v_options) as option;
        if v_option_count not between 2 and 4
           or v_correct_count <> 1
           or v_duplicate_count <> v_option_count
           or exists (
             select 1 from jsonb_array_elements(v_options) as option
             where coalesce(option ->> 'key', '') !~ '^[A-D]$'
               or btrim(coalesce(option ->> 'text', '')) = ''
               or option ->> 'is_correct' not in ('true', 'false')
           ) then
          v_issues := v_issues || jsonb_build_array(content_private.issue(
            'CONTENT_OPTIONS_INVALID', 'options',
            '單選題需要 2–4 個不重複選項且恰有一個正解。'
          ));
        end if;
      end if;
    else null;
  end case;

  return v_issues;
end;
$$;

create function public.admin_validate_content_draft(
  p_draft_id uuid,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
declare
  v_auth jsonb;
  v_draft public.content_drafts;
  v_issues jsonb;
  v_request_id uuid := gen_random_uuid();
begin
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'content/validation', v_auth ->> 'code',
      'admin_validate_content_draft', 'content_draft',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null
    );
  end if;
  select draft.* into v_draft from public.content_drafts as draft
  where draft.id = p_draft_id;
  if v_draft.id is null
     or v_draft.revision is distinct from p_expected_revision then
    return public.admin_internal_deny(
      'content/validation', 'CONTENT_DRAFT_CONFLICT',
      'admin_validate_content_draft', 'content_draft', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;
  v_issues := content_private.validate_draft(v_draft);
  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_request_id,
    'draft_id', v_draft.id, 'revision', v_draft.revision,
    'valid', jsonb_array_length(v_issues) = 0,
    'issues', v_issues
  );
end;
$$;

create function public.admin_preview_content_draft(
  p_draft_id uuid,
  p_expected_revision integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, content_private, pg_temp
as $$
declare
  v_auth jsonb;
  v_draft public.content_drafts;
  v_issues jsonb;
  v_projection jsonb;
  v_request_id uuid := gen_random_uuid();
begin
  v_auth := public.admin_internal_authorize();
  if not coalesce((v_auth ->> 'ok')::boolean, false) then
    return public.admin_internal_deny(
      'content/preview', v_auth ->> 'code',
      'admin_preview_content_draft', 'content_draft',
      case when (v_auth ->> 'principal_id') is null then 'unknown'
        else 'admin' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null,
      (v_auth ->> 'auth_session_id')::uuid, null, null, null
    );
  end if;
  select draft.* into v_draft from public.content_drafts as draft
  where draft.id = p_draft_id;
  if v_draft.id is null
     or v_draft.revision is distinct from p_expected_revision then
    return public.admin_internal_deny(
      'content/preview', 'CONTENT_DRAFT_CONFLICT',
      'admin_preview_content_draft', 'content_draft', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;
  v_issues := content_private.validate_draft(v_draft);
  if jsonb_array_length(v_issues) > 0 then
    return public.admin_internal_deny(
      'content/preview', 'CONTENT_VALIDATION_FAILED',
      'admin_preview_content_draft', 'content_draft', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;
  if v_draft.entity_type = 'question' then
    v_projection := jsonb_build_object(
      'entity_type', 'question', 'stable_code', v_draft.stable_code,
      'question_type', 'single_choice',
      'prompt', v_draft.payload ->> 'prompt',
      'duration_seconds', (v_draft.payload ->> 'duration_seconds')::integer,
      'options', (
        select jsonb_agg(jsonb_build_object(
          'key', option ->> 'key', 'text', option ->> 'text'
        ) order by option ->> 'key')
        from jsonb_array_elements(v_draft.payload -> 'options') as option
      )
    );
  elsif v_draft.entity_type = 'review_card' then
    v_projection := jsonb_build_object(
      'entity_type', 'review_card', 'stable_code', v_draft.stable_code,
      'group_label', coalesce(v_draft.payload ->> 'group_label', ''),
      'title', v_draft.payload ->> 'title',
      'content', v_draft.payload ->> 'content',
      'media', coalesce((
        select jsonb_agg(jsonb_build_object(
          'alt_text', media ->> 'alt_text',
          'sort_order', (media ->> 'sort_order')::integer
        ) order by (media ->> 'sort_order')::integer)
        from jsonb_array_elements(
          coalesce(v_draft.payload -> 'media', '[]'::jsonb)
        ) as media
      ), '[]'::jsonb)
    );
  else
    return public.admin_internal_deny(
      'content/preview', 'CONTENT_SCOPE_INVALID',
      'admin_preview_content_draft', 'content_draft', 'admin',
      (v_auth ->> 'principal_id')::uuid,
      (v_auth ->> 'session_id')::uuid,
      (v_auth ->> 'auth_session_id')::uuid, null, null,
      (v_auth ->> 'mfa_age_seconds')::integer
    );
  end if;
  return jsonb_build_object(
    'outcome', 'ok', 'request_id', v_request_id,
    'draft_id', v_draft.id, 'revision', v_draft.revision,
    'projection', v_projection
  );
end;
$$;

revoke execute on function content_private.json_uuid(jsonb, text)
  from public, anon, authenticated;
revoke execute on function content_private.issue(text, text, text, text)
  from public, anon, authenticated;
revoke execute on function content_private.validate_draft(
  public.content_drafts
) from public, anon, authenticated;
revoke execute on function public.admin_validate_content_draft(uuid, integer)
  from public, anon;
grant execute on function public.admin_validate_content_draft(uuid, integer)
  to authenticated;
revoke execute on function public.admin_preview_content_draft(uuid, integer)
  from public, anon;
grant execute on function public.admin_preview_content_draft(uuid, integer)
  to authenticated;
