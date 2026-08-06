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
      !['--output', '--docker-container'].includes(flag) ||
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
const databaseUrl = process.env.SUPABASE_DB_URL;
if (!container && !databaseUrl) fail();
if (container && !/^supabase_db_colorplay_restore_[0-9]+$/u.test(container)) {
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
        'postgres',
        '-d',
        'postgres',
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

await writeFile(
  flags.get('--output'),
  `${JSON.stringify(
    {
      schema_version: 1,
      schema_objects: schemaObjects,
      row_counts: rowCounts,
      migration_sha256: migrationSha256,
    },
    null,
    2,
  )}\n`,
  { encoding: 'utf8', mode: 0o600 },
);
