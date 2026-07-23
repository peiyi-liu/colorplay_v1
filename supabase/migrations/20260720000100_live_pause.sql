-- Live pause/resume (2026-07-live-2): host-only, only from question_open.
-- Pausing freezes the remaining answer window server-side; resuming rebuilds
-- opened_at/deadline_at so response times never include the paused gap.
-- The partial "active sessions" index predicate intentionally stays as-is:
-- it is a performance hint only and paused sessions are short-lived.

alter type public.live_session_state add value 'paused';

alter table public.live_sessions
add column paused_remaining_ms integer
check (paused_remaining_ms is null or paused_remaining_ms >= 0);

-- live_sessions uses column-level grants; expose the new column to api roles
-- (it reveals nothing sensitive — the paused countdown is broadcast anyway).
grant select (paused_remaining_ms) on public.live_sessions to authenticated;

create function public.pause_live_session(
  p_session_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  question_record public.live_session_questions;
  remaining_ms integer;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = p_session_id
    and live_session.host_teacher_id = current_user_id
  for update;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;
  if p_expected_version is distinct from session_record.state_version then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_CONFLICT';
  end if;
  if session_record.state::text <> 'question_open' then
    raise exception
      using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  select question.* into question_record
  from public.live_session_questions question
  where question.session_id = session_record.id
    and question."position" = session_record.current_position;

  remaining_ms := greatest(
    0,
    floor(
      extract(
        epoch from question_record.deadline_at - clock_timestamp()
      ) * 1000
    )::integer
  );

  update public.live_sessions
  set state = 'paused',
      paused_remaining_ms = remaining_ms,
      state_version = state_version + 1,
      updated_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  perform public.live_broadcast(
    session_record.id,
    jsonb_build_object(
      'session_id', session_record.id,
      'state', session_record.state,
      'state_version', session_record.state_version,
      'paused_remaining_ms', session_record.paused_remaining_ms
    )
  );

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'paused_remaining_ms', session_record.paused_remaining_ms
  );
end;
$$;

create function public.resume_live_session(
  p_session_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  question_record public.live_session_questions;
  time_limit_ms integer;
  elapsed_ms integer;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = p_session_id
    and live_session.host_teacher_id = current_user_id
  for update;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;
  if p_expected_version is distinct from session_record.state_version then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_CONFLICT';
  end if;
  if session_record.state::text <> 'paused' then
    raise exception
      using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  select activity.question_time_limit_seconds * 1000
  into time_limit_ms
  from public.live_activities activity
  where activity.id = session_record.live_activity_id;
  elapsed_ms := greatest(
    0, time_limit_ms - coalesce(session_record.paused_remaining_ms, 0)
  );

  update public.live_session_questions
  set opened_at = clock_timestamp() - make_interval(secs => elapsed_ms / 1000.0),
      deadline_at = clock_timestamp() + make_interval(
        secs => coalesce(session_record.paused_remaining_ms, 0) / 1000.0
      )
  where session_id = session_record.id
    and "position" = session_record.current_position
  returning * into question_record;

  update public.live_sessions
  set state = 'question_open',
      paused_remaining_ms = null,
      state_version = state_version + 1,
      updated_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  perform public.live_broadcast(
    session_record.id,
    jsonb_build_object(
      'session_id', session_record.id,
      'state', session_record.state,
      'state_version', session_record.state_version,
      'question', public.live_question_payload(question_record)
    )
  );

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'question', public.live_question_payload(question_record)
  );
end;
$$;

revoke all on function public.pause_live_session(uuid, integer)
from public, anon;
grant execute on function public.pause_live_session(uuid, integer)
to authenticated;
revoke all on function public.resume_live_session(uuid, integer)
from public, anon;
grant execute on function public.resume_live_session(uuid, integer)
to authenticated;

-- Refresh/reconnect keeps the frozen question visible while paused.
create or replace function public.get_live_session_state(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  caller_is_host boolean;
  participant_record public.live_participants;
  question_record public.live_session_questions;
  payload jsonb;
  my_answer public.live_answers;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = p_session_id;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;

  caller_is_host := session_record.host_teacher_id = current_user_id;
  if not caller_is_host then
    select participant.* into participant_record
    from public.live_participants participant
    where participant.session_id = session_record.id
      and participant.user_id = current_user_id
      and participant.status = 'active';
    if participant_record.id is null then
      raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
    end if;
  end if;

  payload := jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'current_position', session_record.current_position,
    'question_count', session_record.question_count,
    'participant_count', (
      select count(*)
      from public.live_participants participant
      where participant.session_id = session_record.id
        and participant.status = 'active'
    ),
    'rules_version', session_record.rules_version,
    'server_time', clock_timestamp(),
    'is_host', caller_is_host
  );

  if session_record.state::text = 'paused' then
    payload := payload || jsonb_build_object(
      'paused_remaining_ms', session_record.paused_remaining_ms
    );
  end if;

  if session_record.state::text in (
    'question_open', 'question_feedback', 'paused'
  )
    and session_record.current_position > 0 then
    select question.* into question_record
    from public.live_session_questions question
    where question.session_id = session_record.id
      and question."position" = session_record.current_position;

    payload := payload || jsonb_build_object(
      'question', public.live_question_payload(question_record),
      'answered_count', (
        select count(*)
        from public.live_answers answer
        where answer.session_question_id = question_record.id
      )
    );

    if not caller_is_host then
      select answer.* into my_answer
      from public.live_answers answer
      where answer.session_question_id = question_record.id
        and answer.participant_id = participant_record.id;
    end if;

    if session_record.state = 'question_feedback' then
      payload := payload || jsonb_build_object(
        'correct_option_id', question_record.correct_option_id,
        'explanation', question_record.explanation,
        'option_counts', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'option_id', counted.selected_option_id,
                'count', counted.answer_count
              )
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
      if not caller_is_host and my_answer.id is not null then
        payload := payload || jsonb_build_object(
          'my_answer', jsonb_build_object(
            'answer_status', my_answer.answer_status,
            'selected_option_id', my_answer.selected_option_id,
            'score_delta', my_answer.score_delta
          )
        );
      end if;
    elsif not caller_is_host then
      payload := payload || jsonb_build_object(
        'my_answer', jsonb_build_object('answered', my_answer.id is not null)
      );
    end if;
  end if;

  if session_record.state = 'completed' then
    payload := payload || jsonb_build_object(
      'podium', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'rank', ranked.final_rank,
              'display_name', ranked.display_name,
              'score', ranked.score
            ) order by ranked.final_rank
          ),
          '[]'::jsonb
        )
        from (
          select
            participant.final_rank,
            profile.display_name,
            participant.score
          from public.live_participants participant
          join public.profiles profile on profile.id = participant.user_id
          where participant.session_id = session_record.id
            and participant.final_rank is not null
          order by participant.final_rank
          limit 3
        ) ranked
      )
    );
    if not caller_is_host then
      payload := payload || jsonb_build_object(
        'my_result', jsonb_build_object(
          'score', participant_record.score,
          'rank', participant_record.final_rank
        )
      );
    end if;
  end if;

  return payload;
end;
$$;
