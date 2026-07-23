begin;

select plan(36);

select has_table('public', 'classrooms', 'classrooms exists');
select has_table('public', 'classroom_members', 'classroom members exists');
select has_type('public', 'classroom_status', 'classroom status exists');
select has_type('public', 'classroom_member_role', 'classroom member role exists');
select has_type('public', 'classroom_member_status', 'classroom member status exists');
select is(
  enum_range(null::public.classroom_status)::text,
  '{active,archived}',
  'classroom status values match the contract'
);
select is(
  enum_range(null::public.classroom_member_role)::text,
  '{student,teacher}',
  'classroom member roles match the contract'
);
select is(
  enum_range(null::public.classroom_member_status)::text,
  '{active,inactive}',
  'classroom member statuses match the contract'
);
select col_is_pk('public', 'classrooms', 'id', 'classrooms use a UUID primary key');
select col_is_pk(
  'public',
  'classroom_members',
  array['classroom_id', 'user_id'],
  'one membership row exists per classroom and user'
);
select col_is_fk(
  'public',
  'classrooms',
  'owner_teacher_id',
  'classroom owner references profiles'
);
select col_is_fk(
  'public',
  'classroom_members',
  'user_id',
  'membership user references profiles'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.classrooms'::regclass),
  true,
  'classrooms have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.classroom_members'::regclass),
  true,
  'classroom members have RLS enabled'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'classrooms_owner_teacher_id_idx'
  ),
  'classrooms index their owner'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'classroom_members_user_classroom_idx'
  ),
  'memberships index user and classroom'
);
select ok(
  has_column_privilege('authenticated', 'public.classrooms', 'id', 'SELECT'),
  'authenticated users can select safe classroom columns'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.classrooms',
    'join_code_hash',
    'SELECT'
  ),
  'authenticated users cannot select join-code hashes'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.classroom_members',
    'last_join_request_id',
    'SELECT'
  ),
  'authenticated users cannot select join request IDs'
);
select ok(
  not has_table_privilege('authenticated', 'public.classrooms', 'INSERT,UPDATE,DELETE'),
  'authenticated users cannot mutate classrooms directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.classroom_members',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot mutate memberships directly'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid in (
      'public.classrooms'::regclass,
      'public.classroom_members'::regclass
    )
      and coalesce(pg_get_expr(polqual, polrelid), '') ~* '^\s*true\s*$'
  ),
  0,
  'no classroom policy uses an unconditional true predicate'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'classroom.teacher.a@colorplay.test',
    crypt('LocalOnly-Classroom1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'classroom.teacher.b@colorplay.test',
    crypt('LocalOnly-Classroom2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'classroom.student.a@colorplay.test',
    crypt('LocalOnly-Classroom3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'classroom.student.b@colorplay.test',
    crypt('LocalOnly-Classroom4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-0000-0000-000000000005',
    'authenticated', 'authenticated', 'classroom.outsider@colorplay.test',
    crypt('LocalOnly-Classroom5!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '12000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000002'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values
  (
    '12100000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    'Teacher A Classroom', decode(repeat('a1', 32), 'hex'), 1, now(), 'active'
  ),
  (
    '12100000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000002',
    'Teacher B Classroom', decode(repeat('b2', 32), 'hex'), 1, now(), 'active'
  );

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '12100000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(),
    '12200000-0000-0000-0000-000000000001'
  ),
  (
    '12100000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000003',
    'student', 'active', now(), now(),
    '12200000-0000-0000-0000-000000000003'
  ),
  (
    '12100000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000002',
    'teacher', 'active', now(), now(),
    '12200000-0000-0000-0000-000000000002'
  ),
  (
    '12100000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000004',
    'student', 'active', now(), now(),
    '12200000-0000-0000-0000-000000000004'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select is(
  (select count(id)::integer from public.classrooms),
  1,
  'Teacher A reads only the owned classroom'
);
select is(
  (
    select count(user_id)::integer
    from public.classroom_members
    where classroom_id = '12100000-0000-0000-0000-000000000001'
  ),
  2,
  'Teacher A reads members of the owned classroom'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
select is(
  (
    select count(id)::integer
    from public.classrooms
    where id = '12100000-0000-0000-0000-000000000001'
  ),
  0,
  'Teacher B cannot read Teacher A classroom'
);
select is(
  (
    select count(user_id)::integer
    from public.classroom_members
    where classroom_id = '12100000-0000-0000-0000-000000000001'
  ),
  0,
  'Teacher B cannot read Teacher A memberships'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000003', true);
select is(
  (
    select count(id)::integer
    from public.classrooms
    where id = '12100000-0000-0000-0000-000000000001'
  ),
  1,
  'active student reads the joined classroom'
);
select is(
  (select count(user_id)::integer from public.classroom_members),
  1,
  'student reads only the own membership row'
);
select throws_ok(
  $$select join_code_hash from public.classrooms$$,
  '42501',
  null,
  'student cannot select the join-code hash'
);
select throws_ok(
  $$insert into public.classrooms (
      owner_teacher_id, name, join_code_hash, join_code_version, join_code_rotated_at
    ) values (
      '12000000-0000-0000-0000-000000000003',
      'Forged', decode(repeat('c3', 32), 'hex'), 1, now()
    )$$,
  '42501',
  null,
  'student cannot create a classroom directly'
);
select throws_ok(
  $$update public.classrooms
    set name = 'Forged'
    where id = '12100000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'student cannot update a classroom directly'
);
select throws_ok(
  $$delete from public.classroom_members
    where classroom_id = '12100000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'student cannot delete memberships directly'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000005', true);
select is(
  (select count(id)::integer from public.classrooms),
  0,
  'outsider cannot read classrooms'
);
select is(
  (select count(user_id)::integer from public.classroom_members),
  0,
  'outsider cannot read memberships'
);

reset role;
set local role anon;
select throws_ok(
  $$select id from public.classrooms$$,
  '42501',
  null,
  'anonymous cannot read classrooms'
);
select throws_ok(
  $$select classroom_id from public.classroom_members$$,
  '42501',
  null,
  'anonymous cannot read memberships'
);

reset role;
select * from finish();
rollback;
