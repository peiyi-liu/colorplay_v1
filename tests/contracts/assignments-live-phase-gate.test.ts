import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ACCEPTANCE_IDS } from '../../scripts/acceptance/finalize-assignments-live.mjs';

const readText = (path: string) => readFile(path, 'utf8');

describe('assignments and live phase gate contract', () => {
  it('registers the package entry point and generic exclusion', async () => {
    const packageJson = JSON.parse(await readText('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['phase:assignments-live']).toBe(
      'bash scripts/acceptance/run-assignments-live.sh',
    );
    expect(packageJson.scripts['test:e2e']).toContain(
      'Assignments and Live Core phase gate',
    );
  });

  it('locks exactly the eighteen exit acceptance ids', () => {
    expect(ACCEPTANCE_IDS).toEqual([
      'AC-ASN-001',
      'AC-ASN-002',
      'AC-ASN-003',
      'AC-ASN-004',
      'AC-ASN-005',
      'AC-ASN-006',
      'AC-LIVE-001',
      'AC-LIVE-002',
      'AC-LIVE-003',
      'AC-LIVE-004',
      'AC-LIVE-005',
      'AC-LIVE-006',
      'AC-LIVE-007',
      'AC-LIVE-008',
      'AC-LIVE-009',
      'AC-LIVE-010',
      'AC-LIVE-011',
      'AC-LIVE-012',
    ]);
  });

  it('keeps the runner fail-closed and ordered', async () => {
    const runner = await readText('scripts/acceptance/run-assignments-live.sh');
    expect(runner).toContain('ASSIGNMENTS_LIVE_DIRTY_WORKTREE');
    expect(runner).toContain('ASSIGNMENTS_LIVE_EVIDENCE_ALREADY_EXISTS');
    expect(runner).toContain('wait-for-postgrest.sh');
    expect(runner).toContain('unset SUPABASE_SERVICE_ROLE_KEY');
    expect(runner).toContain("--grep='Assignments and Live Core phase gate'");
    expect(runner).toContain('finalize-assignments-live.mjs');
    const order = [
      'pnpm format:check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
      'pnpm test:db',
      'supabase db reset --local',
      'wait-for-postgrest.sh',
      'seed-auth.ts',
      '--headed',
    ];
    let cursor = -1;
    for (const marker of order) {
      const index = runner.indexOf(marker, cursor + 1);
      expect(index, marker).toBeGreaterThan(cursor);
      cursor = index;
    }
  });

  it('keeps the finalizer latency and evidence gates fail-closed', async () => {
    const finalizer = await readText(
      'scripts/acceptance/finalize-assignments-live.mjs',
    );
    expect(finalizer).toContain('ASSIGNMENTS_LIVE_LATENCY_GATE_FAILED');
    expect(finalizer).toContain('answer_samples');
    expect(finalizer).toContain('answer_p95_ms > 800');
    expect(finalizer).toContain('finalize_p95_ms > 1000');
    expect(finalizer).toContain('lost_or_duplicate_answers !== 0');
    expect(finalizer).toContain('outsider_access !== 0');
    expect(finalizer).toContain("'assignment-detail-375x812.png'");
    expect(finalizer).toContain("'live-question-768x1024.png'");
    expect(finalizer).toContain("'live-host-console-1440x900.png'");
    expect(finalizer).toContain('join_live_session');
    expect(finalizer).toContain('advance_live_session');
    expect(finalizer).toContain('evidence-policy.mjs');
  });

  it('keeps the acceptance spec honest about waits and privacy', async () => {
    const spec = await readText('tests/e2e/assignments-live.spec.ts');
    expect(spec).toContain("test('Assignments and Live Core phase gate'");
    expect(spec).toContain("PLAYWRIGHT_ACCEPTANCE !== 'on'");
    expect(spec).toContain('挑戰進度');
    expect(spec).toContain('第 ${String(round)} / 10 題');
    expect(spec).toContain('assignment-detail-375x812.png');
    expect(spec).toContain('live-question-768x1024.png');
    expect(spec).toContain('live-host-console-1440x900.png');
    expect(spec).toContain('declareExpectedBrowserFailure');
    expect(spec).toContain('await outsiderContext.close();');
    expect(spec).not.toContain('page.route(');
    expect(spec).not.toContain('test.skip(');
    expect(spec).not.toContain('service_role');
  });
});
