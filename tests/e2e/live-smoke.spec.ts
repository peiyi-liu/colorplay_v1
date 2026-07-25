import { expect, test, type Locator, type Page } from '@playwright/test';

import { GENERATED_CORRECT_ANSWERS } from '../fixtures/question-answers.generated';
import { TEST_USERS } from '../fixtures/users';
import {
  signInStudent as authSignInStudent,
  signInTeacher as authSignInTeacher,
  type Credentials,
} from './helpers/auth';
import { createClassroom, joinClassroomByCode } from './helpers/classrooms';
import { launchLiveSessionFromTeacherHome } from './helpers/live';

// 輕量 Live 冒煙：單一學生走完 等待室 → 十題（含一次暫停/續行）→ 頒獎台。
// 完整驗收（團隊模式、延遲預算、截圖、報表數字）仍在
// live-advanced.spec.ts 的 phase gate，僅於 pnpm phase:live-advanced 執行；
// 本檔的目的是讓每次 test:e2e 都覆蓋 Live 的核心投影與主持動作文案。
const CLASSROOM_NAME = 'Live冒煙班級';
const QUESTION_COUNT = 10;

// 登入的機制（表單填寫、送出、等 URL）與 scripts/design-audit 的截圖 runner
// 共用 tests/e2e/helpers/auth.ts；這裡只保留本檔案特有的「登入後畫面已就緒」
// 斷言。
const signInTeacher = async (page: Page, credentials: Credentials) => {
  await authSignInTeacher(page, credentials);
  await expect(page.getByRole('heading', { name: '教師工作區' })).toBeVisible();
};

const signInStudent = async (page: Page, credentials: Credentials) => {
  await authSignInStudent(page, credentials);
  await expect(
    page.getByRole('heading', { name: '色彩任務選擇大廳' }),
  ).toBeVisible();
};

// 單一學生答對當前題：唯一參與者作答即觸發伺服器自動關題，
// 回執直接是回饋畫面而非等待狀態。
// 雙螢幕（screen_only）為課堂預設：題文與選項文字只在投影幕，學生端是
// 純色形按鈕——所以由投影讀題文查正解，換算選項序位後在學生端點同位按鈕。
const answerCurrentCorrectly = async (
  presenter: Locator,
  page: Page,
  position: number,
) => {
  await expect(
    page.getByText(`第 ${String(position)} / ${String(QUESTION_COUNT)} 題`),
  ).toBeVisible();
  const prompt = (
    await presenter.locator('.live-presenter__question h2').innerText()
  ).trim();
  const correctText = GENERATED_CORRECT_ANSWERS.get(prompt);
  if (!correctText) throw new Error('LIVE_SMOKE_ANSWER_MISSING');
  const optionTexts = await presenter
    .locator('.live-presenter__options li')
    .allInnerTexts();
  const correctIndex = optionTexts.findIndex((text) =>
    text.includes(correctText),
  );
  if (correctIndex < 0) throw new Error('LIVE_SMOKE_OPTION_MISSING');
  await page.locator('.question-card button').nth(correctIndex).click();
  // screen_only 的回饋是全版結果頁（p 元素），文案含驚嘆號。
  await expect(page.getByText(/答對了/u).first()).toBeVisible();
};

test('Live smoke: 單人場次從等待室走到頒獎台', async ({
  baseURL,
  browser,
  browserName,
  page: studentPage,
}) => {
  test.skip(browserName !== 'chromium', '後端旅程單瀏覽器驗證即可');
  test.skip(
    !process.env.SUPABASE_URL,
    'Live smoke 需要本機 Supabase stack（SUPABASE_URL 未設定）',
  );
  test.setTimeout(240_000);
  if (!baseURL) throw new Error('LIVE_SMOKE_BASE_URL_REQUIRED');

  const teacherContext = await browser.newContext({ baseURL });
  const teacherPage = await teacherContext.newPage();

  // --- 班級與成員 ---
  await signInTeacher(teacherPage, TEST_USERS.liveHostTeacher);
  await teacherPage.goto('/teacher/classes');
  const { joinCode: classroomCode } = await createClassroom(
    teacherPage,
    CLASSROOM_NAME,
  );

  await signInStudent(studentPage, TEST_USERS.liveStudentOne);
  await joinClassroomByCode(studentPage, classroomCode);
  await expect(studentPage).toHaveURL(/\/app\/leaderboard\//u);

  // --- 開新場次（主持發射台：選單元→一鍵開場，直入投影模式）---
  // 選擇器序列與 scripts/design-audit 的截圖 runner 共用，抽成
  // tests/e2e/helpers/live.ts（見該檔開頭的重用說明）；任一已發佈小節皆為
  // 十題，正解由 GENERATED_CORRECT_ANSWERS 依題目 prompt 反查，與選哪節無關。
  const { presenter, joinCode } =
    await launchLiveSessionFromTeacherHome(teacherPage);

  await studentPage.goto('/app/live/join');
  await studentPage.getByLabel('課堂代碼').fill(joinCode);
  await studentPage.getByRole('button', { name: '加入課堂' }).click();
  await expect(studentPage.getByText('等待主持人開始…')).toBeVisible();

  // --- 第 1 題：作答即自動關題 ---
  await presenter.getByRole('button', { name: '開始第一題' }).click();
  await answerCurrentCorrectly(presenter, studentPage, 1);
  await presenter.getByRole('button', { name: '下一題' }).click();

  // --- 第 2 題：開題中暫停/續行一次 ---
  await expect(studentPage.locator('.question-card legend')).toBeVisible();
  await presenter.getByRole('button', { name: '暫停' }).click();
  await expect(presenter.getByText('已暫停')).toBeVisible();
  await expect(studentPage.getByText('暫停中')).toBeVisible();
  await presenter.getByRole('button', { name: '繼續作答' }).click();
  await answerCurrentCorrectly(presenter, studentPage, 2);
  await presenter.getByRole('button', { name: '下一題' }).click();

  // --- 第 3 題起走完全場 ---
  for (let position = 3; position <= QUESTION_COUNT; position += 1) {
    await answerCurrentCorrectly(presenter, studentPage, position);
    if (position < QUESTION_COUNT) {
      await presenter.getByRole('button', { name: '下一題' }).click();
    }
  }

  // --- 結算與頒獎台 ---
  await presenter.getByRole('button', { name: '結算成績' }).click();
  await expect(
    presenter.getByRole('heading', { name: '最終頒獎台' }),
  ).toBeVisible();
  await expect(studentPage.getByText('挑戰結束！')).toBeVisible();

  await teacherContext.close();
});
