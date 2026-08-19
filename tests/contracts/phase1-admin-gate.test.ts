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
