begin;

select plan(40);

select has_table(
  'public',
  'course_progression_settings',
  'course progression settings exist'
);
select has_table(
  'public',
  'student_chapter_unlocks',
  'permanent student chapter unlocks exist'
);
select has_function('public', 'get_student_chapter_map', array[]::text[]);
select has_function('public', 'student_can_access_chapter', array['uuid']);
select has_function('public', 'assert_student_chapter_access', array['uuid']);
select has_function('public', 'get_accessible_chapter_review', array['uuid']);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '47000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'sequence.access.a@colorplay.test',
    crypt('LocalOnly-SequenceAccess1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '47000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'sequence.access.b@colorplay.test',
    crypt('LocalOnly-SequenceAccess2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '47000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'sequence.access.c@colorplay.test',
    crypt('LocalOnly-SequenceAccess3!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

-- Make Chapters 1 and 2 minimally complete published content fixtures.
update public.quiz_templates
set question_count = 1
where chapter_id in (
  '21000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000002'
);

insert into public.sections (
  id, chapter_id, stable_code, title, description, status, sort_order
)
values
  (
    '47100000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'sequence-1-1', 'Sequence Section 1', '', 'published', 1
  ),
  (
    '47100000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'sequence-2-1', 'Sequence Section 2', '', 'published', 1
  );

insert into public.subtopics (
  id, section_id, stable_code, title, description, status, sort_order
)
values
  (
    '47200000-0000-0000-0000-000000000001',
    '47100000-0000-0000-0000-000000000001',
    'sequence-1-1-all', 'Sequence Subtopic 1', '', 'published', 1
  ),
  (
    '47200000-0000-0000-0000-000000000002',
    '47100000-0000-0000-0000-000000000002',
    'sequence-2-1-all', 'Sequence Subtopic 2', '', 'published', 1
  );

insert into public.questions (
  id, subtopic_id, stable_code, prompt, explanation, status, sort_order
)
values
  (
    '47300000-0000-0000-0000-000000000001',
    '47200000-0000-0000-0000-000000000001',
    '1-1-01', 'Sequence question 1?', 'Sequence explanation 1.', 'published', 1
  ),
  (
    '47300000-0000-0000-0000-000000000002',
    '47200000-0000-0000-0000-000000000002',
    '2-1-01', 'Sequence question 2?', 'Sequence explanation 2.', 'published', 1
  );

insert into public.question_options (
  id, question_id, option_key, option_text, is_correct, sort_order
)
values
  ('47400000-0000-0000-0000-000000000001', '47300000-0000-0000-0000-000000000001', 'A', 'Correct 1', true, 1),
  ('47400000-0000-0000-0000-000000000002', '47300000-0000-0000-0000-000000000001', 'B', 'Wrong 1', false, 2),
  ('47400000-0000-0000-0000-000000000003', '47300000-0000-0000-0000-000000000002', 'A', 'Correct 2', true, 1),
  ('47400000-0000-0000-0000-000000000004', '47300000-0000-0000-0000-000000000002', 'B', 'Wrong 2', false, 2);

insert into public.review_cards (
  id, subtopic_id, stable_code, title, content, status, sort_order
)
values
  (
    '47500000-0000-0000-0000-000000000001',
    '47200000-0000-0000-0000-000000000001',
    'sequence-review-1', 'Sequence Review 1', 'Review content 1.', 'published', 1
  ),
  (
    '47500000-0000-0000-0000-000000000002',
    '47200000-0000-0000-0000-000000000002',
    'sequence-review-2', 'Sequence Review 2', 'Review content 2.', 'published', 1
  );

select set_config(
  'request.jwt.claim.sub',
  '47000000-0000-0000-0000-000000000001',
  true
);

select is(
  (public.get_student_chapter_map() ->> 'mode'),
  'open',
  'new course settings preserve open access by default'
);
select is(
  jsonb_array_length(public.get_student_chapter_map() -> 'chapters'),
  6,
  'the map returns all six published chapters'
);
select is(
  public.get_student_chapter_map() #>> '{chapters,0,access_state}',
  'available',
  'Chapter 1 is available in open mode when content is ready'
);
select is(
  public.get_student_chapter_map() #>> '{chapters,3,access_state}',
  'content_unavailable',
  'insufficient published questions remain distinct from a lock'
);
select is(
  public.get_student_chapter_map() #>> '{chapters,3,blockers,0,code}',
  'CONTENT_UNAVAILABLE',
  'unavailable content returns its structured blocker'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.student_chapter_unlocks', 'INSERT'
  ),
  'students cannot insert unlock rows'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.student_chapter_unlocks', 'UPDATE'
  ),
  'students cannot update unlock rows'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.student_chapter_unlocks', 'DELETE'
  ),
  'students cannot delete unlock rows'
);

insert into public.course_progression_settings (course_id, mode)
values ('20000000-0000-0000-0000-000000000001', 'sequential')
on conflict (course_id) do update
set mode = excluded.mode,
    updated_at = clock_timestamp();

select ok(
  public.student_can_access_chapter(
    '21000000-0000-0000-0000-000000000001'
  ),
  'Chapter 1 remains accessible in sequential mode'
);
select ok(
  not public.student_can_access_chapter(
    '21000000-0000-0000-0000-000000000002'
  ),
  'Chapter 2 is locked before a permanent unlock exists'
);
select is(
  public.chapter_access_blockers(
    '21000000-0000-0000-0000-000000000002'
  ) -> 0 ->> 'code',
  'PREREQUISITE_REVIEW',
  'the first blocker identifies prerequisite review progress'
);
select is(
  public.chapter_access_blockers(
    '21000000-0000-0000-0000-000000000002'
  ) -> 1 ->> 'code',
  'PREREQUISITE_MASTERY',
  'the second blocker identifies prerequisite mastery'
);
select throws_ok(
  $$select public.assert_student_chapter_access(
    '21000000-0000-0000-0000-000000000002'
  )$$,
  'P0001',
  'CHAPTER_LOCKED',
  'the shared guard rejects direct locked access'
);
select throws_ok(
  $$select public.get_accessible_chapter_review(
    '21000000-0000-0000-0000-000000000002'
  )$$,
  'P0001',
  'CHAPTER_LOCKED',
  'the guarded review read cannot bypass a lock'
);

select throws_ok(
  $$select public.complete_review_card(
    '47500000-0000-0000-0000-000000000002',
    '47600000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'CHAPTER_LOCKED',
  'review completion cannot bypass a chapter lock'
);
select throws_ok(
  $$select public.create_quiz_session(
    '26000000-0000-0000-0000-000000000002',
    '47600000-0000-0000-0000-000000000002'
  )$$,
  'P0001',
  'CHAPTER_LOCKED',
  'ordinary challenge creation cannot bypass a chapter lock'
);
select throws_ok(
  $$select public.start_mastery_session(
    '21000000-0000-0000-0000-000000000002'
  )$$,
  'P0001',
  'CHAPTER_LOCKED',
  'after-school mastery cannot bypass a chapter lock'
);
select throws_ok(
  $$select public.start_remediation_session(
    '47200000-0000-0000-0000-000000000002',
    '47600000-0000-0000-0000-000000000003'
  )$$,
  'P0001',
  'CHAPTER_LOCKED',
  'remediation cannot bypass a chapter lock'
);

select lives_ok(
  $$select public.complete_review_card(
    '47500000-0000-0000-0000-000000000001',
    '47600000-0000-0000-0000-000000000004'
  )$$,
  'Chapter 1 review completion remains available'
);
select is(
  (
    select count(*)::integer
    from public.student_chapter_unlocks
    where user_id = '47000000-0000-0000-0000-000000000001'
  ),
  0,
  'review completion without mastery does not unlock Chapter 2'
);

select set_config(
  'test.sequence_a_quiz',
  public.create_quiz_session(
    '26000000-0000-0000-0000-000000000001',
    '47600000-0000-0000-0000-000000000005'
  )::text,
  true
);
select set_config(
  'test.sequence_a_session',
  current_setting('test.sequence_a_quiz')::jsonb ->> 'session_id',
  true
);
select set_config(
  'test.sequence_a_question',
  current_setting('test.sequence_a_quiz')::jsonb
    #>> '{questions,0,session_question_id}',
  true
);
select set_config(
  'test.sequence_a_correct',
  (
    select question.correct_option_id::text
    from public.quiz_session_questions question
    where question.id = current_setting('test.sequence_a_question')::uuid
  ),
  true
);
select set_config(
  'test.sequence_a_answer',
  public.submit_quiz_answer(
    current_setting('test.sequence_a_question')::uuid,
    '47600000-0000-0000-0000-000000000006',
    current_setting('test.sequence_a_correct')::uuid
  )::text,
  true
);
select lives_ok(
  $$select public.finalize_quiz_session(
    current_setting('test.sequence_a_session')::uuid
  )$$,
  'the completion transition grants the next chapter'
);

select ok(
  public.student_can_access_chapter(
    '21000000-0000-0000-0000-000000000002'
  ),
  'a stored unlock makes Chapter 2 accessible'
);
select is(
  (
    select count(*)::integer
    from public.student_chapter_unlocks
    where user_id = '47000000-0000-0000-0000-000000000001'
      and chapter_id = '21000000-0000-0000-0000-000000000002'
  ),
  1,
  'idempotent insertion stores one unlock per student and chapter'
);
select lives_ok(
  $$select public.finalize_quiz_session(
    current_setting('test.sequence_a_session')::uuid
  )$$,
  'repeating the terminal request is harmless'
);
select is(
  jsonb_array_length(
    public.get_accessible_chapter_review(
      '21000000-0000-0000-0000-000000000002'
    )
  ),
  1,
  'an unlocked chapter returns its published review tree'
);

select set_config(
  'request.jwt.claim.sub',
  '47000000-0000-0000-0000-000000000002',
  true
);
select set_config(
  'test.sequence_b_quiz',
  public.create_quiz_session(
    '26000000-0000-0000-0000-000000000001',
    '47600000-0000-0000-0000-000000000007'
  )::text,
  true
);
select set_config(
  'test.sequence_b_session',
  current_setting('test.sequence_b_quiz')::jsonb ->> 'session_id',
  true
);
select set_config(
  'test.sequence_b_question',
  current_setting('test.sequence_b_quiz')::jsonb
    #>> '{questions,0,session_question_id}',
  true
);
select set_config(
  'test.sequence_b_correct',
  (
    select question.correct_option_id::text
    from public.quiz_session_questions question
    where question.id = current_setting('test.sequence_b_question')::uuid
  ),
  true
);
select set_config(
  'test.sequence_b_answer',
  public.submit_quiz_answer(
    current_setting('test.sequence_b_question')::uuid,
    '47600000-0000-0000-0000-000000000008',
    current_setting('test.sequence_b_correct')::uuid
  )::text,
  true
);
select lives_ok(
  $$select public.finalize_quiz_session(
    current_setting('test.sequence_b_session')::uuid
  )$$,
  'a second student can reach formal mastery in Chapter 1'
);
select is(
  (
    select count(*)::integer
    from public.student_chapter_unlocks
    where user_id = '47000000-0000-0000-0000-000000000002'
  ),
  0,
  'mastery without review completion does not unlock Chapter 2'
);

update public.course_progression_settings
set mode = 'open', updated_at = clock_timestamp()
where course_id = '20000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select public.complete_review_card(
    '47500000-0000-0000-0000-000000000001',
    '47600000-0000-0000-0000-000000000009'
  )$$,
  'open mode still records an earned permanent unlock'
);
select is(
  (
    select count(*)::integer
    from public.student_chapter_unlocks
    where user_id = '47000000-0000-0000-0000-000000000002'
      and chapter_id = '21000000-0000-0000-0000-000000000002'
  ),
  1,
  'open mode completion records Chapter 2 before activation'
);
update public.course_progression_settings
set mode = 'sequential', updated_at = clock_timestamp()
where course_id = '20000000-0000-0000-0000-000000000001';

update public.review_cards
set status = 'archived'
where id = '47500000-0000-0000-0000-000000000001';
select ok(
  public.student_can_access_chapter(
    '21000000-0000-0000-0000-000000000002'
  ),
  'later prerequisite content edits never revoke a stored unlock'
);

select set_config(
  'request.jwt.claim.sub',
  '47000000-0000-0000-0000-000000000003',
  true
);
select ok(
  not public.student_can_access_chapter(
    '21000000-0000-0000-0000-000000000002'
  ),
  'another student remains locked'
);

insert into public.student_chapter_unlocks (user_id, chapter_id)
values (
  '47000000-0000-0000-0000-000000000003',
  '21000000-0000-0000-0000-000000000004'
);
select ok(
  not public.student_can_access_chapter(
    '21000000-0000-0000-0000-000000000004'
  ),
  'an unlock row never makes unavailable content accessible'
);

select is(
  public.get_student_chapter_map() ->> 'rules_version',
  '2026-08-sequence-1',
  'the map pins the progression rules version'
);
select is(
  public.get_student_chapter_map() #>> '{chapters,1,access_state}',
  'locked',
  'the second student map remains server-authoritatively locked'
);

select * from finish();
rollback;
