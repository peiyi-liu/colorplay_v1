begin;

select plan(40);

select has_table('public', 'quiz_sessions', 'quiz sessions exists');
select has_table(
  'public',
  'quiz_session_questions',
  'quiz session questions exists'
);
select has_table('public', 'quiz_answers', 'quiz answers exists');
select has_function(
  'public',
  'create_quiz_session',
  array['uuid', 'uuid'],
  'create quiz session RPC exists'
);
select has_function(
  'public',
  'submit_quiz_answer',
  array['uuid', 'uuid', 'uuid'],
  'submit quiz answer RPC exists'
);
select has_function(
  'public',
  'activate_next_quiz_question',
  array['uuid'],
  'activate next quiz question RPC exists'
);
select has_function(
  'public',
  'finalize_quiz_session',
  array['uuid'],
  'finalize quiz session RPC exists'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_quiz_session(uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute create quiz session'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.submit_quiz_answer(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute submit quiz answer'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.activate_next_quiz_question(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot activate quiz questions'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.finalize_quiz_session(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute finalize quiz session'
);
select ok(
  (
    select p.proconfig @> array['search_path=pg_catalog, public']
    from pg_proc p
    where p.oid = 'public.create_quiz_session(uuid,uuid)'::regprocedure
  ),
  'create quiz session has a fixed search path'
);
select ok(
  (
    select p.proconfig @> array['search_path=pg_catalog, public']
    from pg_proc p
    where p.oid = 'public.submit_quiz_answer(uuid,uuid,uuid)'::regprocedure
  ),
  'submit quiz answer has a fixed search path'
);
select ok(
  (
    select p.proconfig @> array['search_path=pg_catalog, public']
    from pg_proc p
    where p.oid = 'public.activate_next_quiz_question(uuid)'::regprocedure
  ),
  'activate next quiz question has a fixed search path'
);
select ok(
  (
    select p.proconfig @> array['search_path=pg_catalog, public']
    from pg_proc p
    where p.oid = 'public.finalize_quiz_session(uuid)'::regprocedure
  ),
  'finalize quiz session has a fixed search path'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.quiz_sessions'::regclass),
  true,
  'quiz sessions have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.quiz_answers'::regclass),
  true,
  'quiz answers have RLS enabled'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'quiz.owner@colorplay.test',
    crypt('LocalOnly-Quiz1!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000005',
    'authenticated',
    'authenticated',
    'quiz.other@colorplay.test',
    crypt('LocalOnly-Quiz2!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000004',
  true
);

select throws_ok(
  $$
    insert into public.quiz_sessions (
      user_id, template_id, client_request_id, question_count
    ) values (
      '10000000-0000-0000-0000-000000000004',
      '26000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000001',
      10
    )
  $$,
  '42501',
  null,
  'student cannot insert quiz sessions directly'
);
select throws_ok(
  $$select * from public.quiz_session_questions limit 1$$,
  '42501',
  null,
  'student cannot query private frozen question rows directly'
);

select set_config(
  'test.quiz_payload',
  public.create_quiz_session(
    '26000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000002'
  )::text,
  true
);
select set_config(
  'test.quiz_session_id',
  current_setting('test.quiz_payload')::jsonb ->> 'session_id',
  true
);

select is(
  public.create_quiz_session(
    '26000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000002'
  ) ->> 'session_id',
  current_setting('test.quiz_session_id'),
  'create retry returns the same session'
);
select is(
  jsonb_array_length(
    current_setting('test.quiz_payload')::jsonb -> 'questions'
  ),
  10,
  'session fixes ten questions in one order'
);
select ok(
  current_setting('test.quiz_payload') !~ 'is_correct',
  'session payload contains no correctness field'
);

select set_config(
  'test.first_question_id',
  current_setting('test.quiz_payload')::jsonb #>> '{questions,0,session_question_id}',
  true
);
select set_config(
  'test.future_question_id',
  current_setting('test.quiz_payload')::jsonb #>> '{questions,2,session_question_id}',
  true
);
select set_config(
  'test.second_question_id',
  current_setting('test.quiz_payload')::jsonb #>> '{questions,1,session_question_id}',
  true
);

select throws_ok(
  format(
    $$select public.submit_quiz_answer(session_question_id => %L, idempotency_key => %L)$$,
    current_setting('test.future_question_id'),
    '30000000-0000-0000-0000-000000000003'
  ),
  'P0001',
  'QUIZ_QUESTION_NOT_ACTIVE',
  'future questions cannot be submitted before activation'
);
select throws_ok(
  format(
    $$select public.finalize_quiz_session(%L)$$,
    current_setting('test.quiz_session_id')
  ),
  'P0001',
  'QUIZ_SESSION_INCOMPLETE',
  'session cannot finalize before every question is terminal'
);

reset role;
select set_config(
  'test.correct_option_id',
  (
    select sq.correct_option_id::text
    from public.quiz_session_questions sq
    where sq.id = current_setting('test.first_question_id')::uuid
  ),
  true
);
set local role authenticated;

select set_config(
  'test.first_answer',
  public.submit_quiz_answer(
    session_question_id => current_setting('test.first_question_id')::uuid,
    idempotency_key => '30000000-0000-0000-0000-000000000004',
    selected_option_id => current_setting('test.correct_option_id')::uuid
  )::text,
  true
);
select is(
  current_setting('test.first_answer')::jsonb ->> 'answer_status',
  'correct',
  'correct selection is scored by the server'
);
select is(
  (current_setting('test.first_answer')::jsonb ->> 'score_delta')::integer,
  150,
  'answer within five seconds receives base and speed score'
);
select is(
  public.submit_quiz_answer(
    session_question_id => current_setting('test.first_question_id')::uuid,
    idempotency_key => '30000000-0000-0000-0000-000000000004',
    selected_option_id => current_setting('test.correct_option_id')::uuid
  )::text,
  current_setting('test.first_answer'),
  'same answer idempotency key returns the original result'
);
select throws_ok(
  format(
    $$select public.submit_quiz_answer(session_question_id => %L, selected_option_id => %L, idempotency_key => %L)$$,
    current_setting('test.first_question_id'),
    current_setting('test.correct_option_id'),
    '30000000-0000-0000-0000-000000000005'
  ),
  'P0001',
  'QUIZ_QUESTION_ALREADY_ANSWERED',
  'same question cannot reach a second terminal answer'
);
select is(
  (
    select started_at::text
    from public.quiz_session_question_state
    where session_question_id = current_setting('test.second_question_id')::uuid
  ),
  null,
  'next question remains inactive while feedback is open'
);
select set_config(
  'test.second_started_at',
  public.activate_next_quiz_question(
    current_setting('test.quiz_session_id')::uuid
  ) #>> '{questions,1,started_at}',
  true
);
select isnt(
  current_setting('test.second_started_at'),
  '',
  'acknowledging feedback starts the next question'
);
select is(
  public.activate_next_quiz_question(
    current_setting('test.quiz_session_id')::uuid
  ) #>> '{questions,1,started_at}',
  current_setting('test.second_started_at'),
  'activation retry preserves the original server deadline'
);

reset role;
do $$
declare
  pending record;
begin
  for pending in
    select sq.id
    from public.quiz_session_questions sq
    left join public.quiz_answers a on a.session_question_id = sq.id
    where sq.session_id = current_setting('test.quiz_session_id')::uuid
      and a.id is null
    order by sq.position
  loop
    update public.quiz_session_questions
    set started_at = clock_timestamp() - interval '21 seconds',
        deadline_at = clock_timestamp() - interval '1 second'
    where id = pending.id;

    perform public.submit_quiz_answer(
      session_question_id => pending.id,
      idempotency_key => gen_random_uuid()
    );
  end loop;
end;
$$;
set local role authenticated;

select set_config(
  'test.final_result',
  public.finalize_quiz_session(
    current_setting('test.quiz_session_id')::uuid
  )::text,
  true
);
select is(
  current_setting('test.final_result')::jsonb ->> 'status',
  'completed',
  'complete session finalizes'
);
select is(
  public.finalize_quiz_session(
    current_setting('test.quiz_session_id')::uuid
  )::text,
  current_setting('test.final_result'),
  'finalize retry returns the same aggregate'
);
select is(
  (
    select total_score
    from public.quiz_sessions
    where id = current_setting('test.quiz_session_id')::uuid
  ),
  150,
  'stored total score is aggregated from authoritative answers'
);
select results_eq(
  format(
    $$
      select xp_awarded, tokens_awarded
      from public.quiz_sessions
      where id = %L
    $$,
    current_setting('test.quiz_session_id')
  ),
  $$values (0, 0)$$,
  'playable slice awards no XP or tokens'
);
select throws_ok(
  format(
    $$update public.quiz_sessions set total_score = 999 where id = %L$$,
    current_setting('test.quiz_session_id')
  ),
  '42501',
  null,
  'student cannot update authoritative totals directly'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000005',
  true
);
select is(
  (select count(*)::integer from public.quiz_sessions),
  0,
  'another student reads zero sessions'
);
select is(
  (select count(*)::integer from public.quiz_answers),
  0,
  'another student reads zero answers'
);
select is(
  (select count(*)::integer from public.quiz_session_question_state),
  0,
  'another student reads zero safe question state rows'
);
select throws_ok(
  format(
    $$select public.submit_quiz_answer(session_question_id => %L, idempotency_key => %L)$$,
    current_setting('test.first_question_id'),
    '30000000-0000-0000-0000-000000000006'
  ),
  'P0001',
  'QUIZ_SESSION_QUESTION_NOT_FOUND',
  'another student cannot submit to the owner session'
);

select * from finish();

rollback;
