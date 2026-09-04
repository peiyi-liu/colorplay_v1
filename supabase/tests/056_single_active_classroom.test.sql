begin;

select plan(6);

select has_column(
  'public',
  'quiz_sessions',
  'classroom_id',
  'Quiz sessions retain authoritative classroom provenance'
);

select has_index(
  'public',
  'classroom_members',
  'classroom_members_one_active_student_key',
  'students can have at most one active classroom membership'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '56600000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'single-class.teacher@colorplay.test',
    crypt('LocalOnly-SingleClass-1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '56600000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'single-class.student@colorplay.test',
    crypt('LocalOnly-SingleClass-2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '56600000-0000-0000-0000-000000000001';

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values
  (
    '56700000-0000-0000-0000-000000000001',
    '56600000-0000-0000-0000-000000000001',
    'Single Class A', decode(repeat('c1', 32), 'hex'), 1, now(), 'active'
  ),
  (
    '56700000-0000-0000-0000-000000000002',
    '56600000-0000-0000-0000-000000000001',
    'Single Class B', decode(repeat('c2', 32), 'hex'), 1, now(), 'active'
  );

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values (
  '56700000-0000-0000-0000-000000000001',
  '56600000-0000-0000-0000-000000000002',
  'student', 'active', now(), now(),
  '56800000-0000-0000-0000-000000000001'
);

select throws_ok(
  $$insert into public.classroom_members (
      classroom_id, user_id, member_role, status, joined_at, activated_at,
      last_join_request_id
    ) values (
      '56700000-0000-0000-0000-000000000002',
      '56600000-0000-0000-0000-000000000002',
      'student', 'active', now(), now(),
      '56800000-0000-0000-0000-000000000002'
    )$$,
  'P0001',
  null,
  'a student cannot hold two active classroom memberships'
);

insert into public.quiz_sessions (
  id, user_id, template_id, client_request_id, chapter_title, question_count
)
select
  '56900000-0000-0000-0000-000000000001',
  '56600000-0000-0000-0000-000000000002',
  template.id,
  '56a00000-0000-0000-0000-000000000001',
  'Single class provenance',
  1
from public.quiz_templates as template
order by template.created_at
limit 1;

select is(
  (
    select session.classroom_id
    from public.quiz_sessions as session
    where session.id = '56900000-0000-0000-0000-000000000001'
  ),
  '56700000-0000-0000-0000-000000000001'::uuid,
  'a new practice session snapshots the active classroom'
);

select throws_ok(
  $$update public.quiz_sessions
    set classroom_id = '56700000-0000-0000-0000-000000000002'
    where id = '56900000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'captured Quiz classroom provenance is immutable'
);

select throws_ok(
  $$insert into public.quiz_sessions (
      user_id, template_id, client_request_id, chapter_title, question_count,
      classroom_id
    )
    select
      '56600000-0000-0000-0000-000000000002',
      template.id,
      '56a00000-0000-0000-0000-000000000002',
      'Conflicting provenance',
      1,
      '56700000-0000-0000-0000-000000000002'
    from public.quiz_templates as template
    order by template.created_at
    limit 1$$,
  '23514',
  null,
  'a practice session cannot claim a classroom other than active membership'
);

select * from finish();
rollback;
