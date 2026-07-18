import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import { GENERATED_QUESTION_HINTS } from '../fixtures/question-hints.generated';
import {
  REVIEW_MANIFEST,
  REVIEW_MEDIA_CARD,
} from '../fixtures/review-manifest.generated';
import { TEST_USERS } from '../fixtures/users';
import { learningExpectedFailureDeclarations } from './learning-experience-expected-failures';
import {
  attachBrowserHealth,
  declareExpectedBrowserFailure,
  expectedBrowserFailures,
  unexpectedBrowserHealth,
} from './browser-health';

// The quiz chapter must show every question in a single run so hint and
// mistake targets are deterministic: chapter 4 has fewer questions than the
// ten-question template ceiling, so all of them always appear.
const quizChapter = CONTENT_MANIFEST.find(
  ({ chapterCode, questionCount }) =>
    chapterCode === 'chapter-4' && questionCount > 0 && questionCount <= 10,
);
if (!quizChapter) throw new Error('LEARNING_EXPERIENCE_QUIZ_CHAPTER_MISSING');
const QUIZ_CHAPTER_TITLE = '色彩與視覺';

const reviewSubtopic = REVIEW_MANIFEST.find(
  ({ cardCount, chapterCode }) => chapterCode === 'chapter-3' && cardCount > 0,
);
if (!reviewSubtopic) {
  throw new Error('LEARNING_EXPERIENCE_REVIEW_SUBTOPIC_MISSING');
}
if (!REVIEW_MEDIA_CARD) {
  throw new Error('LEARNING_EXPERIENCE_MEDIA_CARD_MISSING');
}
const mediaCard = REVIEW_MEDIA_CARD;
const REVIEW_CHAPTER_TITLE = '色彩表示';

const classroomIdPattern =
  /\/teacher\/classes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;

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

test('Learning Experience phase gate', async ({
  baseURL,
  browser,
  page: studentPage,
}, testInfo) => {
  test.setTimeout(480_000);
  if (process.env.PLAYWRIGHT_ACCEPTANCE !== 'on') {
    throw new Error('LEARNING_EXPERIENCE_ACCEPTANCE_MODE_REQUIRED');
  }
  const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  if (!evidenceRoot) {
    throw new Error('LEARNING_EXPERIENCE_EVIDENCE_ROOT_REQUIRED');
  }
  if (!baseURL) {
    throw new Error('LEARNING_EXPERIENCE_BASE_URL_REQUIRED');
  }

  const teacherContext = await browser.newContext({ baseURL });
  const teacherBContext = await browser.newContext({ baseURL });
  const teacherPage = await teacherContext.newPage();
  const teacherBPage = await teacherBContext.newPage();

  const studentHealth = attachBrowserHealth(studentPage);
  const teacherHealth = attachBrowserHealth(teacherPage);
  const teacherBHealth = attachBrowserHealth(teacherBPage);

  await signIn(studentPage, TEST_USERS.learningStudent);
  const rewards = studentPage.getByRole('region', { name: '學習獎勵' });
  await expect(rewards).toContainText('0 / 500 XP');
  await expect(rewards).toContainText('0 Token');

  // --- Review cards: published content only, explicit completion, media ---
  await studentPage
    .getByRole('link', { name: `${REVIEW_CHAPTER_TITLE} 複習與進度` })
    .click();
  await expect(
    studentPage.getByRole('heading', { name: REVIEW_CHAPTER_TITLE }),
  ).toBeVisible();
  await expect(studentPage.locator('body')).not.toContainText('尚未發布的卡片');
  await expect(
    studentPage.getByRole('img', { name: mediaCard.alt }),
  ).toBeVisible();
  for (const cardTitle of reviewSubtopic.cardTitles) {
    const card = studentPage.getByRole('article', { name: cardTitle });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: '完成複習' }).click();
    await expect(card.getByRole('status')).toHaveText('已完成複習');
  }
  const completionText = `複習完成 ${String(reviewSubtopic.cardCount)} / ${String(reviewSubtopic.cardCount)}`;
  await expect(studentPage.getByLabel('章節進度')).toContainText(
    completionText,
  );
  // Route recovery: a refresh restores the same authoritative content.
  await studentPage.reload();
  await expect(
    studentPage.getByRole('heading', { name: REVIEW_CHAPTER_TITLE }),
  ).toBeVisible();
  await expect(studentPage.getByLabel('章節進度')).toContainText(
    completionText,
  );
  await studentPage.setViewportSize({ width: 375, height: 812 });
  await studentPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('chapter-detail-375x812.png'),
  });
  await studentPage.setViewportSize({ width: 768, height: 1024 });
  await studentPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('review-card-768x1024.png'),
  });
  await studentPage.setViewportSize({ width: 1280, height: 720 });

  // --- Formal quiz with tiered hints and two deliberate mistakes ---
  await studentPage.goto('/app');
  await expect(
    studentPage.getByRole('heading', { name: '選擇章節' }),
  ).toBeVisible();
  await studentPage
    .locator('article.chapter-card')
    .filter({ hasText: QUIZ_CHAPTER_TITLE })
    .getByRole('link', { name: '開始挑戰' })
    .click();

  const questionTotal = quizChapter.questionCount;
  let declaredUnavailable = false;
  let threeHintWrongDone = false;
  let wrongPromptCount = 0;
  for (let position = 1; position <= questionTotal; position += 1) {
    await expect(studentPage.getByLabel('挑戰進度')).toContainText(
      `第 ${String(position)} / ${String(questionTotal)} 題`,
    );
    const prompt = await studentPage
      .locator('.question-card legend')
      .innerText();
    const hints = GENERATED_QUESTION_HINTS.get(prompt);
    let answerWrong = false;
    if (hints) {
      for (const [index, content] of hints.entries()) {
        await studentPage
          .getByRole('button', {
            name: `索取提示（第 ${String(index + 1)} 層）`,
          })
          .click();
        await expect(
          studentPage.getByText(`提示 ${String(index + 1)}：${content}`),
        ).toBeVisible();
      }
      if (hints.length === 2 && !declaredUnavailable) {
        // The two-level question proves the server refuses to invent a third
        // hint; this is the run's only declared browser failure.
        declareExpectedBrowserFailure(
          studentHealth,
          learningExpectedFailureDeclarations.hintUnavailable,
        );
        await studentPage
          .getByRole('button', { name: '索取提示（第 3 層）' })
          .click();
        await expect(
          studentPage.getByText('這一題沒有更多提示了。'),
        ).toBeVisible();
        declaredUnavailable = true;
        answerWrong = true;
      } else if (hints.length === 3 && !threeHintWrongDone) {
        threeHintWrongDone = true;
        answerWrong = true;
      }
    }
    const correctText = GENERATED_CORRECT_ANSWERS.get(prompt);
    if (!correctText) throw new Error('LEARNING_EXPERIENCE_ANSWER_MISSING');
    if (answerWrong) {
      wrongPromptCount += 1;
      await studentPage
        .locator('label.question-option')
        .filter({ hasNotText: correctText })
        .first()
        .click();
    } else {
      await studentPage.getByRole('radio', { name: correctText }).check();
    }
    await studentPage.getByRole('button', { name: '送出答案' }).click();
    await studentPage
      .getByRole('button', {
        name:
          position === questionTotal ? '結算並查看結果' : '我理解了，下一題',
      })
      .click();
  }
  expect(wrongPromptCount).toBe(2);
  await expect(
    studentPage.getByRole('heading', { name: '挑戰完成' }),
  ).toBeVisible();
  // Six fast correct answers at the full daily rate: 6 × 75 XP, 6 × 25 Token.
  await expect(rewards).toContainText('450 / 500 XP');
  await expect(rewards).toContainText('150 Token');

  // --- Mistakes and remediation: resolve both, 20% XP, zero Tokens ---
  await studentPage.goto('/app/mistakes');
  await expect(
    studentPage.getByRole('heading', { name: '我的錯題' }),
  ).toBeVisible();
  await expect(
    studentPage.getByRole('heading', { name: /（2 題待補救）/u }),
  ).toBeVisible();
  await studentPage.getByRole('button', { name: '再挑戰（補救練習）' }).click();
  await expect(studentPage.getByText(/補救練習模式/u)).toBeVisible();
  for (let position = 1; position <= 2; position += 1) {
    await expect(studentPage.getByLabel('挑戰進度')).toContainText(
      `第 ${String(position)} / 2 題`,
    );
    const prompt = await studentPage
      .locator('.question-card legend')
      .innerText();
    const correctText = GENERATED_CORRECT_ANSWERS.get(prompt);
    if (!correctText) throw new Error('LEARNING_EXPERIENCE_ANSWER_MISSING');
    await studentPage.getByRole('radio', { name: correctText }).check();
    await studentPage.getByRole('button', { name: '送出答案' }).click();
    await studentPage
      .getByRole('button', {
        name: position === 2 ? '結算並查看結果' : '我理解了，下一題',
      })
      .click();
  }
  await expect(studentPage.getByText(/補救練習完成/u)).toBeVisible();
  // 20% of two fast correct answers: +30 XP; the Token balance must not move.
  await expect(rewards).toContainText('480 / 500 XP');
  await expect(rewards).toContainText('150 Token');
  await studentPage.getByRole('link', { name: '返回我的錯題' }).click();
  await expect(studentPage.getByRole('status')).toContainText(
    '目前沒有待補救的錯題',
  );

  // --- Dashboard: server-computed formulas, dash placeholders, recovery ---
  await studentPage.goto('/app/progress');
  await expect(
    studentPage.getByRole('heading', { name: '我的學習進度' }),
  ).toBeVisible();
  const quizChapterRow = studentPage.getByRole('row', {
    name: new RegExp(QUIZ_CHAPTER_TITLE, 'u'),
  });
  await expect(quizChapterRow).toContainText('100%');
  await expect(quizChapterRow).toContainText('已精熟');
  const reviewChapterRow = studentPage.getByRole('row', {
    name: new RegExp(REVIEW_CHAPTER_TITLE, 'u'),
  });
  await expect(reviewChapterRow).toContainText(
    `${String(reviewSubtopic.cardCount)} / ${String(reviewSubtopic.cardCount)}`,
  );
  await expect(reviewChapterRow).toContainText('尚未開始');
  await studentPage.reload();
  await expect(quizChapterRow).toContainText('已精熟');
  await studentPage.setViewportSize({ width: 1440, height: 900 });
  await studentPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('progress-dashboard-1440x900.png'),
  });
  await studentPage.setViewportSize({ width: 1280, height: 720 });

  // --- Teacher analytics: owner reads exact mastery, others read nothing ---
  await signIn(teacherPage, TEST_USERS.learningTeacher);
  await teacherPage.goto('/teacher/classes');
  await teacherPage
    .getByRole('textbox', { name: '班級名稱' })
    .fill('學習體驗班級');
  await teacherPage.getByRole('button', { name: '建立班級' }).click();
  const receipt = teacherPage.getByLabel('一次性班級加入碼');
  await expect(receipt).toBeVisible();
  const joinCode = (await receipt.locator('strong').innerText()).trim();
  await teacherPage.getByRole('link', { name: '管理班級' }).click();
  await teacherPage.waitForURL(classroomIdPattern);
  const classroomId = classroomIdPattern.exec(teacherPage.url())?.[1];
  if (!classroomId) {
    throw new Error('LEARNING_EXPERIENCE_CLASSROOM_ID_MISSING');
  }

  await studentPage.goto(`/join/${joinCode}`);
  await studentPage.getByRole('button', { name: '加入班級' }).click();
  await expect(studentPage).toHaveURL(/\/app\/leaderboard\//u);

  await teacherPage.getByRole('link', { name: '學習進度' }).click();
  await expect(
    teacherPage.getByRole('heading', { name: '班級學習進度' }),
  ).toBeVisible();
  const teacherRow = teacherPage.getByRole('row', {
    name: new RegExp(QUIZ_CHAPTER_TITLE, 'u'),
  });
  await expect(teacherRow).toContainText('100%');
  await expect(teacherRow).toContainText('已精熟');
  await expect(teacherPage.locator('body')).not.toContainText(
    '@colorplay.test',
  );

  await signIn(teacherBPage, TEST_USERS.teacherTwo);
  await teacherBPage.goto(`/teacher/classes/${classroomId}/progress`);
  await expect(
    teacherBPage.getByText('目前沒有可顯示的學習進度。'),
  ).toBeVisible();
  await teacherBContext.close();
  await teacherContext.close();

  // --- Health accounting ---
  const trackedHealths = [studentHealth, teacherHealth, teacherBHealth];
  const declaredFailures = trackedHealths.flatMap((health) =>
    expectedBrowserFailures(health),
  );
  expect(declaredFailures).toEqual([
    {
      expected_count: 1,
      observed_count: 1,
      status: 400,
      url_pattern:
        learningExpectedFailureDeclarations.hintUnavailable.urlPattern.source,
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
