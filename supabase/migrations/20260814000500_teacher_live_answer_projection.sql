-- Extend ADR 0007's narrow owner-only answer projection to questions frozen in
-- a completed classroom Live session. Active Live payloads remain answer-free.
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
  quiz_question as (
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
  ),
  quiz_options as (
    select option.option_key, option.option_text, option.is_correct,
      option.sort_order
    from quiz_question
    join public.question_options as option
      on option.question_id = quiz_question.id
  ),
  completed_live_question as (
    select session_question.public_options, session_question.correct_option_id
    from owned_classroom
    join public.live_sessions as session
      on session.classroom_id = owned_classroom.id
     and session.state = 'completed'
    join public.live_session_questions as session_question
      on session_question.session_id = session.id
     and session_question.question_stable_code = p_stable_code
    order by session.completed_at desc nulls last, session.created_at desc
    limit 1
  ),
  live_options as (
    select
      option ->> 'key' as option_key,
      option ->> 'text' as option_text,
      (option ->> 'id')::uuid = completed_live_question.correct_option_id
        as is_correct,
      (option ->> 'sort_order')::integer as sort_order
    from completed_live_question
    cross join lateral jsonb_array_elements(
      completed_live_question.public_options
    ) as option
  ),
  answer_options as (
    select * from quiz_options
    union all
    select * from live_options
  )
  select answer.option_key, answer.option_text, answer.is_correct
  from answer_options as answer
  order by answer.sort_order
$$;

revoke all on function public.teacher_question_answer_options(uuid, text)
from public, anon;
grant execute on function public.teacher_question_answer_options(uuid, text)
to authenticated;
