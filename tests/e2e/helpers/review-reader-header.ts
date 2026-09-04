import { expect, type Page } from '@playwright/test';

export async function expectMobileReaderHeaderOnBook(page: Page) {
  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element)
        throw new Error(`READER_HEADER_ELEMENT_MISSING:${selector}`);
      const box = element.getBoundingClientRect();
      return {
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        top: box.top,
      };
    };
    const back = document.querySelector<HTMLElement>('.student-route-back');
    const next = document.querySelector<HTMLElement>(
      '.chapter-review-reader__page-action--next',
    );
    if (!back || !next) throw new Error('READER_HEADER_CONTROL_MISSING');
    return {
      back: rect('.student-route-back'),
      backBackground: getComputedStyle(back).backgroundImage,
      book: rect('.chapter-review-reader__book'),
      heading: rect('.chapter-review-reader__heading-group'),
      nextBackground: getComputedStyle(next).backgroundImage,
    };
  });

  expect(Math.abs(metrics.back.top - metrics.heading.top)).toBeLessThanOrEqual(
    1,
  );
  expect(metrics.back.right).toBeLessThanOrEqual(metrics.heading.left - 8);
  expect(metrics.back.left).toBeGreaterThanOrEqual(metrics.book.left);
  expect(metrics.back.top).toBeGreaterThanOrEqual(metrics.book.top);
  expect(metrics.back.bottom).toBeLessThanOrEqual(metrics.book.bottom);
  expect(metrics.backBackground).toBe(metrics.nextBackground);
}
