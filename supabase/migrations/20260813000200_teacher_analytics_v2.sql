-- Teacher analytics v2 unifies completed Quiz and Live answers for analysis.
-- It deliberately keeps student_chapter_completion as the sole authority for
-- chapter completion: Live answers are analysis facts, never completion facts.

create function public.teacher_assessment_facts(
  p_classroom_id uuid,
  p_source text,
  p_from date,
  p_to date,
  p_chapter_id uuid
)
returns table (
  source_kind text,
  user_id uuid,
  chapter_id uuid,
  chapter_title text,
  chapter_sort_order integer,
  section_id uuid,
  section_title text,
  section_sort_order integer,
  stable_code text,
  prompt text,
  is_correct boolean,
  answered_at timestamptz
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
  quiz_facts as (
    select
      case question.bank_kind
        when 'chapter' then 'chapter_quiz'
        else 'section_quiz'
      end as source_kind,
      answer.user_id,
      chapter.id as chapter_id,
      chapter.title as chapter_title,
      chapter.sort_order as chapter_sort_order,
      section.id as section_id,
      section.title as section_title,
      section.sort_order as section_sort_order,
      session_question.question_stable_code as stable_code,
      session_question.prompt,
      answer.answer_status = 'correct' as is_correct,
      answer.answered_at
    from active_students as student
    join public.quiz_sessions as session
      on session.user_id = student.user_id
      and session.status = 'completed'
      and session.purpose in ('practice', 'assignment')
    join public.quiz_answers as answer on answer.session_id = session.id
    join public.quiz_session_questions as session_question
      on session_question.id = answer.session_question_id
    join public.questions as question on question.id = session_question.question_id
    join public.subtopics as subtopic on subtopic.id = question.subtopic_id
    join public.sections as section on section.id = subtopic.section_id
    join public.chapters as chapter on chapter.id = section.chapter_id
    where question.bank_kind in ('section', 'chapter')
  ),
  live_facts as (
    select
      'live'::text as source_kind,
      participant.user_id,
      chapter.id as chapter_id,
      chapter.title as chapter_title,
      chapter.sort_order as chapter_sort_order,
      section.id as section_id,
      section.title as section_title,
      section.sort_order as section_sort_order,
      session_question.question_stable_code as stable_code,
      session_question.prompt,
      answer.answer_status = 'correct' as is_correct,
      answer.submitted_at as answered_at
    from owned_classroom
    join public.live_sessions as session
      on session.classroom_id = owned_classroom.id
      and session.state = 'completed'
    join public.live_session_questions as session_question
      on session_question.session_id = session.id
    join public.live_answers as answer
      on answer.session_question_id = session_question.id
    join public.live_participants as participant
      on participant.id = answer.participant_id
    join active_students as student on student.user_id = participant.user_id
    join public.questions as question
      on question.stable_code = session_question.question_stable_code
      and question.bank_kind = 'section'
    join public.subtopics as subtopic on subtopic.id = question.subtopic_id
    join public.sections as section on section.id = subtopic.section_id
    join public.chapters as chapter on chapter.id = section.chapter_id
  ),
  facts as (
    select * from quiz_facts
    union all
    select * from live_facts
  )
  select *
  from facts
  where p_source in ('all', facts.source_kind)
    and (p_chapter_id is null or facts.chapter_id = p_chapter_id)
    and (
      p_from is null
      or facts.answered_at >= (p_from::timestamp at time zone 'Asia/Taipei')
    )
    and (
      p_to is null
      or facts.answered_at < ((p_to + 1)::timestamp at time zone 'Asia/Taipei')
    )
$$;

create function public.teacher_assessment_question_analysis(
  p_classroom_id uuid,
  p_source text default 'all',
  p_from date default null,
  p_to date default null,
  p_chapter_id uuid default null
)
returns table (
  chapter_id uuid,
  chapter_title text,
  chapter_sort_order integer,
  section_id uuid,
  section_title text,
  section_sort_order integer,
  stable_code text,
  prompt text,
  attempts integer,
  correct_rate numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    facts.chapter_id,
    facts.chapter_title,
    facts.chapter_sort_order,
    facts.section_id,
    facts.section_title,
    facts.section_sort_order,
    facts.stable_code,
    facts.prompt,
    count(*)::integer,
    round(count(*) filter (where facts.is_correct) * 100.0 / count(*), 1)
  from public.teacher_assessment_facts(
    p_classroom_id, p_source, p_from, p_to, p_chapter_id
  ) as facts
  group by
    facts.chapter_id, facts.chapter_title, facts.chapter_sort_order,
    facts.section_id, facts.section_title, facts.section_sort_order,
    facts.stable_code, facts.prompt
  order by
    facts.chapter_sort_order, facts.section_sort_order, facts.stable_code
$$;

create function public.teacher_classroom_overview(
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
      bool_and(result.is_complete) as is_complete
    from active_students as student
    cross join selected_chapters as chapter
    cross join lateral public.student_chapter_completion(
      student.user_id, chapter.id
    ) as result
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

create function public.teacher_live_session_report_v2(
  p_classroom_id uuid,
  p_from date default null,
  p_to date default null,
  p_limit integer default 5,
  p_offset integer default 0
)
returns table (
  session_id uuid,
  activity_title text,
  classroom_name text,
  participants integer,
  answers integer,
  correct_rate numeric,
  completed_at timestamptz,
  total_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with sessions as (
    select
      session.id,
      activity.title,
      classroom.name as classroom_name,
      session.completed_at,
      session.created_at
    from public.classrooms as classroom
    join public.live_sessions as session on session.classroom_id = classroom.id
    join public.live_activities as activity on activity.id = session.live_activity_id
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = (select auth.uid())
      and classroom.status = 'active'
      and session.state = 'completed'
      and (
        p_from is null
        or session.completed_at >= (p_from::timestamp at time zone 'Asia/Taipei')
      )
      and (
        p_to is null
        or session.completed_at < ((p_to + 1)::timestamp at time zone 'Asia/Taipei')
      )
  )
  select
    session.id,
    session.title,
    session.classroom_name,
    (
      select count(*)::integer from public.live_participants as participant
      where participant.session_id = session.id
    ),
    count(answer.id)::integer,
    case when count(answer.id) > 0 then round(
      count(answer.id) filter (where answer.answer_status = 'correct')
        * 100.0 / count(answer.id),
      1
    ) end,
    session.completed_at,
    count(*) over ()::integer
  from sessions as session
  left join public.live_session_questions as question
    on question.session_id = session.id
  left join public.live_answers as answer
    on answer.session_question_id = question.id
  group by
    session.id, session.title, session.classroom_name,
    session.completed_at, session.created_at
  order by session.created_at desc, session.id
  limit greatest(1, least(coalesce(p_limit, 5), 50))
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create function public.teacher_student_progress_v2(
  p_classroom_id uuid,
  p_member_ref uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  base jsonb;
  student_id uuid;
  chapters jsonb;
  total_mistakes integer;
  unfinished_mistakes integer;
  overall_accuracy numeric;
begin
  base := public.teacher_student_progress(p_classroom_id, p_member_ref);

  select membership.user_id into student_id
  from public.classrooms as classroom
  join public.classroom_members as membership
    on membership.classroom_id = classroom.id
  where classroom.id = p_classroom_id
    and classroom.owner_teacher_id = (select auth.uid())
    and membership.member_ref = p_member_ref
    and membership.member_role = 'student';

  if student_id is null then
    return base;
  end if;

  select
    count(*)::integer,
    count(*) filter (where status in ('open', 'reopened'))::integer
  into total_mistakes, unfinished_mistakes
  from public.mistake_items
  where user_id = student_id;

  with student_facts as (
    select facts.*
    from public.teacher_assessment_facts(
      p_classroom_id, 'all', null, null, null
    ) as facts
    where facts.user_id = student_id
  )
  select case when count(*) > 0 then round(
    count(*) filter (where is_correct) * 100.0 / count(*), 1
  ) end into overall_accuracy
  from student_facts;

  select coalesce(jsonb_agg(
    chapter.value || jsonb_build_object(
      'assessment_accuracy', aggregate.assessment_accuracy,
      'section_quiz_accuracy', aggregate.section_quiz_accuracy,
      'chapter_quiz_accuracy', aggregate.chapter_quiz_accuracy,
      'live_accuracy', aggregate.live_accuracy,
      'status', case
        when completion.is_complete then 'mastered'
        when chapter.value ->> 'status' = 'not_started' then 'not_started'
        else 'learning'
      end
    ) order by chapter.ordinality
  ), '[]'::jsonb)
  into chapters
  from jsonb_array_elements(base -> 'chapters') with ordinality as chapter(value, ordinality)
  left join lateral (
    select
      case when count(*) > 0 then round(
        count(*) filter (where facts.is_correct) * 100.0 / count(*), 1
      ) end as assessment_accuracy,
      case when count(*) filter (where facts.source_kind = 'section_quiz') > 0
        then round(
          count(*) filter (
            where facts.source_kind = 'section_quiz' and facts.is_correct
          ) * 100.0
          / count(*) filter (where facts.source_kind = 'section_quiz'), 1
        ) end as section_quiz_accuracy,
      case when count(*) filter (where facts.source_kind = 'chapter_quiz') > 0
        then round(
          count(*) filter (
            where facts.source_kind = 'chapter_quiz' and facts.is_correct
          ) * 100.0
          / count(*) filter (where facts.source_kind = 'chapter_quiz'), 1
        ) end as chapter_quiz_accuracy,
      case when count(*) filter (where facts.source_kind = 'live') > 0
        then round(
          count(*) filter (
            where facts.source_kind = 'live' and facts.is_correct
          ) * 100.0
          / count(*) filter (where facts.source_kind = 'live'), 1
        ) end as live_accuracy
    from public.teacher_assessment_facts(
      p_classroom_id, 'all', null, null, (chapter.value ->> 'chapter_id')::uuid
    ) as facts
    where facts.user_id = student_id
  ) as aggregate on true
  left join lateral public.student_chapter_completion(
    student_id, (chapter.value ->> 'chapter_id')::uuid
  ) as completion on true;

  return jsonb_set(
    jsonb_set(base, '{chapters}', chapters),
    '{stats}',
    (base -> 'stats') || jsonb_build_object(
      'avg_accuracy', overall_accuracy,
      'total_mistake_count', total_mistakes,
      'unfinished_mistake_count', unfinished_mistakes
    )
  ) - 'mistakes';
end;
$$;

revoke all on function public.teacher_assessment_facts(uuid, text, date, date, uuid)
from public, anon, authenticated;
revoke all on function public.teacher_assessment_question_analysis(uuid, text, date, date, uuid)
from public, anon;
revoke all on function public.teacher_classroom_overview(uuid, date, date, uuid)
from public, anon;
revoke all on function public.teacher_live_session_report_v2(uuid, date, date, integer, integer)
from public, anon;
revoke all on function public.teacher_student_progress_v2(uuid, uuid)
from public, anon;

grant execute on function public.teacher_assessment_question_analysis(uuid, text, date, date, uuid)
to authenticated;
grant execute on function public.teacher_classroom_overview(uuid, date, date, uuid)
to authenticated;
grant execute on function public.teacher_live_session_report_v2(uuid, date, date, integer, integer)
to authenticated;
grant execute on function public.teacher_student_progress_v2(uuid, uuid)
to authenticated;
