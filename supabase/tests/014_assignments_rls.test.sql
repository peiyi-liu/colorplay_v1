begin;

select plan(40);

select has_table('public', 'assignments', 'assignments exists');
select has_table('public', 'assignment_targets', 'assignment targets exists');
select has_table('public', 'assignment_attempts', 'assignment attempts exists');
select has_type('public', 'assignment_status', 'assignment status exists');
select has_type(
  'public',
  'assignment_activity_type',
  'assignment activity type exists'
);
select has_type(
  'public',
  'assignment_attempt_status',
  'assignment attempt status exists'
);
select has_type('public', 'quiz_session_purpose', 'quiz session purpose exists');
select is(
  enum_range(null::public.assignment_status)::text,
  '{draft,published,paused,archived}',
  'assignment statuses match the contract'
);
select is(
  enum_range(null::public.assignment_activity_type)::text,
  '{quiz_template,live_activity}',
  'assignment activity types match the contract'
);
select is(
  enum_range(null::public.assignment_attempt_status)::text,
  '{in_progress,completed,expired,abandoned}',
  'assignment attempt statuses match the contract'
);
select is(
  enum_range(null::public.quiz_session_purpose)::text,
  '{practice,assignment,remediation}',
  'quiz session purposes match the contract'
);
select col_is_pk('public', 'assignments', 'id', 'assignments use a UUID primary key');
select col_is_pk(
  'public',
  'assignment_targets',
  array['assignment_id', 'user_id'],
  'one target row exists per assignment and user'
);
select col_has_default(
  'public',
  'quiz_sessions',
  'purpose',
  'quiz sessions default to a purpose'
);
select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quiz_sessions'
      and column_name = 'purpose'
  ),
  '''practice''::quiz_session_purpose',
  'existing quiz sessions stay practice sessions'
);
select has_column(
  'public',
  'quiz_sessions',
  'assignment_attempt_id',
  'quiz sessions can reference an assignment attempt'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.assignments'::regclass
      and conname = 'assignments_activity_reference_check'
  ),
  'assignments require exactly one activity reference'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.assignment_attempts'::regclass
      and conname = 'assignment_attempts_unique_attempt_number'
  ),
  'attempt numbers are unique per assignment and student'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.assignment_attempts'::regclass
      and conname = 'assignment_attempts_session_reference_check'
  ),
  'attempts require exactly one session reference'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.assignments'::regclass),
  true,
  'assignments have RLS enabled'
);
select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.assignment_targets'::regclass
  ),
  true,
  'assignment targets have RLS enabled'
);
select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.assignment_attempts'::regclass
  ),
  true,
  'assignment attempts have RLS enabled'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'assignments_classroom_status_deadline_idx'
  ),
  'assignments index classroom, status, and deadline'
);
select ok(
  not has_table_privilege('authenticated', 'public.assignments', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot mutate assignments directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.assignment_targets',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot mutate targets directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.assignment_attempts',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot mutate attempts directly'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid in (
      'public.assignments'::regclass,
      'public.assignment_targets'::regclass,
      'public.assignment_attempts'::regclass
    )
      and coalesce(pg_get_expr(polqual, polrelid), '') ~* '^\s*true\s*$'
  ),
  0,
  'no assignment policy uses an unconditional true predicate'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '14000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'assignment.teacher.a@colorplay.test',
    crypt('LocalOnly-Assignment1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '14000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'assignment.teacher.b@colorplay.test',
    crypt('LocalOnly-Assignment2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '14000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'assignment.student.a@colorplay.test',
    crypt('LocalOnly-Assignment3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '14000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'assignment.student.b@colorplay.test',
    crypt('LocalOnly-Assignment4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '14000000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000002'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values
  (
    '14100000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'Assignment Classroom A', decode(repeat('c3', 32), 'hex'), 1, now(), 'active'
  ),
  (
    '14100000-0000-0000-0000-000000000002',
    '14000000-0000-0000-0000-000000000002',
    'Assignment Classroom B', decode(repeat('d4', 32), 'hex'), 1, now(), 'active'
  );

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '14100000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '14200000-0000-0000-0000-000000000001'
  ),
  (
    '14100000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '14200000-0000-0000-0000-000000000003'
  ),
  (
    '14100000-0000-0000-0000-000000000002',
    '14000000-0000-0000-0000-000000000002',
    'teacher', 'active', now(), now(), '14200000-0000-0000-0000-000000000002'
  ),
  (
    '14100000-0000-0000-0000-000000000002',
    '14000000-0000-0000-0000-000000000004',
    'student', 'active', now(), now(), '14200000-0000-0000-0000-000000000004'
  );

insert into public.assignments (
  id, classroom_id, owner_teacher_id, title, activity_type, quiz_template_id,
  available_from, deadline_at, attempt_limit, passing_rule, status
)
values
  (
    '14300000-0000-0000-0000-000000000001',
    '14100000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'Published homework', 'quiz_template',
    '26000000-0000-0000-0000-000000000003',
    now() - interval '1 hour', now() + interval '7 days', 3,
    '{"rule":"score_at_least","threshold":600}', 'published'
  ),
  (
    '14300000-0000-0000-0000-000000000002',
    '14100000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'Draft homework', 'quiz_template',
    '26000000-0000-0000-0000-000000000003',
    null, null, null,
    '{"rule":"score_at_least","threshold":600}', 'draft'
  );

insert into public.assignment_targets (assignment_id, user_id)
values
  (
    '14300000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000003'
  ),
  (
    '14300000-0000-0000-0000-000000000002',
    '14000000-0000-0000-0000-000000000003'
  );

insert into public.assignment_attempts (
  id, assignment_id, user_id, attempt_number, status
)
values (
  '14400000-0000-0000-0000-000000000001',
  '14300000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000003',
  1, 'in_progress'
);

select throws_ok(
  $$
    insert into public.assignments (
      classroom_id, owner_teacher_id, title, activity_type,
      quiz_template_id, live_activity_id, passing_rule, status
    )
    values (
      '14100000-0000-0000-0000-000000000001',
      '14000000-0000-0000-0000-000000000001',
      'Broken reference', 'quiz_template', null, null,
      '{"rule":"score_at_least","threshold":1}', 'draft'
    )
  $$,
  '23514',
  null,
  'a quiz-template assignment must reference a quiz template'
);
select throws_ok(
  $$
    insert into public.assignments (
      classroom_id, owner_teacher_id, title, activity_type,
      quiz_template_id, passing_rule, status
    )
    values (
      '14100000-0000-0000-0000-000000000001',
      '14000000-0000-0000-0000-000000000003',
      'Student owner', 'quiz_template',
      '26000000-0000-0000-0000-000000000003',
      '{"rule":"score_at_least","threshold":1}', 'draft'
    )
  $$,
  '23514',
  null,
  'assignment owners must hold the teacher role'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '14000000-0000-0000-0000-000000000001',
  true
);
select is(
  (select count(id)::integer from public.assignments),
  2,
  'owner reads both own assignments including drafts'
);
select is(
  (select count(*)::integer from public.assignment_targets),
  2,
  'owner reads targets of own assignments'
);
select is(
  (select count(id)::integer from public.assignment_attempts),
  1,
  'owner reads attempts for own assignments'
);

select set_config(
  'request.jwt.claim.sub',
  '14000000-0000-0000-0000-000000000003',
  true
);
select is(
  (select count(id)::integer from public.assignments),
  1,
  'targeted student reads only non-draft assignments'
);
select is(
  (
    select count(id)::integer
    from public.assignments
    where id = '14300000-0000-0000-0000-000000000002'
  ),
  0,
  'targeted student cannot read a draft assignment'
);
select is(
  (select count(id)::integer from public.assignment_attempts),
  1,
  'student reads own attempts'
);

select set_config(
  'request.jwt.claim.sub',
  '14000000-0000-0000-0000-000000000004',
  true
);
select is(
  (select count(id)::integer from public.assignments),
  0,
  'a non-target student in another classroom reads nothing'
);
select is(
  (select count(*)::integer from public.assignment_targets),
  0,
  'a non-target student reads no targets'
);
select is(
  (select count(id)::integer from public.assignment_attempts),
  0,
  'a non-target student reads no attempts'
);

select set_config(
  'request.jwt.claim.sub',
  '14000000-0000-0000-0000-000000000002',
  true
);
select is(
  (select count(id)::integer from public.assignments),
  0,
  'Teacher B reads no Teacher A assignment'
);

reset role;
set local role anon;
select throws_ok(
  $$select id from public.assignments$$,
  '42501',
  null,
  'anonymous cannot read assignments'
);

reset role;
select * from finish();
rollback;
