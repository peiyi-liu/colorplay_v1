create function public.activate_course_sequential(p_course_id uuid)
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
  select course.status into course_status
  from public.courses course
  where course.id = p_course_id;

  if course_status is null then
    raise exception using
      errcode = 'P0001',
      message = 'SEQUENTIAL_CONTENT_NOT_READY',
      detail = '[{"chapter_code":"course","code":"COURSE_NOT_FOUND"}]';
  end if;

  insert into public.course_progression_settings (course_id)
  values (p_course_id)
  on conflict (course_id) do nothing;

  perform 1
  from public.course_progression_settings setting
  where setting.course_id = p_course_id
  for update;

  if course_status <> 'published' then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'chapter_code', 'course',
      'code', 'COURSE_UNPUBLISHED'
    ));
  end if;

  select count(*)::integer into chapter_count
  from public.chapters chapter
  where chapter.course_id = p_course_id
    and chapter.status = 'published';

  if chapter_count <> 6 then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'chapter_code', 'course',
      'code', 'CHAPTER_COUNT_INVALID',
      'actual', chapter_count,
      'required', 6
    ));
  end if;

  for chapter_number in 1..6 loop
    expected_code := 'chapter-' || chapter_number::text;
    expected_title := case chapter_number
      when 1 then '認識色彩'
      when 2 then '色彩呈現'
      when 3 then '色彩表示'
      when 4 then '色彩感知'
      when 5 then '色彩認知'
      when 6 then '色彩應用'
    end;

    chapter_record := null;
    select chapter.* into chapter_record
    from public.chapters chapter
    where chapter.course_id = p_course_id
      and chapter.stable_code = expected_code;

    if chapter_record.id is null then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code,
        'code', 'CHAPTER_MISSING'
      ));
      continue;
    end if;

    if chapter_record.status <> 'published'
      or chapter_record.sort_order <> chapter_number then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code,
        'code', 'CHAPTER_IDENTITY_INVALID',
        'actual_sort_order', chapter_record.sort_order,
        'expected_sort_order', chapter_number,
        'status', chapter_record.status
      ));
    end if;

    if btrim(chapter_record.title) <> expected_title then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code,
        'code', 'CHAPTER_TITLE_INVALID',
        'expected_title', expected_title
      ));
    end if;

    if btrim(chapter_record.description) = '' then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code,
        'code', 'CHAPTER_DESCRIPTION_MISSING'
      ));
    end if;

    select
      count(*)::integer,
      max(template.question_count)::integer
    into published_template_count, required_question_count
    from public.quiz_templates template
    where template.chapter_id = chapter_record.id
      and template.status = 'published';

    if published_template_count <> 1 then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code,
        'code', 'PUBLISHED_TEMPLATE_COUNT_INVALID',
        'actual', published_template_count,
        'required', 1
      ));
    else
      select count(*)::integer into published_question_count
      from public.questions question
      join public.subtopics subtopic on subtopic.id = question.subtopic_id
      join public.sections section on section.id = subtopic.section_id
      where section.chapter_id = chapter_record.id
        and section.status = 'published'
        and subtopic.status = 'published'
        and question.status = 'published';

      if published_question_count < required_question_count then
        issues := issues || jsonb_build_array(jsonb_build_object(
          'chapter_code', expected_code,
          'code', 'QUESTION_COUNT_INSUFFICIENT',
          'actual', published_question_count,
          'required', required_question_count
        ));
      end if;
    end if;

    select count(*)::integer into published_review_count
    from public.review_cards card
    join public.subtopics subtopic on subtopic.id = card.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    where section.chapter_id = chapter_record.id
      and section.status = 'published'
      and subtopic.status = 'published'
      and card.status = 'published';

    if published_review_count < 1 then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'chapter_code', expected_code,
        'code', 'REVIEW_CARDS_MISSING',
        'actual', published_review_count,
        'required', 1
      ));
    end if;
  end loop;

  if jsonb_array_length(issues) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SEQUENTIAL_CONTENT_NOT_READY',
      detail = issues::text;
  end if;

  with ordered_chapters as (
    select
      chapter.id as source_chapter_id,
      lead(chapter.id) over (order by chapter.sort_order) as next_chapter_id
    from public.chapters chapter
    where chapter.course_id = p_course_id
      and chapter.status = 'published'
  ), completed_prerequisites as (
    select
      profile.id as user_id,
      ordered.source_chapter_id,
      ordered.next_chapter_id
    from public.profiles profile
    cross join ordered_chapters ordered
    cross join lateral public.student_chapter_completion(
      profile.id,
      ordered.source_chapter_id
    ) completion
    where profile.role = 'student'
      and ordered.next_chapter_id is not null
      and completion.is_complete
  )
  insert into public.student_chapter_unlocks (
    user_id,
    chapter_id,
    source_chapter_id,
    rules_version
  )
  select
    completed.user_id,
    completed.next_chapter_id,
    completed.source_chapter_id,
    '2026-08-sequence-1'
  from completed_prerequisites completed
  on conflict (user_id, chapter_id) do nothing;

  get diagnostics backfilled_unlock_count = row_count;

  update public.course_progression_settings
  set mode = 'sequential',
      rules_version = '2026-08-sequence-1',
      updated_at = clock_timestamp()
  where course_id = p_course_id;

  return jsonb_build_object(
    'course_id', p_course_id,
    'mode', 'sequential',
    'rules_version', '2026-08-sequence-1',
    'chapter_count', 6,
    'backfilled_unlock_count', backfilled_unlock_count
  );
end;
$$;

create function public.reopen_course_progression(p_course_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  progression_record public.course_progression_settings%rowtype;
begin
  update public.course_progression_settings
  set mode = 'open',
      updated_at = clock_timestamp()
  where course_id = p_course_id
  returning * into progression_record;

  if progression_record.course_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'COURSE_PROGRESSION_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'course_id', progression_record.course_id,
    'mode', progression_record.mode,
    'rules_version', progression_record.rules_version
  );
end;
$$;

revoke all on function public.activate_course_sequential(uuid)
from public, anon, authenticated;
revoke all on function public.reopen_course_progression(uuid)
from public, anon, authenticated;
