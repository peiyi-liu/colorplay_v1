-- New LT-backed Live Sessions and historical QB-backed Live Sessions both
-- remain visible to the classroom owner's completed-session analytics.

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
    from public.profiles as profile
    join public.classrooms as classroom
      on classroom.owner_teacher_id = profile.id
    where profile.id = (select auth.uid())
      and profile.role = 'teacher'
      and classroom.id = p_classroom_id
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
    join public.sections as section
      on section.id = session_question.section_id
    join public.chapters as chapter
      on chapter.id = session_question.chapter_id
      and section.chapter_id = chapter.id
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
