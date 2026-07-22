-- 10B live presenter backend: the join broadcast now carries the joining
-- student's privacy-safe display name (nickname wall pop-in), the lobby
-- state payload carries the roster (wall rebuild on reconnect), and the
-- host-only live_session_standings powers the between-question Top 5.

-- join_live_session v5: identical to the 2026-07-live-3 version except the
-- success broadcast also names who just joined.
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

-- get_live_session_state v5: the lobby payload carries the privacy-safe
-- roster in join order so the wall survives refreshes and reconnects.
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
    'mode', session_record.mode,
    'team_count', session_record.team_count,
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

-- Host-only Top 5 between questions; ties break exactly like the finalize
-- ranking (score desc, earliest last correct answer, then user id).
create function public.live_session_standings(p_session_id uuid)
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
  if session_record.state::text <> 'question_feedback' then
    raise exception
      using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  return jsonb_build_object(
    'participant_count', (
      select count(*)
      from public.live_participants participant
      where participant.session_id = session_record.id
        and participant.status = 'active'
    ),
    'standings', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', ranked.standing_rank,
            'display_name', ranked.display_name,
            'score', ranked.score
          ) order by ranked.standing_rank
        ),
        '[]'::jsonb
      )
      from (
        select
          row_number() over (
            order by
              participant.score desc,
              last_correct.last_correct_at asc nulls last,
              participant.user_id asc
          )::integer as standing_rank,
          profile.display_name,
          participant.score
        from public.live_participants participant
        join public.profiles profile on profile.id = participant.user_id
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
        order by standing_rank
        limit 5
      ) ranked
    )
  );
end;
$$;

revoke all on function public.live_session_standings(uuid) from public, anon;
grant execute on function public.live_session_standings(uuid) to authenticated;
