import { expect, type Page } from '@playwright/test';

// Real browser geometry/CSS regression against the injected-repository harness.
// This is not a Local Live run or proof of real-device networking.
export async function verifySmallLobby(
  page: Page,
  viewport: { width: number; height: number },
) {
  let consoleErrors = 0;
  let pageErrors = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors += 1;
  });
  page.on('pageerror', () => {
    pageErrors += 1;
  });
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev-harness/teacher-routes.html?scenario=live-lobby');
  const presenter = page.getByRole('region', { name: 'Live 投影模式' });
  await expect(presenter).toHaveAttribute('data-projector-phase', 'lobby');
  await expect(presenter.locator('.live-projector')).toHaveCSS(
    'display',
    'grid',
  );
  await expect(
    presenter.locator('.live-presenter__viewport-warning'),
  ).toBeHidden();
  const code = page.getByLabel('課堂代碼');
  await expect(code).toHaveText(/^[0-9]{6}$/u);
  await expect(code).toBeVisible();
  await expect(
    page.getByLabel('Live 課堂狀態').getByText('已加入 40 人'),
  ).toBeVisible();
  const bounds = await code.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('LIVE_LOBBY_CODE_BOX_MISSING');
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);

  for (const name of ['開始遊戲', '退出']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error('LIVE_LOBBY_CONTROL_BOX_MISSING');
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await button.focus();
    await expect(button).toBeFocused();
    await button.click({ trial: true });
  }
  await page.getByRole('button', { name: '開始遊戲', exact: true }).click();
  await expect(
    page.getByRole('alertdialog', { name: '立即開始' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '繼續等待', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(
    page.getByRole('alertdialog', { name: '確定退出 Live 課堂？' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '繼續課堂', exact: true }).click();
  await page.evaluate(() =>
    window.dispatchEvent(new Event('colorplay-live-harness-join')),
  );
  await expect(page.getByLabel('新加入同學41已加入')).toBeVisible();
  const geometry = await presenter.evaluate((element) => ({
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    rootWidth: element.scrollWidth,
    rootHeight: element.scrollHeight,
    animations: element.getAnimations({ subtree: true }).length,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(
    geometry.viewportWidth + 1,
  );
  expect(geometry.documentHeight).toBeLessThanOrEqual(
    geometry.viewportHeight + 1,
  );
  expect(geometry.rootWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.rootHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.animations).toBe(0);

  // The exception must not make small-screen question/feedback projection
  // claim usability: its existing warning and hidden projector stay intact.
  await page.goto('/dev-harness/teacher-routes.html?scenario=live-session');
  await expect(presenter).not.toHaveAttribute('data-projector-phase', 'lobby');
  await expect(
    presenter.locator('.live-presenter__viewport-warning'),
  ).toBeVisible();
  await expect(presenter.locator(':scope > .live-projector')).toHaveCount(1);
  await expect(presenter.locator(':scope > .live-projector')).toBeHidden();
  expect(consoleErrors).toBe(0);
  expect(pageErrors).toBe(0);
}
