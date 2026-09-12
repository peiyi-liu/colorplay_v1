import { expect, test, type Page } from '@playwright/test';

import type { ReviewSubtopicContent } from '../fixtures/review-manifest.generated';
import {
  chapterCardTotal,
  completeReviewCard,
  selectReviewSubtopic,
  walkReviewCards,
} from './helpers/review-card-walk';

function syntheticSubtopic(
  overrides: Partial<ReviewSubtopicContent>,
): ReviewSubtopicContent {
  return {
    cardCount: 0,
    cardTitles: [],
    chapterCode: 'chapter-synthetic',
    sectionKey: 'synthetic-1',
    subtopicId: 'synthetic-subtopic',
    ...overrides,
  };
}

// Two choices where clicking the second never commits its aria-pressed
// state, so "進入複習" keeps opening the first article regardless of which
// choice was actually clicked (simulates an unresolved selection race).
async function setUpUnresolvedSelectionRaceFixture(page: Page) {
  await page.setContent(`
    <nav aria-label="第三章小節">
      <button aria-current="true" type="button">1-1 合成小節</button>
    </nav>
    <button aria-label="選擇複習卡：A" aria-pressed="true" id="choice-0" type="button">A</button>
    <button aria-label="選擇複習卡：B" aria-pressed="false" id="choice-1" type="button">B</button>
    <button id="enter" type="button">進入複習</button>
    <article aria-label="A" hidden id="article-0">A body</article>
    <article aria-label="B" hidden id="article-1">B body</article>
    <button id="back" type="button">返回複習卡選擇</button>
  `);
  await page.evaluate(() => {
    document.getElementById('enter')?.addEventListener('click', () => {
      const firstPressed =
        document.getElementById('choice-0')?.getAttribute('aria-pressed') ===
        'true';
      const target = document.getElementById(
        firstPressed ? 'article-0' : 'article-1',
      );
      target?.removeAttribute('hidden');
    });
    document.getElementById('back')?.addEventListener('click', () => {
      document.getElementById('article-0')?.setAttribute('hidden', '');
      document.getElementById('article-1')?.setAttribute('hidden', '');
    });
  });
}

type ElementGetAttribute = (this: Element, name: string) => string | null;

async function walkAndCaptureMismatch(page: Page): Promise<Error> {
  let thrown: unknown;
  try {
    await walkReviewCards(page, '1-1', ['A', 'B'], async (card) => {
      await expect(card).toBeVisible();
    });
  } catch (error: unknown) {
    thrown = error;
  }
  if (!(thrown instanceof Error)) {
    throw new Error('EXPECTED_NAVIGATION_MISMATCH_ERROR');
  }
  return thrown;
}

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
    '3-1',
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

  await walkReviewCards(page, '3-1', firstSubtopicCardTitles, async (card) => {
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

test('completion is idempotent when the card already shows completion status', async ({
  page,
}) => {
  await page.setContent(`
    <article aria-label="色彩的分類">
      <p role="status">已完成複習</p>
    </article>
  `);

  const card = page.getByRole('article', { name: '色彩的分類' });
  await completeReviewCard(card);
  await expect(card.getByRole('status')).toHaveCount(1);
  await expect(card.getByRole('button', { name: '完成複習' })).toHaveCount(0);
});

// Phase 0 Task 15 / Staging run 34568536342: capture the
// selection-state mismatch without exposing hosted content.
test('reports a bounded navigation-mismatch diagnostic when the second choice opens the first article', async ({
  page,
}) => {
  await setUpUnresolvedSelectionRaceFixture(page);

  const thrown = await walkAndCaptureMismatch(page);
  const [sentinel, payload] = thrown.message.split(/ (.*)/u);
  expect(sentinel).toBe('REVIEW_CARD_NAVIGATION_MISMATCH');
  expect(JSON.parse(payload ?? '')).toEqual({
    cardsPerPage: 2,
    choiceIndexOnPage: 1,
    clickedChoicePressedAfterClick: false,
    diagnosticCollectionFailed: false,
    expectedCardIndex: 1,
    pressedChoiceIndexes: [0],
    targetPageIndex: 0,
    visibleArticleExpectedIndexes: [0],
    visibleChoiceCount: 2,
  });
});

// Phase 0 Task 15 / Staging run 34568536342: the collector must fail closed
// with the fixed sentinel, not leak the underlying error, and not wait for
// Playwright's default actionability timeout when its own snapshot throws.
test('falls back to a safe fixed diagnostic without leaking injected content when the snapshot itself fails', async ({
  page,
}) => {
  await setUpUnresolvedSelectionRaceFixture(page);
  const secret = 'synthetic-secret-not-a-credential';
  const hostileUrl = 'https://attacker.invalid/exfiltrate';
  const hostilePath = '/private/tmp/synthetic-navigation-secret.json';
  await page.evaluate(
    ({ hostilePath, hostileUrl, secret }) => {
      // Native DOM method captured only to invoke via .call(this, name)
      // below; disabled as a block since Prettier may wrap this statement
      // and move the flagged expression off a single "next line".
      /* eslint-disable @typescript-eslint/unbound-method */
      const originalGetAttribute: ElementGetAttribute =
        Element.prototype.getAttribute;
      /* eslint-enable @typescript-eslint/unbound-method */
      Element.prototype.getAttribute = function throwOnAriaLabel(
        this: Element,
        name: string,
      ) {
        if (name === 'aria-label') {
          throw new Error(`leaked ${secret} ${hostileUrl} ${hostilePath}`);
        }
        return originalGetAttribute.call(this, name);
      };
    },
    { hostilePath, hostileUrl, secret },
  );

  const startedAt = Date.now();
  const thrown = await walkAndCaptureMismatch(page);
  const elapsedMs = Date.now() - startedAt;

  expect(thrown.message).not.toContain(secret);
  expect(thrown.message).not.toContain(hostileUrl);
  expect(thrown.message).not.toContain(hostilePath);
  const [sentinel, payload] = thrown.message.split(/ (.*)/u);
  expect(sentinel).toBe('REVIEW_CARD_NAVIGATION_MISMATCH');
  expect(JSON.parse(payload ?? '')).toEqual({
    cardsPerPage: 2,
    choiceIndexOnPage: 1,
    clickedChoicePressedAfterClick: false,
    diagnosticCollectionFailed: true,
    expectedCardIndex: 1,
    pressedChoiceIndexes: [],
    targetPageIndex: 0,
    visibleArticleExpectedIndexes: [],
    visibleChoiceCount: 0,
  });
  expect(elapsedMs).toBeLessThan(10_000);
});

test('chapterCardTotal sums only the same-chapter subtopics', () => {
  const selected = syntheticSubtopic({
    cardCount: 3,
    chapterCode: 'chapter-x',
  });
  const manifest = [
    selected,
    syntheticSubtopic({ cardCount: 3, chapterCode: 'chapter-x' }),
    syntheticSubtopic({ cardCount: 2, chapterCode: 'chapter-x' }),
    syntheticSubtopic({ cardCount: 99, chapterCode: 'chapter-y' }),
  ];
  expect(chapterCardTotal(manifest, selected)).toBe(8);
});

test('review card walk selects the target subtopic when the account default lands elsewhere', async ({
  page,
}) => {
  // firstSubtopicComplete marks every 3-1 card completed (IDs derived from
  // the fixture itself), so ChapterDetailPageView's own "first uncompleted
  // card" logic naturally lands currentCardId in 3-2 -- no manual click.
  await page.goto(
    '/dev-harness/chapter-detail.html?scenario=in-progress&firstSubtopicComplete=true',
  );
  const nav = page.getByRole('navigation', { name: '第三章小節' });
  await expect(nav.getByRole('button', { name: /^3-2\s/u })).toHaveAttribute(
    'aria-current',
    'true',
  );

  // Direct evidence per card, not an inference from eventual success:
  // returning to the library after a card remounts it and re-derives the
  // default subtopic from currentCardId, so 3-2 becomes active again before
  // every re-select except the first (which already found 3-2 active above).
  const driftObservedAtCardIndex: number[] = [];
  await walkReviewCards(
    page,
    '3-1',
    firstSubtopicCardTitles.slice(0, 3),
    async (card) => {
      await expect(card).toBeVisible();
    },
    async (cardIndex) => {
      if (cardIndex === 0) return;
      const driftedBack = await nav
        .getByRole('button', { name: /^3-2\s/u })
        .getAttribute('aria-current');
      if (driftedBack === 'true') {
        driftObservedAtCardIndex.push(cardIndex);
      }
    },
  );
  expect(driftObservedAtCardIndex).toEqual([1, 2]);
});

test('selectReviewSubtopic fails closed on a malformed sectionKey', async ({
  page,
}) => {
  await page.goto('/dev-harness/chapter-detail.html?scenario=in-progress');
  await expect(selectReviewSubtopic(page, 'not-a-section')).rejects.toThrow(
    'LEARNING_EXPERIENCE_SECTION_KEY_INVALID',
  );
});

function subtopicNavContent(buttonsHtml: string): string {
  return `<nav aria-label="第三章小節">${buttonsHtml}</nav>`;
}

test('selectReviewSubtopic waits for a delayed-mount target before succeeding', async ({
  page,
}) => {
  await page.setContent(subtopicNavContent(''));
  await page.evaluate(() => {
    setTimeout(() => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '3-1 延遲掛載小節';
      button.addEventListener('click', () => {
        button.setAttribute('aria-current', 'true');
      });
      document
        .querySelector('nav[aria-label="第三章小節"]')
        ?.appendChild(button);
    }, 300);
  });
  await selectReviewSubtopic(page, '3-1');
  await expect(
    page
      .getByRole('navigation', { name: '第三章小節' })
      .getByRole('button', { name: /^3-1\s/u }),
  ).toHaveAttribute('aria-current', 'true');
});

test('selectReviewSubtopic fails closed when the target never mounts', async ({
  page,
}) => {
  await page.setContent(subtopicNavContent(''));
  await expect(selectReviewSubtopic(page, '3-1')).rejects.toThrow(
    'LEARNING_EXPERIENCE_SUBTOPIC_BUTTON_NOT_UNIQUE',
  );
});

test('selectReviewSubtopic fails closed on a duplicate target', async ({
  page,
}) => {
  await page.setContent(
    subtopicNavContent(
      '<button type="button">3-1 重複一</button><button type="button">3-1 重複二</button>',
    ),
  );
  await expect(selectReviewSubtopic(page, '3-1')).rejects.toThrow(
    'LEARNING_EXPERIENCE_SUBTOPIC_BUTTON_NOT_UNIQUE',
  );
});

test('chapterCardTotal fails closed on an invalid total', () => {
  const noMatchingChapter = syntheticSubtopic({
    cardCount: 3,
    chapterCode: 'chapter-x',
  });
  expect(() => chapterCardTotal([], noMatchingChapter)).toThrow(
    'LEARNING_EXPERIENCE_CHAPTER_CARD_TOTAL_INVALID',
  );

  const belowSelected = syntheticSubtopic({
    cardCount: 5,
    chapterCode: 'chapter-x',
  });
  expect(() =>
    chapterCardTotal(
      [syntheticSubtopic({ cardCount: 2, chapterCode: 'chapter-x' })],
      belowSelected,
    ),
  ).toThrow('LEARNING_EXPERIENCE_CHAPTER_CARD_TOTAL_INVALID');

  const nonInteger = syntheticSubtopic({
    cardCount: 1.5,
    chapterCode: 'chapter-x',
  });
  expect(() => chapterCardTotal([nonInteger], nonInteger)).toThrow(
    'LEARNING_EXPERIENCE_CHAPTER_CARD_TOTAL_INVALID',
  );
});
