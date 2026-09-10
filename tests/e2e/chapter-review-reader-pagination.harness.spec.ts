import { expect, test } from '@playwright/test';

import {
  completeReviewCard,
  walkReviewCards,
} from './helpers/review-card-walk';

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

test('completion assertion distinguishes completion from pending media status', async ({
  page,
}) => {
  await page.setContent(`
    <article aria-label="色彩三要素">
      <p role="status">圖片載入中：十二色相環示意圖</p>
      <button type="button">完成複習</button>
    </article>
  `);
  await page
    .getByRole('button', { exact: true, name: '完成複習' })
    .evaluate((button) => {
      button.addEventListener('click', () => {
        const completionStatus = document.createElement('p');
        completionStatus.setAttribute('role', 'status');
        completionStatus.textContent = '已完成複習';
        button.replaceWith(completionStatus);
      });
    });

  const card = page.getByRole('article', { name: '色彩三要素' });
  await completeReviewCard(card);
  await expect(card.getByRole('status')).toHaveCount(2);
});
