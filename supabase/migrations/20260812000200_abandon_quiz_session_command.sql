alter table public.quiz_sessions
add column abandoned_at timestamptz;

alter table public.quiz_sessions
drop constraint quiz_sessions_check;

alter table public.quiz_sessions
add constraint quiz_sessions_terminal_state_check check (
  (
    status = 'in_progress'
    and completed_at is null
    and abandoned_at is null
  )
  or (
    status = 'completed'
    and completed_at is not null
    and abandoned_at is null
  )
  or (
    status = 'abandoned'
    and completed_at is null
    and abandoned_at is not null
  )
);

create function public.guard_quiz_session_terminal_status()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status in ('completed', 'abandoned') and new.status <> old.status then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_NOT_ACTIVE';
  end if;
  return new;
end;
$$;

create trigger guard_quiz_session_terminal_status
before update of status on public.quiz_sessions
for each row execute function public.guard_quiz_session_terminal_status();

create function public.abandon_quiz_session(session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  session_record public.quiz_sessions;
begin
  if current_user_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if session_id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_INVALID_REQUEST';
  end if;

  select session.*
  into session_record
  from public.quiz_sessions session
  where session.id = abandon_quiz_session.session_id
    and session.user_id = current_user_id
  for update;

  if session_record.id is null then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_NOT_FOUND';
  end if;

  if session_record.status = 'completed' then
    raise exception using errcode = 'P0001', message = 'QUIZ_SESSION_NOT_ACTIVE';
  end if;

  if session_record.status = 'in_progress' then
    update public.quiz_sessions
    set status = 'abandoned',
        abandoned_at = clock_timestamp()
    where id = session_record.id
    returning * into session_record;

    if session_record.assignment_attempt_id is not null then
      update public.assignment_attempts
      set status = 'abandoned',
          passed = null,
          completed_at = null
      where id = session_record.assignment_attempt_id
        and user_id = current_user_id
        and status = 'in_progress';
    end if;
  end if;

  return jsonb_build_object(
    'session_id', session_record.id,
    'status', session_record.status
  );
end;
$$;

revoke all on function public.guard_quiz_session_terminal_status() from public;
revoke all on function public.abandon_quiz_session(uuid) from public, anon;
grant execute on function public.abandon_quiz_session(uuid) to authenticated;
