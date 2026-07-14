begin;

select plan(10);

select has_table('public', 'courses', 'courses exists');
select has_table('public', 'chapters', 'chapters exists');
select has_table('public', 'questions', 'questions exists');
select has_table('public', 'question_options', 'question options exists');
select has_view(
  'public',
  'question_options_public',
  'safe public question options view exists'
);
select hasnt_column(
  'public',
  'question_options_public',
  'is_correct',
  'safe option payload has no correctness column'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000003',
  'authenticated',
  'authenticated',
  'content.student@colorplay.test',
  crypt('LocalOnly-Content1!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '',
  '',
  '',
  ''
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000003',
  true
);

select is(
  (select count(*)::integer from public.chapters),
  6,
  'student reads all six published chapters'
);
select is(
  (select count(*)::integer from public.questions),
  12,
  'student reads twelve published questions but not the draft question'
);
select is(
  (select count(*)::integer from public.question_options_public),
  48,
  'student reads safe options for published questions'
);
select throws_ok(
  $$select is_correct from public.question_options limit 1$$,
  '42501',
  null,
  'student cannot query option correctness directly'
);

select * from finish();

rollback;
