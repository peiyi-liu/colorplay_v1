-- The lobby is where the host watches students arrive, yet joining never
-- broadcast anything: the host console (and every student's lobby view) only
-- refreshed on state transitions, so the participant count stayed stale until
-- the first question opened. Joins now broadcast the active participant count
-- at the unchanged state_version — the same in-state progress pattern the
-- answered_count broadcast uses — so lobby views patch their cache without a
-- state transition.

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
  active_count integer;
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
