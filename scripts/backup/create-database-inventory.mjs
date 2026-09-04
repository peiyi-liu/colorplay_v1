#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

function fail() {
  process.stderr.write('DATABASE_INVENTORY_FAILED\n');
  process.exit(1);
}

function parseArguments(argumentsList) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (
      !['--output', '--docker-container', '--database'].includes(flag) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      values.has(flag)
    ) {
      fail();
    }
    values.set(flag, value);
  }
  if (!values.has('--output')) fail();
  return values;
}

const flags = parseArguments(process.argv.slice(2));
const container = flags.get('--docker-container');
const database = flags.get('--database') ?? 'postgres';
const databaseUrl = process.env.SUPABASE_DB_URL;
if (!container && !databaseUrl) fail();
if (container && !/^supabase_db_colorplay_restore_[0-9]+$/u.test(container)) {
  fail();
}
if (
  (flags.has('--database') && !container) ||
  (container && !/^(?:postgres|colorplay_restore_target)$/u.test(database))
) {
  fail();
}

function query(sql) {
  const command = container ? 'docker' : 'psql';
  const args = container
    ? [
        'exec',
        container,
        'psql',
        '-X',
        '-U',
        'supabase_admin',
        '-d',
        database,
        '-Atqc',
        sql,
      ]
    : [databaseUrl, '-X', '-Atqc', sql];
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') fail();
  return result.stdout.trim();
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function parseJsonQuery(sql) {
  const value = JSON.parse(query(sql) || 'null');
  if (value === null) fail();
  return value;
}

const tables = JSON.parse(
  query(`
    select coalesce(
      json_agg(
        json_build_object('schema', schemaname, 'name', tablename)
        order by schemaname, tablename
      ),
      '[]'::json
    )
    from pg_tables
    where schemaname not in ('pg_catalog', 'information_schema')
      and schemaname not like 'pg_toast%'
  `) || '[]',
);
if (!Array.isArray(tables)) fail();

const schemaObjects = [];
const rowCounts = {};
for (const table of tables) {
  if (typeof table?.schema !== 'string' || typeof table?.name !== 'string') {
    fail();
  }
  const identifier = `${table.schema}.${table.name}`;
  schemaObjects.push(identifier);
  const count = query(
    `select count(*) from ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`,
  );
  if (!/^[0-9]+$/u.test(count)) fail();
  rowCounts[identifier] = Number(count);
}

const migrationVersions = query(
  'select version from supabase_migrations.schema_migrations order by version',
);
const migrationSha256 = createHash('sha256')
  .update(migrationVersions.length > 0 ? `${migrationVersions}\n` : '')
  .digest('hex');

const customRoles = parseJsonQuery(`
  select coalesce(
    json_agg(
      json_build_object(
        'name', rolname,
        'can_login', rolcanlogin,
        'superuser', rolsuper,
        'inherit', rolinherit,
        'create_role', rolcreaterole,
        'create_database', rolcreatedb,
        'replication', rolreplication,
        'bypass_rls', rolbypassrls
      )
      order by rolname
    ),
    '[]'::json
  )
  from pg_roles
  where rolname not like 'pg\\_%' escape '\\'
    and rolname not in (
      'anon', 'authenticated', 'authenticator', 'dashboard_user',
      'pgbouncer', 'postgres', 'service_role', 'supabase_admin',
      'supabase_auth_admin', 'supabase_functions_admin',
      'supabase_read_only_user', 'supabase_replication_admin',
      'supabase_storage_admin'
    )
`);
if (!Array.isArray(customRoles)) fail();

const authInvariants = parseJsonQuery(`
  select json_build_object(
    'users', case when to_regclass('auth.users') is null then 0 else (select count(*) from auth.users) end,
    'identities', case when to_regclass('auth.identities') is null then 0 else (select count(*) from auth.identities) end,
    'sessions', case when to_regclass('auth.sessions') is null then 0 else (select count(*) from auth.sessions) end,
    'orphan_identities', case when to_regclass('auth.identities') is null or to_regclass('auth.users') is null then 0 else (
      select count(*) from auth.identities identity_record
      left join auth.users user_record on user_record.id = identity_record.user_id
      where user_record.id is null
    ) end,
    'orphan_sessions', case when to_regclass('auth.sessions') is null or to_regclass('auth.users') is null then 0 else (
      select count(*) from auth.sessions session_record
      left join auth.users user_record on user_record.id = session_record.user_id
      where user_record.id is null
    ) end
  )
`);
if (
  typeof authInvariants !== 'object' ||
  authInvariants === null ||
  Object.values(authInvariants).some(
    (value) => typeof value !== 'number' || !Number.isSafeInteger(value),
  )
) {
  fail();
}

const authorizationState = query(`
  with authorization_state as (
    select json_build_object(
      'relations', coalesce((
        select json_agg(
          json_build_object(
            'schema', namespace.nspname,
            'name', relation.relname,
            'kind', relation.relkind,
            'owner', pg_get_userbyid(relation.relowner),
            'rls_enabled', relation.relrowsecurity,
            'rls_forced', relation.relforcerowsecurity,
            'acl', coalesce(relation.relacl::text, '')
          ) order by namespace.nspname, relation.relname
        )
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where relation.relkind in ('r', 'p', 'v', 'm', 'f')
          and namespace.nspname not in ('pg_catalog', 'information_schema')
          and namespace.nspname not like 'pg_toast%'
      ), '[]'::json),
      'policies', coalesce((
        select json_agg(
          json_build_object(
            'schema', namespace.nspname,
            'table', relation.relname,
            'name', policy.polname,
            'permissive', policy.polpermissive,
            'command', policy.polcmd,
            'roles', coalesce((
              select json_agg(pg_get_userbyid(role_oid) order by pg_get_userbyid(role_oid))
              from unnest(policy.polroles) role_oid
            ), '[]'::json),
            'using', coalesce(pg_get_expr(policy.polqual, policy.polrelid), ''),
            'check', coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '')
          ) order by namespace.nspname, relation.relname, policy.polname
        )
        from pg_policy policy
        join pg_class relation on relation.oid = policy.polrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname not in ('pg_catalog', 'information_schema')
          and namespace.nspname not like 'pg_toast%'
      ), '[]'::json),
      'functions', coalesce((
        select json_agg(
          json_build_object(
            'schema', namespace.nspname,
            'name', routine.proname,
            'identity_arguments', pg_get_function_identity_arguments(routine.oid),
            'owner', pg_get_userbyid(routine.proowner),
            'security_definer', routine.prosecdef,
            'configuration', coalesce((
              select json_agg(configuration order by configuration)
              from unnest(routine.proconfig) configuration
            ), '[]'::json),
            'acl', coalesce(routine.proacl::text, '')
          ) order by namespace.nspname, routine.proname, pg_get_function_identity_arguments(routine.oid)
        )
        from pg_proc routine
        join pg_namespace namespace on namespace.oid = routine.pronamespace
        where namespace.nspname not in ('pg_catalog', 'information_schema')
          and namespace.nspname not like 'pg_toast%'
      ), '[]'::json)
    ) as value
  )
  select value::text from authorization_state
`);
if (authorizationState.length === 0) fail();
const authorizationSha256 = createHash('sha256')
  .update(`${authorizationState}\n`)
  .digest('hex');

await writeFile(
  flags.get('--output'),
  `${JSON.stringify(
    {
      schema_version: 2,
      schema_objects: schemaObjects,
      row_counts: rowCounts,
      migration_sha256: migrationSha256,
      custom_roles: customRoles,
      auth_invariants: authInvariants,
      authorization_sha256: authorizationSha256,
    },
    null,
    2,
  )}\n`,
  { encoding: 'utf8', mode: 0o600 },
);
