import { expect, test } from '@playwright/test';

import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { TEST_USERS } from '../fixtures/users';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const playableChapters = CONTENT_MANIFEST.filter(
  (chapter) => chapter.questionCount > 0,
);

test('student sees all published chapters and every playable challenge', async ({
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
  await expect(page.getByRole('heading', { name: '選擇章節' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(CONTENT_MANIFEST.length);
  await expect(page.getByRole('link', { name: '開始挑戰' })).toHaveCount(
    playableChapters.length,
  );
  await expect(page.getByRole('button', { name: '尚無題目' })).toHaveCount(
    CONTENT_MANIFEST.length - playableChapters.length,
  );
  for (const chapter of playableChapters) {
    await expect(
      page.locator(`a[href="/app/quiz/new?template=${chapter.templateId}"]`),
    ).toBeVisible();
  }
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
