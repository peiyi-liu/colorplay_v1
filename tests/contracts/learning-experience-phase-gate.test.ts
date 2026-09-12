import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACCEPTANCE_IDS } from '../../scripts/acceptance/finalize-learning-experience.mjs';
import { LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL } from '../../scripts/staging/provision-learning-experience-fixture.mjs';
import { TEST_USERS } from '../fixtures/users';
import {
  classroomRunLabel,
  learningStudentDisplayNameFromEmail,
  resolveLearningStudentCredentials,
} from '../e2e/helpers/learning-experience-fixture';
import {
  quizContinueActionName,
  type QuizAnswerStatus,
} from '../e2e/helpers/quiz';

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
    // 學習進度頁依 owner 2026-07-26 批示改教師專屬，證據項隨之移除：
    // progress-dashboard-1440x900.png 不再是必要證據，斷言同步移除。
    expect(finalizer).not.toContain('request_question_hint');
    expect(finalizer).toContain('teacher_student_progress');
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
    // 學生端學習進度頁依 owner 批示（2026-07-26 #2）已移除（Task 10），
    // spec 不再產生 progress-dashboard-1440x900.png；AC-PROG-001~005 的
    // 'S'（screenshot）證據面尚未改指向教師視角等效畫面，留待後續任務決議。
    // 提示 UI 於 2026-07-21 依 owner #4 移除，宣告式失敗不再需要。
    expect(spec).toContain('await teacherBContext.close();');
    expect(spec).not.toContain('page.route(');
    expect(spec).not.toContain('test.skip(');
    expect(spec).not.toContain('service_role');
  });
});

describe('quiz continue action name contract', () => {
  const cases: [string, QuizAnswerStatus, boolean, string][] = [
    ['correct, non-final', 'correct', false, '下一題'],
    ['incorrect, non-final', 'incorrect', false, '我理解了，下一題'],
    ['timeout, non-final', 'timeout', false, '我理解了，下一題'],
    ['correct, final', 'correct', true, '結算並查看結果'],
    ['incorrect, final', 'incorrect', true, '結算並查看結果'],
    ['timeout, final', 'timeout', true, '結算並查看結果'],
  ];

  it.each(cases)('%s', (_label, status, isLastQuestion, expected) => {
    expect(quizContinueActionName(status, isLastQuestion)).toBe(expected);
  });

  it('never reintroduces the hardcoded ternary', async () => {
    const spec = await readText('tests/e2e/learning-experience.spec.ts');
    expect(spec).not.toMatch(/'結算並查看結果'\s*:\s*'我理解了，下一題'/u);
  });

  it('main quiz block uses the resolver with an exact button match', async () => {
    const spec = await readText('tests/e2e/learning-experience.spec.ts');
    const start = spec.indexOf(
      '--- Formal quiz with tiered hints and two deliberate mistakes ---',
    );
    const end = spec.indexOf(
      '--- Mistakes and remediation: resolve both, 20% XP, zero Tokens ---',
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const mainQuizBlock = spec.slice(start, end);
    expect(mainQuizBlock).toContain('quizContinueActionName(');
    expect(mainQuizBlock).toContain('exact: true');
  });

  it('remediation quiz block uses the resolver with an exact button match', async () => {
    const spec = await readText('tests/e2e/learning-experience.spec.ts');
    const start = spec.indexOf(
      '--- Mistakes and remediation: resolve both, 20% XP, zero Tokens ---',
    );
    const end = spec.indexOf('補救練習完成', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const remediationBlock = spec.slice(start, end);
    expect(remediationBlock).toContain('quizContinueActionName(');
    expect(remediationBlock).toContain('exact: true');
  });
});

describe('resolveLearningStudentCredentials (real behavior, not source-string)', () => {
  const baseEnv = () => ({
    ...process.env,
    LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE: undefined,
    PLAYWRIGHT_REQUIRE_RUN_SCOPED_LEARNING_FIXTURE: undefined,
  });

  it('uses the fixed fixture when the gate is not on', async () => {
    await expect(resolveLearningStudentCredentials(baseEnv())).resolves.toEqual(
      TEST_USERS.learningStudent,
    );
  });

  it('fails closed with the fixed sentinel, never the fixed fixture, when the gate is on but no path is set', async () => {
    await expect(
      resolveLearningStudentCredentials({
        ...baseEnv(),
        PLAYWRIGHT_REQUIRE_RUN_SCOPED_LEARNING_FIXTURE: 'on',
      }),
    ).rejects.toThrow(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  });

  it('fails closed when the gate is on but the credential file does not exist', async () => {
    await expect(
      resolveLearningStudentCredentials({
        ...baseEnv(),
        LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE: join(
          tmpdir(),
          'learning-fixture-missing-credential.json',
        ),
        PLAYWRIGHT_REQUIRE_RUN_SCOPED_LEARNING_FIXTURE: 'on',
      }),
    ).rejects.toThrow(LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL);
  });

  it('resolves the run-scoped credentials from a valid 0600 file when the gate is on', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'learning-fixture-gate-'));
    const credentialPath = join(fixtureRoot, 'credential.json');
    const expected = {
      email: 'learning-experience-fixture-run-1-attempt-1@colorplay.test',
      password: 'run-scoped-secret-value',
    };
    try {
      await writeFile(credentialPath, JSON.stringify(expected), {
        mode: 0o600,
      });
      await expect(
        resolveLearningStudentCredentials({
          ...baseEnv(),
          LEARNING_EXPERIENCE_FIXTURE_CREDENTIAL_FILE: credentialPath,
          PLAYWRIGHT_REQUIRE_RUN_SCOPED_LEARNING_FIXTURE: 'on',
        }),
      ).resolves.toEqual(expected);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});

describe('learningStudentDisplayNameFromEmail (real behavior)', () => {
  it.each([
    ['learning.student@colorplay.test', 'learning.student'],
    ['learning-fixture-1-1@colorplay.test', 'learning-fixture-1-1'],
    [`${'a'.repeat(40)}@colorplay.test`, 'a'.repeat(30)],
  ])('derives %s -> %s', (email, expected) => {
    expect(learningStudentDisplayNameFromEmail(email)).toBe(expected);
  });
});

describe('classroomRunLabel (real behavior)', () => {
  it('uses the run id and attempt when present', () => {
    expect(
      classroomRunLabel({
        ...process.env,
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_RUN_ID: '123',
      }),
    ).toBe('123-2');
  });

  it('falls back to a local, process-scoped label when unset', () => {
    expect(
      classroomRunLabel({
        ...process.env,
        GITHUB_RUN_ATTEMPT: undefined,
        GITHUB_RUN_ID: undefined,
      }),
    ).toMatch(/^local-\d+$/u);
  });
});

describe('learning-experience.spec.ts wiring (structural only, resolver behavior tested above)', () => {
  it('imports the fixture-resolution helpers instead of reimplementing them', async () => {
    const spec = await readText('tests/e2e/learning-experience.spec.ts');
    expect(spec).toContain("from './helpers/learning-experience-fixture'");
    expect(spec).not.toContain('const resolveLearningStudentCredentials');
    expect(spec).not.toContain('LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL');
  });

  it('wires the resolved credentials into sign-in, classroom join, and the teacher heading', async () => {
    const spec = await readText('tests/e2e/learning-experience.spec.ts');
    expect(spec).toContain('signIn(studentPage, learningStudentCredentials');
    expect(spec).toContain('joinClassroomByCode(learningStudentCredentials');
    expect(spec).toContain('learningStudentDisplayName');
    expect(spec).not.toContain('learning.student 的學習進度');
    expect(spec).not.toContain('TEST_USERS.learningStudent');
  });

  it('never re-enables automatic screenshot, trace, or video capture for this fixture-bearing spec', async () => {
    const spec = await readText('tests/e2e/learning-experience.spec.ts');
    const useIndex = spec.indexOf('test.use(');
    const testIndex = spec.indexOf("test('Learning Experience phase gate'");
    expect(useIndex).toBeGreaterThan(-1);
    expect(testIndex).toBeGreaterThan(useIndex);
    const useBlock = spec.slice(useIndex, testIndex);
    expect(useBlock).toContain("screenshot: 'off'");
    expect(useBlock).toContain("trace: 'off'");
    expect(useBlock).toContain("video: 'off'");
  });
});
