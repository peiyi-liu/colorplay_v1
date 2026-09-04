-- Owner-gated Hosted Admin fixture cleanup. The RPC is the only database
-- mutation boundary; the CLI's direct psql path remains read-only.
-- This file intentionally keeps the transaction, allowlist, relationship
-- guards, and grants together so no separately callable privileged helper can
-- drift from or bypass the audited cleanup boundary.

create function public.cleanup_hosted_admin_fixtures(
  p_project_ref text,
  p_run_id text,
  p_expected_migration_head text,
  p_expected_migration_ledger_sha256 text,
  p_cleanup_operation_id uuid,
  p_auth_user_ids uuid[],
  p_auth_user_labels text[],
  p_profile_ids uuid[],
  p_admin_principal_auth_user_ids uuid[],
  p_admin_principal_ids uuid[],
  p_admin_session_ids uuid[],
  p_admin_invitation_ids uuid[],
  p_admin_security_operation_ids uuid[],
  p_admin_command_authorization_ids uuid[],
  p_admin_command_execution_ids uuid[],
  p_teacher_account_operation_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  relation_row record;
  contains_target boolean;
  migration_head text;
  migration_ledger_sha256 text;
begin
  if auth.role() <> 'service_role' then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_SERVICE_ROLE_REQUIRED';
  end if;

  if p_project_ref !~ '^[a-z]{20}$'
    or p_run_id !~ '^[a-z0-9]+(-[a-z0-9]+){2,11}$'
    or p_expected_migration_head !~ '^20[0-9]{12}$'
    or p_expected_migration_ledger_sha256 !~ '^[0-9a-f]{64}$'
    or p_auth_user_ids is null
    or p_auth_user_labels is null
    or p_profile_ids is null
    or p_admin_principal_auth_user_ids is null
    or p_admin_principal_ids is null
    or p_admin_session_ids is null
    or p_admin_invitation_ids is null
    or p_admin_security_operation_ids is null
    or p_admin_command_authorization_ids is null
    or p_admin_command_execution_ids is null
    or p_teacher_account_operation_ids is null
    or cardinality(p_auth_user_ids) = 0
    or cardinality(p_auth_user_ids) <> cardinality(p_auth_user_labels)
    or cardinality(p_admin_principal_auth_user_ids)
      <> cardinality(p_admin_principal_ids)
    or cardinality(p_admin_principal_ids) = 0
  then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_MANIFEST_INVALID';
  end if;

  if cardinality(p_auth_user_ids) <>
      (select count(distinct value) from unnest(p_auth_user_ids) value)
    or cardinality(p_auth_user_labels) <>
      (select count(distinct value) from unnest(p_auth_user_labels) value)
    or cardinality(p_profile_ids) <>
      (select count(distinct value) from unnest(p_profile_ids) value)
    or cardinality(p_admin_principal_auth_user_ids) <>
      (select count(distinct value)
       from unnest(p_admin_principal_auth_user_ids) value)
    or cardinality(p_admin_principal_ids) <>
      (select count(distinct value) from unnest(p_admin_principal_ids) value)
    or cardinality(p_admin_session_ids) <>
      (select count(distinct value) from unnest(p_admin_session_ids) value)
    or cardinality(p_admin_invitation_ids) <>
      (select count(distinct value) from unnest(p_admin_invitation_ids) value)
    or cardinality(p_admin_security_operation_ids) <>
      (select count(distinct value)
       from unnest(p_admin_security_operation_ids) value)
    or cardinality(p_admin_command_authorization_ids) <>
      (select count(distinct value)
       from unnest(p_admin_command_authorization_ids) value)
    or cardinality(p_admin_command_execution_ids) <>
      (select count(distinct value)
       from unnest(p_admin_command_execution_ids) value)
    or cardinality(p_teacher_account_operation_ids) <>
      (select count(distinct value)
       from unnest(p_teacher_account_operation_ids) value)
  then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_MANIFEST_INVALID';
  end if;

  if exists (
    (select unnest(p_auth_user_ids) except select unnest(p_profile_ids))
    union all
    (select unnest(p_profile_ids) except select unnest(p_auth_user_ids))
  ) or exists (
    select 1
    from unnest(p_admin_principal_auth_user_ids) value
    where value <> all (p_auth_user_ids)
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_MANIFEST_INVALID';
  end if;

  select max(version),
    encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          coalesce(string_agg(version, E'\n' order by version), ''),
          'UTF8'
        )
      ),
      'hex'
    )
  into migration_head, migration_ledger_sha256
  from supabase_migrations.schema_migrations;

  if migration_head <> p_expected_migration_head then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_MIGRATION_MISMATCH';
  end if;
  if migration_ledger_sha256 <> p_expected_migration_ledger_sha256 then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_MIGRATION_LEDGER_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('admin_fixture_cleanup:' || p_run_id, 20260903)
  );

  create temporary table cleanup_auth_users on commit drop as
    select * from unnest(p_auth_user_ids, p_auth_user_labels) as value(id, label);
  create temporary table cleanup_profiles on commit drop as
    select unnest(p_profile_ids) as id;
  create temporary table cleanup_admin_principals on commit drop as
    select *
    from unnest(
      p_admin_principal_auth_user_ids,
      p_admin_principal_ids
    ) as value(auth_user_id, audit_principal_id);
  create temporary table cleanup_admin_sessions on commit drop as
    select unnest(p_admin_session_ids) as id;
  create temporary table cleanup_admin_invitations on commit drop as
    select unnest(p_admin_invitation_ids) as id;
  create temporary table cleanup_admin_security_operations on commit drop as
    select unnest(p_admin_security_operation_ids) as id;
  create temporary table cleanup_admin_command_authorizations on commit drop as
    select unnest(p_admin_command_authorization_ids) as id;
  create temporary table cleanup_admin_command_executions on commit drop as
    select unnest(p_admin_command_execution_ids) as id;
  create temporary table cleanup_teacher_account_operations on commit drop as
    select unnest(p_teacher_account_operation_ids) as id;

  if exists (
    select 1
    from auth.users auth_user
    join cleanup_auth_users target on target.id = auth_user.id
    where auth_user.raw_app_meta_data->>'colorplay_fixture_environment'
        is distinct from 'staging'
      or auth_user.raw_app_meta_data->>'colorplay_fixture_run_id'
        is distinct from p_run_id
      or auth_user.raw_app_meta_data->>'colorplay_fixture_label'
        is distinct from target.label
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_AUTH_SCOPE_INVALID';
  end if;

  if exists (
    select 1 from public.admin_audit_principals principal
    join cleanup_auth_users target on target.id = principal.user_id
    left join cleanup_admin_principals expected
      on expected.auth_user_id = principal.user_id
     and expected.audit_principal_id = principal.id
    where expected.auth_user_id is null
  ) or exists (
    select 1 from public.admin_audit_principals principal
    join cleanup_admin_principals target
      on target.audit_principal_id = principal.id
    where principal.user_id is not null
      and principal.user_id <> target.auth_user_id
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_PRINCIPAL_SCOPE_INVALID';
  end if;

  if exists (
    select 1 from public.admin_security_identities identity_row
    join cleanup_auth_users target on target.id = identity_row.admin_user_id
    left join cleanup_admin_principals expected
      on expected.auth_user_id = identity_row.admin_user_id
     and expected.audit_principal_id = identity_row.audit_principal_id
    where expected.auth_user_id is null
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_IDENTITY_SCOPE_INVALID';
  end if;

  if exists (
    select 1 from public.admin_security_identities identity_row
    join cleanup_admin_principals expected
      on expected.audit_principal_id = identity_row.audit_principal_id
    where identity_row.admin_user_id <> expected.auth_user_id
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_IDENTITY_PRINCIPAL_SCOPE_INVALID';
  end if;

  if exists (
    select 1 from public.profiles profile
    join cleanup_profiles target using (id)
    where profile.active_blook_id <>
        '50000000-0000-0000-0000-000000000001'::uuid
      or profile.active_frame_id <>
        '60000000-0000-0000-0000-000000000001'::uuid
  ) or exists (
    select 1 from public.wallets wallet
    join cleanup_profiles target on target.id = wallet.user_id
    where wallet.token_balance <> 0
  ) or exists (
    select 1 from public.user_blooks owned
    join cleanup_profiles target on target.id = owned.user_id
    where owned.blook_id <>
        '50000000-0000-0000-0000-000000000001'::uuid
      or owned.source <> 'default'
  ) or exists (
    select 1 from public.user_frames owned
    join cleanup_profiles target on target.id = owned.user_id
    where owned.frame_id <>
        '60000000-0000-0000-0000-000000000001'::uuid
      or owned.source <> 'default'
  ) or exists (
    select 1 from public.achievement_progress progress
    join cleanup_profiles target on target.id = progress.user_id
    where progress.last_source_type is distinct from 'blook_acquired'
      or progress.last_source_id is distinct from
        '50000000-0000-0000-0000-000000000001'::uuid
  ) or exists (
    select 1 from public.achievement_unlocks unlock
    join cleanup_profiles target on target.id = unlock.user_id
    where unlock.source_type <> 'blook_acquired'
      or unlock.source_id <>
        '50000000-0000-0000-0000-000000000001'::uuid
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_BOOTSTRAP_STATE_INVALID';
  end if;

  if exists (
    select 1 from public.admin_sessions row
    where (
      row.admin_user_id in (select id from cleanup_auth_users)
      or row.audit_principal_id in (
        select audit_principal_id from cleanup_admin_principals
      )
    ) and row.id not in (select id from cleanup_admin_sessions)
  ) or exists (
    select 1 from public.admin_sessions row
    join cleanup_admin_sessions target using (id)
    where row.admin_user_id not in (select id from cleanup_auth_users)
      and row.audit_principal_id not in (
        select audit_principal_id from cleanup_admin_principals
      )
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_SESSION_SCOPE_INVALID';
  end if;

  if exists (
    select 1 from public.admin_invitations row
    where (
      row.issuer_principal_id in (
        select audit_principal_id from cleanup_admin_principals
      ) or row.accepted_principal_id in (
        select audit_principal_id from cleanup_admin_principals
      )
    ) and row.id not in (select id from cleanup_admin_invitations)
  ) or exists (
    select 1 from public.admin_invitations row
    join cleanup_admin_invitations target using (id)
    where row.issuer_principal_id not in (
      select audit_principal_id from cleanup_admin_principals
    ) and coalesce(
      row.accepted_principal_id in (
        select audit_principal_id from cleanup_admin_principals
      ), false
    ) = false
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_INVITATION_SCOPE_INVALID';
  end if;

  if exists (
    select 1 from public.admin_security_operations row
    where row.target_principal_id in (
      select audit_principal_id from cleanup_admin_principals
    ) and row.id not in (select id from cleanup_admin_security_operations)
  ) or exists (
    select 1 from public.admin_security_operations row
    join cleanup_admin_security_operations target using (id)
    where row.target_principal_id not in (
      select audit_principal_id from cleanup_admin_principals
    )
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_SECURITY_OPERATION_SCOPE_INVALID';
  end if;

  if exists (
    select 1 from public.admin_command_authorizations row
    where row.actor_principal_id in (
      select audit_principal_id from cleanup_admin_principals
    ) and row.id not in (select id from cleanup_admin_command_authorizations)
  ) or exists (
    select 1 from public.admin_command_authorizations row
    join cleanup_admin_command_authorizations target using (id)
    where row.actor_principal_id not in (
      select audit_principal_id from cleanup_admin_principals
    )
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_AUTHORIZATION_SCOPE_INVALID';
  end if;

  if exists (
    select 1 from public.admin_command_executions row
    where row.actor_principal_id in (
      select audit_principal_id from cleanup_admin_principals
    ) and row.id not in (select id from cleanup_admin_command_executions)
  ) or exists (
    select 1 from public.admin_command_executions row
    join cleanup_admin_command_executions target using (id)
    where row.actor_principal_id not in (
      select audit_principal_id from cleanup_admin_principals
    )
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_EXECUTION_SCOPE_INVALID';
  end if;

  if exists (
    select 1 from admin_private.teacher_account_operations row
    where (
      row.actor_principal_id in (
        select audit_principal_id from cleanup_admin_principals
      ) or row.teacher_id in (select id from cleanup_auth_users)
        or row.reserved_auth_user_id in (select id from cleanup_auth_users)
        or row.cleanup_auth_user_id in (select id from cleanup_auth_users)
        or row.command_execution_id in (
          select id from cleanup_admin_command_executions
        )
    ) and row.id not in (select id from cleanup_teacher_account_operations)
  ) or exists (
    select 1 from admin_private.teacher_account_operations row
    join cleanup_teacher_account_operations target using (id)
    where row.actor_principal_id not in (
      select audit_principal_id from cleanup_admin_principals
    ) and coalesce(row.teacher_id in (select id from cleanup_auth_users), false) = false
      and coalesce(
        row.reserved_auth_user_id in (select id from cleanup_auth_users), false
      ) = false
      and coalesce(
        row.cleanup_auth_user_id in (select id from cleanup_auth_users), false
      ) = false
      and coalesce(
        row.command_execution_id in (
          select id from cleanup_admin_command_executions
        ), false
      ) = false
  ) then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_TEACHER_OPERATION_SCOPE_INVALID';
  end if;

  for relation_row in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      attribute.attname as column_name
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join lateral unnest(constraint_row.conkey) with ordinality
      as key(attnum, position) on true
    join pg_attribute attribute
      on attribute.attrelid = relation.oid and attribute.attnum = key.attnum
    where constraint_row.contype = 'f'
      and cardinality(constraint_row.conkey) = 1
      and namespace.nspname in ('public', 'admin_private')
      and constraint_row.confrelid in (
        'public.profiles'::regclass,
        'auth.users'::regclass
      )
      and not (
        namespace.nspname = 'public' and relation.relname in (
          'profiles', 'admin_security_identities', 'admin_audit_principals',
          'wallets', 'user_blooks', 'user_frames', 'achievement_progress',
          'achievement_unlocks'
        )
      )
      and not (
        namespace.nspname = 'admin_private'
        and relation.relname = 'teacher_account_operations'
      )
  loop
    execute format(
      'select exists (select 1 from %I.%I where %I = any ($1))',
      relation_row.schema_name,
      relation_row.table_name,
      relation_row.column_name
    ) into contains_target using p_profile_ids;
    if contains_target then
      raise exception using message = 'ADMIN_FIXTURE_CLEANUP_DOMAIN_REFERENCE_PRESENT';
    end if;
  end loop;

  insert into public.admin_audit_events (
    actor_type, action, target_type, target_principal_id, result,
    runbook_operation_id, source_summary_redacted
  )
  select
    'owner_out_of_band',
    'cleanup_hosted_admin_fixture_database',
    'admin_audit_principal',
    target.audit_principal_id,
    'database_cleanup_complete',
    p_cleanup_operation_id,
    'fixture cleanup run ' || p_run_id || ' project ' || p_project_ref
  from cleanup_admin_principals target
  where exists (
    select 1 from public.admin_audit_principals principal
    where principal.id = target.audit_principal_id
  ) and not exists (
    select 1 from public.admin_audit_events event
    where event.runbook_operation_id = p_cleanup_operation_id
      and event.action = 'cleanup_hosted_admin_fixture_database'
      and event.target_principal_id = target.audit_principal_id
  );

  delete from admin_private.teacher_account_operations
  where id in (select id from cleanup_teacher_account_operations);
  delete from public.admin_command_executions
  where id in (select id from cleanup_admin_command_executions);
  delete from public.admin_command_authorizations
  where id in (select id from cleanup_admin_command_authorizations);
  delete from public.admin_security_operations
  where id in (select id from cleanup_admin_security_operations);
  delete from public.admin_invitations
  where id in (select id from cleanup_admin_invitations);
  delete from public.admin_sessions
  where id in (select id from cleanup_admin_sessions);
  delete from public.admin_security_identities
  where admin_user_id in (select id from cleanup_auth_users);
  delete from public.profiles
  where id in (select id from cleanup_profiles);
  update public.admin_audit_principals as principal
  set user_id = null, tombstoned_at = coalesce(principal.tombstoned_at, now())
  where principal.id in (
    select audit_principal_id from cleanup_admin_principals
  );

  return jsonb_build_object(
    'migration_head', migration_head,
    'migration_ledger_sha256', migration_ledger_sha256,
    'database_counts', jsonb_build_object(
      'profiles', (
        select count(*) from public.profiles row
        join cleanup_profiles target using (id)
      ),
      'admin_audit_principals', (
        select count(*) from public.admin_audit_principals row
        join cleanup_admin_principals target
          on target.audit_principal_id = row.id
        where row.user_id is not null or row.tombstoned_at is null
      ),
      'admin_security_identities', (
        select count(*) from public.admin_security_identities row
        join cleanup_auth_users target on target.id = row.admin_user_id
      ),
      'admin_sessions', (
        select count(*) from public.admin_sessions row
        join cleanup_admin_sessions target using (id)
      ),
      'admin_invitations', (
        select count(*) from public.admin_invitations row
        join cleanup_admin_invitations target using (id)
      ),
      'admin_security_operations', (
        select count(*) from public.admin_security_operations row
        join cleanup_admin_security_operations target using (id)
      ),
      'admin_command_authorizations', (
        select count(*) from public.admin_command_authorizations row
        join cleanup_admin_command_authorizations target using (id)
      ),
      'admin_command_executions', (
        select count(*) from public.admin_command_executions row
        join cleanup_admin_command_executions target using (id)
      ),
      'teacher_account_operations', (
        select count(*) from admin_private.teacher_account_operations row
        join cleanup_teacher_account_operations target using (id)
      )
    )
  );
end;
$$;

revoke all on function public.cleanup_hosted_admin_fixtures(
  text, text, text, text, uuid, uuid[], text[], uuid[], uuid[], uuid[],
  uuid[], uuid[], uuid[], uuid[], uuid[], uuid[]
) from public, anon, authenticated;
grant execute on function public.cleanup_hosted_admin_fixtures(
  text, text, text, text, uuid, uuid[], text[], uuid[], uuid[], uuid[],
  uuid[], uuid[], uuid[], uuid[], uuid[], uuid[]
) to service_role;
