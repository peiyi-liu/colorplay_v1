create type public.quiz_session_status as enum ('in_progress', 'completed');
create type public.quiz_answer_status as enum ('correct', 'incorrect', 'timeout');

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.quiz_templates(id),
  client_request_id uuid not null,
  chapter_title text not null,
  status public.quiz_session_status not null default 'in_progress',
  question_count integer not null check (question_count between 1 and 10),
  answered_count integer not null default 0 check (answered_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  total_score integer not null default 0 check (total_score >= 0),
  xp_awarded integer not null default 0 check (xp_awarded = 0),
  tokens_awarded integer not null default 0 check (tokens_awarded = 0),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint quiz_sessions_user_client_request_unique
    unique (user_id, client_request_id),
  check (
    (status = 'in_progress' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create table public.quiz_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  position integer not null check (position between 1 and 10),
  question_stable_code text not null,
  question_version integer not null check (question_version > 0),
  prompt text not null,
  explanation text not null,
  frozen_options jsonb not null check (
    jsonb_typeof(frozen_options) = 'array'
    and jsonb_array_length(frozen_options) between 2 and 4
    and frozen_options::text !~ 'is_correct'
  ),
  correct_option_id uuid not null references public.question_options(id),
  started_at timestamptz,
  deadline_at timestamptz,
  unique (session_id, position),
  unique (session_id, question_id),
  check (
    (started_at is null and deadline_at is null)
    or (started_at is not null and deadline_at > started_at)
  )
);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  session_question_id uuid not null unique
    references public.quiz_session_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_option_id uuid references public.question_options(id),
  correct_option_id uuid not null references public.question_options(id),
  answer_status public.quiz_answer_status not null,
  response_ms integer not null check (response_ms >= 0),
  score_delta integer not null check (score_delta in (0, 100, 150)),
  idempotency_key uuid not null,
  answered_at timestamptz not null default clock_timestamp(),
  unique (user_id, idempotency_key),
  check (
    (answer_status = 'timeout' and selected_option_id is null and score_delta = 0)
    or (answer_status = 'incorrect' and selected_option_id is not null and score_delta = 0)
    or (answer_status = 'correct' and selected_option_id is not null and score_delta in (100, 150))
  )
);

create index quiz_sessions_user_status_idx
  on public.quiz_sessions(user_id, status, started_at desc);
create index quiz_session_questions_session_position_idx
  on public.quiz_session_questions(session_id, position);
create index quiz_answers_session_idx
  on public.quiz_answers(session_id, answered_at);
create index quiz_answers_user_idx on public.quiz_answers(user_id, answered_at);

alter table public.quiz_sessions enable row level security;
alter table public.quiz_session_questions enable row level security;
alter table public.quiz_answers enable row level security;

revoke all on public.quiz_sessions from anon, authenticated;
revoke all on public.quiz_session_questions from anon, authenticated;
revoke all on public.quiz_answers from anon, authenticated;

grant select on public.quiz_sessions to authenticated;
grant select on public.quiz_answers to authenticated;

create policy quiz_sessions_read_own on public.quiz_sessions
for select to authenticated
using (user_id = auth.uid());

create policy quiz_session_questions_read_own on public.quiz_session_questions
for select to authenticated
using (
  exists (
    select 1
    from public.quiz_sessions s
    where s.id = quiz_session_questions.session_id
      and s.user_id = auth.uid()
  )
);

create policy quiz_answers_read_own on public.quiz_answers
for select to authenticated
using (user_id = auth.uid());

create view public.quiz_session_question_state
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
  a.score_delta
from public.quiz_sessions s
join public.quiz_session_questions sq on sq.session_id = s.id
left join public.quiz_answers a on a.session_question_id = sq.id
where s.user_id = auth.uid();

revoke all on public.quiz_session_question_state from public, anon, authenticated;
grant select on public.quiz_session_question_state to authenticated;

create function public.build_quiz_session_payload(target_session_id uuid)
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

create function public.build_quiz_answer_result(target_answer_id uuid)
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

create function public.create_quiz_session(
  template_id uuid,
  client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_session_id uuid;
  new_session_id uuid;
  template_record record;
  inserted_question_count integer;
  session_started_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if template_id is null or client_request_id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_INVALID_REQUEST';
  end if;

  select s.id
  into existing_session_id
  from public.quiz_sessions s
  where s.user_id = current_user_id
    and s.client_request_id = create_quiz_session.client_request_id;

  if existing_session_id is not null then
    return public.build_quiz_session_payload(existing_session_id);
  end if;

  select t.id, t.question_count, ch.id as chapter_id, ch.title as chapter_title
  into template_record
  from public.quiz_templates t
  join public.chapters ch on ch.id = t.chapter_id
  join public.courses c on c.id = ch.course_id
  where t.id = create_quiz_session.template_id
    and t.status = 'published'
    and ch.status = 'published'
    and c.status = 'published';

  if template_record.id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_TEMPLATE_NOT_FOUND';
  end if;

  insert into public.quiz_sessions (
    user_id,
    template_id,
    client_request_id,
    chapter_title,
    question_count,
    started_at
  )
  values (
    current_user_id,
    template_record.id,
    create_quiz_session.client_request_id,
    template_record.chapter_title,
    1,
    session_started_at
  )
  on conflict on constraint quiz_sessions_user_client_request_unique do nothing
  returning id into new_session_id;

  if new_session_id is null then
    select s.id into existing_session_id
    from public.quiz_sessions s
    where s.user_id = current_user_id
      and s.client_request_id = create_quiz_session.client_request_id;
    return public.build_quiz_session_payload(existing_session_id);
  end if;

  with question_candidates as (
    select
      q.id,
      q.stable_code,
      q.version,
      q.prompt,
      q.explanation,
      random() as random_order
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    join public.sections sec on sec.id = st.section_id
    where sec.chapter_id = template_record.chapter_id
      and q.status = 'published'
      and st.status = 'published'
      and sec.status = 'published'
  ), selected_questions as (
    select *
    from question_candidates
    order by random_order
    limit template_record.question_count
  ), randomized_questions as (
    select
      selected_questions.*,
      row_number() over (order by random_order)::integer as position
    from selected_questions
  ), question_payloads as (
    select
      rq.id,
      rq.stable_code,
      rq.version,
      rq.prompt,
      rq.explanation,
      rq.position,
      jsonb_agg(
        jsonb_build_object(
          'id', qo.id,
          'key', qo.option_key,
          'text', qo.option_text,
          'sort_order', qo.sort_order
        ) order by qo.sort_order
      ) as options,
      (array_agg(qo.id order by qo.sort_order) filter (where qo.is_correct))[1]
        as correct_option_id
    from randomized_questions rq
    join public.question_options qo on qo.question_id = rq.id
    group by rq.id, rq.stable_code, rq.version, rq.prompt, rq.explanation, rq.position
  )
  insert into public.quiz_session_questions (
    session_id,
    question_id,
    position,
    question_stable_code,
    question_version,
    prompt,
    explanation,
    frozen_options,
    correct_option_id,
    started_at,
    deadline_at
  )
  select
    new_session_id,
    qp.id,
    qp.position,
    qp.stable_code,
    qp.version,
    qp.prompt,
    qp.explanation,
    qp.options,
    qp.correct_option_id,
    case when qp.position = 1 then session_started_at end,
    case when qp.position = 1 then session_started_at + interval '20 seconds' end
  from question_payloads qp;

  get diagnostics inserted_question_count = row_count;
  if inserted_question_count = 0 then
    raise exception using errcode = 'P0001', message = 'QUIZ_TEMPLATE_HAS_NO_QUESTIONS';
  end if;

  update public.quiz_sessions
  set question_count = inserted_question_count
  where id = new_session_id;

  return public.build_quiz_session_payload(new_session_id);
end;
$$;

create function public.submit_quiz_answer(
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
    submit_quiz_answer.idempotency_key,
    evaluated_at
  )
  returning id into answer_id;

  return public.build_quiz_answer_result(answer_id);
end;
$$;

create function public.activate_next_quiz_question(session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record record;
  question_record record;
  activated_at timestamptz := clock_timestamp();
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if session_id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_INVALID_REQUEST';
  end if;

  select s.id, s.status
  into session_record
  from public.quiz_sessions s
  where s.id = activate_next_quiz_question.session_id
    and s.user_id = current_user_id
  for update;

  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_NOT_FOUND';
  end if;
  if session_record.status = 'completed' then
    return public.build_quiz_session_payload(session_record.id);
  end if;

  select sq.id, sq.position, sq.started_at
  into question_record
  from public.quiz_session_questions sq
  left join public.quiz_answers a on a.session_question_id = sq.id
  where sq.session_id = session_record.id
    and a.id is null
  order by sq.position
  limit 1
  for update of sq;

  if question_record.id is null then
    return public.build_quiz_session_payload(session_record.id);
  end if;

  if question_record.started_at is null then
    if question_record.position > 1 and not exists (
      select 1
      from public.quiz_session_questions previous_question
      join public.quiz_answers previous_answer
        on previous_answer.session_question_id = previous_question.id
      where previous_question.session_id = session_record.id
        and previous_question.position = question_record.position - 1
    ) then
      raise exception using errcode = 'P0001', message = 'QUIZ_QUESTION_NOT_READY';
    end if;

    update public.quiz_session_questions
    set started_at = activated_at,
        deadline_at = activated_at + interval '20 seconds'
    where id = question_record.id;
  end if;

  return public.build_quiz_session_payload(session_record.id);
end;
$$;

create function public.finalize_quiz_session(session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record record;
  aggregate_record record;
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
      'completed_at', session_record.completed_at
    );
  end if;

  select
    count(*)::integer as answered_count,
    count(*) filter (where a.answer_status = 'correct')::integer as correct_count,
    coalesce(sum(a.score_delta), 0)::integer as total_score
  into aggregate_record
  from public.quiz_answers a
  where a.session_id = session_record.id;

  if aggregate_record.answered_count <> session_record.question_count then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_INCOMPLETE';
  end if;

  update public.quiz_sessions
  set status = 'completed',
      answered_count = aggregate_record.answered_count,
      correct_count = aggregate_record.correct_count,
      total_score = aggregate_record.total_score,
      xp_awarded = 0,
      tokens_awarded = 0,
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
    'completed_at', session_record.completed_at
  );
end;
$$;

revoke all on function public.build_quiz_session_payload(uuid)
  from public, anon, authenticated;
revoke all on function public.build_quiz_answer_result(uuid)
  from public, anon, authenticated;
revoke all on function public.create_quiz_session(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.submit_quiz_answer(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.activate_next_quiz_question(uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_quiz_session(uuid)
  from public, anon, authenticated;

grant execute on function public.create_quiz_session(uuid, uuid)
  to authenticated;
grant execute on function public.submit_quiz_answer(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.activate_next_quiz_question(uuid)
  to authenticated;
grant execute on function public.finalize_quiz_session(uuid)
  to authenticated;
