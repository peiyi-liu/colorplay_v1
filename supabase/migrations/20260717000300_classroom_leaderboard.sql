create function public.get_classroom_leaderboard(p_classroom_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  selected_classroom_name text;
  selected_owner_id uuid;
  actor_is_active_member boolean;
  top_entries jsonb;
  self_entry jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select classroom.name, classroom.owner_teacher_id
  into selected_classroom_name, selected_owner_id
  from public.classrooms as classroom
  where classroom.id = p_classroom_id
    and classroom.status = 'active';

  if not found then
    raise exception using errcode = '42501', message = 'CLASSROOM_NOT_AVAILABLE';
  end if;

  select exists (
    select 1
    from public.classroom_members as membership
    where membership.classroom_id = p_classroom_id
      and membership.user_id = actor_id
      and membership.status = 'active'
  )
  into actor_is_active_member;

  if selected_owner_id <> actor_id and not actor_is_active_member then
    raise exception using errcode = '42501', message = 'CLASSROOM_NOT_AVAILABLE';
  end if;

  with eligible_members as (
    select
      membership.user_id,
      membership.joined_at,
      profile.display_name,
      profile.active_blook_id
    from public.classroom_members as membership
    join public.profiles as profile on profile.id = membership.user_id
    where membership.classroom_id = p_classroom_id
      and membership.member_role = 'student'
      and membership.status = 'active'
  ),
  aggregated as (
    select
      member.user_id,
      member.display_name,
      member.active_blook_id,
      coalesce(sum(transaction.amount), 0)::bigint as total_xp,
      case
        when count(transaction.id) = 0 then member.joined_at
        else max(transaction.created_at)
      end as first_reached_at
    from eligible_members as member
    left join public.xp_transactions as transaction
      on transaction.user_id = member.user_id
      and transaction.created_at >= member.joined_at
    group by
      member.user_id,
      member.display_name,
      member.active_blook_id,
      member.joined_at
  ),
  ranked as (
    select
      aggregate.user_id,
      aggregate.display_name,
      aggregate.active_blook_id,
      aggregate.total_xp,
      row_number() over (
        order by
          aggregate.total_xp desc,
          aggregate.first_reached_at asc,
          aggregate.user_id asc
      ) as rank
    from aggregated as aggregate
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'active_blook_id', ranked.active_blook_id,
          'display_name', ranked.display_name,
          'is_self', ranked.user_id = actor_id,
          'rank', ranked.rank,
          'total_xp', ranked.total_xp
        )
        order by ranked.rank
      ) filter (where ranked.rank <= 10),
      '[]'::jsonb
    ),
    (
      select jsonb_build_object(
        'active_blook_id', self_rank.active_blook_id,
        'display_name', self_rank.display_name,
        'is_self', true,
        'rank', self_rank.rank,
        'total_xp', self_rank.total_xp
      )
      from ranked as self_rank
      where self_rank.user_id = actor_id
    )
  into top_entries, self_entry
  from ranked;

  return jsonb_build_object(
    'classroom_id', p_classroom_id,
    'classroom_name', selected_classroom_name,
    'generated_at', statement_timestamp(),
    'self_entry', self_entry,
    'top_entries', top_entries
  );
end;
$$;

revoke all on function public.get_classroom_leaderboard(uuid)
from public, anon, authenticated;
grant execute on function public.get_classroom_leaderboard(uuid)
to authenticated;
