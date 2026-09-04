-- ADR 0007: narrow, on-demand answer projection for one owned classroom.
-- Existing public/student question payloads and teacher_question_detail remain answer-free.

create function public.teacher_question_answer_options(
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
