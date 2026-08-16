-- Serialize the cross-system registration saga. Auth password updates happen
-- outside the public-schema transaction, so only one request per user may hold
-- the short-lived mutation lease at a time.

create table public.student_registration_claims (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state text not null default 'pending'
    check (state in ('pending', 'completed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_registration_claims_lease_check check (
    (state = 'pending' and lease_token is not null and lease_expires_at is not null)
    or (state = 'completed' and lease_token is null and lease_expires_at is null)
  )
);

alter table public.student_registration_claims enable row level security;

revoke all on public.student_registration_claims
from public, anon, authenticated, service_role;

create function public.claim_student_registration(p_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  selected_claim public.student_registration_claims%rowtype;
  claim_time timestamptz := clock_timestamp();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_attempt_id is null then
    raise exception using errcode = '22023', message = 'ATTEMPT_ID_REQUIRED';
  end if;

  select profile.role
  into actor_role
  from public.profiles as profile
  where profile.id = actor_id;

  if actor_role is distinct from 'student' then
    raise exception using errcode = '42501', message = 'STUDENT_REQUIRED';
  end if;

  select claim.*
  into selected_claim
  from public.student_registration_claims as claim
  where claim.user_id = actor_id
  for update;

  if not found then
    insert into public.student_registration_claims (
      user_id,
      lease_token,
      lease_expires_at
    )
    values (
      actor_id,
      p_attempt_id,
      claim_time + interval '2 minutes'
    );
    return 'ACQUIRED';
  end if;

  if selected_claim.state = 'completed' then
    return 'COMPLETED';
  end if;

  if selected_claim.lease_expires_at <= claim_time then
    update public.student_registration_claims
    set lease_token = p_attempt_id,
        lease_expires_at = claim_time + interval '2 minutes',
        updated_at = claim_time
    where user_id = actor_id;
    return 'ACQUIRED';
  end if;

  return 'IN_PROGRESS';
end;
$$;

create function public.release_student_registration_claim(p_attempt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  update public.student_registration_claims
  set lease_expires_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where user_id = actor_id
    and state = 'pending'
    and lease_token = p_attempt_id;

  return found;
end;
$$;

create function public.complete_student_registration_claim(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  update public.student_registration_claims as claim
  set state = 'completed',
      lease_token = null,
      lease_expires_at = null,
      updated_at = clock_timestamp()
  where claim.user_id = actor_id
    and claim.state = 'pending'
    and claim.lease_token = p_attempt_id
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = actor_id
        and profile.login_account is not null
    );

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'REGISTRATION_CLAIM_LOST';
  end if;
end;
$$;

revoke all on function public.claim_student_registration(uuid)
from public, anon, authenticated;
revoke all on function public.release_student_registration_claim(uuid)
from public, anon, authenticated;
revoke all on function public.complete_student_registration_claim(uuid)
from public, anon, authenticated;

grant execute on function public.claim_student_registration(uuid)
to authenticated;
grant execute on function public.release_student_registration_claim(uuid)
to authenticated;
grant execute on function public.complete_student_registration_claim(uuid)
to authenticated;
