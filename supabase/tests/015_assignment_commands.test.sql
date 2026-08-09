begin;

select plan(20);

select has_function('public', 'create_assignment', 'create assignment exists');
select has_function(
  'public',
  'update_assignment_status',
  'update assignment status exists'
);
select has_function(
  'public',
  'list_classroom_assignments',
  'owner assignment list exists'
);
select has_function('public', 'list_my_assignments', 'student assignment list exists');
select has_function(
  'public',
  'start_assignment_attempt',
  'start assignment attempt exists'
);
select has_function(
  'public',
  'teacher_assignment_summary',
  'historical assignment analytics exists'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '15000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'command.teacher.a@colorplay.test',
    crypt('LocalOnly-Command1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '15000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'command.teacher.b@colorplay.test',
    crypt('LocalOnly-Command2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '15000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'command.student.a@colorplay.test',
    crypt('LocalOnly-Command3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '15000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'command.student.b@colorplay.test',
    crypt('LocalOnly-Command4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '15000000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000002'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values
  (
    '15100000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000001',
    'Command Classroom A', decode(repeat('e5', 32), 'hex'), 1, now(), 'active'
  ),
  (
    '15100000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000002',
    'Command Classroom B', decode(repeat('f6', 32), 'hex'), 1, now(), 'active'
  );

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '15100000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(), '15200000-0000-0000-0000-000000000001'
  ),
  (
    '15100000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(), '15200000-0000-0000-0000-000000000003'
  ),
  (
    '15100000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000002',
    'teacher', 'active', now(), now(), '15200000-0000-0000-0000-000000000002'
  ),
  (
    '15100000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000004',
    'student', 'active', now(), now(), '15200000-0000-0000-0000-000000000004'
  );

-- Historical rows remain readable after write retirement. They are inserted
-- directly because no retired command may be used to manufacture history.
insert into public.assignments (
  id, classroom_id, owner_teacher_id, title, activity_type,
  quiz_template_id, available_from, deadline_at, attempt_limit,
  passing_rule, status, created_at, updated_at
)
values (
  '15400000-0000-0000-0000-000000000001',
  '15100000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000001',
  'Historical homework',
  'quiz_template',
  '26000000-0000-0000-0000-000000000003',
  clock_timestamp() - interval '1 day',
  clock_timestamp() + interval '1 day',
  2,
  '{"rule":"score_at_least","threshold":"600"}',
  'published',
  clock_timestamp() - interval '1 day',
  clock_timestamp() - interval '1 day'
);

insert into public.assignment_targets (assignment_id, user_id)
values (
  '15400000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000003'
);

insert into public.assignment_attempts (
  id, assignment_id, user_id, attempt_number, status, passed, completed_at
)
values (
  '15500000-0000-0000-0000-000000000001',
  '15400000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000003',
  1, 'completed', true, clock_timestamp()
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-0000-0000-000000000001',
  true
);

select is(
  (
    select count(*)::integer
    from public.list_classroom_assignments(
      '15100000-0000-0000-0000-000000000001'
    )
  ),
  1,
  'the owner can still list historical assignments'
);
select is(
  (
    select title
    from public.list_classroom_assignments(
      '15100000-0000-0000-0000-000000000001'
    )
  ),
  'Historical homework',
  'the owner list preserves historical assignment data'
);
select is(
  (
    select count(*)::integer
    from public.teacher_assignment_summary(
      '15100000-0000-0000-0000-000000000001'
    )
  ),
  1,
  'teacher analytics still lists historical assignments'
);
select is(
  (
    select targets
    from public.teacher_assignment_summary(
      '15100000-0000-0000-0000-000000000001'
    )
  ),
  1,
  'teacher analytics preserves historical target counts'
);
select is(
  (
    select attempts
    from public.teacher_assignment_summary(
      '15100000-0000-0000-0000-000000000001'
    )
  ),
  1,
  'teacher analytics preserves historical attempt counts'
);
select is(
  (
    select completed
    from public.teacher_assignment_summary(
      '15100000-0000-0000-0000-000000000001'
    )
  ),
  1,
  'teacher analytics preserves historical completion counts'
);

select throws_ok(
  $$select public.create_assignment(
    '15100000-0000-0000-0000-000000000001',
    'Retired assignment',
    'quiz_template',
    '26000000-0000-0000-0000-000000000003',
    now(),
    now() + interval '1 day',
    10,
    100
  )$$,
  'P0001',
  'ASSIGNMENT_FEATURE_RETIRED',
  'create_assignment is retired'
);
select throws_ok(
  $$select public.update_assignment_status(
    '15400000-0000-0000-0000-000000000001',
    'paused',
    now()
  )$$,
  'P0001',
  'ASSIGNMENT_FEATURE_RETIRED',
  'update_assignment_status is retired'
);

select set_config(
  'request.jwt.claim.sub',
  '15000000-0000-0000-0000-000000000003',
  true
);

select is(
  (select count(*)::integer from public.list_my_assignments()),
  1,
  'the targeted student can still list a historical assignment'
);
select is(
  (select title from public.list_my_assignments()),
  'Historical homework',
  'the student list preserves historical assignment data'
);
select throws_ok(
  $$select public.start_assignment_attempt(
    '15400000-0000-0000-0000-000000000001',
    '15300000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'ASSIGNMENT_FEATURE_RETIRED',
  'start_assignment_attempt is retired'
);

reset role;
select is(
  (select count(*)::integer from public.assignments),
  1,
  'retired RPCs create no assignment rows'
);
select is(
  (select count(*)::integer from public.assignment_attempts),
  1,
  'retired RPCs create no attempt rows'
);
select is(
  (select count(*)::integer from public.assignment_targets),
  1,
  'retired RPCs preserve historical targets'
);

select * from finish();
rollback;
