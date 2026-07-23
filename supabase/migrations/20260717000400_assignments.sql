create type public.assignment_status as enum (
  'draft',
  'published',
  'paused',
  'archived'
);
create type public.assignment_activity_type as enum (
  'quiz_template',
  'live_activity'
);
create type public.assignment_attempt_status as enum (
  'in_progress',
  'completed',
  'expired',
  'abandoned'
);
create type public.quiz_session_purpose as enum (
  'practice',
  'assignment',
  'remediation'
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  owner_teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (
    title = btrim(title)
    and char_length(title) between 1 and 120
  ),
  activity_type public.assignment_activity_type not null,
  quiz_template_id uuid references public.quiz_templates(id),
  -- The live_activities table arrives with the Live schema migration; the
  -- foreign key for this column is added there to keep migrations additive.
  live_activity_id uuid,
  available_from timestamptz,
  deadline_at timestamptz,
  attempt_limit integer check (attempt_limit > 0),
  passing_rule jsonb not null check (
    passing_rule ->> 'rule' = 'score_at_least'
    and (passing_rule ->> 'threshold') ~ '^[0-9]+$'
  ),
  status public.assignment_status not null default 'draft',
  rules_version text not null default '2026-07-mvp-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_activity_reference_check check (
    (
      activity_type = 'quiz_template'
      and quiz_template_id is not null
      and live_activity_id is null
    )
    or (
      activity_type = 'live_activity'
      and live_activity_id is not null
      and quiz_template_id is null
    )
  ),
  constraint assignments_availability_window_check check (
    available_from is null
    or deadline_at is null
    or available_from < deadline_at
  )
);

create table public.assignment_targets (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (assignment_id, user_id)
);

create table public.assignment_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  quiz_session_id uuid references public.quiz_sessions(id),
  -- The live_sessions foreign key is added by the Live schema migration.
  live_session_id uuid,
  status public.assignment_attempt_status not null default 'in_progress',
  passed boolean,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint assignment_attempts_unique_attempt_number unique (
    assignment_id,
    user_id,
    attempt_number
  ),
  constraint assignment_attempts_session_reference_check check (
    num_nonnulls(quiz_session_id, live_session_id) <= 1
  ),
  constraint assignment_attempts_completion_check check (
    (status = 'completed') = (completed_at is not null)
  )
);

alter table public.quiz_sessions
add column purpose public.quiz_session_purpose not null default 'practice',
add column assignment_attempt_id uuid references public.assignment_attempts(id);

create index assignments_classroom_status_deadline_idx
on public.assignments(classroom_id, status, deadline_at);

create index assignments_owner_teacher_id_idx
on public.assignments(owner_teacher_id);

create index assignment_targets_user_id_idx
on public.assignment_targets(user_id);

create index assignment_attempts_user_id_idx
on public.assignment_attempts(user_id, assignment_id);

create unique index assignment_attempts_quiz_session_unique
on public.assignment_attempts(quiz_session_id)
where quiz_session_id is not null;

create unique index assignment_attempts_live_session_unique
on public.assignment_attempts(live_session_id)
where live_session_id is not null;

create index quiz_sessions_assignment_attempt_idx
on public.quiz_sessions(assignment_attempt_id)
where assignment_attempt_id is not null;

create or replace function public.assert_assignment_owner_is_teacher()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = new.owner_teacher_id
      and profile.role = 'teacher'
  ) then
    raise exception using
      errcode = '23514',
      message = 'ASSIGNMENT_OWNER_MUST_BE_TEACHER';
  end if;
  return new;
end;
$$;

revoke all on function public.assert_assignment_owner_is_teacher() from public, anon, authenticated;

create trigger assignments_owner_role_check
before insert or update of owner_teacher_id on public.assignments
for each row
execute function public.assert_assignment_owner_is_teacher();

create or replace function public.is_assignment_owner(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.assignments as assignment
    where assignment.id = p_assignment_id
      and assignment.owner_teacher_id = (select auth.uid())
  );
$$;

create or replace function public.is_assignment_target(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.assignment_targets as target
    where target.assignment_id = p_assignment_id
      and target.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_assignment_owner(uuid) from public, anon;
revoke all on function public.is_assignment_target(uuid) from public, anon;
grant execute on function public.is_assignment_owner(uuid) to authenticated;
grant execute on function public.is_assignment_target(uuid) to authenticated;

alter table public.assignments enable row level security;
alter table public.assignment_targets enable row level security;
alter table public.assignment_attempts enable row level security;

revoke all on public.assignments,
public.assignment_targets,
public.assignment_attempts
from anon, authenticated;

grant select on public.assignments to authenticated;
grant select on public.assignment_targets to authenticated;
grant select on public.assignment_attempts to authenticated;

create policy assignments_owner_select
on public.assignments
for select
to authenticated
using (owner_teacher_id = (select auth.uid()));

create policy assignments_target_select
on public.assignments
for select
to authenticated
using (
  status <> 'draft'
  and public.is_assignment_target(id)
);

create policy assignment_targets_self_select
on public.assignment_targets
for select
to authenticated
using (user_id = (select auth.uid()));

create policy assignment_targets_owner_select
on public.assignment_targets
for select
to authenticated
using (public.is_assignment_owner(assignment_id));

create policy assignment_attempts_self_select
on public.assignment_attempts
for select
to authenticated
using (user_id = (select auth.uid()));

create policy assignment_attempts_owner_select
on public.assignment_attempts
for select
to authenticated
using (public.is_assignment_owner(assignment_id));
