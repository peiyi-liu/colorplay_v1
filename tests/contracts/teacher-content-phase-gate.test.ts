import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ACCEPTANCE_IDS } from '../../scripts/acceptance/finalize-teacher-content.mjs';

const readText = (path: string) => readFile(path, 'utf8');

describe('teacher content retirement gate contract', () => {
  it('registers the retirement gate and generic exclusion', async () => {
    const packageJson = JSON.parse(await readText('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['phase:teacher-content']).toBe(
      'bash scripts/acceptance/run-teacher-content.sh',
    );
    expect(packageJson.scripts['test:e2e']).toContain(
      'Teacher Content retirement gate',
    );
  });

  it('replaces retired feature acceptance ids with route-retirement ids', () => {
    expect(ACCEPTANCE_IDS).toEqual(['AC-RETIRE-TCH-001', 'AC-RETIRE-TCH-002']);
  });

  it('keeps the runner fail-closed without resetting product data', async () => {
    const runner = await readText('scripts/acceptance/run-teacher-content.sh');
    expect(runner).toContain('TEACHER_CONTENT_DIRTY_WORKTREE');
    expect(runner).toContain('TEACHER_CONTENT_EVIDENCE_ALREADY_EXISTS');
    expect(runner).toContain('wait-for-postgrest.sh');
    expect(runner).toContain('unset SUPABASE_SERVICE_ROLE_KEY');
    expect(runner).toContain("--grep='Teacher Content retirement gate'");
    expect(runner).toContain('finalize-teacher-content.mjs');
    expect(runner).not.toContain('supabase db reset --local');
    expect(runner).not.toContain("run_logged 'pnpm format:check'");
    const order = [
      'bash -n scripts/acceptance/run-teacher-content.sh',
      'pnpm exec prettier --check teacher-content-retirement-v2',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
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

  it('requires only retirement evidence and zero expected failures', async () => {
    const finalizer = await readText(
      'scripts/acceptance/finalize-teacher-content.mjs',
    );
    expect(finalizer).toContain("'teacher-import-retired-1280x720.png'");
    expect(finalizer).toContain("'teacher-content-retired-375x812.png'");
    expect(finalizer).toContain('teacher-content-retirement-v2');
    expect(finalizer).toContain(
      'const EXPECTED_BROWSER_FAILURES = Object.freeze([])',
    );
    expect(finalizer).toContain('evidence-policy.mjs');
    expect(finalizer).not.toContain('colorplay-content-template.xlsx');
    expect(finalizer).not.toContain('upsert_question_draft');
  });

  it('pins both removed routes, no writes, and no bypasses', async () => {
    const spec = await readText('tests/e2e/teacher-content.spec.ts');
    expect(spec).toContain("test('Teacher Content retirement gate'");
    expect(spec).toContain("'/teacher/import'");
    expect(spec).toContain("'/teacher/content'");
    expect(spec).toContain("name: '找不到頁面'");
    expect(spec).toContain('unexpectedMutations');
    expect(spec).toContain('expect(declaredFailures).toEqual([])');
    expect(spec).not.toContain('page.route(');
    expect(spec).not.toContain('test.skip(');
    expect(spec).not.toContain('service_role');
  });
});
