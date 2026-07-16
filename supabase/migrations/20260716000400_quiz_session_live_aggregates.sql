-- The foundation submit_quiz_answer function has never updated the stored
-- session aggregates. Keep those columns as finalize-time values, while the
-- safe session-state view projects authoritative live answer aggregates.
create or replace view public.quiz_session_question_state
with (security_barrier = true)
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
  case when a.id is null then null else sq.explanation end as explanation,
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
