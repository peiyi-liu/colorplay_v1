import { expect, test } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('student sees six published chapters and only one playable challenge', async ({
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
  await expect(
    page.getByRole('heading', { name: '選擇章節' }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(6);
  await expect(page.getByRole('link', { name: '開始挑戰' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '尚無題目' })).toHaveCount(5);
  await expect(
    page.getByRole('link', { name: '開始挑戰' }),
  ).toHaveAttribute(
    'href',
    '/app/quiz/new?template=26000000-0000-0000-0000-000000000003',
  );
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
