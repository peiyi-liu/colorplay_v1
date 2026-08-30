import { expect, test, type Locator } from '@playwright/test';

import { expectInside } from './helpers/live-projector-layout';

const expectTouchTarget = async (control: Locator) => {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
};

test('lobby start confirmation stays inside the projector and preserves waiting', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto(
    '/dev-harness/live-presenter.html?scenario=lobby-boundary&promptLength=36&optionLength=21',
  );
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: '開始遊戲' }).click();
  const dialog = page.getByRole('alertdialog', { name: '立即開始' });
  await expect(dialog).toBeVisible();
  await expectInside(
    dialog,
    page.getByRole('region', { name: 'Live 投影模式' }),
  );
  await expectTouchTarget(
    page.getByRole('button', { name: '開始', exact: true }),
  );
  await expectTouchTarget(page.getByRole('button', { name: '繼續等待' }));

  await page.getByRole('button', { name: '繼續等待' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('60 位同學已加入')).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
