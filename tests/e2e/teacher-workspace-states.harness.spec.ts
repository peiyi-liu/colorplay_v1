import { expect, test } from '@playwright/test';

for (const width of [320, 375, 393] as const) {
  test(`teacher menu alerts do not overlap at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: 852, width });
    await page.goto('/dev-harness/teacher-routes.html?scenario=menu-errors');
    await page.waitForLoadState('networkidle');

    const avatarError = page.getByText('頭像上傳失敗。', { exact: true });
    const signOutError = page.getByText('登出失敗，請稍後重試。', {
      exact: true,
    });
    await expect(avatarError).toBeVisible();
    await expect(signOutError).toBeVisible();

    const bounds = await page.evaluate(() => {
      const alerts = Array.from(
        document.querySelectorAll<HTMLElement>('.teacher-menu [role="alert"]'),
      );
      const avatar = alerts[0]?.getBoundingClientRect();
      const signOut = alerts[1]?.getBoundingClientRect();
      if (!avatar || !signOut) throw new Error('missing teacher menu alerts');
      return {
        avatar: {
          bottom: avatar.bottom,
          left: avatar.left,
          right: avatar.right,
          top: avatar.top,
        },
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        signOut: {
          bottom: signOut.bottom,
          left: signOut.left,
          right: signOut.right,
          top: signOut.top,
        },
      };
    });
    const horizontalOverlap =
      bounds.avatar.left < bounds.signOut.right &&
      bounds.avatar.right > bounds.signOut.left;
    const verticalOverlap =
      bounds.avatar.top < bounds.signOut.bottom &&
      bounds.avatar.bottom > bounds.signOut.top;

    expect(horizontalOverlap && verticalOverlap).toBe(false);
    expect(bounds.avatar.top).toBeGreaterThanOrEqual(72);
    expect(bounds.signOut.bottom).toBeLessThanOrEqual(852 - 72);
    expect(bounds.documentScrollWidth).toBeLessThanOrEqual(
      bounds.documentClientWidth,
    );
  });
}
