-- Canonical current assessment selector. Runtime Quiz, mastery, Live, and
-- progress projections read the published assessment bank instead of the
-- legacy question.bank_kind shadow. Frozen session rows remain unchanged.

create view content_private.current_assessment_questions as
select question.id, question.stable_code, question.version, question.prompt,
  question.explanation, question.duration_seconds, question.subtopic_id,
  bank.id as bank_id, bank.version as bank_version,
  case bank.kind when 'QB' then 'section' when 'CR' then 'chapter'
    else 'live' end as bank_kind,
  bank.kind, bank.selection_settings,
  subtopic.id as current_subtopic_id, section.id as section_id,
  chapter.id as chapter_id
from public.questions question
join public.assessment_banks bank on bank.id = question.bank_id
join public.subtopics subtopic on subtopic.id = question.subtopic_id
join public.sections section on section.id = subtopic.section_id
join public.chapters chapter on chapter.id = section.chapter_id
join public.courses course on course.id = chapter.course_id
where question.status = 'published' and bank.status = 'published'
  and subtopic.status = 'published' and section.status = 'published'
  and chapter.status = 'published' and course.status = 'published'
  and (
    (bank.kind in ('QB', 'LT') and bank.section_id = section.id)
    or (bank.kind = 'CR' and bank.chapter_id = chapter.id)
  );

revoke all on content_private.current_assessment_questions
from public, anon, authenticated;

create or replace function public.chapter_content_is_available(p_chapter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.chapters chapter
    join public.courses course on course.id = chapter.course_id
    join public.quiz_templates template
      on template.chapter_id = chapter.id and template.section_id is null
    where chapter.id = p_chapter_id
      and course.status = 'published' and chapter.status = 'published'
      and template.status = 'published'
      and (select count(*) from content_private.current_assessment_questions q
        where q.chapter_id = chapter.id and q.kind = 'CR')
        >= template.question_count
      and exists (
        select 1 from public.review_cards card
        join public.subtopics subtopic on subtopic.id = card.subtopic_id
        join public.sections section on section.id = subtopic.section_id
        where section.chapter_id = chapter.id
          and section.status = 'published'
          and subtopic.status = 'published'
          and card.status = 'published'
      )
  )
$$;

create or replace function public.create_quiz_session(
  template_id uuid,
  client_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_session_id uuid;
  new_session_id uuid;
  template_record record;
  inserted_question_count integer;
  session_started_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if template_id is null or client_request_id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_INVALID_REQUEST';
  end if;
  select session.id into existing_session_id
  from public.quiz_sessions session
  where session.user_id = current_user_id
    and session.client_request_id = create_quiz_session.client_request_id;
  if existing_session_id is not null then
    return public.build_quiz_session_payload(existing_session_id);
  end if;
  select template.id, template.question_count, template.section_id,
    chapter.id as chapter_id, chapter.title as chapter_title
  into template_record
  from public.quiz_templates template
  join public.chapters chapter on chapter.id = template.chapter_id
  join public.courses course on course.id = chapter.course_id
  where template.id = create_quiz_session.template_id
    and template.status = 'published' and chapter.status = 'published'
    and course.status = 'published';
  if template_record.id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_TEMPLATE_NOT_FOUND';
  end if;
  perform public.assert_student_chapter_access(template_record.chapter_id);
  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count,
    started_at
  ) values (
    current_user_id, template_record.id,
    create_quiz_session.client_request_id, template_record.chapter_title, 1,
    session_started_at
  ) on conflict on constraint quiz_sessions_user_client_request_unique
  do nothing returning id into new_session_id;
  if new_session_id is null then
    select session.id into existing_session_id
    from public.quiz_sessions session
    where session.user_id = current_user_id
      and session.client_request_id = create_quiz_session.client_request_id;
    return public.build_quiz_session_payload(existing_session_id);
  end if;
  with question_candidates as (
    select question.id, question.stable_code, question.version,
      question.prompt, question.explanation, question.duration_seconds,
      random() as random_order
    from content_private.current_assessment_questions question
    where (template_record.section_id is null
        and question.kind = 'CR'
        and question.chapter_id = template_record.chapter_id)
      or (template_record.section_id is not null
        and question.kind = 'QB'
        and question.section_id = template_record.section_id)
  ), selected_questions as (
    select * from question_candidates
    order by random_order limit template_record.question_count
  ), randomized_questions as (
    select selected_questions.*,
      row_number() over (order by random_order)::integer as position
    from selected_questions
  ), question_payloads as (
    select selected.id, selected.stable_code, selected.version,
      selected.prompt, selected.explanation, selected.duration_seconds,
      selected.position,
      jsonb_agg(jsonb_build_object(
        'id', option.id, 'key', option.option_key, 'text', option.option_text,
        'sort_order', option.sort_order
      ) order by option.sort_order) as options,
      (array_agg(option.id order by option.sort_order)
        filter (where option.is_correct))[1] as correct_option_id
    from randomized_questions selected
    join public.question_options option on option.question_id = selected.id
    group by selected.id, selected.stable_code, selected.version,
      selected.prompt, selected.explanation, selected.duration_seconds,
      selected.position
  )
  insert into public.quiz_session_questions (
    session_id, question_id, position, question_stable_code, question_version,
    prompt, explanation, frozen_options, correct_option_id, started_at,
    deadline_at
  )
  select new_session_id, payload.id, payload.position, payload.stable_code,
    payload.version, payload.prompt, payload.explanation, payload.options,
    payload.correct_option_id,
    case when payload.position = 1 then session_started_at end,
    case when payload.position = 1 then session_started_at
      + make_interval(secs => payload.duration_seconds) end
  from question_payloads payload;
  get diagnostics inserted_question_count = row_count;
  if inserted_question_count = 0 then
    raise exception using errcode = 'P0001',
      message = 'QUIZ_TEMPLATE_HAS_NO_QUESTIONS';
  end if;
  update public.quiz_sessions set question_count = inserted_question_count
  where id = new_session_id;
  return public.build_quiz_session_payload(new_session_id);
end;
$$;

create or replace function public.start_mastery_session(p_chapter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  existing_id uuid;
  selected_ids uuid[];
  selected_versions integer[];
  new_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  perform 1 from public.chapters
  where id = p_chapter_id and status = 'published';
  if not found then
    raise exception using errcode = 'P0001', message = 'MASTERY_CHAPTER_NOT_FOUND';
  end if;
  perform public.assert_student_chapter_access(p_chapter_id);
  select id into existing_id from public.mastery_sessions
  where user_id = actor_id and chapter_id = p_chapter_id
    and status = 'in_progress';
  if existing_id is not null then return existing_id; end if;
  select array_agg(picked.id order by picked.stable_code),
    array_agg(picked.version order by picked.stable_code)
  into selected_ids, selected_versions
  from (
    select question.id, question.stable_code, question.version
    from content_private.current_assessment_questions question
    where question.chapter_id = p_chapter_id and question.kind = 'QB'
    order by question.stable_code limit 5
  ) picked;
  if selected_ids is null then
    raise exception using errcode = 'P0001', message = 'MASTERY_NO_QUESTIONS';
  end if;
  insert into public.mastery_sessions (
    user_id, chapter_id, question_ids, question_versions
  ) values (actor_id, p_chapter_id, selected_ids, selected_versions)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.start_live_session(
  p_session_id uuid,
  p_expected_version integer
) returns jsonb
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
  join public.profiles profile on profile.id = current_user_id
    and profile.role = 'teacher'
  join public.classrooms classroom on classroom.id = live_session.classroom_id
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
    raise exception using errcode = 'P0001',
      message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;
  select activity.* into activity_record from public.live_activities activity
  where activity.id = session_record.live_activity_id;
  select template.chapter_id, template.section_id into template_record
  from public.quiz_templates template
  where template.id = activity_record.quiz_template_id;
  if template_record.section_id is null or activity_record.section_id is null
     or template_record.section_id is distinct from activity_record.section_id
  then
    raise exception using errcode = 'P0001', message = 'LIVE_SECTION_NOT_FOUND';
  end if;
  with question_candidates as (
    select question.id, question.stable_code, question.version,
      question.prompt, question.explanation,
      (select jsonb_agg(jsonb_build_object(
        'id', option.id, 'key', option.option_key,
        'text', option.option_text, 'sort_order', option.sort_order
      ) order by option.sort_order)
      from public.question_options option
      where option.question_id = question.id) as public_options,
      (select option.id from public.question_options option
        where option.question_id = question.id and option.is_correct)
        as correct_option_id,
      random() as random_order
    from content_private.current_assessment_questions question
    where question.chapter_id = template_record.chapter_id
      and question.section_id = activity_record.section_id
      and question.kind = 'LT'
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
    raise exception using errcode = 'P0001',
      message = 'LIVE_TEMPLATE_HAS_NO_QUESTIONS';
  end if;
  update public.live_sessions set state = 'lobby',
    question_count = frozen_count, state_version = state_version + 1,
    opened_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = session_record.id returning * into session_record;
  payload := jsonb_build_object(
    'session_id', session_record.id, 'state', session_record.state,
    'state_version', session_record.state_version,
    'question_count', session_record.question_count);
  perform public.live_broadcast(session_record.id, payload);
  return payload;
end;
$$;

create or replace function public.learning_progress_for(
  p_user_id uuid,
  p_chapter_id uuid default null
) returns table (
  scope text, chapter_id uuid, subtopic_id uuid, review_completed integer,
  review_total integer, coverage numeric, accuracy numeric, mastery numeric,
  status text, rules_version text, question_total integer,
  question_answered integer, question_correct integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with current_questions as (
    select question.id, question.version, question.bank_kind,
      question.current_subtopic_id as subtopic_id, question.chapter_id
    from content_private.current_assessment_questions question
    where question.kind in ('QB', 'CR')
      and (p_chapter_id is null or question.chapter_id = p_chapter_id)
  ), latest_answers as (
    select distinct on (current.id)
      current.id as question_id, current.bank_kind,
      current.subtopic_id, current.chapter_id, answer.answer_status
    from current_questions current
    join public.quiz_session_questions session_question
      on session_question.question_id = current.id
      and session_question.question_version = current.version
    join public.quiz_answers answer
      on answer.session_question_id = session_question.id
    join public.quiz_sessions session on session.id = session_question.session_id
    where session.user_id = p_user_id and session.status = 'completed'
      and session.purpose in ('practice', 'assignment', 'remediation')
    order by current.id, answer.answered_at desc
  ), review_counts as (
    select review.subtopic_id, review.chapter_id,
      review.completed_count, review.total_count
    from public.review_completion_for(p_user_id, p_chapter_id) review
  ), subtopic_question_counts as (
    select current.subtopic_id, current.chapter_id,
      count(current.id)::integer as total,
      count(answer.question_id)::integer as answered,
      count(answer.question_id) filter (
        where answer.answer_status = 'correct')::integer as correct
    from current_questions current
    left join latest_answers answer on answer.question_id = current.id
    where current.bank_kind = 'section'
    group by current.subtopic_id, current.chapter_id
  ), subtopic_rows as (
    select 'subtopic'::text as scope, review.chapter_id,
      review.subtopic_id, coalesce(review.completed_count, 0) as review_completed,
      nullif(coalesce(review.total_count, 0), 0) as review_total,
      coalesce(question.total, 0) as total,
      coalesce(question.answered, 0) as answered,
      coalesce(question.correct, 0) as correct
    from review_counts review
    left join subtopic_question_counts question
      on question.subtopic_id = review.subtopic_id
  ), chapter_review_counts as (
    select review.chapter_id,
      sum(review.completed_count)::integer as completed_count,
      nullif(sum(review.total_count), 0)::integer as total_count
    from review_counts review group by review.chapter_id
  ), chapter_question_counts as (
    select current.chapter_id, count(current.id)::integer as total,
      count(answer.question_id)::integer as answered,
      count(answer.question_id) filter (
        where answer.answer_status = 'correct')::integer as correct
    from current_questions current
    left join latest_answers answer on answer.question_id = current.id
    where current.bank_kind = 'chapter' group by current.chapter_id
  ), chapter_rows as (
    select 'chapter'::text as scope, review.chapter_id,
      null::uuid as subtopic_id, review.completed_count as review_completed,
      review.total_count as review_total, coalesce(question.total, 0) as total,
      coalesce(question.answered, 0) as answered,
      coalesce(question.correct, 0) as correct
    from chapter_review_counts review
    left join chapter_question_counts question
      on question.chapter_id = review.chapter_id
  ), combined as (
    select * from subtopic_rows union all select * from chapter_rows
  )
  select combined.scope, combined.chapter_id, combined.subtopic_id,
    combined.review_completed, combined.review_total,
    case when combined.total > 0
      then round(combined.answered * 100.0 / combined.total, 1) end,
    case when combined.answered > 0
      then round(combined.correct * 100.0 / combined.answered, 1) end,
    case when combined.total > 0
      then round(combined.correct * 100.0 / combined.total, 1) end,
    case when combined.answered = 0 then 'not_started'
      when combined.correct * 100.0 / combined.total >= 80 then 'mastered'
      when combined.correct * 100.0 / combined.total >= 60 then 'developing'
      else 'learning' end,
    '2026-07-progress-1'::text,
    combined.total, combined.answered, combined.correct
  from combined where p_user_id is not null
$$;

create or replace function public.get_learning_progress(
  p_chapter_id uuid default null
) returns table (
  scope text, chapter_id uuid, subtopic_id uuid, review_completed integer,
  review_total integer, coverage numeric, accuracy numeric, mastery numeric,
  status text, rules_version text
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select progress.scope, progress.chapter_id, progress.subtopic_id,
    progress.review_completed, progress.review_total, progress.coverage,
    progress.accuracy, progress.mastery, progress.status,
    progress.rules_version
  from public.learning_progress_for((select auth.uid()), p_chapter_id) progress
  where (select auth.uid()) is not null
$$;

create or replace function public.get_classroom_progress(p_classroom_id uuid)
returns table (
  user_id uuid, display_name text, chapter_id uuid, mastery numeric,
  status text, rules_version text
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with students as (
    select membership.user_id
    from public.classroom_members membership
    join public.classrooms classroom on classroom.id = membership.classroom_id
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = (select auth.uid())
      and classroom.status = 'active'
      and membership.member_role = 'student'
      and membership.status = 'active'
  )
  select student.user_id, profile.display_name, progress.chapter_id,
    progress.mastery,
    case when challenge.status in ('completed', 'mastered')
      then challenge.status else progress.status end,
    '2026-09-progression-1'::text
  from students student
  join public.profiles profile on profile.id = student.user_id
  cross join lateral public.learning_progress_for(student.user_id, null) progress
  cross join lateral public.chapter_challenge_progress_for(
    student.user_id, progress.chapter_id) challenge
  where progress.scope = 'chapter'
$$;
