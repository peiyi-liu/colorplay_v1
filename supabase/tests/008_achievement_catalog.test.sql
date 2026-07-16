begin;

select plan(43);

select has_table('public', 'achievement_definitions', 'achievement definitions exist');
select has_table('public', 'achievement_progress', 'achievement progress exists');
select has_table('public', 'achievement_unlocks', 'achievement unlocks exist');
select has_type('public', 'achievement_rule_type', 'achievement rule type exists');
select has_type('public', 'achievement_source_type', 'achievement source type exists');
select has_type('public', 'achievement_visibility', 'achievement visibility exists');
select has_type(
  'public',
  'achievement_definition_status',
  'achievement definition status exists'
);
select has_type('public', 'achievement_progress_state', 'achievement progress state exists');
select has_function(
  'public',
  'validate_achievement_rule_parameters',
  array['achievement_rule_type', 'integer', 'jsonb'],
  'versioned rule validator exists'
);

select is(
  enum_range(null::public.achievement_rule_type)::text,
  '{completed_task_count,perfect_quiz_count,resolved_mistake_count,mastered_chapter_count,level_reached,correct_streak,live_completed_count,initial_blook_owned_count}',
  'rule types match the locked contract'
);
select is(
  enum_range(null::public.achievement_source_type)::text,
  '{quiz_finalize,xp_ledger,blook_acquired,catalog_backfill,assignment_finalize,live_finalize,mistake_resolved,mastery_recomputed}',
  'source types reserve only the approved event boundaries'
);
select is(
  enum_range(null::public.achievement_visibility)::text,
  '{public,hidden}',
  'visibility values match the locked contract'
);
select is(
  enum_range(null::public.achievement_definition_status)::text,
  '{active,archived}',
  'definition status values match the locked contract'
);
select is(
  enum_range(null::public.achievement_progress_state)::text,
  '{not_started,in_progress,unlocked}',
  'progress state values match the locked contract'
);

select is(
  (
    select jsonb_agg(
      jsonb_build_array(id, stable_code, display_name, description, badge_key, rule_type, rule_parameters)
      order by sort_order
    )
    from public.achievement_definitions
    where id between
      '60000000-0000-0000-0000-000000000001'::uuid and
      '60000000-0000-0000-0000-000000000009'::uuid
  ),
  '[
    ["60000000-0000-0000-0000-000000000001","first_task_complete","初出茅廬","完成第一次正式挑戰","first_task_complete","completed_task_count",{"target":1}],
    ["60000000-0000-0000-0000-000000000002","first_perfect_quiz","百發百中","在一次正式測驗中全數答對","first_perfect_quiz","perfect_quiz_count",{"target":1}],
    ["60000000-0000-0000-0000-000000000003","mistakes_resolved_10","不屈不撓","解決 10 個不同錯題","mistakes_resolved_10","resolved_mistake_count",{"target":10}],
    ["60000000-0000-0000-0000-000000000004","chapter_mastered_1","章節精熟","精熟第一個章節","chapter_mastered_1","mastered_chapter_count",{"target":1}],
    ["60000000-0000-0000-0000-000000000005","all_chapters_mastered","色彩大師","精熟全部六個章節","all_chapters_mastered","mastered_chapter_count",{"target":6}],
    ["60000000-0000-0000-0000-000000000006","level_10","登峰造極","達到 Level 10","level_10","level_reached",{"target":10}],
    ["60000000-0000-0000-0000-000000000007","correct_streak_20","連擊之王","連續答對 20 題","correct_streak_20","correct_streak",{"target":20}],
    ["60000000-0000-0000-0000-000000000008","live_complete_5","課堂挑戰者","完成 5 場 ColorPlay Live","live_complete_5","live_completed_count",{"target":5}],
    ["60000000-0000-0000-0000-000000000009","blooks_owned_6","收藏家","擁有六隻初始 Blook","blooks_owned_6","initial_blook_owned_count",{"target":6}]
  ]'::jsonb,
  'catalog contains the exact ordered nine badge definitions'
);
select is(
  (
    select count(*)::integer
    from public.achievement_definitions
    where stable_code = 'case_expert'
  ),
  0,
  'unapproved case expert definition is absent'
);
select is(
  (
    select count(*)::integer
    from public.achievement_definitions
    where id between
      '60000000-0000-0000-0000-000000000001'::uuid and
      '60000000-0000-0000-0000-000000000009'::uuid
      and rule_version = 1
      and status = 'active'
      and visibility = 'public'
      and btrim(display_name) <> ''
      and btrim(description) <> ''
      and badge_key = stable_code
  ),
  9,
  'all approved definitions are active public version-one badges'
);
select hasnt_column(
  'public',
  'achievement_definitions',
  'xp_reward',
  'definitions cannot carry XP rewards'
);
select hasnt_column(
  'public',
  'achievement_definitions',
  'token_reward',
  'definitions cannot carry Token rewards'
);

select ok(
  public.validate_achievement_rule_parameters('completed_task_count', 1, '{"target":1}'),
  'positive integer target is valid'
);
select ok(
  not public.validate_achievement_rule_parameters('completed_task_count', 1, '{}'),
  'missing target is invalid'
);
select ok(
  not public.validate_achievement_rule_parameters(
    'completed_task_count',
    1,
    '{"target":1,"extra":true}'
  ),
  'extra rule keys are invalid'
);
select ok(
  not public.validate_achievement_rule_parameters('completed_task_count', 1, '{"target":1.5}'),
  'non-integer target is invalid'
);
select ok(
  not public.validate_achievement_rule_parameters('completed_task_count', 2, '{"target":1}'),
  'unsupported rule versions are invalid'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.achievement_definitions'::regclass),
  true,
  'definitions have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.achievement_progress'::regclass),
  true,
  'progress has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.achievement_unlocks'::regclass),
  true,
  'unlocks have RLS enabled'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'achievement_progress_user_definition_idx'
  ),
  'progress has the required user-definition index'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'achievement_unlocks_user_definition_idx'
  ),
  'unlocks have the required user-definition index'
);

select ok(
  not has_table_privilege('authenticated', 'public.achievement_definitions', 'SELECT'),
  'students cannot read raw definitions'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievement_definitions', 'INSERT,UPDATE,DELETE'),
  'students cannot mutate definitions'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievement_progress', 'INSERT'),
  'students cannot insert progress'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievement_progress', 'UPDATE'),
  'students cannot update progress'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievement_progress', 'DELETE'),
  'students cannot delete progress'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievement_unlocks', 'INSERT'),
  'students cannot insert unlocks'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievement_unlocks', 'UPDATE'),
  'students cannot update unlocks'
);
select ok(
  not has_table_privilege('authenticated', 'public.achievement_unlocks', 'DELETE'),
  'students cannot delete unlocks'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'achievement.catalog.one@colorplay.test',
    crypt('LocalOnly-Achievement1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'achievement.catalog.two@colorplay.test',
    crypt('LocalOnly-Achievement2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

insert into public.achievement_progress (
  user_id, achievement_definition_id, definition_version,
  current_value, target_value, state, last_source_type, last_source_id
)
values (
  '11000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  1, 1, 1, 'unlocked', 'catalog_backfill',
  '11000000-0000-0000-0000-000000000001'
);

insert into public.achievement_unlocks (
  id, user_id, achievement_definition_id, definition_version, source_type, source_id
)
values (
  '61000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  1, 'catalog_backfill', '11000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.achievement_progress), 1, 'student reads own progress');
select is((select count(*)::integer from public.achievement_unlocks), 1, 'student reads own unlock');

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select is(
  (
    select count(*)::integer from public.achievement_progress
    where user_id = '11000000-0000-0000-0000-000000000001'
  ),
  0,
  'another student cannot read Student A progress'
);
select is(
  (
    select count(*)::integer from public.achievement_unlocks
    where user_id = '11000000-0000-0000-0000-000000000001'
  ),
  0,
  'another student cannot read Student A unlocks'
);

reset role;
select throws_ok(
  $$update public.achievement_unlocks
    set unlocked_at = clock_timestamp()
    where id = '61000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'ACHIEVEMENT_UNLOCK_IMMUTABLE',
  'privileged updates cannot rewrite an unlock'
);
select throws_ok(
  $$delete from public.achievement_unlocks
    where id = '61000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'ACHIEVEMENT_UNLOCK_IMMUTABLE',
  'privileged deletes cannot remove an unlock'
);

select * from finish();
rollback;
