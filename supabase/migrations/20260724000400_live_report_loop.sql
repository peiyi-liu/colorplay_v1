-- 10E report and learning loop: the teacher session detail gains the
-- participant × question answer matrix (CSV and the <35% reteach flag are
-- derived client-side from this payload), and completing a live session
-- writes every non-correct answer into the existing mistake book.

-- The mistake book gains a live origin. Quiz and live answers live in
-- different tables, so each mistake row records exactly one origin.
alter table public.mistake_items
  alter column origin_answer_id drop not null;
alter table public.mistake_items
  add column origin_live_answer_id uuid references public.live_answers(id);
alter table public.mistake_items
  add constraint mistake_items_origin_check
  check (origin_answer_id is not null or origin_live_answer_id is not null);

-- Completing a live session lands every wrong or timed-out answer in the
-- mistake book. A trigger on the completed transition (instead of a copy
-- inside finalize) keeps the invariant with the state machine itself:
-- whatever command completes a session, the mistake book follows, inside
-- the same transaction. The frozen live question maps back to the question
-- bank by stable_code; resolved mistakes reopen exactly like the quiz path.
create function public.live_session_mistakes_on_complete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.mistake_items (
    user_id, question_id, question_version, origin_live_answer_id
  )
  select
    participant.user_id,
    question_bank.id,
    live_question.question_version,
    answer.id
  from public.live_answers answer
  join public.live_session_questions live_question
    on live_question.id = answer.session_question_id
  join public.live_participants participant
    on participant.id = answer.participant_id
  join public.questions question_bank
    on question_bank.stable_code = live_question.question_stable_code
  where live_question.session_id = new.id
    and answer.answer_status <> 'correct'
  on conflict on constraint mistake_items_user_question_unique
  do update set
    status = case
      when public.mistake_items.status = 'resolved' then 'reopened'
      else public.mistake_items.status
    end,
    question_version = excluded.question_version,
    last_event_at = clock_timestamp();
  return new;
end;
$$;

revoke all on function public.live_session_mistakes_on_complete()
from public, anon, authenticated;

create trigger live_sessions_record_mistakes
after update of state on public.live_sessions
for each row
when (new.state = 'completed' and old.state is distinct from new.state)
execute function public.live_session_mistakes_on_complete();

-- teacher_live_session_detail v2: adds classroom/activity identity (the
-- one-click review assignment needs both) and the per-participant answer
-- matrix. Host-only and completed-only, unchanged.
create or replace function public.teacher_live_session_detail(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = p_session_id
    and live_session.host_teacher_id = current_user_id;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;
  if session_record.state <> 'completed' then
    raise exception
      using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  return jsonb_build_object(
    'session_id', session_record.id,
    'mode', session_record.mode,
    'completed_at', session_record.completed_at,
    'classroom_id', session_record.classroom_id,
    'activity', (
      select jsonb_build_object(
        'title', activity.title,
        'quiz_template_id', activity.quiz_template_id
      )
      from public.live_activities activity
      where activity.id = session_record.live_activity_id
    ),
    'questions', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'position', aggregated."position",
            'prompt', aggregated.prompt,
            'answered', aggregated.answered,
            'correct', aggregated.correct,
            'correct_rate', aggregated.correct_rate,
            'average_response_ms', aggregated.average_response_ms
          ) order by aggregated."position"
        ),
        '[]'::jsonb
      )
      from (
        select
          question."position",
          question.prompt,
          count(answer.id)::integer as answered,
          count(answer.id) filter (
            where answer.answer_status = 'correct'
          )::integer as correct,
          case when count(answer.id) > 0 then
            round(
              count(answer.id) filter (
                where answer.answer_status = 'correct'
              ) * 100.0 / count(answer.id),
              1
            )
          end as correct_rate,
          round(avg(answer.response_ms))::integer as average_response_ms
        from public.live_session_questions question
        left join public.live_answers answer
          on answer.session_question_id = question.id
        where question.session_id = session_record.id
        group by question."position", question.prompt
      ) aggregated
    ),
    'participants', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'display_name', roster.display_name,
            'rank', roster.final_rank,
            'score', roster.score,
            'team_number', roster.team_number,
            'answers', roster.answers
          ) order by roster.final_rank asc nulls last, roster.display_name
        ),
        '[]'::jsonb
      )
      from (
        select
          profile.display_name,
          participant.final_rank,
          participant.score,
          participant.team_number,
          (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'position', question."position",
                  'status', answer.answer_status,
                  'response_ms', answer.response_ms
                ) order by question."position"
              ),
              '[]'::jsonb
            )
            from public.live_answers answer
            join public.live_session_questions question
              on question.id = answer.session_question_id
            where answer.participant_id = participant.id
              and question.session_id = session_record.id
          ) as answers
        from public.live_participants participant
        join public.profiles profile on profile.id = participant.user_id
        where participant.session_id = session_record.id
          and participant.status = 'active'
      ) roster
    ),
    'ranking', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', ranked.final_rank,
            'display_name', ranked.display_name,
            'score', ranked.score,
            'team_number', ranked.team_number
          ) order by ranked.final_rank
        ),
        '[]'::jsonb
      )
      from (
        select
          participant.final_rank,
          profile.display_name,
          participant.score,
          participant.team_number
        from public.live_participants participant
        join public.profiles profile on profile.id = participant.user_id
        where participant.session_id = session_record.id
          and participant.final_rank is not null
      ) ranked
    )
  );
end;
$$;
