import { expect, type Locator, type Page } from '@playwright/test';

import type { ReviewSubtopicContent } from '../../fixtures/review-manifest.generated';

type ReviewCardVisitor = (card: Locator, cardTitle: string) => Promise<void>;

// aria-label="章節進度" reports chapter-level review progress (summed across
// every subtopic in the chapter), even when a walk only completes one
// subtopic's cards -- so callers must use this chapter total as the
// completion denominator, not the selected subtopic's own cardCount.
export function chapterCardTotal(
  manifest: readonly ReviewSubtopicContent[],
  reviewSubtopic: ReviewSubtopicContent,
): number {
  const total = manifest
    .filter(({ chapterCode }) => chapterCode === reviewSubtopic.chapterCode)
    .reduce((sum, subtopic) => sum + subtopic.cardCount, 0);
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    total < reviewSubtopic.cardCount
  ) {
    throw new Error('LEARNING_EXPERIENCE_CHAPTER_CARD_TOTAL_INVALID');
  }
  return total;
}

const SECTION_KEY_PATTERN = /^\d+-\d+$/u;

// A hosted account's currentCardId can sit in any subtopic, so the review
// library's default active subtopic must never be trusted -- callers select
// the intended subtopic explicitly by sectionKey before walking its cards.
export async function selectReviewSubtopic(
  page: Page,
  sectionKey: string,
): Promise<void> {
  if (!SECTION_KEY_PATTERN.test(sectionKey)) {
    throw new Error('LEARNING_EXPERIENCE_SECTION_KEY_INVALID');
  }
  const button = page
    .getByRole('navigation', { name: '第三章小節' })
    .getByRole('button', { name: new RegExp(`^${sectionKey}\\s`, 'u') });
  // A retrying assertion (not a one-shot count()) so a target that mounts
  // slightly late still resolves; zero, duplicate, and timeout all collapse
  // into the same fixed sentinel with no locator/DOM detail attached.
  try {
    await expect(button).toHaveCount(1);
  } catch {
    throw new Error('LEARNING_EXPERIENCE_SUBTOPIC_BUTTON_NOT_UNIQUE');
  }
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'true');
}

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
  sectionKey: string,
  cardTitles: readonly string[],
  visitCard: ReviewCardVisitor,
  onBeforeReselect?: (cardIndex: number) => Promise<void>,
) {
  for (const [cardIndex, cardTitle] of cardTitles.entries()) {
    await onBeforeReselect?.(cardIndex);
    // Returning to the library after a card can remount it and re-derive
    // the default subtopic from currentCardId, so re-select every card
    // rather than trusting a single selection made before the whole walk.
    await selectReviewSubtopic(page, sectionKey);

    const firstPageChoices = page.getByRole('button', {
      name: /^選擇複習卡：/u,
    });
    await expect(firstPageChoices.first()).toBeVisible();
    const cardsPerPage = await firstPageChoices.count();
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
