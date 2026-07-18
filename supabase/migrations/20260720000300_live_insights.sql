-- Live insights (2026-07-live-2): host-only during-open distribution, the
-- post-finalize session detail report, activity scheduling, server-owned
-- answer streaks, and the reduced-motion profile preference.

alter table public.profiles
add column reduced_motion boolean not null default false;
grant update (reduced_motion) on public.profiles to authenticated;

alter table public.live_activities
add column scheduled_for timestamptz;

alter table public.live_participants
add column current_streak integer not null default 0
check (current_streak >= 0);

-- Every authoritative answer row adjusts the participant streak exactly once,
-- whether it came from submit_live_answer or the close-time timeout fill.
-- The trigger is immediate (not deferred) and only fires inside the
-- security-definer commands, but it runs as owner anyway per the Phase 6
-- deferred-trigger lesson.
create function public.live_answer_streak_apply()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.live_participants
  set current_streak = case
    when new.answer_status = 'correct' then current_streak + 1
    else 0
  end
  where id = new.participant_id;
  return null;
end;
$$;
revoke all on function public.live_answer_streak_apply()
from public, anon, authenticated;

create trigger live_answers_streak
after insert on public.live_answers
for each row execute function public.live_answer_streak_apply();

-- submit_live_answer now returns the post-answer streak.
create or replace function public.submit_live_answer(
  p_session_question_id uuid,
  p_selected_option_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  question_record public.live_session_questions;
  session_record public.live_sessions;
  participant_record public.live_participants;
  existing_answer public.live_answers;
  computed_status public.quiz_answer_status;
  computed_response integer;
  computed_delta integer;
  result_payload jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'LIVE_INVALID_REQUEST';
  end if;

  select question.* into question_record
  from public.live_session_questions question
  where question.id = p_session_question_id;
  if question_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = question_record.session_id
  for share;

  select participant.* into participant_record
  from public.live_participants participant
  where participant.session_id = session_record.id
    and participant.user_id = current_user_id
    and participant.status = 'active'
  for update;
  if participant_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;

  result_payload := jsonb_build_object(
    'recorded', true,
    'session_question_id', question_record.id
  );

  select answer.* into existing_answer
  from public.live_answers answer
  where answer.session_question_id = question_record.id
    and answer.participant_id = participant_record.id;
  if existing_answer.id is not null then
    if existing_answer.idempotency_key = p_idempotency_key then
      return result_payload || jsonb_build_object(
        'streak', (
          select participant.current_streak
          from public.live_participants participant
          where participant.id = participant_record.id
        )
      );
    end if;
    raise exception
      using errcode = 'P0001', message = 'LIVE_ANSWER_ALREADY_SUBMITTED';
  end if;

  if session_record.state <> 'question_open'
    or session_record.current_position <> question_record."position" then
    raise exception using errcode = 'P0001', message = 'LIVE_ANSWER_CLOSED';
  end if;
  if p_selected_option_id is null or not exists (
    select 1
    from jsonb_array_elements(question_record.public_options) option_value
    where (option_value ->> 'id')::uuid = p_selected_option_id
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_INVALID_OPTION';
  end if;

  if clock_timestamp() > question_record.deadline_at then
    computed_status := 'timeout';
    computed_response := null;
    computed_delta := 0;
    insert into public.live_answers (
      session_question_id, participant_id, selected_option_id, answer_status,
      response_ms, score_delta, idempotency_key
    ) values (
      question_record.id, participant_record.id, null, computed_status,
      computed_response, computed_delta, p_idempotency_key
    );
    return result_payload || jsonb_build_object('streak', 0);
  end if;

  computed_response := floor(
    extract(
      epoch from clock_timestamp() - question_record.opened_at
    ) * 1000
  )::integer;
  if p_selected_option_id = question_record.correct_option_id then
    computed_status := 'correct';
    computed_delta := case when computed_response <= 5000 then 150 else 100 end;
  else
    computed_status := 'incorrect';
    computed_delta := 0;
  end if;

  begin
    insert into public.live_answers (
      session_question_id, participant_id, selected_option_id, answer_status,
      response_ms, score_delta, idempotency_key
    ) values (
      question_record.id, participant_record.id, p_selected_option_id,
      computed_status, computed_response, computed_delta, p_idempotency_key
    );
  exception
    when unique_violation then
      select answer.* into existing_answer
      from public.live_answers answer
      where answer.session_question_id = question_record.id
        and answer.participant_id = participant_record.id;
      if existing_answer.idempotency_key = p_idempotency_key then
        return result_payload || jsonb_build_object(
          'streak', (
            select participant.current_streak
            from public.live_participants participant
            where participant.id = participant_record.id
          )
        );
      end if;
      raise exception
        using errcode = 'P0001', message = 'LIVE_ANSWER_ALREADY_SUBMITTED';
  end;

  if computed_delta > 0 then
    update public.live_participants
    set score = score + computed_delta
    where id = participant_record.id;
  end if;

  return result_payload || jsonb_build_object(
    'streak', (
      select participant.current_streak
      from public.live_participants participant
      where participant.id = participant_record.id
    )
  );
end;
$$;

-- Host-only per-option counts while the question is open (or paused).
create function public.live_question_distribution(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  question_record public.live_session_questions;
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
  if session_record.state::text not in ('question_open', 'paused')
    or session_record.current_position < 1 then
    raise exception
      using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  select question.* into question_record
  from public.live_session_questions question
  where question.session_id = session_record.id
    and question."position" = session_record.current_position;

  return jsonb_build_object(
    'answered_count', (
      select count(*)
      from public.live_answers answer
      where answer.session_question_id = question_record.id
    ),
    'options', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'option_id', counted.selected_option_id,
            'count', counted.answer_count
          ) order by counted.selected_option_id
        ),
        '[]'::jsonb
      )
      from (
        select answer.selected_option_id, count(*) as answer_count
        from public.live_answers answer
        where answer.session_question_id = question_record.id
        group by answer.selected_option_id
      ) counted
    )
  );
end;
$$;

revoke all on function public.live_question_distribution(uuid)
from public, anon;
grant execute on function public.live_question_distribution(uuid)
to authenticated;

-- Post-finalize host report: per-question aggregates and the final ranking.
-- Display names only — never emails or raw answers.
create function public.teacher_live_session_detail(p_session_id uuid)
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

revoke all on function public.teacher_live_session_detail(uuid)
from public, anon;
grant execute on function public.teacher_live_session_detail(uuid)
to authenticated;

-- Reusable activities gain an optional schedule; it never auto-starts.
create function public.schedule_live_activity(
  p_activity_id uuid,
  p_scheduled_for timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  activity_record public.live_activities;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  update public.live_activities
  set scheduled_for = p_scheduled_for,
      updated_at = clock_timestamp()
  where id = p_activity_id
    and owner_teacher_id = current_user_id
    and status = 'active'
  returning * into activity_record;
  if activity_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_ACTIVITY_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'activity_id', activity_record.id,
    'scheduled_for', activity_record.scheduled_for
  );
end;
$$;

revoke all on function public.schedule_live_activity(uuid, timestamptz)
from public, anon;
grant execute on function public.schedule_live_activity(uuid, timestamptz)
to authenticated;
