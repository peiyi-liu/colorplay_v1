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
