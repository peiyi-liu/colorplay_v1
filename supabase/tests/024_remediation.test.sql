begin;

select plan(21);

select has_table('public', 'remediation_attempts', 'remediation attempts exists');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.remediation_attempts'::regclass
      and conname = 'remediation_attempts_item_session_unique'
  ),
  'one attempt row exists per mistake item and session'
);
select is(
  (
    select count(*)::integer
    from pg_class relation
    where relation.oid = 'public.remediation_attempts'::regclass
      and relation.relrowsecurity
  ),
  1,
  'remediation attempts enable RLS'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.remediation_attempts',
    'INSERT,UPDATE,DELETE'
  ),
  'attempt rows are only written by trusted finalize'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.start_remediation_session(uuid, uuid)',
    'EXECUTE'
  ),
  'students may start remediation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.start_remediation_session(uuid, uuid)',
    'EXECUTE'
  ),
  'anonymous cannot start remediation'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '24000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'remediation.student.a@colorplay.test',
    crypt('LocalOnly-Remediation1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '24000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'remediation.student.b@colorplay.test',
    crypt('LocalOnly-Remediation2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

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

create function pg_temp.correct_option_for(target_question_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select correct_option_id
  from public.quiz_session_questions
  where id = target_question_id;
$$;

create function pg_temp.session_question_at(target_session uuid, target_position integer)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select id
  from public.quiz_session_questions
  where session_id = target_session and position = target_position;
$$;

-- The 3-1 subtopic id is the importer's deterministic UUID.
select set_config(
  'test.subtopic',
  'f929cde5-c294-46ce-5faf-c866b3cb9583',
  true
);

set local role authenticated;
select pg_temp.as_user('24000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.start_remediation_session(
    current_setting('test.subtopic')::uuid, null
  )$$,
  'P0001',
  'REMEDIATION_INVALID_REQUEST',
  'a null request id is rejected'
);
select throws_ok(
  $$select public.start_remediation_session(
    current_setting('test.subtopic')::uuid,
    '24100000-0000-0000-0000-000000000099'
  )$$,
  'P0001',
  'REMEDIATION_NOTHING_OPEN',
  'a student without open mistakes cannot start remediation'
);

reset role;
select set_config(
  'test.s1',
  pg_temp.build_session(
    '24000000-0000-0000-0000-000000000001', '3-1-01', 'incorrect', 'practice',
    '24100000-0000-0000-0000-000000000001'
  )::text,
  true
);
select set_config(
  'test.s2',
  pg_temp.build_session(
    '24000000-0000-0000-0000-000000000001', '3-1-02', 'incorrect', 'practice',
    '24100000-0000-0000-0000-000000000002'
  )::text,
  true
);

set local role authenticated;
select pg_temp.as_user('24000000-0000-0000-0000-000000000001');
select public.finalize_quiz_session(current_setting('test.s1')::uuid);
select public.finalize_quiz_session(current_setting('test.s2')::uuid);

select set_config(
  'test.remediation',
  public.start_remediation_session(
    current_setting('test.subtopic')::uuid,
    '24100000-0000-0000-0000-000000000003'
  )::text,
  true
);
select is(
  (current_setting('test.remediation')::jsonb ->> 'question_count')::integer,
  2,
  'remediation freezes one question per open mistake'
);
select is(
  public.start_remediation_session(
    current_setting('test.subtopic')::uuid,
    '24100000-0000-0000-0000-000000000003'
  ) ->> 'session_id',
  current_setting('test.remediation')::jsonb ->> 'session_id',
  'replaying the request returns the same session'
);
select set_config(
  'test.rsession',
  current_setting('test.remediation')::jsonb ->> 'session_id',
  true
);

reset role;
select is(
  (
    select game_rules_version
    from public.quiz_sessions
    where id = current_setting('test.rsession')::uuid
  ),
  '2026-07-progress-1',
  'remediation sessions stamp the progress rules version'
);
select set_config(
  'test.wallet_before',
  (
    select token_balance::text
    from public.wallets
    where user_id = '24000000-0000-0000-0000-000000000001'
  ),
  true
);
select set_config(
  'test.origin_answer',
  (
    select answer.id::text || ':' || answer.score_delta::text
      || ':' || answer.answered_at::text
    from public.quiz_answers answer
    where answer.session_id = current_setting('test.s1')::uuid
  ),
  true
);

set local role authenticated;
select pg_temp.as_user('24000000-0000-0000-0000-000000000001');
select public.submit_quiz_answer(
  pg_temp.session_question_at(current_setting('test.rsession')::uuid, 1),
  '24200000-0000-0000-0000-000000000001',
  pg_temp.correct_option_for(
    pg_temp.session_question_at(current_setting('test.rsession')::uuid, 1)
  )
);
select public.activate_next_quiz_question(current_setting('test.rsession')::uuid);
select public.submit_quiz_answer(
  pg_temp.session_question_at(current_setting('test.rsession')::uuid, 2),
  '24200000-0000-0000-0000-000000000002',
  pg_temp.correct_option_for(
    pg_temp.session_question_at(current_setting('test.rsession')::uuid, 2)
  )
);
select set_config(
  'test.final',
  public.finalize_quiz_session(current_setting('test.rsession')::uuid)::text,
  true
);
select is(
  (current_setting('test.final')::jsonb ->> 'xp_awarded')::integer,
  30,
  'two fast correct remediation answers award 20 percent XP'
);
select is(
  (current_setting('test.final')::jsonb ->> 'tokens_awarded')::integer,
  0,
  'remediation never awards tokens'
);

reset role;
select is(
  (
    select count(*)::integer
    from public.xp_transactions
    where user_id = '24000000-0000-0000-0000-000000000001'
      and source_type = 'quiz_finalize'
      and source_id = current_setting('test.rsession')::uuid
      and amount = 30
  ),
  1,
  'one remediation XP ledger row exists for the session'
);
select is(
  (
    select token_balance::text
    from public.wallets
    where user_id = '24000000-0000-0000-0000-000000000001'
  ),
  current_setting('test.wallet_before'),
  'the token balance is untouched by remediation'
);
select is(
  (
    select count(*)::integer
    from public.mistake_items
    where user_id = '24000000-0000-0000-0000-000000000001'
      and status = 'resolved'
  ),
  2,
  'correct remediation answers resolve the linked mistakes'
);
select is(
  (
    select count(*)::integer
    from public.remediation_attempts
    where session_id = current_setting('test.rsession')::uuid
      and result = 'resolved'
  ),
  2,
  'each resolution is recorded as an attempt row'
);
select is(
  (
    select answer.id::text || ':' || answer.score_delta::text
      || ':' || answer.answered_at::text
    from public.quiz_answers answer
    where answer.session_id = current_setting('test.s1')::uuid
  ),
  current_setting('test.origin_answer'),
  'the original answer and score stay bit-identical'
);

set local role authenticated;
select pg_temp.as_user('24000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.start_remediation_session(
    current_setting('test.subtopic')::uuid,
    '24100000-0000-0000-0000-000000000004'
  )$$,
  'P0001',
  'REMEDIATION_NOTHING_OPEN',
  'resolved mistakes leave nothing to remediate'
);

reset role;
select set_config(
  'test.s4',
  pg_temp.build_session(
    '24000000-0000-0000-0000-000000000001', '3-1-05', 'correct', 'practice',
    '24100000-0000-0000-0000-000000000005'
  )::text,
  true
);
set local role authenticated;
select pg_temp.as_user('24000000-0000-0000-0000-000000000001');
select is(
  (
    public.finalize_quiz_session(current_setting('test.s4')::uuid)
      ->> 'reward_rate_percent'
  )::integer,
  100,
  'remediation sessions never consume the daily full-reward quota'
);

select pg_temp.as_user('24000000-0000-0000-0000-000000000002');
select is(
  (
    select count(*)::integer
    from public.remediation_attempts
  ),
  0,
  'a student reads no other student''s remediation attempts'
);

reset role;
select * from finish();
rollback;
