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

// 教師／學生共用登入表單（email 橋接一律導向 /app），但 app-shell.tsx 的導覽列
// 是依帳號角色（isTeacher）擇一渲染，不是依路徑：教師帳號登入後即使停在
// /app 也只會看到「教師導覽」，看不到「主要導覽」——舊版共用同一支 signIn
// 斷言「主要導覽」，對教師帳號必定逾時失敗，拆成兩支各自斷言正確的導覽列。
const signInStudent = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('navigation', { name: '主要導覽' }),
  ).toBeVisible();
  // Wait for the chapter query to settle before the caller navigates away,
  // so browser health never records a navigation-aborted manifest fetch.
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
};

const signInTeacher = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('navigation', { name: '教師導覽' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
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
  // B always answers last, and since 2026-07-live-3 the final answer closes
  // the question automatically: the receipt is the immediate feedback card.
  await expect(page.getByRole('heading', { name: /✗ 答錯了/u })).toBeVisible();
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
    signInTeacher(hostPage, TEST_USERS.teacher),
    signInStudent(studentAPage, TEST_USERS.studentOne),
    signInStudent(studentBPage, TEST_USERS.studentTwo),
  ]);

  // --- Live: host creates an activity and opens a session ---
  // Assignments 功能已依 0730 設計交付批 owner 裁定移除且不復活（見
  // colorplay-0730-design-handoff 備忘），本檔原本「教師建立/發佈作業→學生
  // 透過作業入口完成測驗」的段落已整段刪除；以下 Live 場次覆蓋（雙主持分頁
  // 搶答衝突、速度加成計分、學生中途重整回執）與 live-smoke／live-advanced
  // 不重複，獨立保留。
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
      // Outsider denial arrives as a committed 200 payload error since
      // 2026-07-live-3 (throttle counting), so it is verified by the
      // visible message instead of a declared 4xx.
      await signInStudent(outsiderPage, TEST_USERS.outsider);
      await outsiderPage.goto('/app/live/join');
      await outsiderPage.getByLabel('課堂代碼').fill(codeText);
      await outsiderPage.getByRole('button', { name: '加入課堂' }).click();
      await expect(
        outsiderPage.getByText('代碼無效或課堂尚未開放，請向老師確認。'),
      ).toBeVisible();
      outsiderDeniedCount += 1;
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

      // 2026-07-live-3: the second answer auto-closed the round — both
      // students land on their authoritative feedback without a host close.
      await expect(
        studentAPage.getByRole('heading', { name: /✓ 答對了/u }),
      ).toBeVisible();
      verifiedAnswerPairs += 2;

      if (round < 10) {
        if (sessionIndex === 1 && round === 6) {
          // Two host consoles dispatch the same advance at the same version.
          // The server's compare-and-set admits exactly one; the losing tab
          // (either one — commit order decides) surfaces the conflict alert
          // and reconciles to the round the winner opened. Sequential clicks
          // would race the broadcast reconcile, so both dispatch together.
          // Auth lives in sessionStorage (close-tab logout policy), which a
          // fresh tab starts without; copy it over like a real duplicated
          // tab would inherit it.
          const sessionSnapshot = await hostPage.evaluate(() =>
            JSON.stringify(
              Object.fromEntries(
                Object.keys(window.sessionStorage).map((key) => [
                  key,
                  window.sessionStorage.getItem(key) ?? '',
                ]),
              ),
            ),
          );
          const duplicateHostPage = await hostPage.context().newPage();
          const duplicateHealth = attachBrowserHealth(duplicateHostPage);
          await duplicateHostPage.addInitScript((snapshot: string) => {
            for (const [key, value] of Object.entries(
              JSON.parse(snapshot) as Record<string, string>,
            )) {
              window.sessionStorage.setItem(key, value);
            }
          }, sessionSnapshot);
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
          // Forced clicks skip the animation-frame stability wait, which a
          // headed background tab never satisfies (throttled tabs stop
          // painting), so both dispatches beat the winner's broadcast.
          await Promise.all([
            hostPage
              .getByRole('button', { name: '下一題' })
              .click({ force: true }),
            duplicateHostPage
              .getByRole('button', { name: '下一題' })
              .click({ force: true }),
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
    // Speed scoring (2026-07-live-3): each correct answer lands in [75, 150]
    // depending on response time, so the winner's total is a range.
    const winnerResult = studentAPage.getByText(/你的成績：\d+ 分，第 1 名/u);
    await expect(winnerResult).toBeVisible();
    const winnerScore = Number(
      /你的成績：(\d+) 分/u.exec(await winnerResult.innerText())?.[1],
    );
    expect(winnerScore).toBeGreaterThanOrEqual(750);
    expect(winnerScore).toBeLessThanOrEqual(1500);
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
  let outsiderDeniedCount = 0;
  await runLiveSession(1);
  await runLiveSession(2);

  expect(answerDurations.length).toBeGreaterThanOrEqual(30);
  // Integrity fields are derived from in-run observations, not asserted:
  // every round both students reached their authoritative feedback, the
  // unique (participant, question) constraint precludes duplicates, and the
  // outsider probe is counted through its visible payload-error denial.
  const latencyReport = {
    answer_p95_ms: percentile(answerDurations, 0.95),
    answer_samples: answerDurations.length,
    finalize_p95_ms: percentile(finalizeDurations, 0.95),
    finalize_samples: finalizeDurations.length,
    lost_or_duplicate_answers: 40 - verifiedAnswerPairs,
    outsider_access: outsiderDeniedCount === 1 ? 0 : 1,
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
  const advancePattern =
    assignmentsLiveExpectedFailureDeclarations.duplicateHostAdvance.urlPattern
      .source;
  const allDeclared = trackedHealths.flatMap((health) =>
    expectedBrowserFailures(health),
  );
  const advanceReports = allDeclared.filter(
    (report) => report.url_pattern === advancePattern,
  );
  expect(allDeclared.length).toBe(advanceReports.length);
  expect(outsiderDeniedCount).toBe(1);
  // Exactly one of the two racing host tabs recorded the conflict 400.
  expect(
    advanceReports.reduce((sum, report) => sum + report.observed_count, 0),
  ).toBe(1);
  const declaredFailures = [
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
