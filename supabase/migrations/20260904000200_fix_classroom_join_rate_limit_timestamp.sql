-- PostgreSQL parses the original variable name as a time-with-time-zone keyword inside the
-- original resolver. Use an unambiguous variable name so timestamp arithmetic
-- remains timestamptz - timestamptz on the real service join path.

create or replace function public.svc_resolve_classroom_join_code(
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
  attempted_at timestamptz := clock_timestamp();
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
  set window_started_at = attempted_at,
      failure_count = 0,
      updated_at = attempted_at
  where (
      (limiter.scope = 'identity' and limiter.subject_hash = identity_hash)
      or (limiter.scope = 'ip' and limiter.subject_hash = p_ip_hash)
    )
    and attempted_at - limiter.window_started_at >= window_duration;

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
        ceil(extract(epoch from identity_window + window_duration - attempted_at))::integer
      else 0 end,
      case when ip_count >= ip_limit then
        ceil(extract(epoch from ip_window + window_duration - attempted_at))::integer
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
        updated_at = attempted_at
    where (limiter.scope = 'identity' and limiter.subject_hash = identity_hash)
       or (limiter.scope = 'ip' and limiter.subject_hash = p_ip_hash);

    identity_count := identity_count + 1;
    ip_count := ip_count + 1;
    if identity_count >= identity_limit or ip_count >= ip_limit then
      retry_after_seconds := greatest(
        case when identity_count >= identity_limit then
          ceil(extract(epoch from identity_window + window_duration - attempted_at))::integer
        else 0 end,
        case when ip_count >= ip_limit then
          ceil(extract(epoch from ip_window + window_duration - attempted_at))::integer
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

comment on function public.svc_resolve_classroom_join_code(uuid, text, text) is
  'Service-only classroom join-code resolution with unambiguous timestamptz arithmetic.';
