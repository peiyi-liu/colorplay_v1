-- Teacher-only analytics projections added for the JRPG analytics work surface.
-- Completion remains defined by student_chapter_completion; this migration only
-- batches that authoritative result for the active students in an owned class.

create function public.teacher_chapter_completion_summary(
  p_classroom_id uuid,
  p_chapter_id uuid default null
)
returns table (
  chapter_id uuid,
  chapter_title text,
  chapter_sort_order integer,
  completed_students integer,
  total_students integer,
  completion_rate numeric,
  student_statuses jsonb
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
  chapter_rows as (
    select
      chapter.id,
      chapter.title,
      chapter.sort_order
    from owned_classroom
    cross join public.chapters as chapter
    join public.courses as course on course.id = chapter.course_id
    where course.status = 'published'
      and chapter.status = 'published'
      and (p_chapter_id is null or chapter.id = p_chapter_id)
  ),
  active_students as (
    select
      membership.user_id,
      membership.member_ref,
      profile.display_name
    from owned_classroom
    join public.classroom_members as membership
      on membership.classroom_id = owned_classroom.id
      and membership.member_role = 'student'
      and membership.status = 'active'
    join public.profiles as profile on profile.id = membership.user_id
  ),
  student_rows as (
    select
      chapter.id as chapter_id,
      student.member_ref,
      student.display_name,
      completion.is_complete
    from chapter_rows as chapter
    cross join active_students as student
    cross join lateral public.student_chapter_completion(
      student.user_id,
      chapter.id
    ) as completion
  )
  select
    chapter.id,
    chapter.title,
    chapter.sort_order,
    count(student.member_ref) filter (where student.is_complete)::integer,
    count(student.member_ref)::integer,
    case
      when count(student.member_ref) > 0 then round(
        count(student.member_ref) filter (where student.is_complete)
          * 100.0 / count(student.member_ref),
        1
      )
      else null
    end,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'member_ref', student.member_ref,
          'display_name', student.display_name,
          'is_complete', student.is_complete
        )
        order by student.display_name, student.member_ref
      ) filter (where student.member_ref is not null),
      '[]'::jsonb
    )
  from chapter_rows as chapter
  left join student_rows as student on student.chapter_id = chapter.id
  group by chapter.id, chapter.title, chapter.sort_order
  order by chapter.sort_order, chapter.id
$$;

create function public.teacher_question_detail(
  p_classroom_id uuid,
  p_stable_code text
)
returns table (
  stable_code text,
  prompt text,
  options jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    question.stable_code,
    question.prompt,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'option_key', option.option_key,
          'option_text', option.option_text
        )
        order by option.sort_order
      ) filter (where option.id is not null),
      '[]'::jsonb
    )
  from public.classrooms as classroom
  cross join public.questions as question
  left join public.question_options as option
    on option.question_id = question.id
  where classroom.id = p_classroom_id
    and classroom.owner_teacher_id = (select auth.uid())
    and classroom.status = 'active'
    and question.stable_code = p_stable_code
    and question.status = 'published'
  group by question.id, question.stable_code, question.prompt
$$;

revoke all on function public.teacher_chapter_completion_summary(uuid, uuid)
from public, anon;
revoke all on function public.teacher_question_detail(uuid, text)
from public, anon;

grant execute on function public.teacher_chapter_completion_summary(uuid, uuid)
to authenticated;
grant execute on function public.teacher_question_detail(uuid, text)
to authenticated;
