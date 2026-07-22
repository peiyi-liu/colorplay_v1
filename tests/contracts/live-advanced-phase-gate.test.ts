import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ACCEPTANCE_IDS } from '../../scripts/acceptance/finalize-live-advanced.mjs';

const readText = (path: string) => readFile(path, 'utf8');

describe('live advanced phase gate contract', () => {
  it('registers the package entry point and generic exclusion', async () => {
    const packageJson = JSON.parse(await readText('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['phase:live-advanced']).toBe(
      'bash scripts/acceptance/run-live-advanced.sh',
    );
    expect(packageJson.scripts['test:e2e']).toContain(
      'Live Advanced phase gate',
    );
  });

  it('locks the capacity acceptance id', () => {
    expect(ACCEPTANCE_IDS).toEqual(['AC-LIVE-012']);
  });

  it('keeps the runner fail-closed and ordered', async () => {
    const runner = await readText('scripts/acceptance/run-live-advanced.sh');
    expect(runner).toContain('LIVE_ADVANCED_DIRTY_WORKTREE');
    expect(runner).toContain('LIVE_ADVANCED_EVIDENCE_ALREADY_EXISTS');
    expect(runner).toContain('wait-for-postgrest.sh');
    expect(runner).toContain('unset SUPABASE_SERVICE_ROLE_KEY');
    expect(runner).toContain("--grep='Live Advanced phase gate'");
    expect(runner).toContain('finalize-live-advanced.mjs');
    // The reset precedes the db battery: browser runs commit real state and
    // pgTAP asserts against the seeded baseline (Phase 6 convention).
    const order = [
      'pnpm format:check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
      'supabase db reset --local',
      'pnpm test:db',
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

  it('keeps the finalizer evidence gates fail-closed', async () => {
    const finalizer = await readText(
      'scripts/acceptance/finalize-live-advanced.mjs',
    );
    expect(finalizer).toContain("'live-host-1440x900.png'");
    expect(finalizer).toContain("'live-team-768x1024.png'");
    expect(finalizer).toContain("'live-report-375x812.png'");
    expect(finalizer).toContain('latency-profile.json');
    expect(finalizer).toContain('ANSWER_P95_BUDGET_MS = 800');
    expect(finalizer).toContain('FINALIZE_P95_BUDGET_MS = 1000');
    expect(finalizer).toContain('MINIMUM_ANSWER_SAMPLES = 30');
    expect(finalizer).toContain('join_live_session');
    expect(finalizer).toContain('evidence-policy.mjs');
    expect(finalizer).toContain('live-advanced-v1');
    expect(finalizer).not.toContain('Teacher Content');
  });

  it('keeps the acceptance spec honest about waits and privacy', async () => {
    const spec = await readText('tests/e2e/live-advanced.spec.ts');
    expect(spec).toContain("test('Live Advanced phase gate'");
    expect(spec).toContain("PLAYWRIGHT_ACCEPTANCE !== 'on'");
    expect(spec).toContain('暫停');
    expect(spec).toContain('繼續作答');
    expect(spec).toContain('即時作答分布');
    expect(spec).toContain('隊伍計分板');
    expect(spec).toContain('連擊');
    expect(spec).toContain('latency-profile.json');
    expect(spec).toContain('live-host-1440x900.png');
    expect(spec).toContain('live-team-768x1024.png');
    expect(spec).toContain('live-report-375x812.png');
    // Since 2026-07-live-3 the outsider denial is a committed 200 payload
    // error, so the spec asserts the visible message and the empty
    // declared-failure set instead of a 4xx declaration.
    expect(spec).toContain('expect(declaredFailures).toEqual([])');
    expect(spec).toContain('代碼無效或課堂尚未開放');
    expect(spec).toContain('data-reduced-motion');
    expect(spec).toContain('await outsiderContext.close();');
    expect(spec).not.toContain('page.route(');
    expect(spec).not.toContain('test.skip(');
    expect(spec).not.toContain('service_role');
  });
});
