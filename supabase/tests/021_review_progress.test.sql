begin;

select plan(18);

select has_table('public', 'review_progress', 'review progress exists');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.review_progress'::regclass
      and conname = 'review_progress_user_card_version_unique'
  ),
  'one completion exists per user, card, and version'
);
select is(
  (
    select count(*)::integer
    from pg_class relation
    where relation.oid = 'public.review_progress'::regclass
      and relation.relrowsecurity
  ),
  1,
  'review progress enables RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.review_progress',
    'INSERT,UPDATE,DELETE'
  ),
  'completion rows are only written by the trusted command'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.complete_review_card(uuid, uuid)',
    'EXECUTE'
  ),
  'students may call the completion command'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.complete_review_card(uuid, uuid)',
    'EXECUTE'
  ),
  'anonymous cannot call the completion command'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '21100000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'progress.student.a@colorplay.test',
    crypt('LocalOnly-Progress1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '21100000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'progress.student.b@colorplay.test',
    crypt('LocalOnly-Progress2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

insert into public.courses (id, stable_code, title, description, status, sort_order)
values (
  '21200000-0000-0000-0000-000000000001',
  'progress-course-021', 'Progress 測試課程', '', 'published', 91
);
insert into public.chapters (id, course_id, stable_code, title, description, status, sort_order)
values (
  '21300000-0000-0000-0000-000000000001',
  '21200000-0000-0000-0000-000000000001',
  'progress-chapter-021', 'Progress 測試章節', '', 'published', 1
);
insert into public.sections (id, chapter_id, stable_code, title, description, status, sort_order)
values (
  '21400000-0000-0000-0000-000000000001',
  '21300000-0000-0000-0000-000000000001',
  'progress-section-021', 'Progress 測試小節', '', 'published', 1
);
insert into public.subtopics (id, section_id, stable_code, title, description, status, sort_order)
values
  (
    '21500000-0000-0000-0000-000000000001',
    '21400000-0000-0000-0000-000000000001',
    'progress-subtopic-021', 'Progress 測試子題', '', 'published', 1
  ),
  (
    '21500000-0000-0000-0000-000000000002',
    '21400000-0000-0000-0000-000000000001',
    'progress-subtopic-021-empty', 'Progress 空子題', '', 'published', 2
  );

insert into public.review_cards (
  id, subtopic_id, stable_code, group_label, title, content, version, status,
  requires_recompletion, sort_order
)
values
  (
    '21600000-0000-0000-0000-000000000001',
    '21500000-0000-0000-0000-000000000001',
    'progress-card-021-sticky', '觀念', '不需重讀的卡片',
    '版本更新後仍算完成。', 1, 'published', false, 1
  ),
  (
    '21600000-0000-0000-0000-000000000002',
    '21500000-0000-0000-0000-000000000001',
    'progress-card-021-strict', '觀念', '需要重讀的卡片',
    '版本更新後必須重新完成。', 1, 'published', true, 2
  ),
  (
    '21600000-0000-0000-0000-000000000003',
    '21500000-0000-0000-0000-000000000001',
    'progress-card-021-draft', '觀念', '草稿卡片',
    '草稿不進分母也不可完成。', 1, 'draft', false, 3
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21100000-0000-0000-0000-000000000001',
  true
);

select lives_ok(
  $$select public.complete_review_card(
    '21600000-0000-0000-0000-000000000001',
    '21700000-0000-0000-0000-000000000001'
  )$$,
  'a student completes a published card'
);
select lives_ok(
  $$select public.complete_review_card(
    '21600000-0000-0000-0000-000000000001',
    '21700000-0000-0000-0000-000000000002'
  )$$,
  'replaying the completion is idempotent'
);
select throws_ok(
  $$select public.complete_review_card(
    '21600000-0000-0000-0000-000000000003',
    '21700000-0000-0000-0000-000000000003'
  )$$,
  'P0001',
  'REVIEW_CARD_NOT_FOUND',
  'a draft card cannot be completed'
);
select throws_ok(
  $$select public.complete_review_card(
    '21600000-0000-0000-0000-000000000099',
    '21700000-0000-0000-0000-000000000004'
  )$$,
  'P0001',
  'REVIEW_CARD_NOT_FOUND',
  'an unknown card id yields the generic denial'
);

select lives_ok(
  $$select public.complete_review_card(
    '21600000-0000-0000-0000-000000000002',
    '21700000-0000-0000-0000-000000000005'
  )$$,
  'the strict card completes at version 1'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.review_progress
    where user_id = '21100000-0000-0000-0000-000000000001'
      and review_card_id = '21600000-0000-0000-0000-000000000001'
  ),
  1,
  'idempotent replays keep a single completion row'
);
select is(
  (
    select rules_version
    from public.review_progress
    where user_id = '21100000-0000-0000-0000-000000000001'
      and review_card_id = '21600000-0000-0000-0000-000000000001'
  ),
  '2026-07-progress-1',
  'completions stamp the progress rules version'
);

-- Publish version 2 of both cards: the sticky card keeps its completion, the
-- strict card demands recompletion.
update public.review_cards
set version = 2
where id in (
  '21600000-0000-0000-0000-000000000001',
  '21600000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21100000-0000-0000-0000-000000000001',
  true
);
select results_eq(
  $$select completed_count, total_count
    from public.get_review_completion('21300000-0000-0000-0000-000000000001')
    where subtopic_id = '21500000-0000-0000-0000-000000000001'$$,
  $$values (1, 2)$$,
  'after a version bump only the recompletion-exempt card stays completed'
);
select results_eq(
  $$select completed_count, total_count
    from public.get_review_completion('21300000-0000-0000-0000-000000000001')
    where subtopic_id = '21500000-0000-0000-0000-000000000002'$$,
  $$values (0, 0)$$,
  'a subtopic without published cards reports a zero denominator'
);
select lives_ok(
  $$select public.complete_review_card(
    '21600000-0000-0000-0000-000000000002',
    '21700000-0000-0000-0000-000000000006'
  )$$,
  'recompleting the strict card at version 2 succeeds'
);
select results_eq(
  $$select completed_count, total_count
    from public.get_review_completion('21300000-0000-0000-0000-000000000001')
    where subtopic_id = '21500000-0000-0000-0000-000000000001'$$,
  $$values (2, 2)$$,
  'recompletion restores full completion'
);

select set_config(
  'request.jwt.claim.sub',
  '21100000-0000-0000-0000-000000000002',
  true
);
select is(
  (
    select count(*)::integer
    from public.review_progress
  ),
  0,
  'a student reads no other student''s completions'
);

reset role;
select * from finish();
rollback;
