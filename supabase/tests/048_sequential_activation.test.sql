begin;

select plan(27);

select has_function('public', 'activate_course_sequential', array['uuid']);
select has_function('public', 'reopen_course_progression', array['uuid']);

update public.chapters
set title = case sort_order
      when 1 then '認識色彩'
      when 2 then '色彩呈現'
      when 3 then '色彩表示'
      when 4 then '色彩感知'
      when 5 then '色彩認知'
      when 6 then '色彩應用'
    end,
    description = 'Sequence activation fixture',
    status = 'published'
where course_id = '20000000-0000-0000-0000-000000000001';

update public.quiz_templates
set question_count = 1,
    status = 'published'
where chapter_id in (
  select id
  from public.chapters
  where course_id = '20000000-0000-0000-0000-000000000001'
);

insert into public.course_progression_settings (course_id, mode)
values ('20000000-0000-0000-0000-000000000001', 'open')
on conflict (course_id) do update set mode = excluded.mode;

insert into public.sections (
  id, chapter_id, stable_code, title, description, status, sort_order
)
select
  ('48100000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  ('21000000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  'activation-' || number::text,
  'Activation Section ' || number::text,
  'Published activation fixture',
  'published'::public.content_status,
  99
from generate_series(1, 6) number;

insert into public.subtopics (
  id, section_id, stable_code, title, description, status, sort_order
)
select
  ('48200000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  ('48100000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  'activation-' || number::text,
  'Activation Subtopic ' || number::text,
  'Published activation fixture',
  'published'::public.content_status,
  1
from generate_series(1, 6) number;

insert into public.questions (
  id, subtopic_id, stable_code, bank_kind, prompt, explanation, status, sort_order
)
select
  ('48300000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  ('48200000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  number::text || '-99-01',
  'chapter',
  'Activation question ' || number::text || '?',
  'Activation explanation ' || number::text || '.',
  'published'::public.content_status,
  1
from generate_series(1, 6) number;

insert into public.question_options (
  id, question_id, option_key, option_text, is_correct, sort_order
)
select
  (
    case option_number
      when 1 then '48400000-0000-0000-0001-'
      else '48400000-0000-0000-0002-'
    end || lpad(number::text, 12, '0')
  )::uuid,
  ('48300000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  case option_number when 1 then 'A' else 'B' end,
  case option_number when 1 then 'Correct' else 'Wrong' end,
  option_number = 1,
  option_number
from generate_series(1, 6) number
cross join generate_series(1, 2) option_number;

insert into public.review_cards (
  id, subtopic_id, stable_code, title, content, status, sort_order
)
select
  ('48500000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  ('48200000-0000-0000-0000-' || lpad(number::text, 12, '0'))::uuid,
  'activation-review-' || number::text,
  'Activation Review ' || number::text,
  'Activation review content.',
  'published'::public.content_status,
  1
from generate_series(1, 6) number;

update public.chapters
set status = 'draft'
where stable_code = 'chapter-6';
select throws_ok(
  $$select public.activate_course_sequential(
    '20000000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'SEQUENTIAL_CONTENT_NOT_READY',
  'five published chapters cannot activate sequential mode'
);
select is(
  (select mode from public.course_progression_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'open',
  'failed chapter-count validation leaves mode open'
);
update public.chapters set status = 'published' where stable_code = 'chapter-6';

update public.chapters set sort_order = 5 where stable_code = 'chapter-6';
select throws_ok(
  $$select public.activate_course_sequential(
    '20000000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'SEQUENTIAL_CONTENT_NOT_READY',
  'duplicate sort order cannot activate sequential mode'
);
select is(
  (select mode from public.course_progression_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'open',
  'failed identity validation leaves mode open'
);
update public.chapters set sort_order = 6 where stable_code = 'chapter-6';

update public.chapters set description = '' where stable_code = 'chapter-2';
select throws_ok(
  $$select public.activate_course_sequential(
    '20000000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'SEQUENTIAL_CONTENT_NOT_READY',
  'blank chapter description cannot activate sequential mode'
);
select is(
  (select mode from public.course_progression_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'open',
  'failed metadata validation leaves mode open'
);
update public.chapters set description = 'Sequence activation fixture' where stable_code = 'chapter-2';

update public.quiz_templates set status = 'draft' where chapter_id = '21000000-0000-0000-0000-000000000003';
select throws_ok(
  $$select public.activate_course_sequential(
    '20000000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'SEQUENTIAL_CONTENT_NOT_READY',
  'missing published template cannot activate sequential mode'
);
select is(
  (select mode from public.course_progression_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'open',
  'failed template validation leaves mode open'
);
update public.quiz_templates set status = 'published' where chapter_id = '21000000-0000-0000-0000-000000000003';

update public.quiz_templates set question_count = 2 where chapter_id = '21000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.activate_course_sequential(
    '20000000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'SEQUENTIAL_CONTENT_NOT_READY',
  'insufficient published questions cannot activate sequential mode'
);
select is(
  (select mode from public.course_progression_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'open',
  'failed question validation leaves mode open'
);
update public.quiz_templates set question_count = 1 where chapter_id = '21000000-0000-0000-0000-000000000001';

update public.review_cards set status = 'draft' where id = '48500000-0000-0000-0000-000000000004';
select throws_ok(
  $$select public.activate_course_sequential(
    '20000000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'SEQUENTIAL_CONTENT_NOT_READY',
  'missing published review card cannot activate sequential mode'
);
select is(
  (select mode from public.course_progression_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'open',
  'failed review validation leaves mode open'
);
update public.review_cards set status = 'published' where id = '48500000-0000-0000-0000-000000000004';

update public.sections set status = 'draft' where id = '48100000-0000-0000-0000-000000000005';
select throws_ok(
  $$select public.activate_course_sequential(
    '20000000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'SEQUENTIAL_CONTENT_NOT_READY',
  'draft parent chain cannot activate sequential mode'
);
select is(
  (select mode from public.course_progression_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'open',
  'failed parent-chain validation leaves mode open'
);
update public.sections set status = 'published' where id = '48100000-0000-0000-0000-000000000005';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '48600000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'activation.backfill@colorplay.test',
  crypt('LocalOnly-ActivationBackfill1!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
);

create or replace function public.student_chapter_completion(
  p_user_id uuid,
  p_chapter_id uuid
)
returns table (
  review_completed integer,
  review_total integer,
  mastery numeric,
  progress_status text,
  is_complete boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    1,
    1,
    100::numeric,
    'completed'::text,
    p_user_id = '48600000-0000-0000-0000-000000000001'::uuid
      and p_chapter_id = '21000000-0000-0000-0000-000000000001'::uuid
$$;

select set_config(
  'test.activation_result',
  public.activate_course_sequential(
    '20000000-0000-0000-0000-000000000001'
  )::text,
  true
);
select is(
  current_setting('test.activation_result')::jsonb ->> 'mode',
  'sequential',
  'ready content activates sequential mode'
);
select is(
  current_setting('test.activation_result')::jsonb ->> 'backfilled_unlock_count',
  '1',
  'activation backfills a canonically completed prerequisite'
);
select set_config(
  'test.second_activation_result',
  public.activate_course_sequential(
    '20000000-0000-0000-0000-000000000001'
  )::text,
  true
);
select is(
  current_setting('test.second_activation_result')::jsonb ->> 'rules_version',
  '2026-08-sequence-1',
  'activation is idempotent with the stable rules version'
);
select is(
  current_setting('test.second_activation_result')::jsonb ->> 'backfilled_unlock_count',
  '0',
  'a second activation does not duplicate permanent unlocks'
);
select is(
  (select mode from public.course_progression_settings where course_id = '20000000-0000-0000-0000-000000000001'),
  'sequential',
  'successful activation persists sequential mode'
);
select is(
  public.reopen_course_progression('20000000-0000-0000-0000-000000000001') ->> 'mode',
  'open',
  'reopen returns the course to open mode'
);
select is(
  (select count(*)::integer from public.student_chapter_unlocks),
  1,
  'reopen preserves the backfilled unlock row'
);

select ok(
  not has_function_privilege('anon', 'public.activate_course_sequential(uuid)', 'EXECUTE'),
  'anon cannot activate sequential mode'
);
select ok(
  not has_function_privilege('authenticated', 'public.activate_course_sequential(uuid)', 'EXECUTE'),
  'authenticated cannot activate sequential mode'
);
select ok(
  not has_function_privilege('anon', 'public.reopen_course_progression(uuid)', 'EXECUTE'),
  'anon cannot reopen progression'
);
select ok(
  not has_function_privilege('authenticated', 'public.reopen_course_progression(uuid)', 'EXECUTE'),
  'authenticated cannot reopen progression'
);

select * from finish();
rollback;
