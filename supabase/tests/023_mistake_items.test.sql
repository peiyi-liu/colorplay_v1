begin;

select plan(16);

select has_table('public', 'mistake_items', 'mistake items exists');
select is(
  enum_range(null::public.mistake_status)::text,
  '{open,resolved,reopened}',
  'mistake statuses match the contract'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.mistake_items'::regclass
      and conname = 'mistake_items_user_question_unique'
  ),
  'one current mistake identity exists per user and question'
);
select is(
  (
    select count(*)::integer
    from pg_class relation
    where relation.oid = 'public.mistake_items'::regclass
      and relation.relrowsecurity
  ),
  1,
  'mistake items enable RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.mistake_items',
    'INSERT,UPDATE,DELETE'
  ),
  'mistake items are only written by trusted finalize'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '23000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'mistake.student.a@colorplay.test',
    crypt('LocalOnly-Mistake1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '23000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'mistake.student.b@colorplay.test',
    crypt('LocalOnly-Mistake2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

-- Builds a deterministic single-question session in the given purpose with a
-- chosen answer kind, mirroring engine-frozen state.
create function pg_temp.build_session(
  target_user uuid,
  question_code text,
  answer_kind text,
  session_purpose public.quiz_session_purpose,
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
  wrong_option uuid;
  new_session uuid;
  new_question uuid;
  selected uuid;
  status public.quiz_answer_status := answer_kind::public.quiz_answer_status;
begin
  select * into question_record
  from public.questions
  where stable_code = question_code;

  select id into correct_option
  from public.question_options
  where question_id = question_record.id and is_correct;
  select id into wrong_option
  from public.question_options
  where question_id = question_record.id and not is_correct
  order by sort_order
  limit 1;

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count,
    purpose
  ) values (
    target_user, '26000000-0000-0000-0000-000000000003', request_id,
    '色彩體系與應用', 1, session_purpose
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

  selected := case status
    when 'correct' then correct_option
    when 'incorrect' then wrong_option
    else null
  end;
  insert into public.quiz_answers (
    session_id, session_question_id, user_id, selected_option_id,
    correct_option_id, answer_status, response_ms, score_delta, idempotency_key
  ) values (
    new_session, new_question, target_user, selected, correct_option, status,
    2000, case when status = 'correct' then 150 else 0 end, gen_random_uuid()
  );

  return new_session;
end;
$$;

create function pg_temp.as_user(target_user uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select set_config('request.jwt.claim.sub', target_user::text, true);
$$;

select set_config(
  'test.s1',
  pg_temp.build_session(
    '23000000-0000-0000-0000-000000000001', '3-1-01', 'incorrect', 'practice',
    '23100000-0000-0000-0000-000000000001'
  )::text,
  true
);

set local role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-000000000001');
select public.finalize_quiz_session(current_setting('test.s1')::uuid);

reset role;
select is(
  (
    select count(*)::integer
    from public.mistake_items item
    join public.questions q on q.id = item.question_id
    where item.user_id = '23000000-0000-0000-0000-000000000001'
      and q.stable_code = '3-1-01'
      and item.status = 'open'
      and item.origin_answer_id is not null
  ),
  1,
  'a wrong practice answer opens one mistake item'
);
select set_config(
  'test.origin',
  (
    select origin_answer_id::text
    from public.mistake_items item
    join public.questions q on q.id = item.question_id
    where item.user_id = '23000000-0000-0000-0000-000000000001'
      and q.stable_code = '3-1-01'
  ),
  true
);

set local role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-000000000001');
select public.finalize_quiz_session(current_setting('test.s1')::uuid);

reset role;
select is(
  (
    select count(*)::integer
    from public.mistake_items
    where user_id = '23000000-0000-0000-0000-000000000001'
  ),
  1,
  'finalize replay creates no duplicate mistakes'
);

select set_config(
  'test.s2',
  pg_temp.build_session(
    '23000000-0000-0000-0000-000000000001', '3-1-01', 'incorrect', 'practice',
    '23100000-0000-0000-0000-000000000002'
  )::text,
  true
);
set local role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-000000000001');
select public.finalize_quiz_session(current_setting('test.s2')::uuid);

reset role;
select is(
  (
    select item.status::text
    from public.mistake_items item
    join public.questions q on q.id = item.question_id
    where item.user_id = '23000000-0000-0000-0000-000000000001'
      and q.stable_code = '3-1-01'
  ),
  'open',
  'a repeated wrong answer keeps the item open'
);
select is(
  (
    select origin_answer_id::text
    from public.mistake_items item
    join public.questions q on q.id = item.question_id
    where item.user_id = '23000000-0000-0000-0000-000000000001'
      and q.stable_code = '3-1-01'
  ),
  current_setting('test.origin'),
  'the origin answer is never overwritten'
);

update public.mistake_items
set status = 'resolved'
where user_id = '23000000-0000-0000-0000-000000000001';

select set_config(
  'test.s3',
  pg_temp.build_session(
    '23000000-0000-0000-0000-000000000001', '3-1-01', 'incorrect', 'practice',
    '23100000-0000-0000-0000-000000000003'
  )::text,
  true
);
set local role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-000000000001');
select public.finalize_quiz_session(current_setting('test.s3')::uuid);

reset role;
select is(
  (
    select item.status::text
    from public.mistake_items item
    join public.questions q on q.id = item.question_id
    where item.user_id = '23000000-0000-0000-0000-000000000001'
      and q.stable_code = '3-1-01'
  ),
  'reopened',
  'a current-version wrong answer reopens a resolved item'
);

select set_config(
  'test.s4',
  pg_temp.build_session(
    '23000000-0000-0000-0000-000000000001', '3-1-02', 'correct', 'practice',
    '23100000-0000-0000-0000-000000000004'
  )::text,
  true
);
set local role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-000000000001');
select public.finalize_quiz_session(current_setting('test.s4')::uuid);

reset role;
select is(
  (
    select count(*)::integer
    from public.mistake_items item
    join public.questions q on q.id = item.question_id
    where item.user_id = '23000000-0000-0000-0000-000000000001'
      and q.stable_code = '3-1-02'
  ),
  0,
  'correct answers never create mistakes'
);

select set_config(
  'test.s5',
  pg_temp.build_session(
    '23000000-0000-0000-0000-000000000001', '3-1-02', 'timeout', 'practice',
    '23100000-0000-0000-0000-000000000005'
  )::text,
  true
);
set local role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-000000000001');
select public.finalize_quiz_session(current_setting('test.s5')::uuid);

reset role;
select is(
  (
    select count(*)::integer
    from public.mistake_items item
    join public.questions q on q.id = item.question_id
    where item.user_id = '23000000-0000-0000-0000-000000000001'
      and q.stable_code = '3-1-02'
      and item.status = 'open'
  ),
  1,
  'a timeout counts as a mistake'
);

select set_config(
  'test.s6',
  pg_temp.build_session(
    '23000000-0000-0000-0000-000000000001', '3-1-03', 'incorrect',
    'remediation', '23100000-0000-0000-0000-000000000006'
  )::text,
  true
);
set local role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-000000000001');
select public.finalize_quiz_session(current_setting('test.s6')::uuid);

reset role;
select is(
  (
    select count(*)::integer
    from public.mistake_items item
    join public.questions q on q.id = item.question_id
    where item.user_id = '23000000-0000-0000-0000-000000000001'
      and q.stable_code = '3-1-03'
  ),
  0,
  'remediation-internal wrongs never create mistakes'
);

select set_config(
  'test.s7',
  pg_temp.build_session(
    '23000000-0000-0000-0000-000000000002', '3-1-04', 'incorrect',
    'assignment', '23100000-0000-0000-0000-000000000007'
  )::text,
  true
);
set local role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-000000000002');
select public.finalize_quiz_session(current_setting('test.s7')::uuid);

reset role;
select is(
  (
    select count(*)::integer
    from public.mistake_items item
    join public.questions q on q.id = item.question_id
    where item.user_id = '23000000-0000-0000-0000-000000000002'
      and q.stable_code = '3-1-04'
      and item.status = 'open'
  ),
  1,
  'assignment wrongs create mistakes too'
);

set local role authenticated;
select pg_temp.as_user('23000000-0000-0000-0000-000000000001');
select is(
  (
    select count(*)::integer
    from public.mistake_items
    where user_id <> '23000000-0000-0000-0000-000000000001'
  ),
  0,
  'a student reads no other student''s mistakes'
);
select is(
  (
    select count(*)::integer
    from public.mistake_items
  ),
  2,
  'a student reads the own mistake list'
);

reset role;
select * from finish();
rollback;
