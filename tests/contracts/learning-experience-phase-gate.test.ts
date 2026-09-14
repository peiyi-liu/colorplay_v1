import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { ACCEPTANCE_IDS } from '../../scripts/acceptance/finalize-learning-experience.mjs';
import { LEARNING_FIXTURE_CREDENTIAL_FALLBACK_SENTINEL } from '../../scripts/staging/provision-learning-experience-fixture.mjs';
import { TEST_USERS } from '../fixtures/users';
import {
  classroomRunLabel,
  isTeacherLandingUrl,
  learningStudentDisplayNameFromEmail,
  resolveLearningStudentCredentials,
  signIn,
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

  // Run 34852498818: AC-PROG-005 (accuracy), AC-PROG-003 (mastery label),
  // AC-PROG-006 (cross-tenant _v2 denial). Source contracts only.
  it('asserts the teacher analytics contract matches the actual formal assessment path', async () => {
    const spec = await readText('tests/e2e/learning-experience.spec.ts');
    expect(spec).toContain("toContainText('80.0%')");
    expect(spec).not.toContain("toContainText('100.0%')");
    expect(spec).toContain("toContainText('已完成')");
    expect(spec).not.toContain("toContainText('已精熟')");
    expect(spec).toContain('rpc\\/teacher_student_progress_v2(?:');
    expect(spec).not.toContain('teacher_student_progress(?:');
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

// signIn() takes a live Playwright Page, so a real click-through of the
// teacher-portal branch can only execute in a Hosted browser session; this
// locks the source shape of the fix instead, per the S-level remediation
// brief's "narrow source/contract test" allowance.
describe('signIn teacher/student portal branching (source contract)', () => {
  const signInSource = async () => {
    const full = await readText(
      'tests/e2e/helpers/learning-experience-fixture.ts',
    );
    const start = full.indexOf('export const signIn');
    expect(start).toBeGreaterThan(-1);
    return full.slice(start);
  };

  it('selects the 教師端登入 portal via the established getByText(...).click() interaction before submitting, only when navigationName is 教師導覽', async () => {
    const source = await signInSource();
    const guardIndex = source.indexOf("navigationName === '教師導覽'");
    const portalClickIndex = source.indexOf("getByText('教師端登入').click()");
    const submitIndex = source.indexOf("name: '登入' }).click()");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(portalClickIndex).toBeGreaterThan(guardIndex);
    expect(submitIndex).toBeGreaterThan(portalClickIndex);
  });

  it('never uses .check() on the portal radio: it is visually clipped and .check() waits for visibility until timeout (tests/e2e/helpers/auth.ts signInTeacher)', async () => {
    const source = await signInSource();
    expect(source).not.toContain('.check()');
    expect(source).not.toContain("getByRole('radio'");
  });

  it('asserts /teacher and 教學分析 for the teacher branch, never the student learning-map heading', async () => {
    const source = await signInSource();
    const clickIndex = source.indexOf("name: '登入' }).click()");
    const teacherBranchStart = source.indexOf('isTeacherPortal', clickIndex);
    const studentBranchStart = source.indexOf('toHaveURL(/\\/app$/u)');
    expect(clickIndex).toBeGreaterThan(-1);
    expect(teacherBranchStart).toBeGreaterThan(clickIndex);
    expect(studentBranchStart).toBeGreaterThan(teacherBranchStart);
    const teacherBranch = source.slice(teacherBranchStart, studentBranchStart);
    expect(teacherBranch).toContain('toHaveURL(isTeacherLandingUrl)');
    expect(teacherBranch).toContain("name: '教學分析'");
    expect(teacherBranch).not.toContain('學習地圖');
  });

  it('preserves the student branch: no portal selection, /app URL, and the 學習地圖 heading', async () => {
    const source = await signInSource();
    const studentBranchStart = source.indexOf('toHaveURL(/\\/app$/u)');
    expect(studentBranchStart).toBeGreaterThan(-1);
    const studentBranch = source.slice(studentBranchStart);
    expect(studentBranch).toContain("name: '學習地圖'");
    expect(studentBranch).not.toContain('教師端登入');
    expect(studentBranch).not.toContain('/teacher');
  });
});

// Codex finding-closure review on PR #43 (reviewed head 8317ddd) held P2
// open: the source-position contract above proves the guard text and the
// portal click occur in that order, but not that the click is actually
// contained inside the `if (isTeacherPortal)` body -- an unconditional
// click after an empty guard would still satisfy it. This executes the
// real signIn() against a mocked Page and proves containment directly: a
// stub .fill() on the account textbox rejects with a sentinel right after
// the portal-selection step, so signIn() never reaches the Playwright
// expect() matchers that need a real Page/Locator.
describe('signIn portal click containment (executable, mocked Page)', () => {
  const STOP_AFTER_ACCOUNT_FILL = new Error('stop-after-account-fill-sentinel');
  const credentials = { email: 'fixture@colorplay.test', password: 'x' };

  const mockedPage = () => {
    const portalClick = vi.fn(() => Promise.resolve());
    const getByText = vi.fn(() => ({ click: portalClick }));
    const getByRole = vi.fn(() => ({
      fill: () => Promise.reject(STOP_AFTER_ACCOUNT_FILL),
    }));
    const page = { getByRole, getByText, goto: vi.fn(() => Promise.resolve()) };
    return {
      getByText,
      page: page as unknown as Parameters<typeof signIn>[0],
      portalClick,
    };
  };

  it('clicks 教師端登入 exactly once for a teacher sign-in', async () => {
    const { getByText, page, portalClick } = mockedPage();
    await expect(signIn(page, credentials, '教師導覽')).rejects.toBe(
      STOP_AFTER_ACCOUNT_FILL,
    );
    expect(getByText).toHaveBeenCalledExactlyOnceWith('教師端登入');
    expect(portalClick).toHaveBeenCalledOnce();
  });

  it('never calls getByText for a student sign-in', async () => {
    const { getByText, page } = mockedPage();
    await expect(signIn(page, credentials, '主要導覽')).rejects.toBe(
      STOP_AFTER_ACCOUNT_FILL,
    );
    expect(getByText).not.toHaveBeenCalled();
  });
});

// Issue #41 run 34845782905 S-level fix: the prior /\/teacher$/u assertion
// rejected the teacher analytics page's normal /teacher?classroomId=... state.
// isTeacherLandingUrl is exported specifically so this exact-pathname
// predicate can be executed against real URL instances instead of only
// being locked as a source string.
describe('isTeacherLandingUrl (real behavior, exact pathname match)', () => {
  it('accepts the bare /teacher pathname', () => {
    expect(
      isTeacherLandingUrl(new URL('https://staging.colorplay.test/teacher')),
    ).toBe(true);
  });

  it('accepts /teacher with the teacher-analytics classroomId query', () => {
    expect(
      isTeacherLandingUrl(
        new URL(
          'https://staging.colorplay.test/teacher?classroomId=fixture-classroom-1',
        ),
      ),
    ).toBe(true);
  });

  it.each([
    ['/teacher/classes (prefix, not exact)', '/teacher/classes'],
    ['/app (student route)', '/app'],
    ['/unauthorized', '/unauthorized'],
  ])('rejects %s', (_label, pathname) => {
    expect(
      isTeacherLandingUrl(new URL(`https://staging.colorplay.test${pathname}`)),
    ).toBe(false);
  });
});

// Mocks just enough of Page for signIn()'s real toHaveURL gate to run end-to-end.
describe('signIn teacher URL gate (executable, mocked Page)', () => {
  const credentials = { email: 'fixture@colorplay.test', password: 'x' };

  const mockedTeacherPage = (currentUrl: string, alertCount = 0) => {
    const NAVIGATION_CHECK_REACHED = new Error(
      'navigation-check-reached-sentinel',
    );
    const waitForURL = vi.fn((predicate: (url: URL) => boolean) =>
      predicate(new URL(currentUrl))
        ? Promise.resolve()
        : Promise.reject(
            new Error('waitForURL: predicate never matched (mock)'),
          ),
    );
    const getByRole = vi.fn((role: string) => {
      if (role === 'navigation') throw NAVIGATION_CHECK_REACHED;
      if (role === 'alert') return { count: () => Promise.resolve(alertCount) };
      return { click: () => Promise.resolve(), fill: () => Promise.resolve() };
    });
    const page = {
      context: () => ({ _options: {} }),
      getByLabel: vi.fn(() => ({ fill: () => Promise.resolve() })),
      getByRole,
      getByText: vi.fn(() => ({ click: () => Promise.resolve() })),
      goto: vi.fn(() => Promise.resolve()),
      mainFrame: () => ({ waitForURL }),
      url: () => currentUrl,
    };
    return {
      NAVIGATION_CHECK_REACHED,
      getByRole,
      page: page as unknown as Parameters<typeof signIn>[0],
      waitForURL,
    };
  };

  it('accepts /teacher?classroomId=<fixture-id> and reaches navigation; classifies every failure into a fixed safe sentinel (Issue #41, run 34852498818)', async () => {
    const ok = mockedTeacherPage(
      'https://staging.colorplay.test/teacher?classroomId=fixture-classroom-1',
    );
    await expect(signIn(ok.page, credentials, '教師導覽')).rejects.toBe(
      ok.NAVIGATION_CHECK_REACHED,
    );
    expect(ok.waitForURL).toHaveBeenCalledOnce();
    expect(ok.getByRole).toHaveBeenCalledWith('navigation', {
      name: '教師導覽',
    });

    // Failure diagnostic: only a fixed safe category reaches the caller.
    for (const [category, url, alertCount] of [
      ['unrecognized_state', 'http://test/teacher/classes?token=x', 0],
      ['still_on_login', 'http://test/login', 0],
      ['unauthorized', 'http://test/unauthorized', 0],
      ['alert_visible', 'http://test/teacher/classes', 1],
    ] as const) {
      const { page } = mockedTeacherPage(url, alertCount);
      const error = (await signIn(page, credentials, '教師導覽').catch(
        (e: unknown) => e,
      )) as Error;
      expect(error.message).toBe(
        `LEARNING_EXPERIENCE_TEACHER_LOGIN_GATE_FAILED: ${category}`,
      );
      expect(error.cause).toBeUndefined();
      expect(error.message).not.toMatch(/:\/\/|toHaveURL/u);
    }
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
