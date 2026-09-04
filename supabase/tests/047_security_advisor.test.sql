begin;

select plan(9);

select ok(
  coalesce(
    (
      select c.reloptions @> array['security_invoker=true']
      from pg_class c
      where c.oid = 'public.quiz_session_question_state'::regclass
    ),
    false
  ),
  'quiz question state view invokes with the authenticated student role'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.quiz_session_questions',
    'SELECT'
  ),
  'authenticated students cannot select every frozen question column'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.quiz_session_questions',
    'prompt',
    'SELECT'
  ),
  'authenticated students can reach safe quiz question columns through RLS'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.quiz_session_questions',
    'correct_option_id',
    'SELECT'
  ),
  'authenticated students cannot read frozen correct options directly'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.quiz_session_questions',
    'explanation',
    'SELECT'
  ),
  'authenticated students cannot read frozen explanations directly'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.quiz_session_questions',
    'SELECT'
  ),
  'anonymous callers cannot read quiz question rows'
);

set local role authenticated;

select lives_ok(
  $$select count(*) from public.quiz_session_question_state$$,
  'authenticated students can query the security invoker view'
);

reset role;

select ok(
  coalesce(
    not has_function_privilege(
      'anon',
      to_regprocedure('public.quiz_answer_explanation(uuid)'),
      'EXECUTE'
    ),
    false
  ),
  'anonymous callers cannot execute the answered explanation helper'
);

select ok(
  coalesce(
    (
      select p.proconfig @> array['search_path=pg_catalog, public']
      from pg_proc p
      where p.oid = 'public.live_topic_session_id(text)'::regprocedure
    ),
    false
  ),
  'live topic parser has a fixed search path'
);

select * from finish();

rollback;
