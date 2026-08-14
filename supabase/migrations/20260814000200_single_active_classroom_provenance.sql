-- Owner decision 2026-08-14: a student may have only one active classroom.
-- Quiz classroom provenance is captured server-side so teacher projections do
-- not infer a classroom from a student's current membership after the fact.

do $$
begin
  if exists (
    select membership.user_id
    from public.classroom_members as membership
    where membership.member_role = 'student'
      and membership.status = 'active'
    group by membership.user_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23514',
      message = 'ACTIVE_STUDENT_CLASSROOM_CONFLICT';
  end if;
end;
$$;

create unique index classroom_members_one_active_student_key
on public.classroom_members (user_id)
where member_role = 'student' and status = 'active';

create function public.guard_single_active_student_classroom()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.member_role = 'student'
    and new.status = 'active'
    and exists (
      select 1
      from public.classroom_members as existing
      where existing.user_id = new.user_id
        and existing.member_role = 'student'
        and existing.status = 'active'
        and existing.classroom_id <> new.classroom_id
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'ALREADY_IN_ACTIVE_CLASSROOM';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_single_active_student_classroom()
from public, anon, authenticated;

create trigger classroom_members_single_active_student_guard
before insert or update of classroom_id, user_id, member_role, status
on public.classroom_members
for each row execute function public.guard_single_active_student_classroom();

alter table public.quiz_sessions
add column classroom_id uuid references public.classrooms(id) on delete restrict;

create index quiz_sessions_classroom_status_started_idx
on public.quiz_sessions (classroom_id, status, started_at desc)
where classroom_id is not null;

-- Assignment attempts already carry authoritative classroom ownership.
update public.quiz_sessions as session
set classroom_id = assignment.classroom_id
from public.assignment_attempts as attempt
join public.assignments as assignment on assignment.id = attempt.assignment_id
where session.assignment_attempt_id = attempt.id
  and session.classroom_id is null;

create function public.capture_quiz_session_classroom()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_classroom_id uuid;
  assignment_classroom_id uuid;
begin
  if tg_op = 'UPDATE'
    and old.classroom_id is not null
    and new.classroom_id is distinct from old.classroom_id then
    raise exception using
      errcode = '23514',
      message = 'QUIZ_CLASSROOM_PROVENANCE_IMMUTABLE';
  end if;

  if new.assignment_attempt_id is not null then
    select assignment.classroom_id
    into assignment_classroom_id
    from public.assignment_attempts as attempt
    join public.assignments as assignment on assignment.id = attempt.assignment_id
    where attempt.id = new.assignment_attempt_id
      and attempt.user_id = new.user_id;

    if assignment_classroom_id is null then
      raise exception using
        errcode = '23514',
        message = 'QUIZ_ASSIGNMENT_CLASSROOM_INVALID';
    end if;

    if new.classroom_id is not null
      and new.classroom_id <> assignment_classroom_id then
      raise exception using
        errcode = '23514',
        message = 'QUIZ_ASSIGNMENT_CLASSROOM_MISMATCH';
    end if;

    new.classroom_id := assignment_classroom_id;
  elsif tg_op = 'INSERT' then
    select membership.classroom_id
    into active_classroom_id
    from public.classroom_members as membership
    where membership.user_id = new.user_id
      and membership.member_role = 'student'
      and membership.status = 'active';

    if new.classroom_id is not null
      and new.classroom_id is distinct from active_classroom_id then
      raise exception using
        errcode = '23514',
        message = 'QUIZ_CLASSROOM_MEMBERSHIP_MISMATCH';
    end if;

    new.classroom_id := active_classroom_id;
  end if;

  return new;
end;
$$;

revoke all on function public.capture_quiz_session_classroom()
from public, anon, authenticated;

create trigger quiz_sessions_capture_classroom
before insert or update of assignment_attempt_id, classroom_id
on public.quiz_sessions
for each row execute function public.capture_quiz_session_classroom();

create or replace function public.teacher_assessment_facts(
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
    from owned_classroom
    join public.quiz_sessions as session
      on session.classroom_id = owned_classroom.id
      and session.status = 'completed'
      and session.purpose in ('practice', 'assignment')
    join active_students as student on student.user_id = session.user_id
    join public.quiz_answers as answer on answer.session_id = session.id
    join public.quiz_session_questions as session_question
      on session_question.id = answer.session_question_id
    join public.questions as question on question.id = session_question.question_id
    join public.subtopics as subtopic on subtopic.id = question.subtopic_id
    join public.sections as section on section.id = subtopic.section_id
    join public.chapters as chapter on chapter.id = section.chapter_id
    where question.bank_kind in ('section', 'chapter')
      and (
        session.purpose = 'practice'
        or exists (
          select 1
          from public.assignment_attempts as attempt
          join public.assignments as assignment on assignment.id = attempt.assignment_id
          where attempt.id = session.assignment_attempt_id
            and attempt.user_id = session.user_id
            and assignment.classroom_id = owned_classroom.id
        )
      )
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

create or replace function public.teacher_question_answer_options(
  p_classroom_id uuid,
  p_stable_code text
)
returns table (
  option_key text,
  option_text text,
  is_correct boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with actor as (
    select profile.id
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'teacher'
  ),
  owned_classroom as (
    select classroom.id
    from actor
    join public.classrooms as classroom
      on classroom.owner_teacher_id = actor.id
     and classroom.id = p_classroom_id
     and classroom.status = 'active'
  ),
  in_scope as (
    select question.id
    from owned_classroom
    join public.classroom_members as membership
      on membership.classroom_id = owned_classroom.id
     and membership.member_role = 'student'
     and membership.status = 'active'
    join public.quiz_sessions as session
      on session.user_id = membership.user_id
     and session.classroom_id = owned_classroom.id
     and session.status = 'completed'
     and session.purpose in ('practice', 'assignment')
    join public.quiz_session_questions as session_question
      on session_question.session_id = session.id
     and session_question.question_stable_code = p_stable_code
    join public.questions as question
      on question.id = session_question.question_id
     and question.stable_code = p_stable_code
     and question.bank_kind = 'section'
     and question.status = 'published'
    where session.purpose = 'practice'
      or exists (
        select 1
        from public.assignment_attempts as attempt
        join public.assignments as assignment on assignment.id = attempt.assignment_id
        where attempt.id = session.assignment_attempt_id
          and attempt.user_id = session.user_id
          and assignment.classroom_id = owned_classroom.id
      )
    limit 1
  )
  select option.option_key, option.option_text, option.is_correct
  from in_scope
  join public.question_options as option on option.question_id = in_scope.id
  order by option.sort_order
$$;

revoke all on function public.teacher_question_answer_options(uuid, text)
from public, anon;
grant execute on function public.teacher_question_answer_options(uuid, text)
to authenticated;
