-- 班級成員安全投影 v2（Live design handoff D1）：
-- 成員表要顯示名字／學號並可導向單一學生進度頁，但投影承諾不含 Email 與
-- auth 使用者識別碼，故新增 member_ref 代理鍵（只在班級管理脈絡有意義，
-- 無法反推 auth.users.id）。

alter table public.classroom_members
  add column member_ref uuid not null default gen_random_uuid();

create unique index classroom_members_member_ref_key
  on public.classroom_members (member_ref);

-- 回傳型別變更，須先 drop 再重建。
drop function public.list_owned_classroom_members(uuid);

create function public.list_owned_classroom_members(p_classroom_id uuid)
returns table (
  member_ref uuid,
  display_name text,
  full_name text,
  login_account text,
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
    membership.member_ref,
    profile.display_name,
    profile.full_name,
    profile.login_account,
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

revoke all on function public.list_owned_classroom_members(uuid)
  from public, anon;

grant execute on function public.list_owned_classroom_members(uuid) to authenticated;
