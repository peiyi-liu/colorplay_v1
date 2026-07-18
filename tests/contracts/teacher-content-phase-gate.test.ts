import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ACCEPTANCE_IDS } from '../../scripts/acceptance/finalize-teacher-content.mjs';

const readText = (path: string) => readFile(path, 'utf8');

describe('teacher content phase gate contract', () => {
  it('registers the package entry point and generic exclusion', async () => {
    const packageJson = JSON.parse(await readText('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['phase:teacher-content']).toBe(
      'bash scripts/acceptance/run-teacher-content.sh',
    );
    expect(packageJson.scripts['test:e2e']).toContain(
      'Teacher Content phase gate',
    );
  });

  it('locks exactly the ten exit acceptance ids', () => {
    expect(ACCEPTANCE_IDS).toEqual([
      'AC-TCH-001',
      'AC-TCH-002',
      'AC-TCH-003',
      'AC-TCH-004',
      'AC-TCH-005',
      'AC-TCH-006',
      'AC-TCH-007',
      'AC-TCH-008',
      'AC-TCH-009',
      'AC-MIG-003',
    ]);
  });

  it('keeps the runner fail-closed and ordered', async () => {
    const runner = await readText('scripts/acceptance/run-teacher-content.sh');
    expect(runner).toContain('TEACHER_CONTENT_DIRTY_WORKTREE');
    expect(runner).toContain('TEACHER_CONTENT_EVIDENCE_ALREADY_EXISTS');
    expect(runner).toContain('wait-for-postgrest.sh');
    expect(runner).toContain('unset SUPABASE_SERVICE_ROLE_KEY');
    expect(runner).toContain("--grep='Teacher Content phase gate'");
    expect(runner).toContain('finalize-teacher-content.mjs');
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
      'scripts/acceptance/finalize-teacher-content.mjs',
    );
    expect(finalizer).toContain("'teacher-dashboard-1440x900.png'");
    expect(finalizer).toContain("'import-preview-768x1024.png'");
    expect(finalizer).toContain("'content-workspace-375x812.png'");
    expect(finalizer).toContain('colorplay-content-template.xlsx');
    expect(finalizer).toContain('upsert_question_draft');
    expect(finalizer).toContain('evidence-policy.mjs');
    expect(finalizer).toContain('teacher-content-v1');
    expect(finalizer).not.toContain('Learning Experience');
    expect(finalizer).not.toContain('live-latency');
  });

  it('keeps the acceptance spec honest about waits and privacy', async () => {
    const spec = await readText('tests/e2e/teacher-content.spec.ts');
    expect(spec).toContain("test('Teacher Content phase gate'");
    expect(spec).toContain("PLAYWRIGHT_ACCEPTANCE !== 'on'");
    expect(spec).toContain('colorplay-content-template.xlsx');
    expect(spec).toContain('ANSWER_INVALID');
    expect(spec).toContain('已發布第 2 版。');
    expect(spec).toContain('window.__xss');
    expect(spec).toContain('teacher-dashboard-1440x900.png');
    expect(spec).toContain('import-preview-768x1024.png');
    expect(spec).toContain('content-workspace-375x812.png');
    expect(spec).toContain('declareExpectedBrowserFailure');
    expect(spec).toContain('await teacherBContext.close();');
    expect(spec).toContain('await studentPage.reload();');
    expect(spec).not.toContain('page.route(');
    expect(spec).not.toContain('test.skip(');
    expect(spec).not.toContain('service_role');
  });
});
