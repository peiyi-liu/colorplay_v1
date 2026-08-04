import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const readText = (path: string) => readFile(path, 'utf8');

describe('chapter sequence phase gate contract', () => {
  it('registers the phase entry point', async () => {
    const packageJson = JSON.parse(await readText('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['phase:chapter-sequence']).toBe(
      'bash scripts/acceptance/run-chapter-sequence.sh',
    );
  });

  it('keeps the runner local, fail-closed, and ordered', async () => {
    const runner = await readText('scripts/acceptance/run-chapter-sequence.sh');
    expect(runner).toContain('CHAPTER_SEQUENCE_DIRTY_WORKTREE');
    expect(runner).toContain('CHAPTER_SEQUENCE_EVIDENCE_ALREADY_EXISTS');
    expect(runner).toContain('sequence.student@colorplay.test');
    expect(runner).toContain('RESET_SEQUENCE_FIXTURE_2026_08');
    expect(runner).toContain('supabase_environment: "local"');
    expect(runner).not.toContain('--linked');

    const order = [
      'content:verify-sequential',
      'prettier --check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
      'supabase test db --local',
      'supabase db reset --local',
      'seed-auth.ts',
      'reset-sequence-fixture.sh',
      'prepare-chapter-sequence-fixture.sql',
      'activate_course_sequential',
      '--headed',
      'sanitize-playwright-artifacts.mjs',
      'finalize-chapter-sequence.mjs',
    ];
    let cursor = -1;
    for (const marker of order) {
      const index = runner.indexOf(marker, cursor + 1);
      expect(index, marker).toBeGreaterThan(cursor);
      cursor = index;
    }
  });

  it('pins the exact fixture and no-reward mastery preparation', async () => {
    const sql = await readText(
      'scripts/acceptance/prepare-chapter-sequence-fixture.sql',
    );
    expect(sql).toContain("email = 'sequence.student@colorplay.test'");
    expect(sql).toContain('ceil(');
    expect(sql).toContain('0.80');
    expect(sql).toContain("purpose = 'practice'");
    expect(sql).toContain('review_progress');
    expect(sql).toContain('student_chapter_unlocks');
    expect(sql).not.toContain('xp_transactions');
    expect(sql).not.toContain('wallet_transactions');
    expect(sql).not.toContain('student.one');
  });

  it('requires the real six-chapter UI flow and rejects bypasses', async () => {
    const spec = await readText('tests/e2e/chapter-sequence.spec.ts');
    expect(spec).toContain('TEST_USERS.sequenceStudent');
    expect(spec).toContain('TEST_USERS.learningTeacher');
    expect(spec).toContain('GENERATED_CORRECT_ANSWERS');
    expect(spec).toContain('進入複習與進度');
    expect(spec).toContain('開始挑戰');
    expect(spec).toContain('CHAPTER_LOCKED');
    expect(spec).toContain('1280');
    expect(spec).toContain('812');
    expect(spec).toContain('375');
    expect(spec).toContain('reload()');
    expect(spec).toContain('signOutViaHud');
    expect(spec).not.toContain('force: true');
    expect(spec).not.toContain('dispatchEvent');
    expect(spec).not.toContain('page.evaluate');
    expect(spec).not.toContain('studentOne');
  });

  it('requires immutable local evidence and completion checkpoints', async () => {
    const finalizer = await readText(
      'scripts/acceptance/finalize-chapter-sequence.mjs',
    );
    expect(finalizer).toContain('chapter-sequence-v1');
    expect(finalizer).toContain('sequence.student@colorplay.test');
    expect(finalizer).toContain("progression_mode !== 'sequential'");
    expect(finalizer).toContain('completion_checkpoints.length !== 6');
    expect(finalizer).toContain('live_bypass');
    expect(finalizer).toContain('viewport_measurements.length !== 3');
    expect(finalizer).toContain('evidence-policy.mjs');
  });
});
