begin;

select plan(12);

select has_table('public', 'content_versions', 'content versions exists');
select has_table(
  'public',
  'content_publication_events',
  'publication events exists'
);
select is(
  enum_range(null::public.versioned_content_type)::text,
  '{question,review_card}',
  'versioned content types match the contract'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.content_versions'::regclass
      and conname = 'content_versions_identity_unique'
  ),
  'one snapshot exists per content type, id, and version'
);
select is(
  (
    select count(*)::integer
    from pg_class relation
    where relation.oid in (
      'public.content_versions'::regclass,
      'public.content_publication_events'::regclass
    )
      and relation.relrowsecurity
  ),
  2,
  'both history tables enable RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.content_versions',
    'INSERT,UPDATE,DELETE'
  ),
  'history snapshots are only written by trusted commands'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.content_publication_events',
    'INSERT,UPDATE,DELETE'
  ),
  'publication events are append-only via trusted commands'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '26100000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'versions.teacher.a@colorplay.test',
    crypt('LocalOnly-Versions1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '26100000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'versions.student.a@colorplay.test',
    crypt('LocalOnly-Versions2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '26100000-0000-0000-0000-000000000001';

insert into public.content_versions (
  id, content_type, content_id, version, frozen_payload, payload_hash, status,
  created_by
)
values (
  '26200000-0000-0000-0000-000000000001',
  'question',
  (select id from public.questions where stable_code = '3-1-01'),
  1,
  '{"prompt":"快照"}',
  'deadbeef', 'published',
  '26100000-0000-0000-0000-000000000001'
);

insert into public.content_publication_events (
  id, content_type, content_id, version, event_type, actor_id, request_id
)
values (
  '26300000-0000-0000-0000-000000000001',
  'question',
  (select id from public.questions where stable_code = '3-1-01'),
  1, 'publish',
  '26100000-0000-0000-0000-000000000001',
  '26400000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '26100000-0000-0000-0000-000000000001',
  true
);
select is(
  (select count(*)::integer from public.content_versions),
  1,
  'a teacher reads version history'
);
select is(
  (select count(*)::integer from public.content_publication_events),
  1,
  'a teacher reads publication events'
);

select set_config(
  'request.jwt.claim.sub',
  '26100000-0000-0000-0000-000000000002',
  true
);
select is(
  (select count(*)::integer from public.content_versions),
  0,
  'students read no version history'
);
select is(
  (select count(*)::integer from public.content_publication_events),
  0,
  'students read no publication events'
);

reset role;
set local role anon;
select throws_ok(
  $$select id from public.content_versions$$,
  '42501',
  null,
  'anonymous cannot read version history'
);

reset role;
select * from finish();
rollback;
