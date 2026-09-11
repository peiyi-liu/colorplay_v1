import { expect, test, type Page } from '@playwright/test';

import {
  completeReviewCard,
  walkReviewCards,
} from './helpers/review-card-walk';

// Two choices where clicking the second never commits its aria-pressed
// state, so "進入複習" keeps opening the first article regardless of which
// choice was actually clicked (simulates an unresolved selection race).
async function setUpUnresolvedSelectionRaceFixture(page: Page) {
  await page.setContent(`
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
    await walkReviewCards(page, ['A', 'B'], async (card) => {
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
