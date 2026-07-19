begin;

select plan(28);

-- 結構
select has_table('public', 'mastery_sessions', 'mastery sessions exist');
select has_table('public', 'mastery_attempts', 'mastery attempts exist');
select has_table('public', 'mastery_hint_events', 'mastery hint events exist');
select has_function(
  'public', 'start_mastery_session', array['uuid'], 'start RPC exists'
);
select has_function(
  'public', 'get_mastery_state', array['uuid'], 'state RPC exists'
);
select has_function(
  'public', 'submit_mastery_attempt', array['uuid', 'uuid'], 'attempt RPC exists'
);
select has_function(
  'public', 'get_mastery_hint', array['uuid', 'integer'], 'hint RPC exists'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.mastery_sessions'::regclass),
  true, 'sessions have RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.mastery_attempts'::regclass),
  true, 'attempts have RLS enabled'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.submit_mastery_attempt(uuid, uuid)'::regprocedure),
  true, 'attempt command is security definer'
);
select is(
  (select proconfig from pg_proc where oid = 'public.submit_mastery_attempt(uuid, uuid)'::regprocedure),
  array['search_path=pg_catalog, public'],
  'attempt command has a fixed search path'
);
select ok(
  not has_function_privilege('anon', 'public.start_mastery_session(uuid)', 'EXECUTE'),
  'anonymous users cannot start mastery sessions'
);
select ok(
  not has_table_privilege('authenticated', 'public.mastery_attempts', 'INSERT'),
  'students cannot insert attempts directly'
);

-- 種子身分
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000041',
    'authenticated', 'authenticated', 'mastery.one@colorplay.test',
    crypt('LocalOnly-Mastery1!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000042',
    'authenticated', 'authenticated', 'mastery.two@colorplay.test',
    crypt('LocalOnly-Mastery2!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

-- 取一個已發布章節（含已發布題目）
create temporary table mastery_fixture on commit drop as
select c.id as chapter_id
from public.chapters c
where c.status = 'published'
  and exists (
    select 1
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    join public.sections se on se.id = st.section_id
    where se.chapter_id = c.id and q.status = 'published'
  )
order by c.sort_order
limit 1;

select isnt(
  (select chapter_id from mastery_fixture),
  null,
  'fixture chapter with published questions exists'
);

-- 學生一：開始（冪等）與作答
-- （temp table 需 postgres 角色；definer RPC 只認 JWT claim，行為不變）
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000041', true);

create temporary table mastery_run on commit drop as
select public.start_mastery_session((select chapter_id from mastery_fixture)) as session_id;

select is(
  (select public.start_mastery_session((select chapter_id from mastery_fixture))),
  (select session_id from mastery_run),
  'restart resumes the same in-progress session'
);
select is(
  ((public.get_mastery_state((select session_id from mastery_run)))->>'position')::integer,
  1,
  'new session starts at stage one'
);
select is(
  (public.get_mastery_state((select session_id from mastery_run)))->'question' ? 'explanation',
  false,
  'state payload never exposes the explanation before mastery'
);
select is(
  (
    select bool_or(option ? 'is_correct')
    from jsonb_array_elements(
      (public.get_mastery_state((select session_id from mastery_run)))->'question'->'options'
    ) option
  ),
  false,
  'option payload never exposes correctness'
);

-- 答錯 → 鎖定；重複選同一選項 → 拒絕
create temporary table mastery_wrong on commit drop as
select o.id as option_id
from public.mastery_sessions ms
cross join lateral (
  select (ms.question_ids)[1] as question_id
) q
join public.question_options o on o.question_id = q.question_id
where ms.id = (select session_id from mastery_run)
  and o.is_correct = false
order by o.sort_order
limit 1;

select is(
  ((public.submit_mastery_attempt(
    (select session_id from mastery_run),
    (select option_id from mastery_wrong)
  ))->>'is_correct')::boolean,
  false,
  'wrong attempt is adjudicated by the server'
);
select throws_ok(
  format(
    $$select public.submit_mastery_attempt('%s'::uuid, '%s'::uuid)$$,
    (select session_id from mastery_run),
    (select option_id from mastery_wrong)
  ),
  'P0001',
  'MASTERY_OPTION_LOCKED',
  'repeating a locked option is rejected'
);

-- 一次答錯後可取第 1 層提示；第 3 層仍鎖
select ok(
  length((public.get_mastery_hint((select session_id from mastery_run), 1))->>'content') > 0,
  'first hint unlocks after one wrong attempt'
);
select throws_ok(
  format(
    $$select public.get_mastery_hint('%s'::uuid, 3)$$,
    (select session_id from mastery_run)
  ),
  'P0001',
  'MASTERY_HINT_LOCKED',
  'later hints stay locked until enough wrong attempts'
);

-- 答對 → 前進
create temporary table mastery_correct on commit drop as
select o.id as option_id
from public.mastery_sessions ms
cross join lateral (
  select (ms.question_ids)[1] as question_id
) q
join public.question_options o on o.question_id = q.question_id
where ms.id = (select session_id from mastery_run)
  and o.is_correct = true
limit 1;

select is(
  ((public.submit_mastery_attempt(
    (select session_id from mastery_run),
    (select option_id from mastery_correct)
  ))->>'is_correct')::boolean,
  true,
  'correct attempt is confirmed with the explanation'
);
select is(
  ((public.get_mastery_state((select session_id from mastery_run)))->>'position')::integer,
  2,
  'mastering a stage advances the map'
);

-- 學生二：無法讀取或作答他人 session
grant select on mastery_run, mastery_correct to authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000042', true);
set local role authenticated;
select throws_ok(
  format(
    $$select public.get_mastery_state('%s'::uuid)$$,
    (select session_id from mastery_run)
  ),
  'P0001',
  'MASTERY_NOT_FOUND',
  'another student cannot read the session'
);
select throws_ok(
  format(
    $$select public.submit_mastery_attempt('%s'::uuid, '%s'::uuid)$$,
    (select session_id from mastery_run),
    (select option_id from mastery_correct)
  ),
  'P0001',
  'MASTERY_NOT_FOUND',
  'another student cannot answer the session'
);
select is(
  (
    select count(*)::integer
    from public.mastery_sessions
    where id = (select session_id from mastery_run)
  ),
  0,
  'RLS hides other students sessions'
);

reset role;

-- 匿名
set local role anon;
select throws_ok(
  $$select public.start_mastery_session(gen_random_uuid())$$,
  '42501',
  null,
  'anonymous role cannot start mastery sessions'
);

reset role;

select * from finish();
rollback;
