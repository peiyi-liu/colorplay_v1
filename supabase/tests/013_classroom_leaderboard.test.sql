begin;

select plan(20);

select has_function(
  'public',
  'get_classroom_leaderboard',
  array['uuid'],
  'leaderboard command exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_classroom_leaderboard(uuid)',
    'EXECUTE'
  ),
  'authenticated callers can use the trusted leaderboard command'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_classroom_leaderboard(uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the leaderboard command'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  format(
    '13000000-0000-0000-0000-%s',
    lpad(student_number::text, 12, '0')
  )::uuid,
  'authenticated',
  'authenticated',
  format('leaderboard.student.%s@colorplay.test', student_number),
  crypt(format('LocalOnly-Leaderboard%s!', student_number), gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
from generate_series(1, 13) as student_number;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '13100000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'leaderboard.teacher.a@colorplay.test',
    crypt('LocalOnly-LeaderboardTeacher1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '13100000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'leaderboard.teacher.b@colorplay.test',
    crypt('LocalOnly-LeaderboardTeacher2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '13200000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'leaderboard.outsider@colorplay.test',
    crypt('LocalOnly-LeaderboardOutsider!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set display_name = format(
  'Rank %s',
  substring(id::text from 25)::integer
)
where id::text like '13000000-0000-0000-0000-%';

update public.profiles
set role = 'teacher'
where id in (
  '13100000-0000-0000-0000-000000000001',
  '13100000-0000-0000-0000-000000000002'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values
  (
    '13400000-0000-0000-0000-000000000001',
    '13100000-0000-0000-0000-000000000001',
    'Leaderboard A', decode(repeat('a4', 32), 'hex'), 1, now(), 'active'
  ),
  (
    '13400000-0000-0000-0000-000000000002',
    '13100000-0000-0000-0000-000000000002',
    'Leaderboard B', decode(repeat('b4', 32), 'hex'), 1, now(), 'active'
  );

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  deactivated_at, last_join_request_id
)
values
  (
    '13400000-0000-0000-0000-000000000001',
    '13100000-0000-0000-0000-000000000001',
    'teacher', 'active', '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00', null,
    '13500000-0000-0000-0000-000000000001'
  ),
  (
    '13400000-0000-0000-0000-000000000002',
    '13100000-0000-0000-0000-000000000002',
    'teacher', 'active', '2026-01-01 00:00:00+00',
    '2026-01-01 00:00:00+00', null,
    '13500000-0000-0000-0000-000000000002'
  );

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  deactivated_at, last_join_request_id
)
select
  '13400000-0000-0000-0000-000000000001'::uuid,
  format(
    '13000000-0000-0000-0000-%s',
    lpad(student_number::text, 12, '0')
  )::uuid,
  'student'::public.classroom_member_role,
  case when student_number = 13 then 'inactive' else 'active' end::public.classroom_member_status,
  '2026-01-01 00:00:00+00'::timestamptz,
  '2026-01-01 00:00:00+00'::timestamptz,
  case
    when student_number = 13 then '2026-01-02 00:00:00+00'::timestamptz
    else null
  end,
  format(
    '13500000-0000-0000-0000-%s',
    lpad((student_number + 2)::text, 12, '0')
  )::uuid
from generate_series(1, 13) as student_number;

insert into public.xp_transactions (
  id, user_id, amount, reason, source_type, source_id, created_at
)
select
  format(
    '13600000-0000-0000-0000-%s',
    lpad(student_number::text, 12, '0')
  )::uuid,
  format(
    '13000000-0000-0000-0000-%s',
    lpad(student_number::text, 12, '0')
  )::uuid,
  9999,
  'Before membership',
  'achievement',
  format(
    '13700000-0000-0000-0000-%s',
    lpad(student_number::text, 12, '0')
  )::uuid,
  '2025-12-31 00:00:00+00'::timestamptz
from generate_series(1, 13) as student_number;

insert into public.xp_transactions (
  id, user_id, amount, reason, source_type, source_id, created_at
)
select
  format(
    '13800000-0000-0000-0000-%s',
    lpad(student_number::text, 12, '0')
  )::uuid,
  format(
    '13000000-0000-0000-0000-%s',
    lpad(student_number::text, 12, '0')
  )::uuid,
  case student_number
    when 1 then 1200
    when 2 then 1200
    when 3 then 1000
    when 4 then 1000
    when 13 then 50
    else 1300 - (student_number * 100)
  end,
  'After membership',
  'quiz_finalize',
  format(
    '13900000-0000-0000-0000-%s',
    lpad(student_number::text, 12, '0')
  )::uuid,
  case student_number
    when 1 then '2026-01-05 00:00:00+00'::timestamptz
    when 2 then '2026-01-04 00:00:00+00'::timestamptz
    when 3 then '2026-01-06 00:00:00+00'::timestamptz
    when 4 then '2026-01-06 00:00:00+00'::timestamptz
    else ('2026-01-07 00:00:00+00'::timestamptz + student_number * interval '1 minute')
  end
from generate_series(1, 13) as student_number;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13100000-0000-0000-0000-000000000001', true);
select is(
  jsonb_array_length(
    public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')->'top_entries'
  ),
  10,
  'owner receives exactly Top 10'
);
select is(
  public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')->'self_entry',
  'null'::jsonb,
  'teacher owner is not ranked as a student'
);
select is(
  (
    select string_agg(entry->>'display_name', ',' order by ordinal)
    from jsonb_array_elements(
      public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')->'top_entries'
    ) with ordinality as ranked(entry, ordinal)
  ),
  'Rank 2,Rank 1,Rank 3,Rank 4,Rank 5,Rank 6,Rank 7,Rank 8,Rank 9,Rank 10',
  'XP, reach time, then hidden UUID determine exact order'
);
select is(
  (
    public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')
      ->'top_entries'->0->>'total_xp'
  )::integer,
  1200,
  'XP earned before membership is excluded'
);
select ok(
  not (
    public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')::text
      ~* '(leaderboard[.]student|13000000-0000-0000-0000-)'
  ),
  'owner response contains no Email or raw member UUID'
);
select ok(
  (
    select bool_and(
      (entry - array[
        'active_blook_id', 'display_name', 'frame_gradient_end',
        'frame_gradient_start', 'is_self', 'rank', 'total_xp'
      ]) = '{}'::jsonb
    )
    from jsonb_array_elements(
      public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')->'top_entries'
    ) as entry
  ),
  'every Top 10 entry contains only approved safe keys'
);
select ok(
  not (
    public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')->'top_entries'
      @> '[{"display_name":"Rank 11"}]'::jsonb
  )
  and not (
    public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')->'top_entries'
      @> '[{"display_name":"Rank 12"}]'::jsonb
  ),
  'owner projection does not expose the full roster'
);

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000012', true);
select is(
  (
    public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')
      ->'self_entry'->>'rank'
  )::integer,
  12,
  'student outside Top 10 receives exact self rank'
);
select is(
  (
    public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')
      ->'self_entry'->>'total_xp'
  )::integer,
  100,
  'student self entry contains authoritative post-membership XP'
);
select is(
  public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')
    ->>'classroom_name',
  'Leaderboard A',
  'projection includes the authorized classroom name'
);
select matches(
  public.get_classroom_leaderboard('13400000-0000-0000-0000-000000000001')
    ->>'generated_at',
  'Z$|[+]00:00$',
  'projection timestamp is UTC'
);

select set_config('request.jwt.claim.sub', '13100000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.get_classroom_leaderboard(
      '13400000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'Teacher B cannot read Teacher A leaderboard'
);

select set_config('request.jwt.claim.sub', '13200000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.get_classroom_leaderboard(
      '13400000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'outsider cannot read a classroom leaderboard'
);

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000013', true);
select throws_ok(
  $$select public.get_classroom_leaderboard(
      '13400000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'inactive member cannot read the leaderboard'
);

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.get_classroom_leaderboard(
      '13400000-0000-0000-0000-000000000002'
    )$$,
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'member cannot read another classroom leaderboard'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.get_classroom_leaderboard(
      '13400000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  null,
  'anonymous cannot execute the leaderboard command'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.xp_transactions
    where user_id::text like '13000000-0000-0000-0000-%'
      and source_id::text like '13%0000-0000-0000-%'
  ),
  26,
  'all ledger assertions are scoped to test-owned users and sources'
);

select * from finish();
rollback;
