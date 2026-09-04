begin;

select plan(12);

select has_column(
  'public', 'questions', 'bank_kind', 'questions expose a bank discriminator'
);
select has_column(
  'public', 'quiz_templates', 'section_id',
  'quiz templates can target one section'
);

select is(
  (select count(*)::integer from public.questions
   where stable_code like 'QB%' and bank_kind = 'section'),
  136,
  'all QB rows are stored in the section bank'
);
select is(
  (select count(*)::integer from public.questions
   where stable_code like 'CR%' and bank_kind = 'chapter'),
  62,
  'all CR rows are stored in the chapter bank'
);
select is(
  (select count(*)::integer from public.questions
   where stable_code like 'LT%' and bank_kind = 'live'),
  60,
  'all LT rows are stored in the Live-only bank'
);
select is(
  (select count(*)::integer from public.review_cards
   where stable_code like 'RC%' and status = 'published'),
  8,
  'all RC rows are published review cards'
);

update public.questions
set bank_kind = 'legacy'
where id = (
  select id from public.questions where stable_code like 'LT%' order by id limit 1
);

select public.apply_question_payload(
  (
    select id
    from public.questions
    where stable_code like 'LT%'
    order by id
    limit 1
  ),
  public.question_semantic_payload((
    select id
    from public.questions
    where stable_code like 'LT%'
    order by id
    limit 1
  ))
);

select is(
  (
    select bank_kind
    from public.questions
    where stable_code like 'LT%'
    order by id
    limit 1
  ),
  'live',
  'versioned content commands derive the Live bank from an LT code'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '49000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'content.pool.student@colorplay.test',
  crypt('LocalOnly-ContentPool1!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
);

select set_config(
  'request.jwt.claim.sub',
  '49000000-0000-0000-0000-000000000001',
  true
);

select set_config(
  'test.chapter_session',
  public.create_quiz_session(
    '26000000-0000-0000-0000-000000000003',
    '49000000-0000-0000-0000-000000000002'
  )::text,
  true
);
select is(
  (
    select bool_and(question.question_stable_code like 'CR3%')
    from public.quiz_session_questions question
    where question.session_id =
      (current_setting('test.chapter_session')::jsonb ->> 'session_id')::uuid
  ),
  true,
  'chapter challenge freezes CR questions only'
);

select set_config(
  'test.section_session',
  public.create_quiz_session(
    '4f208855-dfc8-6cc5-7671-02dfacba85d1',
    '49000000-0000-0000-0000-000000000003'
  )::text,
  true
);
select is(
  (
    select bool_and(question.question_stable_code like 'QB31%')
    from public.quiz_session_questions question
    where question.session_id =
      (current_setting('test.section_session')::jsonb ->> 'session_id')::uuid
  ),
  true,
  '3-1 section challenge freezes QB31 questions only'
);

select is(
  public.get_accessible_chapter_review(
    '21000000-0000-0000-0000-000000000003'
  ) -> 0 ->> 'quiz_template_id',
  '4f208855-dfc8-6cc5-7671-02dfacba85d1',
  'review response exposes the matching section challenge template'
);
select is(
  (
    select bool_and(entry ->> 'stable_code' <> 'sheet-3-final')
    from jsonb_array_elements(public.get_accessible_chapter_review(
      '21000000-0000-0000-0000-000000000003'
    )) entry
  ),
  true,
  'synthetic CR storage section is not rendered as a review section'
);

select throws_ok(
  $$insert into public.quiz_templates (
    chapter_id, section_id, stable_code, title, question_count, status
  ) values (
    '21000000-0000-0000-0000-000000000001',
    'cd732278-0bfe-1293-19e1-338db3fe6a3c',
    'invalid-cross-chapter-template', 'Invalid', 1, 'draft'
  )$$,
  '23514',
  'quiz template section must belong to its chapter',
  'database rejects a cross-chapter section template'
);

select * from finish();

rollback;
