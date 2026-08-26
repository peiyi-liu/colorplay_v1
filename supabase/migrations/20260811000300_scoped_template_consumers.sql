-- Consumers that need the chapter-final template must ignore the new section
-- templates, otherwise joins become ambiguous after QB templates are seeded.

create or replace function public.start_remediation_session(
  p_subtopic_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_session record;
  template_record record;
  subtopic_chapter_id uuid;
  new_session_id uuid;
  frozen_count integer;
  session_started_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'REMEDIATION_INVALID_REQUEST';
  end if;
  select session.id, session.purpose into existing_session
  from public.quiz_sessions session
  where session.user_id = current_user_id
    and session.client_request_id = p_request_id;
  if existing_session.id is not null then
    if existing_session.purpose <> 'remediation' then
      raise exception using errcode = 'P0001', message = 'REMEDIATION_INVALID_REQUEST';
    end if;
    return public.build_quiz_session_payload(existing_session.id);
  end if;

  select chapter.id into subtopic_chapter_id
  from public.subtopics subtopic
  join public.sections section on section.id = subtopic.section_id
  join public.chapters chapter on chapter.id = section.chapter_id
  join public.courses course on course.id = chapter.course_id
  where subtopic.id = p_subtopic_id
    and subtopic.status = 'published' and section.status = 'published'
    and chapter.status = 'published' and course.status = 'published';
  if subtopic_chapter_id is not null then
    perform public.assert_student_chapter_access(subtopic_chapter_id);
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(p_subtopic_id::text || current_user_id::text, 43)
  );

  select least(count(*), 10)::integer into frozen_count
  from public.mistake_items item
  join public.questions question on question.id = item.question_id
  join public.subtopics subtopic on subtopic.id = question.subtopic_id
  join public.sections section on section.id = subtopic.section_id
  join public.chapters chapter on chapter.id = section.chapter_id
  join public.courses course on course.id = chapter.course_id
  where item.user_id = current_user_id
    and item.status in ('open', 'reopened')
    and subtopic.id = p_subtopic_id and question.status = 'published'
    and subtopic.status = 'published' and section.status = 'published'
    and chapter.status = 'published' and course.status = 'published';
  if frozen_count = 0 then
    raise exception using errcode = 'P0001', message = 'REMEDIATION_NOTHING_OPEN';
  end if;

  select template.id, chapter.title as chapter_title into template_record
  from public.subtopics subtopic
  join public.sections section on section.id = subtopic.section_id
  join public.chapters chapter on chapter.id = section.chapter_id
  join public.quiz_templates template
    on template.chapter_id = chapter.id and template.section_id is null
  where subtopic.id = p_subtopic_id and template.status = 'published';
  if template_record.id is null then
    raise exception using errcode = 'P0001', message = 'REMEDIATION_UNAVAILABLE';
  end if;

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count,
    purpose, game_rules_version, started_at
  ) values (
    current_user_id, template_record.id, p_request_id,
    template_record.chapter_title, frozen_count, 'remediation',
    '2026-07-progress-1', session_started_at
  ) returning id into new_session_id;

  insert into public.quiz_session_questions (
    session_id, question_id, position, question_stable_code, question_version,
    prompt, explanation, frozen_options, correct_option_id, started_at,
    deadline_at
  )
  with remediation_targets as (
    select question.id as question_id, question.stable_code,
      question.version, question.prompt, question.explanation,
      row_number() over (
        order by item.first_wrong_at, question.stable_code
      )::integer as position
    from public.mistake_items item
    join public.questions question on question.id = item.question_id
    join public.subtopics subtopic on subtopic.id = question.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    join public.chapters chapter on chapter.id = section.chapter_id
    join public.courses course on course.id = chapter.course_id
    where item.user_id = current_user_id
      and item.status in ('open', 'reopened')
      and subtopic.id = p_subtopic_id and question.status = 'published'
      and subtopic.status = 'published' and section.status = 'published'
      and chapter.status = 'published' and course.status = 'published'
    order by item.first_wrong_at, question.stable_code limit 10
  )
  select new_session_id, target.question_id, target.position,
    target.stable_code, target.version, target.prompt, target.explanation,
    (
      select jsonb_agg(jsonb_build_object(
        'id', option.id, 'key', option.option_key, 'text', option.option_text,
        'sort_order', option.sort_order
      ) order by option.sort_order)
      from public.question_options option
      where option.question_id = target.question_id
    ),
    (
      select option.id from public.question_options option
      where option.question_id = target.question_id and option.is_correct
    ),
    case when target.position = 1 then session_started_at end,
    case when target.position = 1
      then session_started_at + interval '20 seconds' end
  from remediation_targets target;
  return public.build_quiz_session_payload(new_session_id);
end;
$$;

create or replace function public.activate_course_sequential(p_course_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  backfilled_unlock_count integer := 0;
  chapter_count integer := 0;
  chapter_record record;
  course_status public.content_status;
  expected_code text;
  expected_title text;
  issues jsonb := '[]'::jsonb;
  published_question_count integer;
  published_review_count integer;
  published_template_count integer;
  required_question_count integer;
begin
  select course.status into course_status from public.courses course
  where course.id = p_course_id;
  if course_status is null then
    raise exception using errcode = 'P0001',
      message = 'SEQUENTIAL_CONTENT_NOT_READY',
      detail = '[{"chapter_code":"course","code":"COURSE_NOT_FOUND"}]';
  end if;
  insert into public.course_progression_settings (course_id)
  values (p_course_id) on conflict (course_id) do nothing;
  perform 1 from public.course_progression_settings setting
  where setting.course_id = p_course_id for update;
  if course_status <> 'published' then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'chapter_code', 'course', 'code', 'COURSE_UNPUBLISHED'));
  end if;
  select count(*)::integer into chapter_count from public.chapters chapter
  where chapter.course_id = p_course_id and chapter.status = 'published';
  if chapter_count <> 6 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'chapter_code', 'course', 'code', 'CHAPTER_COUNT_INVALID',
      'actual', chapter_count, 'required', 6));
  end if;

  for chapter_number in 1..6 loop
    expected_code := 'chapter-' || chapter_number::text;
    expected_title := case chapter_number
      when 1 then '認識色彩' when 2 then '色彩呈現'
      when 3 then '色彩表示' when 4 then '色彩感知'
      when 5 then '色彩認知' when 6 then '色彩應用' end;
    chapter_record := null;
    select chapter.* into chapter_record from public.chapters chapter
    where chapter.course_id = p_course_id
      and chapter.stable_code = expected_code;
    if chapter_record.id is null then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code, 'code', 'CHAPTER_MISSING'));
      continue;
    end if;
    if chapter_record.status <> 'published'
      or chapter_record.sort_order <> chapter_number then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code, 'code', 'CHAPTER_IDENTITY_INVALID',
        'actual_sort_order', chapter_record.sort_order,
        'expected_sort_order', chapter_number,
        'status', chapter_record.status));
    end if;
    if btrim(chapter_record.title) <> expected_title then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code, 'code', 'CHAPTER_TITLE_INVALID',
        'expected_title', expected_title));
    end if;
    if btrim(chapter_record.description) = '' then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code,
        'code', 'CHAPTER_DESCRIPTION_MISSING'));
    end if;

    select count(*)::integer, max(template.question_count)::integer
    into published_template_count, required_question_count
    from public.quiz_templates template
    where template.chapter_id = chapter_record.id
      and template.section_id is null and template.status = 'published';
    if published_template_count <> 1 then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code,
        'code', 'PUBLISHED_TEMPLATE_COUNT_INVALID',
        'actual', published_template_count, 'required', 1));
    else
      select count(*)::integer into published_question_count
      from public.questions question
      join public.subtopics subtopic on subtopic.id = question.subtopic_id
      join public.sections section on section.id = subtopic.section_id
      where section.chapter_id = chapter_record.id
        and section.status = 'published' and subtopic.status = 'published'
        and question.status = 'published'
        and question.bank_kind = 'chapter';
      if published_question_count < required_question_count then
        issues := issues || jsonb_build_array(jsonb_build_object(
          'chapter_code', expected_code, 'code', 'QUESTION_COUNT_INSUFFICIENT',
          'actual', published_question_count,
          'required', required_question_count));
      end if;
    end if;

    select count(*)::integer into published_review_count
    from public.review_cards card
    join public.subtopics subtopic on subtopic.id = card.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    where section.chapter_id = chapter_record.id
      and section.status = 'published' and subtopic.status = 'published'
      and card.status = 'published';
    if published_review_count < 1 then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code, 'code', 'REVIEW_CARDS_MISSING',
        'actual', published_review_count, 'required', 1));
    end if;
  end loop;
  if jsonb_array_length(issues) > 0 then
    raise exception using errcode = 'P0001',
      message = 'SEQUENTIAL_CONTENT_NOT_READY', detail = issues::text;
  end if;

  with ordered_chapters as (
    select chapter.id as source_chapter_id,
      lead(chapter.id) over (order by chapter.sort_order) as next_chapter_id
    from public.chapters chapter
    where chapter.course_id = p_course_id and chapter.status = 'published'
  ), completed_prerequisites as (
    select profile.id as user_id, ordered.source_chapter_id,
      ordered.next_chapter_id
    from public.profiles profile cross join ordered_chapters ordered
    cross join lateral public.student_chapter_completion(
      profile.id, ordered.source_chapter_id
    ) completion
    where profile.role = 'student' and ordered.next_chapter_id is not null
      and completion.is_complete
  )
  insert into public.student_chapter_unlocks (
    user_id, chapter_id, source_chapter_id, rules_version
  )
  select completed.user_id, completed.next_chapter_id,
    completed.source_chapter_id, '2026-08-sequence-1'
  from completed_prerequisites completed
  on conflict (user_id, chapter_id) do nothing;
  get diagnostics backfilled_unlock_count = row_count;
  update public.course_progression_settings
  set mode = 'sequential', rules_version = '2026-08-sequence-1',
      updated_at = clock_timestamp()
  where course_id = p_course_id;
  return jsonb_build_object(
    'course_id', p_course_id, 'mode', 'sequential',
    'rules_version', '2026-08-sequence-1', 'chapter_count', 6,
    'backfilled_unlock_count', backfilled_unlock_count);
end;
$$;
