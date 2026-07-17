-- The single-column unique index from the assignments migration assumed one
-- attempt per live session; a live session derives one attempt per
-- participant, so the uniqueness is per session and student.
drop index if exists assignment_attempts_live_session_unique;
create unique index assignment_attempts_live_session_user_unique
on public.assignment_attempts(live_session_id, user_id)
where live_session_id is not null;

create or replace function public.live_question_payload(
  target_question public.live_session_questions
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'position', target_question."position",
    'prompt', target_question.prompt,
    'public_options', target_question.public_options,
    'opened_at', target_question.opened_at,
    'deadline_at', target_question.deadline_at
  );
$$;

revoke all on function public.live_question_payload(public.live_session_questions)
from public, anon, authenticated;

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

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'question', public.live_question_payload(question_record)
  );
end;
$$;

revoke all on function public.live_open_next_question(uuid, integer)
from public, anon, authenticated;

create function public.open_live_question(
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
  if session_record.state <> 'lobby' then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  return public.live_open_next_question(session_record.id, 1);
end;
$$;

create function public.advance_live_session(
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
  if session_record.state <> 'question_feedback'
    or session_record.current_position >= session_record.question_count then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  return public.live_open_next_question(
    session_record.id,
    session_record.current_position + 1
  );
end;
$$;

create function public.submit_live_answer(
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

  return result_payload;
end;
$$;

create function public.close_live_question(
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

  return jsonb_build_object(
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
end;
$$;

create or replace function public.live_completed_payload(
  target_session public.live_sessions
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'session_id', target_session.id,
    'state', target_session.state,
    'state_version', target_session.state_version,
    'participant_count', (
      select count(*)
      from public.live_participants participant
      where participant.session_id = target_session.id
        and participant.status = 'active'
    ),
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
        where participant.session_id = target_session.id
          and participant.final_rank is not null
        order by participant.final_rank
        limit 3
      ) ranked
    )
  );
$$;

revoke all on function public.live_completed_payload(public.live_sessions)
from public, anon, authenticated;

create function public.finalize_live_session(
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

  return public.live_completed_payload(session_record);
end;
$$;

create function public.cancel_live_session(
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

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version
  );
end;
$$;

-- Live assignments become creatable now that live_activities exists: replace
-- the creation command's live branch while preserving every other behavior.
create or replace function public.create_assignment(
  p_classroom_id uuid,
  p_title text,
  p_activity_type public.assignment_activity_type,
  p_activity_reference uuid,
  p_available_from timestamptz,
  p_deadline_at timestamptz,
  p_attempt_limit integer,
  p_passing_threshold integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  assignment_record public.assignments;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.classrooms classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = current_user_id
      and classroom.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'CLASSROOM_NOT_FOUND';
  end if;

  if p_passing_threshold is null or p_passing_threshold < 0 then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_INVALID_PASSING_RULE';
  end if;

  if p_activity_type = 'quiz_template' then
    if not exists (
      select 1
      from public.quiz_templates template
      where template.id = p_activity_reference
        and template.status = 'published'
    ) then
      raise exception using errcode = 'P0001', message = 'ASSIGNMENT_TEMPLATE_NOT_FOUND';
    end if;
  else
    if not exists (
      select 1
      from public.live_activities activity
      where activity.id = p_activity_reference
        and activity.owner_teacher_id = current_user_id
        and activity.status = 'active'
    ) then
      raise exception using errcode = 'P0001', message = 'ASSIGNMENT_LIVE_ACTIVITY_NOT_FOUND';
    end if;
  end if;

  insert into public.assignments (
    classroom_id, owner_teacher_id, title, activity_type, quiz_template_id,
    live_activity_id, available_from, deadline_at, attempt_limit, passing_rule,
    status
  ) values (
    p_classroom_id, current_user_id, p_title, p_activity_type,
    case when p_activity_type = 'quiz_template' then p_activity_reference end,
    case when p_activity_type = 'live_activity' then p_activity_reference end,
    p_available_from, p_deadline_at, p_attempt_limit,
    jsonb_build_object(
      'rule', 'score_at_least',
      'threshold', p_passing_threshold::text
    ),
    'draft'
  )
  returning * into assignment_record;

  return jsonb_build_object(
    'assignment_id', assignment_record.id,
    'classroom_id', assignment_record.classroom_id,
    'title', assignment_record.title,
    'activity_type', assignment_record.activity_type,
    'status', assignment_record.status,
    'available_from', assignment_record.available_from,
    'deadline_at', assignment_record.deadline_at,
    'attempt_limit', assignment_record.attempt_limit,
    'passing_threshold', (assignment_record.passing_rule ->> 'threshold')::integer,
    'created_at', assignment_record.created_at,
    'updated_at', assignment_record.updated_at
  );
end;
$$;

revoke all on function public.open_live_question(uuid, integer) from public, anon;
revoke all on function public.advance_live_session(uuid, integer) from public, anon;
revoke all on function public.submit_live_answer(uuid, uuid, uuid) from public, anon;
revoke all on function public.close_live_question(uuid, integer) from public, anon;
revoke all on function public.finalize_live_session(uuid, integer) from public, anon;
revoke all on function public.cancel_live_session(uuid, integer) from public, anon;

grant execute on function public.open_live_question(uuid, integer) to authenticated;
grant execute on function public.advance_live_session(uuid, integer) to authenticated;
grant execute on function public.submit_live_answer(uuid, uuid, uuid) to authenticated;
grant execute on function public.close_live_question(uuid, integer) to authenticated;
grant execute on function public.finalize_live_session(uuid, integer) to authenticated;
grant execute on function public.cancel_live_session(uuid, integer) to authenticated;
