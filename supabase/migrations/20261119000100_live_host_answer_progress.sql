-- Answers-only transport partition. Shared join/roster/phase and all answer decisions remain unchanged.
create schema if not exists live_private;
revoke all on schema live_private from public, anon, authenticated;
grant usage on schema live_private to authenticated;

create function live_private.host_progress_session_id(p_topic text)
returns uuid
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_topic ~ '^live-host-progress:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then split_part(p_topic, ':', 2)::uuid
  end;
$$;
revoke all on function live_private.host_progress_session_id(text) from public, anon;
grant execute on function live_private.host_progress_session_id(text) to authenticated;

create policy live_host_progress_receive
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and public.is_live_session_host(live_private.host_progress_session_id(topic))
);

create function live_private.broadcast_answer_progress(p_session_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform realtime.send(p_payload, 'live_state', 'live-host-progress:' || p_session_id::text, true);
end;
$$;
revoke all on function live_private.broadcast_answer_progress(uuid, jsonb)
from public, anon, authenticated;

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
  time_limit_ms integer;
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
  for update;

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
    or session_record.current_position <> question_record."position"
    or participant_record.eligible_from_position > question_record."position"
  then
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
    perform live_private.broadcast_answer_progress(
      session_record.id,
      jsonb_build_object(
        'session_id', session_record.id,
        'state', session_record.state,
        'state_version', session_record.state_version,
        'answered_count', (
          select count(*)
          from public.live_answers answer
          where answer.session_question_id = question_record.id
        )
      )
    );
    if not exists (
      select 1
      from public.live_participants participant
      where participant.session_id = session_record.id
        and participant.status = 'active'
        and participant.eligible_from_position <= question_record."position"
        and not exists (
          select 1
          from public.live_answers answer
          where answer.session_question_id = question_record.id
            and answer.participant_id = participant.id
        )
    ) then
      perform public.live_close_open_question(session_record.id);
    end if;
    return result_payload || jsonb_build_object('streak', 0);
  end if;

  -- Clamped at zero: a host-VM clock step between the open and the answer
  -- must never turn into a check-constraint 500 on a student's submission.
  computed_response := greatest(0, floor(
    extract(
      epoch from clock_timestamp() - question_record.opened_at
    ) * 1000
  )::integer);
  if p_selected_option_id = question_record.correct_option_id then
    computed_status := 'correct';
    if session_record.rules_version = '2026-07-live-3' then
      -- score = round(150 - 75 * response_ms / time_limit_ms): 150 at
      -- 0 ms, 75 when the whole window is used. The window comes from
      -- the frozen deadline so pauses never shrink it.
      time_limit_ms := greatest(1, round(extract(
        epoch from question_record.deadline_at - question_record.opened_at
      ) * 1000)::integer);
      computed_delta := greatest(75, least(150, round(
        150 - (75 * computed_response)::numeric / time_limit_ms
      )::integer));
    else
      computed_delta := case
        when computed_response <= 5000 then 150
        else 100
      end;
    end if;
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

  perform live_private.broadcast_answer_progress(
    session_record.id,
    jsonb_build_object(
      'session_id', session_record.id,
      'state', session_record.state,
      'state_version', session_record.state_version,
      'answered_count', (
        select count(*)
        from public.live_answers answer
        where answer.session_question_id = question_record.id
      )
    )
  );

  if not exists (
    select 1
    from public.live_participants participant
    where participant.session_id = session_record.id
      and participant.status = 'active'
      and participant.eligible_from_position <= question_record."position"
      and not exists (
        select 1
        from public.live_answers answer
        where answer.session_question_id = question_record.id
          and answer.participant_id = participant.id
      )
  ) then
    perform public.live_close_open_question(session_record.id);
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
