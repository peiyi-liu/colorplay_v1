-- Review-hardening replacements from the Phase 4 complete-range review:
-- 1. live_topic_session_id only casts well-formed UUID topics (malformed
--    topics deny instead of raising inside the realtime policies).
-- 2. start_assignment_attempt refuses to bind a reused request id's foreign
--    or already-used session to an assignment attempt.
-- 3. join_live_session re-admits an existing active participant after the
--    lobby closes (lost-response retry) without admitting newcomers.
-- 4. submit_live_answer broadcasts the committed answered count so host
--    consoles observe progress without polling.
-- 5. finalize_live_session credits a wallet only when its ledger row
--    actually inserted.

create or replace function public.live_topic_session_id(p_topic text)
returns uuid
language sql
immutable
as $$
  select case
    when p_topic ~ '^live-session:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then split_part(p_topic, ':', 2)::uuid
  end;
$$;

create or replace function public.start_assignment_attempt(
  p_assignment_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  assignment_record public.assignments;
  existing_attempt public.assignment_attempts;
  attempt_record public.assignment_attempts;
  used_attempts integer;
  session_payload jsonb;
  new_session_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_INVALID_REQUEST';
  end if;

  select assignment.*
  into assignment_record
  from public.assignments assignment
  where assignment.id = p_assignment_id
    and exists (
      select 1
      from public.assignment_targets target
      where target.assignment_id = assignment.id
        and target.user_id = current_user_id
    )
    and exists (
      select 1
      from public.classroom_members member
      where member.classroom_id = assignment.classroom_id
        and member.user_id = current_user_id
        and member.member_role = 'student'
        and member.status = 'active'
    );

  if assignment_record.id is null then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;

  if assignment_record.status <> 'published' then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_PUBLISHED';
  end if;
  if assignment_record.available_from is not null
    and clock_timestamp() < assignment_record.available_from then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_AVAILABLE_YET';
  end if;
  if assignment_record.deadline_at is not null
    and clock_timestamp() >= assignment_record.deadline_at then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_DEADLINE_PASSED';
  end if;
  if assignment_record.activity_type <> 'quiz_template' then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_ACTIVITY_UNAVAILABLE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_assignment_id::text || current_user_id::text, 42)
  );

  select attempt.*
  into existing_attempt
  from public.assignment_attempts attempt
  join public.quiz_sessions session on session.id = attempt.quiz_session_id
  where attempt.assignment_id = assignment_record.id
    and attempt.user_id = current_user_id
    and session.client_request_id = p_request_id;

  if existing_attempt.id is not null then
    return jsonb_build_object(
      'attempt_id', existing_attempt.id,
      'assignment_id', existing_attempt.assignment_id,
      'attempt_number', existing_attempt.attempt_number,
      'session', public.build_quiz_session_payload(existing_attempt.quiz_session_id)
    );
  end if;

  select count(*)::integer
  into used_attempts
  from public.assignment_attempts attempt
  where attempt.assignment_id = assignment_record.id
    and attempt.user_id = current_user_id;

  if assignment_record.attempt_limit is not null
    and used_attempts >= assignment_record.attempt_limit then
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_ATTEMPT_LIMIT_REACHED';
  end if;

  insert into public.assignment_attempts (
    assignment_id, user_id, attempt_number, status
  ) values (
    assignment_record.id, current_user_id, used_attempts + 1, 'in_progress'
  )
  returning * into attempt_record;

  session_payload := public.create_quiz_session(
    assignment_record.quiz_template_id,
    p_request_id
  );
  new_session_id := (session_payload ->> 'session_id')::uuid;

  -- create_quiz_session is idempotent on (user, request id) across every
  -- template, so a reused request id could return an unrelated session.
  -- Only a fresh, unclaimed, unanswered session of the assigned template may
  -- be bound to the attempt.
  if not exists (
    select 1
    from public.quiz_sessions candidate
    where candidate.id = new_session_id
      and candidate.template_id = assignment_record.quiz_template_id
      and candidate.status = 'in_progress'
      and candidate.purpose = 'practice'
      and candidate.assignment_attempt_id is null
      and not exists (
        select 1
        from public.quiz_answers answer
        where answer.session_id = candidate.id
      )
  ) then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_INVALID_REQUEST';
  end if;

  update public.quiz_sessions
  set purpose = 'assignment',
      assignment_attempt_id = attempt_record.id
  where id = new_session_id;

  update public.assignment_attempts
  set quiz_session_id = new_session_id
  where id = attempt_record.id;

  return jsonb_build_object(
    'attempt_id', attempt_record.id,
    'assignment_id', attempt_record.assignment_id,
    'attempt_number', attempt_record.attempt_number,
    'session', public.build_quiz_session_payload(new_session_id)
  );
end;
$$;

create or replace function public.join_live_session(
  p_join_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized text;
  session_record public.live_sessions;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_INVALID_REQUEST';
  end if;

  normalized := upper(replace(coalesce(p_join_code, ''), '-', ''));
  if normalized !~ '^[0-9A-F]{16}$' then
    raise exception using errcode = 'P0001', message = 'LIVE_JOIN_INVALID_CODE';
  end if;

  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.join_code_hash = extensions.digest(normalized, 'sha256')
    and live_session.state in ('lobby', 'question_open', 'question_feedback')
  for share;
  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_JOIN_INVALID_CODE';
  end if;
  if session_record.state <> 'lobby' then
    -- After the lobby closes, the code only re-admits someone who already
    -- joined (a lost-response retry); it never admits a first-time joiner.
    if exists (
      select 1
      from public.live_participants participant
      where participant.session_id = session_record.id
        and participant.user_id = current_user_id
        and participant.status = 'active'
    ) then
      return jsonb_build_object(
        'session_id', session_record.id,
        'state', session_record.state,
        'state_version', session_record.state_version
      );
    end if;
    raise exception using errcode = 'P0001', message = 'LIVE_JOIN_INVALID_CODE';
  end if;
  if not exists (
    select 1
    from public.classroom_members member
    where member.classroom_id = session_record.classroom_id
      and member.user_id = current_user_id
      and member.member_role = 'student'
      and member.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_JOIN_INVALID_CODE';
  end if;

  insert into public.live_participants (session_id, user_id)
  values (session_record.id, current_user_id)
  on conflict (session_id, user_id)
  do update set status = 'active', left_at = null;

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version
  );
end;
$$;

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
      return result_payload;
    end if;
    raise exception using errcode = 'P0001', message = 'LIVE_ANSWER_ALREADY_SUBMITTED';
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
    perform public.live_broadcast(
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
    return result_payload;
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
        return result_payload;
      end if;
      raise exception using errcode = 'P0001', message = 'LIVE_ANSWER_ALREADY_SUBMITTED';
  end;

  if computed_delta > 0 then
    update public.live_participants
    set score = score + computed_delta
    where id = participant_record.id;
  end if;

  perform public.live_broadcast(
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

  return result_payload;
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
  ledger_rows_inserted integer;
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
      get diagnostics ledger_rows_inserted = row_count;

      -- The balance moves only when the ledger row actually inserted, so a
      -- replayed reward loop can never credit a wallet twice.
      if ledger_rows_inserted = 1 then
        perform 1
        from public.wallets
        where user_id = reward_row.user_id
        for update;
        update public.wallets
        set token_balance = token_balance + reward_row.token_amount,
            updated_at = clock_timestamp()
        where user_id = reward_row.user_id;
      end if;
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
