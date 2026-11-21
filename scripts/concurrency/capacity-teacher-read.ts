import { expect, type Page } from '@playwright/test';

/** Public UI evidence only; zero completions and an unavailable average are legal. */
export const waitForCapacityTeacherOverview = async (
  page: Page,
  classroomId: string,
): Promise<void> => {
  const selected = page.getByLabel('選擇班級', { exact: true });
  await expect(selected).toHaveValue(classroomId);
  const overview = page.getByRole('region', { name: '班級總覽', exact: true });
  await expect(overview).toBeVisible();
  const completed = overview
    .locator('dt')
    .filter({ hasText: /^完成人數$/u })
    .locator('..')
    .locator('dd');
  await expect(completed).toBeVisible();
  await expect(completed).toHaveText(/^(?:0|[1-9]\d*)\/(?:0|[1-9]\d*)$/u);
  await expect(selected).toHaveValue(classroomId);
};
