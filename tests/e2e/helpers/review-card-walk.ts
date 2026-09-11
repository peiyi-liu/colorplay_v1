import { expect, type Locator, type Page } from '@playwright/test';

type ReviewCardVisitor = (card: Locator, cardTitle: string) => Promise<void>;

export async function completeReviewCard(card: Locator) {
  const completionStatus = card
    .getByRole('status')
    .filter({ hasText: /^已完成複習$/u });
  if (!(await completionStatus.isVisible())) {
    await card.getByRole('button', { exact: true, name: '完成複習' }).click();
  }
  await expect(completionStatus).toHaveText('已完成複習');
}

const REVIEW_CARD_NAVIGATION_MISMATCH_PREFIX =
  'REVIEW_CARD_NAVIGATION_MISMATCH';

interface ReviewCardNavigationDiagnostics {
  cardsPerPage: number;
  choiceIndexOnPage: number;
  clickedChoicePressedAfterClick: boolean;
  diagnosticCollectionFailed: boolean;
  expectedCardIndex: number;
  pressedChoiceIndexes: number[];
  targetPageIndex: number;
  visibleArticleExpectedIndexes: number[];
  visibleChoiceCount: number;
}

// A single evaluateAll() snapshot avoids per-element getAttribute() calls,
// each of which carries Playwright's default actionability wait; a stale or
// remounting DOM must not make this diagnostic collector itself hang.
async function snapshotReviewCardNavigationState(page: Page): Promise<{
  articleNames: (string | null)[];
  choicePressedFlags: (string | null)[];
}> {
  const choicePressedFlags = await page
    .getByRole('button', { name: /^選擇複習卡：/u })
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-pressed')),
    );
  const articleNames = await page
    .getByRole('article')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label')),
    );
  return { articleNames, choicePressedFlags };
}

async function describeReviewCardNavigationMismatch(
  page: Page,
  cardTitles: readonly string[],
  context: {
    cardIndex: number;
    cardsPerPage: number;
    choiceIndexOnPage: number;
    targetPageIndex: number;
  },
): Promise<string> {
  let diagnostics: ReviewCardNavigationDiagnostics;
  try {
    const { articleNames, choicePressedFlags } =
      await snapshotReviewCardNavigationState(page);
    const pressedChoiceIndexes = choicePressedFlags.flatMap((value, index) =>
      value === 'true' ? [index] : [],
    );
    const visibleArticleExpectedIndexes = cardTitles.flatMap((title, index) =>
      articleNames.includes(title) ? [index] : [],
    );
    diagnostics = {
      cardsPerPage: context.cardsPerPage,
      choiceIndexOnPage: context.choiceIndexOnPage,
      clickedChoicePressedAfterClick: pressedChoiceIndexes.includes(
        context.choiceIndexOnPage,
      ),
      diagnosticCollectionFailed: false,
      expectedCardIndex: context.cardIndex,
      pressedChoiceIndexes,
      targetPageIndex: context.targetPageIndex,
      visibleArticleExpectedIndexes,
      visibleChoiceCount: choicePressedFlags.length,
    };
  } catch {
    // Fail closed: the snapshot itself failed, so nothing DOM-derived is
    // trustworthy. Only the already-known, non-secret loop context survives.
    diagnostics = {
      cardsPerPage: context.cardsPerPage,
      choiceIndexOnPage: context.choiceIndexOnPage,
      clickedChoicePressedAfterClick: false,
      diagnosticCollectionFailed: true,
      expectedCardIndex: context.cardIndex,
      pressedChoiceIndexes: [],
      targetPageIndex: context.targetPageIndex,
      visibleArticleExpectedIndexes: [],
      visibleChoiceCount: 0,
    };
  }
  return `${REVIEW_CARD_NAVIGATION_MISMATCH_PREFIX} ${JSON.stringify(diagnostics)}`;
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

    const choiceIndexOnPage = cardIndex % cardsPerPage;
    const choice = page
      .getByRole('button', { name: /^選擇複習卡：/u })
      .nth(choiceIndexOnPage);
    await expect(choice).toBeVisible();
    await choice.click();
    await page.getByRole('button', { name: /^進入複習/u }).click();

    const card = page.getByRole('article', {
      exact: true,
      name: cardTitle,
    });
    try {
      await expect(card).toBeVisible();
    } catch {
      throw new Error(
        await describeReviewCardNavigationMismatch(page, cardTitles, {
          cardIndex,
          cardsPerPage,
          choiceIndexOnPage,
          targetPageIndex,
        }),
      );
    }
    await visitCard(card, cardTitle);
    await page
      .getByRole('button', { exact: true, name: '返回複習卡選擇' })
      .click();
  }
}
