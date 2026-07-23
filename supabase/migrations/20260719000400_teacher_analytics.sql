-- Owner-scoped teacher analytics. Every projection starts from the caller's
-- active owned classroom (anyone else reads zero rows), filters by Taipei
-- calendar dates converted to UTC instants, and returns null instead of a
-- misleading zero when a denominator is empty. All figures are reproducible
-- from the fact tables with plain SQL; nothing is computed client-side.

-- Shared fact source: answers of completed formal sessions by the classroom's
-- active students, joined to their frozen question rows.
create function public.teacher_answer_facts(
  p_classroom_id uuid,
  p_from date,
  p_to date,
  p_chapter_id uuid,
  p_subtopic_id uuid
)
returns table (
  session_id uuid,
  user_id uuid,
  question_id uuid,
  subtopic_id uuid,
  chapter_id uuid,
  stable_code text,
  prompt text,
  is_correct boolean,
  answered_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    answer.session_id,
    answer.user_id,
    question.id,
    st.id,
    ch.id,
    sq.question_stable_code,
    sq.prompt,
    answer.answer_status = 'correct',
    answer.answered_at
  from public.classrooms classroom
  join public.classroom_members member
    on member.classroom_id = classroom.id
    and member.member_role = 'student'
    and member.status = 'active'
  join public.quiz_sessions session
    on session.user_id = member.user_id
    and session.status = 'completed'
    and session.purpose in ('practice', 'assignment')
  join public.quiz_answers answer on answer.session_id = session.id
  join public.quiz_session_questions sq
    on sq.id = answer.session_question_id
  join public.questions question on question.id = sq.question_id
  join public.subtopics st on st.id = question.subtopic_id
  join public.sections s on s.id = st.section_id
  join public.chapters ch on ch.id = s.chapter_id
  where classroom.id = p_classroom_id
    and classroom.owner_teacher_id = (select auth.uid())
    and classroom.status = 'active'
    and (
      p_from is null
      or answer.answered_at >= (p_from::timestamp at time zone 'Asia/Taipei')
    )
    and (
      p_to is null
      or answer.answered_at
        < ((p_to + 1)::timestamp at time zone 'Asia/Taipei')
    )
    and (p_chapter_id is null or ch.id = p_chapter_id)
    and (p_subtopic_id is null or st.id = p_subtopic_id)
$$;

revoke all on function public.teacher_answer_facts(uuid, date, date, uuid, uuid)
from public, anon, authenticated;

create function public.teacher_classroom_summary(
  p_classroom_id uuid,
  p_from date default null,
  p_to date default null,
  p_chapter_id uuid default null,
  p_subtopic_id uuid default null
)
returns table (
  attempts integer,
  unique_students integer,
  average_accuracy numeric,
  worst_subtopic_code text,
  worst_subtopic_title text
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with facts as (
    select * from public.teacher_answer_facts(
      p_classroom_id, p_from, p_to, p_chapter_id, p_subtopic_id
    )
  ),
  by_subtopic as (
    select
      st.stable_code,
      st.title,
      count(*) filter (where facts.is_correct) * 100.0 / count(*) as accuracy
    from facts
    join public.subtopics st on st.id = facts.subtopic_id
    group by st.stable_code, st.title
  )
  select
    count(distinct facts.session_id)::integer,
    count(distinct facts.user_id)::integer,
    case when count(facts.question_id) > 0
      then round(
        count(*) filter (where facts.is_correct) * 100.0 / count(*), 1
      )
      else null
    end,
    (select stable_code from by_subtopic order by accuracy, stable_code limit 1),
    (select title from by_subtopic order by accuracy, stable_code limit 1)
  from facts
  having exists (
    select 1 from public.classrooms c
    where c.id = p_classroom_id
      and c.owner_teacher_id = (select auth.uid())
      and c.status = 'active'
  )
$$;

create function public.teacher_question_analysis(
  p_classroom_id uuid,
  p_from date default null,
  p_to date default null,
  p_chapter_id uuid default null,
  p_subtopic_id uuid default null
)
returns table (
  stable_code text,
  prompt text,
  attempts integer,
  correct_rate numeric
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    facts.stable_code,
    facts.prompt,
    count(*)::integer,
    round(count(*) filter (where facts.is_correct) * 100.0 / count(*), 1)
  from public.teacher_answer_facts(
    p_classroom_id, p_from, p_to, p_chapter_id, p_subtopic_id
  ) facts
  group by facts.stable_code, facts.prompt
  order by facts.stable_code
$$;

create function public.teacher_subtopic_mastery(
  p_classroom_id uuid,
  p_from date default null,
  p_to date default null,
  p_chapter_id uuid default null,
  p_subtopic_id uuid default null
)
returns table (
  subtopic_code text,
  subtopic_title text,
  answers integer,
  accuracy numeric,
  students integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    st.stable_code,
    st.title,
    count(*)::integer,
    round(count(*) filter (where facts.is_correct) * 100.0 / count(*), 1),
    count(distinct facts.user_id)::integer
  from public.teacher_answer_facts(
    p_classroom_id, p_from, p_to, p_chapter_id, p_subtopic_id
  ) facts
  join public.subtopics st on st.id = facts.subtopic_id
  group by st.stable_code, st.title
  order by st.stable_code
$$;

create function public.teacher_assignment_summary(
  p_classroom_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (
  assignment_id uuid,
  title text,
  status text,
  targets integer,
  attempts integer,
  completed integer,
  passed integer
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    assignment.id,
    assignment.title,
    assignment.status::text,
    (
      select count(*)::integer from public.assignment_targets target
      where target.assignment_id = assignment.id
    ),
    (
      select count(*)::integer from public.assignment_attempts attempt
      where attempt.assignment_id = assignment.id
    ),
    (
      select count(*)::integer from public.assignment_attempts attempt
      where attempt.assignment_id = assignment.id
        and attempt.status = 'completed'
    ),
    (
      select count(*)::integer from public.assignment_attempts attempt
      where attempt.assignment_id = assignment.id
        and attempt.status = 'completed'
        and attempt.passed
    )
  from public.assignments assignment
  join public.classrooms classroom on classroom.id = assignment.classroom_id
  where classroom.id = p_classroom_id
    and classroom.owner_teacher_id = (select auth.uid())
    and classroom.status = 'active'
    and (
      p_from is null or assignment.created_at
        >= (p_from::timestamp at time zone 'Asia/Taipei')
    )
    and (
      p_to is null or assignment.created_at
        < ((p_to + 1)::timestamp at time zone 'Asia/Taipei')
    )
  order by assignment.created_at desc
$$;

create function public.teacher_live_session_report(
  p_classroom_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (
  session_id uuid,
  activity_title text,
  state text,
  participants integer,
  answers integer,
  correct_rate numeric,
  completed_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    live_session.id,
    activity.title,
    live_session.state::text,
    (
      select count(*)::integer from public.live_participants participant
      where participant.session_id = live_session.id
    ),
    (
      select count(*)::integer
      from public.live_answers answer
      join public.live_session_questions question
        on question.id = answer.session_question_id
      where question.session_id = live_session.id
    ),
    (
      select case when count(*) > 0
        then round(
          count(*) filter (where answer.answer_status = 'correct')
            * 100.0 / count(*),
          1
        )
        else null
      end
      from public.live_answers answer
      join public.live_session_questions question
        on question.id = answer.session_question_id
      where question.session_id = live_session.id
    ),
    live_session.completed_at
  from public.live_sessions live_session
  join public.live_activities activity
    on activity.id = live_session.live_activity_id
  join public.classrooms classroom on classroom.id = live_session.classroom_id
  where classroom.id = p_classroom_id
    and classroom.owner_teacher_id = (select auth.uid())
    and classroom.status = 'active'
    and (
      p_from is null or live_session.created_at
        >= (p_from::timestamp at time zone 'Asia/Taipei')
    )
    and (
      p_to is null or live_session.created_at
        < ((p_to + 1)::timestamp at time zone 'Asia/Taipei')
    )
  order by live_session.created_at desc
$$;

revoke all on function public.teacher_classroom_summary(uuid, date, date, uuid, uuid)
from public, anon;
revoke all on function public.teacher_question_analysis(uuid, date, date, uuid, uuid)
from public, anon;
revoke all on function public.teacher_subtopic_mastery(uuid, date, date, uuid, uuid)
from public, anon;
revoke all on function public.teacher_assignment_summary(uuid, date, date)
from public, anon;
revoke all on function public.teacher_live_session_report(uuid, date, date)
from public, anon;

grant execute on function public.teacher_classroom_summary(uuid, date, date, uuid, uuid)
to authenticated;
grant execute on function public.teacher_question_analysis(uuid, date, date, uuid, uuid)
to authenticated;
grant execute on function public.teacher_subtopic_mastery(uuid, date, date, uuid, uuid)
to authenticated;
grant execute on function public.teacher_assignment_summary(uuid, date, date)
to authenticated;
grant execute on function public.teacher_live_session_report(uuid, date, date)
to authenticated;
