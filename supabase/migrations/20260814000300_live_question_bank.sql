-- LT is an independent content pool. Student section Quiz continues to use QB,
-- chapter-final Quiz continues to use CR, and new Live Sessions use LT only.

alter table public.questions
drop constraint questions_bank_kind_check;

alter table public.questions
add constraint questions_bank_kind_check
check (bank_kind in ('legacy', 'section', 'chapter', 'live'));

alter table public.questions
drop constraint questions_stable_code_check;

alter table public.questions
add constraint questions_stable_code_check check (
  stable_code ~ '^[0-9]+-[0-9]+-[0-9]{2}$'
  or stable_code ~ '^QB[1-9][1-9][0-9]{2}$'
  or stable_code ~ '^CR[1-9][0-9]{3}$'
  or stable_code ~ '^LT[1-9][1-9][0-9]{2}$'
);

-- Freeze taxonomy attribution alongside every Live question. The current
-- question row may later move to another section or version, but completed
-- classroom analytics must continue to report the section presented at play
-- time. Existing hosted rows are snapshotted during this migration.
alter table public.live_session_questions
add column chapter_id uuid references public.chapters(id),
add column section_id uuid references public.sections(id),
add constraint live_session_questions_taxonomy_shape_check check (
  (chapter_id is null and section_id is null)
  or (chapter_id is not null and section_id is not null)
);

update public.live_session_questions as session_question
set chapter_id = template.chapter_id,
    section_id = activity.section_id
from public.live_sessions as session
join public.live_activities as activity
  on activity.id = session.live_activity_id
join public.quiz_templates as template
  on template.id = activity.quiz_template_id
where session_question.session_id = session.id
  and activity.section_id is not null;

update public.live_session_questions as session_question
set chapter_id = section.chapter_id,
    section_id = section.id
from public.questions as question
join public.subtopics as subtopic on subtopic.id = question.subtopic_id
join public.sections as section on section.id = subtopic.section_id
where session_question.chapter_id is null
  and session_question.question_stable_code = question.stable_code;

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
      and question.bank_kind = 'live'
  ), selected_questions as (
    select * from question_candidates
    order by random_order limit template_record.question_count
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
            and question.bank_kind = 'live'
        )
    ) option_row
  ), '[]'::jsonb);
end;
$$;
