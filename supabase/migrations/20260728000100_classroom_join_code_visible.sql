-- 班級加入碼改為「固定、教師可隨時查看」（owner 2026-07-27 裁定）：
-- 原設計只存 sha256 雜湊、建立/輪替當下一次性顯示；owner 定案為固定碼＋
-- 班級管理常駐顯示＋一鍵複製（班名＋碼）。明碼以 display 格式存於
-- classrooms.join_code；讀取面僅限 owner 專用 RPC——classrooms 的
-- column-level grant 不含此欄，學生/一般 authenticated 無法直讀。
-- 既有班級的明碼無法由雜湊還原：本 migration 一次性重產（此後固定）。

alter table public.classrooms
  add column join_code text
    check (
      join_code is null
      or join_code ~ '^[0-9A-F]{4}(-[0-9A-F]{4}){3}$'
    );

do $$
declare
  classroom_record record;
  normalized_code text;
  display_code text;
begin
  for classroom_record in select id from public.classrooms loop
    loop
      normalized_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
      display_code := concat_ws(
        '-',
        substr(normalized_code, 1, 4),
        substr(normalized_code, 5, 4),
        substr(normalized_code, 9, 4),
        substr(normalized_code, 13, 4)
      );
      begin
        update public.classrooms
        set join_code = display_code,
            join_code_hash = extensions.digest(normalized_code, 'sha256'),
            join_code_rotated_at = clock_timestamp(),
            updated_at = clock_timestamp()
        where id = classroom_record.id;
        exit;
      exception
        when unique_violation then
          -- 撞碼重試（機率極低）。
      end;
    end loop;
  end loop;
end;
$$;

-- 刻意維持 nullable：既有 pgTAP fixture 直插 classrooms 不帶此欄；生產資料
-- 已於上方回填、create_classroom 之後必寫，null 僅存在於測試 fixture。

-- create_classroom：明碼一併入庫（其餘行為不變）。
create or replace function public.create_classroom(p_name text)
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
        join_code,
        join_code_hash,
        join_code_version,
        join_code_rotated_at,
        status
      )
      values (
        actor_id,
        normalized_name,
        display_code,
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

-- rotate_classroom_join_code：函式保留（明碼/雜湊同步更新），但 UI 已無
-- 輪替入口——owner 定案加入碼固定不改。
create or replace function public.rotate_classroom_join_code(p_classroom_id uuid)
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
      set join_code = display_code,
          join_code_hash = code_hash,
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

-- list_owned_classrooms：回傳固定加入碼（owner 專用 RPC，回傳型別變更需
-- drop 重建）。
drop function public.list_owned_classrooms();

create function public.list_owned_classrooms()
returns table (
  classroom_id uuid,
  classroom_name text,
  classroom_status public.classroom_status,
  member_count bigint,
  join_code text,
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
    classroom.join_code,
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

revoke all on function public.list_owned_classrooms()
  from public, anon;

grant execute on function public.list_owned_classrooms() to authenticated;
