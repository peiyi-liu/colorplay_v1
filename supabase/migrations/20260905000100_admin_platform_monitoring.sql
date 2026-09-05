-- Owner-authorized platform monitoring. No learner/teacher grants or business writes.
create schema admin_monitoring;
revoke all on schema admin_monitoring from public, anon, authenticated;
create table admin_monitoring.observations (
  signal text primary key check (signal in ('media_delivery', 'login_http', 'content_http', 'answer_http', 'release_proof', 'backup_inventory', 'backup_verification', 'restore_drill')),
  environment text not null check (environment = 'staging'),
  status text not null check (status in ('ok', 'attention', 'unknown')),
  value numeric check (value >= 0),
  sample_count bigint check (sample_count >= 0),
  failed_count bigint check (failed_count >= 0 and failed_count <= sample_count),
  p95_ms numeric check (p95_ms >= 0),
  checked_at timestamptz not null default now(),
  observed_at timestamptz,
  window_started_at timestamptz,
  revision text check (revision ~ '^[a-f0-9]{40}$'),
  evidence_run_id bigint check (evidence_run_id > 0),
  check (observed_at <= checked_at + interval '1 minute'),
  check (window_started_at <= observed_at)
);
alter table admin_monitoring.observations enable row level security;
revoke all on admin_monitoring.observations from public, anon, authenticated;

-- Only trusted database/management execution may collect or replace observations.
-- This schema is deliberately outside PostgREST's exposed schemas and the generic browser.
create function admin_monitoring.database_metrics()
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
with published_sections as (
  select s.id from public.sections s
  join public.chapters ch on ch.id = s.chapter_id and ch.status = 'published'
  join public.courses c on c.id = ch.course_id and c.status = 'published'
  where s.status = 'published'
), published_topics as (
  select st.id, st.section_id from public.subtopics st
  join published_sections s on s.id = st.section_id where st.status = 'published'
), published_cards as (
  select c.id, c.version from public.review_cards c
  join published_topics t on t.id = c.subtopic_id where c.status = 'published'
), published_questions as (
  select q.id, q.version from public.questions q
  join published_topics t on t.id = q.subtopic_id where q.status = 'published'
), metrics as (
  select 'sections_without_questions' as signal, count(*) as value,
    (select count(*) from published_sections) as sample_count
  from published_sections s where not exists (
    select 1 from public.questions q join published_topics t on t.id = q.subtopic_id
    where t.section_id = s.id and q.status = 'published'
  )
  union all
  select 'sections_insufficient_live_questions', count(*), (select count(*) from published_sections)
  from published_sections s where (select count(*) from public.questions q
    join published_topics t on t.id = q.subtopic_id where t.section_id = s.id
    and q.status = 'published' and q.bank_kind = 'live') < 20
  union all
  select 'sections_without_cards', count(*), (select count(*) from published_sections)
  from published_sections s where not exists (
    select 1 from public.review_cards c join published_topics t on t.id = c.subtopic_id
    where t.section_id = s.id and c.status = 'published'
  )
  union all
  select 'media_objects_missing', count(*), (
    select count(*) from public.review_card_media m join published_cards c
    on c.id = m.review_card_id and c.version = m.card_version
  ) from public.review_card_media m join published_cards c
    on c.id = m.review_card_id and c.version = m.card_version
    where not exists (select 1 from storage.objects o
      where o.bucket_id = 'review-card-media' and o.bucket_id || '/' || o.name = m.asset_path)
  union all
  select 'published_versions_missing', count(*), (select count(*) from published_cards) + (select count(*) from published_questions)
  from (select 'question' as content_type, id, version from published_questions
    union all select 'review_card', id, version from published_cards) c
  where not exists (select 1 from public.content_versions v where v.content_id = c.id
    and v.content_type::text = c.content_type and v.version = c.version and v.status = 'published')
  union all
  select 'live_overdue_questions', count(*), (select count(*) from public.live_sessions where state = 'question_open')
  from public.live_sessions s join public.live_session_questions q
    on q.session_id = s.id and q.position = s.current_position
  where s.state = 'question_open'
    and q.deadline_at < now() - interval '2 minutes'
  union all
  select 'live_idle_sessions', count(*), (select count(*) from public.live_sessions where state in ('lobby', 'question_feedback'))
  from public.live_sessions where state in ('lobby', 'question_feedback')
    and updated_at < now() - interval '30 minutes'
  union all
  select 'live_incomplete_finalization', count(*), (select count(*) from public.live_sessions where state = 'completed')
  from public.live_sessions s where s.state = 'completed' and (
    s.completed_at is null or exists (select 1 from public.live_participants p
      where p.session_id = s.id and p.status = 'active' and p.final_rank is null))
  union all
  select 'wallet_ledger_mismatch', count(*), (select count(*) from public.wallets)
  from public.wallets w left join (
    select user_id, sum(amount) as amount from public.wallet_transactions group by user_id
  ) t on t.user_id = w.user_id where w.token_balance is distinct from coalesce(t.amount, 0)
  union all
  select 'quiz_reward_mismatch', count(*), (select count(*) from public.quiz_sessions where status = 'completed')
  from public.quiz_sessions s
  left join public.xp_transactions x on x.source_type = 'quiz_finalize' and x.source_id = s.id and x.user_id = s.user_id
  left join public.wallet_transactions w on w.source_type = 'quiz_finalize' and w.source_id = s.id and w.user_id = s.user_id
  where s.status = 'completed' and (coalesce(x.amount, 0) is distinct from s.xp_awarded or coalesce(w.amount, 0) is distinct from s.tokens_awarded)
  union all
  select 'duplicate_reward_sources', count(*), (select count(*) from public.xp_transactions) + (select count(*) from public.wallet_transactions)
  from (select user_id, source_type, source_id from public.xp_transactions group by user_id, source_type, source_id having count(*) > 1
    union all select user_id, source_type, source_id from public.wallet_transactions group by user_id, source_type, source_id having count(*) > 1) duplicates
)
select coalesce(jsonb_agg(jsonb_build_object('signal', signal, 'value', value,
  'sample_count', sample_count, 'status', case when value > 0 then 'attention' when sample_count = 0 then 'unknown' else 'ok' end,
  'checked_at', now(), 'observed_at', now(), 'source', 'database')), '[]'::jsonb) from metrics;
$$;
revoke all on function admin_monitoring.database_metrics() from public, anon, authenticated;

create function public.admin_platform_health()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
set statement_timeout = '5s'
as $$
declare v_auth jsonb; v_database jsonb; v_collected jsonb;
begin
  v_auth := public.admin_internal_authorize();
  if (v_auth ->> 'ok')::boolean is distinct from true then
    return public.admin_internal_deny('health/platform', v_auth ->> 'code',
      'admin_platform_health', 'health_screen',
      case when v_auth ->> 'principal_id' is not null then 'admin' else 'unknown' end::public.admin_actor_type,
      (v_auth ->> 'principal_id')::uuid, null, (v_auth ->> 'auth_session_id')::uuid, null, null, null);
  end if;
  v_database := admin_monitoring.database_metrics();
  select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object(
    'source', 'collector', 'status', case
      when checked_at < now() - interval '45 minutes' then 'stale'
      else status end)), '[]'::jsonb) into v_collected from admin_monitoring.observations o where o.environment = 'staging';
  return jsonb_build_object('outcome', 'ok', 'checked_at', now(), 'metrics', v_database || v_collected);
end;
$$;
revoke all on function public.admin_platform_health() from public, anon;
grant execute on function public.admin_platform_health() to authenticated;

-- Service-only collection seams; no arbitrary SQL or table writes exposed to the browser.
create function public.svc_admin_monitor_state()
returns jsonb language sql security definer set search_path = pg_catalog, public
as $$
select jsonb_build_object(
  'observations', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from admin_monitoring.observations o where o.environment = 'staging'),
  'media', (select coalesce(jsonb_agg(asset_path), '[]'::jsonb) from (
    select distinct m.asset_path from public.review_card_media m
    join public.review_cards c on c.id = m.review_card_id and c.version = m.card_version and c.status = 'published'
    join public.subtopics st on st.id = c.subtopic_id and st.status = 'published'
    join public.sections s on s.id = st.section_id and s.status = 'published'
    join public.chapters ch on ch.id = s.chapter_id and ch.status = 'published'
    join public.courses course on course.id = ch.course_id and course.status = 'published'
    order by m.asset_path limit 501
  ) media)
);
$$;
revoke all on function public.svc_admin_monitor_state() from public, anon, authenticated;
grant execute on function public.svc_admin_monitor_state() to service_role;

create function public.svc_admin_record_monitor_observations(p_observations jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if jsonb_typeof(p_observations) is distinct from 'array'
    or jsonb_array_length(p_observations) > 8 then
    raise exception using errcode = '22023', message = 'MONITOR_OBSERVATIONS_INVALID';
  end if;
  insert into admin_monitoring.observations(signal, environment, status, value,
    sample_count, failed_count, p95_ms, checked_at, observed_at, window_started_at, revision, evidence_run_id)
  select signal, environment, status, value, sample_count, failed_count, p95_ms,
    now(), observed_at, window_started_at, revision, evidence_run_id
  from jsonb_to_recordset(p_observations) as incoming(signal text, environment text, status text,
    value numeric, sample_count bigint, failed_count bigint, p95_ms numeric,
    observed_at timestamptz, window_started_at timestamptz, revision text, evidence_run_id bigint)
  on conflict (signal) do update set environment = excluded.environment, status = excluded.status,
    value = excluded.value, sample_count = excluded.sample_count, failed_count = excluded.failed_count,
    p95_ms = excluded.p95_ms, checked_at = excluded.checked_at, observed_at = excluded.observed_at,
    window_started_at = excluded.window_started_at, revision = excluded.revision, evidence_run_id = excluded.evidence_run_id;
end;
$$;
revoke all on function public.svc_admin_record_monitor_observations(jsonb) from public, anon, authenticated;
grant execute on function public.svc_admin_record_monitor_observations(jsonb) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create function admin_monitoring.enqueue_collection()
returns bigint language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_key text; v_request_id bigint;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets
    where name = 'colorplay_staging_monitor_key';
  if v_key is null then raise exception 'MONITOR_SCHEDULE_NOT_CONFIGURED'; end if;
  select net.http_post(
    url := 'https://onkxnkzeixpezetkmocf.supabase.co/functions/v1/admin-monitor-collect',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', v_key),
    body := '{}'::jsonb, timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function admin_monitoring.enqueue_collection() from public, anon, authenticated;
