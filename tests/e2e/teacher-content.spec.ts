import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

import {
  buildTemplateWorkbook,
  sheetOf,
  TEMPLATE_SHEETS,
} from '../../src/features/teacher-content/api/xlsx-codec';
import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import { TEST_USERS } from '../fixtures/users';
import {
  attachBrowserHealth,
  declareExpectedBrowserFailure,
  expectedBrowserFailures,
  unexpectedBrowserHealth,
} from './browser-health';
import { teacherContentExpectedFailureDeclarations } from './teacher-content-expected-failures';

// Chapter 4 shows every question in one run (fewer questions than the
// template ceiling), so the answer count and per-question analytics are
// deterministic.
const quizChapter = CONTENT_MANIFEST.find(
  ({ chapterCode, questionCount }) =>
    chapterCode === 'chapter-4' && questionCount > 0 && questionCount <= 10,
);
if (!quizChapter) throw new Error('TEACHER_CONTENT_QUIZ_CHAPTER_MISSING');
const QUIZ_CHAPTER_TITLE = '色彩與視覺';
const REVIEW_CHAPTER_TITLE = '色彩表示';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const IMPORTED_QUESTION_CODE = '3-9-01';
const IMPORTED_QUESTION_PROMPT = '匯入的題目：色彩三要素不包含下列哪一項？';
const IMPORTED_CARD_TITLE = '匯入測試複習卡';
const CLASSROOM_NAME = '內容教學班級';

const headerOf = (workbook: XLSX.WorkBook, sheetName: string): string[] => {
  const rows = XLSX.utils.sheet_to_json<string[]>(
    sheetOf(workbook, sheetName),
    { header: 1 },
  );
  return rows[0] ?? [];
};

const workbookWith = (
  questionRows: readonly (readonly string[])[],
  reviewRows: readonly (readonly string[])[] = [],
): Buffer => {
  const template = XLSX.read(buildTemplateWorkbook(), { type: 'array' });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([headerOf(template, TEMPLATE_SHEETS.chapters)]),
    TEMPLATE_SHEETS.chapters,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      headerOf(template, TEMPLATE_SHEETS.reviewCards),
      ...reviewRows.map((row) => [...row]),
    ]),
    TEMPLATE_SHEETS.reviewCards,
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      headerOf(template, TEMPLATE_SHEETS.questions),
      ...questionRows.map((row) => [...row]),
    ]),
    TEMPLATE_SHEETS.questions,
  );
  return Buffer.from(
    XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer,
  );
};

const signInStudent = async (
  page: Page,
  credentials: Readonly<{ email: string; password: string }>,
) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('密碼').fill(credentials.password);
  await page.getByRole('button', { name: '登入' }).click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
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

test('Teacher Content phase gate', async ({
  baseURL,
  browser,
  page: studentPage,
}, testInfo) => {
  test.setTimeout(480_000);
  if (process.env.PLAYWRIGHT_ACCEPTANCE !== 'on') {
    throw new Error('TEACHER_CONTENT_ACCEPTANCE_MODE_REQUIRED');
  }
  const evidenceRoot = process.env.PLAYWRIGHT_EVIDENCE_ROOT;
  if (!evidenceRoot) {
    throw new Error('TEACHER_CONTENT_EVIDENCE_ROOT_REQUIRED');
  }
  if (!baseURL) throw new Error('TEACHER_CONTENT_BASE_URL_REQUIRED');

  const teacherContext = await browser.newContext({ baseURL });
  const teacherBContext = await browser.newContext({ baseURL });
  const teacherPage = await teacherContext.newPage();
  const teacherBPage = await teacherBContext.newPage();

  const studentHealth = attachBrowserHealth(studentPage);
  const teacherHealth = attachBrowserHealth(teacherPage);
  const teacherBHealth = attachBrowserHealth(teacherBPage);

  await signInTeacher(teacherPage, TEST_USERS.contentTeacher);

  // --- Template download: a real workbook whose sheets match the spec ---
  await teacherPage.goto('/teacher/import');
  await expect(
    teacherPage.getByRole('heading', { name: '匯入內容' }),
  ).toBeVisible();
  const downloadPromise = teacherPage.waitForEvent('download');
  await teacherPage.getByRole('button', { name: '下載範本' }).click();
  const download = await downloadPromise;
  const templatePath = join(
    evidenceRoot,
    'downloads/colorplay-content-template.xlsx',
  );
  await mkdir(join(evidenceRoot, 'downloads'), { recursive: true });
  await download.saveAs(templatePath);
  const downloadedTemplate = XLSX.read(await readFile(templatePath), {
    type: 'buffer',
  });
  expect(downloadedTemplate.SheetNames).toEqual([
    TEMPLATE_SHEETS.chapters,
    TEMPLATE_SHEETS.reviewCards,
    TEMPLATE_SHEETS.questions,
  ]);

  // --- Invalid workbook: per-row verdicts, commit stays blocked ---
  const invalidWorkbook = workbookWith([
    [
      '3',
      '3-9 匯入測試小節',
      '',
      '3-9-88',
      '單選',
      '沒有正解的題目',
      '選項甲',
      '選項乙',
      '',
      '',
      'X',
      '解析。',
    ],
    [
      '3',
      '3-9 匯入測試小節',
      '',
      '3-9-89',
      '單選',
      '<script>window.__xss=1</script>',
      '選項甲',
      '選項乙',
      '',
      '',
      'A',
      '解析。',
    ],
  ]);
  await teacherPage.getByLabel('選擇試算表檔案').setInputFiles({
    buffer: invalidWorkbook,
    mimeType: XLSX_MIME,
    name: 'invalid.xlsx',
  });
  await expect(teacherPage.getByText('ANSWER_INVALID')).toBeVisible();
  await expect(
    teacherPage.getByText('正解需為 A–D 或 1–4，不可留空或其他值'),
  ).toBeVisible();
  await expect(teacherPage.getByText('UNSAFE_TEXT')).toBeVisible();
  await expect(
    teacherPage.getByText('請修正錯誤後重新上傳，匯入已被封鎖。'),
  ).toBeVisible();
  await expect(
    teacherPage.getByRole('button', { name: '送出匯入' }),
  ).toBeDisabled();
  expect(await teacherPage.evaluate('window.__xss')).toBeUndefined();
  await teacherPage.setViewportSize({ width: 768, height: 1024 });
  await teacherPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('import-preview-768x1024.png'),
  });
  await teacherPage.setViewportSize({ width: 1280, height: 720 });

  // --- Valid workbook: preview, commit, server-written report ---
  const validWorkbook = workbookWith(
    [
      [
        '3',
        '3-9 匯入測試小節',
        '',
        IMPORTED_QUESTION_CODE,
        '單選',
        IMPORTED_QUESTION_PROMPT,
        '色相',
        '重量',
        '明度',
        '彩度',
        'B',
        '色彩三要素是色相、明度、彩度。',
      ],
    ],
    [
      [
        '3',
        '3-9 匯入測試小節',
        '匯入分組',
        IMPORTED_CARD_TITLE,
        '匯入的複習卡內容：色彩三要素是色相、明度、彩度。',
        '',
        '',
      ],
    ],
  );
  await teacherPage.getByLabel('選擇試算表檔案').setInputFiles({
    buffer: validWorkbook,
    mimeType: XLSX_MIME,
    name: 'content-upload.xlsx',
  });
  await expect(teacherPage.getByText(IMPORTED_QUESTION_PROMPT)).toBeVisible();
  const commitButton = teacherPage.getByRole('button', { name: '送出匯入' });
  await expect(commitButton).toBeEnabled();
  await commitButton.click();
  await expect(teacherPage.getByText('匯入完成。')).toBeVisible();

  // --- Workspace: imported rows land as drafts; publish makes them live ---
  await teacherPage.goto('/teacher/content');
  await expect(
    teacherPage.getByRole('heading', { name: '內容工作區' }),
  ).toBeVisible();
  const importedQuestionRow = teacherPage
    .locator('tr')
    .filter({ hasText: IMPORTED_QUESTION_CODE });
  await expect(importedQuestionRow).toContainText('草稿');
  await expect(importedQuestionRow).toContainText('v1');
  const importedCardRow = teacherPage
    .locator('tr')
    .filter({ hasText: IMPORTED_CARD_TITLE });
  await expect(importedCardRow).toContainText('草稿');

  await teacherPage.setViewportSize({ width: 375, height: 812 });
  await teacherPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('content-workspace-375x812.png'),
  });
  await teacherPage.setViewportSize({ width: 1280, height: 720 });

  // The student must not see the drafts before publication.
  await signInStudent(studentPage, TEST_USERS.contentStudent);
  await studentPage
    .getByRole('link', { name: `${REVIEW_CHAPTER_TITLE} 複習與進度` })
    .click();
  await expect(
    studentPage.getByRole('heading', { name: REVIEW_CHAPTER_TITLE }),
  ).toBeVisible();
  await expect(studentPage.locator('body')).not.toContainText(
    IMPORTED_CARD_TITLE,
  );

  await importedQuestionRow.getByRole('button', { name: '發布' }).click();
  await teacherPage
    .getByRole('dialog')
    .getByRole('button', { name: '確認發布' })
    .click();
  await expect(teacherPage.getByRole('dialog')).toBeHidden();
  await expect(teacherPage.getByText('已發布第 1 版。')).toBeVisible();
  await importedCardRow.getByRole('button', { name: '發布' }).click();
  await teacherPage
    .getByRole('dialog')
    .getByRole('button', { name: '確認發布' })
    .click();
  await expect(teacherPage.getByRole('dialog')).toBeHidden();
  await expect(teacherPage.getByText('已發布第 1 版。')).toBeVisible();

  await studentPage.reload();
  await expect(
    studentPage.getByRole('heading', { name: REVIEW_CHAPTER_TITLE }),
  ).toBeVisible();
  await expect(studentPage.getByText(IMPORTED_CARD_TITLE)).toBeVisible();

  // --- Unsafe drafts: the browser blocks scripts, the page stays inert ---
  await teacherPage.getByRole('button', { name: '新增題目' }).click();
  await teacherPage
    .getByLabel('子題')
    .selectOption({ label: '3-9 匯入測試小節' });
  await teacherPage.getByLabel('題號').fill('3-9-90');
  await teacherPage
    .getByLabel('題目', { exact: true })
    .fill('<script>window.__xss=1</script>');
  await teacherPage.getByLabel('選項 A').fill('甲');
  await teacherPage.getByLabel('選項 B').fill('乙');
  await teacherPage.getByLabel('正解 A').check();
  await teacherPage.getByLabel('解析').fill('解析。');
  await teacherPage.getByRole('button', { name: '儲存草稿' }).click();
  await expect(
    teacherPage.getByText('內容含不允許的 script 或事件屬性。'),
  ).toBeVisible();
  expect(await teacherPage.evaluate('window.__xss')).toBeUndefined();

  // A draft that collides with a published stable code is the run's only
  // declared 4xx: the server refuses to overwrite published content.
  declareExpectedBrowserFailure(
    teacherHealth,
    teacherContentExpectedFailureDeclarations.draftCodeAlreadyPublished,
  );
  await teacherPage
    .getByLabel('題目', { exact: true })
    .fill('嘗試覆寫已發布的題號');
  await teacherPage.getByLabel('題號').fill(IMPORTED_QUESTION_CODE);
  await teacherPage.getByRole('button', { name: '儲存草稿' }).click();
  await expect(
    teacherPage.getByText('已發布的內容請用發布流程更新。'),
  ).toBeVisible();
  await teacherPage.getByRole('button', { name: '取消' }).click();

  // --- Classroom, live student answers, and the frozen-version proof ---
  await teacherPage.goto('/teacher/classes');
  await teacherPage
    .getByRole('textbox', { name: '班級名稱' })
    .fill(CLASSROOM_NAME);
  await teacherPage.getByRole('button', { name: '建立班級' }).click();
  const receipt = teacherPage.getByLabel('一次性班級加入碼');
  await expect(receipt).toBeVisible();
  const joinCode = (await receipt.locator('strong').innerText()).trim();

  await studentPage.goto(`/join/${joinCode}`);
  await studentPage.getByRole('button', { name: '加入班級' }).click();
  await expect(studentPage).toHaveURL(/\/app\/leaderboard\//u);
  // Let the leaderboard and inventory queries settle before navigating away,
  // so browser health never records aborted requests.
  await expect(
    studentPage.getByRole('heading', { name: `${CLASSROOM_NAME}排行榜` }),
  ).toBeVisible();

  await studentPage.goto('/app');
  await expect(
    studentPage.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
  await studentPage
    .locator('article.chapter-card')
    .filter({ hasText: QUIZ_CHAPTER_TITLE })
    .getByRole('link', { name: '開始挑戰' })
    .click();

  const questionTotal = quizChapter.questionCount;
  await expect(studentPage.getByLabel('挑戰進度')).toContainText(
    `第 1 / ${String(questionTotal)} 題`,
  );
  const wrongPrompt = await studentPage
    .locator('.question-card legend')
    .innerText();
  const wrongPromptCorrectText = GENERATED_CORRECT_ANSWERS.get(wrongPrompt);
  if (!wrongPromptCorrectText) {
    throw new Error('TEACHER_CONTENT_ANSWER_MISSING');
  }
  await studentPage
    .locator('label.question-option')
    .filter({ hasNotText: wrongPromptCorrectText })
    .first()
    .click();
  await studentPage.getByRole('button', { name: '送出答案' }).click();
  await studentPage.getByRole('button', { name: '我理解了，下一題' }).click();

  // While the student session is in flight, publish a new version of the
  // question they already answered; their frozen session must not change.
  await teacherPage.goto('/teacher/content');
  const editedRow = teacherPage.locator('tr').filter({ hasText: wrongPrompt });
  await editedRow.getByRole('button', { name: '編輯' }).click();
  const promptField = teacherPage.getByLabel('題目', { exact: true });
  await expect(promptField).toHaveValue(wrongPrompt);
  await promptField.fill(`（第二版）${wrongPrompt}`);
  await teacherPage.getByRole('button', { name: '發布新版本' }).click();
  await teacherPage
    .getByRole('dialog')
    .getByRole('button', { name: '確認發布' })
    .click();
  await expect(teacherPage.getByRole('dialog')).toBeHidden();
  await expect(teacherPage.getByText('已發布第 2 版。')).toBeVisible();

  for (let position = 2; position <= questionTotal; position += 1) {
    await expect(studentPage.getByLabel('挑戰進度')).toContainText(
      `第 ${String(position)} / ${String(questionTotal)} 題`,
    );
    const prompt = await studentPage
      .locator('.question-card legend')
      .innerText();
    expect(prompt).not.toContain('（第二版）');
    const correctText = GENERATED_CORRECT_ANSWERS.get(prompt);
    if (!correctText) throw new Error('TEACHER_CONTENT_ANSWER_MISSING');
    await studentPage.getByRole('radio', { name: correctText }).check();
    await studentPage.getByRole('button', { name: '送出答案' }).click();
    await studentPage
      .getByRole('button', {
        name:
          position === questionTotal ? '結算並查看結果' : '我理解了，下一題',
      })
      .click();
  }
  await expect(
    studentPage.getByRole('heading', { name: '挑戰完成' }),
  ).toBeVisible();

  // Students never reach the teacher workspace.
  await studentPage.goto('/teacher/content');
  await expect(studentPage).toHaveURL(/\/unauthorized$/u);

  // --- Dashboard and analytics: numbers equal the DB-derived facts ---
  // One completed challenge by one student: 7 of the 8 answers correct.
  const accuracy = ((questionTotal - 1) * 100) / questionTotal;
  const accuracyText = `${accuracy.toFixed(1)}%`;
  await teacherPage.goto('/teacher');
  await expect(teacherPage.getByLabel('選擇班級')).toBeVisible();
  const summaryValues = teacherPage.locator('.teacher-summary-cards dd');
  await expect(summaryValues.nth(0)).toHaveText('1');
  await expect(summaryValues.nth(1)).toHaveText('1');
  await expect(summaryValues.nth(2)).toHaveText(accuracyText);
  await expect(
    teacherPage.locator('.teacher-summary-callout'),
  ).not.toContainText('—');
  await teacherPage.reload();
  await expect(teacherPage.locator('.teacher-summary-cards')).toContainText(
    accuracyText,
  );
  await teacherPage.setViewportSize({ width: 1440, height: 900 });
  await teacherPage.screenshot({
    fullPage: true,
    path: testInfo.outputPath('teacher-dashboard-1440x900.png'),
  });
  await teacherPage.setViewportSize({ width: 1280, height: 720 });

  await teacherPage.goto('/teacher/analytics');
  const questionAnalysis = teacherPage.getByRole('region', {
    name: '題目分析',
  });
  // Answer facts keep the frozen prompt the student actually saw, so the
  // wrong answer reports under the original wording even after the v2 bump.
  const editedAnalysisRow = questionAnalysis
    .locator('tr')
    .filter({ hasText: wrongPrompt });
  await expect(editedAnalysisRow).toContainText('0.0%');
  await expect(
    teacherPage.getByRole('region', { name: '子題精熟' }),
  ).toContainText('sheet-4-');
  await teacherPage.getByLabel('開始日期').fill('2020-01-01');
  await teacherPage.getByLabel('結束日期').fill('2020-01-02');
  await expect(teacherPage.getByText('此範圍尚無資料。')).toHaveCount(4);
  await expect(
    teacherPage.getByRole('region', { name: '班級總覽' }),
  ).toContainText('—');

  // --- Another teacher reads nothing from this classroom ---
  await signInTeacher(teacherBPage, TEST_USERS.teacherTwo);
  await expect(teacherBPage.getByLabel('選擇班級')).toBeVisible();
  await expect(teacherBPage.getByLabel('選擇班級')).not.toContainText(
    CLASSROOM_NAME,
  );
  await expect(teacherBPage.locator('.teacher-summary-cards')).toContainText(
    '—',
  );
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
        teacherContentExpectedFailureDeclarations.draftCodeAlreadyPublished
          .urlPattern.source,
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
