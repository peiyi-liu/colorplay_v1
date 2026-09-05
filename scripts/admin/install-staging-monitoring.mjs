/* global process, fetch, AbortSignal, console */
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { validateTarget } from '../../supabase/functions/_shared/platform-monitoring-contract.mjs';
const ref = validateTarget(process.env.STAGING_SUPABASE_PROJECT_REF);
const token = process.env.STAGING_SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('MONITOR_CREDENTIAL_MISSING');
const quote = (text) => "'" + text.replaceAll("'", "''") + "'";
async function api(path, body) {
  const result = await fetch(
    'https://api.supabase.com/v1/projects/' + ref + path,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
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
  const migration = await readFile(
    'supabase/migrations/20260905000100_admin_platform_monitoring.sql',
    'utf8',
  );
  const version = '20260905000100';
  const existing = await sql(
    "select array_to_string(statements, E'\\n') as sql from supabase_migrations.schema_migrations where version = '" +
      version +
      "'",
  );
  if (existing.length && existing[0].sql !== migration)
    throw new Error('MONITOR_MIGRATION_DRIFT');
  if (!existing.length) {
    // Apply exactly this additive migration and its ledger record atomically. Never replay other pending migrations.
    await sql(
      "begin; set local lock_timeout = '5s';\n" +
        migration +
        '\ninsert into supabase_migrations.schema_migrations(version,name,statements) values (' +
        quote(version) +
        ",'admin_platform_monitoring',array[" +
        quote(migration) +
        ']); commit;',
    );
  }
  const key = randomBytes(32).toString('hex');
  await api('/secrets', [
    { name: 'ADMIN_MONITOR_KEY', value: key },
    { name: 'ADMIN_MONITOR_MANAGEMENT_TOKEN', value: token },
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
