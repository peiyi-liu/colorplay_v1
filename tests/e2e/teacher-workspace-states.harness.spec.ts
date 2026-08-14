import { expect, test } from '@playwright/test';

import { observeRuntimeErrors } from './teacher-routes.harness-support';

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

for (const width of [1024, 1280] as const) {
  test(`owner visual: desktop classroom actions remain single-line at ${String(width)}px`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ height: 900, width });
    await page.goto('/dev-harness/teacher-routes.html?scenario=classes');
    await page.waitForLoadState('networkidle');

    const code = page.locator('.classroom-card__code-value').first();
    const codeBox = await code.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        overflowWrap: style.overflowWrap,
        whiteSpace: style.whiteSpace,
        width: bounds.width,
      };
    });
    expect(codeBox.whiteSpace).toBe('nowrap');
    expect(codeBox.overflowWrap).not.toBe('anywhere');
    expect(codeBox.height).toBeLessThanOrEqual(28);
    expect(codeBox.width).toBeGreaterThan(150);
    await expect(
      page.getByRole('button', { name: /複製 .* 的班級序號/u }).first(),
    ).toBeVisible();

    const actions = page.locator('.classroom-card__actions').first();
    for (const name of ['進入班級', '教學分析']) {
      const action = actions.getByRole('link', { name });
      const geometry = await action.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        return {
          height: bounds.height,
          lineRects: Array.from(range.getClientRects(), (rect) => ({
            height: rect.height,
            width: rect.width,
          })),
          whiteSpace: getComputedStyle(element).whiteSpace,
          width: bounds.width,
        };
      });
      expect(geometry.whiteSpace).toBe('nowrap');
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.height).toBeLessThanOrEqual(48);
      expect(geometry.lineRects).toHaveLength(1);
    }
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(runtimeErrors).toEqual({ consoleErrors: [], pageErrors: [] });
  });
}

for (const width of [393, 1280] as const) {
  test(`owner visual: question chapters expose their first section at ${String(width)}px`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ height: width === 393 ? 852 : 900, width });
    await page.goto('/dev-harness/teacher-routes.html?scenario=questions');
    await page.waitForLoadState('networkidle');

    const chapterState = await page
      .locator('.teacher-question-drilldown > section')
      .evaluateAll((chapters) =>
        chapters.map((chapter) => ({
          firstOpen:
            chapter
              .querySelector(':scope > details:first-of-type')
              ?.hasAttribute('open') ?? false,
          openCount: chapter.querySelectorAll(':scope > details[open]').length,
        })),
      );
    expect(chapterState.length).toBeGreaterThan(0);
    expect(chapterState.every((chapter) => chapter.firstOpen)).toBe(true);
    expect(chapterState.every((chapter) => chapter.openCount >= 1)).toBe(true);
    expect(runtimeErrors).toEqual({ consoleErrors: [], pageErrors: [] });
  });
}

for (const scenario of ['classroom-detail', 'student-progress'] as const) {
  test(`owner visual: mobile ${scenario} disclosure has a directional chevron`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    await page.setViewportSize({ height: 852, width: 393 });
    await page.goto(`/dev-harness/teacher-routes.html?scenario=${scenario}`);
    await page.waitForLoadState('networkidle');

    const disclosure = page
      .getByTestId(
        scenario === 'classroom-detail'
          ? 'member-disclosure'
          : 'chapter-disclosure',
      )
      .first();
    const summary = disclosure.locator('summary');
    const chevron = disclosure.getByTestId(
      scenario === 'classroom-detail'
        ? 'member-disclosure-chevron'
        : 'chapter-disclosure-chevron',
    );
    await expect(summary).toHaveAttribute('aria-expanded', 'false');
    const closed = await chevron.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        transform: getComputedStyle(element).transform,
        width: bounds.width,
      };
    });
    expect(closed.width).toBeGreaterThan(0);
    expect(closed.height).toBeGreaterThan(0);
    expect(
      await summary.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBeGreaterThanOrEqual(44);

    await summary.click();
    await expect(summary).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(() =>
        chevron.evaluate((element) => getComputedStyle(element).transform),
      )
      .not.toBe(closed.transform);
    expect(runtimeErrors).toEqual({ consoleErrors: [], pageErrors: [] });
  });
}
