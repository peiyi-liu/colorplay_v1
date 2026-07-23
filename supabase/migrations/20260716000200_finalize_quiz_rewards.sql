alter table public.quiz_answers
  add column provisional_xp integer not null default 0
    check (provisional_xp >= 0),
  add column provisional_tokens integer not null default 0
    check (provisional_tokens >= 0);

alter table public.quiz_sessions
  drop constraint quiz_sessions_xp_awarded_check,
  drop constraint quiz_sessions_tokens_awarded_check,
  add constraint quiz_sessions_xp_awarded_nonnegative
    check (xp_awarded >= 0),
  add constraint quiz_sessions_tokens_awarded_nonnegative
    check (tokens_awarded >= 0),
  add column game_rules_version text not null default '2026-07-mvp-1'
    check (game_rules_version = '2026-07-mvp-1'),
  add column reward_rate_percent integer not null default 100
    check (reward_rate_percent in (20, 100));

create or replace view public.quiz_session_question_state
with (security_barrier = true)
as
select
  s.id as session_id,
  s.template_id,
  s.status as session_status,
  s.chapter_title,
  s.question_count,
  s.answered_count,
  s.correct_count,
  s.total_score,
  s.started_at as session_started_at,
  s.completed_at,
  sq.id as session_question_id,
  sq.position,
  sq.question_stable_code,
  sq.question_version,
  sq.prompt,
  sq.frozen_options as options,
  sq.started_at,
  sq.deadline_at,
  a.answer_status,
  a.selected_option_id,
  a.correct_option_id,
  case when a.id is null then null else sq.explanation end as explanation,
  a.response_ms,
  a.score_delta,
  s.xp_awarded,
  s.tokens_awarded,
  s.reward_rate_percent,
  s.game_rules_version
from public.quiz_sessions s
join public.quiz_session_questions sq on sq.session_id = s.id
left join public.quiz_answers a on a.session_question_id = sq.id
where s.user_id = auth.uid();

create or replace function public.build_quiz_session_payload(target_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
begin
  select jsonb_build_object(
    'session_id', s.id,
    'template_id', s.template_id,
    'status', s.status,
    'chapter_title', s.chapter_title,
    'question_count', s.question_count,
    'answered_count', count(a.id)::integer,
    'correct_count', count(a.id) filter (where a.answer_status = 'correct'),
    'total_score', coalesce(sum(a.score_delta), 0)::integer,
    'xp_awarded', s.xp_awarded,
    'tokens_awarded', s.tokens_awarded,
    'reward_rate_percent', s.reward_rate_percent,
    'game_rules_version', s.game_rules_version,
    'completed_at', s.completed_at,
    'questions', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'session_question_id', sq.id,
          'position', sq.position,
          'stable_code', sq.question_stable_code,
          'version', sq.question_version,
          'prompt', sq.prompt,
          'options', sq.frozen_options,
          'started_at', sq.started_at,
          'deadline_at', sq.deadline_at,
          'answer_status', a.answer_status,
          'selected_option_id', a.selected_option_id,
          'correct_option_id', a.correct_option_id,
          'explanation', case when a.id is null then null else sq.explanation end,
          'score_delta', a.score_delta
        ) order by sq.position
      ),
      '[]'::jsonb
    )
  )
  into payload
  from public.quiz_sessions s
  join public.quiz_session_questions sq on sq.session_id = s.id
  left join public.quiz_answers a on a.session_question_id = sq.id
  where s.id = target_session_id
    and s.user_id = auth.uid()
  group by s.id;

  if payload is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_NOT_FOUND';
  end if;

  return payload;
end;
$$;

create or replace function public.build_quiz_answer_result(target_answer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  payload jsonb;
begin
  select jsonb_build_object(
    'answer_status', a.answer_status,
    'selected_option_id', a.selected_option_id,
    'correct_option_id', a.correct_option_id,
    'correct_option_text', correct_option.value ->> 'text',
    'explanation', sq.explanation,
    'response_ms', a.response_ms,
    'score_delta', a.score_delta,
    'provisional_xp', a.provisional_xp,
    'provisional_tokens', a.provisional_tokens,
    'total_score', (
      select coalesce(sum(answer.score_delta), 0)::integer
      from public.quiz_answers answer
      where answer.session_id = a.session_id
    )
  )
  into payload
  from public.quiz_answers a
  join public.quiz_session_questions sq on sq.id = a.session_question_id
  cross join lateral jsonb_array_elements(sq.frozen_options) correct_option(value)
  where a.id = target_answer_id
    and a.user_id = auth.uid()
    and correct_option.value ->> 'id' = a.correct_option_id::text;

  if payload is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_ANSWER_NOT_FOUND';
  end if;

  return payload;
end;
$$;

create or replace function public.submit_quiz_answer(
  session_question_id uuid,
  idempotency_key uuid,
  selected_option_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_answer record;
  question_record record;
  answer_id uuid;
  evaluated_at timestamptz := clock_timestamp();
  elapsed_ms integer;
  evaluated_status public.quiz_answer_status;
  evaluated_score integer;
  evaluated_xp integer := 0;
  evaluated_tokens integer := 0;
  stored_selected_option_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if session_question_id is null or idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_INVALID_REQUEST';
  end if;

  select a.id, a.session_question_id
  into existing_answer
  from public.quiz_answers a
  where a.user_id = current_user_id
    and a.idempotency_key = submit_quiz_answer.idempotency_key;

  if existing_answer.id is not null then
    if existing_answer.session_question_id <> submit_quiz_answer.session_question_id then
      raise exception using errcode = 'P0001', message = 'QUIZ_IDEMPOTENCY_KEY_REUSED';
    end if;
    return public.build_quiz_answer_result(existing_answer.id);
  end if;

  select
    sq.id,
    sq.session_id,
    sq.position,
    sq.started_at,
    sq.deadline_at,
    sq.correct_option_id,
    sq.frozen_options,
    s.status as session_status
  into question_record
  from public.quiz_session_questions sq
  join public.quiz_sessions s on s.id = sq.session_id
  where sq.id = submit_quiz_answer.session_question_id
    and s.user_id = current_user_id
  for update of sq, s;

  if question_record.id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_QUESTION_NOT_FOUND';
  end if;
  if question_record.session_status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_NOT_IN_PROGRESS';
  end if;

  select a.id, a.session_question_id
  into existing_answer
  from public.quiz_answers a
  where a.user_id = current_user_id
    and a.idempotency_key = submit_quiz_answer.idempotency_key;

  if existing_answer.id is not null then
    if existing_answer.session_question_id <> submit_quiz_answer.session_question_id then
      raise exception using errcode = 'P0001', message = 'QUIZ_IDEMPOTENCY_KEY_REUSED';
    end if;
    return public.build_quiz_answer_result(existing_answer.id);
  end if;

  if question_record.started_at is null or question_record.deadline_at is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_QUESTION_NOT_ACTIVE';
  end if;
  if exists (
    select 1 from public.quiz_answers a
    where a.session_question_id = question_record.id
  ) then
    raise exception using errcode = 'P0001', message = 'QUIZ_QUESTION_ALREADY_ANSWERED';
  end if;

  elapsed_ms := greatest(
    0,
    floor(extract(epoch from (evaluated_at - question_record.started_at)) * 1000)::integer
  );

  if evaluated_at > question_record.deadline_at then
    evaluated_status := 'timeout';
    evaluated_score := 0;
    stored_selected_option_id := null;
  else
    if selected_option_id is null then
      raise exception using errcode = 'P0001', message = 'QUIZ_OPTION_REQUIRED';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(question_record.frozen_options) option_value
      where option_value ->> 'id' = selected_option_id::text
    ) then
      raise exception using errcode = 'P0001', message = 'QUIZ_OPTION_NOT_IN_QUESTION';
    end if;

    stored_selected_option_id := selected_option_id;
    if selected_option_id = question_record.correct_option_id then
      evaluated_status := 'correct';
      evaluated_score := 100 + case when elapsed_ms <= 5000 then 50 else 0 end;
      evaluated_xp := 50 + case when elapsed_ms <= 5000 then 25 else 0 end;
      evaluated_tokens := 15 + case when elapsed_ms <= 5000 then 10 else 0 end;
    else
      evaluated_status := 'incorrect';
      evaluated_score := 0;
    end if;
  end if;

  insert into public.quiz_answers (
    session_id,
    session_question_id,
    user_id,
    selected_option_id,
    correct_option_id,
    answer_status,
    response_ms,
    score_delta,
    provisional_xp,
    provisional_tokens,
    idempotency_key,
    answered_at
  ) values (
    question_record.session_id,
    question_record.id,
    current_user_id,
    stored_selected_option_id,
    question_record.correct_option_id,
    evaluated_status,
    elapsed_ms,
    evaluated_score,
    evaluated_xp,
    evaluated_tokens,
    submit_quiz_answer.idempotency_key,
    evaluated_at
  )
  returning id into answer_id;

  return public.build_quiz_answer_result(answer_id);
end;
$$;

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
    return jsonb_build_object(
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

  return jsonb_build_object(
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
end;
$$;
