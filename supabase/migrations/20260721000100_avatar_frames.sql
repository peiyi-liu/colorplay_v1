-- GGAME 商店「尊絕外顯邊框」商品類別：目錄、擁有、裝備與帳本交易。
-- 模式完全鏡射 20260716000300_blook_inventory.sql 的信任邊界設計。

alter type public.economy_source_type add value if not exists 'frame_purchase';

create table public.avatar_frames (
  id uuid primary key,
  stable_code text unique not null check (stable_code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  gradient_start text not null check (gradient_start ~ '^#[0-9a-f]{6}$'),
  gradient_end text not null check (gradient_end ~ '^#[0-9a-f]{6}$'),
  cost_tokens integer not null check (cost_tokens >= 0),
  status text not null check (status in ('published', 'archived')),
  sort_order integer unique not null check (sort_order > 0),
  created_at timestamptz not null default now()
);

insert into public.avatar_frames (
  id, stable_code, name, gradient_start, gradient_end, cost_tokens, status, sort_order
)
values
  ('60000000-0000-0000-0000-000000000001', 'lava_gold', '熔岩流金', '#f59e0b', '#eab308', 0, 'published', 1),
  ('60000000-0000-0000-0000-000000000002', 'deep_neon', '深海霓虹', '#6366f1', '#0ea5e9', 25, 'published', 2);

alter table public.profiles
add column active_frame_id uuid references public.avatar_frames(id) on delete restrict;

create table public.user_frames (
  user_id uuid not null references public.profiles(id) on delete cascade,
  frame_id uuid not null references public.avatar_frames(id) on delete restrict,
  acquired_at timestamptz not null default now(),
  source text not null check (source in ('default', 'purchase')),
  primary key (user_id, frame_id)
);

create index user_frames_frame_id_idx on public.user_frames(frame_id);

insert into public.user_frames (user_id, frame_id, source)
select
  p.id,
  '60000000-0000-0000-0000-000000000001'::uuid,
  'default'
from public.profiles p
order by p.id
on conflict (user_id, frame_id) do nothing;

update public.profiles
set active_frame_id = '60000000-0000-0000-0000-000000000001'::uuid
where active_frame_id is null;

alter table public.profiles alter column active_frame_id set not null;

alter table public.avatar_frames enable row level security;
alter table public.user_frames enable row level security;

revoke all on public.avatar_frames from anon, authenticated;
revoke all on public.user_frames from anon, authenticated;
grant select on public.avatar_frames to authenticated;
grant select on public.user_frames to authenticated;

create policy avatar_frames_read_published on public.avatar_frames
for select to authenticated
using (status = 'published');

create policy user_frames_read_own on public.user_frames
for select to authenticated
using (user_id = auth.uid());

-- 新帳號：同時發放預設 Blook 與預設邊框（覆寫既有 trigger 本體）。
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name, active_blook_id, active_frame_id)
  values (
    new.id,
    coalesce(
      nullif(
        left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 30),
        ''
      ),
      'ColorPlay 使用者'
    ),
    '50000000-0000-0000-0000-000000000001'::uuid,
    '60000000-0000-0000-0000-000000000001'::uuid
  );

  insert into public.wallets (user_id) values (new.id);

  insert into public.user_blooks (user_id, blook_id, source)
  values (
    new.id,
    '50000000-0000-0000-0000-000000000001'::uuid,
    'default'
  );

  insert into public.user_frames (user_id, frame_id, source)
  values (
    new.id,
    '60000000-0000-0000-0000-000000000001'::uuid,
    'default'
  );

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user()
from public, anon, authenticated;

create function public.get_my_frame_inventory()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_balance integer;
  actor_active_frame_id uuid;
  inventory_items jsonb;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select w.token_balance, p.active_frame_id
  into actor_balance, actor_active_frame_id
  from public.profiles p
  join public.wallets w on w.user_id = p.id
  where p.id = actor_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'FRAME_INVENTORY_NOT_FOUND';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'stable_code', f.stable_code,
      'name', f.name,
      'gradient_start', f.gradient_start,
      'gradient_end', f.gradient_end,
      'cost_tokens', f.cost_tokens,
      'owned', uf.user_id is not null,
      'equipped', f.id = actor_active_frame_id
    )
    order by f.sort_order
  )
  into inventory_items
  from public.avatar_frames f
  left join public.user_frames uf
    on uf.user_id = actor_id and uf.frame_id = f.id
  where f.status = 'published';

  return jsonb_build_object(
    'token_balance', actor_balance,
    'active_frame_id', actor_active_frame_id,
    'items', coalesce(inventory_items, '[]'::jsonb)
  );
end;
$$;

create function public.purchase_frame(frame_id uuid)
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
  from public.avatar_frames
  where id = frame_id and status = 'published';

  if not found then
    raise exception using errcode = 'P0001', message = 'FRAME_NOT_FOUND';
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
    from public.user_frames
    where user_id = actor_id and user_frames.frame_id = purchase_frame.frame_id
  )
  into already_owned;

  if already_owned then
    return public.get_my_frame_inventory();
  end if;

  if actor_balance < selected_cost then
    raise exception using
      errcode = 'P0001',
      message = 'FRAME_INSUFFICIENT_TOKENS:' || (selected_cost - actor_balance)::text;
  end if;

  insert into public.wallet_transactions (
    user_id, amount, reason, source_type, source_id
  )
  values (
    actor_id,
    -selected_cost,
    'Avatar frame purchase',
    'frame_purchase',
    frame_id
  );

  insert into public.user_frames (user_id, frame_id, source)
  values (actor_id, frame_id, 'purchase');

  update public.wallets
  set token_balance = actor_balance - selected_cost,
      updated_at = now()
  where user_id = actor_id;

  return public.get_my_frame_inventory();
end;
$$;

create function public.equip_frame(frame_id uuid)
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
  from public.avatar_frames
  where id = frame_id and status = 'published';

  if not found then
    raise exception using errcode = 'P0001', message = 'FRAME_NOT_FOUND';
  end if;

  perform 1
  from public.user_frames
  where user_id = actor_id and user_frames.frame_id = equip_frame.frame_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FRAME_NOT_OWNED';
  end if;

  update public.profiles
  set active_frame_id = frame_id,
      updated_at = now()
  where id = actor_id;

  return public.get_my_frame_inventory();
end;
$$;

revoke all on function public.get_my_frame_inventory()
from public, anon, authenticated;
revoke all on function public.purchase_frame(uuid)
from public, anon, authenticated;
revoke all on function public.equip_frame(uuid)
from public, anon, authenticated;

grant execute on function public.get_my_frame_inventory() to authenticated;
grant execute on function public.purchase_frame(uuid) to authenticated;
grant execute on function public.equip_frame(uuid) to authenticated;
