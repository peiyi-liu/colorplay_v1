-- 10D student experience: dual-screen mode filters the question text out of
-- every student-visible payload on the server (state reads and broadcasts),
-- an activity-level switch keeps the old question-on-device mode available,
-- late joiners are admitted mid-game and become eligible from the next
-- question, and a participant-only standing read powers the between-question
-- personal feedback (rank / gap / encouragement).

-- Activity-level display switch. The owner ruled dual-screen is the
-- classroom default; device mode remains for remote / self-study sessions.
alter table public.live_activities
  add column question_display text not null default 'screen_only'
  constraint live_activities_question_display_check
  check (question_display in ('screen_only', 'device'));

-- Late joiners take part starting with the next question. The anchor is a
-- question position (not a timestamp) because resume rewrites opened_at.
alter table public.live_participants
  add column eligible_from_position integer not null default 1
  constraint live_participants_eligible_from_position_check
  check (eligible_from_position >= 1);

-- create_live_activity v2: the display switch is chosen at creation time.
drop function public.create_live_activity(text, uuid, integer);
create function public.create_live_activity(
  p_title text,
  p_quiz_template_id uuid,
  p_question_time_limit_seconds integer default 20,
  p_question_display text default 'screen_only'
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
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = current_user_id
      and profile.role = 'teacher'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_TEACHER_ROLE_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.quiz_templates template
    where template.id = p_quiz_template_id
      and template.status = 'published'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_TEMPLATE_NOT_FOUND';
  end if;
  if coalesce(p_question_display, 'screen_only')
    not in ('screen_only', 'device') then
    raise exception using errcode = 'P0001', message = 'LIVE_INVALID_REQUEST';
  end if;

  insert into public.live_activities (
    owner_teacher_id, title, quiz_template_id, question_time_limit_seconds,
    question_display
  ) values (
    current_user_id, p_title, p_quiz_template_id,
    coalesce(p_question_time_limit_seconds, 20),
    coalesce(p_question_display, 'screen_only')
  )
  returning * into activity_record;

  return jsonb_build_object(
    'activity_id', activity_record.id,
    'title', activity_record.title,
    'quiz_template_id', activity_record.quiz_template_id,
    'question_time_limit_seconds', activity_record.question_time_limit_seconds,
    'status', activity_record.status,
    'rules_version', activity_record.rules_version,
    'question_display', activity_record.question_display
  );
end;
$$;

revoke all on function public.create_live_activity(text, uuid, integer, text)
from public, anon;
grant execute on function public.create_live_activity(text, uuid, integer, text)
to authenticated;

-- The student-facing question payload in screen_only mode: identity, timing
-- and option identities (id / key / sort order) only — no prompt, no option
-- text. The projector (host) keeps the full payload.
create function public.live_question_student_payload(
  target_question public.live_session_questions
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'question_id', target_question.id,
    'position', target_question."position",
    'public_options', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', option_value -> 'id',
            'key', option_value -> 'key',
            'sort_order', option_value -> 'sort_order'
          )
          order by (option_value ->> 'sort_order')::integer
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(target_question.public_options) option_value
    ),
    'opened_at', target_question.opened_at,
    'deadline_at', target_question.deadline_at
  );
$$;

revoke all on function public.live_question_student_payload(
  public.live_session_questions
)
from public, anon, authenticated;

create function public.live_session_question_display(
  target_session public.live_sessions
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select activity.question_display
  from public.live_activities activity
  where activity.id = target_session.live_activity_id;
$$;

revoke all on function public.live_session_question_display(
  public.live_sessions
)
from public, anon, authenticated;

-- live_open_next_question v4: the shared-channel broadcast reaches every
-- student device, so in screen_only mode it carries the filtered question.
-- The host still receives the full payload as the command receipt.
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

  perform public.live_broadcast(
    session_record.id,
    jsonb_build_object(
      'session_id', session_record.id,
      'state', session_record.state,
      'state_version', session_record.state_version,
      'question', case
        when public.live_session_question_display(session_record)
          = 'screen_only'
          then public.live_question_student_payload(question_record)
        else public.live_question_payload(question_record)
      end
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

revoke all on function public.live_open_next_question(uuid, integer)
from public, anon, authenticated;

-- resume_live_session v2: same broadcast filtering as the open transition.
create or replace function public.resume_live_session(
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
      'question', case
        when public.live_session_question_display(session_record)
          = 'screen_only'
          then public.live_question_student_payload(question_record)
        else public.live_question_payload(question_record)
      end
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

-- join_live_session v6: a first-time joiner arriving after the lobby is now
-- admitted (late join) and becomes eligible from the next question, so the
-- open question's auto-close and timeout backfill never count them.
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

  if not join_failed and session_record.state <> 'lobby'
    and exists (
      select 1
      from public.live_participants participant
      where participant.session_id = session_record.id
        and participant.user_id = current_user_id
        and participant.status = 'active'
    ) then
    -- A lost-response retry from someone already in the room: hand back the
    -- receipt without re-broadcasting.
    return jsonb_build_object(
      'session_id', session_record.id,
      'state', session_record.state,
      'state_version', session_record.state_version
    );
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

  -- Rejoining keeps the original eligibility anchor; only a brand-new
  -- mid-game participant waits for the next question. joined_at takes the
  -- statement clock (not the transaction clock) so the nickname-wall order
  -- is deterministic even when two joins share a transaction.
  insert into public.live_participants (
    session_id, user_id, eligible_from_position, joined_at
  )
  values (
    session_record.id,
    current_user_id,
    case
      when session_record.state = 'lobby' then 1
      else session_record.current_position + 1
    end,
    clock_timestamp()
  )
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
      'participant_count', active_count,
      'joined_display_name', (
        select profile.display_name
        from public.profiles profile
        where profile.id = current_user_id
      )
    )
  );

  return jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version
  );
end;
$$;

-- live_close_open_question v2: the timeout backfill only covers participants
-- who were eligible for the question; late joiners never receive a timeout
-- row for a question they could not see.
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
    and participant.eligible_from_position <= question_record."position"
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

-- submit_live_answer v3: late joiners cannot answer the question that was
-- already open when they arrived, and the all-answered automatic close only
-- waits for eligible participants.
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

-- get_live_session_state v7: the payload names the display mode, students in
-- screen_only mode receive the filtered question (no prompt, no option text,
-- no explanation), and a not-yet-eligible late joiner gets a waiting flag
-- instead of any question data.
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
  display_mode text;
  full_question boolean;
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

  display_mode := public.live_session_question_display(session_record);
  full_question := caller_is_host or display_mode = 'device';

  payload := jsonb_build_object(
    'session_id', session_record.id,
    'state', session_record.state,
    'state_version', session_record.state_version,
    'current_position', session_record.current_position,
    'question_count', session_record.question_count,
    'mode', session_record.mode,
    'team_count', session_record.team_count,
    'participant_count', (
      select count(*)
      from public.live_participants participant
      where participant.session_id = session_record.id
        and participant.status = 'active'
    ),
    'rules_version', session_record.rules_version,
    'question_display', display_mode,
    'server_time', clock_timestamp(),
    'is_host', caller_is_host
  );

  if session_record.state::text = 'lobby' then
    payload := payload || jsonb_build_object(
      'participants', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('display_name', roster.display_name)
            order by roster.joined_at, roster.id
          ),
          '[]'::jsonb
        )
        from (
          select profile.display_name, participant.joined_at, participant.id
          from public.live_participants participant
          join public.profiles profile on profile.id = participant.user_id
          where participant.session_id = session_record.id
            and participant.status = 'active'
        ) roster
      )
    );
  end if;

  if session_record.state::text = 'paused' then
    payload := payload || jsonb_build_object(
      'paused_remaining_ms', session_record.paused_remaining_ms
    );
  end if;

  if session_record.state::text in (
    'question_open', 'question_feedback', 'paused'
  )
    and session_record.current_position > 0 then
    if not caller_is_host
      and participant_record.eligible_from_position
        > session_record.current_position then
      -- Late joiner waiting room: no question data of any kind until the
      -- next question opens.
      return payload || jsonb_build_object('waiting_for_next', true);
    end if;

    select question.* into question_record
    from public.live_session_questions question
    where question.session_id = session_record.id
      and question."position" = session_record.current_position;

    payload := payload || jsonb_build_object(
      'question', case
        when full_question
          then public.live_question_payload(question_record)
        else public.live_question_student_payload(question_record)
      end,
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
        'explanation', case
          when full_question then question_record.explanation
          else null
        end,
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

-- Participant-only personal standing between questions: my rank, my score
-- and the gap to the participant ranked directly above me. Numbers only —
-- no other student's name crosses to a student device. Ties break exactly
-- like live_session_standings and finalize.
create function public.live_my_standing(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.live_sessions;
  participant_record public.live_participants;
  result jsonb;
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

  select participant.* into participant_record
  from public.live_participants participant
  where participant.session_id = session_record.id
    and participant.user_id = current_user_id
    and participant.status = 'active';
  if participant_record.id is null then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;
  if session_record.state::text <> 'question_feedback' then
    raise exception
      using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  with ranked as (
    select
      participant.id,
      participant.score,
      row_number() over (
        order by
          participant.score desc,
          last_correct.last_correct_at asc nulls last,
          participant.user_id asc
      )::integer as standing_rank
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
  )
  select jsonb_build_object(
    'rank', mine.standing_rank,
    'score', mine.score,
    'participant_count', (select count(*) from ranked),
    'ahead_rank', ahead.standing_rank,
    'points_behind', case
      when ahead.id is null then null
      else ahead.score - mine.score
    end
  )
  into result
  from ranked mine
  left join ranked ahead on ahead.standing_rank = mine.standing_rank - 1
  where mine.id = participant_record.id;

  return result;
end;
$$;

revoke all on function public.live_my_standing(uuid) from public, anon;
grant execute on function public.live_my_standing(uuid) to authenticated;
