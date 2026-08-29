-- Enforce classroom join throttling at a non-bypassable Edge/service boundary.
-- Identity: 10 failed codes / 10 minutes. Shared IP: 100 / 10 minutes.

create table public.classroom_join_rate_limits (
  scope text not null check (scope in ('identity', 'ip')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default clock_timestamp(),
  failure_count integer not null default 0 check (failure_count >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (scope, subject_hash)
);

alter table public.classroom_join_rate_limits enable row level security;
revoke all on table public.classroom_join_rate_limits
  from public, anon, authenticated, service_role;

create function public.svc_resolve_classroom_join_code(
  p_actor_id uuid,
  p_join_code text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_role public.app_role;
  identity_hash text := encode(
    extensions.digest(p_actor_id::text, 'sha256'),
    'hex'
  );
  normalized_code text := regexp_replace(
    upper(btrim(coalesce(p_join_code, ''))),
    '-',
    '',
    'g'
  );
  current_time timestamptz := clock_timestamp();
  window_duration constant interval := interval '10 minutes';
  identity_limit constant integer := 10;
  ip_limit constant integer := 100;
  identity_count integer;
  ip_count integer;
  identity_window timestamptz;
  ip_window timestamptz;
  selected_classroom_id uuid;
  selected_classroom_name text;
  retry_after_seconds integer;
begin
  if p_actor_id is null then
    return jsonb_build_object('outcome', 'denied', 'error', 'AUTH_REQUIRED');
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'outcome',
      'denied',
      'error',
      'RATE_LIMIT_SUBJECT_INVALID'
    );
  end if;

  select profile.role
  into actor_role
  from public.profiles as profile
  where profile.id = p_actor_id;
  if actor_role is distinct from 'student' then
    return jsonb_build_object('outcome', 'denied', 'error', 'STUDENT_REQUIRED');
  end if;

  insert into public.classroom_join_rate_limits (scope, subject_hash)
  values ('identity', identity_hash), ('ip', p_ip_hash)
  on conflict do nothing;

  perform 1
  from public.classroom_join_rate_limits as limiter
  where (limiter.scope = 'identity' and limiter.subject_hash = identity_hash)
     or (limiter.scope = 'ip' and limiter.subject_hash = p_ip_hash)
  order by limiter.scope, limiter.subject_hash
  for update;

  update public.classroom_join_rate_limits as limiter
  set window_started_at = current_time,
      failure_count = 0,
      updated_at = current_time
  where (
      (limiter.scope = 'identity' and limiter.subject_hash = identity_hash)
      or (limiter.scope = 'ip' and limiter.subject_hash = p_ip_hash)
    )
    and current_time - limiter.window_started_at >= window_duration;

  select limiter.failure_count, limiter.window_started_at
  into identity_count, identity_window
  from public.classroom_join_rate_limits as limiter
  where limiter.scope = 'identity' and limiter.subject_hash = identity_hash;

  select limiter.failure_count, limiter.window_started_at
  into ip_count, ip_window
  from public.classroom_join_rate_limits as limiter
  where limiter.scope = 'ip' and limiter.subject_hash = p_ip_hash;

  if identity_count >= identity_limit or ip_count >= ip_limit then
    retry_after_seconds := greatest(
      case when identity_count >= identity_limit then
        ceil(extract(epoch from identity_window + window_duration - current_time))::integer
      else 0 end,
      case when ip_count >= ip_limit then
        ceil(extract(epoch from ip_window + window_duration - current_time))::integer
      else 0 end,
      1
    );
    return jsonb_build_object(
      'outcome',
      'rate_limited',
      'retry_after_seconds',
      retry_after_seconds
    );
  end if;

  if normalized_code !~ '^([0-9A-HJKMNP-TV-Z]{8}|[0-9A-F]{16})$' then
    selected_classroom_id := null;
  else
    select classroom.id, classroom.name
    into selected_classroom_id, selected_classroom_name
    from public.classrooms as classroom
    where classroom.status = 'active'
      and classroom.join_code_hash = extensions.digest(normalized_code, 'sha256')
    for update;
  end if;

  if selected_classroom_id is null then
    update public.classroom_join_rate_limits as limiter
    set failure_count = limiter.failure_count + 1,
        updated_at = current_time
    where (limiter.scope = 'identity' and limiter.subject_hash = identity_hash)
       or (limiter.scope = 'ip' and limiter.subject_hash = p_ip_hash);

    identity_count := identity_count + 1;
    ip_count := ip_count + 1;
    if identity_count >= identity_limit or ip_count >= ip_limit then
      retry_after_seconds := greatest(
        case when identity_count >= identity_limit then
          ceil(extract(epoch from identity_window + window_duration - current_time))::integer
        else 0 end,
        case when ip_count >= ip_limit then
          ceil(extract(epoch from ip_window + window_duration - current_time))::integer
        else 0 end,
        1
      );
      return jsonb_build_object(
        'outcome',
        'rate_limited',
        'retry_after_seconds', retry_after_seconds
      );
    end if;
    return jsonb_build_object('outcome', 'invalid');
  end if;

  return jsonb_build_object(
    'outcome',
    'ok',
    'classroom_id',
    selected_classroom_id,
    'classroom_name',
    selected_classroom_name
  );
end;
$$;

create function public.svc_join_classroom(
  p_actor_id uuid,
  p_join_code text,
  p_request_id uuid,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  resolution jsonb;
  selected_classroom_id uuid;
  selected_classroom_name text;
  selected_status public.classroom_member_status;
  selected_joined_at timestamptz;
  transition_time timestamptz := clock_timestamp();
begin
  if p_request_id is null then
    return jsonb_build_object(
      'outcome',
      'denied',
      'error',
      'JOIN_REQUEST_ID_REQUIRED'
    );
  end if;

  resolution := public.svc_resolve_classroom_join_code(
    p_actor_id,
    p_join_code,
    p_ip_hash
  );
  if resolution->>'outcome' <> 'ok' then
    return resolution;
  end if;

  selected_classroom_id := (resolution->>'classroom_id')::uuid;
  selected_classroom_name := resolution->>'classroom_name';

  insert into public.classroom_members (
    classroom_id,
    user_id,
    member_role,
    status,
    joined_at,
    activated_at,
    deactivated_at,
    last_join_request_id,
    created_at,
    updated_at
  )
  values (
    selected_classroom_id,
    p_actor_id,
    'student',
    'active',
    transition_time,
    transition_time,
    null,
    p_request_id,
    transition_time,
    transition_time
  )
  on conflict on constraint classroom_members_pkey do update
  set status = 'active',
      activated_at = case
        when classroom_members.status = 'inactive' then excluded.activated_at
        else classroom_members.activated_at
      end,
      deactivated_at = null,
      last_join_request_id = case
        when classroom_members.status = 'inactive' then excluded.last_join_request_id
        else classroom_members.last_join_request_id
      end,
      updated_at = case
        when classroom_members.status = 'inactive' then excluded.updated_at
        else classroom_members.updated_at
      end
  where classroom_members.member_role = 'student'
  returning classroom_members.status, classroom_members.joined_at
  into selected_status, selected_joined_at;

  if not found then
    return jsonb_build_object(
      'outcome',
      'denied',
      'error',
      'CLASSROOM_MEMBERSHIP_CONFLICT'
    );
  end if;

  return jsonb_build_object(
    'outcome',
    'ok',
    'receipt',
    jsonb_build_array(
      jsonb_build_object(
        'classroom_id',
        selected_classroom_id,
        'classroom_name',
        selected_classroom_name,
        'membership_status',
        selected_status,
        'joined_at',
        selected_joined_at
      )
    )
  );
end;
$$;

revoke all on function public.join_classroom(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.svc_resolve_classroom_join_code(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.svc_join_classroom(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.svc_resolve_classroom_join_code(uuid, text, text)
  to service_role;
grant execute on function public.svc_join_classroom(uuid, text, uuid, text)
  to service_role;

comment on table public.classroom_join_rate_limits is
  'Service-only failed classroom join counters; IP subjects are HMAC fingerprints.';
comment on function public.svc_join_classroom(uuid, text, uuid, text) is
  'Service-only canonical classroom join command with identity and IP throttling.';
