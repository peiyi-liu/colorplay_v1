-- Live design handoff D1+D2：班級成員安全投影 v2（member_ref／名字／學號）
-- 與教師視角單一學生進度 RPC。守門全部 42501；內部核心不得直接執行；
-- 學生端 get_learning_progress／get_review_completion 委派後行為不變。

begin;

select plan(22);

select has_column(
  'public', 'classroom_members', 'member_ref', 'member_ref surrogate exists'
);

select has_function(
  'public', 'teacher_student_progress', 'teacher student progress rpc exists'
);
select has_function(
  'public', 'review_completion_for', 'review completion core exists'
);
select has_function(
  'public', 'learning_progress_for', 'learning progress core exists'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.teacher_student_progress(uuid, uuid)', 'EXECUTE'
  ),
  'authenticated can execute teacher_student_progress'
);
select ok(
  not has_function_privilege(
    'anon', 'public.teacher_student_progress(uuid, uuid)', 'EXECUTE'
  ),
  'anon cannot execute teacher_student_progress'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.review_completion_for(uuid, uuid)', 'EXECUTE'
  ),
  'authenticated cannot call review completion core directly'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.learning_progress_for(uuid, uuid)', 'EXECUTE'
  ),
  'authenticated cannot call learning progress core directly'
);

-- fixtures：擁有者教師、外部教師、兩位學生。
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '45000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'teacher.tsp@colorplay.test',
    crypt('LocalOnly-Tsp1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '45000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'teacher.tsp.other@colorplay.test',
    crypt('LocalOnly-Tsp2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '45000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'student.tsp.a@colorplay.test',
    crypt('LocalOnly-Tsp3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '45000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'student.tsp.b@colorplay.test',
    crypt('LocalOnly-Tsp4!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles set role = 'teacher'
where id in (
  '45000000-0000-0000-0000-000000000001',
  '45000000-0000-0000-0000-000000000002'
);

update public.profiles
set display_name = '光譜獵人', full_name = '陳品妍', login_account = 's1130201'
where id = '45000000-0000-0000-0000-000000000003';

update public.profiles
set display_name = '補色隊長', full_name = '林彥廷', login_account = 's1130205'
where id = '45000000-0000-0000-0000-000000000004';

select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000001', true
);
select * from public.create_classroom('學生進度測試班') \gset created_

select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000003', true
);
select * from public.join_classroom(
  :'created_join_code', '45000000-0000-0000-0000-00000000a001'
);

select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000004', true
);
select * from public.join_classroom(
  :'created_join_code', '45000000-0000-0000-0000-00000000a002'
);

-- XP：學生 A 300、學生 B 100。created_at 必須晚於 joined_at
--（join_classroom 以 clock_timestamp 記錄），否則不計入班級 XP。
insert into public.xp_transactions (
  user_id, amount, reason, source_type, source_id, created_at
)
values
  (
    '45000000-0000-0000-0000-000000000003', 300, 'test quiz reward',
    'quiz_finalize', '45000000-0000-0000-0000-00000000b001',
    clock_timestamp() + interval '1 minute'
  ),
  (
    '45000000-0000-0000-0000-000000000004', 100, 'test quiz reward',
    'quiz_finalize', '45000000-0000-0000-0000-00000000b002',
    clock_timestamp() + interval '1 minute'
  );

select membership.member_ref as member_ref_a
from public.classroom_members membership
where membership.classroom_id = :'created_classroom_id'
  and membership.user_id = '45000000-0000-0000-0000-000000000003' \gset student_

-- 擁有者投影：兩位學生、含名字／學號、member_ref 非空。
select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000001', true
);

select is(
  (
    select count(*)::integer
    from public.list_owned_classroom_members(:'created_classroom_id')
  ),
  2,
  'owner sees both student members'
);

select is(
  (
    select member.full_name || '|' || member.login_account
    from public.list_owned_classroom_members(:'created_classroom_id') member
    where member.display_name = '光譜獵人'
  ),
  '陳品妍|s1130201',
  'projection carries full name and login account'
);

select ok(
  (
    select bool_and(member.member_ref is not null)
    from public.list_owned_classroom_members(:'created_classroom_id') member
  ),
  'every member row has a member_ref'
);

-- 學生不得讀成員投影。
select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000003', true
);
select throws_ok(
  format(
    'select * from public.list_owned_classroom_members(%L)',
    :'created_classroom_id'
  ),
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'students cannot read the member projection'
);

-- 擁有者讀學生進度。
select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000001', true
);

select is(
  (
    select payload->'identity'->>'full_name'
    from public.teacher_student_progress(
      :'created_classroom_id', :'student_member_ref_a'
    ) payload
  ),
  '陳品妍',
  'identity comes from the safe projection'
);

select is(
  (
    select (payload->'stats'->>'class_rank')::integer
    from public.teacher_student_progress(
      :'created_classroom_id', :'student_member_ref_a'
    ) payload
  ),
  1,
  'class rank follows leaderboard rules (higher xp ranks first)'
);

select is(
  (
    select (payload->'stats'->>'class_xp')::bigint
    from public.teacher_student_progress(
      :'created_classroom_id', :'student_member_ref_a'
    ) payload
  ),
  300::bigint,
  'class xp sums transactions since joining'
);

select is(
  (
    select (payload->'stats'->>'open_mistake_count')::integer
    from public.teacher_student_progress(
      :'created_classroom_id', :'student_member_ref_a'
    ) payload
  ),
  0,
  'open mistake count starts at zero'
);

select is(
  (
    select jsonb_typeof(payload->'chapters')
    from public.teacher_student_progress(
      :'created_classroom_id', :'student_member_ref_a'
    ) payload
  ),
  'array',
  'chapters payload is an array'
);

-- 外部教師與學生一律 42501；亂數 member_ref 也是 42501。
select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000002', true
);
select throws_ok(
  format(
    'select public.teacher_student_progress(%L, %L)',
    :'created_classroom_id', :'student_member_ref_a'
  ),
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'other teachers cannot read student progress'
);

select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000003', true
);
select throws_ok(
  format(
    'select public.teacher_student_progress(%L, %L)',
    :'created_classroom_id', :'student_member_ref_a'
  ),
  '42501',
  'CLASSROOM_NOT_AVAILABLE',
  'students cannot read progress through the teacher rpc'
);

select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000001', true
);
select throws_ok(
  format(
    'select public.teacher_student_progress(%L, %L)',
    :'created_classroom_id', '45000000-0000-0000-0000-00000000c999'
  ),
  '42501',
  'MEMBER_NOT_AVAILABLE',
  'unknown member_ref is rejected'
);

-- 委派迴歸：學生端包裝函式與核心（同一 user）結果一致。
select set_config(
  'request.jwt.claim.sub', '45000000-0000-0000-0000-000000000003', true
);

select results_eq(
  $$
    select scope, chapter_id, subtopic_id, review_completed, review_total,
           coverage, accuracy, mastery, status
    from public.get_learning_progress()
    order by scope, chapter_id, subtopic_id
  $$,
  $$
    select scope, chapter_id, subtopic_id, review_completed, review_total,
           coverage, accuracy, mastery, status
    from public.learning_progress_for(
      '45000000-0000-0000-0000-000000000003', null
    )
    order by scope, chapter_id, subtopic_id
  $$,
  'get_learning_progress delegates to the shared core'
);

select results_eq(
  $$
    select subtopic_id, chapter_id, completed_count, total_count
    from public.get_review_completion()
    order by subtopic_id
  $$,
  $$
    select subtopic_id, chapter_id, completed_count, total_count
    from public.review_completion_for(
      '45000000-0000-0000-0000-000000000003', null
    )
    order by subtopic_id
  $$,
  'get_review_completion delegates to the shared core'
);

select * from finish();

rollback;
