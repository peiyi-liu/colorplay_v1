import { expect, type Locator, type Page } from '@playwright/test';

type ReviewCardVisitor = (card: Locator, cardTitle: string) => Promise<void>;

export async function completeReviewCard(card: Locator) {
  await card.getByRole('button', { exact: true, name: '完成複習' }).click();
  const completionStatus = card
    .getByRole('status')
    .filter({ hasText: /^已完成複習$/u });
  await expect(completionStatus).toHaveText('已完成複習');
}

export async function walkReviewCards(
  page: Page,
  cardTitles: readonly string[],
  visitCard: ReviewCardVisitor,
) {
  const firstPageChoices = page.getByRole('button', {
    name: /^選擇複習卡：/u,
  });
  await expect(firstPageChoices.first()).toBeVisible();
  const cardsPerPage = await firstPageChoices.count();

  for (const [cardIndex, cardTitle] of cardTitles.entries()) {
    const targetPageIndex = Math.floor(cardIndex / cardsPerPage);
    for (let pageIndex = 0; pageIndex < targetPageIndex; pageIndex += 1) {
      const nextPage = page.getByRole('button', {
        exact: true,
        name: '下一頁',
      });
      await expect(nextPage).toBeEnabled();
      await nextPage.click();
    }

    const choice = page
      .getByRole('button', { name: /^選擇複習卡：/u })
      .nth(cardIndex % cardsPerPage);
    await expect(choice).toBeVisible();
    await choice.click();
    await page.getByRole('button', { name: /^進入複習/u }).click();

    const card = page.getByRole('article', {
      exact: true,
      name: cardTitle,
    });
    await expect(card).toBeVisible();
    await visitCard(card, cardTitle);
    await page
      .getByRole('button', { exact: true, name: '返回複習卡選擇' })
      .click();
  }
}
