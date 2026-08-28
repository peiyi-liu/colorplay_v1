import { expect, type Locator } from '@playwright/test';

const expectedContentFragments = [
  '色相（Hue）',
  '先找出色相環上的位置。',
  '彩度有多鮮豔或灰濁控制氣氛與焦點',
  '完成記錄後，再用去色畫面檢查明度關係',
  '重點整理：三者互相影響',
] as const;

const normalizedText = (text: string) => text.replaceAll(/\s+/gu, '');

export const reviewReaderViewports = [
  { capture: true, height: 720, label: '1280', mobile: false, width: 1280 },
  {
    capture: false,
    height: 768,
    label: '1024x768',
    mobile: false,
    width: 1024,
  },
  {
    capture: false,
    height: 900,
    label: '1440x900',
    mobile: false,
    width: 1440,
  },
  { capture: true, height: 852, label: '393', mobile: true, width: 393 },
  { capture: false, height: 568, label: '320x568', mobile: true, width: 320 },
  {
    capture: false,
    height: 1024,
    label: '768x1024',
    mobile: false,
    width: 768,
  },
  {
    capture: false,
    height: 812,
    label: '375x812',
    mobile: true,
    width: 375,
  },
  {
    capture: false,
    height: 393,
    label: '852x393-landscape',
    mobile: true,
    width: 852,
  },
  {
    capture: false,
    height: 375,
    label: '812x375-landscape',
    mobile: true,
    width: 812,
  },
] as const;

export async function assertCompleteReviewReaderPagination(
  reader: Locator,
  mobile: boolean,
) {
  const viewport = reader.locator('.chapter-review-reader__viewport');
  const pages = viewport.locator('.chapter-review-reader__book-page');
  const next = reader.getByRole('button', { name: '閱讀下一頁' });
  const previous = reader.getByRole('button', { name: '閱讀上一頁' });
  const sourceText = await reader
    .locator('.chapter-review-reader__pagination-source')
    .textContent();
  const renderedPageText: string[] = [];
  let sawOverflowFallback = false;
  let sawTableWithoutInnerVerticalScroll = false;
  let viewCount = 0;

  while (viewCount < 100) {
    viewCount += 1;
    await expect(pages).toHaveCount(mobile ? 1 : 2);

    const pageResults = await pages.evaluateAll((elements) =>
      elements.map((element) => {
        const pageElement = element as HTMLElement;
        const style = getComputedStyle(pageElement);
        return {
          clippedText: Array.from(
            pageElement.querySelectorAll<HTMLElement>(
              'h1, h2, h3, p, li, th, td',
            ),
          )
            .filter(
              (target) =>
                target.scrollWidth > target.clientWidth + 1 ||
                target.scrollHeight > target.clientHeight + 1,
            )
            .map((target) => target.textContent?.trim() ?? ''),
          horizontalOverflow: pageElement.scrollWidth - pageElement.clientWidth,
          overflowFallback: pageElement.dataset.overflowFallback === 'true',
          overflowY: style.overflowY,
          tabIndex: pageElement.tabIndex,
          text: pageElement.textContent ?? '',
          verticalOverflow: pageElement.scrollHeight - pageElement.clientHeight,
        };
      }),
    );
    const visibleTableContent = viewport.locator(
      '.chapter-review-reader__content:has(table)',
    );
    if ((await visibleTableContent.count()) > 0) {
      sawTableWithoutInnerVerticalScroll = true;
      const tableOverflow = await visibleTableContent
        .first()
        .evaluate((element) => ({
          maxHeight: getComputedStyle(element).maxHeight,
          vertical: element.scrollHeight - element.clientHeight,
        }));
      expect(tableOverflow.maxHeight).toBe('none');
      expect(tableOverflow.vertical).toBeLessThanOrEqual(1);
    }

    for (let index = 0; index < pageResults.length; index += 1) {
      const result = pageResults[index];
      if (!result) continue;
      renderedPageText.push(result.text);
      expect(result.clippedText).toEqual([]);
      expect(result.horizontalOverflow).toBeLessThanOrEqual(1);
      if (result.overflowFallback) {
        sawOverflowFallback = true;
        expect(['auto', 'scroll']).toContain(result.overflowY);
        expect(result.tabIndex).toBe(0);
        if (result.verticalOverflow > 1) {
          const visiblePage = pages.nth(index);
          await visiblePage.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          expect(
            await visiblePage.evaluate((element) => element.scrollTop),
          ).toBeGreaterThan(0);
        }
      } else {
        expect(result.verticalOverflow).toBeLessThanOrEqual(1);
      }
    }

    if (await next.isDisabled()) break;
    const before = await pages.allTextContents();
    await next.click();
    await expect.poll(() => pages.allTextContents()).not.toEqual(before);
  }

  const renderedText = normalizedText(renderedPageText.join(''));
  expect(viewCount).toBeLessThan(100);
  expect(viewCount).toBeGreaterThan(1);
  expect(sawOverflowFallback).toBe(true);
  expect(sawTableWithoutInnerVerticalScroll).toBe(true);
  expect(renderedText).toBe(normalizedText(sourceText ?? ''));
  for (const fragment of expectedContentFragments) {
    expect(renderedText).toContain(normalizedText(fragment));
  }

  while (!(await previous.isDisabled())) {
    const before = await pages.allTextContents();
    await previous.click();
    await expect.poll(() => pages.allTextContents()).not.toEqual(before);
  }
}
