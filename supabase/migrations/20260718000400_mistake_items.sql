-- Wrong or timed-out answers in formal sessions (practice, assignment) become
-- mistake items with one current identity per user and question: first wrong
-- opens the item, repeats keep it open, a wrong answer after resolution
-- reopens it. Remediation-internal wrongs and Live answers never create
-- items. The origin answer is recorded once and never overwritten.
-- finalize_quiz_session is replaced forward from 20260717000500 with the
-- mistake upsert added at the completion transition.

create type public.mistake_status as enum ('open', 'resolved', 'reopened');

create table public.mistake_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  question_version integer not null check (question_version > 0),
  origin_answer_id uuid not null references public.quiz_answers(id),
  status public.mistake_status not null default 'open',
  first_wrong_at timestamptz not null default clock_timestamp(),
  last_event_at timestamptz not null default clock_timestamp(),
  constraint mistake_items_user_question_unique unique (user_id, question_id)
);

create index mistake_items_user_status_idx
  on public.mistake_items (user_id, status);

alter table public.mistake_items enable row level security;

grant select on public.mistake_items to authenticated;

create policy mistake_items_own_select on public.mistake_items
for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.finalize_quiz_session(session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record record;
  aggregate_record record;
  previous_completed integer;
  reward_rate integer;
  formal_xp integer;
  formal_tokens integer;
  attempt_record record;
  attempt_payload jsonb := null;
  result_payload jsonb;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if session_id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_INVALID_REQUEST';
  end if;

  select s.*
  into session_record
  from public.quiz_sessions s
  where s.id = finalize_quiz_session.session_id
    and s.user_id = current_user_id
  for update;

  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_NOT_FOUND';
  end if;

  if session_record.status = 'completed' then
    result_payload := jsonb_build_object(
      'session_id', session_record.id,
      'status', session_record.status,
      'question_count', session_record.question_count,
      'answered_count', session_record.answered_count,
      'correct_count', session_record.correct_count,
      'total_score', session_record.total_score,
      'xp_awarded', session_record.xp_awarded,
      'tokens_awarded', session_record.tokens_awarded,
      'reward_rate_percent', session_record.reward_rate_percent,
      'game_rules_version', session_record.game_rules_version,
      'completed_at', session_record.completed_at
    );
    if session_record.purpose = 'assignment'
      and session_record.assignment_attempt_id is not null then
      result_payload := result_payload || jsonb_build_object(
        'assignment_attempt',
        public.build_assignment_attempt_payload(session_record.assignment_attempt_id)
      );
    end if;
    return result_payload;
  end if;

  select
    count(*)::integer as answered_count,
    count(*) filter (where a.answer_status = 'correct')::integer as correct_count,
    coalesce(sum(a.score_delta), 0)::integer as total_score,
    coalesce(sum(a.provisional_xp), 0)::integer as provisional_xp,
    coalesce(sum(a.provisional_tokens), 0)::integer as provisional_tokens
  into aggregate_record
  from public.quiz_answers a
  where a.session_id = session_record.id;

  if aggregate_record.answered_count <> session_record.question_count then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_INCOMPLETE';
  end if;

  perform 1
  from public.wallets
  where user_id = current_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ECONOMY_WALLET_NOT_FOUND';
  end if;

  select count(*)::integer
  into previous_completed
  from public.quiz_sessions prior
  where prior.user_id = current_user_id
    and prior.template_id = session_record.template_id
    and prior.status = 'completed'
    and (prior.completed_at at time zone 'Asia/Taipei')::date =
      (clock_timestamp() at time zone 'Asia/Taipei')::date;

  reward_rate := case when previous_completed < 3 then 100 else 20 end;
  formal_xp := floor(aggregate_record.provisional_xp * reward_rate / 100.0)::integer;
  formal_tokens := case when reward_rate = 100
    then aggregate_record.provisional_tokens
    else 0
  end;

  if formal_xp > 0 then
    insert into public.xp_transactions (
      user_id, amount, reason, source_type, source_id
    ) values (
      current_user_id, formal_xp, 'quiz finalize reward',
      'quiz_finalize', session_record.id
    );
  end if;

  if formal_tokens > 0 then
    insert into public.wallet_transactions (
      user_id, amount, reason, source_type, source_id
    ) values (
      current_user_id, formal_tokens, 'quiz finalize reward',
      'quiz_finalize', session_record.id
    );

    update public.wallets
    set token_balance = token_balance + formal_tokens,
        updated_at = clock_timestamp()
    where user_id = current_user_id;
  end if;

  update public.quiz_sessions
  set status = 'completed',
      answered_count = aggregate_record.answered_count,
      correct_count = aggregate_record.correct_count,
      total_score = aggregate_record.total_score,
      xp_awarded = formal_xp,
      tokens_awarded = formal_tokens,
      reward_rate_percent = reward_rate,
      completed_at = clock_timestamp()
  where id = session_record.id
  returning * into session_record;

  if session_record.purpose in ('practice', 'assignment') then
    insert into public.mistake_items (
      user_id, question_id, question_version, origin_answer_id
    )
    select
      current_user_id,
      question.question_id,
      question.question_version,
      answer.id
    from public.quiz_session_questions question
    join public.quiz_answers answer
      on answer.session_question_id = question.id
    where question.session_id = session_record.id
      and answer.answer_status <> 'correct'
    on conflict on constraint mistake_items_user_question_unique
    do update set
      status = case
        when public.mistake_items.status = 'resolved' then 'reopened'
        else public.mistake_items.status
      end,
      question_version = excluded.question_version,
      last_event_at = clock_timestamp();
  end if;

  if session_record.purpose = 'assignment'
    and session_record.assignment_attempt_id is not null then
    select attempt.*, assignment.deadline_at, assignment.passing_rule
    into attempt_record
    from public.assignment_attempts attempt
    join public.assignments assignment on assignment.id = attempt.assignment_id
    where attempt.id = session_record.assignment_attempt_id
    for update of attempt;

    if attempt_record.id is not null
      and attempt_record.status = 'in_progress' then
      if attempt_record.deadline_at is not null
        and clock_timestamp() > attempt_record.deadline_at then
        update public.assignment_attempts
        set status = 'expired'
        where id = attempt_record.id;
      else
        update public.assignment_attempts
        set status = 'completed',
            passed = session_record.total_score >=
              (attempt_record.passing_rule ->> 'threshold')::integer,
            completed_at = clock_timestamp()
        where id = attempt_record.id;
      end if;
    end if;

    attempt_payload := public.build_assignment_attempt_payload(
      session_record.assignment_attempt_id
    );
  end if;

  result_payload := jsonb_build_object(
    'session_id', session_record.id,
    'status', session_record.status,
    'question_count', session_record.question_count,
    'answered_count', session_record.answered_count,
    'correct_count', session_record.correct_count,
    'total_score', session_record.total_score,
    'xp_awarded', session_record.xp_awarded,
    'tokens_awarded', session_record.tokens_awarded,
    'reward_rate_percent', session_record.reward_rate_percent,
    'game_rules_version', session_record.game_rules_version,
    'completed_at', session_record.completed_at
  );
  if attempt_payload is not null then
    result_payload := result_payload
      || jsonb_build_object('assignment_attempt', attempt_payload);
  end if;
  return result_payload;
end;
$$;
