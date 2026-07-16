create function public.evaluate_quiz_finalize_achievements()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.evaluate_achievements(new.user_id, 'quiz_finalize', new.id);
  return new;
end;
$$;

create function public.evaluate_xp_achievement_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.evaluate_achievements(new.user_id, 'xp_ledger', new.id);
  return new;
end;
$$;

create function public.evaluate_blook_achievement_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.evaluate_achievements(new.user_id, 'blook_acquired', new.blook_id);
  return new;
end;
$$;

revoke all on function public.evaluate_quiz_finalize_achievements()
from public, anon, authenticated;
revoke all on function public.evaluate_xp_achievement_event()
from public, anon, authenticated;
revoke all on function public.evaluate_blook_achievement_event()
from public, anon, authenticated;

create trigger quiz_finalize_achievement_evaluation
after update of status on public.quiz_sessions
for each row
when (old.status = 'in_progress' and new.status = 'completed')
execute function public.evaluate_quiz_finalize_achievements();

create trigger xp_achievement_evaluation
after insert on public.xp_transactions
for each row
execute function public.evaluate_xp_achievement_event();

create trigger blook_achievement_evaluation
after insert on public.user_blooks
for each row
execute function public.evaluate_blook_achievement_event();

do $$
declare
  profile_record record;
begin
  for profile_record in
    select id from public.profiles order by id
  loop
    perform public.evaluate_achievements(
      profile_record.id,
      'catalog_backfill',
      profile_record.id
    );
  end loop;
end;
$$;
