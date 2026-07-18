-- Live team mode (2026-07-live-2): the server assigns teams on join
-- (smallest active team first, ties to the lowest number), team totals are
-- sums of authoritative individual scores, and individual scoring/rewards
-- stay exactly as Live Core.

alter table public.live_sessions
add column mode text not null default 'individual'
  check (mode in ('individual', 'team')),
add column team_count integer
  check (team_count is null or team_count between 2 and 4),
add constraint live_sessions_team_shape_check check (
  (mode = 'individual' and team_count is null)
  or (mode = 'team' and team_count is not null)
);
grant select (mode, team_count) on public.live_sessions to authenticated;

alter table public.live_participants
add column team_number integer
check (team_number is null or team_number >= 1);

-- The parameter list grows, so drop the old signature instead of stacking an
-- ambiguous overload next to it.
drop function public.create_live_session(uuid, uuid, uuid);

create function public.create_live_session(
  p_live_activity_id uuid,
  p_classroom_id uuid,
  p_assignment_id uuid default null,
  p_mode text default 'individual',
  p_team_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  code record;
  session_record public.live_sessions;
  attempt integer := 0;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_mode not in ('individual', 'team') then
    raise exception using errcode = 'P0001', message = 'LIVE_MODE_INVALID';
  end if;
  if (p_mode = 'team' and coalesce(p_team_count, 0) not between 2 and 4)
    or (p_mode = 'individual' and p_team_count is not null) then
    raise exception using errcode = 'P0001', message = 'LIVE_TEAM_COUNT_INVALID';
  end if;
  if not exists (
    select 1
    from public.live_activities activity
    where activity.id = p_live_activity_id
      and activity.owner_teacher_id = current_user_id
      and activity.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_ACTIVITY_NOT_FOUND';
  end if;
  if not exists (
    select 1
    from public.classrooms classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = current_user_id
      and classroom.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_CLASSROOM_NOT_FOUND';
  end if;
  if p_assignment_id is not null and not exists (
    select 1
    from public.assignments assignment
    where assignment.id = p_assignment_id
      and assignment.owner_teacher_id = current_user_id
      and assignment.classroom_id = p_classroom_id
      and assignment.activity_type = 'live_activity'
      and assignment.live_activity_id = p_live_activity_id
  ) then
    raise exception using errcode = 'P0001', message = 'LIVE_ASSIGNMENT_MISMATCH';
  end if;

  loop
    attempt := attempt + 1;
    select * into code from public.generate_live_join_code();
    begin
      insert into public.live_sessions (
        live_activity_id, host_teacher_id, classroom_id, assignment_id,
        join_code_hash, mode, team_count
      ) values (
        p_live_activity_id, current_user_id, p_classroom_id, p_assignment_id,
        code.code_hash, p_mode, p_team_count
      )
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
    'state', session_record.state,
    'state_version', session_record.state_version,
    'join_code', code.plain_code,
    'join_code_version', session_record.join_code_version,
    'mode', session_record.mode,
    'team_count', session_record.team_count
  );
end;
$$;

revoke all on function public.create_live_session(uuid, uuid, uuid, text, integer)
from public, anon;
grant execute on function
public.create_live_session(uuid, uuid, uuid, text, integer)
to authenticated;

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
  assigned_team integer;
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
  for update;
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

-- Team totals stay hidden until feedback; hosts and active participants of a
-- team session may read them, everyone else is told nothing exists.
create function public.live_team_totals(p_session_id uuid)
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
  where live_session.id = p_session_id;
  if session_record.id is null
    or (
      session_record.host_teacher_id <> current_user_id
      and not exists (
        select 1
        from public.live_participants participant
        where participant.session_id = session_record.id
          and participant.user_id = current_user_id
          and participant.status = 'active'
      )
    ) then
    raise exception using errcode = 'P0001', message = 'LIVE_SESSION_NOT_FOUND';
  end if;
  if session_record.mode <> 'team' then
    raise exception using errcode = 'P0001', message = 'LIVE_MODE_INVALID';
  end if;
  if session_record.state not in ('question_feedback', 'completed') then
    raise exception
      using errcode = 'P0001', message = 'LIVE_STATE_INVALID_TRANSITION';
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'team_number', grouped.team_number,
          'score', grouped.total_score,
          'member_count', grouped.member_count
        ) order by grouped.total_score desc, grouped.team_number
      ),
      '[]'::jsonb
    )
    from (
      select
        participant.team_number,
        sum(participant.score)::integer as total_score,
        count(*)::integer as member_count
      from public.live_participants participant
      where participant.session_id = session_record.id
        and participant.status = 'active'
      group by participant.team_number
    ) grouped
  );
end;
$$;

revoke all on function public.live_team_totals(uuid) from public, anon;
grant execute on function public.live_team_totals(uuid) to authenticated;
