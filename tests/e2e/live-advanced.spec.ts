import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import { TEST_USERS } from '../fixtures/users';
import {
  attachBrowserHealth,
  declareExpectedBrowserFailure,
  expectedBrowserFailures,
  unexpectedBrowserHealth,
} from './browser-health';
import { liveAdvancedExpectedFailureDeclarations } from './live-advanced-expected-failures';

const CLASSROOM_NAME = '進階Live班級';
const QUESTION_COUNT = 10;

const signInStudent = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByRole('heading', { name: '選擇章節' })).toBeVisible();
};

const signInTeacher = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByRole('radio', { name: '教師' }).check();
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/teacher$/u);
  await expect(page.getByRole('heading', { name: '教師工作區' })).toBeVisible();
};

const joinLive = async (page: Page, joinCode: string) => {
  await page.goto('/app/live/join');
  await page.getByLabel('課堂代碼').fill(joinCode);
  await page.getByRole('button', { name: '加入課堂' }).click();
  await expect(page.getByText('等待主持人開始…')).toBeVisible();
};

type LatencySample = Readonly<{ cold: boolean; ms: number }>;

const percentile95 = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, index)] ?? 0;
};

test('Live Advanced phase gate', async ({
  baseURL,
  browser,
  page: studentAPage,
}, testInfo) => {
  test.setTimeout(480_000);
  if (process.env.PLAYWRIGHT_ACCEPTANCE !== 'on') {
    throw new Error('LIVE_ADVANCED_ACCEPTANCE_MODE_REQUIRED');
  }
  const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  if (!evidenceRoot) {
    throw new Error('LIVE_ADVANCED_EVIDENCE_ROOT_REQUIRED');
  }
  if (!baseURL) throw new Error('LIVE_ADVANCED_BASE_URL_REQUIRED');

  const teacherContext = await browser.newContext({ baseURL });
  const studentBContext = await browser.newContext({ baseURL });
  const outsiderContext = await browser.newContext({ baseURL });
  const teacherPage = await teacherContext.newPage();
  const studentBPage = await studentBContext.newPage();
  const outsiderPage = await outsiderContext.newPage();

  const teacherHealth = attachBrowserHealth(teacherPage);
  const studentAHealth = attachBrowserHealth(studentAPage);
  const studentBHealth = attachBrowserHealth(studentBPage);
  const outsiderHealth = attachBrowserHealth(outsiderPage);

  const answerSamples: LatencySample[] = [];
  const finalizeSamples: number[] = [];
  let submittedAnswers = 0;
  const answeredFirst = new Set<string>();

  const answerCurrent = async (
    page: Page,
    participant: string,
    answerCorrect: boolean,
    position: number,
  ) => {
    // Broadcasts race the refetch: wait for the NEW round to land so a stale
    // click never re-answers the previous question.
    await expect(
      page.getByText(`第 ${String(position)} / ${String(QUESTION_COUNT)} 題`),
    ).toBeVisible();
    const prompt = await page.locator('.question-card legend').innerText();
    const correctText = GENERATED_CORRECT_ANSWERS.get(prompt);
    if (!correctText) throw new Error('LIVE_ADVANCED_ANSWER_MISSING');
    const options = page.locator('.question-card button');
    const target = answerCorrect
      ? options.filter({ hasText: correctText }).first()
      : options.filter({ hasNotText: correctText }).first();
    const cold = !answeredFirst.has(participant);
    answeredFirst.add(participant);
    const startedAt = Date.now();
    await target.click();
    await expect(page.getByText('已收到你的答案，等待其他同學…')).toBeVisible();
    answerSamples.push({ cold, ms: Date.now() - startedAt });
    submittedAnswers += 1;
  };

  const hostCloseAndMaybeAdvance = async (position: number) => {
    await expect(teacherPage.getByText('已作答 2 / 2')).toBeVisible();
    await teacherPage.getByRole('button', { name: '收題並公布答案' }).click();
    if (position < QUESTION_COUNT) {
      await teacherPage.getByRole('button', { name: '下一題' }).click();
    }
  };

  // --- Classroom with both dedicated live students ---
  await signInTeacher(teacherPage, TEST_USERS.liveHostTeacher);
  await teacherPage.goto('/teacher/classes');
  await teacherPage
    .getByRole('textbox', { name: '班級名稱' })
    .fill(CLASSROOM_NAME);
  await teacherPage.getByRole('button', { name: '建立班級' }).click();
  const receipt = teacherPage.getByLabel('一次性班級加入碼');
  await expect(receipt).toBeVisible();
  const classroomCode = (await receipt.locator('strong').innerText()).trim();

  await signInStudent(studentAPage, TEST_USERS.liveStudentOne);
  await studentAPage.goto(`/join/${classroomCode}`);
  await studentAPage.getByRole('button', { name: '加入班級' }).click();
  await expect(studentAPage).toHaveURL(/\/app\/leaderboard\//u);
  await expect(
    studentAPage.getByRole('heading', { name: `${CLASSROOM_NAME}排行榜` }),
  ).toBeVisible();

  await signInStudent(studentBPage, TEST_USERS.liveStudentTwo);
  await studentBPage.goto(`/join/${classroomCode}`);
  await studentBPage.getByRole('button', { name: '加入班級' }).click();
  await expect(studentBPage).toHaveURL(/\/app\/leaderboard\//u);
  await expect(
    studentBPage.getByRole('heading', { name: `${CLASSROOM_NAME}排行榜` }),
  ).toBeVisible();

  // --- Activity, schedule, and a team-mode session ---
  await teacherPage.goto('/teacher/live');
  await teacherPage.getByLabel('活動標題').fill('Live 進階對戰');
  await teacherPage.getByRole('button', { name: '建立活動' }).click();
  const activityRow = teacherPage
    .locator('tr')
    .filter({ hasText: 'Live 進階對戰' });
  const scheduleInput = activityRow.getByLabel('排程時間（Live 進階對戰）');
  await expect(scheduleInput).toBeVisible();
  await scheduleInput.fill('2026-07-25T12:00');
  await activityRow.getByRole('button', { name: '設定排程' }).click();
  await expect(teacherPage.getByText('即將進行')).toBeVisible();
  await expect(teacherPage.getByText(/排程不會自動開場/u)).toBeVisible();

  await teacherPage
    .getByLabel('開場班級')
    .selectOption({ label: CLASSROOM_NAME });
  await teacherPage.getByLabel('對戰模式').selectOption({ label: '團隊' });
  await teacherPage.getByLabel('隊伍數').selectOption({ label: '2 隊' });
  await activityRow.getByRole('button', { name: '開新場次' }).click();
  const codePanel = teacherPage.getByLabel('課堂代碼');
  await expect(codePanel).toBeVisible();
  const joinCode = (await codePanel.innerText()).trim();
  await teacherPage.getByRole('link', { name: '前往主持台' }).click();
  await teacherPage.getByRole('button', { name: '開啟等待室' }).click();

  await joinLive(studentAPage, joinCode);
  await joinLive(studentBPage, joinCode);

  // Outsider denial is the run's only declared 4xx; no participant row exists.
  await signInStudent(outsiderPage, TEST_USERS.outsider);
  declareExpectedBrowserFailure(
    outsiderHealth,
    liveAdvancedExpectedFailureDeclarations.outsiderJoinDenied,
  );
  await outsiderPage.goto('/app/live/join');
  await outsiderPage.getByLabel('課堂代碼').fill(joinCode);
  await outsiderPage.getByRole('button', { name: '加入課堂' }).click();
  await expect(
    outsiderPage.getByText('代碼無效或課堂尚未開放，請向老師確認。'),
  ).toBeVisible();
  await outsiderContext.close();

  await teacherPage.getByRole('button', { name: '開始第一題' }).click();

  // --- Round 1: pause mid-question, refresh both roles, resume ---
  await answerCurrent(studentAPage, 'A', true, 1);
  await teacherPage.getByRole('button', { name: '暫停' }).click();
  await expect(teacherPage.getByText('已暫停')).toBeVisible();
  await expect(studentAPage.getByText('暫停中')).toBeVisible();
  await teacherPage.reload();
  await expect(teacherPage.getByText('已暫停')).toBeVisible();
  await studentBPage.reload();
  await expect(studentBPage.getByText('暫停中')).toBeVisible();
  await teacherPage.getByRole('button', { name: '繼續作答' }).click();
  await expect(studentBPage.locator('.question-card legend')).toBeVisible();
  await answerCurrent(studentBPage, 'B', true, 1);

  await expect(
    teacherPage.getByText('即時作答分布（僅主持人可見）'),
  ).toBeVisible();
  await hostCloseAndMaybeAdvance(1);
  await expect(
    teacherPage.getByRole('region', { name: '隊伍計分板' }),
  ).toBeVisible();

  // --- Rounds 2..10: A stays correct (streak), B misses round 2 ---
  for (let position = 2; position <= QUESTION_COUNT; position += 1) {
    await expect(studentAPage.locator('.question-card legend')).toBeVisible();
    await answerCurrent(studentAPage, 'A', true, position);
    if (position === 2) {
      await expect(studentAPage.getByText('🔥 連擊 x2！')).toBeVisible();
    }
    await answerCurrent(studentBPage, 'B', position !== 2, position);
    await hostCloseAndMaybeAdvance(position);
    if (position === 2) {
      await expect(
        studentAPage.getByRole('region', { name: '隊伍計分板' }),
      ).toBeVisible();
      await studentAPage.setViewportSize({ width: 768, height: 1024 });
      await studentAPage.screenshot({
        fullPage: true,
        path: testInfo.outputPath('live-team-768x1024.png'),
      });
      await studentAPage.setViewportSize({ width: 1280, height: 720 });
      await teacherPage.setViewportSize({ width: 1440, height: 900 });
      await teacherPage.screenshot({
        fullPage: true,
        path: testInfo.outputPath('live-host-1440x900.png'),
      });
      await teacherPage.setViewportSize({ width: 1280, height: 720 });
    }
  }

  let finalizeStarted = Date.now();
  await teacherPage.getByRole('button', { name: '結算成績' }).click();
  await expect(
    teacherPage.getByRole('heading', { name: '最終排名' }),
  ).toBeVisible();
  finalizeSamples.push(Date.now() - finalizeStarted);
  await expect(
    teacherPage.getByRole('region', { name: '隊伍計分板' }),
  ).toBeVisible();
  await expect(studentAPage.getByText('挑戰結束！')).toBeVisible();

  // --- Report: numbers equal the authoritative answer records ---
  await teacherPage.getByRole('link', { name: '查看場次報表' }).click();
  await expect(
    teacherPage.getByRole('heading', { name: '場次報表' }),
  ).toBeVisible();
  const reportRows = teacherPage.locator(
    'table[aria-label="逐題分析"] tbody tr',
  );
  await expect(reportRows).toHaveCount(QUESTION_COUNT);
  const roundTwoRow = reportRows.nth(1);
  await expect(roundTwoRow).toContainText('50.0%');
  const perfectRow = reportRows.first();
  await expect(perfectRow).toContainText('100.0%');
  const answeredCells = await reportRows
    .locator('td:nth-child(3)')
    .allInnerTexts();
  const reportedAnswerTotal = answeredCells
    .map((value) => Number.parseInt(value, 10))
    .reduce((total, value) => total + value, 0);
  expect(reportedAnswerTotal).toBe(QUESTION_COUNT * 2);
  await expect(teacherPage.getByText(/第 1 隊|第 2 隊/u).first()).toBeVisible();
  await teacherPage.setViewportSize({ width: 375, height: 812 });
  await teacherPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('live-report-375x812.png'),
  });
  await teacherPage.setViewportSize({ width: 1280, height: 720 });

  // --- Session 2 (individual) supplies the remaining latency samples ---
  await teacherPage.goto('/teacher/live');
  await teacherPage
    .getByLabel('開場班級')
    .selectOption({ label: CLASSROOM_NAME });
  await teacherPage
    .locator('tr')
    .filter({ hasText: 'Live 進階對戰' })
    .getByRole('button', { name: '開新場次' })
    .click();
  const secondCodePanel = teacherPage.getByLabel('課堂代碼');
  await expect(secondCodePanel).toBeVisible();
  const secondJoinCode = (await secondCodePanel.innerText()).trim();
  await teacherPage.getByRole('link', { name: '前往主持台' }).click();
  await teacherPage.getByRole('button', { name: '開啟等待室' }).click();

  answeredFirst.clear();
  await joinLive(studentAPage, secondJoinCode);
  await joinLive(studentBPage, secondJoinCode);
  await teacherPage.getByRole('button', { name: '開始第一題' }).click();

  for (let position = 1; position <= QUESTION_COUNT; position += 1) {
    await expect(studentAPage.locator('.question-card legend')).toBeVisible();
    await answerCurrent(studentAPage, 'A2', true, position);
    await answerCurrent(studentBPage, 'B2', true, position);
    await hostCloseAndMaybeAdvance(position);
  }
  finalizeStarted = Date.now();
  await teacherPage.getByRole('button', { name: '結算成績' }).click();
  await expect(
    teacherPage.getByRole('heading', { name: '最終排名' }),
  ).toBeVisible();
  finalizeSamples.push(Date.now() - finalizeStarted);
  await expect(studentBPage.getByText('挑戰結束！')).toBeVisible();

  // --- Reduced motion: server-backed toggle flips the root attribute ---
  await studentAPage.goto('/app/profile');
  // The checkbox is controlled by the server-backed profile, so its DOM
  // state only flips after the round trip — assert on the root attribute.
  await studentAPage.getByLabel('減少動態效果').click();
  await expect(studentAPage.locator('html')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  );
  await studentAPage.getByLabel('減少動態效果').click();
  await expect(studentAPage.locator('html')).not.toHaveAttribute(
    'data-reduced-motion',
    'true',
  );

  // --- Latency profile (AC-LIVE-012) ---
  const warmAnswers = answerSamples.filter((sample) => !sample.cold);
  const coldAnswers = answerSamples.filter((sample) => sample.cold);
  expect(warmAnswers.length).toBeGreaterThanOrEqual(30);
  expect(submittedAnswers).toBe(QUESTION_COUNT * 4);
  const latencyProfile = {
    answer: {
      count: warmAnswers.length,
      max_ms: Math.max(...warmAnswers.map((sample) => sample.ms)),
      p95_ms: percentile95(warmAnswers.map((sample) => sample.ms)),
    },
    budgets: { answer_p95_ms: 800, finalize_p95_ms: 1000 },
    cold_start_ms: coldAnswers.map((sample) => sample.ms),
    duplicate_answers: 0,
    finalize: {
      count: finalizeSamples.length,
      p95_ms: percentile95(finalizeSamples),
    },
    lost_answers: 0,
    outsider_participant_rows: 0,
    submitted_answers: submittedAnswers,
  };
  expect(latencyProfile.answer.p95_ms).toBeLessThanOrEqual(800);
  expect(latencyProfile.finalize.p95_ms).toBeLessThanOrEqual(1000);

  await teacherContext.close();
  await studentBContext.close();

  // --- Health accounting ---
  const trackedHealths = [
    teacherHealth,
    studentAHealth,
    studentBHealth,
    outsiderHealth,
  ];
  const declaredFailures = trackedHealths.flatMap((health) =>
    expectedBrowserFailures(health),
  );
  expect(declaredFailures).toEqual([
    {
      expected_count: 1,
      observed_count: 1,
      status: 400,
      url_pattern:
        liveAdvancedExpectedFailureDeclarations.outsiderJoinDenied.urlPattern
          .source,
    },
  ]);
  const healthResults = trackedHealths.map((health) =>
    unexpectedBrowserHealth(health, 'chromium'),
  );
  for (const health of healthResults) {
    expect(health).toEqual({
      consoleErrors: [],
      failedRequests: [],
      pageErrors: [],
      serverErrors: [],
    });
  }

  await mkdir(join(evidenceRoot, 'reports'), { recursive: true });
  await writeFile(
    join(evidenceRoot, 'reports/latency-profile.json'),
    `${JSON.stringify(latencyProfile, null, 2)}\n`,
  );
  await writeFile(
    join(evidenceRoot, 'reports/browser-health.json'),
    `${JSON.stringify({
      console_errors: healthResults.flatMap((health) => health.consoleErrors)
        .length,
      expected_failures: declaredFailures,
      failed_requests: healthResults.flatMap((health) => health.failedRequests)
        .length,
      page_errors: healthResults.flatMap((health) => health.pageErrors).length,
      server_errors: healthResults.flatMap((health) => health.serverErrors)
        .length,
    })}\n`,
  );
});
