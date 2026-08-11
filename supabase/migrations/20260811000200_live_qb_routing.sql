-- Live only accepts section templates and freezes QB questions from the
-- selected section. CR chapter-final questions are never exposed to Live.

create or replace function public.create_live_activity(
  p_title text,
  p_quiz_template_id uuid,
  p_question_time_limit_seconds integer default 20,
  p_question_display text default 'screen_only',
  p_section_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  template_record public.quiz_templates;
  activity_record public.live_activities;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id and profile.role = 'teacher'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_TEACHER_ROLE_REQUIRED';
  end if;

  select template.* into template_record
  from public.quiz_templates template
  where template.id = p_quiz_template_id and template.status = 'published';
  if template_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_TEMPLATE_NOT_FOUND';
  end if;
  if template_record.section_id is null
    or (p_section_id is not null
      and template_record.section_id is distinct from p_section_id)
    or not exists (
      select 1 from public.sections section
      where section.id = template_record.section_id
        and section.chapter_id = template_record.chapter_id
        and section.status = 'published'
    ) then
    raise exception using errcode = 'P0001', message = 'LIVE_SECTION_NOT_FOUND';
  end if;
  if coalesce(p_question_display, 'screen_only')
    not in ('screen_only', 'device') then
    raise exception using errcode = 'P0001', message = 'LIVE_INVALID_REQUEST';
  end if;

  insert into public.live_activities (
    owner_teacher_id, title, quiz_template_id, question_time_limit_seconds,
    question_display, section_id
  ) values (
    current_user_id, p_title, p_quiz_template_id,
    coalesce(p_question_time_limit_seconds, 20),
    coalesce(p_question_display, 'screen_only'), template_record.section_id
  ) returning * into activity_record;

  return jsonb_build_object(
    'activity_id', activity_record.id, 'title', activity_record.title,
    'quiz_template_id', activity_record.quiz_template_id,
    'question_time_limit_seconds',
      activity_record.question_time_limit_seconds,
    'status', activity_record.status,
    'rules_version', activity_record.rules_version,
    'question_display', activity_record.question_display,
    'section_id', activity_record.section_id
  );
end;
$$;

create or replace function public.start_live_session(
  p_session_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  activity_record public.live_activities;
  template_record record;
  frozen_count integer;
  payload jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = p_session_id
    and live_session.host_teacher_id = current_user_id
  for update;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;
  if p_expected_version is distinct from session_record.state_version then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_CONFLICT';
  end if;
  if session_record.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  select activity.* into activity_record
  from public.live_activities activity
  where activity.id = session_record.live_activity_id;
  select template.question_count, template.chapter_id, template.section_id
  into template_record
  from public.quiz_templates template
  where template.id = activity_record.quiz_template_id;
  if template_record.section_id is null
    or activity_record.section_id is null
    or template_record.section_id is distinct from activity_record.section_id then
    raise exception using errcode = 'P0001', message = 'LIVE_SECTION_NOT_FOUND';
  end if;

  with question_candidates as (
    select question.id, question.stable_code, question.version,
      question.prompt, question.explanation,
      (
        select jsonb_agg(jsonb_build_object(
          'id', option.id, 'key', option.option_key,
          'text', option.option_text, 'sort_order', option.sort_order
        ) order by option.sort_order)
        from public.question_options option
        where option.question_id = question.id
      ) as public_options,
      (
        select option.id from public.question_options option
        where option.question_id = question.id and option.is_correct
      ) as correct_option_id,
      random() as random_order
    from public.questions question
    join public.subtopics subtopic on subtopic.id = question.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    where section.chapter_id = template_record.chapter_id
      and section.id = activity_record.section_id
      and section.status = 'published'
      and subtopic.status = 'published'
      and question.status = 'published'
      and question.bank_kind = 'section'
  ), selected_questions as (
    select * from question_candidates
    order by random_order limit template_record.question_count
  )
  insert into public.live_session_questions (
    session_id, "position", question_stable_code, question_version, prompt,
    public_options, correct_option_id, explanation
  )
  select session_record.id,
    row_number() over (order by random_order)::integer,
    selected.stable_code, selected.version, selected.prompt,
    selected.public_options, selected.correct_option_id, selected.explanation
  from selected_questions selected;

  get diagnostics frozen_count = row_count;
  if frozen_count = 0 then
    raise exception using errcode = 'P0001', message = 'LIVE_TEMPLATE_HAS_NO_QUESTIONS';
  end if;
  update public.live_sessions
  set state = 'lobby', question_count = frozen_count,
      state_version = state_version + 1, opened_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = session_record.id returning * into session_record;
  payload := jsonb_build_object(
    'session_id', session_record.id, 'state', session_record.state,
    'state_version', session_record.state_version,
    'question_count', session_record.question_count
  );
  perform public.live_broadcast(session_record.id, payload);
  return payload;
end;
$$;

create or replace function public.list_live_section_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id and profile.role = 'teacher'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_TEACHER_ROLE_REQUIRED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'section_id', option_row.section_id, 'title', option_row.title,
      'quiz_template_id', option_row.quiz_template_id
    ) order by option_row.chapter_sort, option_row.section_sort)
    from (
      select section.id as section_id, section.title,
        template.id as quiz_template_id,
        chapter.sort_order as chapter_sort,
        section.sort_order as section_sort
      from public.sections section
      join public.chapters chapter on chapter.id = section.chapter_id
      join public.quiz_templates template
        on template.section_id = section.id and template.status = 'published'
      where section.status = 'published'
        and exists (
          select 1 from public.questions question
          join public.subtopics subtopic on subtopic.id = question.subtopic_id
          where subtopic.section_id = section.id
            and subtopic.status = 'published'
            and question.status = 'published'
            and question.bank_kind = 'section'
        )
    ) option_row
  ), '[]'::jsonb);
end;
$$;
