-- Mastery is remediation/practice within the lesson loop, so it samples only
-- QB section questions. CR remains exclusive to the chapter-final challenge.
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

  perform 1
  from public.chapters
  where id = p_chapter_id and status = 'published';
  if not found then
    raise exception using errcode = 'P0001', message = 'MASTERY_CHAPTER_NOT_FOUND';
  end if;

  perform public.assert_student_chapter_access(p_chapter_id);

  select id into existing_id
  from public.mastery_sessions
  where user_id = actor_id
    and chapter_id = p_chapter_id
    and status = 'in_progress';
  if existing_id is not null then return existing_id; end if;

  select
    array_agg(picked.id order by picked.stable_code),
    array_agg(picked.version order by picked.stable_code)
  into selected_ids, selected_versions
  from (
    select question.id, question.stable_code, question.version
    from public.questions question
    join public.subtopics subtopic on subtopic.id = question.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    where section.chapter_id = p_chapter_id
      and section.status = 'published'
      and subtopic.status = 'published'
      and question.status = 'published'
      and question.bank_kind = 'section'
    order by question.stable_code
    limit 5
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

-- Subtopic mastery follows QB practice; chapter mastery follows the CR final
-- challenge. Review completion remains sourced from RC cards.

create or replace function public.learning_progress_for(
  p_user_id uuid,
  p_chapter_id uuid default null
)
returns table (
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
      subtopic.id as subtopic_id, chapter.id as chapter_id
    from public.questions question
    join public.subtopics subtopic on subtopic.id = question.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    join public.chapters chapter on chapter.id = section.chapter_id
    join public.courses course on course.id = chapter.course_id
    where question.status = 'published'
      and question.bank_kind in ('section', 'chapter')
      and subtopic.status = 'published' and section.status = 'published'
      and chapter.status = 'published' and course.status = 'published'
      and (p_chapter_id is null or chapter.id = p_chapter_id)
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
    join public.quiz_sessions session
      on session.id = session_question.session_id
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
        where answer.answer_status = 'correct'
      )::integer as correct
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
        where answer.answer_status = 'correct'
      )::integer as correct
    from current_questions current
    left join latest_answers answer on answer.question_id = current.id
    where current.bank_kind = 'chapter'
    group by current.chapter_id
  ), chapter_rows as (
    select 'chapter'::text as scope, review.chapter_id,
      null::uuid as subtopic_id, review.completed_count as review_completed,
      review.total_count as review_total,
      coalesce(question.total, 0) as total,
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
)
returns table (
  scope text,
  chapter_id uuid,
  subtopic_id uuid,
  review_completed integer,
  review_total integer,
  coverage numeric,
  accuracy numeric,
  mastery numeric,
  status text,
  rules_version text
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with current_questions as (
    select question.id, question.version, question.bank_kind,
      subtopic.id as subtopic_id, chapter.id as chapter_id
    from public.questions question
    join public.subtopics subtopic on subtopic.id = question.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    join public.chapters chapter on chapter.id = section.chapter_id
    join public.courses course on course.id = chapter.course_id
    where question.status = 'published'
      and question.bank_kind in ('section', 'chapter')
      and subtopic.status = 'published' and section.status = 'published'
      and chapter.status = 'published' and course.status = 'published'
      and (p_chapter_id is null or chapter.id = p_chapter_id)
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
    join public.quiz_sessions session
      on session.id = session_question.session_id
    where session.user_id = (select auth.uid())
      and session.status = 'completed'
      and session.purpose in ('practice', 'assignment', 'remediation')
    order by current.id, answer.answered_at desc
  ), review_counts as (
    select review.subtopic_id, review.chapter_id,
      review.completed_count, review.total_count
    from public.get_review_completion(p_chapter_id) review
  ), subtopic_question_counts as (
    select current.subtopic_id, current.chapter_id,
      count(current.id)::integer as total,
      count(answer.question_id)::integer as answered,
      count(answer.question_id) filter (
        where answer.answer_status = 'correct'
      )::integer as correct
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
        where answer.answer_status = 'correct'
      )::integer as correct
    from current_questions current
    left join latest_answers answer on answer.question_id = current.id
    where current.bank_kind = 'chapter'
    group by current.chapter_id
  ), chapter_rows as (
    select 'chapter'::text as scope, review.chapter_id,
      null::uuid as subtopic_id, review.completed_count as review_completed,
      review.total_count as review_total,
      coalesce(question.total, 0) as total,
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
    '2026-07-progress-1'::text
  from combined
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
  with owned as (
    select classroom.id from public.classrooms classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = (select auth.uid())
      and classroom.status = 'active'
  ), students as (
    select member.user_id from public.classroom_members member
    join owned on owned.id = member.classroom_id
    where member.member_role = 'student' and member.status = 'active'
  ), current_questions as (
    select question.id, question.version, chapter.id as chapter_id
    from public.questions question
    join public.subtopics subtopic on subtopic.id = question.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    join public.chapters chapter on chapter.id = section.chapter_id
    join public.courses course on course.id = chapter.course_id
    where question.status = 'published' and question.bank_kind = 'chapter'
      and subtopic.status = 'published' and section.status = 'published'
      and chapter.status = 'published' and course.status = 'published'
  ), latest_answers as (
    select distinct on (student.user_id, current.id)
      student.user_id, current.id as question_id, current.chapter_id,
      answer.answer_status
    from students student
    join public.quiz_sessions session on session.user_id = student.user_id
      and session.status = 'completed'
      and session.purpose in ('practice', 'assignment', 'remediation')
    join public.quiz_session_questions session_question
      on session_question.session_id = session.id
    join current_questions current on current.id = session_question.question_id
      and current.version = session_question.question_version
    join public.quiz_answers answer
      on answer.session_question_id = session_question.id
    order by student.user_id, current.id, answer.answered_at desc
  ), per_chapter as (
    select student.user_id, current.chapter_id,
      count(distinct current.id)::integer as total,
      count(answer.question_id)::integer as answered,
      count(answer.question_id) filter (
        where answer.answer_status = 'correct'
      )::integer as correct
    from students student cross join current_questions current
    left join latest_answers answer on answer.user_id = student.user_id
      and answer.question_id = current.id
    group by student.user_id, current.chapter_id
  )
  select per_chapter.user_id, profile.display_name, per_chapter.chapter_id,
    case when per_chapter.total > 0
      then round(per_chapter.correct * 100.0 / per_chapter.total, 1) end,
    case when per_chapter.answered = 0 then 'not_started'
      when per_chapter.correct * 100.0 / per_chapter.total >= 80 then 'mastered'
      when per_chapter.correct * 100.0 / per_chapter.total >= 60 then 'developing'
      else 'learning' end,
    '2026-07-progress-1'::text
  from per_chapter join public.profiles profile on profile.id = per_chapter.user_id
$$;
