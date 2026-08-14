begin;

select plan(12);

select ok(
  has_function_privilege(
    'authenticated',
    'public.teacher_chapter_completion_summary(uuid, uuid)',
    'EXECUTE'
  ),
  'authenticated teachers may read chapter completion summaries'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.teacher_chapter_completion_summary(uuid, uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot read chapter completion summaries'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.teacher_question_detail(uuid, text)',
    'EXECUTE'
  ),
  'authenticated teachers may read question detail'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.teacher_question_detail(uuid, text)',
    'EXECUTE'
  ),
  'anonymous users cannot read question detail'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '29700000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'completion.teacher@colorplay.test',
    crypt('LocalOnly-Completion1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '29700000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'completion.student@colorplay.test',
    crypt('LocalOnly-Completion2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '29700000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'completion.other@colorplay.test',
    crypt('LocalOnly-Completion3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '29700000-0000-0000-0000-000000000001',
  '29700000-0000-0000-0000-000000000003'
);
update public.profiles
set display_name = case id
  when '29700000-0000-0000-0000-000000000002' then '未完成學生'
  else display_name
end;

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '29800000-0000-0000-0000-000000000001',
  '29700000-0000-0000-0000-000000000001',
  'Completion Classroom', decode(repeat('f3', 32), 'hex'), 1, now(), 'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values
  (
    '29800000-0000-0000-0000-000000000001',
    '29700000-0000-0000-0000-000000000001',
    'teacher', 'active', now(), now(),
    '29900000-0000-0000-0000-000000000001'
  ),
  (
    '29800000-0000-0000-0000-000000000001',
    '29700000-0000-0000-0000-000000000002',
    'student', 'active', now(), now(),
    '29900000-0000-0000-0000-000000000002'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '29700000-0000-0000-0000-000000000001',
  true
);

select results_eq(
  $$select completed_students, total_students, completion_rate
    from public.teacher_chapter_completion_summary(
      '29800000-0000-0000-0000-000000000001', null
    )
    order by chapter_sort_order
    limit 1$$,
  $$values (0, 1, 0.0::numeric)$$,
  'chapter completion uses the active-student denominator'
);

select is(
  (
    select jsonb_typeof(student_statuses)
    from public.teacher_chapter_completion_summary(
      '29800000-0000-0000-0000-000000000001', null
    )
    order by chapter_sort_order
    limit 1
  ),
  'array',
  'chapter completion includes student completion statuses'
);

select is(
  (
    select exists (
      select 1
      from jsonb_array_elements(options) as option
      where option ? 'is_correct'
    )
    from public.teacher_question_detail(
      '29800000-0000-0000-0000-000000000001', 'QB3101'
    )
  ),
  false,
  'question detail never exposes an answer flag'
);

select results_eq(
  $$select
      student ->> 'display_name',
      (student ->> 'is_complete')::boolean
    from public.teacher_chapter_completion_summary(
      '29800000-0000-0000-0000-000000000001', null
    ) summary
    cross join lateral jsonb_array_elements(summary.student_statuses) student
    order by summary.chapter_sort_order
    limit 1$$,
  $$values ('未完成學生'::text, false)$$,
  'chapter completion identifies each active student without exposing auth ids'
);

select set_config(
  'request.jwt.claim.sub',
  '29700000-0000-0000-0000-000000000003',
  true
);
select is(
  (
    select count(*)::integer
    from public.teacher_chapter_completion_summary(
      '29800000-0000-0000-0000-000000000001', null
    )
  ),
  0,
  'a non-owner reads zero chapter completion rows'
);
select is(
  (
    select count(*)::integer
    from public.teacher_question_detail(
      '29800000-0000-0000-0000-000000000001', 'QB3101'
    )
  ),
  0,
  'a non-owner reads zero teacher question detail rows'
);

select set_config(
  'request.jwt.claim.sub',
  '29700000-0000-0000-0000-000000000002',
  true
);
select is(
  (
    select count(*)::integer
    from public.teacher_question_detail(
      '29800000-0000-0000-0000-000000000001', 'QB3101'
    )
  ),
  0,
  'a student reads zero teacher question detail rows'
);
select is(
  (
    select count(*)::integer
    from public.teacher_chapter_completion_summary(
      '29800000-0000-0000-0000-000000000001', null
    )
  ),
  0,
  'a student reads zero chapter completion rows'
);

reset role;
select * from finish();
rollback;
