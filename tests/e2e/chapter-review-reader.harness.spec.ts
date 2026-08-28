import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import { expectMobileReaderHeaderOnBook } from './helpers/review-reader-header';
import {
  assertCompleteReviewReaderPagination,
  reviewReaderViewports,
} from './helpers/assert-review-reader-pagination';

for (const viewport of reviewReaderViewports) {
  test(`06-v2 review reader matches the full-book contract at ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/chapter-detail.html?scenario=in-progress');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: '進入複習' }).click();
    const reader = page.getByRole('region', {
      name: /複習卡閱讀：色彩三要素/u,
    });
    await expect(reader).toBeVisible();
    await expect(
      reader.getByRole('heading', { name: '第三章 · 色彩體系與應用' }),
    ).toBeVisible();
    await expect(reader).toContainText('3-1 色彩三要素與色名的表示');
    await expect(reader).toContainText('複習 2 / 10');
    await expect(
      reader.locator('img[alt="十二色相環示意圖"]').first(),
    ).toBeAttached();

    const book = reader.getByRole('article', { name: '色彩三要素' });
    const viewportElement = reader.locator('.chapter-review-reader__viewport');
    const visibleBookPages = viewportElement.locator(
      '.chapter-review-reader__book-page',
    );
    const pageCount = reader.locator('.chapter-review-reader__page-count');
    const previous = reader.getByRole('button', { name: '閱讀上一頁' });
    const next = reader.getByRole('button', { name: '閱讀下一頁' });
    const complete = reader.getByRole('button', { name: '完成複習' });
    const hud = page.locator('.hud-top--student');
    const back = page
      .locator('#main-content')
      .getByRole('button', { name: '返回複習卡選擇' });
    await expect(book).toBeVisible();
    await expect(visibleBookPages).toHaveCount(viewport.mobile ? 1 : 2);
    const bookPageNumbers = book.locator(
      '.chapter-review-reader__book-page-numbers',
    );
    if (viewport.mobile) {
      await expect(bookPageNumbers).toBeHidden();
      await expect(
        reader.locator('.chapter-review-reader__position'),
      ).toBeHidden();
      await expect(
        reader.locator('.chapter-review-reader__reading-progress'),
      ).toBeHidden();
      await expect(pageCount).toBeHidden();
      await expect(
        reader.locator('.chapter-review-reader__footer button'),
      ).toHaveCount(3);
    } else {
      await expect(bookPageNumbers).toBeVisible();
      await expect(
        book.locator('.chapter-review-reader__book-page-number--left'),
      ).toContainText('1');
    }
    await expect(back).toBeVisible();
    await expect(
      hud.getByRole('button', { name: '返回複習卡選擇' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '返回複習卡選擇' }),
    ).toHaveCount(1);
    if (viewport.mobile) await expectMobileReaderHeaderOnBook(page);
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await expect(pageCount).not.toContainText('第 1 / 1 頁');
    await expect(complete).toBeVisible();
    if (viewport.mobile) {
      await expect(complete).toContainText(/\d+%/u);
    }

    const metrics = await reader.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const bookElement = element.querySelector<HTMLElement>(
        '.chapter-review-reader__book',
      );
      const contentViewport = element.querySelector<HTMLElement>(
        '.chapter-review-reader__viewport',
      );
      const footer = element.querySelector<HTMLElement>(
        '.chapter-review-reader__footer',
      );
      const header = element.querySelector<HTMLElement>(
        '.chapter-review-reader__header',
      );
      const headingGroup = element.querySelector<HTMLElement>(
        '.chapter-review-reader__heading-group',
      );
      const back = document.querySelector<HTMLElement>('.student-route-back');
      const gutter = element.querySelector<HTMLElement>(
        '.chapter-review-reader__gutter',
      );
      const pageNumbers = element.querySelector<HTMLElement>(
        '.chapter-review-reader__book-page-numbers',
      );
      const rect = (target: HTMLElement | null) => {
        const targetBox = target?.getBoundingClientRect();
        return targetBox
          ? {
              bottom: targetBox.bottom,
              height: targetBox.height,
              left: targetBox.left,
              right: targetBox.right,
              top: targetBox.top,
              width: targetBox.width,
            }
          : null;
      };
      return {
        backgroundAttachment: getComputedStyle(element).backgroundAttachment,
        book: rect(bookElement),
        contentViewport: rect(contentViewport),
        internalOverflow: contentViewport
          ? contentViewport.scrollWidth - contentViewport.clientWidth
          : null,
        pageOverflow: Array.from(
          element.querySelectorAll<HTMLElement>(
            '.chapter-review-reader__viewport .chapter-review-reader__book-page',
          ),
        ).map((pageElement) => ({
          horizontal: pageElement.scrollWidth - pageElement.clientWidth,
          vertical: pageElement.scrollHeight - pageElement.clientHeight,
        })),
        documentOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        footer: rect(footer),
        header: rect(header),
        gutterDisplay: gutter ? getComputedStyle(gutter).display : null,
        backgroundImage: getComputedStyle(element).backgroundImage,
        bookBackgroundImage: bookElement
          ? getComputedStyle(bookElement).backgroundImage
          : null,
        bookBackgroundSize: bookElement
          ? getComputedStyle(bookElement).backgroundSize
          : null,
        mobileReadingColors: Array.from(
          element.querySelectorAll<HTMLElement>(
            '.chapter-review-reader__heading-group h1, .chapter-review-reader__heading-group > p:not(.chapter-review-reader__position), .chapter-review-reader__viewport .chapter-review-reader__book-title, .chapter-review-reader__viewport .chapter-review-reader__content',
          ),
        ).map((target) => getComputedStyle(target).color),
        pageNumbers: rect(pageNumbers),
        controlStyles: Array.from(
          element.querySelectorAll<HTMLElement>(
            '.chapter-review-reader__page-action, .review-card__complete-button',
          ),
        ).map((control) => {
          const style = getComputedStyle(control);
          return {
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            color: style.color,
            disabled: control.matches(':disabled'),
            fontSize: Number.parseFloat(style.fontSize),
            text: control.textContent?.trim(),
          };
        }),
        headerOverlap: (() => {
          const headingBox = headingGroup?.getBoundingClientRect();
          const backBox = back?.getBoundingClientRect();
          if (!headingBox || !backBox) return false;
          return !(
            backBox.right <= headingBox.left ||
            headingBox.right <= backBox.left ||
            backBox.bottom <= headingBox.top ||
            headingBox.bottom <= backBox.top
          );
        })(),
        reader: {
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          top: box.top,
        },
        textClipping: Array.from(
          element.querySelectorAll<HTMLElement>(
            '.chapter-review-reader__heading-group h1, .chapter-review-reader__heading-group p, .chapter-review-reader__viewport h2, .chapter-review-reader__viewport .chapter-review-reader__subtitle, .chapter-review-reader__viewport .chapter-review-reader__content, .chapter-review-reader__book-page-number, .chapter-review-reader__page-count, .chapter-review-reader__controls button',
          ),
        )
          .filter(
            (target) =>
              target.scrollWidth > target.clientWidth + 1 ||
              target.scrollHeight > target.clientHeight + 1,
          )
          .map((target) => ({
            clientHeight: target.clientHeight,
            clientWidth: target.clientWidth,
            scrollHeight: target.scrollHeight,
            scrollWidth: target.scrollWidth,
            text: target.textContent,
          })),
      };
    });

    expect(metrics.reader.left).toBeLessThanOrEqual(1);
    expect(metrics.reader.right).toBeGreaterThanOrEqual(viewport.width - 1);
    const hudBottom = await hud.evaluate(
      (element) => element.getBoundingClientRect().bottom,
    );
    expect(metrics.reader.top).toBeCloseTo(hudBottom, 0);
    expect(metrics.book?.top ?? -1).toBeGreaterThanOrEqual(metrics.reader.top);
    if (viewport.mobile) {
      expect(metrics.book?.left ?? Infinity).toBeCloseTo(
        metrics.reader.left,
        0,
      );
      expect(metrics.book?.right ?? -Infinity).toBeCloseTo(
        metrics.reader.right,
        0,
      );
      expect(metrics.book?.top ?? Infinity).toBeCloseTo(metrics.reader.top, 0);
      expect(metrics.book?.bottom ?? -Infinity).toBeCloseTo(
        metrics.reader.bottom,
        0,
      );
      expect(
        (metrics.contentViewport?.top ?? -Infinity) -
          (metrics.header?.bottom ?? Infinity),
      ).toBeGreaterThanOrEqual(10);
      expect(
        (metrics.footer?.top ?? -Infinity) -
          (metrics.contentViewport?.bottom ?? Infinity),
      ).toBeGreaterThanOrEqual(10);
    } else {
      expect(metrics.book?.bottom ?? Infinity).toBeLessThanOrEqual(
        metrics.footer?.top ?? 0,
      );
    }
    expect(metrics.footer?.bottom ?? Infinity).toBeLessThanOrEqual(
      metrics.reader.bottom,
    );
    expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
    expect(metrics.headerOverlap).toBe(false);
    expect(metrics.textClipping).toEqual([]);
    expect(metrics.internalOverflow ?? Infinity).toBeLessThanOrEqual(1);
    expect(metrics.pageOverflow).toHaveLength(viewport.mobile ? 1 : 2);
    for (const pageOverflow of metrics.pageOverflow) {
      expect(pageOverflow.horizontal).toBeLessThanOrEqual(1);
      expect(pageOverflow.vertical).toBeLessThanOrEqual(1);
    }
    expect(metrics.gutterDisplay).toBe(viewport.mobile ? 'none' : 'block');
    if (viewport.mobile) {
      expect(metrics.backgroundImage).toBe('none');
      expect(metrics.bookBackgroundSize).toBe('112% 106%');
      expect(metrics.mobileReadingColors).not.toHaveLength(0);
      for (const textColor of metrics.mobileReadingColors) {
        expect(textColor).not.toBe('rgb(255, 255, 255)');
      }
    } else {
      expect(metrics.backgroundImage).toContain('review-reader-world-desktop');
      expect(metrics.backgroundAttachment).not.toContain('fixed');
    }
    expect(metrics.bookBackgroundImage).toContain(
      viewport.mobile ? 'open-book-page-upright' : 'open-book-spread-upright',
    );
    if (!viewport.mobile) {
      expect(
        (metrics.book?.width ?? 0) / (metrics.book?.height ?? 1),
      ).toBeCloseTo(1683 / 935, 2);
    }
    expect(metrics.contentViewport?.left ?? -1).toBeGreaterThanOrEqual(
      metrics.book?.left ?? 0,
    );
    expect(metrics.contentViewport?.right ?? Infinity).toBeLessThanOrEqual(
      metrics.book?.right ?? 0,
    );
    expect(metrics.contentViewport?.top ?? -1).toBeGreaterThanOrEqual(
      metrics.book?.top ?? 0,
    );
    expect(metrics.contentViewport?.bottom ?? Infinity).toBeLessThanOrEqual(
      metrics.book?.bottom ?? 0,
    );
    expect(metrics.controlStyles).not.toHaveLength(0);
    for (const controlStyle of metrics.controlStyles) {
      expect(controlStyle.fontSize, controlStyle.text).toBeGreaterThanOrEqual(
        15,
      );
      expect(controlStyle.color, controlStyle.text).toBe(
        controlStyle.disabled ? 'rgb(183, 195, 215)' : 'rgb(255, 255, 255)',
      );
      expect(
        controlStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          controlStyle.backgroundImage !== 'none',
        controlStyle.text,
      ).toBe(true);
    }
    if (!viewport.mobile) {
      expect(metrics.pageNumbers?.bottom ?? Infinity).toBeLessThanOrEqual(
        metrics.book?.bottom ?? 0,
      );
      expect(metrics.pageNumbers?.top ?? -1).toBeGreaterThan(
        (metrics.book?.bottom ?? 0) - 80,
      );
    }

    const controls = reader.locator('button:visible');
    for (let index = 0; index < (await controls.count()); index += 1) {
      const controlBox = await controls.nth(index).boundingBox();
      expect(controlBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(controlBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    if (viewport.mobile) {
      const [previousBox, completeBox, nextBox] = await reader.evaluate(
        (element) =>
          [
            '.chapter-review-reader__page-action--previous',
            '.review-card__complete-button',
            '.chapter-review-reader__page-action--next',
          ].map((selector) => {
            const box = element
              .querySelector<HTMLElement>(selector)
              ?.getBoundingClientRect();
            return box
              ? {
                  height: box.height,
                  left: box.left,
                  top: box.top,
                  width: box.width,
                }
              : null;
          }),
      );
      expect(previousBox).not.toBeNull();
      expect(completeBox).not.toBeNull();
      expect(nextBox).not.toBeNull();
      expect(previousBox?.left ?? Infinity).toBeLessThan(
        completeBox?.left ?? -Infinity,
      );
      expect(completeBox?.left ?? Infinity).toBeLessThan(
        nextBox?.left ?? -Infinity,
      );
      expect(
        Math.abs((previousBox?.top ?? 0) - (completeBox?.top ?? 0)),
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs((nextBox?.top ?? 0) - (completeBox?.top ?? 0)),
      ).toBeLessThanOrEqual(0.5);
    }

    if (viewport.capture) {
      await mkdir(
        `artifacts/design-audit/jrpg-review-reader/${viewport.label}`,
        { recursive: true },
      );
      await page.screenshot({
        animations: 'disabled',
        path: `artifacts/design-audit/jrpg-review-reader/${viewport.label}/review-reader.png`,
      });
    }

    await assertCompleteReviewReaderPagination(reader, viewport.mobile);

    const stableSelectors = [
      '.chapter-review-reader__header',
      '.chapter-review-reader__heading-group',
      '.chapter-review-reader__book-stage',
      '.chapter-review-reader__book',
      '.chapter-review-reader__viewport',
      '.chapter-review-reader__book-page-numbers',
      '.chapter-review-reader__footer',
      '.chapter-review-reader__page-action--previous',
      '.chapter-review-reader__page-count',
      '.chapter-review-reader__page-action--next',
      '.review-card__complete-button',
    ];
    const captureStableGeometry = () =>
      reader.evaluate((element, selectors) => {
        return Object.fromEntries(
          selectors.map((selector) => {
            const target = element.querySelector<HTMLElement>(selector);
            if (!target) return [selector, null];
            const box = target.getBoundingClientRect();
            return [
              selector,
              {
                height: box.height,
                left: box.left,
                top: box.top,
                width: box.width,
              },
            ];
          }),
        );
      }, stableSelectors);

    const geometryBeforePageChange = await captureStableGeometry();
    const visibleTextBeforePageChange =
      await visibleBookPages.allTextContents();
    const completeTextBeforePageChange = await complete.textContent();
    await next.click();
    expect(
      await viewportElement.evaluate(
        (element) => getComputedStyle(element, '::after').animationName,
      ),
    ).toBe('chapter-book-page-turn-next');
    await expect(previous).toBeEnabled();
    await expect(pageCount).toContainText('第 2 /');
    if (viewport.mobile) {
      await expect
        .poll(() => complete.textContent())
        .not.toBe(completeTextBeforePageChange);
    } else {
      await expect(
        book.locator('.chapter-review-reader__book-page-number--left'),
      ).toContainText('3');
    }
    await expect
      .poll(() => visibleBookPages.allTextContents())
      .not.toEqual(visibleTextBeforePageChange);
    expect(
      await viewportElement.evaluate((element) => element.scrollLeft),
    ).toBe(0);
    expect(
      await viewportElement.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    const geometryAfterPageChange = await captureStableGeometry();
    for (const selector of stableSelectors) {
      const before = geometryBeforePageChange[selector];
      const after = geometryAfterPageChange[selector];
      expect(before, selector).not.toBeNull();
      expect(after, selector).not.toBeNull();
      if (!before || !after) continue;
      for (const dimension of ['height', 'left', 'top', 'width'] as const) {
        expect(
          Math.abs(after[dimension] - before[dimension]),
          `${selector} ${dimension}`,
        ).toBeLessThanOrEqual(0.5);
      }
    }
  });
}

test('06-v2 review reader removes page-turn motion when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto('/dev-harness/chapter-detail.html?scenario=in-progress');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '進入複習' }).click();
  const reader = page.getByRole('region', {
    name: /複習卡閱讀：色彩三要素/u,
  });
  const next = reader.getByRole('button', { name: '閱讀下一頁' });
  const viewportElement = reader.locator('.chapter-review-reader__viewport');
  await expect(next).toBeEnabled();
  await next.click();
  await expect(viewportElement).toHaveAttribute('data-turn-direction', 'next');
  expect(
    await viewportElement.evaluate(
      (element) => getComputedStyle(element, '::after').animationName,
    ),
  ).toBe('none');
});

test('06-v2 review reader makes Markdown bold visibly distinct from body copy', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto('/dev-harness/chapter-detail.html?scenario=in-progress');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '進入複習' }).click();

  const visibleMarkdown = page
    .locator(
      '.chapter-review-reader__viewport > .chapter-review-reader__book-page .review-card-markdown',
    )
    .filter({ has: page.locator('strong') })
    .first();
  await expect(visibleMarkdown).toBeVisible();

  const weights = await visibleMarkdown.evaluate((element) => {
    const strong = element.querySelector('strong');
    return {
      body: Number.parseInt(getComputedStyle(element).fontWeight, 10),
      strong: strong
        ? Number.parseInt(getComputedStyle(strong).fontWeight, 10)
        : 0,
    };
  });

  expect(weights.body).toBeLessThanOrEqual(500);
  expect(weights.strong).toBeGreaterThanOrEqual(700);
  expect(weights.strong - weights.body).toBeGreaterThanOrEqual(200);
});
