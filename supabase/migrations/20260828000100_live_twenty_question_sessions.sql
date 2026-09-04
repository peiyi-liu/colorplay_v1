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
  target_question_count constant integer := 20;
  frozen_count integer;
  payload jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  select live_session.* into session_record
  from public.live_sessions live_session
  join public.profiles profile
    on profile.id = current_user_id
    and profile.role = 'teacher'
  join public.classrooms classroom
    on classroom.id = live_session.classroom_id
    and classroom.owner_teacher_id = current_user_id
    and classroom.status = 'active'
  join public.live_activities activity
    on activity.id = live_session.live_activity_id
    and activity.owner_teacher_id = current_user_id
    and activity.status = 'active'
  where live_session.id = p_session_id
    and live_session.host_teacher_id = current_user_id
  for update of live_session;
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
  select template.chapter_id, template.section_id
  into template_record
  from public.quiz_templates template
  where template.id = activity_record.quiz_template_id;
  if template_record.section_id is null
    or activity_record.section_id is null
    or template_record.section_id is distinct from activity_record.section_id then
    raise exception using errcode = 'P0001', message = 'LIVE_SECTION_NOT_FOUND';
  end if;

  -- Live owns a 20-question target independent of the section Quiz template.
  -- frozen_count remains authoritative when a section has fewer valid LT items.
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
      and question.bank_kind = 'live'
  ), selected_questions as (
    select * from question_candidates
    order by random_order limit target_question_count
  )
  insert into public.live_session_questions (
    session_id, "position", question_stable_code, question_version, prompt,
    public_options, correct_option_id, explanation, chapter_id, section_id
  )
  select session_record.id,
    row_number() over (order by random_order)::integer,
    selected.stable_code, selected.version, selected.prompt,
    selected.public_options, selected.correct_option_id, selected.explanation,
    template_record.chapter_id, activity_record.section_id
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
