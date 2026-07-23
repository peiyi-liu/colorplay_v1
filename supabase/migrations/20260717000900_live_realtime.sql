create or replace function public.live_topic_session_id(p_topic text)
returns uuid
language sql
immutable
as $$
  select case
    when p_topic ~ '^live-session:[0-9a-fA-F-]{36}$'
      then split_part(p_topic, ':', 2)::uuid
  end;
$$;

grant execute on function public.live_topic_session_id(text) to authenticated;

create policy live_session_member_receive
on realtime.messages
for select
to authenticated
using (
  public.live_topic_session_id(topic) is not null
  and (
    public.is_live_session_host(public.live_topic_session_id(topic))
    or public.is_active_live_participant(public.live_topic_session_id(topic))
  )
);

create policy live_session_host_send
on realtime.messages
for insert
to authenticated
with check (
  public.live_topic_session_id(topic) is not null
  and public.is_live_session_host(public.live_topic_session_id(topic))
);

create policy live_session_participant_presence
on realtime.messages
for insert
to authenticated
with check (
  public.live_topic_session_id(topic) is not null
  and extension = 'presence'
  and public.is_active_live_participant(public.live_topic_session_id(topic))
);

create or replace function public.live_broadcast(
  p_session_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform realtime.send(
    p_payload,
    'live_state',
    'live-session:' || p_session_id::text,
    true
  );
end;
$$;

revoke all on function public.live_broadcast(uuid, jsonb)
from public, anon, authenticated;

-- Transition commands now broadcast their committed state. Each replacement
-- preserves the Task 8/9 behavior and appends one private-channel emission.

create or replace function public.live_open_next_question(
  p_session_id uuid,
  p_next_position integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  session_record public.live_sessions;
  question_record public.live_session_questions;
  time_limit integer;
  payload jsonb;
begin
  select activity.question_time_limit_seconds
  into time_limit
  from public.live_sessions live_session
  join public.live_activities activity
    on activity.id = live_session.live_activity_id
  where live_session.id = p_session_id;

  update public.live_session_questions
  set opened_at = clock_timestamp(),
      deadline_at = clock_timestamp() + make_interval(secs => time_limit)
  where session_id = p_session_id
    and "position" = p_next_position
  returning * into question_record;
  if question_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_QUESTION_NOT_FOUND';
  end if;

  update public.live_sessions
  set state = 'question_open',
      current_position = p_next_position,
      state_version = state_version + 1,
      updated_at = clock_timestamp()
  where id = p_session_id
  returning * into session_record;

  payload := jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'question', public.live_question_payload(question_record)
  );
  perform public.live_broadcast(session_record.id, payload);
  return payload;
end;
$$;

create or replace function public.start_live_session(
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
  activity_record public.live_activities;
  template_record record;
  frozen_count integer;
  payload jsonb;
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
  if session_record.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  select activity.* into activity_record
  from public.live_activities activity
  where activity.id = session_record.live_activity_id;

  select template.question_count, template.chapter_id
  into template_record
  from public.quiz_templates template
  where template.id = activity_record.quiz_template_id;

  with question_candidates as (
    select
      question.id,
      question.stable_code,
      question.version,
      question.prompt,
      question.explanation,
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', question_option.id,
            'key', question_option.option_key,
            'text', question_option.option_text,
            'sort_order', question_option.sort_order
          ) order by question_option.sort_order
        )
        from public.question_options question_option
        where question_option.question_id = question.id
      ) as public_options,
      (
        select question_option.id
        from public.question_options question_option
        where question_option.question_id = question.id
          and question_option.is_correct
      ) as correct_option_id,
      random() as random_order
    from public.questions question
    join public.subtopics subtopic on subtopic.id = question.subtopic_id
    join public.sections section on section.id = subtopic.section_id
    where section.chapter_id = template_record.chapter_id
      and question.status = 'published'
  ), selected_questions as (
    select *
    from question_candidates
    order by random_order
    limit template_record.question_count
  )
  insert into public.live_session_questions (
    session_id, "position", question_stable_code, question_version, prompt,
    public_options, correct_option_id, explanation
  )
  select
    session_record.id,
    row_number() over (order by random_order)::integer,
    selected_questions.stable_code,
    selected_questions.version,
    selected_questions.prompt,
    selected_questions.public_options,
    selected_questions.correct_option_id,
    selected_questions.explanation
  from selected_questions;

  get diagnostics frozen_count = row_count;
  if frozen_count = 0 then
    raise exception using errcode = 'P0001', message = 'LIVE_TEMPLATE_HAS_NO_QUESTIONS';
  end if;

  update public.live_sessions
  set state = 'lobby',
      question_count = frozen_count,
      state_version = state_version + 1,
      opened_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  payload := jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'question_count', session_record.question_count
  );
  perform public.live_broadcast(session_record.id, payload);
  return payload;
end;
$$;

create or replace function public.close_live_question(
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
  payload jsonb;
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
  if session_record.state <> 'question_open' then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  select question.* into question_record
  from public.live_session_questions question
  where question.session_id = session_record.id
    and question."position" = session_record.current_position;

  insert into public.live_answers (
    session_question_id, participant_id, selected_option_id, answer_status,
    response_ms, score_delta, idempotency_key
  )
  select
    question_record.id, participant.id, null, 'timeout', null, 0,
    gen_random_uuid()
  from public.live_participants participant
  where participant.session_id = session_record.id
    and participant.status = 'active'
    and not exists (
      select 1
      from public.live_answers answer
      where answer.session_question_id = question_record.id
        and answer.participant_id = participant.id
    );

  update public.live_session_questions
  set closed_at = clock_timestamp()
  where id = question_record.id;

  update public.live_sessions
  set state = 'question_feedback',
      state_version = state_version + 1,
      updated_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  payload := jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'position', question_record."position",
    'correct_option_id', question_record.correct_option_id,
    'explanation', question_record.explanation,
    'answered_count', (
      select count(*)
      from public.live_answers answer
      where answer.session_question_id = question_record.id
    ),
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
  perform public.live_broadcast(session_record.id, payload);
  return payload;
end;
$$;

create or replace function public.finalize_live_session(
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
  assignment_record public.assignments;
  participant_row record;
  reward_row record;
  payload jsonb;
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

  if session_record.state = 'completed' then
    return public.live_completed_payload(session_record);
  end if;

  if p_expected_version is distinct from session_record.state_version then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_CONFLICT';
  end if;
  if session_record.state <> 'question_feedback'
    or session_record.current_position <> session_record.question_count then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  update public.live_participants participant
  set final_rank = ranked.computed_rank
  from (
    select
      participant.id,
      row_number() over (
        order by
          participant.score desc,
          last_correct.last_correct_at asc nulls last,
          participant.user_id asc
      )::integer as computed_rank
    from public.live_participants participant
    left join lateral (
      select max(answer.submitted_at) as last_correct_at
      from public.live_answers answer
      join public.live_session_questions question
        on question.id = answer.session_question_id
      where answer.participant_id = participant.id
        and question.session_id = session_record.id
        and answer.answer_status = 'correct'
    ) last_correct on true
    where participant.session_id = session_record.id
      and participant.status = 'active'
  ) ranked
  where participant.id = ranked.id;

  for reward_row in
    select
      participant.user_id,
      coalesce(sum(
        case
          when answer.answer_status = 'correct' and answer.response_ms <= 5000
            then 75
          when answer.answer_status = 'correct' then 50
          else 0
        end
      ), 0)::integer as xp_amount,
      coalesce(sum(
        case
          when answer.answer_status = 'correct' and answer.response_ms <= 5000
            then 25
          when answer.answer_status = 'correct' then 15
          else 0
        end
      ), 0)::integer as token_amount
    from public.live_participants participant
    left join public.live_answers answer
      on answer.participant_id = participant.id
    where participant.session_id = session_record.id
      and participant.status = 'active'
    group by participant.user_id
  loop
    if reward_row.xp_amount > 0 then
      insert into public.xp_transactions (
        user_id, amount, reason, source_type, source_id
      ) values (
        reward_row.user_id, reward_row.xp_amount, 'live session reward',
        'live', session_record.id
      )
      on conflict (user_id, source_type, source_id) do nothing;
    end if;
    if reward_row.token_amount > 0 then
      insert into public.wallet_transactions (
        user_id, amount, reason, source_type, source_id
      ) values (
        reward_row.user_id, reward_row.token_amount, 'live session reward',
        'live', session_record.id
      )
      on conflict (user_id, source_type, source_id) do nothing;

      perform 1
      from public.wallets
      where user_id = reward_row.user_id
      for update;
      update public.wallets
      set token_balance = token_balance + reward_row.token_amount,
          updated_at = clock_timestamp()
      where user_id = reward_row.user_id;
    end if;
  end loop;

  if session_record.assignment_id is not null then
    select assignment.* into assignment_record
    from public.assignments assignment
    where assignment.id = session_record.assignment_id
    for update;

    for participant_row in
      select participant.user_id, participant.score
      from public.live_participants participant
      join public.assignment_targets target
        on target.assignment_id = assignment_record.id
        and target.user_id = participant.user_id
      where participant.session_id = session_record.id
        and participant.status = 'active'
        and not exists (
          select 1
          from public.assignment_attempts attempt
          where attempt.live_session_id = session_record.id
            and attempt.user_id = participant.user_id
        )
    loop
      if assignment_record.attempt_limit is not null and (
        select count(*)
        from public.assignment_attempts attempt
        where attempt.assignment_id = assignment_record.id
          and attempt.user_id = participant_row.user_id
      ) >= assignment_record.attempt_limit then
        continue;
      end if;

      if assignment_record.deadline_at is not null
        and clock_timestamp() > assignment_record.deadline_at then
        insert into public.assignment_attempts (
          assignment_id, user_id, attempt_number, live_session_id, status
        )
        select
          assignment_record.id, participant_row.user_id,
          coalesce(max(attempt.attempt_number), 0) + 1,
          session_record.id, 'expired'
        from public.assignment_attempts attempt
        where attempt.assignment_id = assignment_record.id
          and attempt.user_id = participant_row.user_id;
      else
        insert into public.assignment_attempts (
          assignment_id, user_id, attempt_number, live_session_id, status,
          passed, completed_at
        )
        select
          assignment_record.id, participant_row.user_id,
          coalesce(max(attempt.attempt_number), 0) + 1,
          session_record.id, 'completed',
          participant_row.score >=
            (assignment_record.passing_rule ->> 'threshold')::integer,
          clock_timestamp()
        from public.assignment_attempts attempt
        where attempt.assignment_id = assignment_record.id
          and attempt.user_id = participant_row.user_id;
      end if;
    end loop;
  end if;

  update public.live_sessions
  set state = 'completed',
      completed_at = clock_timestamp(),
      state_version = state_version + 1,
      updated_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  payload := public.live_completed_payload(session_record);
  perform public.live_broadcast(session_record.id, payload);
  return payload;
end;
$$;

create or replace function public.cancel_live_session(
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
  payload jsonb;
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
  if session_record.state not in (
    'draft', 'lobby', 'question_open', 'question_feedback'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  update public.live_sessions
  set state = 'cancelled',
      cancelled_at = clock_timestamp(),
      state_version = state_version + 1,
      updated_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  payload := jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version
  );
  perform public.live_broadcast(session_record.id, payload);
  return payload;
end;
$$;
