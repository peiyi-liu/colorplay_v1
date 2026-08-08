import { expect, test } from '@playwright/test';

import { CONTENT_MANIFEST } from '../fixtures/content-manifest.generated';
import { TEST_USERS } from '../fixtures/users';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('student sees the semantic six-building chapter map', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/login');
  await page
    .getByRole('textbox', { name: '帳號' })
    .fill(TEST_USERS.studentOne.email);
  await page.getByLabel('密碼').fill(TEST_USERS.studentOne.password);
  await page.getByRole('button', { name: '登入' }).click();

  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByRole('heading', { name: '學習地圖' })).toBeVisible();

  const map = page.getByRole('list', { name: '六章學習地圖' });
  const buildings = map.getByRole('button');
  await expect(buildings).toHaveCount(6);

  const labels = await buildings.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label') ?? ''),
  );
  expect(labels).toHaveLength(CONTENT_MANIFEST.length);
  for (const [index, chapter] of CONTENT_MANIFEST.entries()) {
    const label = labels[index] ?? '';
    expect(label).toMatch(
      new RegExp(`^Chapter ${String(chapter.chapterNumber)} \\S+ `, 'u'),
    );
  }

  const available = map.getByRole('button', { name: /可進入|已完成/u });
  const unavailable = map.getByRole('button', { name: /內容準備中/u });
  const availableCount = await available.count();
  expect(availableCount).toBeGreaterThan(0);
  await expect(unavailable).toHaveCount(
    CONTENT_MANIFEST.length - availableCount,
  );
  // 課程仍在 open mode；內容未備妥與循序鎖定是不同狀態，不得混標。
  await expect(map.getByRole('button', { name: /尚未解鎖/u })).toHaveCount(0);

  const decoratedLabelOverlaps = await page.evaluate(() => {
    const rectanglesOverlap = (left: DOMRect, right: DOMRect): boolean =>
      left.left < right.right &&
      left.right > right.left &&
      left.top < right.bottom &&
      left.bottom > right.top;
    const decorations = [
      document.querySelector('.chapter-map__companion'),
      document.querySelector('.chapter-map__adventurer'),
    ].filter((element): element is Element => element !== null);
    const labels = Array.from(
      document.querySelectorAll('.chapter-map__building-label'),
    );
    return decorations.flatMap((decoration) => {
      const decorationRect = decoration.getBoundingClientRect();
      return labels
        .filter((label) =>
          rectanglesOverlap(decorationRect, label.getBoundingClientRect()),
        )
        .map((label) => label.textContent?.trim() ?? '');
    });
  });
  expect(decoratedLabelOverlaps).toEqual([]);

  await unavailable.first().click();
  const panel = page.locator('.chapter-map__panel');
  await expect(panel.getByText('內容準備中', { exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: '進入複習與進度' })).toHaveCount(
    0,
  );

  await available.first().click();
  const detailAction = panel.getByRole('link', { name: '進入複習與進度' });
  await expect(detailAction).toBeVisible();
  await detailAction.click();
  await expect(
    page.getByRole('heading', { name: /^Chapter \d+：/u }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '開始挑戰' })).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
