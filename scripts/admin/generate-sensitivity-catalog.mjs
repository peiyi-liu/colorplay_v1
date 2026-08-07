// scripts/admin/generate-sensitivity-catalog.mjs
// 用法:node scripts/admin/generate-sensitivity-catalog.mjs [--check]
// 解析 spec §9.3/§9.4 markdown 表格,生成:
//   supabase/catalog/admin-sensitivity-catalog.json
//   supabase/migrations/20260808000500_admin_sensitivity_catalog.sql
// --check 模式:重新生成並與提交版本 byte 比對,不一致 exit 1。
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const SPEC_PATH =
  'docs/superpowers/specs/2026-08-07-phase-1-admin-identity-security-design.md';
const JSON_PATH = 'supabase/catalog/admin-sensitivity-catalog.json';
const MIGRATION_PATH =
  'supabase/migrations/20260808000500_admin_sensitivity_catalog.sql';

// spec §3.1 資料瀏覽七分類 → 46 張既有表(逐一明列,涵蓋率由 --check 與
// compare-catalog-inventory.mjs 保證)。
const DOMAIN_MAP = {
  users: ['profiles'],
  classrooms: ['classrooms', 'classroom_members'],
  content: [
    'courses', 'chapters', 'sections', 'subtopics', 'questions',
    'question_options', 'question_hints', 'review_cards', 'review_card_media',
    'quiz_templates', 'content_imports', 'content_versions',
    'content_publication_events', 'external_activities',
  ],
  learning: [
    'review_progress', 'mistake_items', 'remediation_attempts', 'hint_events',
    'mastery_sessions', 'mastery_attempts', 'mastery_hint_events',
  ],
  assessments: [
    'quiz_sessions', 'quiz_session_questions', 'quiz_answers',
    'assignments', 'assignment_targets', 'assignment_attempts',
  ],
  live: [
    'live_activities', 'live_sessions', 'live_session_questions',
    'live_participants', 'live_answers', 'live_join_throttle',
  ],
  rewards: [
    'wallets', 'wallet_transactions', 'xp_transactions', 'blooks',
    'user_blooks', 'avatar_frames', 'user_frames', 'achievement_definitions',
    'achievement_progress', 'achievement_unlocks',
  ],
};

// personal 欄位遮罩策略(spec §9.3/§9.4 括號註記的機器化):
const MASK_RULES = {
  'profiles.full_name': 'first_char_mask',      // 首字＋遮罩
  'profiles.login_account': 'last3_mask',       // 只留末三碼
  'admin_invitations.invited_email': 'email_mask', // a****@domain
  'admin_sessions.device_summary': 'truncate_120', // 固定截斷
  // spec §9.4 line「`user_id`（mapping service only）」的機器化:
  // mapping 僅 service 可見,瀏覽器投影永不揭露
  'admin_audit_principals.user_id': 'service_only',
};

// §9.4 控制表 surface(Resource／surface 欄):
const CONTROL_SURFACES = {
  admin_security_identities: 'access',
  admin_sessions: 'access',
  admin_invitations: 'access',
  admin_security_operations: 'health',
  admin_command_authorizations: 'none',
  admin_command_executions: 'none',
  admin_audit_principals: 'none',
  admin_audit_events: 'audit',
  admin_denial_counters: 'health',
};

function parseCells(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function parseColumnList(cell) {
  if (cell === '—' || cell === '') return [];
  return [...cell.matchAll(/`([a-z0-9_]+)`/gu)].map((m) => m[1]);
}

// Q 欄格式:search／filter／sort,以全形／分隔,各段逗號列名或 —
function parseQueryCell(cell) {
  const [search = '—', filter = '—', sort = '—'] = cell.split('／');
  const names = (part) =>
    part.trim() === '—' ? [] : part.split(/[,、]/u).map((s) => s.trim()).filter(Boolean);
  return { search: names(search), filter: names(filter), sort: names(sort) };
}

function extractSection(spec, heading, nextHeading) {
  const start = spec.indexOf(heading);
  const end = spec.indexOf(nextHeading, start);
  if (start < 0 || end < 0) throw new Error(`CATALOG_SPEC_SECTION_MISSING:${heading}`);
  return spec.slice(start, end);
}

function parseExistingTables(section) {
  const rows = section.split('\n').filter((l) => /^\| `[a-z0-9_]+` \|/u.test(l));
  return rows.map((line) => {
    const [resourceCell, open, internal, personal, forbidden, query] = parseCells(line);
    const resource = /`([a-z0-9_]+)`/u.exec(resourceCell)[1];
    return { resource, open: parseColumnList(open), internal: parseColumnList(internal),
      personal: parseColumnList(personal), forbidden: parseColumnList(forbidden),
      query: parseQueryCell(query) };
  });
}

function parseControlTables(section) {
  const rows = section.split('\n').filter((l) => /^\| `admin_[a-z_]+`／/u.test(l));
  return rows.map((line) => {
    const [resourceCell, open, internal, personal, forbidden] = parseCells(line);
    const resource = /`([a-z0-9_]+)`/u.exec(resourceCell)[1];
    return { resource, open: parseColumnList(open), internal: parseColumnList(internal),
      personal: parseColumnList(personal), forbidden: parseColumnList(forbidden),
      query: { search: [], filter: [], sort: [] } };
  });
}

function domainOf(resource) {
  if (resource.startsWith('admin_')) return 'security';
  const found = Object.entries(DOMAIN_MAP).find(([, list]) => list.includes(resource));
  if (!found) throw new Error(`CATALOG_DOMAIN_UNMAPPED:${resource}`);
  return found[0];
}

function toColumns(entry) {
  const rows = [];
  for (const [cls, list] of [
    ['open', entry.open], ['internal', entry.internal],
    ['personal', entry.personal], ['forbidden', entry.forbidden],
  ]) {
    for (const name of list) {
      const key = `${entry.resource}.${name}`;
      rows.push({
        name, class: cls,
        mask_strategy: cls === 'personal' ? (MASK_RULES[key] ?? failMask(key)) : null,
        searchable: entry.query.search.includes(name),
        filterable: entry.query.filter.includes(name),
        sortable: entry.query.sort.includes(name),
      });
    }
  }
  return rows;
}

function failMask(key) {
  throw new Error(`CATALOG_MASK_RULE_MISSING:${key}`);
}

async function main() {
  const spec = await readFile(SPEC_PATH, 'utf8');
  const existing = parseExistingTables(
    extractSection(spec, '### 9.3', '### 9.4'));
  const control = parseControlTables(
    extractSection(spec, '### 9.4', '## 10.'));
  if (existing.length !== 46) throw new Error(`CATALOG_EXPECTED_46_GOT_${existing.length}`);
  if (control.length !== 9) throw new Error(`CATALOG_EXPECTED_9_GOT_${control.length}`);

  const resources = [...existing, ...control].map((entry) => ({
    resource: entry.resource,
    domain: domainOf(entry.resource),
    surface: entry.resource.startsWith('admin_')
      ? CONTROL_SURFACES[entry.resource]
      : 'browser',
    export: false, // spec §9.2:Phase 1 所有表 export=false
    columns: toColumns(entry),
  })).sort((a, b) => a.resource.localeCompare(b.resource));

  const json = `${JSON.stringify({
    version: 1,
    source_sha256: createHash('sha256').update(spec).digest('hex'),
    resources,
  }, null, 2)}\n`;

  const values = resources.flatMap((r) => r.columns.map((c) =>
    `  ('${r.resource}', '${r.domain}', '${r.surface}', '${c.name}', '${c.class}', ` +
    `${c.mask_strategy ? `'${c.mask_strategy}'` : 'null'}, ` +
    `${c.searchable}, ${c.filterable}, ${c.sortable})`));
  const migration = [
    '-- GENERATED FILE — do not edit by hand.',
    '-- Regenerate: pnpm admin:catalog:generate  (source: spec §9.3/§9.4)',
    'create table public.admin_sensitivity_catalog (',
    '  resource text not null,',
    '  domain text not null,',
    '  surface text not null,',
    "  column_name text not null,",
    "  class text not null check (class in ('open','internal','personal','forbidden')),",
    '  mask_strategy text,',
    '  searchable boolean not null,',
    '  filterable boolean not null,',
    '  sortable boolean not null,',
    '  primary key (resource, column_name)',
    ');',
    'alter table public.admin_sensitivity_catalog enable row level security;',
    'revoke all on public.admin_sensitivity_catalog from anon, authenticated;',
    'insert into public.admin_sensitivity_catalog',
    '  (resource, domain, surface, column_name, class, mask_strategy,',
    '   searchable, filterable, sortable)',
    'values',
    `${values.join(',\n')};`,
    '',
  ].join('\n');

  if (process.argv.includes('--check')) {
    const [jsonNow, migNow] = await Promise.all([
      readFile(JSON_PATH, 'utf8'), readFile(MIGRATION_PATH, 'utf8'),
    ]);
    if (jsonNow !== json || migNow !== migration) {
      console.error('ADMIN_CATALOG_DRIFT: regenerate with pnpm admin:catalog:generate');
      process.exit(1);
    }
    console.log('admin catalog: up to date');
    return;
  }
  await writeFile(JSON_PATH, json);
  await writeFile(MIGRATION_PATH, migration);
  console.log(`admin catalog: wrote ${resources.length} resources`);
}

await main();
