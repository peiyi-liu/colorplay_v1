import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ACCEPTANCE_IDS } from '../../scripts/acceptance/finalize-learning-experience.mjs';

const readText = (path: string) => readFile(path, 'utf8');

describe('learning experience phase gate contract', () => {
  it('registers the package entry point and generic exclusion', async () => {
    const packageJson = JSON.parse(await readText('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['phase:learning-experience']).toBe(
      'bash scripts/acceptance/run-learning-experience.sh',
    );
    expect(packageJson.scripts['test:e2e']).toContain(
      'Learning Experience phase gate',
    );
  });

  it('locks exactly the ten exit acceptance ids', () => {
    expect(ACCEPTANCE_IDS).toEqual([
      'AC-LEARN-001',
      'AC-LEARN-002',
      'AC-LEARN-003',
      'AC-LEARN-004',
      'AC-PROG-001',
      'AC-PROG-002',
      'AC-PROG-003',
      'AC-PROG-004',
      'AC-PROG-005',
      'AC-PROG-006',
    ]);
  });

  it('keeps the runner fail-closed and ordered', async () => {
    const runner = await readText(
      'scripts/acceptance/run-learning-experience.sh',
    );
    expect(runner).toContain('LEARNING_EXPERIENCE_DIRTY_WORKTREE');
    expect(runner).toContain('LEARNING_EXPERIENCE_EVIDENCE_ALREADY_EXISTS');
    expect(runner).toContain('wait-for-postgrest.sh');
    expect(runner).toContain('unset SUPABASE_SERVICE_ROLE_KEY');
    expect(runner).toContain("--grep='Learning Experience phase gate'");
    expect(runner).toContain('finalize-learning-experience.mjs');
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

  it('keeps the finalizer evidence gates fail-closed', async () => {
    const finalizer = await readText(
      'scripts/acceptance/finalize-learning-experience.mjs',
    );
    expect(finalizer).toContain("'chapter-detail-375x812.png'");
    expect(finalizer).toContain("'review-card-768x1024.png'");
    expect(finalizer).toContain("'progress-dashboard-1440x900.png'");
    expect(finalizer).toContain('request_question_hint');
    expect(finalizer).toContain('evidence-policy.mjs');
    expect(finalizer).toContain("--grep='Learning Experience phase gate'");
    expect(finalizer).toContain('learning-experience-v1');
    expect(finalizer).not.toContain('Assignments and Live Core');
    expect(finalizer).not.toContain('live-latency');
  });

  it('keeps the acceptance spec honest about waits and privacy', async () => {
    const spec = await readText('tests/e2e/learning-experience.spec.ts');
    expect(spec).toContain("test('Learning Experience phase gate'");
    expect(spec).toContain("PLAYWRIGHT_ACCEPTANCE !== 'on'");
    expect(spec).toContain('挑戰進度');
    expect(spec).toContain('尚未發布的卡片');
    expect(spec).toContain('await studentPage.reload();');
    expect(spec).toContain('chapter-detail-375x812.png');
    expect(spec).toContain('review-card-768x1024.png');
    expect(spec).toContain('progress-dashboard-1440x900.png');
    expect(spec).toContain('declareExpectedBrowserFailure');
    expect(spec).toContain('await teacherBContext.close();');
    expect(spec).not.toContain('page.route(');
    expect(spec).not.toContain('test.skip(');
    expect(spec).not.toContain('service_role');
  });
});
