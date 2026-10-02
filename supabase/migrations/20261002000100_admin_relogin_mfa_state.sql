-- A password login must reach MFA before becoming privileged. A stale session
-- in the same Auth login must still sign out; activity cannot revive it.
create or replace function public.get_admin_session_state()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_auth jsonb;
  v_identity public.admin_security_identities;
  v_jwt_session uuid;
begin
  perform set_config('statement_timeout', '5000', true);
  v_auth := public.admin_internal_authorize();
  if (v_auth ->> 'ok')::boolean then
    return jsonb_build_object('state', 'privileged',
      'mfa_age_seconds', (v_auth ->> 'mfa_age_seconds')::int);
  end if;
  if auth.uid() is null then
    return jsonb_build_object('state', 'none');
  end if;
  select * into v_identity from public.admin_security_identities
    where admin_user_id = auth.uid();
  if not found then
    return jsonb_build_object('state', 'none');
  end if;

  v_jwt_session := nullif(coalesce(auth.jwt() ->> 'session_id',
    current_setting('request.jwt.claim.session_id', true)), '')::uuid;
  if v_identity.state = 'active' and v_jwt_session is not null
     and not exists (
       select 1 from public.admin_sessions
       where admin_user_id = auth.uid() and auth_session_id = v_jwt_session
     ) then
    -- Include revoked records in the lookup: a previously privileged login
    -- cannot re-enter MFA to revive an expired or explicitly revoked session.
    return jsonb_build_object('state', 'mfa_required');
  end if;
  return jsonb_build_object('state', case v_identity.state
    when 'active_pending_mfa' then 'pending_mfa'
    when 'recovery_pending' then 'recovery_pending'
    when 'deactivated' then 'deactivated'
    else 'stale' end);
end;
$$;

revoke execute on function public.get_admin_session_state() from public, anon;
grant execute on function public.get_admin_session_state() to authenticated;
