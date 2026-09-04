-- Quiz chrome needs authoritative chapter/section context without inferring it
-- from a question stable code. This adds display-only metadata; answer, score,
-- reward, and question-selection authority remain unchanged.
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
  s.game_rules_version,
  case when template.section_id is null then 'chapter' else 'section' end
    as challenge_kind,
  chapter.sort_order as chapter_sort_order,
  section.sort_order as section_sort_order,
  section.title as section_title
from public.quiz_sessions s
join public.quiz_templates template on template.id = s.template_id
join public.chapters chapter on chapter.id = template.chapter_id
left join public.sections section on section.id = template.section_id
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

create or replace function public.build_quiz_session_payload(target_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
begin
  select jsonb_build_object(
    'session_id', s.id,
    'template_id', s.template_id,
    'challenge_kind',
      case when template.section_id is null then 'chapter' else 'section' end,
    'chapter_sort_order', chapter.sort_order,
    'section_sort_order', section.sort_order,
    'section_title', section.title,
    'status', s.status,
    'chapter_title', s.chapter_title,
    'question_count', s.question_count,
    'answered_count', count(a.id)::integer,
    'correct_count', count(a.id) filter (where a.answer_status = 'correct'),
    'total_score', coalesce(sum(a.score_delta), 0)::integer,
    'xp_awarded', s.xp_awarded,
    'tokens_awarded', s.tokens_awarded,
    'reward_rate_percent', s.reward_rate_percent,
    'game_rules_version', s.game_rules_version,
    'completed_at', s.completed_at,
    'questions', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'session_question_id', sq.id,
          'position', sq.position,
          'stable_code', sq.question_stable_code,
          'version', sq.question_version,
          'prompt', sq.prompt,
          'options', sq.frozen_options,
          'started_at', sq.started_at,
          'deadline_at', sq.deadline_at,
          'answer_status', a.answer_status,
          'selected_option_id', a.selected_option_id,
          'correct_option_id', a.correct_option_id,
          'explanation', case when a.id is null then null else sq.explanation end,
          'score_delta', a.score_delta
        ) order by sq.position
      ),
      '[]'::jsonb
    )
  )
  into payload
  from public.quiz_sessions s
  join public.quiz_templates template on template.id = s.template_id
  join public.chapters chapter on chapter.id = template.chapter_id
  left join public.sections section on section.id = template.section_id
  join public.quiz_session_questions sq on sq.session_id = s.id
  left join public.quiz_answers a on a.session_question_id = sq.id
  where s.id = target_session_id
    and s.user_id = auth.uid()
  group by s.id, template.section_id, chapter.sort_order,
    section.sort_order, section.title;

  if payload is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_NOT_FOUND';
  end if;

  return payload;
end;
$$;

revoke all on function public.build_quiz_session_payload(uuid)
  from public, anon, authenticated;
