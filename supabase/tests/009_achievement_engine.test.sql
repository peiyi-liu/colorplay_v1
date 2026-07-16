begin;

select plan(40);

select has_function(
  'public',
  'achievement_metric_value',
  array['uuid', 'achievement_rule_type'],
  'authoritative metric function exists'
);
select has_function(
  'public',
  'evaluate_achievements',
  array['uuid', 'achievement_source_type', 'uuid'],
  'achievement evaluator exists'
);
select has_function(
  'public',
  'get_my_achievement_catalog',
  array[]::text[],
  'privacy-safe catalog RPC exists'
);
select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.achievement_metric_value(uuid,achievement_rule_type)'::regprocedure
  ),
  true,
  'metric derivation is security definer'
);
select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.evaluate_achievements(uuid,achievement_source_type,uuid)'::regprocedure
  ),
  true,
  'evaluator is security definer'
);
select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.get_my_achievement_catalog()'::regprocedure
  ),
  true,
  'student catalog RPC is security definer'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.evaluate_achievements(uuid,achievement_source_type,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the evaluator'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.evaluate_achievements(uuid,achievement_source_type,uuid)',
    'EXECUTE'
  ),
  'authenticated users cannot execute the evaluator'
);
select ok(
  has_function_privilege('authenticated', 'public.get_my_achievement_catalog()', 'EXECUTE'),
  'authenticated users can execute only the safe catalog RPC'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'achievement.engine.one@colorplay.test',
    crypt('LocalOnly-Achievement1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'achievement.engine.two@colorplay.test',
    crypt('LocalOnly-Achievement2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

create function pg_temp.make_metric_session(
  target_session_id uuid,
  target_user_id uuid,
  target_status public.quiz_session_status,
  target_answers public.quiz_answer_status[],
  target_answered_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  answer_status public.quiz_answer_status;
  correct_option_id uuid;
  frozen_options jsonb;
  position integer := 0;
  question_record record;
  selected_option_id uuid;
begin
  insert into public.quiz_sessions (
    id, user_id, template_id, client_request_id, chapter_title,
    status, question_count, answered_count, correct_count, total_score,
    completed_at
  )
  values (
    target_session_id,
    target_user_id,
    '26000000-0000-0000-0000-000000000001',
    gen_random_uuid(),
    'Achievement metric test',
    target_status,
    array_length(target_answers, 1),
    array_length(target_answers, 1),
    (
      select count(*)::integer
      from unnest(target_answers) item
      where item = 'correct'
    ),
    (
      select count(*)::integer * 100
      from unnest(target_answers) item
      where item = 'correct'
    ),
    case when target_status = 'completed' then target_answered_at + interval '1 hour' end
  );

  for question_record in
    select q.*
    from public.questions q
    where q.status = 'published'
    order by q.stable_code
    limit array_length(target_answers, 1)
  loop
    position := position + 1;
    answer_status := target_answers[position];

    select
      jsonb_agg(
        jsonb_build_object(
          'id', qo.id,
          'key', qo.option_key,
          'text', qo.option_text,
          'sort_order', qo.sort_order
        ) order by qo.sort_order
      ),
      (array_agg(qo.id order by qo.sort_order) filter (where qo.is_correct))[1]
    into frozen_options, correct_option_id
    from public.question_options qo
    where qo.question_id = question_record.id;

    if answer_status = 'correct' then
      selected_option_id := correct_option_id;
    elsif answer_status = 'incorrect' then
      select qo.id
      into selected_option_id
      from public.question_options qo
      where qo.question_id = question_record.id
        and not qo.is_correct
      order by qo.sort_order
      limit 1;
    else
      selected_option_id := null;
    end if;

    insert into public.quiz_session_questions (
      id, session_id, question_id, position, question_stable_code,
      question_version, prompt, explanation, frozen_options, correct_option_id
    )
    values (
      gen_random_uuid(), target_session_id, question_record.id, position,
      question_record.stable_code, question_record.version, question_record.prompt,
      question_record.explanation, frozen_options, correct_option_id
    )
    returning id into question_record.id;

    insert into public.quiz_answers (
      id, session_id, session_question_id, user_id, selected_option_id,
      correct_option_id, answer_status, response_ms, score_delta,
      idempotency_key, answered_at
    )
    values (
      gen_random_uuid(), target_session_id, question_record.id, target_user_id,
      selected_option_id, correct_option_id, answer_status, 1000,
      case when answer_status = 'correct' then 100 else 0 end,
      gen_random_uuid(), target_answered_at + position * interval '1 second'
    );
  end loop;
end;
$$;

select pg_temp.make_metric_session(
  '62000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  'completed',
  array['correct', 'correct', 'incorrect', 'correct', 'correct']::public.quiz_answer_status[],
  '2026-01-01 00:00:00+00'
);
select pg_temp.make_metric_session(
  '62000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000001',
  'completed',
  array['correct']::public.quiz_answer_status[],
  '2026-01-01 01:00:00+00'
);
select pg_temp.make_metric_session(
  '62000000-0000-0000-0000-000000000003',
  '12000000-0000-0000-0000-000000000001',
  'in_progress',
  array['correct']::public.quiz_answer_status[],
  '2026-01-01 02:00:00+00'
);

insert into public.xp_transactions (user_id, amount, reason, source_type, source_id)
values (
  '12000000-0000-0000-0000-000000000001',
  1000,
  'achievement metric fixture',
  'achievement',
  '62000000-0000-0000-0000-000000000010'
);

select is(
  public.achievement_metric_value(
    '12000000-0000-0000-0000-000000000001',
    'completed_task_count'
  ),
  2,
  'completed metric counts only target user completed quizzes'
);
select is(
  public.achievement_metric_value(
    '12000000-0000-0000-0000-000000000001',
    'perfect_quiz_count'
  ),
  1,
  'perfect metric requires a completed all-correct session'
);
select is(
  public.achievement_metric_value('12000000-0000-0000-0000-000000000001', 'level_reached'),
  3,
  'level derives from the immutable XP ledger'
);
select is(
  public.achievement_metric_value('12000000-0000-0000-0000-000000000001', 'correct_streak'),
  3,
  'correct streak uses ordered answers from completed sessions only'
);
select is(
  public.achievement_metric_value(
    '12000000-0000-0000-0000-000000000001',
    'initial_blook_owned_count'
  ),
  1,
  'initial Blook metric counts owned catalog positions one through six'
);
select is(
  public.achievement_metric_value(
    '12000000-0000-0000-0000-000000000001',
    'resolved_mistake_count'
  ),
  null,
  'mistake metric remains unavailable'
);
select is(
  public.achievement_metric_value(
    '12000000-0000-0000-0000-000000000001',
    'mastered_chapter_count'
  ),
  null,
  'mastery metric remains unavailable'
);
select is(
  public.achievement_metric_value(
    '12000000-0000-0000-0000-000000000001',
    'live_completed_count'
  ),
  null,
  'Live metric remains unavailable'
);

select set_config(
  'test.wallet_before',
  (
    select token_balance::text from public.wallets
    where user_id = '12000000-0000-0000-0000-000000000001'
  ),
  true
);
select lives_ok(
  $$select public.evaluate_achievements(
    '12000000-0000-0000-0000-000000000001',
    'catalog_backfill',
    '12000000-0000-0000-0000-000000000001'
  )$$,
  'trusted evaluator derives achievement state'
);
select is(
  (
    select count(*)::integer from public.achievement_progress
    where user_id = '12000000-0000-0000-0000-000000000001'
  ),
  5,
  'evaluator writes only the five supported metric rows'
);
select is(
  (
    select count(*)::integer from public.achievement_unlocks
    where user_id = '12000000-0000-0000-0000-000000000001'
  ),
  2,
  'qualifying definitions unlock once'
);
select set_config(
  'test.computed_at',
  (
    select computed_at::text
    from public.achievement_progress
    where user_id = '12000000-0000-0000-0000-000000000001'
      and achievement_definition_id = '60000000-0000-0000-0000-000000000001'
  ),
  true
);
select lives_ok(
  $$select public.evaluate_achievements(
    '12000000-0000-0000-0000-000000000001',
    'catalog_backfill',
    '12000000-0000-0000-0000-000000000001'
  )$$,
  'replaying the same source is idempotent'
);
select is(
  (
    select count(*)::integer from public.achievement_progress
    where user_id = '12000000-0000-0000-0000-000000000001'
  ),
  5,
  'replay does not duplicate progress'
);
select is(
  (
    select count(*)::integer from public.achievement_unlocks
    where user_id = '12000000-0000-0000-0000-000000000001'
  ),
  2,
  'replay does not duplicate unlocks'
);
select is(
  (
    select computed_at::text
    from public.achievement_progress
    where user_id = '12000000-0000-0000-0000-000000000001'
      and achievement_definition_id = '60000000-0000-0000-0000-000000000001'
  ),
  current_setting('test.computed_at'),
  'unchanged progress preserves computed_at'
);
select is(
  (
    select count(*)::integer from public.xp_transactions
    where user_id = '12000000-0000-0000-0000-000000000001'
  ),
  1,
  'evaluation appends no achievement XP reward'
);
select is(
  (
    select count(*)::integer from public.wallet_transactions
    where user_id = '12000000-0000-0000-0000-000000000001'
  ),
  0,
  'evaluation appends no Token reward'
);
select is(
  (
    select token_balance
    from public.wallets
    where user_id = '12000000-0000-0000-0000-000000000001'
  ),
  current_setting('test.wallet_before')::integer,
  'evaluation does not change wallet balance'
);
select is(
  (
    select count(*)::integer
    from public.achievement_progress p
    join public.achievement_definitions d on d.id = p.achievement_definition_id
    where p.user_id = '12000000-0000-0000-0000-000000000001'
      and d.rule_type in (
        'resolved_mistake_count',
        'mastered_chapter_count',
        'live_completed_count'
      )
  ),
  0,
  'deferred rules receive no fabricated progress'
);
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks u
    join public.achievement_definitions d on d.id = u.achievement_definition_id
    where u.user_id = '12000000-0000-0000-0000-000000000001'
      and d.rule_type in (
        'resolved_mistake_count',
        'mastered_chapter_count',
        'live_completed_count'
      )
  ),
  0,
  'deferred rules receive no fabricated unlock'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select set_config('test.catalog', public.get_my_achievement_catalog()::text, true);
select is(
  jsonb_array_length(current_setting('test.catalog')::jsonb -> 'items'),
  9,
  'student catalog returns the nine public definitions'
);
select is(
  (current_setting('test.catalog')::jsonb ->> 'total_count')::integer,
  9,
  'catalog reports the public total'
);
select is(
  (current_setting('test.catalog')::jsonb ->> 'unlocked_count')::integer,
  2,
  'catalog reports authoritative unlocked count'
);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(current_setting('test.catalog')::jsonb -> 'items') item
    where item ->> 'stable_code' in (
      'mistakes_resolved_10',
      'chapter_mastered_1',
      'all_chapters_mastered',
      'live_complete_5'
    )
      and item ->> 'state' = 'not_started'
      and item -> 'progress' = 'null'::jsonb
      and item -> 'target' = 'null'::jsonb
  ),
  4,
  'all four deferred badges are truthfully not started'
);
select ok(
  current_setting('test.catalog') !~ 'rule_type|rule_parameters|source_type|source_id',
  'student payload omits trusted rule and source fields'
);
select is(
  current_setting('test.catalog')::jsonb #> '{items,0}' ->> 'stable_code',
  'first_task_complete',
  'catalog preserves deterministic sort order'
);

reset role;
insert into public.achievement_definitions (
  id, stable_code, display_name, description, badge_key, rule_type,
  rule_version, rule_parameters, visibility, status, sort_order
)
values (
  '60000000-0000-0000-0000-000000000100',
  'hidden_engine_test',
  'Hidden Test',
  'Hidden Test',
  'hidden_engine_test',
  'completed_task_count',
  1,
  '{"target":1}',
  'hidden',
  'active',
  100
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(public.get_my_achievement_catalog() -> 'items') item
    where item ->> 'stable_code' = 'hidden_engine_test'
  ),
  0,
  'locked hidden definitions are omitted'
);

reset role;
select public.evaluate_achievements(
  '12000000-0000-0000-0000-000000000001',
  'catalog_backfill',
  '12000000-0000-0000-0000-000000000100'
);
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks
    where user_id = '12000000-0000-0000-0000-000000000001'
      and achievement_definition_id = '60000000-0000-0000-0000-000000000100'
  ),
  1,
  'server evaluation can unlock a hidden definition once'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select is(
  (
    select count(*)::integer
    from jsonb_array_elements(public.get_my_achievement_catalog() -> 'items') item
    where item ->> 'stable_code' = 'hidden_engine_test'
      and item ->> 'state' = 'unlocked'
      and item -> 'progress' = 'null'::jsonb
      and item -> 'target' = 'null'::jsonb
  ),
  1,
  'unlocked hidden badge appears without revealing progress rules'
);
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
select is(
  (public.get_my_achievement_catalog() ->> 'unlocked_count')::integer,
  0,
  'another student receives only their own unlock count'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.get_my_achievement_catalog()$$,
  '42501',
  null,
  'anonymous catalog requests lack execute privilege'
);

select * from finish();
rollback;
