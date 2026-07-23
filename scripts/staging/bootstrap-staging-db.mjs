#!/usr/bin/env node
/**
 * Staging 資料庫引導：把（已盤點的）舊 Supabase 專案重置為 ColorPlay Staging。
 *
 * 這是破壞性操作：會刪除該專案 public schema 的全部資料表與所有 auth 使用者，
 * 然後依序套用本 repo 的 migrations 與內容種子，最後建立測試帳號。
 *
 * 用法：
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx STAGING_PROJECT_REF=xxxx \
 *     node scripts/staging/bootstrap-staging-db.mjs --confirm-wipe
 *
 * 冪等：可重複執行（每次都重置到乾淨基準）。
 */
import console from 'node:console';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.STAGING_PROJECT_REF;
if (!token || !ref) {
  console.error('缺少 SUPABASE_ACCESS_TOKEN 或 STAGING_PROJECT_REF 環境變數。');
  process.exit(1);
}
if (!process.argv.includes('--confirm-wipe')) {
  console.error('這會清空專案資料。確認後加上 --confirm-wipe 再執行。');
  process.exit(1);
}

const api = `https://api.supabase.com/v1/projects/${ref}`;

async function runSql(label, sql) {
  const response = await globalThis.fetch(`${api}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${label} 失敗（HTTP ${response.status}）：${text.slice(0, 500)}`,
    );
  }
  console.log(`✓ ${label}`);
}

console.log(`目標專案：${ref}`);

await runSql(
  '重置 public schema 與使用者',
  `
  drop schema if exists public cascade;
  create schema public;
  grant usage on schema public to postgres, anon, authenticated, service_role;
  comment on schema public is 'standard public schema';
  alter default privileges for role postgres in schema public
    grant truncate, references, trigger, maintain on tables
    to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public
    grant update on sequences to anon, authenticated, service_role;
  delete from auth.users;
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
  truncate supabase_migrations.schema_migrations;
  `,
);

const migrationsDir = join(projectRoot, 'supabase/migrations');
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();
for (const name of migrations) {
  const sql = readFileSync(join(migrationsDir, name), 'utf8');
  await runSql(`migration ${name}`, sql);
  const version = name.slice(0, 14);
  const migrationName = name.slice(15, -4);
  await runSql(
    `記錄 ${version}`,
    `insert into supabase_migrations.schema_migrations (version, name)
     values ('${version}', '${migrationName.replaceAll("'", "''")}')
     on conflict (version) do nothing;`,
  );
}

const seeds = [
  'supabase/seed.sql',
  'supabase/seeds/content-questions.sql',
  'supabase/seeds/content-review-cards.sql',
  'supabase/seeds/content-question-hints.sql',
];
for (const seed of seeds) {
  await runSql(`seed ${seed}`, readFileSync(join(projectRoot, seed), 'utf8'));
}

await runSql(
  '重新載入 PostgREST schema cache',
  `notify pgrst, 'reload schema';`,
);

// 以 service key 建立測試帳號（沿用本機 seed-auth 流程）。
const keysResponse = await globalThis.fetch(`${api}/api-keys`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!keysResponse.ok) {
  throw new Error(`無法取得 API keys（HTTP ${keysResponse.status}）`);
}
const keys = await keysResponse.json();
const serviceKey = keys.find((key) => key.name === 'service_role')?.api_key;
const anonKey = keys.find((key) => key.name === 'anon')?.api_key;
if (!serviceKey || !anonKey)
  throw new Error('API keys 回應缺少 anon/service_role');

const { spawnSync } = await import('node:child_process');
const seedAuth = spawnSync(
  'pnpm',
  ['exec', 'tsx', 'scripts/supabase/seed-auth.ts'],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      SUPABASE_URL: `https://${ref}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      SEED_REMOTE_CONFIRM: ref,
    },
    stdio: 'inherit',
  },
);
if (seedAuth.status !== 0) throw new Error('seed-auth 失敗');

console.log('');
console.log('Staging 資料庫就緒。前端環境變數：');
console.log(`  VITE_SUPABASE_URL=https://${ref}.supabase.co`);
console.log(`  VITE_SUPABASE_ANON_KEY=${anonKey}`);
