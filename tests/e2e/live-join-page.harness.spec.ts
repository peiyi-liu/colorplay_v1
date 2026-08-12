import { expect, test } from '@playwright/test';

const viewports = [
  { asset: 'live-join-portal-desktop-v1', height: 720, width: 1280 },
  { asset: 'live-join-portal-mobile-v1', height: 852, width: 393 },
  { asset: 'live-join-portal-mobile-v1', height: 568, width: 320 },
] as const;

for (const viewport of viewports) {
  test(`student Live join remains contained at ${String(viewport.width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/live-join.html');

    const scene = page.locator('.live-join--portal');
    const form = page.locator('.live-join__form');
    const input = page.getByLabel('輸入 6 位加入代碼');
    await expect(
      page.getByRole('heading', { name: '加入 Live 課堂' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: '返回前一頁' }),
    ).toBeVisible();
    await expect(scene).toBeVisible();

    const metrics = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>('#main-content');
      const scene = document.querySelector<HTMLElement>('.live-join--portal');
      const form = document.querySelector<HTMLElement>('.live-join__form');
      const hud = document.querySelector<HTMLElement>('.hud-top--student');
      if (!main || !scene || !form || !hud) {
        throw new Error('LIVE_JOIN_HARNESS_ELEMENT_MISSING');
      }
      const formBox = form.getBoundingClientRect();
      const sceneBox = scene.getBoundingClientRect();
      return {
        backgroundImage: getComputedStyle(scene).backgroundImage,
        backgroundPosition: getComputedStyle(scene).backgroundPosition,
        backgroundSize: getComputedStyle(scene).backgroundSize,
        formLeft: formBox.left,
        formRight: formBox.right,
        mainClientWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        sceneLeft: sceneBox.left,
        sceneRight: sceneBox.right,
        sceneTop: sceneBox.top,
        hudBottom: hud.getBoundingClientRect().bottom,
      };
    });
    expect(metrics.backgroundImage).toContain(viewport.asset);
    if (viewport.width < 768) {
      expect(metrics.backgroundPosition).toBe('50% 0%, 50% 0%');
      // CSSOM serializes `100% auto` as the equivalent single-value `100%`.
      expect(metrics.backgroundSize).toBe('100% 100%, 100%');
    }
    expect(Math.abs(metrics.sceneTop - metrics.hudBottom)).toBeLessThanOrEqual(
      1,
    );
    expect(metrics.sceneLeft).toBeLessThanOrEqual(1);
    expect(metrics.sceneRight).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(metrics.formLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.formRight).toBeLessThanOrEqual(viewport.width);
    expect(metrics.mainScrollWidth).toBeLessThanOrEqual(
      metrics.mainClientWidth,
    );

    await input.fill('012345');
    await expect(input).toHaveValue('012345');
    await expect(page.locator('.live-join__digit')).toHaveText([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    await form
      .getByRole('button', { name: '加入課堂' })
      .scrollIntoViewIfNeeded();
    await expect(form.getByRole('button', { name: '加入課堂' })).toBeVisible();
  });
}

test('student Live join displays the safe repository error', async ({
  page,
}) => {
  await page.setViewportSize({ height: 852, width: 393 });
  await page.goto('/dev-harness/live-join.html');

  await page.getByLabel('輸入 6 位加入代碼').fill('123456');
  await page.getByRole('button', { name: '加入課堂' }).click();

  await expect(
    page.getByRole('alert').filter({
      hasText: '代碼無效或課堂尚未開放，請向老師確認。',
    }),
  ).toBeVisible();
});
