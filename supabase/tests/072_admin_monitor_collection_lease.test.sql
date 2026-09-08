begin;
select plan(27);

select has_table(
  'admin_monitoring',
  'collection_control',
  'collection control table exists'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'admin_monitoring.collection_control'::regclass),
  'collection control enables RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'admin_monitoring.collection_control',
    'select'
  ),
  'authenticated users cannot inspect collection control'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'admin_monitoring.collection_control',
    'update'
  ),
  'authenticated users cannot modify collection control'
);
select has_function(
  'public',
  'svc_admin_monitor_begin_collection',
  array['uuid'],
  'lease begin RPC exists'
);
select has_function(
  'public',
  'svc_admin_monitor_record_collection',
  array['uuid', 'jsonb'],
  'request-bound record RPC exists'
);
select has_function(
  'public',
  'svc_admin_monitor_finish_collection',
  array['uuid', 'boolean'],
  'request-bound finish RPC exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.svc_admin_monitor_begin_collection(uuid)',
    'execute'
  ),
  'authenticated users cannot acquire a collector lease'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.svc_admin_monitor_record_collection(uuid,jsonb)',
    'execute'
  ),
  'authenticated users cannot record collector observations'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.svc_admin_monitor_finish_collection(uuid,boolean)',
    'execute'
  ),
  'authenticated users cannot release a collector lease'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.svc_admin_record_monitor_observations(jsonb)',
    'execute'
  ),
  'the unbound legacy write RPC is retired'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.svc_admin_monitor_begin_collection(uuid)',
    'execute'
  ),
  'service role may acquire a collector lease'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.svc_admin_monitor_record_collection(uuid,jsonb)',
    'execute'
  ),
  'service role may record a matching collection'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.svc_admin_monitor_finish_collection(uuid,boolean)',
    'execute'
  ),
  'service role may release a matching failed collection'
);

select is(
  public.svc_admin_monitor_begin_collection(
    '10000000-0000-0000-0000-000000000001'::uuid
  )->>'outcome',
  'started',
  'first collector acquires the lease'
);
select is(
  public.svc_admin_monitor_begin_collection(
    '20000000-0000-0000-0000-000000000002'::uuid
  )->>'outcome',
  'busy',
  'a concurrent collector is throttled'
);
select throws_ok(
  $test$
    select public.svc_admin_monitor_record_collection(
      '20000000-0000-0000-0000-000000000002'::uuid,
      '[]'::jsonb
    )
  $test$,
  '42501',
  'MONITOR_LEASE_INVALID',
  'a non-owner cannot publish observations'
);
select is(
  public.svc_admin_monitor_record_collection(
    '10000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_array(jsonb_build_object(
      'signal', 'login_http',
      'environment', 'staging',
      'status', 'ok',
      'sample_count', 1,
      'failed_count', 0,
      'observed_at', now()
    ))
  )->>'outcome',
  'recorded',
  'the lease owner records the collection atomically'
);
select is(
  (select status from admin_monitoring.observations where signal = 'login_http'),
  'ok',
  'the matching collection is persisted'
);
select ok(
  (select lease_request_id is null and lease_until is null
   from admin_monitoring.collection_control
   where environment = 'staging'),
  'successful recording releases the lease'
);
select is(
  public.svc_admin_monitor_begin_collection(
    '20000000-0000-0000-0000-000000000002'::uuid
  )->>'outcome',
  'busy',
  'the cooldown blocks immediate replay after success'
);

update admin_monitoring.collection_control
set last_started_at = now() - interval '6 minutes'
where environment = 'staging';
select is(
  public.svc_admin_monitor_begin_collection(
    '20000000-0000-0000-0000-000000000002'::uuid
  )->>'outcome',
  'started',
  'a collector may start after the cooldown'
);
select is(
  public.svc_admin_monitor_finish_collection(
    '10000000-0000-0000-0000-000000000001'::uuid,
    false
  )->>'outcome',
  'ignored',
  'a stale collector cannot release a newer lease'
);
select is(
  (select lease_request_id
   from admin_monitoring.collection_control
   where environment = 'staging'),
  '20000000-0000-0000-0000-000000000002'::uuid,
  'the newer lease remains bound to its request'
);
select is(
  public.svc_admin_monitor_finish_collection(
    '20000000-0000-0000-0000-000000000002'::uuid,
    false
  )->>'outcome',
  'finished',
  'the lease owner may release a failed collection'
);
select ok(
  (select lease_request_id is null
     and lease_until is null
     and last_succeeded is false
   from admin_monitoring.collection_control
   where environment = 'staging'),
  'failure release is recorded without publishing observations'
);
select throws_ok(
  $test$
    select public.svc_admin_monitor_finish_collection(
      '20000000-0000-0000-0000-000000000002'::uuid,
      true
    )
  $test$,
  '22023',
  'MONITOR_FINISH_INVALID',
  'success cannot be asserted without recording observations'
);

select * from finish();
rollback;
