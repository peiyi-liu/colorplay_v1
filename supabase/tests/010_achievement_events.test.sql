begin;

select plan(33);

select has_function(
  'public',
  'evaluate_quiz_finalize_achievements',
  array[]::text[],
  'quiz finalize trigger function exists'
);
select has_function(
  'public',
  'evaluate_xp_achievement_event',
  array[]::text[],
  'XP trigger function exists'
);
select has_function(
  'public',
  'evaluate_blook_achievement_event',
  array[]::text[],
  'Blook trigger function exists'
);
select has_trigger(
  'public',
  'quiz_sessions',
  'quiz_finalize_achievement_evaluation',
  'quiz completion has an achievement trigger'
);
select has_trigger(
  'public',
  'xp_transactions',
  'xp_achievement_evaluation',
  'XP ledger insert has an achievement trigger'
);
select has_trigger(
  'public',
  'user_blooks',
  'blook_achievement_evaluation',
  'Blook acquisition has an achievement trigger'
);
select is(
  (
    select count(*)::integer
    from pg_trigger
    where tgname in (
      'assignment_finalize_achievement_evaluation',
      'live_finalize_achievement_evaluation',
      'mistake_resolved_achievement_evaluation',
      'mastery_recomputed_achievement_evaluation'
    )
  ),
  0,
  'deferred subsystems have no fabricated trigger'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.evaluate_quiz_finalize_achievements()',
    'EXECUTE'
  ),
  'students cannot invoke the quiz trigger function'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.evaluate_xp_achievement_event()',
    'EXECUTE'
  ),
  'students cannot invoke the XP trigger function'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.evaluate_blook_achievement_event()',
    'EXECUTE'
  ),
  'students cannot invoke the Blook trigger function'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '13000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'achievement.events.one@colorplay.test',
    crypt('LocalOnly-Achievement1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '13000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'achievement.events.two@colorplay.test',
    crypt('LocalOnly-Achievement2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

create function pg_temp.make_event_session(
  target_session_id uuid,
  target_user_id uuid,
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
  session_question_id uuid;
begin
  insert into public.quiz_sessions (
    id, user_id, template_id, client_request_id, chapter_title, question_count
  )
  values (
    target_session_id,
    target_user_id,
    '26000000-0000-0000-0000-000000000001',
    gen_random_uuid(),
    'Achievement event test',
    array_length(target_answers, 1)
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

    session_question_id := gen_random_uuid();
    insert into public.quiz_session_questions (
      id, session_id, question_id, position, question_stable_code,
      question_version, prompt, explanation, frozen_options, correct_option_id
    )
    values (
      session_question_id, target_session_id, question_record.id, position,
      question_record.stable_code, question_record.version, question_record.prompt,
      question_record.explanation, frozen_options, correct_option_id
    );

    insert into public.quiz_answers (
      id, session_id, session_question_id, user_id, selected_option_id,
      correct_option_id, answer_status, response_ms, score_delta,
      provisional_xp, provisional_tokens, idempotency_key, answered_at
    )
    values (
      gen_random_uuid(), target_session_id, session_question_id, target_user_id,
      selected_option_id, correct_option_id, answer_status, 1000,
      case when answer_status = 'correct' then 100 else 0 end,
      0, 0, gen_random_uuid(), target_answered_at + position * interval '1 second'
    );
  end loop;
end;
$$;

select pg_temp.make_event_session(
  '63000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000001',
  array_fill('correct'::public.quiz_answer_status, array[10]),
  '2026-01-02 00:00:00+00'
);
select pg_temp.make_event_session(
  '63000000-0000-0000-0000-000000000002',
  '13000000-0000-0000-0000-000000000001',
  array_fill('correct'::public.quiz_answer_status, array[10]),
  '2026-01-02 01:00:00+00'
);
select pg_temp.make_event_session(
  '63000000-0000-0000-0000-000000000003',
  '13000000-0000-0000-0000-000000000002',
  array_fill('correct'::public.quiz_answer_status, array[10]),
  '2026-01-02 02:00:00+00'
);
select pg_temp.make_event_session(
  '63000000-0000-0000-0000-000000000004',
  '13000000-0000-0000-0000-000000000002',
  array[
    'timeout', 'correct', 'correct', 'correct', 'correct',
    'correct', 'correct', 'correct', 'correct', 'correct'
  ]::public.quiz_answer_status[],
  '2026-01-02 03:00:00+00'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.finalize_quiz_session('63000000-0000-0000-0000-000000000001')$$,
  'real finalize completes the first perfect quiz'
);
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks u
    where u.user_id = '13000000-0000-0000-0000-000000000001'
      and u.achievement_definition_id = '60000000-0000-0000-0000-000000000001'
  ),
  1,
  'first real finalize unlocks first task in the same transaction'
);
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks u
    where u.user_id = '13000000-0000-0000-0000-000000000001'
      and u.achievement_definition_id = '60000000-0000-0000-0000-000000000002'
  ),
  1,
  'perfect real finalize unlocks the perfect badge'
);
select lives_ok(
  $$select public.finalize_quiz_session('63000000-0000-0000-0000-000000000002')$$,
  'second real finalize completes the twenty-answer run'
);
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks u
    where u.user_id = '13000000-0000-0000-0000-000000000001'
      and u.achievement_definition_id = '60000000-0000-0000-0000-000000000007'
  ),
  1,
  'twenty uninterrupted correct answers unlock the streak badge'
);
select lives_ok(
  $$select public.finalize_quiz_session('63000000-0000-0000-0000-000000000002')$$,
  'finalize replay remains idempotent'
);
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks u
    where u.user_id = '13000000-0000-0000-0000-000000000001'
      and u.achievement_definition_id in (
        '60000000-0000-0000-0000-000000000001',
        '60000000-0000-0000-0000-000000000002',
        '60000000-0000-0000-0000-000000000007'
      )
  ),
  3,
  'finalize replay creates no duplicate unlock'
);

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
select public.finalize_quiz_session('63000000-0000-0000-0000-000000000003');
select public.finalize_quiz_session('63000000-0000-0000-0000-000000000004');
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks u
    where u.user_id = '13000000-0000-0000-0000-000000000002'
      and u.achievement_definition_id = '60000000-0000-0000-0000-000000000007'
  ),
  0,
  'a timeout breaks the twenty-answer run'
);

reset role;
insert into public.xp_transactions (user_id, amount, reason, source_type, source_id)
values (
  '13000000-0000-0000-0000-000000000001',
  4500,
  'achievement level event fixture',
  'achievement',
  '63000000-0000-0000-0000-000000000010'
);
select is(
  public.achievement_metric_value('13000000-0000-0000-0000-000000000001', 'level_reached'),
  10,
  'XP event derives authoritative Level 10'
);
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks u
    join public.achievement_definitions d on d.id = u.achievement_definition_id
    where u.user_id = '13000000-0000-0000-0000-000000000001'
      and d.stable_code = 'level_10'
  ),
  1,
  'XP ledger event unlocks Level 10 transactionally'
);

insert into public.user_blooks (user_id, blook_id, source)
select
  '13000000-0000-0000-0000-000000000001',
  b.id,
  'purchase'
from public.blooks b
where b.sort_order between 2 and 6
order by b.sort_order;
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks u
    join public.achievement_definitions d on d.id = u.achievement_definition_id
    where u.user_id = '13000000-0000-0000-0000-000000000001'
      and d.stable_code = 'blooks_owned_6'
  ),
  1,
  'sixth initial Blook acquisition unlocks collector badge'
);

select is(
  (
    select count(*)::integer from public.xp_transactions
    where user_id = '13000000-0000-0000-0000-000000000001'
  ),
  1,
  'achievement evaluation adds no XP beyond the explicit fixture'
);
select is(
  (
    select count(*)::integer from public.wallet_transactions
    where user_id = '13000000-0000-0000-0000-000000000001'
  ),
  0,
  'achievement evaluation adds no wallet transaction'
);
select is(
  (
    select token_balance from public.wallets
    where user_id = '13000000-0000-0000-0000-000000000001'
  ),
  0,
  'achievement evaluation leaves wallet cache unchanged'
);

select set_config(
  'test.level_before_rollback',
  (
    select current_value::text
    from public.achievement_progress
    where user_id = '13000000-0000-0000-0000-000000000002'
      and achievement_definition_id = '60000000-0000-0000-0000-000000000006'
  ),
  true
);
savepoint before_rolled_back_event;
insert into public.xp_transactions (user_id, amount, reason, source_type, source_id)
values (
  '13000000-0000-0000-0000-000000000002',
  500,
  'rolled back achievement event',
  'achievement',
  '63000000-0000-0000-0000-000000000011'
);
rollback to savepoint before_rolled_back_event;
select is(
  (
    select current_value
    from public.achievement_progress
    where user_id = '13000000-0000-0000-0000-000000000002'
      and achievement_definition_id = '60000000-0000-0000-0000-000000000006'
  ),
  current_setting('test.level_before_rollback')::integer,
  'source rollback also rolls back achievement progress'
);
select is(
  (
    select count(*)::integer from public.xp_transactions
    where user_id = '13000000-0000-0000-0000-000000000002'
      and source_id = '63000000-0000-0000-0000-000000000011'
  ),
  0,
  'rolled-back source row is absent'
);
select is(
  (
    select count(*)::integer
    from public.achievement_progress p
    join public.achievement_definitions d on d.id = p.achievement_definition_id
    where p.user_id in (
      '13000000-0000-0000-0000-000000000001',
      '13000000-0000-0000-0000-000000000002'
    )
      and d.stable_code in (
        'mistakes_resolved_10',
        'chapter_mastered_1',
        'all_chapters_mastered',
        'live_complete_5'
      )
  ),
  0,
  'trusted events create no deferred progress'
);
select is(
  (
    select count(*)::integer
    from public.achievement_unlocks u
    join public.achievement_definitions d on d.id = u.achievement_definition_id
    where u.user_id in (
      '13000000-0000-0000-0000-000000000001',
      '13000000-0000-0000-0000-000000000002'
    )
      and d.stable_code in (
        'mistakes_resolved_10',
        'chapter_mastered_1',
        'all_chapters_mastered',
        'live_complete_5'
      )
  ),
  0,
  'trusted events create no deferred unlock'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
select is(
  (
    select count(*)::integer from public.achievement_progress
    where user_id = '13000000-0000-0000-0000-000000000001'
  ),
  0,
  'Student B cannot read Student A progress'
);
select is(
  (
    select count(*)::integer from public.achievement_unlocks
    where user_id = '13000000-0000-0000-0000-000000000001'
  ),
  0,
  'Student B cannot read Student A unlocks'
);
select throws_ok(
  $$insert into public.achievement_unlocks (
      user_id, achievement_definition_id, definition_version, source_type, source_id
    ) values (
      auth.uid(), '60000000-0000-0000-0000-000000000006', 1,
      'xp_ledger', '63000000-0000-0000-0000-000000000099'
    )$$,
  '42501',
  null,
  'Student B cannot forge an unlock'
);

reset role;
select lives_ok(
  $$select public.evaluate_achievements(
    '13000000-0000-0000-0000-000000000002',
    'catalog_backfill',
    '13000000-0000-0000-0000-000000000002'
  )$$,
  'catalog backfill source can derive an existing profile'
);
select is(
  (
    select count(*)::integer from public.xp_transactions
    where user_id = '13000000-0000-0000-0000-000000000002'
  ),
  0,
  'catalog backfill creates no reward ledger row'
);

select * from finish();
rollback;
