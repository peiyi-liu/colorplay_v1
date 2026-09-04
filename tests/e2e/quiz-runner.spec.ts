import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { signInStudent } from './helpers/auth';
import {
  fullChallengeChapter,
  startQuizFromLobby,
  submitSelectedQuizOption,
} from './helpers/quiz';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });
// 完整挑戰旅程含多次伺服器往返；在併行負載下的 firefox 需要比預設 30s 更寬裕的
// 明確上限，避免以整體 timeout 猜測流程速度。
test.describe.configure({ timeout: 120_000 });

test('student starts a real quiz, submits an answer, and advances', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await signInStudent(page, TEST_USERS.studentOne);
  await startQuizFromLobby(page, {
    templateId: fullChallengeChapter.templateId,
  });

  await expect(page).toHaveURL(/\/app\/quiz\/[0-9a-f-]{36}$/u);
  await expect(page.getByLabel('挑戰進度')).toContainText('第 1 / 10 題');
  await expect(page.getByLabel('挑戰進度')).toContainText('Quiz Score：0');
  await expect(page.getByText(/剩餘 \d+ 秒/u)).toBeVisible();

  const options = page.getByRole('radio');
  await expect(options).toHaveCount(4);
  // firefox 的命中測試會把 input 中心點判給外層 label，check() 會無限重試；
  // 改以使用者實際點擊的可見選項列操作，並斷言 radio 的結果狀態。
  await page.locator('.question-option').first().click();
  await expect(options.first()).toBeChecked();
  await submitSelectedQuizOption(page);

  await expect(page.locator('.feedback-card')).toBeVisible();
  await expect(options.first()).toBeDisabled();
  await expect(page.getByRole('button', { name: '送出答案' })).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: /(?:✓ 答對了|✕ 答錯了)/u,
    }),
  ).toBeVisible();
  // 確定性等待：等「下一題」可點擊（session 狀態已回寫），不用固定毫秒。
  const continueButton = page.getByRole('button', {
    name: /^(?:下一題|我理解了，下一題)$/u,
  });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page.getByLabel('挑戰進度')).toContainText('第 2 / 10 題');
  await expect(page.getByText(/剩餘 (?:1[6-9]|20) 秒/u)).toBeVisible();
  await expect(page.getByRole('button', { name: '送出答案' })).toBeDisabled();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
