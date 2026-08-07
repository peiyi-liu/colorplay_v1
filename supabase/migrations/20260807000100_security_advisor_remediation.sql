-- Make the student quiz projection obey the caller's RLS policies without
-- exposing frozen correct answers or explanations through direct table reads.
revoke all on public.quiz_session_questions from public, anon;
revoke all on public.quiz_session_questions from authenticated;

grant select (
  id,
  session_id,
  position,
  question_stable_code,
  question_version,
  prompt,
  frozen_options,
  started_at,
  deadline_at
) on public.quiz_session_questions to authenticated;

create function public.quiz_answer_explanation(p_session_question_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select question.explanation
  from public.quiz_session_questions question
  join public.quiz_answers answer
    on answer.session_question_id = question.id
  join public.quiz_sessions session
    on session.id = question.session_id
  where question.id = p_session_question_id
    and answer.user_id = auth.uid()
    and session.user_id = auth.uid()
  limit 1
$$;

revoke all on function public.quiz_answer_explanation(uuid)
  from public, anon, authenticated;
grant execute on function public.quiz_answer_explanation(uuid)
  to authenticated;

create or replace view public.quiz_session_question_state
with (security_barrier = true, security_invoker = true)
as
select
  s.id as session_id,
  s.template_id,
  s.status as session_status,
  s.chapter_title,
  s.question_count,
  case
    when s.status = 'completed' then s.answered_count
    else live_aggregate.answered_count
  end as answered_count,
  case
    when s.status = 'completed' then s.correct_count
    else live_aggregate.correct_count
  end as correct_count,
  case
    when s.status = 'completed' then s.total_score
    else live_aggregate.total_score
  end as total_score,
  s.started_at as session_started_at,
  s.completed_at,
  sq.id as session_question_id,
  sq.position,
  sq.question_stable_code,
  sq.question_version,
  sq.prompt,
  sq.frozen_options as options,
  sq.started_at,
  sq.deadline_at,
  a.answer_status,
  a.selected_option_id,
  a.correct_option_id,
  case
    when a.id is null then null
    else public.quiz_answer_explanation(sq.id)
  end as explanation,
  a.response_ms,
  a.score_delta,
  s.xp_awarded,
  s.tokens_awarded,
  s.reward_rate_percent,
  s.game_rules_version
from public.quiz_sessions s
join public.quiz_session_questions sq on sq.session_id = s.id
left join public.quiz_answers a on a.session_question_id = sq.id
cross join lateral (
  select
    count(live_answer.id)::integer as answered_count,
    count(live_answer.id) filter (
      where live_answer.answer_status = 'correct'
    )::integer as correct_count,
    coalesce(sum(live_answer.score_delta), 0)::integer as total_score
  from public.quiz_answers live_answer
  where live_answer.session_id = s.id
) live_aggregate
where s.user_id = auth.uid();

revoke all on public.quiz_session_question_state
  from public, anon, authenticated;
grant select on public.quiz_session_question_state to authenticated;

-- This parser is intentionally executable by authenticated callers. Pin its
-- lookup path so an attacker cannot shadow referenced objects.
alter function public.live_topic_session_id(text)
  set search_path = pg_catalog, public;
