begin;

select plan(22);

select ok(
  has_function_privilege(
    'authenticated',
    'public.upsert_question_draft(jsonb, uuid)',
    'EXECUTE'
  ),
  'teachers may call the draft upsert'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.publish_question(uuid, jsonb, uuid)',
    'EXECUTE'
  ),
  'anonymous cannot publish'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '27000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'content.teacher.a@colorplay.test',
    crypt('LocalOnly-Content1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '27000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'content.student.a@colorplay.test',
    crypt('LocalOnly-Content2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

update public.profiles
set role = 'teacher'
where id = '27000000-0000-0000-0000-000000000001';

create function pg_temp.as_user(target_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select set_config('request.jwt.claim.sub', target_user::text, true);
$$;

create function pg_temp.draft_payload(code text, prompt text)
returns jsonb
language sql
set search_path = pg_catalog, public, pg_temp
as $$
  select jsonb_build_object(
    'stable_code', code,
    'subtopic_id', 'f929cde5-c294-46ce-5faf-c866b3cb9583',
    'prompt', prompt,
    'explanation', '測試解析內容。',
    'options', jsonb_build_array(
      jsonb_build_object('key', 'A', 'text', '甲', 'is_correct', true),
      jsonb_build_object('key', 'B', 'text', '乙', 'is_correct', false)
    )
  );
$$;

set local role authenticated;
select pg_temp.as_user('27000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.upsert_question_draft(
    pg_temp.draft_payload('7-1-01', '學生不能建題目'),
    '27100000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'CONTENT_TEACHER_ONLY',
  'students cannot create drafts'
);

select pg_temp.as_user('27000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.upsert_question_draft(
    pg_temp.draft_payload('7-1-01', '含 <script>alert(1)</script> 的題目'),
    '27100000-0000-0000-0000-000000000002'
  )$$,
  'P0001',
  'CONTENT_UNSAFE_TEXT',
  'script payloads are rejected server-side'
);
select lives_ok(
  $$select public.upsert_question_draft(
    pg_temp.draft_payload('7-1-01', '草稿題目：色彩測試'),
    '27100000-0000-0000-0000-000000000003'
  )$$,
  'a teacher creates a draft question'
);
select lives_ok(
  $$select public.upsert_question_draft(
    pg_temp.draft_payload('7-1-01', '草稿題目：色彩測試（改）'),
    '27100000-0000-0000-0000-000000000004'
  )$$,
  'a draft can be edited in place'
);

reset role;
select set_config(
  'test.draft_q',
  (select id::text from public.questions where stable_code = '7-1-01'),
  true
);
select is(
  (
    select question.status::text || ':' || question.version::text
      || ':' || question.prompt
    from public.questions question
    where question.stable_code = '7-1-01'
  ),
  'draft:1:草稿題目：色彩測試（改）',
  'draft edits update in place without version bumps'
);

set local role authenticated;
select pg_temp.as_user('27000000-0000-0000-0000-000000000002');
select is(
  (
    select count(*)::integer
    from public.questions
    where stable_code = '7-1-01'
  ),
  0,
  'students cannot see drafts'
);

select pg_temp.as_user('27000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.publish_question(
    current_setting('test.draft_q')::uuid,
    null,
    '27100000-0000-0000-0000-000000000005'
  )$$,
  'a teacher publishes the draft'
);

select pg_temp.as_user('27000000-0000-0000-0000-000000000002');
select is(
  (
    select count(*)::integer
    from public.questions
    where stable_code = '7-1-01'
  ),
  1,
  'students see the question after publish'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.content_versions
    where content_id = current_setting('test.draft_q')::uuid
      and version = 1
      and status = 'published'
  ),
  1,
  'first publish snapshots version one'
);
select is(
  (
    select count(*)::integer
    from public.content_publication_events
    where content_id = current_setting('test.draft_q')::uuid
      and event_type = 'publish'
  ),
  1,
  'publish appends one event'
);

-- Freeze a student session against version 1, then flip the correct answer.
create function pg_temp.build_session(
  target_user uuid,
  question_code text,
  request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  question_record public.questions;
  correct_option uuid;
  new_session uuid;
  new_question uuid;
begin
  select * into question_record
  from public.questions
  where stable_code = question_code;
  select id into correct_option
  from public.question_options
  where question_id = question_record.id and is_correct;

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count
  ) values (
    target_user, '26000000-0000-0000-0000-000000000003', request_id,
    '色彩體系與應用', 1
  )
  returning id into new_session;

  insert into public.quiz_session_questions (
    session_id, question_id, position, question_stable_code, question_version,
    prompt, explanation, frozen_options, correct_option_id, started_at,
    deadline_at
  ) values (
    new_session, question_record.id, 1, question_record.stable_code,
    question_record.version, question_record.prompt,
    question_record.explanation,
    (
      select jsonb_agg(
        jsonb_build_object('id', o.id, 'key', o.option_key, 'text', o.option_text)
        order by o.sort_order
      )
      from public.question_options o
      where o.question_id = question_record.id
    ),
    correct_option, clock_timestamp(), clock_timestamp() + interval '30 seconds'
  )
  returning id into new_question;

  insert into public.quiz_answers (
    session_id, session_question_id, user_id, selected_option_id,
    correct_option_id, answer_status, response_ms, score_delta, idempotency_key
  ) values (
    new_session, new_question, target_user, correct_option, correct_option,
    'correct', 2000, 150, gen_random_uuid()
  );

  return new_session;
end;
$$;

select set_config(
  'test.session',
  pg_temp.build_session(
    '27000000-0000-0000-0000-000000000002', '7-1-01',
    '27100000-0000-0000-0000-000000000006'
  )::text,
  true
);

set local role authenticated;
select pg_temp.as_user('27000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.publish_question(
    current_setting('test.draft_q')::uuid,
    jsonb_build_object(
      'stable_code', '7-1-01',
      'subtopic_id', 'f929cde5-c294-46ce-5faf-c866b3cb9583',
      'prompt', '草稿題目：色彩測試（改）',
      'explanation', '測試解析內容。',
      'options', jsonb_build_array(
        jsonb_build_object('key', 'A', 'text', '甲', 'is_correct', false),
        jsonb_build_object('key', 'B', 'text', '乙', 'is_correct', true)
      )
    ),
    '27100000-0000-0000-0000-000000000007'
  )$$,
  'editing the correct answer of a published question succeeds'
);

reset role;
select is(
  (
    select version from public.questions
    where id = current_setting('test.draft_q')::uuid
  ),
  2,
  'a semantic edit bumps the version'
);
select is(
  (
    select count(*)::integer
    from public.content_versions
    where content_id = current_setting('test.draft_q')::uuid
  ),
  2,
  'the new version is snapshotted alongside the old'
);
select is(
  (
    select question.question_version
    from public.quiz_session_questions question
    where question.session_id = current_setting('test.session')::uuid
  ),
  1,
  'the in-flight session keeps its frozen version'
);

set local role authenticated;
select pg_temp.as_user('27000000-0000-0000-0000-000000000002');
select lives_ok(
  $$select public.finalize_quiz_session(current_setting('test.session')::uuid)$$,
  'the frozen session still finalizes after the bump'
);

select pg_temp.as_user('27000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.upsert_review_card_draft(
    jsonb_build_object(
      'stable_code', 'card-7-1-demo',
      'subtopic_id', 'f929cde5-c294-46ce-5faf-c866b3cb9583',
      'group_label', '測試分組',
      'title', '教師新增的卡片',
      'content', '這張卡片由教師後台建立。',
      'requires_recompletion', false
    ),
    '27100000-0000-0000-0000-000000000008'
  )$$,
  'a teacher creates a review card draft'
);

reset role;
select set_config(
  'test.card',
  (
    select id::text from public.review_cards
    where stable_code = 'card-7-1-demo'
  ),
  true
);

set local role authenticated;
select pg_temp.as_user('27000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.publish_review_card(
    current_setting('test.card')::uuid,
    null,
    '27100000-0000-0000-0000-000000000009'
  )$$,
  'a teacher publishes the review card'
);
select lives_ok(
  $$select public.archive_question(
    current_setting('test.draft_q')::uuid,
    '27100000-0000-0000-0000-000000000010'
  )$$,
  'a teacher archives the question'
);

select pg_temp.as_user('27000000-0000-0000-0000-000000000002');
select is(
  (
    select count(*)::integer
    from public.questions
    where stable_code = '7-1-01'
  ),
  0,
  'archived questions disappear for students'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.content_publication_events
    where content_id = current_setting('test.draft_q')::uuid
      and event_type = 'archive'
  ),
  1,
  'archive appends its event without touching history'
);

select * from finish();
rollback;
