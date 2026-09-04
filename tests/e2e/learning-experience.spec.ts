import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import {
  REVIEW_MANIFEST,
  REVIEW_MEDIA_CARD,
} from '../fixtures/review-manifest.generated';
import { TEST_USERS } from '../fixtures/users';
import {
  attachBrowserHealth,
  declareExpectedBrowserFailure,
  expectedBrowserFailures,
  unexpectedBrowserHealth,
} from './browser-health';
import { createClassroom, joinClassroomByCode } from './helpers/classrooms';
import { startQuizFromLobby } from './helpers/quiz';

// A full chapter challenge always serves ten questions. The generated
// manifest records the published chapter-bank pool size, not the template
// limit, so select a chapter with enough questions and keep the session size
// explicit.
// These content-availability checks used to throw at module scope, which
// crashes Playwright's test *discovery* for the whole tests/e2e directory
// the moment content rollout hasn't reached this phase-gate's assumptions
// yet (e.g. chapter-4 currently has 0 bank_kind='chapter' questions, not
// 1-10) -- breaking every other spec file's ability to even be listed.
// This test already requires PLAYWRIGHT_ACCEPTANCE=on to run at all, so
// the guards belong inside the test body instead, where a stale/not-yet-
// ready fixture only fails this one gate rather than the whole suite.
const quizChapter = CONTENT_MANIFEST.find(
  ({ questionCount }) => questionCount >= 10,
);
const QUIZ_QUESTION_COUNT = 10;
const QUIZ_CHAPTER_TITLE = '色彩表示';

const reviewSubtopic = REVIEW_MANIFEST.find(
  ({ cardCount, chapterCode }) => chapterCode === 'chapter-3' && cardCount > 0,
);
const mediaCard = REVIEW_MEDIA_CARD;
const REVIEW_CHAPTER_TITLE = '色彩表示';

const remediationResultViewports = [
  { height: 720, label: 'desktop-landscape', width: 1280 },
  { height: 375, label: 'tablet-landscape', width: 812 },
  { height: 812, label: 'mobile-portrait', width: 375 },
] as const;

const classroomIdPattern =
  /\/teacher\/classes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;
const teacherStudentProgressDenial = {
  count: 1,
  status: 403,
  urlPattern: /\/rest\/v1\/rpc\/teacher_student_progress(?:\?.*)?$/u,
} as const;

const expectHudEconomy = async (
  rewards: Locator,
  expected: Readonly<{
    currentLevelXp: number;
    level: number;
    tokenBalance: number;
  }>,
) => {
  const progress = rewards.getByRole('progressbar', {
    name: `Lv.${String(expected.level)} 經驗進度`,
  });
  await expect(progress).toHaveAttribute(
    'value',
    String(expected.currentLevelXp),
  );
  await expect(progress).toHaveAttribute('max', '500');
  await expect(
    rewards.getByLabel(`${String(expected.tokenBalance)} Token`),
  ).toBeVisible();
};

const signIn = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
  navigationName: '主要導覽' | '教師導覽',
) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '帳號' }).fill(credentials.email);
  await page.getByLabel('密碼', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('navigation', { name: navigationName }),
  ).toBeVisible();
  // Wait for the chapter query to settle before the caller navigates away,
  // so browser health never records a navigation-aborted manifest fetch.
  await expect(page.getByRole('heading', { name: '學習地圖' })).toBeVisible();
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
  if (!quizChapter) throw new Error('LEARNING_EXPERIENCE_QUIZ_CHAPTER_MISSING');
  if (!reviewSubtopic) {
    throw new Error('LEARNING_EXPERIENCE_REVIEW_SUBTOPIC_MISSING');
  }
  const teacherContext = await browser.newContext({ baseURL });
  const teacherBContext = await browser.newContext({ baseURL });
  const teacherPage = await teacherContext.newPage();
  const teacherBPage = await teacherBContext.newPage();

  const studentHealth = attachBrowserHealth(studentPage);
  const teacherHealth = attachBrowserHealth(teacherPage);
  const teacherBHealth = attachBrowserHealth(teacherBPage);
  declareExpectedBrowserFailure(teacherBHealth, teacherStudentProgressDenial);

  await signIn(studentPage, TEST_USERS.learningStudent, '主要導覽');
  const rewards = studentPage.getByRole('region', { name: '學習獎勵' });
  await expectHudEconomy(rewards, {
    currentLevelXp: 0,
    level: 1,
    tokenBalance: 0,
  });

  // --- Review cards: published content only and explicit completion ---
  await studentPage
    .getByRole('list', { name: '六章學習地圖' })
    .getByRole('button', {
      name: new RegExp(`^Chapter \\d+ ${REVIEW_CHAPTER_TITLE} `, 'u'),
    })
    .click();
  await studentPage
    .getByRole('link', { name: /^(?:開始|繼續|查看)第.+章/u })
    .click();
  await expect(
    studentPage.getByRole('heading', { name: REVIEW_CHAPTER_TITLE }),
  ).toBeVisible();
  await expect(studentPage.locator('body')).not.toContainText('尚未發布的卡片');
  // Media belongs to a later publication slice. Verify it when the generated
  // manifest contains an approved published mapping, without blocking the
  // current text-only Chapter 3 slice or pretending that media was covered.
  if (mediaCard) {
    await studentPage
      .locator('summary')
      .filter({ hasText: mediaCard.title })
      .click();
    await expect(
      studentPage.getByRole('img', { name: mediaCard.alt }),
    ).toBeVisible();
  }
  for (const cardTitle of reviewSubtopic.cardTitles) {
    const card = studentPage.getByRole('article', { name: cardTitle });
    if (!(await card.isVisible())) {
      await studentPage
        .locator('summary')
        .filter({ hasText: cardTitle })
        .click();
    }
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
  await startQuizFromLobby(studentPage, {
    templateId: quizChapter.templateId,
  });

  const questionTotal = QUIZ_QUESTION_COUNT;
  let wrongPromptCount = 0;
  for (let position = 1; position <= questionTotal; position += 1) {
    await expect(studentPage.getByLabel('挑戰進度')).toContainText(
      `第 ${String(position)} / ${String(questionTotal)} 題`,
    );
    const prompt = await studentPage
      .locator('.question-card legend')
      .innerText();
    // 提示 UI 已依 owner 指示移除（2026-07-21 #4）；直接把前兩題答錯，
    // 讓隨機抽題仍能穩定產生兩筆補救項目。
    const answerWrong = position <= 2;
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
    studentPage.getByRole('heading', { name: '章節總挑戰完成' }),
  ).toBeVisible();
  // Eight fast correct answers: 8 × 75 XP, 8 × 25 Token. The 600 XP total
  // advances one level and leaves 100 / 500 XP toward the next level.
  await expectHudEconomy(rewards, {
    currentLevelXp: 100,
    level: 2,
    tokenBalance: 200,
  });

  // --- Mistakes and remediation: resolve both, 20% XP, zero Tokens ---
  await studentPage.goto('/app/mistakes');
  await expect(
    studentPage.getByRole('heading', { name: '我的錯題' }),
  ).toBeVisible();
  await expect(
    studentPage.getByRole('heading', { name: /2 題待補救/u }),
  ).toBeVisible();
  await expect(studentPage.getByText('2 題待補救')).toHaveClass(
    'mistake-group__badge',
  );
  await studentPage.getByRole('button', { name: '再挑戰（補救練習）' }).click();
  await expect(studentPage.getByText(/補救練習模式/u)).toHaveCount(0);
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
  await expectHudEconomy(rewards, {
    currentLevelXp: 130,
    level: 2,
    tokenBalance: 200,
  });
  const returnToMistakes = studentPage.getByRole('link', {
    name: '返回我的錯題',
  });
  const emptyMistakesStatus = studentPage
    .getByRole('status')
    .filter({ hasText: '目前沒有待補救的錯題，繼續保持！' });
  const remediationResultBoxes = [];
  for (const [index, viewport] of remediationResultViewports.entries()) {
    await studentPage.setViewportSize(viewport);
    await returnToMistakes.evaluate((element) => {
      element.scrollIntoView({
        behavior: 'instant',
        block: 'center',
        inline: 'nearest',
      });
    });
    await expect(returnToMistakes).toBeVisible();
    await returnToMistakes.focus();
    await expect(returnToMistakes).toBeFocused();
    await studentPage.keyboard.press('Shift+Tab');
    await expect(returnToMistakes).not.toBeFocused();
    await studentPage.keyboard.press('Tab');
    await expect(returnToMistakes).toBeFocused();
    const box = await returnToMistakes.evaluate((element, measuredViewport) => {
      const rect = element.getBoundingClientRect();
      const scrollport = document.querySelector('main#main-content');
      const scrollportRect = scrollport?.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(centerX, centerY);
      const computed = getComputedStyle(element);
      const outlineWidth = Number.parseFloat(computed.outlineWidth);
      const outlineOffset = Number.parseFloat(computed.outlineOffset);
      const focusExpansion = Math.max(
        0,
        (Number.isFinite(outlineWidth) ? outlineWidth : 0) +
          (Number.isFinite(outlineOffset) ? outlineOffset : 0),
      );
      const describeElement = (candidate: Element) => ({
        className: candidate.className,
        pointerEvents: getComputedStyle(candidate).pointerEvents,
        tagName: candidate.tagName,
        text: candidate.textContent?.trim().slice(0, 80) ?? '',
        zIndex: getComputedStyle(candidate).zIndex,
      });
      return {
        focusVisible: element.matches(':focus-visible'),
        hasFocusRing: computed.outlineStyle !== 'none' && outlineWidth > 0,
        hitIsLink: hit === element || element.contains(hit),
        focusPaint: {
          bottom: rect.bottom + focusExpansion,
          left: rect.left - focusExpansion,
          right: rect.right + focusExpansion,
          top: rect.top - focusExpansion,
        },
        huds: Array.from(
          document.querySelectorAll('.hud-top, .hud-command'),
        ).map((hud) => {
          const hudRect = hud.getBoundingClientRect();
          return {
            bottom: hudRect.bottom,
            left: hudRect.left,
            right: hudRect.right,
            top: hudRect.top,
          };
        }),
        link: {
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          top: rect.top,
        },
        pointerEvents: computed.pointerEvents,
        documentScroll: {
          clientHeight: document.documentElement.clientHeight,
          scrollHeight: document.documentElement.scrollHeight,
          scrollTop: document.documentElement.scrollTop,
          windowY: window.scrollY,
        },
        scrollTop: scrollport?.scrollTop ?? null,
        scrollport: scrollportRect
          ? {
              bottom: scrollportRect.bottom,
              left: scrollportRect.left,
              right: scrollportRect.right,
              top: scrollportRect.top,
            }
          : null,
        stack: document
          .elementsFromPoint(centerX, centerY)
          .map(describeElement),
        viewport: measuredViewport,
      };
    }, viewport);
    expect(box.scrollport).not.toBeNull();
    expect(box.link.top).toBeGreaterThanOrEqual(box.scrollport?.top ?? 0);
    expect(box.link.bottom).toBeLessThanOrEqual(box.scrollport?.bottom ?? 0);
    expect(
      box.huds.every(
        (hud) =>
          box.focusPaint.right <= hud.left ||
          box.focusPaint.left >= hud.right ||
          box.focusPaint.bottom <= hud.top ||
          box.focusPaint.top >= hud.bottom,
      ),
      JSON.stringify(box),
    ).toBe(true);
    expect(box.hitIsLink, JSON.stringify(box)).toBe(true);
    expect(box.focusVisible).toBe(true);
    expect(box.hasFocusRing).toBe(true);
    remediationResultBoxes.push(box);
    await returnToMistakes.click();
    await expect(studentPage).toHaveURL(/\/app\/mistakes$/u);
    await expect(emptyMistakesStatus).toBeVisible();
    if (index < remediationResultViewports.length - 1) {
      await studentPage.goBack();
      await expect(returnToMistakes).toBeVisible();
      await expect(studentPage.getByRole('status')).toContainText(
        '補救練習完成',
      );
    }
  }
  await mkdir(join(evidenceRoot, 'reports'), { recursive: true });
  await writeFile(
    join(evidenceRoot, 'reports/remediation-result-viewport-boxes.json'),
    `${JSON.stringify(remediationResultBoxes, null, 2)}\n`,
  );
  await expect(emptyMistakesStatus).toBeVisible();

  // 學習進度 dashboard 依 owner 批示（2026-07-26 #2）已改為教師專屬，學生端
  // `/app/progress` 路由與頁面已移除（Task 10）；原本在此驗證的伺服器端公式
  // （章節 100%/已精熟、尚未開始章節破折號佔位、reload 後精熟度持久化）改由
  // 下方「Teacher analytics」區塊的 `teacherRow` 斷言從教師視角覆蓋 100%/
  // 已精熟案例。尚未開始章節（reviewChapterRow 的破折號佔位）與 reload
  // 持久化目前沒有教師視角的等效斷言——若日後需要，屬於
  // teacher-classroom-progress-page 自己的測試範圍，不在本任務內補齊。

  // --- Teacher analytics: owner reads exact mastery, others read nothing ---
  await signIn(teacherPage, TEST_USERS.learningTeacher, '教師導覽');
  await teacherPage.goto('/teacher/classes');
  const { joinCode } = await createClassroom(teacherPage, '學習體驗班級');
  await teacherPage.getByRole('link', { name: '管理班級' }).click();
  await teacherPage.waitForURL(classroomIdPattern);
  const classroomId = classroomIdPattern.exec(teacherPage.url())?.[1];
  if (!classroomId) {
    throw new Error('LEARNING_EXPERIENCE_CLASSROOM_ID_MISSING');
  }

  await joinClassroomByCode(TEST_USERS.learningStudent, joinCode);
  await teacherPage.reload();

  const memberProgressLink = teacherPage
    .getByRole('link', { name: '查看細節 ›' })
    .first();
  await expect(memberProgressLink).toBeVisible();
  const memberProgressHref = await memberProgressLink.getAttribute('href');
  const memberRef = memberProgressHref?.split('/').pop();
  if (!memberRef) {
    throw new Error('LEARNING_EXPERIENCE_CLASSROOM_MEMBER_REF_MISSING');
  }
  await memberProgressLink.click();
  await expect(
    teacherPage.getByRole('heading', { name: 'learning.student 的學習進度' }),
  ).toBeVisible();
  const teacherRow = teacherPage.getByRole('row', {
    name: new RegExp(QUIZ_CHAPTER_TITLE, 'u'),
  });
  await expect(teacherRow).toContainText('100.0%');
  await expect(teacherRow).toContainText('已精熟');
  await expect(teacherPage.locator('body')).not.toContainText(
    '@colorplay.test',
  );

  await signIn(teacherBPage, TEST_USERS.teacherTwo, '教師導覽');
  await teacherBPage.goto(
    `/teacher/classes/${classroomId}/members/${memberRef}`,
  );
  await expect(
    teacherBPage.getByText('無法載入學生資料，或你沒有管理權限。'),
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
      expected_count: teacherStudentProgressDenial.count,
      observed_count: teacherStudentProgressDenial.count,
      status: teacherStudentProgressDenial.status,
      url_pattern: teacherStudentProgressDenial.urlPattern.source,
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
