import { expect, test } from '@playwright/test';

import { walkReviewCards } from './helpers/review-card-walk';

const firstSubtopicCardTitles = [
  '色彩的分類',
  '色彩三要素',
  '色名的表示',
  '有彩色與無彩色',
  '色相的辨識',
  '明度的變化',
  '彩度的變化',
  '色彩三要素的關係',
] as const;

test('review card walk uses title after a different group label', async ({
  page,
}) => {
  await page.goto(
    '/dev-harness/chapter-detail.html?scenario=in-progress&groupLabelMismatch=true',
  );
  await expect(
    page.getByRole('button', {
      exact: true,
      name: '選擇複習卡：分類顯示標籤',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      exact: true,
      name: '選擇複習卡：色彩的分類',
    }),
  ).toHaveCount(0);

  await walkReviewCards(
    page,
    firstSubtopicCardTitles.slice(0, 1),
    async (card) => {
      await expect(card).toBeVisible();
    },
  );
});

test('review card walk survives the page reset after returning', async ({
  page,
}) => {
  await page.goto('/dev-harness/chapter-detail.html?scenario=in-progress');

  await walkReviewCards(page, firstSubtopicCardTitles, async (card) => {
    await expect(card).toBeVisible();
  });
});
