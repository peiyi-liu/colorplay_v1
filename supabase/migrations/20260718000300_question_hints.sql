-- Tiered hints are authored, versioned content served one level at a time
-- through a trusted command. Hint rows are never directly selectable; the
-- command verifies ownership of the active session question, enforces the
-- 1→2→3 sequence, records one event per granted level, and refuses to invent
-- content for missing levels. Hints carry no score or reward effect.

create table public.question_hints (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  question_version integer not null check (question_version > 0),
  hint_level integer not null check (hint_level between 1 and 3),
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint question_hints_question_version_level_unique
    unique (question_id, question_version, hint_level)
);

create table public.hint_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_question_id uuid not null
    references public.quiz_session_questions(id) on delete cascade,
  hint_level integer not null check (hint_level between 1 and 3),
  question_version integer not null check (question_version > 0),
  served_content text not null,
  created_at timestamptz not null default now(),
  constraint hint_events_user_question_level_unique
    unique (user_id, session_question_id, hint_level)
);

alter table public.question_hints enable row level security;
alter table public.hint_events enable row level security;

grant select on public.hint_events to authenticated;

create policy hint_events_own_select on public.hint_events
for select to authenticated
using (user_id = (select auth.uid()));

create function public.request_question_hint(
  p_session_question_id uuid,
  p_hint_level integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  question_record public.quiz_session_questions;
  granted_levels integer;
  existing_event public.hint_events;
  hint_record public.question_hints;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if p_hint_level is null or p_hint_level < 1 or p_hint_level > 3 then
    raise exception using errcode = 'P0001', message = 'HINT_INVALID_REQUEST';
  end if;

  select question.* into question_record
  from public.quiz_session_questions question
  join public.quiz_sessions session on session.id = question.session_id
  where question.id = p_session_question_id
    and session.user_id = current_user_id
    and session.status = 'in_progress';
  if question_record.id is null then
    raise exception using errcode = 'P0001', message = 'HINT_NOT_FOUND';
  end if;

  select event.* into existing_event
  from public.hint_events event
  where event.user_id = current_user_id
    and event.session_question_id = question_record.id
    and event.hint_level = p_hint_level;
  if existing_event.id is not null then
    return jsonb_build_object(
      'hint_level', existing_event.hint_level,
      'content', existing_event.served_content,
      'question_version', existing_event.question_version
    );
  end if;

  if exists (
    select 1
    from public.quiz_answers answer
    where answer.session_question_id = question_record.id
  ) then
    raise exception using errcode = 'P0001', message = 'HINT_CLOSED';
  end if;

  select count(*)::integer into granted_levels
  from public.hint_events event
  where event.user_id = current_user_id
    and event.session_question_id = question_record.id;
  if p_hint_level <> granted_levels + 1 then
    raise exception using errcode = 'P0001', message = 'HINT_SEQUENCE';
  end if;

  select hint.* into hint_record
  from public.question_hints hint
  where hint.question_id = question_record.question_id
    and hint.question_version = question_record.question_version
    and hint.hint_level = p_hint_level;
  if hint_record.id is null then
    raise exception using errcode = 'P0001', message = 'HINT_UNAVAILABLE';
  end if;

  insert into public.hint_events (
    user_id, session_question_id, hint_level, question_version, served_content
  )
  values (
    current_user_id, question_record.id, p_hint_level,
    question_record.question_version, hint_record.content
  );

  return jsonb_build_object(
    'hint_level', p_hint_level,
    'content', hint_record.content,
    'question_version', question_record.question_version
  );
end;
$$;

revoke all on function public.request_question_hint(uuid, integer)
from public, anon;
grant execute on function public.request_question_hint(uuid, integer)
to authenticated;
