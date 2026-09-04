-- Section-scoped live activities: the dropdown listing is teacher-only,
-- the create command validates the section against the template's chapter,
-- and the freeze samples questions from the chosen section only.

begin;

select plan(13);

select has_function(
  'public', 'list_live_section_options', 'section options listing exists'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '44000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'section.live.host@colorplay.test',
    crypt('LocalOnly-Sec1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'section.live.other@colorplay.test',
    crypt('LocalOnly-Sec2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'section.live.student@colorplay.test',
    crypt('LocalOnly-Sec3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id in (
  '44000000-0000-0000-0000-000000000001',
  '44000000-0000-0000-0000-000000000002'
);

insert into public.classrooms (
  id, owner_teacher_id, name, join_code_hash, join_code_version,
  join_code_rotated_at, status
)
values (
  '44100000-0000-0000-0000-000000000001',
  '44000000-0000-0000-0000-000000000001',
  'Section Live Classroom', decode(repeat('f4', 32), 'hex'), 1, now(),
  'active'
);

insert into public.classroom_members (
  classroom_id, user_id, member_role, status, joined_at, activated_at,
  last_join_request_id
)
values (
  '44100000-0000-0000-0000-000000000001',
  '44000000-0000-0000-0000-000000000001',
  'teacher', 'active', now(), now(), '44200000-0000-0000-0000-000000000001'
);

create function pg_temp.as_user(target_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select set_config('request.jwt.claim.sub', target_user::text, true);
$$;

set local role authenticated;

select pg_temp.as_user('44000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select public.list_live_section_options()$$,
  'P0001',
  'LIVE_TEACHER_ROLE_REQUIRED',
  'students cannot list the section options'
);

select pg_temp.as_user('44000000-0000-0000-0000-000000000001');
select is(
  (
    select bool_or(
      entry ->> 'section_id' = 'cd732278-0bfe-1293-19e1-338db3fe6a3c'
      and entry ->> 'quiz_template_id'
        = '4f208855-dfc8-6cc5-7671-02dfacba85d1'
      and entry ->> 'title' like '3-1%'
    )
    from jsonb_array_elements(public.list_live_section_options()) entry
  ),
  true,
  'the listing pairs the imported 3-1 section with its section template'
);

select is(
  jsonb_array_length(public.list_live_section_options()),
  3,
  'only sections with a published LT question bank are listed for Live'
);

select throws_ok(
  $$select public.create_live_activity(
    '無小節範圍活動', '26000000-0000-0000-0000-000000000003', 20
  )$$,
  'P0001',
  'LIVE_SECTION_NOT_FOUND',
  'Live rejects chapter-wide templates without a section scope'
);

-- A section from another chapter's template is rejected.
select throws_ok(
  $$select public.create_live_activity(
    '錯章活動', '26000000-0000-0000-0000-000000000001', 20, 'screen_only',
    'cd732278-0bfe-1293-19e1-338db3fe6a3c'
  )$$,
  'P0001',
  'LIVE_SECTION_NOT_FOUND',
  'a section outside the template chapter is rejected'
);

select set_config(
  'test.activity',
  public.create_live_activity(
    '3-1 色彩三要素與色名的表示', '4f208855-dfc8-6cc5-7671-02dfacba85d1',
    20, 'screen_only', 'cd732278-0bfe-1293-19e1-338db3fe6a3c'
  )::text,
  true
);
select is(
  current_setting('test.activity')::jsonb ->> 'section_id',
  'cd732278-0bfe-1293-19e1-338db3fe6a3c',
  'the activity stores its section scope'
);

select set_config(
  'test.session',
  public.create_live_session(
    (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid,
    '44100000-0000-0000-0000-000000000001',
    null
  )::text,
  true
);

reset role;
update public.profiles
set role = 'student'
where id = '44000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  format(
    'select public.start_live_session(%L::uuid, 1)',
    current_setting('test.session')::jsonb ->> 'session_id'
  ),
  'P0001', 'LIVE_SESSION_NOT_FOUND',
  'a demoted host cannot start a previously created Live session'
);

reset role;
update public.profiles
set role = 'teacher'
where id = '44000000-0000-0000-0000-000000000001';
update public.classrooms
set owner_teacher_id = '44000000-0000-0000-0000-000000000002'
where id = '44100000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  format(
    'select public.start_live_session(%L::uuid, 1)',
    current_setting('test.session')::jsonb ->> 'session_id'
  ),
  'P0001', 'LIVE_SESSION_NOT_FOUND',
  'a stale host cannot start Live after classroom ownership changes'
);

reset role;
update public.classrooms
set owner_teacher_id = '44000000-0000-0000-0000-000000000001',
    status = 'archived'
where id = '44100000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok(
  format(
    'select public.start_live_session(%L::uuid, 1)',
    current_setting('test.session')::jsonb ->> 'session_id'
  ),
  'P0001', 'LIVE_SESSION_NOT_FOUND',
  'a host cannot start Live for an archived classroom'
);

reset role;
update public.classrooms
set status = 'active'
where id = '44100000-0000-0000-0000-000000000001';
update public.live_activities
set status = 'archived'
where id = (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid;
set local role authenticated;
select throws_ok(
  format(
    'select public.start_live_session(%L::uuid, 1)',
    current_setting('test.session')::jsonb ->> 'session_id'
  ),
  'P0001', 'LIVE_SESSION_NOT_FOUND',
  'a host cannot start Live from an archived activity'
);

reset role;
update public.live_activities
set status = 'active'
where id = (current_setting('test.activity')::jsonb ->> 'activity_id')::uuid;
set local role authenticated;
select public.start_live_session(
  (current_setting('test.session')::jsonb ->> 'session_id')::uuid, 1
);

select is(
  (
    select bool_and(question.question_stable_code like 'LT31%')
    from public.live_session_questions question
    where question.session_id
      = (current_setting('test.session')::jsonb ->> 'session_id')::uuid
  ),
  true,
  'the freeze samples LT questions from the chosen section only'
);
select cmp_ok(
  (
    select count(*)::integer
    from public.live_session_questions question
    where question.session_id
      = (current_setting('test.session')::jsonb ->> 'session_id')::uuid
  ),
  '>', 0,
  'the section freeze produces at least one question'
);

select * from finish();

rollback;
