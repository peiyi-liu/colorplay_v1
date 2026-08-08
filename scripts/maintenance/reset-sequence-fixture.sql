\set ON_ERROR_STOP on

begin;

create temporary table sequence_reset_target on commit drop as
select id
from auth.users
where email = 'sequence.student@colorplay.test';

do $$
begin
  if (select count(*) from sequence_reset_target) <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'SEQUENCE_FIXTURE_TARGET_COUNT_INVALID';
  end if;
end;
$$;

select pg_advisory_xact_lock(
  hashtextextended('sequence.student@colorplay.test', 20260803)
);

select jsonb_build_object(
  'phase', 'preflight',
  'target_id', target.id,
  'quiz_sessions', (select count(*) from public.quiz_sessions where user_id = target.id),
  'review_progress', (select count(*) from public.review_progress where user_id = target.id),
  'mastery_sessions', (select count(*) from public.mastery_sessions where user_id = target.id),
  'student_chapter_unlocks', (select count(*) from public.student_chapter_unlocks where user_id = target.id),
  'xp_transactions', (select count(*) from public.xp_transactions where user_id = target.id),
  'wallet_transactions', (select count(*) from public.wallet_transactions where user_id = target.id),
  'user_blooks', (select count(*) from public.user_blooks where user_id = target.id)
)
from sequence_reset_target target;

create temporary table sequence_other_user_counts on commit drop as
select jsonb_build_object(
  'quiz_sessions', (select count(*) from public.quiz_sessions where user_id <> target.id),
  'review_progress', (select count(*) from public.review_progress where user_id <> target.id),
  'mastery_sessions', (select count(*) from public.mastery_sessions where user_id <> target.id),
  'student_chapter_unlocks', (select count(*) from public.student_chapter_unlocks where user_id <> target.id),
  'xp_transactions', (select count(*) from public.xp_transactions where user_id <> target.id),
  'wallet_transactions', (select count(*) from public.wallet_transactions where user_id <> target.id),
  'user_blooks', (select count(*) from public.user_blooks where user_id <> target.id)
) as counts
from sequence_reset_target target;

\if :{?execute_reset}
\else
  \echo 'execute_reset variable is required'
  \quit 3
\endif

\if :execute_reset
delete from public.remediation_attempts
where user_id = (select id from sequence_reset_target);

delete from public.mistake_items
where user_id = (select id from sequence_reset_target);

delete from public.quiz_answers
where user_id = (select id from sequence_reset_target);

delete from public.quiz_session_questions
where session_id in (
  select id from public.quiz_sessions
  where user_id = (select id from sequence_reset_target)
);

delete from public.quiz_sessions
where user_id = (select id from sequence_reset_target);

delete from public.review_progress
where user_id = (select id from sequence_reset_target);

delete from public.mastery_hint_events
where session_id in (
  select id from public.mastery_sessions
  where user_id = (select id from sequence_reset_target)
);

delete from public.mastery_attempts
where session_id in (
  select id from public.mastery_sessions
  where user_id = (select id from sequence_reset_target)
);

delete from public.mastery_sessions
where user_id = (select id from sequence_reset_target);

delete from public.student_chapter_unlocks
where user_id = (select id from sequence_reset_target);

delete from public.achievement_unlocks
where user_id = (select id from sequence_reset_target);

delete from public.achievement_progress
where user_id = (select id from sequence_reset_target);

set local session_replication_role = replica;
delete from public.xp_transactions
where user_id = (select id from sequence_reset_target);
delete from public.wallet_transactions
where user_id = (select id from sequence_reset_target);
set local session_replication_role = origin;

delete from public.user_blooks
where user_id = (select id from sequence_reset_target)
  and blook_id <> '50000000-0000-0000-0000-000000000001'::uuid;

insert into public.user_blooks (user_id, blook_id, source)
select
  target.id,
  '50000000-0000-0000-0000-000000000001'::uuid,
  'default'
from sequence_reset_target target
on conflict (user_id, blook_id) do update set source = excluded.source;

insert into public.wallets (user_id, token_balance)
select id, 0 from sequence_reset_target
on conflict (user_id) do update
set token_balance = 0,
    updated_at = clock_timestamp();

update public.profiles
set active_blook_id = '50000000-0000-0000-0000-000000000001'::uuid
where id = (select id from sequence_reset_target);

do $$
declare
  target_id uuid := (select id from sequence_reset_target);
  actual_other_counts jsonb;
begin
  if (select count(*) from public.quiz_sessions where user_id = target_id) <> 0
    or (select count(*) from public.review_progress where user_id = target_id) <> 0
    or (select count(*) from public.mastery_sessions where user_id = target_id) <> 0
    or (select count(*) from public.student_chapter_unlocks where user_id = target_id) <> 0
    or (select count(*) from public.xp_transactions where user_id = target_id) <> 0
    or (select count(*) from public.wallet_transactions where user_id = target_id) <> 0
    or (select token_balance from public.wallets where user_id = target_id) <> 0
    or (select count(*) from public.user_blooks where user_id = target_id) <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'SEQUENCE_FIXTURE_POSTFLIGHT_FAILED';
  end if;

  select jsonb_build_object(
    'quiz_sessions', (select count(*) from public.quiz_sessions where user_id <> target_id),
    'review_progress', (select count(*) from public.review_progress where user_id <> target_id),
    'mastery_sessions', (select count(*) from public.mastery_sessions where user_id <> target_id),
    'student_chapter_unlocks', (select count(*) from public.student_chapter_unlocks where user_id <> target_id),
    'xp_transactions', (select count(*) from public.xp_transactions where user_id <> target_id),
    'wallet_transactions', (select count(*) from public.wallet_transactions where user_id <> target_id),
    'user_blooks', (select count(*) from public.user_blooks where user_id <> target_id)
  ) into actual_other_counts;

  if actual_other_counts <> (select counts from sequence_other_user_counts) then
    raise exception using
      errcode = 'P0001',
      message = 'SEQUENCE_FIXTURE_NON_TARGET_CHANGED';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'postflight',
  'target_id', target.id,
  'quiz_sessions', 0,
  'review_progress', 0,
  'mastery_sessions', 0,
  'student_chapter_unlocks', 0,
  'xp_transactions', 0,
  'wallet_transactions', 0,
  'token_balance', 0,
  'user_blooks', 1
)
from sequence_reset_target target;

commit;
\else
rollback;
\endif
