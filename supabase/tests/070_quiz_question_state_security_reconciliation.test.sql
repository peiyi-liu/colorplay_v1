begin;

select plan(8);

select has_view(
  'public',
  'quiz_session_question_state',
  'quiz session question state projection exists'
);

select ok(
  coalesce((
    select 'security_barrier=true' = any (relation.reloptions)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'quiz_session_question_state'
  ), false),
  'projection retains the security barrier'
);

select ok(
  coalesce((
    select 'security_invoker=true' = any (relation.reloptions)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'quiz_session_question_state'
  ), false),
  'projection evaluates underlying RLS as the caller'
);

select has_function(
  'public',
  'quiz_answer_explanation',
  array['uuid'],
  'answer explanation remains behind the caller-bound helper'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.quiz_answer_explanation(uuid)',
    'EXECUTE'
  ),
  'authenticated callers may invoke the guarded explanation helper'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.quiz_answer_explanation(uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot invoke the explanation helper'
);

select ok(
  pg_get_viewdef('public.quiz_session_question_state'::regclass, true)::text
    like '%quiz_answer_explanation(sq.id)%',
  'projection does not read the frozen explanation directly'
);

select ok(
  pg_get_viewdef('public.quiz_session_question_state'::regclass, true)
    like '%challenge_kind%'
  and pg_get_viewdef('public.quiz_session_question_state'::regclass, true)
    like '%chapter_sort_order%'
  and pg_get_viewdef('public.quiz_session_question_state'::regclass, true)
    like '%section_sort_order%'
  and pg_get_viewdef('public.quiz_session_question_state'::regclass, true)
    like '%section_title%',
  'projection retains the Admin chapter and section context columns'
);

select * from finish();
rollback;
