create table public.blooks (
  id uuid primary key,
  stable_code text unique not null check (stable_code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  emoji text not null check (char_length(btrim(emoji)) between 1 and 16),
  cost_tokens integer not null check (cost_tokens >= 0),
  status text not null check (status in ('published', 'archived')),
  sort_order integer unique not null check (sort_order > 0),
  created_at timestamptz not null default now()
);

insert into public.blooks (
  id, stable_code, name, emoji, cost_tokens, status, sort_order
)
values
  ('50000000-0000-0000-0000-000000000001', 'little_fox', '小狐狸', '🦊', 0, 'published', 1),
  ('50000000-0000-0000-0000-000000000002', 'lucky_cat', '招財貓', '🐱', 100, 'published', 2),
  ('50000000-0000-0000-0000-000000000003', 'travel_frog', '旅行蛙', '🐸', 250, 'published', 3),
  ('50000000-0000-0000-0000-000000000004', 'wise_owl', '智慧鴞', '🦉', 500, 'published', 4),
  ('50000000-0000-0000-0000-000000000005', 'primary_lion', '原色獅', '🦁', 1000, 'published', 5),
  ('50000000-0000-0000-0000-000000000006', 'rainbow_horse', '彩虹馬', '🦄', 2000, 'published', 6);

alter table public.profiles
add column active_blook_id uuid references public.blooks(id) on delete restrict;

create table public.user_blooks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  blook_id uuid not null references public.blooks(id) on delete restrict,
  acquired_at timestamptz not null default now(),
  source text not null check (source in ('default', 'purchase')),
  primary key (user_id, blook_id)
);

create index user_blooks_blook_id_idx on public.user_blooks(blook_id);

insert into public.user_blooks (user_id, blook_id, source)
select
  p.id,
  '50000000-0000-0000-0000-000000000001'::uuid,
  'default'
from public.profiles p
order by p.id
on conflict (user_id, blook_id) do nothing;

update public.profiles
set active_blook_id = '50000000-0000-0000-0000-000000000001'::uuid
where active_blook_id is null;

alter table public.profiles alter column active_blook_id set not null;

alter table public.blooks enable row level security;
alter table public.user_blooks enable row level security;

revoke all on public.blooks from anon, authenticated;
revoke all on public.user_blooks from anon, authenticated;
grant select on public.blooks to authenticated;
grant select on public.user_blooks to authenticated;

create policy blooks_read_published on public.blooks
for select to authenticated
using (status = 'published');

create policy user_blooks_read_own on public.user_blooks
for select to authenticated
using (user_id = auth.uid());

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name, active_blook_id)
  values (
    new.id,
    coalesce(
      nullif(
        left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 30),
        ''
      ),
      'ColorPlay 使用者'
    ),
    '50000000-0000-0000-0000-000000000001'::uuid
  );

  insert into public.wallets (user_id) values (new.id);

  insert into public.user_blooks (user_id, blook_id, source)
  values (
    new.id,
    '50000000-0000-0000-0000-000000000001'::uuid,
    'default'
  );

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user()
from public, anon, authenticated;

create function public.get_my_blook_inventory()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_balance integer;
  actor_active_blook_id uuid;
  inventory_items jsonb;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select w.token_balance, p.active_blook_id
  into actor_balance, actor_active_blook_id
  from public.profiles p
  join public.wallets w on w.user_id = p.id
  where p.id = actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'BLOOK_INVENTORY_NOT_FOUND';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'stable_code', b.stable_code,
      'name', b.name,
      'emoji', b.emoji,
      'cost_tokens', b.cost_tokens,
      'owned', ub.user_id is not null,
      'equipped', b.id = actor_active_blook_id
    )
    order by b.sort_order
  )
  into inventory_items
  from public.blooks b
  left join public.user_blooks ub
    on ub.user_id = actor_id and ub.blook_id = b.id
  where b.status = 'published';

  return jsonb_build_object(
    'token_balance', actor_balance,
    'active_blook_id', actor_active_blook_id,
    'items', coalesce(inventory_items, '[]'::jsonb)
  );
end;
$$;

create function public.purchase_blook(blook_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  selected_cost integer;
  actor_balance integer;
  already_owned boolean;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select cost_tokens
  into selected_cost
  from public.blooks
  where id = blook_id and status = 'published';

  if not found then
    raise exception using errcode = 'P0001', message = 'BLOOK_NOT_FOUND';
  end if;

  select token_balance
  into actor_balance
  from public.wallets
  where user_id = actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ECONOMY_WALLET_NOT_FOUND';
  end if;

  select exists(
    select 1
    from public.user_blooks
    where user_id = actor_id and user_blooks.blook_id = purchase_blook.blook_id
  )
  into already_owned;

  if already_owned then
    return public.get_my_blook_inventory();
  end if;

  if actor_balance < selected_cost then
    raise exception using
      errcode = 'P0001',
      message = 'BLOOK_INSUFFICIENT_TOKENS:' || (selected_cost - actor_balance)::text;
  end if;

  insert into public.wallet_transactions (
    user_id, amount, reason, source_type, source_id
  )
  values (
    actor_id,
    -selected_cost,
    'Blook purchase',
    'blook_purchase',
    blook_id
  );

  insert into public.user_blooks (user_id, blook_id, source)
  values (actor_id, blook_id, 'purchase');

  update public.wallets
  set token_balance = actor_balance - selected_cost,
      updated_at = now()
  where user_id = actor_id;

  return public.get_my_blook_inventory();
end;
$$;

create function public.equip_blook(blook_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  perform 1
  from public.blooks
  where id = blook_id and status = 'published';

  if not found then
    raise exception using errcode = 'P0001', message = 'BLOOK_NOT_FOUND';
  end if;

  perform 1
  from public.user_blooks
  where user_id = actor_id and user_blooks.blook_id = equip_blook.blook_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'BLOOK_NOT_OWNED';
  end if;

  update public.profiles
  set active_blook_id = blook_id,
      updated_at = now()
  where id = actor_id;

  return public.get_my_blook_inventory();
end;
$$;

revoke all on function public.get_my_blook_inventory()
from public, anon, authenticated;
revoke all on function public.purchase_blook(uuid)
from public, anon, authenticated;
revoke all on function public.equip_blook(uuid)
from public, anon, authenticated;

grant execute on function public.get_my_blook_inventory() to authenticated;
grant execute on function public.purchase_blook(uuid) to authenticated;
grant execute on function public.equip_blook(uuid) to authenticated;
