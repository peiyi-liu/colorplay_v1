-- Remediation lets a student retry the questions behind their open mistakes.
-- A remediation session freezes the current published version of each open
-- mistake's question (cap 10, deterministic order), stamps rules version
-- 2026-07-progress-1, and finalizes through the shared trusted path with
-- fixed 20% XP (15 fast / 10 slow per correct answer), zero Tokens, and no
-- daily-quota interaction. Correct answers resolve the linked mistakes via
-- append-only remediation_attempts; original sessions, answers, and scores
-- are never touched. finalize_quiz_session is replaced forward from
-- 20260718000400.

create type public.remediation_result as enum ('resolved', 'unresolved');

create table public.remediation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mistake_item_id uuid not null
    references public.mistake_items(id) on delete cascade,
  session_id uuid not null
    references public.quiz_sessions(id) on delete cascade,
  answer_id uuid not null references public.quiz_answers(id),
  result public.remediation_result not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint remediation_attempts_item_session_unique
    unique (mistake_item_id, session_id)
);

alter table public.remediation_attempts enable row level security;

grant select on public.remediation_attempts to authenticated;

create policy remediation_attempts_own_select on public.remediation_attempts
for select to authenticated
using (user_id = (select auth.uid()));

-- Remediation sessions carry the progress rules version.
alter table public.quiz_sessions
  drop constraint quiz_sessions_game_rules_version_check;
alter table public.quiz_sessions
  add constraint quiz_sessions_game_rules_version_check
  check (game_rules_version in ('2026-07-mvp-1', '2026-07-progress-1'));

create function public.start_remediation_session(
  p_subtopic_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_session record;
  template_record record;
  new_session_id uuid;
  frozen_count integer;
  session_started_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'REMEDIATION_INVALID_REQUEST';
  end if;

  select s.id, s.purpose
  into existing_session
  from public.quiz_sessions s
  where s.user_id = current_user_id
    and s.client_request_id = p_request_id;
  if existing_session.id is not null then
    if existing_session.purpose <> 'remediation' then
      raise exception using errcode = 'P0001', message = 'REMEDIATION_INVALID_REQUEST';
    end if;
    return public.build_quiz_session_payload(existing_session.id);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_subtopic_id::text || current_user_id::text, 43)
  );

  select least(count(*), 10)::integer
  into frozen_count
  from public.mistake_items item
  join public.questions question on question.id = item.question_id
  join public.subtopics st on st.id = question.subtopic_id
  join public.sections s on s.id = st.section_id
  join public.chapters ch on ch.id = s.chapter_id
  join public.courses c on c.id = ch.course_id
  where item.user_id = current_user_id
    and item.status in ('open', 'reopened')
    and st.id = p_subtopic_id
    and question.status = 'published'
    and st.status = 'published'
    and s.status = 'published'
    and ch.status = 'published'
    and c.status = 'published';
  if frozen_count = 0 then
    raise exception using errcode = 'P0001', message = 'REMEDIATION_NOTHING_OPEN';
  end if;

  select template.id, chapter.title as chapter_title
  into template_record
  from public.subtopics st
  join public.sections section on section.id = st.section_id
  join public.chapters chapter on chapter.id = section.chapter_id
  join public.quiz_templates template on template.chapter_id = chapter.id
  where st.id = p_subtopic_id
    and template.status = 'published';
  if template_record.id is null then
    raise exception using errcode = 'P0001', message = 'REMEDIATION_UNAVAILABLE';
  end if;

  insert into public.quiz_sessions (
    user_id, template_id, client_request_id, chapter_title, question_count,
    purpose, game_rules_version, started_at
  ) values (
    current_user_id, template_record.id, p_request_id,
    template_record.chapter_title, frozen_count, 'remediation',
    '2026-07-progress-1', session_started_at
  )
  returning id into new_session_id;

  insert into public.quiz_session_questions (
    session_id, question_id, position, question_stable_code, question_version,
    prompt, explanation, frozen_options, correct_option_id, started_at,
    deadline_at
  )
  with remediation_targets as (
    select
      question.id as question_id,
      question.stable_code,
      question.version,
      question.prompt,
      question.explanation,
      row_number() over (
        order by item.first_wrong_at, question.stable_code
      )::integer as position
    from public.mistake_items item
    join public.questions question on question.id = item.question_id
    join public.subtopics st on st.id = question.subtopic_id
    join public.sections s on s.id = st.section_id
    join public.chapters ch on ch.id = s.chapter_id
    join public.courses c on c.id = ch.course_id
    where item.user_id = current_user_id
      and item.status in ('open', 'reopened')
      and st.id = p_subtopic_id
      and question.status = 'published'
      and st.status = 'published'
      and s.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
    order by item.first_wrong_at, question.stable_code
    limit 10
  )
  select
    new_session_id,
    target.question_id,
    target.position,
    target.stable_code,
    target.version,
    target.prompt,
    target.explanation,
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'key', o.option_key,
          'text', o.option_text,
          'sort_order', o.sort_order
        ) order by o.sort_order
      )
      from public.question_options o
      where o.question_id = target.question_id
    ),
    (
      select o.id
      from public.question_options o
      where o.question_id = target.question_id and o.is_correct
    ),
    case when target.position = 1 then session_started_at end,
    case when target.position = 1
      then session_started_at + interval '20 seconds'
    end
  from remediation_targets target;

  return public.build_quiz_session_payload(new_session_id);
end;
$$;

revoke all on function public.start_remediation_session(uuid, uuid)
from public, anon;
grant execute on function public.start_remediation_session(uuid, uuid)
to authenticated;

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

  if session_record.purpose = 'remediation' then
    -- Fixed 20% XP, no Tokens, and no interaction with the daily quota.
    reward_rate := 20;
    formal_xp := floor(aggregate_record.provisional_xp * 20 / 100.0)::integer;
    formal_tokens := 0;
  else
    select count(*)::integer
    into previous_completed
    from public.quiz_sessions prior
    where prior.user_id = current_user_id
      and prior.template_id = session_record.template_id
      and prior.status = 'completed'
      and prior.purpose <> 'remediation'
      and (prior.completed_at at time zone 'Asia/Taipei')::date =
        (clock_timestamp() at time zone 'Asia/Taipei')::date;

    reward_rate := case when previous_completed < 3 then 100 else 20 end;
    formal_xp := floor(aggregate_record.provisional_xp * reward_rate / 100.0)::integer;
    formal_tokens := case when reward_rate = 100
      then aggregate_record.provisional_tokens
      else 0
    end;
  end if;

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

  if session_record.purpose = 'remediation' then
    insert into public.remediation_attempts (
      user_id, mistake_item_id, session_id, answer_id, result
    )
    select
      current_user_id,
      item.id,
      session_record.id,
      answer.id,
      case when answer.answer_status = 'correct'
        then 'resolved'::public.remediation_result
        else 'unresolved'::public.remediation_result
      end
    from public.quiz_session_questions question
    join public.quiz_answers answer
      on answer.session_question_id = question.id
    join public.mistake_items item
      on item.user_id = current_user_id
      and item.question_id = question.question_id
    where question.session_id = session_record.id
      and item.status in ('open', 'reopened')
    on conflict on constraint remediation_attempts_item_session_unique
    do nothing;

    update public.mistake_items item
    set status = 'resolved',
        last_event_at = clock_timestamp()
    from public.quiz_session_questions question
    join public.quiz_answers answer
      on answer.session_question_id = question.id
    where question.session_id = session_record.id
      and answer.answer_status = 'correct'
      and item.user_id = current_user_id
      and item.question_id = question.question_id
      and item.status in ('open', 'reopened');
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
