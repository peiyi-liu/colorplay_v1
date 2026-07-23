-- Live scoring v2 (2026-07-live-3, milestone 10A): speed-based scores
-- (150 at 0 ms falling linearly to 75 at the deadline), automatic close
-- once every active participant has answered, and six-digit numeric join
-- codes whose uniqueness only spans active sessions. The six-digit space
-- is brute-forceable, so failed joins are counted per user and returned
-- as committed payload errors instead of raised exceptions (a raise
-- would roll the throttle counter back with it).

alter table public.live_activities
alter column rules_version set default '2026-07-live-3';

alter table public.live_sessions
alter column rules_version set default '2026-07-live-3';

-- Completed and cancelled sessions release their code back to the pool;
-- the old predicate also missed 'paused', which could have made a resume
-- collide after a duplicate code was handed out.
drop index if exists public.live_sessions_join_code_hash_unique;
create unique index live_sessions_join_code_hash_active_unique
on public.live_sessions(join_code_hash)
where state not in ('completed', 'cancelled');

create table public.live_join_throttle (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default clock_timestamp(),
  failure_count integer not null default 0 check (failure_count >= 0)
);
alter table public.live_join_throttle enable row level security;
revoke all on table public.live_join_throttle from public, anon, authenticated;

create or replace function public.generate_live_join_code(
  out plain_code text,
  out code_hash bytea
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  raw_bytes bytea := extensions.gen_random_bytes(4);
  random_value bigint;
begin
  random_value :=
    (get_byte(raw_bytes, 0)::bigint << 24)
    + (get_byte(raw_bytes, 1)::bigint << 16)
    + (get_byte(raw_bytes, 2)::bigint << 8)
    + get_byte(raw_bytes, 3)::bigint;
  plain_code := lpad((random_value % 1000000)::text, 6, '0');
  code_hash := extensions.digest(plain_code, 'sha256');
end;
$$;

-- The million-code pool makes rotate collisions possible, so it retries
-- like create_live_session always has.
create or replace function public.rotate_live_join_code(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  code record;
  attempt integer := 0;
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
  if session_record.state not in ('draft', 'lobby') then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  loop
    attempt := attempt + 1;
    select * into code from public.generate_live_join_code();
    begin
      update public.live_sessions
      set join_code_hash = code.code_hash,
          join_code_version = join_code_version + 1,
          updated_at = clock_timestamp()
      where id = session_record.id
      returning * into session_record;
      exit;
    exception
      when unique_violation then
        if attempt >= 5 then
          raise exception
            using errcode = 'P0001', message = 'LIVE_CODE_GENERATION_FAILED';
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'session_id', session_record.id,
    'join_code', code.plain_code,
    'join_code_version', session_record.join_code_version
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
  participant_record public.live_participants;
  throttle_record public.live_join_throttle;
  assigned_team integer;
  active_count integer;
  join_failed boolean := false;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_INVALID_REQUEST';
  end if;

  select throttle.* into throttle_record
  from public.live_join_throttle throttle
  where throttle.user_id = current_user_id
  for update;
  if throttle_record.user_id is not null
    and clock_timestamp() - throttle_record.window_started_at
      < interval '60 seconds'
    and throttle_record.failure_count >= 10 then
    return jsonb_build_object('error', 'LIVE_JOIN_RATE_LIMITED');
  end if;

  normalized := regexp_replace(coalesce(p_join_code, ''), '[\s-]', '', 'g');
  if normalized !~ '^[0-9]{6}$' then
    join_failed := true;
  else
    select live_session.* into session_record
    from public.live_sessions live_session
    where live_session.join_code_hash = extensions.digest(normalized, 'sha256')
      and live_session.state in ('lobby', 'question_open', 'question_feedback')
    for update;
    if session_record.id is null then
      join_failed := true;
    end if;
  end if;

  if not join_failed and session_record.state <> 'lobby' then
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
    join_failed := true;
  end if;

  if not join_failed and not exists (
    select 1
    from public.classroom_members member
    where member.classroom_id = session_record.classroom_id
      and member.user_id = current_user_id
      and member.member_role = 'student'
      and member.status = 'active'
  ) then
    join_failed := true;
  end if;

  if join_failed then
    insert into public.live_join_throttle (
      user_id, window_started_at, failure_count
    )
    values (current_user_id, clock_timestamp(), 1)
    on conflict (user_id) do update
    set window_started_at = case
          when clock_timestamp() - live_join_throttle.window_started_at
            >= interval '60 seconds'
            then clock_timestamp()
          else live_join_throttle.window_started_at
        end,
        failure_count = case
          when clock_timestamp() - live_join_throttle.window_started_at
            >= interval '60 seconds'
            then 1
          else live_join_throttle.failure_count + 1
        end;
    return jsonb_build_object('error', 'LIVE_JOIN_INVALID_CODE');
  end if;

  insert into public.live_participants (session_id, user_id)
  values (session_record.id, current_user_id)
  on conflict (session_id, user_id)
  do update set status = 'active', left_at = null
  returning * into participant_record;

  -- Team sessions assign the smallest active team; rejoining keeps the
  -- original assignment so scores stay attached to the same team.
  if session_record.mode = 'team' and participant_record.team_number is null then
    select series.team into assigned_team
    from generate_series(1, session_record.team_count) series(team)
    left join public.live_participants member
      on member.session_id = session_record.id
      and member.status = 'active'
      and member.team_number = series.team
    group by series.team
    order by count(member.id), series.team
    limit 1;

    update public.live_participants
    set team_number = assigned_team
    where id = participant_record.id;
  end if;

  select count(*)::integer into active_count
  from public.live_participants participant
  where participant.session_id = session_record.id
    and participant.status = 'active';

  perform public.live_broadcast(
    session_record.id,
    jsonb_build_object(
      'session_id', session_record.id,
      'state', session_record.state,
      'state_version', session_record.state_version,
      'participant_count', active_count
    )
  );

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version
  );
end;
$$;

create or replace function public.live_feedback_snapshot(
  target_session public.live_sessions,
  target_question public.live_session_questions
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
    'position', target_question."position",
    'correct_option_id', target_question.correct_option_id,
    'explanation', target_question.explanation,
    'answered_count', (
      select count(*)
      from public.live_answers answer
      where answer.session_question_id = target_question.id
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
        where answer.session_question_id = target_question.id
        group by answer.selected_option_id
      ) counted
    )
  );
$$;

revoke all on function public.live_feedback_snapshot(
  public.live_sessions, public.live_session_questions
)
from public, anon, authenticated;

-- Shared close transition for the host command and the automatic close.
-- Returns null (without touching anything) when the question is no longer
-- open, which makes racing closers naturally idempotent.
create or replace function public.live_close_open_question(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  session_record public.live_sessions;
  question_record public.live_session_questions;
  payload jsonb;
begin
  select live_session.* into session_record
  from public.live_sessions live_session
  where live_session.id = p_session_id
  for update;
  if session_record.id is null or session_record.state <> 'question_open' then
    return null;
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

  payload := public.live_feedback_snapshot(session_record, question_record);
  perform public.live_broadcast(session_record.id, payload);
  return payload;
end;
$$;

revoke all on function public.live_close_open_question(uuid)
from public, anon, authenticated;

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

  -- A manual close racing the automatic one lands exactly one version
  -- behind on an already-closed question: hand back the same feedback
  -- receipt instead of a conflict (and do not broadcast again).
  if session_record.state = 'question_feedback'
    and p_expected_version = session_record.state_version - 1 then
    select question.* into question_record
    from public.live_session_questions question
    where question.session_id = session_record.id
      and question."position" = session_record.current_position;
    return public.live_feedback_snapshot(session_record, question_record);
  end if;

  if p_expected_version is distinct from session_record.state_version then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_CONFLICT';
  end if;
  if session_record.state <> 'question_open' then
    raise exception using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  return public.live_close_open_question(session_record.id);
end;
$$;

-- Speed scoring (2026-07-live-3) plus the all-answered automatic close.
-- The session row is now locked for update so concurrent submissions
-- serialize and exactly one of them observes the full answer set.
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
    if not exists (
      select 1
      from public.live_participants participant
      where participant.session_id = session_record.id
        and participant.status = 'active'
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

  if not exists (
    select 1
    from public.live_participants participant
    where participant.session_id = session_record.id
      and participant.status = 'active'
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

-- The host's distribution poll races the automatic close (the answered-count
-- broadcast can land a refetch just after the state flips), so the host may
-- also read it during question_feedback — where the distribution is public
-- to everyone anyway.
create or replace function public.live_question_distribution(p_session_id uuid)
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
  if session_record.state::text not in (
    'question_open', 'paused', 'question_feedback'
  )
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
