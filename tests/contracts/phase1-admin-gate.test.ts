import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

// spec §12 domain-table boundary: a Phase 1 Admin smoke run must never
// authorize a write to any of these. Table names are the actual `create
// table public.<name>` identifiers, not guesses — see the source migrations
// listed next to each one.
const DOMAIN_TABLES = [
  'profiles', // 20260713000100_create_profiles.sql
  'quiz_sessions', // 20260714000300_quiz_engine.sql
  'live_sessions', // 20260717000600_live_schema.sql
  'wallets', // 20260716000100_game_economy_ledgers.sql
  'classrooms', // 20260717000100_classrooms.sql
  'questions', // 20260714000200_content_taxonomy.sql
  'mistake_items', // 20260718000400_mistake_items.sql
] as const;

const OOB_SERVICE_FUNCTIONS = [
  'svc_admin_bootstrap_identity',
  'svc_admin_isolate_factor_incident_oob',
  'svc_admin_complete_oob_recovery',
  'svc_admin_tombstone_principal',
] as const;

describe('phase 1 admin release gate documents', () => {
  it('smoke manifest exists and never authorizes domain-table writes', async () => {
    const manifest = await readFile(
      'docs/deployment/phase1-production-smoke-manifest.md',
      'utf8',
    );
    expect(manifest).toContain('admin_sessions');
    expect(manifest).toContain('admin_audit_events');
    const allowedSection = manifest.split('## Allowed control-plane writes')[1];
    expect(allowedSection).toBeDefined();
    // Only check the allowed-writes section itself (up to the next H2) — the
    // "Explicitly prohibited" section legitimately names domain concerns
    // like `profiles.role` to say writes to it are forbidden, which would
    // false-positive a whole-document scan.
    const allowedUntilNextSection = (allowedSection ?? '').split('\n## ')[0];
    for (const table of DOMAIN_TABLES) {
      expect(allowedUntilNextSection).not.toContain('`' + table + '`');
    }
  });

  // Task 15 review Finding 1(High)：一次成功 challenge 必然觸發
  // svc_admin_record_totp_outcome 更新 admin_security_identities(失敗計數／
  // 鎖定欄位),原本的允許清單漏列這張表——任何 smoke run 只要走過 challenge
  // 就會踩到「manifest 外寫入」而被自己的 gate failure 定義誤判。
  it('smoke manifest lists admin_security_identities as an allowed write', async () => {
    const manifest = await readFile(
      'docs/deployment/phase1-production-smoke-manifest.md',
      'utf8',
    );
    const allowedSection = (
      manifest.split('## Allowed control-plane writes')[1] ?? ''
    ).split('\n## ')[0];
    expect(allowedSection).toContain('admin_security_identities');
  });

  // Task 15 review Finding 2(High)：prohibited 段落原本用「除了…之外」
  // 「smoke run 自己的 session/identity 除外」這類但書語言,反而授權了
  // plan 明禁的行為(揭露真人個資、改動自己的 lifecycle state)。這裡鎖定
  // 修復後「無例外」的明確用語,而不是只檢查關鍵字有沒有出現——關鍵字光是
  // 出現在舊的但書句子裡也會通過,抓不到這種語意漏洞。
  it('smoke manifest bans real reveals and any admin lifecycle-state change without exception', async () => {
    const manifest = await readFile(
      'docs/deployment/phase1-production-smoke-manifest.md',
      'utf8',
    );
    const prohibitedSection = (
      manifest.split('## Explicitly prohibited')[1] ?? ''
    ).split('\n## ')[0];
    expect(prohibitedSection).toContain('no exception for this');
    expect(prohibitedSection).toContain("including the smoke run's own");
  });

  it('oob runbook covers bootstrap, incident recovery and tombstone', async () => {
    const runbook = await readFile(
      'docs/runbooks/phase1-admin-oob-recovery.md',
      'utf8',
    );
    for (const fn of OOB_SERVICE_FUNCTIONS) {
      expect(runbook).toContain(fn);
    }
  });

  it('oob runbook requires a fresh runbook_operation_id per procedure attempt', async () => {
    const runbook = await readFile(
      'docs/runbooks/phase1-admin-oob-recovery.md',
      'utf8',
    );
    expect(runbook).toContain('runbook_operation_id');
    expect(runbook.toLowerCase()).toContain('uuidgen');
  });
});
