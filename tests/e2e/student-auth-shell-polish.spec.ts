import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

for (const viewport of [
  { height: 720, width: 1280 },
  { height: 852, width: 393 },
] as const) {
  test(`teacher login and student menu stay usable at ${String(viewport.width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/login');
    await page.getByText('教師端登入').click();

    await expect(page.getByLabel('班級序號')).toHaveCount(0);
    await expect(page.getByText(/班級序號/u)).toHaveCount(0);
    const loginAction = page.locator('.login-form__submit--pixel');
    await expect(loginAction).toBeVisible();
    expect(
      await loginAction.evaluate(
        (element) => getComputedStyle(element).fontFamily,
      ),
    ).toContain('Cubic 11');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);

    await page.goto('/dev-harness/student-hud.html');
    await page.getByRole('button', { name: 'MENU' }).click();
    const menu = page.getByRole('navigation', { name: '更多導覽' });
    await expect(menu.getByRole('link', { name: '課後任務實戰' })).toHaveCount(
      0,
    );
    await expect(menu.getByRole('link', { name: '我的錯題' })).toBeVisible();
    const logout = page.getByRole('button', { name: '登出' });
    expect(
      await logout.evaluate((element) => getComputedStyle(element).fontFamily),
    ).toContain('Cubic 11');
  });
}
