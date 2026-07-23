create type public.live_session_state as enum (
  'draft',
  'lobby',
  'question_open',
  'question_feedback',
  'completed',
  'cancelled'
);
create type public.live_participant_status as enum ('active', 'left', 'removed');

create table public.live_activities (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (
    title = btrim(title)
    and char_length(title) between 1 and 120
  ),
  quiz_template_id uuid not null references public.quiz_templates(id),
  question_time_limit_seconds integer not null default 20 check (
    question_time_limit_seconds between 5 and 120
  ),
  status text not null default 'active' check (status in ('active', 'archived')),
  rules_version text not null default '2026-07-live-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  live_activity_id uuid not null references public.live_activities(id) on delete restrict,
  host_teacher_id uuid not null references public.profiles(id) on delete restrict,
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  assignment_id uuid references public.assignments(id),
  state public.live_session_state not null default 'draft',
  join_code_hash bytea not null check (octet_length(join_code_hash) = 32),
  join_code_version integer not null default 1 check (join_code_version > 0),
  current_position integer not null default 0 check (current_position >= 0),
  state_version integer not null default 1 check (state_version > 0),
  question_count integer not null default 0 check (question_count >= 0),
  opened_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  rules_version text not null default '2026-07-live-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.live_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.live_participant_status not null default 'active',
  score integer not null default 0 check (score >= 0),
  final_rank integer check (final_rank > 0),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  constraint live_participants_session_user_unique unique (session_id, user_id)
);

create table public.live_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  position integer not null check (position > 0),
  question_stable_code text not null,
  question_version integer not null check (question_version > 0),
  prompt text not null,
  public_options jsonb not null,
  correct_option_id uuid not null,
  explanation text,
  opened_at timestamptz,
  deadline_at timestamptz,
  closed_at timestamptz,
  constraint live_session_questions_session_position_unique unique (
    session_id,
    "position"
  )
);

create table public.live_answers (
  id uuid primary key default gen_random_uuid(),
  session_question_id uuid not null
    references public.live_session_questions(id) on delete cascade,
  participant_id uuid not null
    references public.live_participants(id) on delete cascade,
  selected_option_id uuid,
  answer_status public.quiz_answer_status not null,
  response_ms integer check (response_ms >= 0),
  score_delta integer not null default 0 check (score_delta >= 0),
  idempotency_key uuid not null,
  submitted_at timestamptz not null default clock_timestamp(),
  constraint live_answers_question_participant_unique unique (
    session_question_id,
    participant_id
  ),
  constraint live_answers_participant_idempotency_unique unique (
    participant_id,
    idempotency_key
  ),
  constraint live_answers_timeout_shape_check check (
    (answer_status = 'timeout' and selected_option_id is null and score_delta = 0)
    or (answer_status <> 'timeout' and selected_option_id is not null)
  )
);

alter table public.assignments
add constraint assignments_live_activity_fk
foreign key (live_activity_id) references public.live_activities(id);

alter table public.assignment_attempts
add constraint assignment_attempts_live_session_fk
foreign key (live_session_id) references public.live_sessions(id);

create index live_activities_owner_idx
on public.live_activities(owner_teacher_id, status);

create index live_sessions_host_idx
on public.live_sessions(host_teacher_id, state);

create index live_sessions_classroom_idx
on public.live_sessions(classroom_id, state);

create index live_sessions_state_version_idx
on public.live_sessions(id, state_version);

create unique index live_sessions_join_code_hash_unique
on public.live_sessions(join_code_hash)
where state in ('draft', 'lobby', 'question_open', 'question_feedback');

create index live_participants_user_idx
on public.live_participants(user_id, session_id);

create index live_session_questions_session_idx
on public.live_session_questions(session_id, "position");

create index live_answers_participant_idx
on public.live_answers(participant_id);

create or replace function public.is_live_session_host(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.live_sessions live_session
    where live_session.id = p_session_id
      and live_session.host_teacher_id = (select auth.uid())
  );
$$;

create or replace function public.is_active_live_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.user_id = (select auth.uid())
      and participant.status = 'active'
  );
$$;

revoke all on function public.is_live_session_host(uuid) from public, anon;
revoke all on function public.is_active_live_participant(uuid) from public, anon;
grant execute on function public.is_live_session_host(uuid) to authenticated;
grant execute on function public.is_active_live_participant(uuid) to authenticated;

alter table public.live_activities enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_participants enable row level security;
alter table public.live_session_questions enable row level security;
alter table public.live_answers enable row level security;

revoke all on public.live_activities,
public.live_sessions,
public.live_participants,
public.live_session_questions,
public.live_answers
from anon, authenticated;

grant select on public.live_activities to authenticated;
grant select (
  id,
  live_activity_id,
  host_teacher_id,
  classroom_id,
  assignment_id,
  state,
  join_code_version,
  current_position,
  state_version,
  question_count,
  opened_at,
  completed_at,
  cancelled_at,
  rules_version,
  created_at,
  updated_at
) on public.live_sessions to authenticated;
grant select on public.live_participants to authenticated;
grant select (
  id,
  session_id,
  "position",
  question_stable_code,
  question_version,
  prompt,
  public_options,
  opened_at,
  deadline_at,
  closed_at
) on public.live_session_questions to authenticated;
grant select on public.live_answers to authenticated;

create policy live_activities_owner_select
on public.live_activities
for select
to authenticated
using (owner_teacher_id = (select auth.uid()));

create policy live_sessions_host_select
on public.live_sessions
for select
to authenticated
using (host_teacher_id = (select auth.uid()));

create policy live_sessions_participant_select
on public.live_sessions
for select
to authenticated
using (public.is_active_live_participant(id));

create policy live_participants_self_select
on public.live_participants
for select
to authenticated
using (user_id = (select auth.uid()));

create policy live_participants_host_select
on public.live_participants
for select
to authenticated
using (public.is_live_session_host(session_id));

create policy live_session_questions_member_select
on public.live_session_questions
for select
to authenticated
using (
  public.is_live_session_host(session_id)
  or public.is_active_live_participant(session_id)
);

create policy live_answers_self_select
on public.live_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.live_participants participant
    where participant.id = participant_id
      and participant.user_id = (select auth.uid())
  )
);
