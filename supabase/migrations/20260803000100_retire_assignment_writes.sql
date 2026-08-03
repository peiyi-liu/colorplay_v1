-- Assignment UI and routes are retired. Keep historical schema and read RPCs,
-- but make every former mutation entry point fail with one stable error so old
-- clients cannot create new Assignment state.

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
begin
  raise exception using
    errcode = 'P0001',
    message = 'ASSIGNMENT_FEATURE_RETIRED';
end;
$$;

create or replace function public.update_assignment_status(
  p_assignment_id uuid,
  p_status public.assignment_status,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'ASSIGNMENT_FEATURE_RETIRED';
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
begin
  raise exception using
    errcode = 'P0001',
    message = 'ASSIGNMENT_FEATURE_RETIRED';
end;
$$;

revoke all on function public.create_assignment(
  uuid, text, public.assignment_activity_type, uuid,
  timestamptz, timestamptz, integer, integer
) from public, anon;
revoke all on function public.update_assignment_status(
  uuid, public.assignment_status, timestamptz
) from public, anon;
revoke all on function public.start_assignment_attempt(uuid, uuid)
from public, anon;

grant execute on function public.create_assignment(
  uuid, text, public.assignment_activity_type, uuid,
  timestamptz, timestamptz, integer, integer
) to authenticated;
grant execute on function public.update_assignment_status(
  uuid, public.assignment_status, timestamptz
) to authenticated;
grant execute on function public.start_assignment_attempt(uuid, uuid)
to authenticated;

-- Live remains available as an independent teacher-hosted flow. The latest
-- five-argument command keeps its current behavior for a null Assignment ID,
-- but no new session may create a link into retired Assignment state.
create or replace function public.create_live_session(
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
  if p_assignment_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ASSIGNMENT_FEATURE_RETIRED';
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
