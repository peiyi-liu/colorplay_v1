import { expect, type Page } from '@playwright/test';

export const observeRuntimeErrors = (page: Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
};

export const WIDTHS = [320, 375, 393, 768, 1024, 1280, 1440] as const;
export const ROUTE_SCENARIOS = [
  'analytics',
  'questions',
  'classes',
  'classroom-detail',
  'live',
  'live-report',
  'live-session',
  'student-progress',
] as const;

export const verifyDrillDownComposition = async (
  page: Page,
  scenario: (typeof ROUTE_SCENARIOS)[number],
  width: number,
) => {
  if (scenario === 'classroom-detail' && width === 393) {
    const member = page.getByTestId('member-disclosure').first();
    const summary = member.locator('summary');
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    await expect(member.getByRole('link', { name: '查看細節' })).toBeVisible();
    expect(await summary.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  if (scenario === 'student-progress' && width === 393) {
    const summary = page.getByTestId('chapter-disclosure').first().locator('summary');
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(await summary.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  if (scenario === 'classroom-detail' && width === 1280)
    await expect(page.getByRole('table', { name: '班級學生' })).toBeVisible();
  if (scenario === 'student-progress' && width === 1280)
    await expect(page.getByRole('table', { name: '各章節學習進度' })).toBeVisible();
};

export const verifyLiveReportComposition = async (
  page: Page,
  scenario: (typeof ROUTE_SCENARIOS)[number],
  width: number,
) => {
  if (scenario !== 'live-report' || (width !== 320 && width !== 393 && width !== 1280)) return;
  const matrix = page.getByRole('region', { name: '作答矩陣' });
  await expect(matrix).toBeVisible();
  const matrixBounds = await matrix.locator('.live-matrix-scroll').evaluate((el) => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }));
  expect(matrixBounds.clientWidth).toBeLessThanOrEqual(matrixBounds.scrollWidth);
  if (width === 393) {
    const summary = page.getByText('第 1 題．色彩三要素是？');
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    const podium = page.getByRole('list', { name: '前三名' });
    const ranks = await podium.locator('li').evaluateAll((items) =>
      items.map((item) => ({
        bottom: item.getBoundingClientRect().bottom,
        height: item.getBoundingClientRect().height,
        rank: item.getAttribute('data-rank'),
      })),
    );
    expect(ranks.find((entry) => entry.rank === '1')?.height).toBeGreaterThan(
      ranks.find((entry) => entry.rank === '2')?.height ?? 0,
    );
    expect(new Set(ranks.map((entry) => Math.round(entry.bottom))).size).toBe(1);
  }
};
