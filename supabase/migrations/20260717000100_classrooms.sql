create type public.classroom_status as enum ('active', 'archived');
create type public.classroom_member_role as enum ('student', 'teacher');
create type public.classroom_member_status as enum ('active', 'inactive');

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (
    name = btrim(name)
    and char_length(name) between 1 and 80
  ),
  join_code_hash bytea not null check (octet_length(join_code_hash) = 32),
  join_code_version integer not null default 1 check (join_code_version > 0),
  join_code_rotated_at timestamptz not null default now(),
  status public.classroom_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classroom_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role public.classroom_member_role not null,
  status public.classroom_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  last_join_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (classroom_id, user_id),
  constraint classroom_members_status_timestamps_check check (
    (status = 'active' and deactivated_at is null)
    or (status = 'inactive' and deactivated_at is not null)
  )
);

create index classrooms_owner_teacher_id_idx
on public.classrooms(owner_teacher_id);

create index classroom_members_user_classroom_idx
on public.classroom_members(user_id, classroom_id)
include (status, member_role);

create or replace function public.assert_classroom_owner_is_teacher()
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
      message = 'CLASSROOM_OWNER_MUST_BE_TEACHER';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_classroom_owner_is_teacher()
from public, anon, authenticated;

create trigger classrooms_owner_role_guard
before insert or update of owner_teacher_id on public.classrooms
for each row
execute function public.assert_classroom_owner_is_teacher();

create or replace function public.is_active_classroom_member(
  p_classroom_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.classroom_members as membership
      where membership.classroom_id = p_classroom_id
        and membership.user_id = p_user_id
        and membership.status = 'active'
    );
$$;

create or replace function public.current_user_owns_classroom(
  p_classroom_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.classrooms as classroom
    where classroom.id = p_classroom_id
      and classroom.owner_teacher_id = (select auth.uid())
  );
$$;

revoke all on function public.is_active_classroom_member(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.current_user_owns_classroom(uuid)
from public, anon, authenticated;
grant execute on function public.is_active_classroom_member(uuid, uuid)
to authenticated;
grant execute on function public.current_user_owns_classroom(uuid)
to authenticated;

alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;

revoke all on public.classrooms, public.classroom_members from anon, authenticated;

grant select (
  id,
  owner_teacher_id,
  name,
  status,
  created_at,
  updated_at
) on public.classrooms to authenticated;

grant select (
  classroom_id,
  user_id,
  member_role,
  status,
  joined_at,
  activated_at,
  deactivated_at,
  created_at,
  updated_at
) on public.classroom_members to authenticated;

create policy classrooms_select_authorized
on public.classrooms
for select
to authenticated
using (
  owner_teacher_id = (select auth.uid())
  or public.is_active_classroom_member(id, (select auth.uid()))
);

create policy classroom_members_select_authorized
on public.classroom_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.current_user_owns_classroom(classroom_id)
);
