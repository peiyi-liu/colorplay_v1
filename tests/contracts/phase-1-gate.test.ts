import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(path, 'utf8');

describe('Phase 1 acceptance source contract', () => {
  it('orchestrates the real local stack, production preview, headed evidence, and reports in order', async () => {
    const runner = await read('scripts/acceptance/run-phase-1.sh');
    const requiredSteps = [
      'pnpm install --frozen-lockfile',
      'pnpm exec supabase start',
      'pnpm exec supabase db reset --local',
      'pnpm test:db',
      'pnpm lint',
      'pnpm format:check',
      'pnpm typecheck',
      'pnpm test:coverage',
      'npm run build',
      'pnpm preview --host 127.0.0.1',
      'pnpm exec lighthouse',
      'pnpm test:e2e',
      '--headed --project=chromium --trace on',
      '--project=chromium --project=firefox --project=webkit',
      'node scripts/acceptance/finalize-phase-1.mjs',
    ];

    let previousIndex = -1;
    for (const step of requiredSteps) {
      const index = runner.indexOf(step);
      expect(
        index,
        `missing or out-of-order runner step: ${step}`,
      ).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }

    expect(runner).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(runner).toContain('unset SUPABASE_SERVICE_ROLE_KEY');
    expect(runner).toContain('trap cleanup EXIT');
    expect(runner).toContain('pnpm exec supabase stop');
    expect(runner).toContain('PLAYWRIGHT_VIDEO=on');
    expect(runner).toContain('PLAYWRIGHT_ACCEPTANCE=on');
    expect(runner).toContain('PLAYWRIGHT_JSON_OUTPUT_FILE');
    expect(runner).toContain('reports/e2e.json');
    expect(runner).toContain('initial_git_sha');
    expect(runner).toContain('current_git_sha');
    expect(runner).toContain('initial_git_status');
    expect(runner).toContain('current_git_status');
    expect(runner).toContain('initial_git_branch');
    expect(runner).toContain('current_git_branch');
    expect(runner).toContain('PHASE_1_SOURCE_STATE_CHANGED');
    expect(
      runner.match(/git status --porcelain=v1 --untracked-files=all/gu),
    ).toHaveLength(2);
    expect(runner).toMatch(/rm -rf[\s\S]*e2e-playwright[\s\S]*playwright/u);
    expect(runner).not.toMatch(
      /(?:echo|printf).*\$(?:SUPABASE_ANON_KEY|ANON_KEY)/u,
    );
  });

  it('captures the scoped flows at all Phase 1 viewports without API mocks or skipped tests', async () => {
    const spec = await read('tests/acceptance/phase-1.spec.ts');

    for (const viewport of ['375x812', '768x1024', '1440x900']) {
      expect(spec).toContain(viewport);
    }
    for (const evidence of [
      'login',
      'profile',
      'refresh',
      'logout',
      'unauthorized',
      'deep-link',
    ]) {
      expect(spec).toContain(evidence);
    }

    expect(spec).toContain('attachBrowserHealth');
    expect(spec).toContain('unexpectedBrowserHealth');
    expect(spec).toContain('confirmedLogoutResponse');
    expect(spec).not.toContain('removeConfirmedSuccessfulLocalLogoutAbort');
    expect(spec).toContain('AxeBuilder');
    expect(spec).not.toContain('page.route(');
    expect(spec).not.toContain('test.skip(');
    expect(spec).not.toContain('test.fixme(');
  });

  it('publishes an honest Phase 1 manifest while blocking full-MVP and release claims', async () => {
    const [finalizer, policy] = await Promise.all([
      read('scripts/acceptance/finalize-phase-1.mjs'),
      read('scripts/acceptance/phase-1-policy.mjs'),
    ]);

    expect(finalizer).toContain('derivePhaseOneDecision');
    expect(finalizer).not.toContain("phase_1_decision: 'PASS'");
    expect(finalizer).not.toContain('phaseOnePassIds');
    expect(finalizer).toContain("release_decision: 'BLOCKED'");
    expect(finalizer).toContain('reports/e2e.json');
    expect(finalizer).toContain('validatePlaywrightReport');
    expect(policy).toContain('AC-UI-010');
    expect(policy).toContain('AC-UI-012');
    expect(policy).toContain('Outside Phase 1');
    expect(finalizer).toContain('EXPECTED_ACCEPTANCE_COUNT');
    expect(finalizer).not.toMatch(/\b84\b/u);
  });

  it('configures full E2E JSON output while preserving a human-readable reporter', async () => {
    const packageJson = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['test:e2e']).toContain('--reporter=list,json');
  });

  it('exposes the phase gate without replacing the generic evidence harness', async () => {
    const packageJson = JSON.parse(await read('package.json')) as {
      scripts: Record<string, string>;
    };
    const wrapper = await read('scripts/acceptance/run.sh');

    expect(packageJson.scripts.acceptance).toBe(
      'bash scripts/acceptance/run-phase-1.sh',
    );
    expect(packageJson.scripts['acceptance:create-run']).toBe(
      'node scripts/acceptance/create-run.mjs',
    );
    expect(wrapper).toContain('run-phase-1.sh');
  });

  it('documents local evidence and keeps external deployment steps manual and authenticated', async () => {
    const [readme, deployment] = await Promise.all([
      read('README.md'),
      read('docs/deployment/vercel.md'),
    ]);

    expect(readme).toContain('pnpm acceptance');
    expect(readme).toContain('Phase 8');
    expect(readme).toContain('Foundation Task 16');
    expect(deployment).toContain('Phase 8');
    expect(deployment).toContain('NOT VERIFIED');
    expect(deployment).toContain('authentication');
    expect(deployment).toContain('must not');
  });
});
