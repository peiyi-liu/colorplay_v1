-- Published content history. Every publish of a semantic change snapshots
-- the frozen payload (with hash) into content_versions and appends to the
-- append-only content_publication_events log. History is teacher-readable
-- and only trusted commands write it; historical sessions keep reading their
-- frozen versions and are never rewritten from current rows.

create type public.versioned_content_type as enum ('question', 'review_card');

create type public.publication_event_type as enum ('publish', 'archive');

create table public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_type public.versioned_content_type not null,
  content_id uuid not null,
  version integer not null check (version > 0),
  frozen_payload jsonb not null,
  payload_hash text not null check (char_length(payload_hash) between 8 and 128),
  status public.content_status not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  constraint content_versions_identity_unique
    unique (content_type, content_id, version)
);

create table public.content_publication_events (
  id uuid primary key default gen_random_uuid(),
  content_type public.versioned_content_type not null,
  content_id uuid not null,
  version integer not null check (version > 0),
  event_type public.publication_event_type not null,
  actor_id uuid not null references public.profiles(id),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);

create index content_versions_content_idx
  on public.content_versions (content_type, content_id, version desc);
create index content_publication_events_content_idx
  on public.content_publication_events (content_type, content_id, created_at);

alter table public.content_versions enable row level security;
alter table public.content_publication_events enable row level security;

grant select on public.content_versions to authenticated;
grant select on public.content_publication_events to authenticated;

create policy content_versions_teacher_select on public.content_versions
for select to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'teacher'
  )
);

create policy content_publication_events_teacher_select
on public.content_publication_events
for select to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role = 'teacher'
  )
);
