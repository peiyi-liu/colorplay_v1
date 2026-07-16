create type public.achievement_rule_type as enum (
  'completed_task_count',
  'perfect_quiz_count',
  'resolved_mistake_count',
  'mastered_chapter_count',
  'level_reached',
  'correct_streak',
  'live_completed_count',
  'initial_blook_owned_count'
);

create type public.achievement_source_type as enum (
  'quiz_finalize',
  'xp_ledger',
  'blook_acquired',
  'catalog_backfill',
  'assignment_finalize',
  'live_finalize',
  'mistake_resolved',
  'mastery_recomputed'
);

create type public.achievement_visibility as enum ('public', 'hidden');
create type public.achievement_definition_status as enum ('active', 'archived');
create type public.achievement_progress_state as enum ('not_started', 'in_progress', 'unlocked');

create function public.validate_achievement_rule_parameters(
  rule_type public.achievement_rule_type,
  rule_version integer,
  parameters jsonb
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select
    rule_type is not null
    and rule_version = 1
    and jsonb_typeof(parameters) = 'object'
    and (select count(*) from jsonb_object_keys(parameters)) = 1
    and parameters ? 'target'
    and jsonb_typeof(parameters -> 'target') = 'number'
    and (parameters ->> 'target') ~ '^[1-9][0-9]*$'
$$;

create table public.achievement_definitions (
  id uuid primary key,
  stable_code text unique not null,
  display_name text not null,
  description text not null,
  badge_key text not null,
  rule_type public.achievement_rule_type not null,
  rule_version integer not null check (rule_version > 0),
  rule_parameters jsonb not null,
  visibility public.achievement_visibility not null,
  status public.achievement_definition_status not null,
  sort_order integer unique not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  check (
    public.validate_achievement_rule_parameters(rule_type, rule_version, rule_parameters)
  )
);

create table public.achievement_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_definition_id uuid not null references public.achievement_definitions(id) on delete restrict,
  definition_version integer not null,
  current_value integer not null check (current_value >= 0),
  target_value integer not null check (target_value > 0),
  state public.achievement_progress_state not null,
  last_source_type public.achievement_source_type,
  last_source_id uuid,
  computed_at timestamptz not null default clock_timestamp(),
  primary key (user_id, achievement_definition_id),
  check ((last_source_type is null) = (last_source_id is null))
);

create table public.achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_definition_id uuid not null references public.achievement_definitions(id) on delete restrict,
  definition_version integer not null,
  source_type public.achievement_source_type not null,
  source_id uuid not null,
  unlocked_at timestamptz not null default clock_timestamp(),
  unique (user_id, achievement_definition_id)
);

create index achievement_progress_user_definition_idx
on public.achievement_progress(user_id, achievement_definition_id);

create index achievement_unlocks_user_definition_idx
on public.achievement_unlocks(user_id, achievement_definition_id);

insert into public.achievement_definitions (
  id,
  stable_code,
  display_name,
  description,
  badge_key,
  rule_type,
  rule_version,
  rule_parameters,
  visibility,
  status,
  sort_order
)
values
  (
    '60000000-0000-0000-0000-000000000001',
    'first_task_complete',
    '初出茅廬',
    '完成第一次正式挑戰',
    'first_task_complete',
    'completed_task_count',
    1,
    '{"target":1}',
    'public',
    'active',
    1
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    'first_perfect_quiz',
    '百發百中',
    '在一次正式測驗中全數答對',
    'first_perfect_quiz',
    'perfect_quiz_count',
    1,
    '{"target":1}',
    'public',
    'active',
    2
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    'mistakes_resolved_10',
    '不屈不撓',
    '解決 10 個不同錯題',
    'mistakes_resolved_10',
    'resolved_mistake_count',
    1,
    '{"target":10}',
    'public',
    'active',
    3
  ),
  (
    '60000000-0000-0000-0000-000000000004',
    'chapter_mastered_1',
    '章節精熟',
    '精熟第一個章節',
    'chapter_mastered_1',
    'mastered_chapter_count',
    1,
    '{"target":1}',
    'public',
    'active',
    4
  ),
  (
    '60000000-0000-0000-0000-000000000005',
    'all_chapters_mastered',
    '色彩大師',
    '精熟全部六個章節',
    'all_chapters_mastered',
    'mastered_chapter_count',
    1,
    '{"target":6}',
    'public',
    'active',
    5
  ),
  (
    '60000000-0000-0000-0000-000000000006',
    'level_10',
    '登峰造極',
    '達到 Level 10',
    'level_10',
    'level_reached',
    1,
    '{"target":10}',
    'public',
    'active',
    6
  ),
  (
    '60000000-0000-0000-0000-000000000007',
    'correct_streak_20',
    '連擊之王',
    '連續答對 20 題',
    'correct_streak_20',
    'correct_streak',
    1,
    '{"target":20}',
    'public',
    'active',
    7
  ),
  (
    '60000000-0000-0000-0000-000000000008',
    'live_complete_5',
    '課堂挑戰者',
    '完成 5 場 ColorPlay Live',
    'live_complete_5',
    'live_completed_count',
    1,
    '{"target":5}',
    'public',
    'active',
    8
  ),
  (
    '60000000-0000-0000-0000-000000000009',
    'blooks_owned_6',
    '收藏家',
    '擁有六隻初始 Blook',
    'blooks_owned_6',
    'initial_blook_owned_count',
    1,
    '{"target":6}',
    'public',
    'active',
    9
  );

alter table public.achievement_definitions enable row level security;
alter table public.achievement_progress enable row level security;
alter table public.achievement_unlocks enable row level security;

revoke all on public.achievement_definitions from public, anon, authenticated;
revoke all on public.achievement_progress from public, anon, authenticated;
revoke all on public.achievement_unlocks from public, anon, authenticated;

grant select on public.achievement_progress to authenticated;
grant select on public.achievement_unlocks to authenticated;

create policy achievement_progress_read_own on public.achievement_progress
for select to authenticated
using (user_id = auth.uid());

create policy achievement_unlocks_read_own on public.achievement_unlocks
for select to authenticated
using (user_id = auth.uid());

create function public.reject_achievement_unlock_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'ACHIEVEMENT_UNLOCK_IMMUTABLE';
end;
$$;

create trigger achievement_unlocks_immutable
before update or delete on public.achievement_unlocks
for each row execute function public.reject_achievement_unlock_mutation();

revoke all on function public.reject_achievement_unlock_mutation()
from public, anon, authenticated;
