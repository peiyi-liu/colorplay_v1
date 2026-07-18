begin;

select plan(5);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'reads.teacher.a@colorplay.test',
    crypt('LocalOnly-Reads1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'reads.student.a@colorplay.test',
    crypt('LocalOnly-Reads2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '31000000-0000-0000-0000-000000000001';

insert into public.questions (
  id, subtopic_id, stable_code, prompt, explanation, status, sort_order
)
values (
  '31500000-0000-0000-0000-000000000001',
  (
    select id from public.subtopics
    where stable_code = 'sheet-3-1-all'
    limit 1
  ),
  '9-9-99', '草稿題目', '草稿解析', 'draft', 999
);
insert into public.question_options (
  question_id, option_key, option_text, is_correct, sort_order
)
values
  (
    '31500000-0000-0000-0000-000000000001', 'A', '正確選項', true, 1
  ),
  (
    '31500000-0000-0000-0000-000000000001', 'B', '錯誤選項', false, 2
  );

insert into public.review_cards (
  id, subtopic_id, stable_code, group_label, title, content, version, status,
  requires_recompletion, sort_order
)
values (
  '31600000-0000-0000-0000-000000000001',
  (
    select id from public.subtopics
    where stable_code = 'sheet-3-1-all'
    limit 1
  ),
  'draft-reads-card', '', '草稿卡片', '草稿內容', 1, 'draft', false, 999
);
insert into public.review_card_media (
  review_card_id, card_version, asset_path, alt_text, sort_order
)
values (
  '31600000-0000-0000-0000-000000000001', 1,
  'https://example.com/draft.png', '草稿圖片替代文字', 1
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '31000000-0000-0000-0000-000000000001',
  true
);
select is(
  (
    select count(*)::integer from public.question_options
    where question_id = '31500000-0000-0000-0000-000000000001'
  ),
  2,
  'teachers read the options of a draft question for the workspace'
);
select is(
  (
    select count(*)::integer from public.review_card_media
    where review_card_id = '31600000-0000-0000-0000-000000000001'
  ),
  1,
  'teachers read the media of a draft review card'
);

select set_config(
  'request.jwt.claim.sub',
  '31000000-0000-0000-0000-000000000002',
  true
);
select is(
  (
    select count(*)::integer from public.questions
    where stable_code = '9-9-99'
  ),
  0,
  'students still cannot see draft questions'
);
select is(
  (
    select count(*)::integer from public.question_options
    where question_id = '31500000-0000-0000-0000-000000000001'
  ),
  0,
  'students still cannot see draft question options'
);
select is(
  (
    select count(*)::integer from public.review_card_media
    where review_card_id = '31600000-0000-0000-0000-000000000001'
  ),
  0,
  'students still cannot see draft review card media'
);

reset role;
select * from finish();
rollback;
