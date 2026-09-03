import { createHash } from 'node:crypto';

// This file intentionally exceeds 500 lines because the manifest validator and
// the complete SQL target/relationship guard form one auditable fail-closed
// contract. Splitting the allowlist from its SQL consumer would permit drift in
// the most destructive path; the I/O adapter remains isolated in the runner.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const RUN_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+){2,11}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]{16,64}$/u;
const MIGRATION_PATTERN = /^20[0-9]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const LABEL_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+){1,7}$/u;

export const CLEANUP_ROW_KEYS = Object.freeze([
  'admin_sessions',
  'admin_invitations',
  'admin_security_operations',
  'admin_command_authorizations',
  'admin_command_executions',
  'teacher_account_operations',
]);
const DATABASE_COUNT_KEYS = Object.freeze([
  'admin_audit_principals',
  'admin_invitations',
  'admin_security_identities',
  'admin_security_operations',
  'admin_sessions',
  'admin_command_authorizations',
  'admin_command_executions',
  'profiles',
  'teacher_account_operations',
]);
const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function fail(code) {
  throw new Error(code);
}

function requireExactKeys(value, expected, code) {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code);
}

function requireString(value, pattern, code) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(code);
  return value;
}

function requireUuid(value, code) {
  return requireString(value, UUID_PATTERN, code);
}

function requireUuidList(value, code) {
  if (!Array.isArray(value)) fail(code);
  const ids = value.map((entry) => requireUuid(entry, code));
  if (new Set(ids).size !== ids.length) fail(code);
  return ids;
}

function equalSets(left, right) {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((entry) => expected.has(entry));
}

/**
 * Validate and return the exact manifest object used by the cleanup runner.
 * Unknown keys are rejected so a misspelled target list cannot be ignored.
 *
 * @param {unknown} input
 */
export function validateCleanupManifest(input) {
  requireExactKeys(
    input,
    [
      'schema_version',
      'environment',
      'project_ref',
      'run_id',
      'git_sha',
      'deployment_id',
      'expected_migration_head',
      'expected_migration_ledger_sha256',
      'cleanup_operation_id',
      'auth_users',
      'profile_ids',
      'admin_principals',
      'rows',
    ],
    'ADMIN_FIXTURE_MANIFEST_SHAPE_INVALID',
  );

  if (input.schema_version !== 1 || input.environment !== 'staging') {
    fail('ADMIN_FIXTURE_MANIFEST_ENVIRONMENT_INVALID');
  }
  requireString(
    input.project_ref,
    PROJECT_REF_PATTERN,
    'ADMIN_FIXTURE_MANIFEST_PROJECT_REF_INVALID',
  );
  requireString(
    input.run_id,
    RUN_ID_PATTERN,
    'ADMIN_FIXTURE_MANIFEST_RUN_ID_INVALID',
  );
  requireString(
    input.git_sha,
    SHA_PATTERN,
    'ADMIN_FIXTURE_MANIFEST_GIT_SHA_INVALID',
  );
  requireString(
    input.deployment_id,
    DEPLOYMENT_ID_PATTERN,
    'ADMIN_FIXTURE_MANIFEST_DEPLOYMENT_ID_INVALID',
  );
  requireString(
    input.expected_migration_head,
    MIGRATION_PATTERN,
    'ADMIN_FIXTURE_MANIFEST_MIGRATION_INVALID',
  );
  requireString(
    input.expected_migration_ledger_sha256,
    SHA256_PATTERN,
    'ADMIN_FIXTURE_MANIFEST_MIGRATION_LEDGER_INVALID',
  );
  requireUuid(
    input.cleanup_operation_id,
    'ADMIN_FIXTURE_MANIFEST_OPERATION_ID_INVALID',
  );

  if (!Array.isArray(input.auth_users) || input.auth_users.length === 0) {
    fail('ADMIN_FIXTURE_MANIFEST_AUTH_USERS_INVALID');
  }
  const labels = [];
  const authIds = [];
  const adminAuthIds = [];
  for (const entry of input.auth_users) {
    requireExactKeys(
      entry,
      ['label', 'id', 'role'],
      'ADMIN_FIXTURE_MANIFEST_AUTH_USER_INVALID',
    );
    labels.push(
      requireString(
        entry.label,
        LABEL_PATTERN,
        'ADMIN_FIXTURE_MANIFEST_AUTH_USER_INVALID',
      ),
    );
    authIds.push(
      requireUuid(entry.id, 'ADMIN_FIXTURE_MANIFEST_AUTH_USER_INVALID'),
    );
    if (!['admin', 'teacher', 'non_admin_denial'].includes(entry.role)) {
      fail('ADMIN_FIXTURE_MANIFEST_AUTH_USER_INVALID');
    }
    if (entry.role === 'admin') adminAuthIds.push(entry.id);
  }
  if (
    new Set(labels).size !== labels.length ||
    new Set(authIds).size !== authIds.length ||
    adminAuthIds.length === 0 ||
    !input.auth_users.some(({ role }) => role === 'teacher')
  ) {
    fail('ADMIN_FIXTURE_MANIFEST_AUTH_USERS_INVALID');
  }

  const profileIds = requireUuidList(
    input.profile_ids,
    'ADMIN_FIXTURE_MANIFEST_PROFILE_IDS_INVALID',
  );
  if (!equalSets(profileIds, authIds)) {
    fail('ADMIN_FIXTURE_MANIFEST_PROFILE_SET_MISMATCH');
  }

  if (!Array.isArray(input.admin_principals)) {
    fail('ADMIN_FIXTURE_MANIFEST_PRINCIPALS_INVALID');
  }
  const principalAuthIds = [];
  const principalIds = [];
  for (const entry of input.admin_principals) {
    requireExactKeys(
      entry,
      ['auth_user_id', 'audit_principal_id'],
      'ADMIN_FIXTURE_MANIFEST_PRINCIPALS_INVALID',
    );
    principalAuthIds.push(
      requireUuid(
        entry.auth_user_id,
        'ADMIN_FIXTURE_MANIFEST_PRINCIPALS_INVALID',
      ),
    );
    principalIds.push(
      requireUuid(
        entry.audit_principal_id,
        'ADMIN_FIXTURE_MANIFEST_PRINCIPALS_INVALID',
      ),
    );
  }
  if (
    new Set(principalAuthIds).size !== principalAuthIds.length ||
    new Set(principalIds).size !== principalIds.length ||
    principalAuthIds.some((id) => !authIds.includes(id)) ||
    adminAuthIds.some((id) => !principalAuthIds.includes(id))
  ) {
    fail('ADMIN_FIXTURE_MANIFEST_PRINCIPAL_SET_MISMATCH');
  }

  requireExactKeys(
    input.rows,
    CLEANUP_ROW_KEYS,
    'ADMIN_FIXTURE_MANIFEST_ROWS_INVALID',
  );
  for (const key of CLEANUP_ROW_KEYS) {
    requireUuidList(input.rows[key], 'ADMIN_FIXTURE_MANIFEST_ROWS_INVALID');
  }
  return input;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObject(value[key])]),
  );
}

export function manifestSha256(manifest) {
  const valid = validateCleanupManifest(manifest);
  return createHash('sha256')
    .update(JSON.stringify(sortObject(valid)))
    .digest('hex');
}

export function validateAuthFixtureMetadata(fixture, runId, appMetadata) {
  if (
    !isRecord(appMetadata) ||
    appMetadata.colorplay_fixture_environment !== 'staging' ||
    appMetadata.colorplay_fixture_run_id !== runId ||
    appMetadata.colorplay_fixture_label !== fixture.label
  ) {
    fail('ADMIN_FIXTURE_CLEANUP_AUTH_SCOPE_INVALID');
  }
}

export function validateCleanupSnapshot(
  snapshot,
  expectedMigrationHead,
  expectedMigrationLedgerSha256,
) {
  requireExactKeys(
    snapshot,
    [
      'auth_users_present',
      'database_counts',
      'migration_head',
      'migration_ledger_sha256',
    ],
    'ADMIN_FIXTURE_CLEANUP_SNAPSHOT_INVALID',
  );
  if (
    !Number.isSafeInteger(snapshot.auth_users_present) ||
    snapshot.auth_users_present < 0 ||
    snapshot.migration_head !== expectedMigrationHead ||
    snapshot.migration_ledger_sha256 !== expectedMigrationLedgerSha256
  ) {
    fail('ADMIN_FIXTURE_CLEANUP_SNAPSHOT_INVALID');
  }
  requireExactKeys(
    snapshot.database_counts,
    DATABASE_COUNT_KEYS,
    'ADMIN_FIXTURE_CLEANUP_SNAPSHOT_INVALID',
  );
  for (const count of Object.values(snapshot.database_counts)) {
    if (!Number.isSafeInteger(count) || count < 0) {
      fail('ADMIN_FIXTURE_CLEANUP_SNAPSHOT_INVALID');
    }
  }
  return snapshot;
}

function uuidValues(ids, columns = ['id']) {
  if (ids.length === 0) {
    return `select ${columns.map((name) => `null::uuid as ${name}`).join(', ')} where false`;
  }
  return `select * from (values ${ids
    .map((entry) => {
      const values = Array.isArray(entry) ? entry : [entry];
      return `(${values.map((id) => `'${id}'::uuid`).join(', ')})`;
    })
    .join(', ')}) as source(${columns.join(', ')})`;
}

function targetTableSql(manifest) {
  const principalPairs = manifest.admin_principals.map((entry) => [
    entry.auth_user_id,
    entry.audit_principal_id,
  ]);
  return `
create temporary table cleanup_auth_users on commit drop as
${uuidValues(manifest.auth_users.map(({ id }) => id))};
create temporary table cleanup_profiles on commit drop as
${uuidValues(manifest.profile_ids)};
create temporary table cleanup_admin_principals on commit drop as
${uuidValues(principalPairs, ['auth_user_id', 'audit_principal_id'])};
${CLEANUP_ROW_KEYS.map(
  (key) => `create temporary table cleanup_${key} on commit drop as
${uuidValues(manifest.rows[key])};`,
).join('\n')}
`;
}

function databaseCountsSql() {
  return `
select jsonb_build_object(
  'migration_head', (
    select max(version) from supabase_migrations.schema_migrations
  ),
  'migration_ledger_sha256', (
    select encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          coalesce(string_agg(version, E'\\n' order by version), ''),
          'UTF8'
        )
      ),
      'hex'
    )
    from supabase_migrations.schema_migrations
  ),
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
)::text as cleanup_snapshot;
`;
}

function preflightGuardsSql(manifest) {
  return `
do $cleanup_guard$
declare
  relation_row record;
  contains_target boolean;
begin
  if (select max(version) from supabase_migrations.schema_migrations)
      <> '${manifest.expected_migration_head}' then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_MIGRATION_MISMATCH';
  end if;

  if (
    select encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          coalesce(string_agg(version, E'\\n' order by version), ''),
          'UTF8'
        )
      ),
      'hex'
    )
    from supabase_migrations.schema_migrations
  ) <> '${manifest.expected_migration_ledger_sha256}' then
    raise exception using message = 'ADMIN_FIXTURE_CLEANUP_MIGRATION_LEDGER_MISMATCH';
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
    join lateral unnest(constraint_row.conkey) with ordinality as key(attnum, position)
      on true
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
    ) into contains_target using array(select id from cleanup_profiles);
    if contains_target then
      raise exception using message = 'ADMIN_FIXTURE_CLEANUP_DOMAIN_REFERENCE_PRESENT';
    end if;
  end loop;
end
$cleanup_guard$;
`;
}

export function buildDatabaseSql(manifest, mode) {
  const valid = validateCleanupManifest(manifest);
  if (!['dry-run', 'verify'].includes(mode)) {
    fail('ADMIN_FIXTURE_CLEANUP_MODE_INVALID');
  }
  const targetSetup = targetTableSql(valid);
  const guard = preflightGuardsSql(valid);
  return `begin;\nset transaction read only;\nselect pg_advisory_xact_lock(hashtextextended('admin_fixture_cleanup:${valid.run_id}', 20260903));${targetSetup}${guard}${databaseCountsSql()}rollback;`;
}

export function buildCleanupRpcArguments(manifest) {
  const valid = validateCleanupManifest(manifest);
  return {
    p_admin_command_authorization_ids: valid.rows.admin_command_authorizations,
    p_admin_command_execution_ids: valid.rows.admin_command_executions,
    p_admin_invitation_ids: valid.rows.admin_invitations,
    p_admin_principal_auth_user_ids: valid.admin_principals.map(
      ({ auth_user_id }) => auth_user_id,
    ),
    p_admin_principal_ids: valid.admin_principals.map(
      ({ audit_principal_id }) => audit_principal_id,
    ),
    p_admin_security_operation_ids: valid.rows.admin_security_operations,
    p_admin_session_ids: valid.rows.admin_sessions,
    p_auth_user_ids: valid.auth_users.map(({ id }) => id),
    p_auth_user_labels: valid.auth_users.map(({ label }) => label),
    p_cleanup_operation_id: valid.cleanup_operation_id,
    p_expected_migration_head: valid.expected_migration_head,
    p_expected_migration_ledger_sha256: valid.expected_migration_ledger_sha256,
    p_profile_ids: valid.profile_ids,
    p_project_ref: valid.project_ref,
    p_run_id: valid.run_id,
    p_teacher_account_operation_ids: valid.rows.teacher_account_operations,
  };
}
