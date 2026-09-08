/* global process, fetch, AbortSignal, console */
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { validateTarget } from '../../supabase/functions/_shared/platform-monitoring-contract.mjs';
import {
  resolveStagingMonitoringCredentials,
  verifyStagingMonitoringCredential,
} from './staging-monitoring-credentials.mjs';
const ref = validateTarget(process.env.STAGING_SUPABASE_PROJECT_REF);
const { deployToken, monitorReadToken } = resolveStagingMonitoringCredentials(
  process.env,
  ref,
);
const quote = (text) => "'" + text.replaceAll("'", "''") + "'";
async function api(path, body) {
  const result = await fetch(
    'https://api.supabase.com/v1/projects/' + ref + path,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + deployToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!result.ok) throw new Error('MONITOR_SETUP_FAILED');
  const bodyText = await result.text();
  return bodyText ? JSON.parse(bodyText) : null;
}
const sql = (query) => api('/database/query', { query });
async function main() {
  await verifyStagingMonitoringCredential({
    monitorReadToken,
    productionRef: 'xdjumzdqyexpyndanwkp',
    stagingRef: ref,
  });
  const migrations = [
    {
      version: '20260905000100',
      name: 'admin_platform_monitoring',
      path: 'supabase/migrations/20260905000100_admin_platform_monitoring.sql',
    },
    {
      version: '20260908000100',
      name: 'admin_monitor_collection_lease',
      path: 'supabase/migrations/20260908000100_admin_monitor_collection_lease.sql',
    },
  ];
  for (const migrationSpec of migrations) {
    const migration = await readFile(migrationSpec.path, 'utf8');
    const existing = await sql(
      "select array_to_string(statements, E'\\n') as sql from supabase_migrations.schema_migrations where version = '" +
        migrationSpec.version +
        "'",
    );
    if (existing.length && existing[0].sql !== migration)
      throw new Error('MONITOR_MIGRATION_DRIFT');
    if (!existing.length) {
      // Apply only the explicit additive allowlist above, never arbitrary pending migrations.
      await sql(
        "begin; set local lock_timeout = '5s';\n" +
          migration +
          '\ninsert into supabase_migrations.schema_migrations(version,name,statements) values (' +
          quote(migrationSpec.version) +
          ',' +
          quote(migrationSpec.name) +
          ',array[' +
          quote(migration) +
          ']); commit;',
      );
    }
  }
  const key = randomBytes(32).toString('hex');
  await api('/secrets', [
    { name: 'ADMIN_MONITOR_KEY', value: key },
    { name: 'ADMIN_MONITOR_MANAGEMENT_TOKEN', value: monitorReadToken },
  ]);
  await sql(
    "do $setup$ declare existing uuid; begin select id into existing from vault.secrets where name = 'colorplay_staging_monitor_key'; if existing is null then perform vault.create_secret(" +
      quote(key) +
      ", 'colorplay_staging_monitor_key'); else perform vault.update_secret(existing," +
      quote(key) +
      "); end if; end $setup$; select cron.schedule('colorplay-staging-platform-monitor','*/15 * * * *','select admin_monitoring.enqueue_collection()');",
  );
  // No key is logged or persisted to build artifacts.
  console.log('STAGING_MONITOR_INSTALLED');
}
main().catch(() => {
  console.error('STAGING_MONITOR_INSTALL_FAILED');
  process.exitCode = 1;
});
