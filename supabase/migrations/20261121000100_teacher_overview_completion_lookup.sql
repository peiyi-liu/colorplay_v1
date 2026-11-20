-- Completion is immutable; mastery/fingerprint requalification is not needed here.
create or replace function public.teacher_classroom_overview(
  p_classroom_id uuid,
  p_from date default null,
  p_to date default null,
  p_chapter_id uuid default null
)
returns table (
  completed_students integer,
  total_students integer,
  average_accuracy numeric,
  worst_subtopic_code text,
  worst_subtopic_title text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with owned_classroom as (
    select classroom.id
    from public.classrooms as classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = (select auth.uid())
      and classroom.status = 'active'
  ),
  active_students as (
    select membership.user_id
    from owned_classroom
    join public.classroom_members as membership
      on membership.classroom_id = owned_classroom.id
      and membership.member_role = 'student'
      and membership.status = 'active'
  ),
  selected_chapters as (
    select chapter.id
    from public.chapters as chapter
    join public.courses as course on course.id = chapter.course_id
    where chapter.status = 'published'
      and course.status = 'published'
      and (p_chapter_id is null or chapter.id = p_chapter_id)
  ),
  completion as (
    select
      student.user_id,
      bool_and(exists (
        select 1
        from public.chapter_challenge_finalize_facts as fact
        where fact.user_id = student.user_id
          and fact.chapter_id = chapter.id
      )) as is_complete
    from active_students as student
    cross join selected_chapters as chapter
    group by student.user_id
  ),
  facts as (
    select *
    from public.teacher_assessment_facts(
      p_classroom_id, 'all', p_from, p_to, p_chapter_id
    )
  ),
  subtopic_accuracy as (
    select
      subtopic.stable_code,
      subtopic.title,
      count(*) filter (where facts.is_correct) * 100.0 / count(*) as accuracy
    from facts
    join public.questions as question on question.stable_code = facts.stable_code
    join public.subtopics as subtopic on subtopic.id = question.subtopic_id
    group by subtopic.stable_code, subtopic.title
  )
  select
    count(*) filter (where completion.is_complete)::integer,
    count(*)::integer,
    case when (select count(*) from facts) > 0 then (
      select round(
        count(*) filter (where facts.is_correct) * 100.0 / count(*), 1
      ) from facts
    ) end,
    (select stable_code from subtopic_accuracy order by accuracy, stable_code limit 1),
    (select title from subtopic_accuracy order by accuracy, stable_code limit 1)
  from completion
  having exists (select 1 from owned_classroom)
$$;
