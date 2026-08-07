// scripts/admin/compare-catalog-inventory.mjs
// 連 local DB,比對 information_schema 的 public base tables 完整 (table, column)
// 集合與 catalog 完全一致(spec §9.2:新增/刪除/改名未同步即失敗)。
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const dbUrl = process.env.SUPABASE_DB_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = `
  select c.table_name || '.' || c.column_name
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    and c.table_name <> 'admin_sensitivity_catalog'
  order by 1;`;

// 主要路徑:host psql(CI 使用);host 未安裝 psql 時退回 local stack 的
// db container 執行同一 SQL、同一輸出格式。
function runPsql() {
  const direct = spawnSync('psql', [dbUrl, '-At', '-c', sql], {
    encoding: 'utf8',
  });
  if (direct.error?.code !== 'ENOENT') return direct;
  return spawnSync(
    'docker',
    ['exec', 'supabase_db_colorplay', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql],
    { encoding: 'utf8' },
  );
}

const psql = runPsql();
if (psql.status !== 0) { console.error(psql.stderr); process.exit(1); }
const dbSet = new Set(psql.stdout.split('\n').filter(Boolean));

const catalog = JSON.parse(
  await readFile('supabase/catalog/admin-sensitivity-catalog.json', 'utf8'));
const catalogSet = new Set(catalog.resources.flatMap(
  (r) => r.columns.map((c) => `${r.resource}.${c.name}`)));

const missing = [...dbSet].filter((k) => !catalogSet.has(k));
const stale = [...catalogSet].filter((k) => !dbSet.has(k));
if (missing.length > 0 || stale.length > 0) {
  console.error('ADMIN_CATALOG_INVENTORY_MISMATCH');
  for (const k of missing) console.error(`  uncataloged column: ${k}`);
  for (const k of stale) console.error(`  catalog references missing column: ${k}`);
  process.exit(1);
}
console.log(`admin catalog inventory: ${dbSet.size} columns match`);
