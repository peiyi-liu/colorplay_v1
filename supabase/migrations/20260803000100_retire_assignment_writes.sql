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
