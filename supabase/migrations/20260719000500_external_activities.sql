-- Teacher-owned external activity links (e.g. Kahoot URLs). HTTPS-only,
-- managed by the owning teacher through a trusted command; students read
-- available rows of classrooms they actively belong to. First-party Live
-- remains the product; these are optional pointers.

create type public.external_activity_status as enum ('available', 'archived');

create table public.external_activities (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.profiles(id),
  classroom_id uuid references public.classrooms(id) on delete cascade,
  chapter_id uuid references public.chapters(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  url text not null check (url ~ '^https://'),
  status public.external_activity_status not null default 'available',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.external_activities enable row level security;

grant select on public.external_activities to authenticated;

create policy external_activities_owner_select on public.external_activities
for select to authenticated
using (owner_teacher_id = (select auth.uid()));

create policy external_activities_member_select on public.external_activities
for select to authenticated
using (
  status = 'available'
  and classroom_id is not null
  and exists (
    select 1
    from public.classroom_members member
    where member.classroom_id = external_activities.classroom_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

create function public.upsert_external_activity(
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := public.assert_content_teacher();
  target_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_title text := btrim(coalesce(p_payload ->> 'title', ''));
  v_url text := btrim(coalesce(p_payload ->> 'url', ''));
  v_classroom uuid := nullif(p_payload ->> 'classroom_id', '')::uuid;
  v_chapter uuid := nullif(p_payload ->> 'chapter_id', '')::uuid;
  v_status public.external_activity_status := coalesce(
    nullif(p_payload ->> 'status', ''), 'available'
  )::public.external_activity_status;
  existing public.external_activities;
begin
  if p_request_id is null then
    raise exception using errcode = 'P0001', message = 'CONTENT_INVALID_REQUEST';
  end if;
  if char_length(v_title) not between 1 and 120 then
    raise exception using errcode = 'P0001', message = 'EXTERNAL_TITLE_INVALID';
  end if;
  if v_url !~ '^https://' or char_length(v_url) > 500 then
    raise exception using errcode = 'P0001', message = 'EXTERNAL_URL_INVALID';
  end if;
  if v_classroom is not null and not exists (
    select 1 from public.classrooms c
    where c.id = v_classroom and c.owner_teacher_id = actor
  ) then
    raise exception using errcode = 'P0001', message = 'EXTERNAL_CLASSROOM_INVALID';
  end if;

  if target_id is null then
    insert into public.external_activities (
      owner_teacher_id, classroom_id, chapter_id, title, url, status
    ) values (actor, v_classroom, v_chapter, v_title, v_url, v_status)
    returning id into target_id;
  else
    select * into existing
    from public.external_activities
    where id = target_id
    for update;
    if existing.id is null or existing.owner_teacher_id <> actor then
      raise exception using errcode = 'P0001', message = 'EXTERNAL_NOT_FOUND';
    end if;
    update public.external_activities
    set classroom_id = v_classroom,
        chapter_id = v_chapter,
        title = v_title,
        url = v_url,
        status = v_status,
        updated_at = clock_timestamp()
    where id = target_id;
  end if;

  return jsonb_build_object('activity_id', target_id, 'status', v_status);
end;
$$;

revoke all on function public.upsert_external_activity(jsonb, uuid)
from public, anon;
grant execute on function public.upsert_external_activity(jsonb, uuid)
to authenticated;
