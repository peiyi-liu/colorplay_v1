begin;

select plan(10);

select has_table('public', 'external_activities', 'external activities exist');
select is(
  (
    select count(*)::integer
    from pg_class relation
    where relation.oid = 'public.external_activities'::regclass
      and relation.relrowsecurity
  ),
  1,
  'external activities enable RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.external_activities',
    'INSERT,UPDATE,DELETE'
  ),
  'rows are only written by the trusted command'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'external.teacher.a@colorplay.test',
    crypt('LocalOnly-External1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'external.student.a@colorplay.test',
    crypt('LocalOnly-External2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '30000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'external.student.b@colorplay.test',
    crypt('LocalOnly-External3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '30000000-0000-0000-0000-000000000001';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '30100000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'External Classroom', decode(repeat('f3', 32), 'hex'), 1, now(), 'active'
);
insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values (
  '30100000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'student', 'active', now(), now(), '30200000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000001',
  true
);
select throws_ok(
  $$select public.upsert_external_activity(
    jsonb_build_object(
      'title', '不安全連結',
      'url', 'http://kahoot.it/insecure',
      'classroom_id', '30100000-0000-0000-0000-000000000001'
    ),
    '30300000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'EXTERNAL_URL_INVALID',
  'plain-http URLs are rejected'
);
select lives_ok(
  $$select public.upsert_external_activity(
    jsonb_build_object(
      'title', 'Kahoot 色彩挑戰',
      'url', 'https://kahoot.it/challenge/demo',
      'classroom_id', '30100000-0000-0000-0000-000000000001'
    ),
    '30300000-0000-0000-0000-000000000002'
  )$$,
  'the owner creates an available activity'
);

reset role;
select set_config(
  'test.activity',
  (select id::text from public.external_activities limit 1),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000002',
  true
);
select is(
  (
    select title from public.external_activities
    where id = current_setting('test.activity')::uuid
  ),
  'Kahoot 色彩挑戰',
  'a classroom member sees available activities'
);

select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000003',
  true
);
select is(
  (select count(*)::integer from public.external_activities),
  0,
  'a non-member sees nothing'
);
select throws_ok(
  $$select public.upsert_external_activity(
    jsonb_build_object(
      'id', current_setting('test.activity'),
      'title', '劫持', 'url', 'https://kahoot.it/x',
      'classroom_id', '30100000-0000-0000-0000-000000000001'
    ),
    '30300000-0000-0000-0000-000000000003'
  )$$,
  'P0001',
  'CONTENT_TEACHER_ONLY',
  'students cannot manage activities'
);

select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000001',
  true
);
select lives_ok(
  $$select public.upsert_external_activity(
    jsonb_build_object(
      'id', current_setting('test.activity'),
      'title', 'Kahoot 色彩挑戰',
      'url', 'https://kahoot.it/challenge/demo',
      'classroom_id', '30100000-0000-0000-0000-000000000001',
      'status', 'archived'
    ),
    '30300000-0000-0000-0000-000000000004'
  )$$,
  'the owner archives the activity'
);

select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000002',
  true
);
select is(
  (select count(*)::integer from public.external_activities),
  0,
  'archived activities disappear for students'
);

reset role;
select * from finish();
rollback;
