import { expect, test } from '@playwright/test';

for (const viewport of [
  { height: 720, width: 1280 },
  { height: 852, width: 393 },
  { height: 568, width: 320 },
] as const) {
  test(`shop keeps the market and product grid contained at ${String(viewport.width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/shop.html');

    await expect(page.getByRole('heading', { name: '裝備商店' })).toBeVisible();
    await expect(page.getByRole('button', { name: '角色' })).toBeVisible();
    await expect(page.getByRole('button', { name: '外框' })).toBeVisible();
    await expect(page.getByLabel('250 Token 可用')).toBeVisible();
    await expect(
      page.getByLabel('250 Token 可用').locator('.hud-coin-pixel--32bit'),
    ).toBeVisible();

    const metrics = await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>('#main-content');
      const shop = document.querySelector<HTMLElement>('.shop-market-v2');
      if (!main || !shop) throw new Error('SHOP_HARNESS_ELEMENT_MISSING');
      const shopBox = shop.getBoundingClientRect();
      return {
        backgroundImage: getComputedStyle(main).backgroundImage,
        mainClientWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        shopLeft: shopBox.left,
        shopRight: shopBox.right,
      };
    });

    expect(metrics.backgroundImage).toContain('shop-market-night-v1');
    expect(metrics.mainScrollWidth).toBeLessThanOrEqual(
      metrics.mainClientWidth,
    );
    expect(metrics.shopLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.shopRight).toBeLessThanOrEqual(viewport.width);

    await page.getByRole('button', { name: '外框' }).click();
    await expect(page.getByRole('heading', { name: '深海霓虹' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: '購買 深海霓虹，25 Token' }),
    ).toContainText('25');
    await expect(
      page
        .getByRole('button', { name: '購買 深海霓虹，25 Token' })
        .locator('.hud-coin-pixel--32bit'),
    ).toBeVisible();
  });
}
