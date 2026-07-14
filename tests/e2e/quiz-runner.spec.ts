import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('student starts a real quiz, submits an answer, and advances', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_USERS.studentOne.email);
  await page.getByLabel('密碼').fill(TEST_USERS.studentOne.password);
  await page.getByRole('button', { name: '登入' }).click();

  await expect(page).toHaveURL(/\/app$/u);
  await page
    .locator('a[href="/app/quiz/new?template=26000000-0000-0000-0000-000000000003"]')
    .click();

  await expect(page).toHaveURL(/\/app\/quiz\/[0-9a-f-]{36}$/u);
  await expect(page.getByLabel('挑戰進度')).toContainText('第 1 / 10 題');
  await expect(page.getByLabel('挑戰進度')).toContainText('Quiz Score：0');
  await expect(page.getByText(/剩餘 \d+ 秒/u)).toBeVisible();

  const options = page.getByRole('radio');
  await expect(options).toHaveCount(4);
  await options.first().check();
  await page.getByRole('button', { name: '送出答案' }).click();

  await expect(
    page.getByRole('heading', {
      name: /(?:✓ 答對了|✕ 答錯了)/u,
    }),
  ).toBeVisible();
  await expect(page.locator('.feedback-card > p').last()).toBeVisible();
  await expect(options.first()).toBeDisabled();
  await expect(page.getByRole('button', { name: '送出答案' })).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: /(?:✓ 答對了|✕ 答錯了)/u,
    }),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '我理解了，下一題' }).click();
  await expect(page.getByLabel('挑戰進度')).toContainText('第 2 / 10 題');
  await expect(page.getByText(/剩餘 (?:19|20) 秒/u)).toBeVisible();
  await expect(page.getByRole('button', { name: '送出答案' })).toBeDisabled();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
