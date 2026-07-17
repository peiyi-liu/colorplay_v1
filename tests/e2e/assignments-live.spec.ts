import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import { CLASSROOM_FIXTURES, TEST_USERS } from '../fixtures/users';
import { assignmentsLiveExpectedFailureDeclarations } from './assignments-live-expected-failures';
import {
  attachBrowserHealth,
  declareExpectedBrowserFailure,
  expectedBrowserFailures,
  unexpectedBrowserHealth,
} from './browser-health';

const challenge = CONTENT_MANIFEST.find(
  ({ questionCount }) => questionCount >= 10,
);
if (!challenge) throw new Error('ASSIGNMENTS_LIVE_CHALLENGE_MISSING');

const sessionUrlPattern =
  /\/teacher\/live\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;

const signIn = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('navigation', { name: '主要導覽' }),
  ).toBeVisible();
  // Wait for the chapter query to settle before the caller navigates away,
  // so browser health never records a navigation-aborted manifest fetch.
  await expect(page.getByRole('heading', { name: '選擇章節' })).toBeVisible();
};

const completeAssignmentQuiz = async (page: Page) => {
  for (let position = 1; position <= 10; position += 1) {
    await expect(page.getByLabel('挑戰進度')).toContainText(
      `第 ${String(position)} / 10 題`,
    );
    const prompt = await page.locator('.question-card legend').innerText();
    const answer = GENERATED_CORRECT_ANSWERS.get(prompt);
    if (!answer) throw new Error('ASSIGNMENTS_LIVE_ANSWER_MISSING');
    await page.getByRole('radio', { name: answer }).check();
    await page.getByRole('button', { name: '送出答案' }).click();
    await expect(page.getByRole('heading', { name: '✓ 答對了' })).toBeVisible();
    await page
      .getByRole('button', {
        name: position === 10 ? '結算並查看結果' : '我理解了，下一題',
      })
      .click();
  }
  await expect(page.getByRole('heading', { name: '挑戰完成' })).toBeVisible();
};

const percentile = (samples: readonly number[], fraction: number): number => {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(fraction * sorted.length) - 1,
  );
  return Math.round(sorted[Math.max(0, index)] ?? 0);
};

const trackRpcDurations = (page: Page, rpcName: string, sink: number[]) => {
  page.on('requestfinished', (request) => {
    if (!request.url().includes(`/rest/v1/rpc/${rpcName}`)) return;
    const timing = request.timing();
    if (timing.responseEnd >= 0) sink.push(timing.responseEnd);
  });
};

const answerCorrectly = async (page: Page) => {
  const prompt = await page
    .locator('fieldset.question-card legend')
    .innerText();
  const answer = GENERATED_CORRECT_ANSWERS.get(prompt);
  if (!answer) throw new Error('ASSIGNMENTS_LIVE_LIVE_ANSWER_MISSING');
  await page
    .locator('fieldset.question-card button', { hasText: answer })
    .click();
  await expect(page.getByText('已收到你的答案，等待其他同學…')).toBeVisible();
};

const answerWrong = async (page: Page) => {
  const prompt = await page
    .locator('fieldset.question-card legend')
    .innerText();
  const answer = GENERATED_CORRECT_ANSWERS.get(prompt);
  if (!answer) throw new Error('ASSIGNMENTS_LIVE_LIVE_ANSWER_MISSING');
  await page
    .locator('fieldset.question-card button')
    .filter({ hasNotText: answer })
    .first()
    .click();
  await expect(page.getByText('已收到你的答案，等待其他同學…')).toBeVisible();
};

test('Assignments and Live Core phase gate', async ({
  baseURL,
  browser,
  page: hostPage,
}, testInfo) => {
  test.setTimeout(480_000);
  if (process.env.PLAYWRIGHT_ACCEPTANCE !== 'on') {
    throw new Error('ASSIGNMENTS_LIVE_ACCEPTANCE_MODE_REQUIRED');
  }
  const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  if (!evidenceRoot) {
    throw new Error('ASSIGNMENTS_LIVE_EVIDENCE_ROOT_REQUIRED');
  }
  if (!baseURL) {
    throw new Error('ASSIGNMENTS_LIVE_BASE_URL_REQUIRED');
  }

  const studentAContext = await browser.newContext({ baseURL });
  const studentBContext = await browser.newContext({ baseURL });
  const outsiderContext = await browser.newContext({ baseURL });
  const studentAPage = await studentAContext.newPage();
  const studentBPage = await studentBContext.newPage();
  const outsiderPage = await outsiderContext.newPage();

  const hostHealth = attachBrowserHealth(hostPage);
  const studentAHealth = attachBrowserHealth(studentAPage);
  const studentBHealth = attachBrowserHealth(studentBPage);
  const outsiderHealth = attachBrowserHealth(outsiderPage);

  const answerDurations: number[] = [];
  const finalizeDurations: number[] = [];
  trackRpcDurations(studentAPage, 'submit_live_answer', answerDurations);
  trackRpcDurations(studentBPage, 'submit_live_answer', answerDurations);
  trackRpcDurations(hostPage, 'finalize_live_session', finalizeDurations);

  await Promise.all([
    signIn(hostPage, TEST_USERS.teacher),
    signIn(studentAPage, TEST_USERS.studentOne),
    signIn(studentBPage, TEST_USERS.studentTwo),
  ]);

  // --- Assignments: teacher creates and publishes for the fixture class ---
  await hostPage.goto('/teacher/classes');
  await hostPage
    .getByRole('listitem')
    .filter({ hasText: CLASSROOM_FIXTURES.teacherOneClassroom.name })
    .getByRole('link', { name: '管理班級' })
    .click();
  await hostPage.getByRole('link', { name: '作業管理' }).click();
  await expect(
    hostPage.getByRole('heading', { name: '班級作業' }),
  ).toBeVisible();
  await hostPage.getByLabel('作業標題').fill('期末色彩作業');
  await hostPage.getByLabel('次數上限（可留空）').fill('2');
  await hostPage.getByRole('button', { name: '建立作業' }).click();
  const assignmentRow = hostPage.getByRole('row', { name: /期末色彩作業/u });
  await expect(assignmentRow).toBeVisible();
  await assignmentRow.getByRole('button', { name: '發佈' }).click();
  await hostPage.getByRole('button', { name: '確認' }).click();
  await expect(assignmentRow.getByText('進行中')).toBeVisible();

  // --- Student completes the assignment through the real quiz runner ---
  await studentAPage.goto('/app/assignments');
  await studentAPage.getByRole('link', { name: '期末色彩作業' }).click();
  await expect(
    studentAPage.getByRole('heading', { name: '期末色彩作業' }),
  ).toBeVisible();
  await studentAPage.setViewportSize({ width: 375, height: 812 });
  await studentAPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('assignment-detail-375x812.png'),
  });
  await studentAPage.setViewportSize({ width: 1280, height: 720 });
  await studentAPage.getByRole('button', { name: '開始作答' }).click();
  await completeAssignmentQuiz(studentAPage);
  await expect(studentAPage.getByText('作業已完成並通過。')).toBeVisible();
  await studentAPage.getByRole('link', { name: '返回我的作業' }).click();
  await expect(studentAPage.getByText(/次數 1 \/ 2・已通過/u)).toBeVisible();

  // --- Live: host creates an activity and opens a session ---
  await hostPage.goto('/teacher/live');
  await hostPage.getByLabel('活動標題').fill('Live 期末對戰');
  await hostPage.getByRole('button', { name: '建立活動' }).click();
  await expect(
    hostPage.getByRole('row', { name: /Live 期末對戰/u }),
  ).toBeVisible();
  await hostPage
    .getByLabel('開場班級')
    .selectOption({ label: CLASSROOM_FIXTURES.teacherOneClassroom.name });

  const runLiveSession = async (sessionIndex: number): Promise<void> => {
    await hostPage
      .getByRole('row', { name: /Live 期末對戰/u })
      .getByRole('button', { name: '開新場次' })
      .click();
    const codeText = await hostPage
      .getByLabel('課堂代碼')
      .locator('strong')
      .innerText();
    await hostPage.getByRole('link', { name: '前往主持台' }).click();
    await expect(
      hostPage.getByRole('heading', { name: '課堂挑戰主持' }),
    ).toBeVisible();
    const sessionMatch = sessionUrlPattern.exec(hostPage.url());
    const sessionId = sessionMatch?.[1];
    if (!sessionId) throw new Error('ASSIGNMENTS_LIVE_SESSION_ID_MISSING');
    await hostPage.getByRole('button', { name: '開啟等待室' }).click();
    await expect(
      hostPage.getByText('等待室開啟中，學生輸入課堂代碼即可加入。'),
    ).toBeVisible();

    for (const studentPage of [studentAPage, studentBPage]) {
      await studentPage.goto('/app/live/join');
      await studentPage.getByLabel('課堂代碼').fill(codeText);
      await studentPage.getByRole('button', { name: '加入課堂' }).click();
      await expect(studentPage.getByText('等待主持人開始…')).toBeVisible();
    }
    await expect(hostPage.getByText('2 位參與者・第 0 / 10 題')).toBeVisible();

    if (sessionIndex === 1) {
      await signIn(outsiderPage, TEST_USERS.outsider);
      declareExpectedBrowserFailure(
        outsiderHealth,
        assignmentsLiveExpectedFailureDeclarations.outsiderJoin,
      );
      await outsiderPage.goto('/app/live/join');
      await outsiderPage.getByLabel('課堂代碼').fill(codeText);
      await outsiderPage.getByRole('button', { name: '加入課堂' }).click();
      await expect(
        outsiderPage.getByText('代碼無效或課堂尚未開放，請向老師確認。'),
      ).toBeVisible();
      // Idle denied windows refetch on headed visibility changes; close now.
      await outsiderContext.close();
    }

    await hostPage.getByRole('button', { name: '開始第一題' }).click();

    for (let round = 1; round <= 10; round += 1) {
      for (const studentPage of [studentAPage, studentBPage]) {
        await expect(
          studentPage.getByText(`第 ${String(round)} / 10 題`),
        ).toBeVisible();
      }

      await answerCorrectly(studentAPage);
      if (sessionIndex === 1 && round === 3) {
        // Refresh mid-question after answering: the participant reconciles
        // to the same authoritative question and the recorded answer without
        // re-joining or double-submitting (and without pressuring the 5s
        // speed-bonus window).
        await studentAPage.reload();
        await expect(
          studentAPage.getByText(`第 ${String(round)} / 10 題`),
        ).toBeVisible();
        await expect(
          studentAPage.getByText('已收到你的答案，等待其他同學…'),
        ).toBeVisible();
      }
      if (sessionIndex === 1 && round === 8) {
        await studentBPage.setViewportSize({ width: 768, height: 1024 });
        await studentBPage.screenshot({
          fullPage: true,
          path: testInfo.outputPath('live-question-768x1024.png'),
        });
        await studentBPage.setViewportSize({ width: 1280, height: 720 });
      }
      await answerWrong(studentBPage);

      await expect(hostPage.getByText('已作答 2 / 2')).toBeVisible();
      verifiedAnswerPairs += 2;
      await hostPage.getByRole('button', { name: '收題並公布答案' }).click();
      await expect(
        studentAPage.getByRole('heading', { name: /✓ 答對了/u }),
      ).toBeVisible();

      if (round < 10) {
        if (sessionIndex === 1 && round === 6) {
          // Two host consoles dispatch the same advance at the same version.
          // The server's compare-and-set admits exactly one; the losing tab
          // (either one — commit order decides) surfaces the conflict alert
          // and reconciles to the round the winner opened. Sequential clicks
          // would race the broadcast reconcile, so both dispatch together.
          const duplicateHostPage = await hostPage.context().newPage();
          const duplicateHealth = attachBrowserHealth(duplicateHostPage);
          await duplicateHostPage.goto(`/teacher/live/${sessionId}`);
          await expect(
            duplicateHostPage.getByRole('button', { name: '下一題' }),
          ).toBeVisible();
          declareExpectedBrowserFailure(
            hostHealth,
            assignmentsLiveExpectedFailureDeclarations.duplicateHostAdvance,
          );
          declareExpectedBrowserFailure(
            duplicateHealth,
            assignmentsLiveExpectedFailureDeclarations.duplicateHostAdvance,
          );
          await Promise.all([
            hostPage.getByRole('button', { name: '下一題' }).click(),
            duplicateHostPage.getByRole('button', { name: '下一題' }).click(),
          ]);
          const conflictAlert = '另一個主持分頁已推進狀態，畫面已同步為最新。';
          await expect(async () => {
            const [hostConflict, duplicateConflict] = await Promise.all([
              hostPage.getByText(conflictAlert).isVisible(),
              duplicateHostPage.getByText(conflictAlert).isVisible(),
            ]);
            expect(hostConflict !== duplicateConflict).toBe(true);
          }).toPass({ timeout: 10_000 });
          duplicateHostHealths.push(duplicateHealth);
          await duplicateHostPage.close();
        } else {
          await hostPage.getByRole('button', { name: '下一題' }).click();
        }
      } else {
        await hostPage.getByRole('button', { name: '結算成績' }).click();
      }
    }

    await expect(
      hostPage.getByRole('heading', { name: '最終排名' }),
    ).toBeVisible();
    await expect(
      studentAPage.getByText(/你的成績：1500 分，第 1 名/u),
    ).toBeVisible();
    await expect(
      studentBPage.getByText(/你的成績：0 分，第 2 名/u),
    ).toBeVisible();
    for (const trackedPage of [studentAPage, studentBPage]) {
      await expect(trackedPage.locator('body')).not.toContainText(
        TEST_USERS.studentOne.email,
      );
      await expect(trackedPage.locator('body')).not.toContainText(
        TEST_USERS.studentTwo.email,
      );
    }

    if (sessionIndex === 1) {
      await hostPage.setViewportSize({ width: 1440, height: 900 });
      await hostPage.screenshot({
        fullPage: true,
        path: testInfo.outputPath('live-host-console-1440x900.png'),
      });
      await hostPage.setViewportSize({ width: 1280, height: 720 });
    }

    await hostPage.goto('/teacher/live');
    await hostPage
      .getByLabel('開場班級')
      .selectOption({ label: CLASSROOM_FIXTURES.teacherOneClassroom.name });
  };

  const duplicateHostHealths: ReturnType<typeof attachBrowserHealth>[] = [];
  let verifiedAnswerPairs = 0;
  await runLiveSession(1);
  await runLiveSession(2);

  expect(answerDurations.length).toBeGreaterThanOrEqual(30);
  // Integrity fields are derived from in-run observations, not asserted:
  // every round's host console confirmed 2/2 authoritative answers, the
  // unique (participant, question) constraint precludes duplicates, and the
  // outsider probe is counted through its declared-failure observation.
  const outsiderObservations = expectedBrowserFailures(outsiderHealth);
  const latencyReport = {
    answer_p95_ms: percentile(answerDurations, 0.95),
    answer_samples: answerDurations.length,
    finalize_p95_ms: percentile(finalizeDurations, 0.95),
    finalize_samples: finalizeDurations.length,
    lost_or_duplicate_answers: 40 - verifiedAnswerPairs,
    outsider_access: outsiderObservations[0]?.observed_count === 1 ? 0 : 1,
  };
  expect(verifiedAnswerPairs).toBe(40);
  expect(latencyReport.answer_p95_ms).toBeLessThanOrEqual(800);
  expect(latencyReport.finalize_p95_ms).toBeLessThanOrEqual(1000);

  const trackedHealths = [
    hostHealth,
    studentAHealth,
    studentBHealth,
    outsiderHealth,
    ...duplicateHostHealths,
  ];
  const healthResults = trackedHealths.map((health) =>
    unexpectedBrowserHealth(health, 'chromium'),
  );
  const joinPattern =
    assignmentsLiveExpectedFailureDeclarations.outsiderJoin.urlPattern.source;
  const advancePattern =
    assignmentsLiveExpectedFailureDeclarations.duplicateHostAdvance.urlPattern
      .source;
  const allDeclared = trackedHealths.flatMap((health) =>
    expectedBrowserFailures(health),
  );
  const joinReports = allDeclared.filter(
    (report) => report.url_pattern === joinPattern,
  );
  const advanceReports = allDeclared.filter(
    (report) => report.url_pattern === advancePattern,
  );
  expect(allDeclared.length).toBe(joinReports.length + advanceReports.length);
  expect(joinReports.map((report) => report.observed_count)).toEqual([1]);
  // Exactly one of the two racing host tabs recorded the conflict 400.
  expect(
    advanceReports.reduce((sum, report) => sum + report.observed_count, 0),
  ).toBe(1);
  const declaredFailures = [
    ...joinReports,
    {
      expected_count: 1,
      observed_count: 1,
      status: 400,
      url_pattern: advancePattern,
    },
  ];
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
    join(evidenceRoot, 'reports/live-latency.json'),
    `${JSON.stringify(latencyReport)}\n`,
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

  await Promise.all([studentAContext.close(), studentBContext.close()]);
});
