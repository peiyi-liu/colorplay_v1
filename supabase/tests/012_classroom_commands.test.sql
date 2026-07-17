begin;

select plan(42);

select has_extension('pgcrypto', 'pgcrypto is available');
select ok(
  exists (
    select 1
    from pg_extension
    where extname = 'pgcrypto'
      and extnamespace = 'extensions'::regnamespace
  ),
  'pgcrypto is installed in the extensions schema'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'classrooms_join_code_hash_key'
      and indexdef ilike '%unique%'
  ),
  'join-code hashes are unique'
);
select has_function(
  'public',
  'create_classroom',
  array['text'],
  'create classroom command exists'
);
select has_function(
  'public',
  'rotate_classroom_join_code',
  array['uuid'],
  'rotate classroom code command exists'
);
select has_function(
  'public',
  'join_classroom',
  array['text', 'uuid'],
  'join classroom command exists'
);
select has_function(
  'public',
  'list_my_classrooms',
  array[]::text[],
  'student classroom projection exists'
);
select has_function(
  'public',
  'list_owned_classrooms',
  array[]::text[],
  'teacher classroom projection exists'
);
select has_function(
  'public',
  'list_owned_classroom_members',
  array['uuid'],
  'teacher member projection exists'
);
select ok(
  has_function_privilege('authenticated', 'public.create_classroom(text)', 'EXECUTE'),
  'authenticated callers can invoke create through its trusted boundary'
);
select ok(
  not has_function_privilege('anon', 'public.create_classroom(text)', 'EXECUTE'),
  'anonymous callers cannot invoke create'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '12300000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'commands.teacher.a@colorplay.test',
    crypt('LocalOnly-Commands1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12300000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'commands.teacher.b@colorplay.test',
    crypt('LocalOnly-Commands2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12300000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'commands.student@colorplay.test',
    crypt('LocalOnly-Commands3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12300000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'commands.outsider@colorplay.test',
    crypt('LocalOnly-Commands4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '12300000-0000-0000-0000-000000000001',
  '12300000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select * from public.create_classroom('Student Forgery')$$,
  '42501',
  'TEACHER_REQUIRED',
  'student cannot create a classroom'
);

select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000001', true);
select * from public.create_classroom('  指令測試班級  ') \gset created_

select matches(
  :'created_join_code'::text,
  '^[0-9A-F]{4}(-[0-9A-F]{4}){3}$',
  'create returns one display-safe random code'
);
select is(
  :'created_classroom_name'::text,
  '指令測試班級'::text,
  'create trims the classroom name'
);
select is(:'created_join_code_version'::integer, 1, 'new classroom code starts at version one');

reset role;
select is(
  (
    select encode(join_code_hash, 'hex')
    from public.classrooms
    where id = :'created_classroom_id'
  ),
  encode(
    extensions.digest(
      regexp_replace(:'created_join_code'::text, '-', '', 'g'),
      'sha256'
    ),
    'hex'
  ),
  'database stores only the SHA-256 digest of the normalized code'
);
select isnt(
  (
    select encode(join_code_hash, 'escape')
    from public.classrooms
    where id = :'created_classroom_id'
  ),
  :'created_join_code'::text,
  'database hash is not the plaintext code'
);
select is(
  (
    select count(*)::integer
    from public.classroom_members
    where classroom_id = :'created_classroom_id'
      and user_id = '12300000-0000-0000-0000-000000000001'
      and member_role = 'teacher'
      and status = 'active'
  ),
  1,
  'create inserts one active owner membership transactionally'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.list_owned_classrooms()),
  1,
  'owner projection returns the created classroom'
);
select is(
  (select member_count::integer from public.list_owned_classrooms()),
  0,
  'owner membership is excluded from student member count'
);

select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000002', true);
select throws_ok(
  format(
    'select * from public.rotate_classroom_join_code(%L)',
    :'created_classroom_id'
  ),
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'Teacher B cannot rotate Teacher A code'
);
select throws_ok(
  format(
    'select * from public.list_owned_classroom_members(%L)',
    :'created_classroom_id'
  ),
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'Teacher B cannot list Teacher A members'
);

select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000001', true);
select * from public.rotate_classroom_join_code(:'created_classroom_id') \gset rotated_

select is(:'rotated_join_code_version'::integer, 2, 'rotation increments code version');
select isnt(
  :'rotated_join_code'::text,
  :'created_join_code'::text,
  'rotation replaces the plaintext code'
);

select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000003', true);
select throws_ok(
  format(
    'select * from public.join_classroom(%L, %L)',
    :'created_join_code',
    '12400000-0000-0000-0000-000000000001'
  ),
  'P0001',
  'INVALID_CLASSROOM_CODE',
  'rotated code no longer joins the classroom'
);
select throws_ok(
  $$select * from public.join_classroom(
      'not-a-valid-code',
      '12400000-0000-0000-0000-000000000002'
    )$$,
  'P0001',
  'INVALID_CLASSROOM_CODE',
  'malformed code receives the generic invalid response'
);

select * from public.join_classroom(
  :'rotated_join_code',
  '12400000-0000-0000-0000-000000000003'
) \gset joined_

select is(
  :'joined_classroom_id'::text,
  :'created_classroom_id'::text,
  'valid code joins its classroom'
);
select is(
  :'joined_membership_status'::text,
  'active'::text,
  'valid join returns active membership'
);

reset role;
select joined_at::text as first_joined_at
from public.classroom_members
where classroom_id = :'created_classroom_id'
  and user_id = '12300000-0000-0000-0000-000000000003'
\gset first_

set local role authenticated;
select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000003', true);
select lives_ok(
  format(
    $statement$
      do $body$
      begin
        for attempt in 1..10 loop
          perform * from public.join_classroom(%L, %L);
        end loop;
      end
      $body$
    $statement$,
    :'rotated_join_code',
    '12400000-0000-0000-0000-000000000003'
  ),
  'ten replayed joins return safely'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.classroom_members
    where classroom_id = :'created_classroom_id'
      and user_id = '12300000-0000-0000-0000-000000000003'
  ),
  1,
  'ten replayed joins leave one membership row'
);
select is(
  (
    select joined_at::text
    from public.classroom_members
    where classroom_id = :'created_classroom_id'
      and user_id = '12300000-0000-0000-0000-000000000003'
  ),
  :'first_first_joined_at',
  'active replay preserves original joined_at'
);

update public.classroom_members
set
  status = 'inactive',
  deactivated_at = clock_timestamp(),
  updated_at = clock_timestamp()
where classroom_id = :'created_classroom_id'
  and user_id = '12300000-0000-0000-0000-000000000003';

select pg_sleep(0.01);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000003', true);
select * from public.join_classroom(
  :'rotated_join_code',
  '12400000-0000-0000-0000-000000000004'
) \gset rejoined_

reset role;
select is(
  :'rejoined_joined_at'::text,
  :'first_first_joined_at'::text,
  'reactivation preserves joined_at'
);
select is(
  (
    select status::text
    from public.classroom_members
    where classroom_id = :'created_classroom_id'
      and user_id = '12300000-0000-0000-0000-000000000003'
  ),
  'active',
  'valid join reactivates an inactive membership'
);
select ok(
  (
    select activated_at > joined_at
    from public.classroom_members
    where classroom_id = :'created_classroom_id'
      and user_id = '12300000-0000-0000-0000-000000000003'
  ),
  'reactivation advances activated_at'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.list_my_classrooms()),
  1,
  'student projection returns only active joined classrooms'
);

select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.list_owned_classroom_members(:'created_classroom_id')),
  1,
  'owner projection returns active student members only'
);
select ok(
  not (
    select to_jsonb(member_row) ?| array['email', 'user_id', 'join_code_hash', 'last_join_request_id']
    from public.list_owned_classroom_members(:'created_classroom_id') as member_row
    limit 1
  ),
  'member projection contains no Email, raw user ID, hash, or request ID'
);

select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000004', true);
select is(
  (select count(*)::integer from public.list_my_classrooms()),
  0,
  'outsider has no classroom projection'
);

reset role;
update public.classrooms
set status = 'archived', updated_at = clock_timestamp()
where id = :'created_classroom_id';

set local role authenticated;
select set_config('request.jwt.claim.sub', '12300000-0000-0000-0000-000000000004', true);
select throws_ok(
  format(
    'select * from public.join_classroom(%L, %L)',
    :'rotated_join_code',
    '12400000-0000-0000-0000-000000000005'
  ),
  'P0001',
  'INVALID_CLASSROOM_CODE',
  'archived classroom code receives the generic invalid response'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.create_classroom('Anonymous')$$,
  '42501',
  null,
  'anonymous cannot execute create'
);
select throws_ok(
  $$select * from public.join_classroom(
      '0000-0000-0000-0000',
      '12400000-0000-0000-0000-000000000006'
    )$$,
  '42501',
  null,
  'anonymous cannot execute join'
);

reset role;
select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'create_classroom',
        'rotate_classroom_join_code',
        'join_classroom',
        'list_my_classrooms',
        'list_owned_classrooms',
        'list_owned_classroom_members'
      )
      and grantee in ('PUBLIC', 'anon')
  ),
  0,
  'commands expose no PUBLIC or anonymous execute grants'
);

select * from finish();
rollback;
