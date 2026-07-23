begin;

select plan(15);

select has_table('public', 'review_cards', 'review cards exists');
select has_table('public', 'review_card_media', 'review card media exists');
select has_column(
  'public',
  'review_cards',
  'requires_recompletion',
  'review cards carry the recompletion flag'
);
select col_is_pk('public', 'review_cards', 'id', 'review cards use a UUID key');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.review_cards'::regclass
      and contype = 'u'
      and conkey = (
        select array_agg(attnum)
        from pg_attribute
        where attrelid = 'public.review_cards'::regclass
          and attname = 'stable_code'
      )
  ),
  'review card stable codes are unique'
);
select is(
  (
    select count(*)::integer
    from pg_class relation
    where relation.oid in (
      'public.review_cards'::regclass,
      'public.review_card_media'::regclass
    )
      and relation.relrowsecurity
  ),
  2,
  'both review tables enable RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.review_cards',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot mutate review cards directly'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.review_card_media',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated users cannot mutate review media directly'
);
select is(
  (
    select count(*)::integer
    from pg_policy
    where polrelid in (
      'public.review_cards'::regclass,
      'public.review_card_media'::regclass
    )
      and coalesce(pg_get_expr(polqual, polrelid), '') ~* '^\s*true\s*$'
  ),
  0,
  'no review policy uses an unconditional true predicate'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'review.student.a@colorplay.test',
  crypt('LocalOnly-Review1!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
);

insert into public.courses (id, stable_code, title, description, status, sort_order)
values (
  '20100000-0000-0000-0000-000000000001',
  'review-course-020', 'Review 測試課程', '', 'published', 90
);
insert into public.chapters (id, course_id, stable_code, title, description, status, sort_order)
values (
  '20200000-0000-0000-0000-000000000001',
  '20100000-0000-0000-0000-000000000001',
  'review-chapter-020', 'Review 測試章節', '', 'published', 1
);
insert into public.sections (id, chapter_id, stable_code, title, description, status, sort_order)
values (
  '20300000-0000-0000-0000-000000000001',
  '20200000-0000-0000-0000-000000000001',
  'review-section-020', 'Review 測試小節', '', 'published', 1
);
insert into public.subtopics (id, section_id, stable_code, title, description, status, sort_order)
values (
  '20400000-0000-0000-0000-000000000001',
  '20300000-0000-0000-0000-000000000001',
  'review-subtopic-020', 'Review 測試子題', '', 'published', 1
);

insert into public.review_cards (
  id, subtopic_id, stable_code, group_label, title, content, version, status,
  requires_recompletion, sort_order
)
values
  (
    '20500000-0000-0000-0000-000000000001',
    '20400000-0000-0000-0000-000000000001',
    'review-card-020-published', '色彩的分類', '已發布卡片',
    '這張卡片已發布，學生應可讀取。', 1, 'published', false, 1
  ),
  (
    '20500000-0000-0000-0000-000000000002',
    '20400000-0000-0000-0000-000000000001',
    'review-card-020-draft', '色彩的分類', '草稿卡片',
    '這張卡片是草稿，學生不應看見。', 1, 'draft', false, 2
  ),
  (
    '20500000-0000-0000-0000-000000000003',
    '20400000-0000-0000-0000-000000000001',
    'review-card-020-archived', '色彩的分類', '封存卡片',
    '這張卡片已封存，學生不應看見。', 2, 'archived', false, 3
  );

insert into public.review_card_media (
  id, review_card_id, card_version, asset_path, alt_text, sort_order
)
values
  (
    '20600000-0000-0000-0000-000000000001',
    '20500000-0000-0000-0000-000000000001',
    1, '/media/review/sample.svg', '色相環示意圖', 1
  ),
  (
    '20600000-0000-0000-0000-000000000002',
    '20500000-0000-0000-0000-000000000002',
    1, '/media/review/draft.svg', '草稿附圖', 1
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);
select is(
  (
    select count(id)::integer
    from public.review_cards
    where subtopic_id = '20400000-0000-0000-0000-000000000001'
  ),
  1,
  'a student lists only the published card of the subtopic'
);
select is(
  (
    select count(id)::integer
    from public.review_cards
    where id = '20500000-0000-0000-0000-000000000002'
  ),
  0,
  'a direct draft-card ID probe returns zero rows'
);
select is(
  (
    select count(id)::integer
    from public.review_cards
    where id = '20500000-0000-0000-0000-000000000003'
  ),
  0,
  'an archived card is invisible to students'
);
select is(
  (
    select count(id)::integer
    from public.review_card_media
    where review_card_id = '20500000-0000-0000-0000-000000000001'
  ),
  1,
  'media of a published card is readable'
);
select is(
  (
    select count(id)::integer
    from public.review_card_media
    where review_card_id = '20500000-0000-0000-0000-000000000002'
  ),
  0,
  'media of a draft card stays hidden'
);

reset role;
set local role anon;
select throws_ok(
  $$select id from public.review_cards$$,
  '42501',
  null,
  'anonymous cannot read review cards'
);

reset role;
select * from finish();
rollback;
