create extension if not exists pgcrypto with schema extensions;

alter table public.classrooms
add constraint classrooms_join_code_hash_key unique (join_code_hash);

create function public.create_classroom(p_name text)
returns table (
  classroom_id uuid,
  classroom_name text,
  join_code text,
  join_code_version integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  normalized_name text := btrim(p_name);
  normalized_code text;
  display_code text;
  code_hash bytea;
  created_classroom_id uuid;
  collision_constraint text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select profile.role
  into actor_role
  from public.profiles as profile
  where profile.id = actor_id;

  if actor_role is distinct from 'teacher' then
    raise exception using errcode = '42501', message = 'TEACHER_REQUIRED';
  end if;

  if normalized_name is null or char_length(normalized_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'CLASSROOM_NAME_INVALID';
  end if;

  for generation_attempt in 1..5 loop
    normalized_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
    display_code := concat_ws(
      '-',
      substr(normalized_code, 1, 4),
      substr(normalized_code, 5, 4),
      substr(normalized_code, 9, 4),
      substr(normalized_code, 13, 4)
    );
    code_hash := extensions.digest(normalized_code, 'sha256');

    begin
      insert into public.classrooms (
        owner_teacher_id,
        name,
        join_code_hash,
        join_code_version,
        join_code_rotated_at,
        status
      )
      values (
        actor_id,
        normalized_name,
        code_hash,
        1,
        clock_timestamp(),
        'active'
      )
      returning id into created_classroom_id;

      insert into public.classroom_members (
        classroom_id,
        user_id,
        member_role,
        status,
        joined_at,
        activated_at,
        last_join_request_id
      )
      values (
        created_classroom_id,
        actor_id,
        'teacher',
        'active',
        clock_timestamp(),
        clock_timestamp(),
        gen_random_uuid()
      );

      return query
      select created_classroom_id, normalized_name, display_code, 1;
      return;
    exception
      when unique_violation then
        get stacked diagnostics collision_constraint = constraint_name;
        if collision_constraint <> 'classrooms_join_code_hash_key' then
          raise;
        end if;
    end;
  end loop;

  raise exception using errcode = 'P0001', message = 'CLASSROOM_CODE_GENERATION_FAILED';
end;
$$;

create function public.rotate_classroom_join_code(p_classroom_id uuid)
returns table (
  classroom_id uuid,
  join_code text,
  join_code_version integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  selected_owner_id uuid;
  selected_status public.classroom_status;
  selected_version integer;
  normalized_code text;
  display_code text;
  code_hash bytea;
  collision_constraint text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select classroom.owner_teacher_id, classroom.status, classroom.join_code_version
  into selected_owner_id, selected_status, selected_version
  from public.classrooms as classroom
  where classroom.id = p_classroom_id
  for update;

  if not found
    or selected_owner_id <> actor_id
    or selected_status <> 'active'
  then
    raise exception using errcode = '42501', message = 'CLASSROOM_NOT_AVAILABLE';
  end if;

  for generation_attempt in 1..5 loop
    normalized_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
    display_code := concat_ws(
      '-',
      substr(normalized_code, 1, 4),
      substr(normalized_code, 5, 4),
      substr(normalized_code, 9, 4),
      substr(normalized_code, 13, 4)
    );
    code_hash := extensions.digest(normalized_code, 'sha256');

    begin
      update public.classrooms
      set join_code_hash = code_hash,
          join_code_version = selected_version + 1,
          join_code_rotated_at = clock_timestamp(),
          updated_at = clock_timestamp()
      where id = p_classroom_id;

      return query
      select p_classroom_id, display_code, selected_version + 1;
      return;
    exception
      when unique_violation then
        get stacked diagnostics collision_constraint = constraint_name;
        if collision_constraint <> 'classrooms_join_code_hash_key' then
          raise;
        end if;
    end;
  end loop;

  raise exception using errcode = 'P0001', message = 'CLASSROOM_CODE_GENERATION_FAILED';
end;
$$;

create function public.join_classroom(
  p_join_code text,
  p_request_id uuid
)
returns table (
  classroom_id uuid,
  classroom_name text,
  membership_status public.classroom_member_status,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  normalized_code text := regexp_replace(upper(btrim(p_join_code)), '-', '', 'g');
  selected_classroom_id uuid;
  selected_classroom_name text;
  selected_status public.classroom_member_status;
  selected_joined_at timestamptz;
  transition_time timestamptz := clock_timestamp();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select profile.role
  into actor_role
  from public.profiles as profile
  where profile.id = actor_id;

  if actor_role is distinct from 'student' then
    raise exception using errcode = '42501', message = 'STUDENT_REQUIRED';
  end if;

  if p_request_id is null then
    raise exception using errcode = '22023', message = 'JOIN_REQUEST_ID_REQUIRED';
  end if;

  if normalized_code is null or normalized_code !~ '^[0-9A-F]{16}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_CLASSROOM_CODE';
  end if;

  select classroom.id, classroom.name
  into selected_classroom_id, selected_classroom_name
  from public.classrooms as classroom
  where classroom.status = 'active'
    and classroom.join_code_hash = extensions.digest(normalized_code, 'sha256')
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'INVALID_CLASSROOM_CODE';
  end if;

  insert into public.classroom_members (
    classroom_id,
    user_id,
    member_role,
    status,
    joined_at,
    activated_at,
    deactivated_at,
    last_join_request_id,
    created_at,
    updated_at
  )
  values (
    selected_classroom_id,
    actor_id,
    'student',
    'active',
    transition_time,
    transition_time,
    null,
    p_request_id,
    transition_time,
    transition_time
  )
  on conflict on constraint classroom_members_pkey do update
  set status = 'active',
      activated_at = case
        when classroom_members.status = 'inactive' then excluded.activated_at
        else classroom_members.activated_at
      end,
      deactivated_at = null,
      last_join_request_id = case
        when classroom_members.status = 'inactive' then excluded.last_join_request_id
        else classroom_members.last_join_request_id
      end,
      updated_at = case
        when classroom_members.status = 'inactive' then excluded.updated_at
        else classroom_members.updated_at
      end
  where classroom_members.member_role = 'student'
  returning classroom_members.status, classroom_members.joined_at
  into selected_status, selected_joined_at;

  if not found then
    raise exception using errcode = '42501', message = 'CLASSROOM_MEMBERSHIP_CONFLICT';
  end if;

  return query
  select
    selected_classroom_id,
    selected_classroom_name,
    selected_status,
    selected_joined_at;
end;
$$;

create function public.list_my_classrooms()
returns table (
  classroom_id uuid,
  classroom_name text,
  membership_status public.classroom_member_status,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  return query
  select
    classroom.id,
    classroom.name,
    membership.status,
    membership.joined_at
  from public.classroom_members as membership
  join public.classrooms as classroom on classroom.id = membership.classroom_id
  where membership.user_id = actor_id
    and membership.member_role = 'student'
    and membership.status = 'active'
    and classroom.status = 'active'
  order by membership.joined_at, classroom.id;
end;
$$;

create function public.list_owned_classrooms()
returns table (
  classroom_id uuid,
  classroom_name text,
  classroom_status public.classroom_status,
  member_count bigint,
  join_code_version integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select profile.role
  into actor_role
  from public.profiles as profile
  where profile.id = actor_id;

  if actor_role is distinct from 'teacher' then
    raise exception using errcode = '42501', message = 'TEACHER_REQUIRED';
  end if;

  return query
  select
    classroom.id,
    classroom.name,
    classroom.status,
    count(membership.user_id) filter (
      where membership.member_role = 'student'
        and membership.status = 'active'
    ),
    classroom.join_code_version,
    classroom.created_at
  from public.classrooms as classroom
  left join public.classroom_members as membership
    on membership.classroom_id = classroom.id
  where classroom.owner_teacher_id = actor_id
  group by classroom.id
  order by classroom.created_at, classroom.id;
end;
$$;

create function public.list_owned_classroom_members(p_classroom_id uuid)
returns table (
  display_name text,
  active_blook_id uuid,
  membership_status public.classroom_member_status,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  perform 1
  from public.classrooms as classroom
  where classroom.id = p_classroom_id
    and classroom.owner_teacher_id = actor_id;

  if not found then
    raise exception using errcode = '42501', message = 'CLASSROOM_NOT_AVAILABLE';
  end if;

  return query
  select
    profile.display_name,
    profile.active_blook_id,
    membership.status,
    membership.joined_at
  from public.classroom_members as membership
  join public.profiles as profile on profile.id = membership.user_id
  where membership.classroom_id = p_classroom_id
    and membership.member_role = 'student'
  order by membership.joined_at, membership.user_id;
end;
$$;

revoke all on function public.create_classroom(text)
from public, anon, authenticated;
revoke all on function public.rotate_classroom_join_code(uuid)
from public, anon, authenticated;
revoke all on function public.join_classroom(text, uuid)
from public, anon, authenticated;
revoke all on function public.list_my_classrooms()
from public, anon, authenticated;
revoke all on function public.list_owned_classrooms()
from public, anon, authenticated;
revoke all on function public.list_owned_classroom_members(uuid)
from public, anon, authenticated;

grant execute on function public.create_classroom(text) to authenticated;
grant execute on function public.rotate_classroom_join_code(uuid) to authenticated;
grant execute on function public.join_classroom(text, uuid) to authenticated;
grant execute on function public.list_my_classrooms() to authenticated;
grant execute on function public.list_owned_classrooms() to authenticated;
grant execute on function public.list_owned_classroom_members(uuid) to authenticated;
