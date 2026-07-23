-- GGAME 課後任務實戰（5 階精熟）：不限時、同題多次嘗試、答錯鎖選項、
-- 逐層提示。正解與進度全由伺服器裁定；本模式為練習性質，不發 XP/Token
--（獎勵政策由 spec/05 finalize-only 規則管轄，擴充需另行 pin 規格）。

create table public.mastery_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete restrict,
  question_ids uuid[] not null check (array_length(question_ids, 1) between 1 and 5),
  question_versions integer[] not null,
  position integer not null default 1 check (position >= 1),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  rules_version text not null default '2026-07-mastery-1',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index mastery_sessions_active_unique
  on public.mastery_sessions(user_id, chapter_id)
  where status = 'in_progress';

create table public.mastery_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mastery_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_option_id uuid not null
    references public.question_options(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (session_id, question_id, selected_option_id)
);

create index mastery_attempts_session_question_idx
  on public.mastery_attempts(session_id, question_id);

create table public.mastery_hint_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mastery_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  hint_level integer not null check (hint_level between 1 and 3),
  created_at timestamptz not null default now(),
  unique (session_id, question_id, hint_level)
);

alter table public.mastery_sessions enable row level security;
alter table public.mastery_attempts enable row level security;
alter table public.mastery_hint_events enable row level security;

revoke all on public.mastery_sessions from anon, authenticated;
revoke all on public.mastery_attempts from anon, authenticated;
revoke all on public.mastery_hint_events from anon, authenticated;
grant select on public.mastery_sessions to authenticated;
grant select on public.mastery_attempts to authenticated;
grant select on public.mastery_hint_events to authenticated;

create policy mastery_sessions_read_own on public.mastery_sessions
for select to authenticated
using (user_id = auth.uid());

create policy mastery_attempts_read_own on public.mastery_attempts
for select to authenticated
using (
  exists (
    select 1
    from public.mastery_sessions ms
    where ms.id = session_id and ms.user_id = auth.uid()
  )
);

create policy mastery_hint_events_read_own on public.mastery_hint_events
for select to authenticated
using (
  exists (
    select 1
    from public.mastery_sessions ms
    where ms.id = session_id and ms.user_id = auth.uid()
  )
);

create function public.start_mastery_session(p_chapter_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  existing_id uuid;
  selected_ids uuid[];
  selected_versions integer[];
  new_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  perform 1
  from public.chapters
  where id = p_chapter_id and status = 'published';

  if not found then
    raise exception using errcode = 'P0001', message = 'MASTERY_CHAPTER_NOT_FOUND';
  end if;

  select id into existing_id
  from public.mastery_sessions
  where user_id = actor_id
    and chapter_id = p_chapter_id
    and status = 'in_progress';

  if existing_id is not null then
    return existing_id;
  end if;

  select
    array_agg(picked.id order by picked.stable_code),
    array_agg(picked.version order by picked.stable_code)
  into selected_ids, selected_versions
  from (
    select q.id, q.stable_code, q.version
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    join public.sections se on se.id = st.section_id
    where se.chapter_id = p_chapter_id and q.status = 'published'
    order by q.stable_code
    limit 5
  ) picked;

  if selected_ids is null then
    raise exception using errcode = 'P0001', message = 'MASTERY_NO_QUESTIONS';
  end if;

  insert into public.mastery_sessions (
    user_id, chapter_id, question_ids, question_versions
  )
  values (actor_id, p_chapter_id, selected_ids, selected_versions)
  returning id into new_id;

  return new_id;
end;
$$;

create function public.get_mastery_state(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  session_row public.mastery_sessions%rowtype;
  chapter_title text;
  current_question_id uuid;
  question_payload jsonb;
  stages jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select * into session_row
  from public.mastery_sessions
  where id = p_session_id and user_id = auth.uid();

  if not found then
    raise exception using errcode = 'P0001', message = 'MASTERY_NOT_FOUND';
  end if;

  select c.title into chapter_title
  from public.chapters c
  where c.id = session_row.chapter_id;

  select jsonb_agg(
    jsonb_build_object(
      'position', stage.position,
      'completed', exists (
        select 1
        from public.mastery_attempts a
        where a.session_id = session_row.id
          and a.question_id = stage.question_id
          and a.is_correct
      ),
      'attempts', (
        select count(*)
        from public.mastery_attempts a
        where a.session_id = session_row.id
          and a.question_id = stage.question_id
      )
    )
    order by stage.position
  )
  into stages
  from unnest(session_row.question_ids)
    with ordinality as stage(question_id, position);

  if session_row.status = 'in_progress' then
    current_question_id :=
      (session_row.question_ids)[session_row.position];

    select jsonb_build_object(
      'question_id', q.id,
      'prompt', q.prompt,
      'subtopic_title', st.title,
      'options', (
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'key', o.option_key,
            'text', o.option_text,
            'locked', exists (
              select 1
              from public.mastery_attempts a
              where a.session_id = session_row.id
                and a.question_id = q.id
                and a.selected_option_id = o.id
            )
          )
          order by o.sort_order
        )
        from public.question_options o
        where o.question_id = q.id
      ),
      'wrong_attempts', (
        select count(*)
        from public.mastery_attempts a
        where a.session_id = session_row.id
          and a.question_id = q.id
          and not a.is_correct
      )
    )
    into question_payload
    from public.questions q
    join public.subtopics st on st.id = q.subtopic_id
    where q.id = current_question_id;
  end if;

  return jsonb_build_object(
    'session_id', session_row.id,
    'chapter_id', session_row.chapter_id,
    'chapter_title', chapter_title,
    'status', session_row.status,
    'position', session_row.position,
    'question_count', array_length(session_row.question_ids, 1),
    'rules_version', session_row.rules_version,
    'stages', coalesce(stages, '[]'::jsonb),
    'question', question_payload
  );
end;
$$;

create function public.submit_mastery_attempt(
  p_session_id uuid,
  p_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  session_row public.mastery_sessions%rowtype;
  current_question_id uuid;
  option_correct boolean;
  next_attempt integer;
  locked_ids jsonb;
  question_explanation text;
  correct_option uuid;
  new_status text;
  new_position integer;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select * into session_row
  from public.mastery_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MASTERY_NOT_FOUND';
  end if;

  if session_row.status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'MASTERY_COMPLETED';
  end if;

  current_question_id := (session_row.question_ids)[session_row.position];

  select o.is_correct into option_correct
  from public.question_options o
  where o.id = p_option_id and o.question_id = current_question_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'MASTERY_OPTION_INVALID';
  end if;

  if exists (
    select 1
    from public.mastery_attempts a
    where a.session_id = session_row.id
      and a.question_id = current_question_id
      and a.selected_option_id = p_option_id
  ) then
    raise exception using errcode = 'P0001', message = 'MASTERY_OPTION_LOCKED';
  end if;

  select count(*) + 1 into next_attempt
  from public.mastery_attempts a
  where a.session_id = session_row.id
    and a.question_id = current_question_id;

  insert into public.mastery_attempts (
    session_id, question_id, selected_option_id, attempt_number, is_correct
  )
  values (
    session_row.id, current_question_id, p_option_id, next_attempt,
    option_correct
  );

  if not option_correct then
    select jsonb_agg(a.selected_option_id)
    into locked_ids
    from public.mastery_attempts a
    where a.session_id = session_row.id
      and a.question_id = current_question_id;

    return jsonb_build_object(
      'is_correct', false,
      'locked_option_ids', coalesce(locked_ids, '[]'::jsonb)
    );
  end if;

  select q.explanation into question_explanation
  from public.questions q
  where q.id = current_question_id;

  select o.id into correct_option
  from public.question_options o
  where o.question_id = current_question_id and o.is_correct
  limit 1;

  if session_row.position >= array_length(session_row.question_ids, 1) then
    new_status := 'completed';
    new_position := session_row.position;
    update public.mastery_sessions
    set status = 'completed', completed_at = now()
    where id = session_row.id;
  else
    new_status := 'in_progress';
    new_position := session_row.position + 1;
    update public.mastery_sessions
    set position = new_position
    where id = session_row.id;
  end if;

  return jsonb_build_object(
    'is_correct', true,
    'explanation', question_explanation,
    'correct_option_id', correct_option,
    'status', new_status,
    'position', new_position
  );
end;
$$;

create function public.get_mastery_hint(
  p_session_id uuid,
  p_hint_level integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  session_row public.mastery_sessions%rowtype;
  current_question_id uuid;
  current_version integer;
  wrong_attempts integer;
  hint_content text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  if p_hint_level not between 1 and 3 then
    raise exception using errcode = 'P0001', message = 'MASTERY_HINT_INVALID';
  end if;

  select * into session_row
  from public.mastery_sessions
  where id = p_session_id and user_id = auth.uid();

  if not found then
    raise exception using errcode = 'P0001', message = 'MASTERY_NOT_FOUND';
  end if;

  if session_row.status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'MASTERY_COMPLETED';
  end if;

  current_question_id := (session_row.question_ids)[session_row.position];
  current_version := (session_row.question_versions)[session_row.position];

  select count(*) into wrong_attempts
  from public.mastery_attempts a
  where a.session_id = session_row.id
    and a.question_id = current_question_id
    and not a.is_correct;

  -- GGAME 鷹架：第 N 層提示需要至少 N 次答錯後解鎖。
  if p_hint_level > wrong_attempts then
    raise exception using errcode = 'P0001', message = 'MASTERY_HINT_LOCKED';
  end if;

  select h.content into hint_content
  from public.question_hints h
  where h.question_id = current_question_id
    and h.question_version = current_version
    and h.hint_level = p_hint_level;

  if hint_content is null then
    raise exception using errcode = 'P0001', message = 'MASTERY_HINT_UNAVAILABLE';
  end if;

  insert into public.mastery_hint_events (session_id, question_id, hint_level)
  values (session_row.id, current_question_id, p_hint_level)
  on conflict (session_id, question_id, hint_level) do nothing;

  return jsonb_build_object(
    'hint_level', p_hint_level,
    'content', hint_content
  );
end;
$$;

revoke all on function public.start_mastery_session(uuid)
from public, anon, authenticated;
revoke all on function public.get_mastery_state(uuid)
from public, anon, authenticated;
revoke all on function public.submit_mastery_attempt(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.get_mastery_hint(uuid, integer)
from public, anon, authenticated;

grant execute on function public.start_mastery_session(uuid) to authenticated;
grant execute on function public.get_mastery_state(uuid) to authenticated;
grant execute on function public.submit_mastery_attempt(uuid, uuid) to authenticated;
grant execute on function public.get_mastery_hint(uuid, integer) to authenticated;
