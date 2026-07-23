-- Authoritative learning progress under rules 2026-07-progress-1.
-- Per current published question version, only the caller's latest qualifying
-- answer counts (completed practice, assignment, or remediation sessions;
-- unfinished, old-version, and Live answers are excluded):
--   coverage = answered current versions / current published versions * 100
--   accuracy = latest correct versions / answered current versions * 100
--   mastery  = coverage * accuracy / 100
-- Statuses: not_started (no qualifying answer), learning (<60),
-- developing (60-79), mastered (>=80). Chapters aggregate over all current
-- published versions, never by averaging subtopic percentages. Percentages
-- are rounded to 0.1 for projection; status uses the unrounded value.

create function public.get_learning_progress(
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
    select q.id, q.version, st.id as subtopic_id, ch.id as chapter_id
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    join public.sections s on s.id = st.section_id
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where q.status = 'published'
      and st.status = 'published'
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
      and (p_chapter_id is null or ch.id = p_chapter_id)
  ),
  latest_answers as (
    select distinct on (cq.id)
      cq.id as question_id,
      cq.subtopic_id,
      cq.chapter_id,
      answer.answer_status
    from current_questions cq
    join public.quiz_session_questions sq
      on sq.question_id = cq.id and sq.question_version = cq.version
    join public.quiz_answers answer on answer.session_question_id = sq.id
    join public.quiz_sessions session on session.id = sq.session_id
    where session.user_id = (select auth.uid())
      and session.status = 'completed'
      and session.purpose in ('practice', 'assignment', 'remediation')
    order by cq.id, answer.answered_at desc
  ),
  subtopic_questions as (
    select
      cq.subtopic_id,
      cq.chapter_id,
      count(cq.id)::integer as total,
      count(la.question_id)::integer as answered,
      count(la.question_id) filter (
        where la.answer_status = 'correct'
      )::integer as correct
    from current_questions cq
    left join latest_answers la on la.question_id = cq.id
    group by cq.subtopic_id, cq.chapter_id
  ),
  review_counts as (
    select rc.subtopic_id, rc.chapter_id, rc.completed_count, rc.total_count
    from public.get_review_completion(p_chapter_id) rc
  ),
  subtopic_rows as (
    select
      'subtopic'::text as scope,
      rc.chapter_id,
      rc.subtopic_id,
      coalesce(rc.completed_count, 0) as review_completed,
      nullif(coalesce(rc.total_count, 0), 0) as review_total,
      coalesce(sq.total, 0) as total,
      coalesce(sq.answered, 0) as answered,
      coalesce(sq.correct, 0) as correct
    from review_counts rc
    left join subtopic_questions sq on sq.subtopic_id = rc.subtopic_id
  ),
  chapter_rows as (
    select
      'chapter'::text as scope,
      base.chapter_id,
      null::uuid as subtopic_id,
      sum(base.review_completed)::integer as review_completed,
      nullif(sum(coalesce(base.review_total, 0)), 0)::integer as review_total,
      sum(base.total)::integer as total,
      sum(base.answered)::integer as answered,
      sum(base.correct)::integer as correct
    from subtopic_rows base
    group by base.chapter_id
  ),
  combined as (
    select * from subtopic_rows
    union all
    select * from chapter_rows
  )
  select
    combined.scope,
    combined.chapter_id,
    combined.subtopic_id,
    combined.review_completed,
    combined.review_total,
    case when combined.total > 0
      then round(combined.answered * 100.0 / combined.total, 1)
      else null
    end as coverage,
    case when combined.answered > 0
      then round(combined.correct * 100.0 / combined.answered, 1)
      else null
    end as accuracy,
    case when combined.total > 0
      then round(combined.correct * 100.0 / combined.total, 1)
      else null
    end as mastery,
    case
      when combined.answered = 0 then 'not_started'
      when combined.correct * 100.0 / combined.total >= 80 then 'mastered'
      when combined.correct * 100.0 / combined.total >= 60 then 'developing'
      else 'learning'
    end as status,
    '2026-07-progress-1'::text as rules_version
  from combined
  where (select auth.uid()) is not null
$$;

revoke all on function public.get_learning_progress(uuid)
from public, anon;
grant execute on function public.get_learning_progress(uuid)
to authenticated;

-- The owning teacher's per-student chapter mastery summary. Non-owners read
-- zero rows; the projection carries display names, never emails or answers.
create function public.get_classroom_progress(
  p_classroom_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  chapter_id uuid,
  mastery numeric,
  status text,
  rules_version text
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with owned as (
    select classroom.id
    from public.classrooms classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = (select auth.uid())
      and classroom.status = 'active'
  ),
  students as (
    select member.user_id
    from public.classroom_members member
    join owned on owned.id = member.classroom_id
    where member.member_role = 'student'
      and member.status = 'active'
  ),
  current_questions as (
    select q.id, q.version, ch.id as chapter_id
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    join public.sections s on s.id = st.section_id
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where q.status = 'published'
      and st.status = 'published'
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
  ),
  latest_answers as (
    select distinct on (student.user_id, cq.id)
      student.user_id,
      cq.id as question_id,
      cq.chapter_id,
      answer.answer_status
    from students student
    join public.quiz_sessions session
      on session.user_id = student.user_id
      and session.status = 'completed'
      and session.purpose in ('practice', 'assignment', 'remediation')
    join public.quiz_session_questions sq on sq.session_id = session.id
    join current_questions cq
      on cq.id = sq.question_id and cq.version = sq.question_version
    join public.quiz_answers answer on answer.session_question_id = sq.id
    order by student.user_id, cq.id, answer.answered_at desc
  ),
  per_chapter as (
    select
      student.user_id,
      cq.chapter_id,
      count(distinct cq.id)::integer as total,
      count(la.question_id)::integer as answered,
      count(la.question_id) filter (
        where la.answer_status = 'correct'
      )::integer as correct
    from students student
    cross join current_questions cq
    left join latest_answers la
      on la.user_id = student.user_id and la.question_id = cq.id
    group by student.user_id, cq.chapter_id
  )
  select
    per_chapter.user_id,
    profile.display_name,
    per_chapter.chapter_id,
    case when per_chapter.total > 0
      then round(per_chapter.correct * 100.0 / per_chapter.total, 1)
      else null
    end as mastery,
    case
      when per_chapter.answered = 0 then 'not_started'
      when per_chapter.correct * 100.0 / per_chapter.total >= 80
        then 'mastered'
      when per_chapter.correct * 100.0 / per_chapter.total >= 60
        then 'developing'
      else 'learning'
    end as status,
    '2026-07-progress-1'::text as rules_version
  from per_chapter
  join public.profiles profile on profile.id = per_chapter.user_id
$$;

revoke all on function public.get_classroom_progress(uuid)
from public, anon;
grant execute on function public.get_classroom_progress(uuid)
to authenticated;
