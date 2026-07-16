create function public.achievement_metric_value(
  target_user_id uuid,
  target_rule_type public.achievement_rule_type
)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  metric_value integer;
begin
  case target_rule_type
    when 'completed_task_count' then
      select count(*)::integer
      into metric_value
      from public.quiz_sessions
      where user_id = target_user_id
        and status = 'completed';

    when 'perfect_quiz_count' then
      select count(*)::integer
      into metric_value
      from public.quiz_sessions
      where user_id = target_user_id
        and status = 'completed'
        and correct_count = question_count;

    when 'level_reached' then
      select (coalesce(sum(amount), 0) / 500 + 1)::integer
      into metric_value
      from public.xp_transactions
      where user_id = target_user_id;

    when 'correct_streak' then
      with ordered_answers as (
        select
          a.answer_status,
          sum(case when a.answer_status = 'correct' then 0 else 1 end)
            over (order by a.answered_at, a.id) as streak_group
        from public.quiz_answers a
        join public.quiz_sessions s on s.id = a.session_id
        where a.user_id = target_user_id
          and s.status = 'completed'
      ),
      correct_groups as (
        select count(*)::integer as streak_length
        from ordered_answers
        where answer_status = 'correct'
        group by streak_group
      )
      select coalesce(max(streak_length), 0)
      into metric_value
      from correct_groups;

    when 'initial_blook_owned_count' then
      select count(*)::integer
      into metric_value
      from public.user_blooks ub
      join public.blooks b on b.id = ub.blook_id
      where ub.user_id = target_user_id
        and b.sort_order between 1 and 6;

    when 'resolved_mistake_count', 'mastered_chapter_count', 'live_completed_count' then
      metric_value := null;
  end case;

  return metric_value;
end;
$$;

create function public.evaluate_achievements(
  target_user_id uuid,
  event_source_type public.achievement_source_type,
  event_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  definition_record record;
  metric_value integer;
  clamped_value integer;
  target_value integer;
  next_state public.achievement_progress_state;
  unlocked_codes jsonb;
begin
  if target_user_id is null or event_source_id is null then
    raise exception using errcode = 'P0001', message = 'ACHIEVEMENT_INVALID_EVENT';
  end if;

  perform 1
  from public.profiles
  where id = target_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACHIEVEMENT_PROFILE_NOT_FOUND';
  end if;

  perform 1
  from public.achievement_progress p
  join public.achievement_definitions d on d.id = p.achievement_definition_id
  where p.user_id = target_user_id
  order by d.sort_order
  for update of p;

  for definition_record in
    select *
    from public.achievement_definitions
    where status = 'active'
    order by sort_order
  loop
    metric_value := public.achievement_metric_value(target_user_id, definition_record.rule_type);

    if metric_value is null then
      continue;
    end if;

    target_value := (definition_record.rule_parameters ->> 'target')::integer;
    clamped_value := least(metric_value, target_value);
    next_state := case
      when clamped_value >= target_value then 'unlocked'
      when clamped_value > 0 then 'in_progress'
      else 'not_started'
    end;

    insert into public.achievement_progress (
      user_id,
      achievement_definition_id,
      definition_version,
      current_value,
      target_value,
      state,
      last_source_type,
      last_source_id,
      computed_at
    )
    values (
      target_user_id,
      definition_record.id,
      definition_record.rule_version,
      clamped_value,
      target_value,
      next_state,
      event_source_type,
      event_source_id,
      clock_timestamp()
    )
    on conflict (user_id, achievement_definition_id) do update
    set definition_version = excluded.definition_version,
        current_value = excluded.current_value,
        target_value = excluded.target_value,
        state = excluded.state,
        last_source_type = excluded.last_source_type,
        last_source_id = excluded.last_source_id,
        computed_at = excluded.computed_at
    where excluded.current_value > achievement_progress.current_value
      or excluded.state > achievement_progress.state
      or excluded.definition_version > achievement_progress.definition_version;

    if clamped_value >= target_value then
      insert into public.achievement_unlocks (
        user_id,
        achievement_definition_id,
        definition_version,
        source_type,
        source_id
      )
      values (
        target_user_id,
        definition_record.id,
        definition_record.rule_version,
        event_source_type,
        event_source_id
      )
      on conflict (user_id, achievement_definition_id) do nothing;
    end if;
  end loop;

  select coalesce(jsonb_agg(d.stable_code order by d.sort_order), '[]'::jsonb)
  into unlocked_codes
  from public.achievement_unlocks u
  join public.achievement_definitions d on d.id = u.achievement_definition_id
  where u.user_id = target_user_id
    and d.status = 'active';

  return jsonb_build_object('unlocked_stable_codes', unlocked_codes);
end;
$$;

create function public.get_my_achievement_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  catalog_items jsonb;
  total_count integer;
  unlocked_count integer;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'badge_key', d.badge_key,
          'description', d.description,
          'display_name', d.display_name,
          'progress', case
            when d.visibility = 'hidden'
              or d.rule_type in (
                'resolved_mistake_count',
                'mastered_chapter_count',
                'live_completed_count'
              ) then null
            else coalesce(p.current_value, 0)
          end,
          'stable_code', d.stable_code,
          'state', coalesce(p.state, 'not_started'),
          'target', case
            when d.visibility = 'hidden'
              or d.rule_type in (
                'resolved_mistake_count',
                'mastered_chapter_count',
                'live_completed_count'
              ) then null
            else (d.rule_parameters ->> 'target')::integer
          end,
          'unlocked_at', u.unlocked_at
        )
        order by d.sort_order
      ),
      '[]'::jsonb
    ),
    count(*)::integer,
    count(u.id)::integer
  into catalog_items, total_count, unlocked_count
  from public.achievement_definitions d
  left join public.achievement_progress p
    on p.user_id = actor_id
    and p.achievement_definition_id = d.id
  left join public.achievement_unlocks u
    on u.user_id = actor_id
    and u.achievement_definition_id = d.id
  where d.status = 'active'
    and (d.visibility = 'public' or u.id is not null);

  return jsonb_build_object(
    'items', catalog_items,
    'total_count', total_count,
    'unlocked_count', unlocked_count
  );
end;
$$;

revoke all on function public.achievement_metric_value(uuid, public.achievement_rule_type)
from public, anon, authenticated;
revoke all on function public.evaluate_achievements(
  uuid,
  public.achievement_source_type,
  uuid
)
from public, anon, authenticated;
revoke all on function public.get_my_achievement_catalog()
from public, anon, authenticated;
grant execute on function public.get_my_achievement_catalog() to authenticated;
