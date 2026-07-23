create type public.economy_source_type as enum (
  'quiz_finalize',
  'blook_purchase',
  'achievement',
  'assignment',
  'live'
);

create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 100),
  source_type public.economy_source_type not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  constraint xp_transactions_user_source_unique
    unique (user_id, source_type, source_id)
);

create table public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token_balance integer not null default 0 check (token_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 100),
  source_type public.economy_source_type not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  constraint wallet_transactions_user_source_unique
    unique (user_id, source_type, source_id)
);

create index xp_transactions_user_created_idx
  on public.xp_transactions(user_id, created_at desc);
create index wallet_transactions_user_created_idx
  on public.wallet_transactions(user_id, created_at desc);

alter table public.xp_transactions enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

revoke all on public.xp_transactions from anon, authenticated;
revoke all on public.wallets from anon, authenticated;
revoke all on public.wallet_transactions from anon, authenticated;
grant select on public.xp_transactions to authenticated;
grant select on public.wallets to authenticated;
grant select on public.wallet_transactions to authenticated;

create policy xp_transactions_read_own on public.xp_transactions
for select to authenticated
using (user_id = auth.uid());

create policy wallets_read_own on public.wallets
for select to authenticated
using (user_id = auth.uid());

create policy wallet_transactions_read_own on public.wallet_transactions
for select to authenticated
using (user_id = auth.uid());

create function public.reject_economy_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'ECONOMY_LEDGER_IMMUTABLE';
end;
$$;

revoke all on function public.reject_economy_ledger_mutation()
from public, anon, authenticated;

create trigger xp_transactions_immutable
before update or delete on public.xp_transactions
for each row execute function public.reject_economy_ledger_mutation();

create trigger wallet_transactions_immutable
before update or delete on public.wallet_transactions
for each row execute function public.reject_economy_ledger_mutation();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(
        left(btrim(split_part(coalesce(new.email, ''), '@', 1)), 30),
        ''
      ),
      'ColorPlay 使用者'
    )
  );

  insert into public.wallets (user_id) values (new.id);

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user()
from public, anon, authenticated;

insert into public.wallets (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create function public.get_my_economy_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  total_xp bigint;
  ledger_tokens bigint;
  cached_tokens integer;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select coalesce(sum(amount), 0)
  into total_xp
  from public.xp_transactions
  where user_id = actor_id;

  select token_balance
  into cached_tokens
  from public.wallets
  where user_id = actor_id;

  if cached_tokens is null then
    raise exception using errcode = 'P0001', message = 'ECONOMY_WALLET_NOT_FOUND';
  end if;

  select coalesce(sum(amount), 0)
  into ledger_tokens
  from public.wallet_transactions
  where user_id = actor_id;

  return jsonb_build_object(
    'total_xp', total_xp,
    'level', (total_xp / 500) + 1,
    'current_level_xp', total_xp % 500,
    'xp_per_level', 500,
    'token_balance', cached_tokens,
    'wallet_reconciled', cached_tokens = ledger_tokens
  );
end;
$$;

create function public.reconcile_wallet_cache(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ledger_tokens bigint;
  corrected_balance integer;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception using errcode = '42501', message = 'ECONOMY_RECONCILE_FORBIDDEN';
  end if;

  perform 1
  from public.wallets
  where user_id = target_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'ECONOMY_WALLET_NOT_FOUND';
  end if;

  select coalesce(sum(amount), 0)
  into ledger_tokens
  from public.wallet_transactions
  where user_id = target_user_id;

  if ledger_tokens < 0 or ledger_tokens > 2147483647 then
    raise exception using errcode = '22003', message = 'ECONOMY_BALANCE_OUT_OF_RANGE';
  end if;

  corrected_balance := ledger_tokens::integer;
  update public.wallets
  set token_balance = corrected_balance,
      updated_at = now()
  where user_id = target_user_id;

  return corrected_balance;
end;
$$;

revoke all on function public.get_my_economy_summary()
from public, anon, authenticated;
grant execute on function public.get_my_economy_summary() to authenticated;

revoke all on function public.reconcile_wallet_cache(uuid)
from public, anon, authenticated;
grant execute on function public.reconcile_wallet_cache(uuid) to service_role;
