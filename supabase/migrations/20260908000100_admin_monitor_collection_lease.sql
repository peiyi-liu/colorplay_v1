-- Serialize and throttle the externally triggered Staging monitoring collector.
-- The schedule key is intentionally replayable; this database lease ensures a
-- replay cannot fan out Management API or Storage probes.
create table admin_monitoring.collection_control (
  environment text primary key check (environment = 'staging'),
  lease_request_id uuid,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_succeeded boolean,
  check ((lease_request_id is null) = (lease_until is null))
);

insert into admin_monitoring.collection_control(environment)
values ('staging')
on conflict (environment) do nothing;

alter table admin_monitoring.collection_control enable row level security;
revoke all on admin_monitoring.collection_control from public, anon, authenticated;

create function public.svc_admin_monitor_begin_collection(p_request_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
set statement_timeout = '5s'
as $$
declare
  v_acquired boolean;
  v_retry_after integer;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'MONITOR_REQUEST_ID_INVALID';
  end if;

  update admin_monitoring.collection_control
  set lease_request_id = p_request_id,
      lease_until = now() + interval '5 minutes',
      last_started_at = now(),
      last_succeeded = null
  where environment = 'staging'
    and (lease_until is null or lease_until <= now())
    and (last_started_at is null or last_started_at <= now() - interval '5 minutes')
  returning true into v_acquired;

  if v_acquired is true then
    return jsonb_build_object('outcome', 'started');
  end if;

  select greatest(
    1,
    ceil(extract(epoch from greatest(
      coalesce(lease_until, now()),
      coalesce(last_started_at + interval '5 minutes', now())
    ) - now()))::integer
  )
  into v_retry_after
  from admin_monitoring.collection_control
  where environment = 'staging';

  return jsonb_build_object(
    'outcome', 'busy',
    'retry_after_seconds', coalesce(v_retry_after, 60)
  );
end;
$$;
revoke all on function public.svc_admin_monitor_begin_collection(uuid) from public, anon, authenticated;
grant execute on function public.svc_admin_monitor_begin_collection(uuid) to service_role;

create function public.svc_admin_monitor_record_collection(
  p_request_id uuid,
  p_observations jsonb
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
set statement_timeout = '5s'
as $$
begin
  if p_request_id is null
    or jsonb_typeof(p_observations) is distinct from 'array'
    or jsonb_array_length(p_observations) > 8 then
    raise exception using errcode = '22023', message = 'MONITOR_OBSERVATIONS_INVALID';
  end if;

  perform 1
  from admin_monitoring.collection_control
  where environment = 'staging'
    and lease_request_id is not distinct from p_request_id
    and lease_until > now()
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'MONITOR_LEASE_INVALID';
  end if;

  insert into admin_monitoring.observations(
    signal, environment, status, value, sample_count, failed_count, p95_ms,
    checked_at, observed_at, window_started_at, revision, evidence_run_id
  )
  select signal, environment, status, value, sample_count, failed_count, p95_ms,
    now(), observed_at, window_started_at, revision, evidence_run_id
  from jsonb_to_recordset(p_observations) as incoming(
    signal text, environment text, status text, value numeric,
    sample_count bigint, failed_count bigint, p95_ms numeric,
    observed_at timestamptz, window_started_at timestamptz,
    revision text, evidence_run_id bigint
  )
  on conflict (signal) do update
  set environment = excluded.environment,
      status = excluded.status,
      value = excluded.value,
      sample_count = excluded.sample_count,
      failed_count = excluded.failed_count,
      p95_ms = excluded.p95_ms,
      checked_at = excluded.checked_at,
      observed_at = excluded.observed_at,
      window_started_at = excluded.window_started_at,
      revision = excluded.revision,
      evidence_run_id = excluded.evidence_run_id;

  update admin_monitoring.collection_control
  set lease_request_id = null,
      lease_until = null,
      last_finished_at = now(),
      last_succeeded = true
  where environment = 'staging'
    and lease_request_id is not distinct from p_request_id;

  return jsonb_build_object('outcome', 'recorded');
end;
$$;
revoke all on function public.svc_admin_monitor_record_collection(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.svc_admin_monitor_record_collection(uuid, jsonb) to service_role;

create function public.svc_admin_monitor_finish_collection(
  p_request_id uuid,
  p_succeeded boolean
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
set statement_timeout = '5s'
as $$
begin
  if p_request_id is null or p_succeeded is distinct from false then
    raise exception using errcode = '22023', message = 'MONITOR_FINISH_INVALID';
  end if;

  update admin_monitoring.collection_control
  set lease_request_id = null,
      lease_until = null,
      last_finished_at = now(),
      last_succeeded = false
  where environment = 'staging'
    and lease_request_id is not distinct from p_request_id;

  return jsonb_build_object(
    'outcome', case when found then 'finished' else 'ignored' end
  );
end;
$$;
revoke all on function public.svc_admin_monitor_finish_collection(uuid, boolean) from public, anon, authenticated;
grant execute on function public.svc_admin_monitor_finish_collection(uuid, boolean) to service_role;

-- Retire the pre-lease write seam so even service-role callers cannot bypass
-- request binding or publish after another collector has taken over.
revoke execute on function public.svc_admin_record_monitor_observations(jsonb) from service_role;
