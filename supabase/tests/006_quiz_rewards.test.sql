begin;

select plan(35);

select has_column('public', 'quiz_answers', 'provisional_xp', 'answers store provisional XP');
select has_column('public', 'quiz_answers', 'provisional_tokens', 'answers store provisional Token');
select has_column('public', 'quiz_sessions', 'game_rules_version', 'sessions store game rules version');
select has_column('public', 'quiz_sessions', 'reward_rate_percent', 'sessions store applied reward rate');
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.quiz_sessions'::regclass
      and conname in (
        'quiz_sessions_xp_awarded_check',
        'quiz_sessions_tokens_awarded_check'
      )
  ),
  0,
  'zero-only reward constraints are removed'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'finalize_quiz_session'
      and pronargs = 1
  ),
  1,
  'finalize accepts only the session id'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'submit_quiz_answer'
      and pronargs = 3
  ),
  1,
  'submit accepts no client reward inputs'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000021',
    'authenticated', 'authenticated', 'reward.owner@colorplay.test',
    crypt('LocalOnly-Reward1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000022',
    'authenticated', 'authenticated', 'reward.other@colorplay.test',
    crypt('LocalOnly-Reward2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

create function pg_temp.make_reward_session(
  target_session_id uuid,
  target_client_id uuid,
  target_template_id uuid,
  target_started_at timestamptz,
  target_deadline_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  selected_question record;
  new_session_question_id uuid := gen_random_uuid();
begin
  select
    q.id,
    q.stable_code,
    q.version,
    q.prompt,
    q.explanation,
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', qo.id,
          'key', qo.option_key,
          'text', qo.option_text,
          'sort_order', qo.sort_order
        ) order by qo.sort_order
      )
      from public.question_options qo
      where qo.question_id = q.id
    ) as options,
    (
      select qo.id from public.question_options qo
      where qo.question_id = q.id and qo.is_correct
    ) as correct_option_id
  into selected_question
  from public.questions q
  where q.status = 'published'
  order by q.stable_code
  limit 1;

  insert into public.quiz_sessions (
    id, user_id, template_id, client_request_id, chapter_title,
    question_count, started_at
  ) values (
    target_session_id,
    '10000000-0000-0000-0000-000000000021',
    target_template_id,
    target_client_id,
    'Reward Test',
    1,
    clock_timestamp()
  );

  insert into public.quiz_session_questions (
    id, session_id, question_id, position, question_stable_code,
    question_version, prompt, explanation, frozen_options,
    correct_option_id, started_at, deadline_at
  ) values (
    new_session_question_id,
    target_session_id,
    selected_question.id,
    1,
    selected_question.stable_code,
    selected_question.version,
    selected_question.prompt,
    selected_question.explanation,
    selected_question.options,
    selected_question.correct_option_id,
    target_started_at,
    target_deadline_at
  );

  return new_session_question_id;
end;
$$;

create function pg_temp.reward_correct_option(target_question_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select correct_option_id
  from public.quiz_session_questions
  where id = target_question_id;
$$;

create function pg_temp.reward_wrong_option(target_question_id uuid)
returns uuid
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select (option_value ->> 'id')::uuid
  from public.quiz_session_questions sq,
    lateral jsonb_array_elements(sq.frozen_options) option_value
  where sq.id = target_question_id
    and (option_value ->> 'id')::uuid <> sq.correct_option_id
  limit 1;
$$;

create function pg_temp.insert_reward_answer(
  target_session_id uuid,
  target_xp integer,
  target_tokens integer
)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  insert into public.quiz_answers (
    session_id, session_question_id, user_id, selected_option_id,
    correct_option_id, answer_status, response_ms, score_delta,
    provisional_xp, provisional_tokens, idempotency_key
  )
  select
    sq.session_id, sq.id, s.user_id, sq.correct_option_id,
    sq.correct_option_id, 'correct', 1000, 150,
    target_xp, target_tokens, gen_random_uuid()
  from public.quiz_session_questions sq
  join public.quiz_sessions s on s.id = sq.session_id
  where sq.session_id = target_session_id;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000021',
  true
);

select set_config(
  'test.fast_question',
  pg_temp.make_reward_session(
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000003',
    clock_timestamp() - interval '1 second',
    clock_timestamp() + interval '19 seconds'
  )::text,
  true
);
select set_config(
  'test.fast_result',
  public.submit_quiz_answer(
    current_setting('test.fast_question')::uuid,
    '43000000-0000-0000-0000-000000000001',
    pg_temp.reward_correct_option(current_setting('test.fast_question')::uuid)
  )::text,
  true
);
select is(
  (current_setting('test.fast_result')::jsonb ->> 'provisional_xp')::integer,
  75,
  'fast correct answer stores 75 provisional XP'
);
select is(
  (current_setting('test.fast_result')::jsonb ->> 'provisional_tokens')::integer,
  25,
  'fast correct answer stores 25 provisional Token'
);

select set_config(
  'test.slow_question',
  pg_temp.make_reward_session(
    '41000000-0000-0000-0000-000000000002',
    '42000000-0000-0000-0000-000000000002',
    '26000000-0000-0000-0000-000000000003',
    clock_timestamp() - interval '6 seconds',
    clock_timestamp() + interval '14 seconds'
  )::text,
  true
);
select set_config(
  'test.slow_result',
  public.submit_quiz_answer(
    current_setting('test.slow_question')::uuid,
    '43000000-0000-0000-0000-000000000002',
    pg_temp.reward_correct_option(current_setting('test.slow_question')::uuid)
  )::text,
  true
);
select is(
  (current_setting('test.slow_result')::jsonb ->> 'provisional_xp')::integer,
  50,
  'slow correct answer stores 50 provisional XP'
);
select is(
  (current_setting('test.slow_result')::jsonb ->> 'provisional_tokens')::integer,
  15,
  'slow correct answer stores 15 provisional Token'
);

select set_config(
  'test.wrong_question',
  pg_temp.make_reward_session(
    '41000000-0000-0000-0000-000000000003',
    '42000000-0000-0000-0000-000000000003',
    '26000000-0000-0000-0000-000000000003',
    clock_timestamp() - interval '1 second',
    clock_timestamp() + interval '19 seconds'
  )::text,
  true
);
select set_config(
  'test.wrong_result',
  public.submit_quiz_answer(
    current_setting('test.wrong_question')::uuid,
    '43000000-0000-0000-0000-000000000003',
    pg_temp.reward_wrong_option(current_setting('test.wrong_question')::uuid)
  )::text,
  true
);
select is(
  (current_setting('test.wrong_result')::jsonb ->> 'provisional_xp')::integer,
  0,
  'incorrect answer stores zero provisional XP'
);
select is(
  (current_setting('test.wrong_result')::jsonb ->> 'provisional_tokens')::integer,
  0,
  'incorrect answer stores zero provisional Token'
);

select set_config(
  'test.timeout_question',
  pg_temp.make_reward_session(
    '41000000-0000-0000-0000-000000000004',
    '42000000-0000-0000-0000-000000000004',
    '26000000-0000-0000-0000-000000000003',
    clock_timestamp() - interval '30 seconds',
    clock_timestamp() - interval '10 seconds'
  )::text,
  true
);
select set_config(
  'test.timeout_result',
  public.submit_quiz_answer(
    current_setting('test.timeout_question')::uuid,
    '43000000-0000-0000-0000-000000000004'
  )::text,
  true
);
select is(
  current_setting('test.timeout_result')::jsonb ->> 'answer_status',
  'timeout',
  'late answer is authoritative timeout'
);
select is(
  (current_setting('test.timeout_result')::jsonb ->> 'provisional_xp')::integer,
  0,
  'timeout stores zero provisional XP'
);
select is(
  (current_setting('test.timeout_result')::jsonb ->> 'provisional_tokens')::integer,
  0,
  'timeout stores zero provisional Token'
);

select pg_temp.make_reward_session(
  '41000000-0000-0000-0000-000000000005',
  '42000000-0000-0000-0000-000000000005',
  '26000000-0000-0000-0000-000000000003',
  clock_timestamp() - interval '1 second',
  clock_timestamp() + interval '19 seconds'
);
select throws_ok(
  $$select public.finalize_quiz_session('41000000-0000-0000-0000-000000000005')$$,
  'P0001',
  'QUIZ_SESSION_INCOMPLETE',
  'session cannot finalize without every terminal answer'
);

reset role;
select pg_temp.make_reward_session(
  ('44000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  ('45000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  case when n = 3
    then '26000000-0000-0000-0000-000000000004'::uuid
    else '26000000-0000-0000-0000-000000000003'::uuid
  end,
  clock_timestamp() - interval '1 second',
  clock_timestamp() + interval '19 seconds'
)
from generate_series(1, 5) n;
select pg_temp.insert_reward_answer(
  ('44000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  75,
  25
)
from generate_series(1, 5) n;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000021',
  true
);
select set_config(
  'test.final_one',
  public.finalize_quiz_session('44000000-0000-0000-0000-000000000001')::text,
  true
);
select set_config(
  'test.final_two',
  public.finalize_quiz_session('44000000-0000-0000-0000-000000000002')::text,
  true
);
select set_config(
  'test.final_other_template',
  public.finalize_quiz_session('44000000-0000-0000-0000-000000000003')::text,
  true
);
select set_config(
  'test.final_three',
  public.finalize_quiz_session('44000000-0000-0000-0000-000000000004')::text,
  true
);
select set_config(
  'test.final_four',
  public.finalize_quiz_session('44000000-0000-0000-0000-000000000005')::text,
  true
);

select is((current_setting('test.final_one')::jsonb ->> 'xp_awarded')::integer, 75, 'first session awards full XP');
select is((current_setting('test.final_one')::jsonb ->> 'tokens_awarded')::integer, 25, 'first session awards full Token');
select is((current_setting('test.final_one')::jsonb ->> 'reward_rate_percent')::integer, 100, 'first session records full rate');
select is((current_setting('test.final_three')::jsonb ->> 'reward_rate_percent')::integer, 100, 'different template does not consume same-template quota');
select is((current_setting('test.final_four')::jsonb ->> 'xp_awarded')::integer, 15, 'fourth same-template session awards floor twenty-percent XP');
select is((current_setting('test.final_four')::jsonb ->> 'tokens_awarded')::integer, 0, 'fourth same-template session awards zero Token');
select is((current_setting('test.final_four')::jsonb ->> 'reward_rate_percent')::integer, 20, 'fourth same-template session records decay rate');
select is((select token_balance from public.wallets where user_id = auth.uid()), 100, 'wallet cache equals four full Token rewards');
select is((select coalesce(sum(amount), 0)::integer from public.xp_transactions where user_id = auth.uid()), 315, 'XP ledger totals full and decayed rewards');
select is((select count(*)::integer from public.xp_transactions where user_id = auth.uid()), 5, 'one XP source row exists per finalized reward');
select is((select count(*)::integer from public.wallet_transactions where user_id = auth.uid()), 4, 'zero Token reward creates no ledger row');
select is(
  public.finalize_quiz_session('44000000-0000-0000-0000-000000000005') ->> 'xp_awarded',
  current_setting('test.final_four')::jsonb ->> 'xp_awarded',
  'finalize retry returns stored reward'
);
select is((select count(*)::integer from public.xp_transactions where user_id = auth.uid()), 5, 'finalize retry does not duplicate XP ledger');
select is(
  (select game_rules_version from public.quiz_sessions where id = '44000000-0000-0000-0000-000000000005'),
  '2026-07-mvp-1',
  'session stores game rules version'
);
select is(
  (select reward_rate_percent from public.quiz_session_question_state where session_id = '44000000-0000-0000-0000-000000000005' limit 1),
  20,
  'safe refresh view exposes stored reward rate'
);
select is(
  public.get_my_economy_summary(),
  jsonb_build_object(
    'total_xp', 315,
    'level', 1,
    'current_level_xp', 315,
    'xp_per_level', 500,
    'token_balance', 100,
    'wallet_reconciled', true
  ),
  'economy summary reconciles finalized rewards'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000022',
  true
);
select throws_ok(
  $$select public.finalize_quiz_session('44000000-0000-0000-0000-000000000005')$$,
  'P0001',
  'QUIZ_SESSION_NOT_FOUND',
  'another user cannot finalize owner session'
);

reset role;
select ok(
  (
    select p.proconfig @> array['search_path=pg_catalog, public']
    from pg_proc p
    where p.oid = 'public.finalize_quiz_session(uuid)'::regprocedure
  ),
  'finalize keeps fixed search path'
);

select * from finish();
rollback;
