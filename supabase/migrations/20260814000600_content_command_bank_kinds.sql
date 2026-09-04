-- Sheet publishing uses the same versioned teacher command path as the UI.
-- Accept the owner-approved QB/CR/LT namespaces and derive bank_kind on the
-- server so callers cannot route a stable code into the wrong assessment pool.

create or replace function public.apply_question_payload(
  p_question_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  code text := btrim(coalesce(p_payload ->> 'stable_code', ''));
  derived_bank_kind text;
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
  derived_bank_kind := case
    when code ~ '^[0-9]+-[0-9]+-[0-9]{2}$' then 'legacy'
    when code ~ '^QB[1-9][1-9][0-9]{2}$' then 'section'
    when code ~ '^CR[1-9][0-9]{3}$' then 'chapter'
    when code ~ '^LT[1-9][1-9][0-9]{2}$' then 'live'
    else null
  end;

  if derived_bank_kind is null then
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
      subtopic_id, stable_code, bank_kind, prompt, explanation, status,
      sort_order
    )
    values (
      subtopic, code, derived_bank_kind, v_prompt, v_explanation, 'draft',
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
        bank_kind = derived_bank_kind,
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
