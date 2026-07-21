begin;

select plan(6);

-- 種子：兩位學生；A 產生一筆錯題，B 無錯題。
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '39000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'review.student.a@colorplay.test',
    crypt('LocalOnly-Review1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '39000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'review.student.b@colorplay.test',
    crypt('LocalOnly-Review2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

create temporary table review_fixture on commit drop as
select
  question.id as question_id,
  question.version as question_version,
  question.prompt as prompt,
  (
    select correct_option.option_text
    from public.question_options as correct_option
    where correct_option.question_id = question.id and correct_option.is_correct
  ) as correct_text,
  (
    select wrong_option.id
    from public.question_options as wrong_option
    where wrong_option.question_id = question.id
      and not wrong_option.is_correct
    order by wrong_option.sort_order
    limit 1
  ) as wrong_option_id,
  (
    select correct_option.id
    from public.question_options as correct_option
    where correct_option.question_id = question.id and correct_option.is_correct
  ) as correct_option_id
from public.questions as question
order by question.stable_code
limit 1;

do $$
declare
  fixture review_fixture;
  new_session uuid;
  new_question uuid;
  new_answer uuid;
begin
  select * into fixture from review_fixture;

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count
  ) values (
    '39000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000003',
    gen_random_uuid(), '色彩體系與應用', 1
  )
  returning id into new_session;

  insert into public.quiz_session_questions (
    session_id, question_id, position, question_stable_code, question_version,
    prompt, explanation, frozen_options, correct_option_id, started_at,
    deadline_at
  )
  select
    new_session, fixture.question_id, 1, question.stable_code,
    question.version, question.prompt, question.explanation,
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', frozen.id, 'key', frozen.option_key, 'text', frozen.option_text
        )
        order by frozen.sort_order
      )
      from public.question_options as frozen
      where frozen.question_id = fixture.question_id
    ),
    fixture.correct_option_id, clock_timestamp(),
    clock_timestamp() + interval '30 seconds'
  from public.questions as question
  where question.id = fixture.question_id
  returning id into new_question;

  insert into public.quiz_answers (
    session_id, session_question_id, user_id, selected_option_id,
    correct_option_id, answer_status, response_ms, score_delta, idempotency_key
  ) values (
    new_session, new_question, '39000000-0000-0000-0000-000000000001',
    fixture.wrong_option_id, fixture.correct_option_id, 'incorrect', 2000, 0,
    gen_random_uuid()
  )
  returning id into new_answer;

  insert into public.mistake_items (
    user_id, question_id, question_version, origin_answer_id, status
  ) values (
    '39000000-0000-0000-0000-000000000001', fixture.question_id,
    fixture.question_version, new_answer, 'open'
  );
end;
$$;

select isnt(
  to_regprocedure('public.list_my_mistakes()'),
  null,
  'list_my_mistakes RPC 存在'
);

select set_config(
  'request.jwt.claim.sub', '39000000-0000-0000-0000-000000000001', true
);

select is(
  jsonb_array_length(public.list_my_mistakes()),
  1,
  '學生 A 看見自己的一筆錯題'
);

select is(
  public.list_my_mistakes() -> 0 ->> 'correct_option_text',
  (select correct_text from review_fixture),
  '錯題含正確答案文字'
);

select is(
  public.list_my_mistakes() -> 0 ->> 'prompt',
  (select prompt from review_fixture),
  '錯題含題目文字'
);

select set_config(
  'request.jwt.claim.sub', '39000000-0000-0000-0000-000000000002', true
);

select is(
  public.list_my_mistakes(),
  '[]'::jsonb,
  '學生 B 看不到他人的錯題'
);

set local role anon;
select throws_ok(
  $$select public.list_my_mistakes()$$,
  '42501',
  null,
  'anon 不得執行 list_my_mistakes'
);

select * from finish();

rollback;
