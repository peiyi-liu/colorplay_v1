import { expect, test, type Page } from '@playwright/test';

const rectanglesOverlap = (
  left: { bottom: number; left: number; right: number; top: number },
  right: { bottom: number; left: number; right: number; top: number },
) =>
  left.left < right.right &&
  left.right > right.left &&
  left.top < right.bottom &&
  left.bottom > right.top;

const expectClassroomCardFits = async (page: Page) => {
  const card = page.locator('.classroom-card').first();
  await expect(card).toBeVisible();
  const geometry = await card.evaluate((element) => {
    const selectors = [
      '.classroom-card__code-value',
      '.classroom-card__copy',
      '.classroom-card__meta',
      '.classroom-card__manage',
      '.classroom-card__analytics',
    ];
    const cardBounds = element.getBoundingClientRect();
    return {
      card: {
        bottom: cardBounds.bottom,
        left: cardBounds.left,
        right: cardBounds.right,
        top: cardBounds.top,
      },
      children: selectors.map((selector) => {
        const child = element.querySelector<HTMLElement>(selector);
        if (!child) throw new Error(`missing classroom card child ${selector}`);
        const bounds = child.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        };
      }),
    };
  });

  for (const child of geometry.children) {
    expect(child.left).toBeGreaterThanOrEqual(geometry.card.left - 1);
    expect(child.right).toBeLessThanOrEqual(geometry.card.right + 1);
    expect(child.top).toBeGreaterThanOrEqual(geometry.card.top - 1);
    expect(child.bottom).toBeLessThanOrEqual(geometry.card.bottom + 1);
  }
  for (
    let leftIndex = 0;
    leftIndex < geometry.children.length;
    leftIndex += 1
  ) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < geometry.children.length;
      rightIndex += 1
    ) {
      const left = geometry.children[leftIndex];
      const right = geometry.children[rightIndex];
      if (left && right) expect(rectanglesOverlap(left, right)).toBe(false);
    }
  }
};

const contrastRatio = (foreground: string, background: string) => {
  const parse = (value: string) => {
    const channels = value
      .match(/[\d.]+/gu)
      ?.slice(0, 3)
      .map(Number);
    if (channels?.length !== 3) throw new Error(`invalid color ${value}`);
    return channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = (value: string) => {
    const [red = 0, green = 0, blue = 0] = parse(value);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

test('Live create marks Live 課堂 as the active teacher destination', async ({
  page,
}) => {
  await page.goto('/dev-harness/teacher-routes.html?scenario=live');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('link', { name: 'Live 課堂' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    page.getByRole('link', { name: '教學分析' }),
  ).not.toHaveAttribute('aria-current', 'page');
});

test('Live section choices are separated responsive cards', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=live');
  const list = page.locator('.teacher-live-create__section-list');
  const choices = list.locator('label');
  await expect(choices).toHaveCount(1);
  const desktop = await list.evaluate((element) => {
    const choice = element.querySelector('label');
    const fieldset = element.parentElement;
    const title = fieldset?.querySelector('.teacher-live-create__step-title');
    if (!choice) throw new Error('missing section choice');
    return {
      borderWidth: Number.parseFloat(getComputedStyle(choice).borderTopWidth),
      columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
      gap: Number.parseFloat(getComputedStyle(element).gap),
      titleGap:
        element.getBoundingClientRect().top -
        (title?.getBoundingClientRect().bottom ?? 0),
      titleTopGap:
        (title?.getBoundingClientRect().top ?? 0) -
        (fieldset?.getBoundingClientRect().top ?? 0),
    };
  });
  expect(desktop.borderWidth).toBeGreaterThan(0);
  expect(desktop.columns).toBe(2);
  expect(desktop.gap).toBeGreaterThanOrEqual(10);
  expect(desktop.titleGap).toBeGreaterThanOrEqual(12);
  expect(desktop.titleTopGap).toBeGreaterThanOrEqual(18);

  await page.setViewportSize({ height: 852, width: 393 });
  expect(
    await list.evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length,
    ),
  ).toBe(1);
});

test('long classroom names do not wrap the active status chip', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1366 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=classes');
  const summary = page.locator('.classroom-card summary').first();
  const status = summary.locator('.ui-chip');
  await expect(status).toHaveText('有效');
  const geometry = await status.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const summaryBounds = element.parentElement?.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      insideSummary:
        summaryBounds !== undefined && bounds.right <= summaryBounds.right + 1,
      lineCount: range.getClientRects().length,
      whiteSpace: getComputedStyle(element).whiteSpace,
    };
  });
  expect(geometry.insideSummary).toBe(true);
  expect(geometry.lineCount).toBe(1);
  expect(geometry.whiteSpace).toBe('nowrap');
});

for (const width of [1024, 1280, 1366, 1440] as const) {
  test(`desktop classroom card content fits without overlap at ${String(width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width });
    await page.goto('/dev-harness/teacher-routes.html?scenario=classes');
    await expectClassroomCardFits(page);
    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
}

for (const scenario of ['classroom-detail', 'student-progress'] as const) {
  test(`${scenario} table text has readable contrast`, async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1280 });
    await page.goto(`/dev-harness/teacher-routes.html?scenario=${scenario}`);
    const firstCell = page
      .locator('.teacher-classroom-panel .ui-table tbody td')
      .first();
    await expect(firstCell).toBeVisible();
    const colors = await firstCell.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
    }));
    expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(
      contrastRatio(colors.color, colors.background),
    ).toBeGreaterThanOrEqual(4.5);
  });
}

test('Live report table text has readable contrast', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=live-report');
  const firstCell = page
    .getByRole('table', { name: '個人逐題作答' })
    .locator('tbody td')
    .first();
  await expect(firstCell).toBeVisible();
  const colors = await firstCell.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
  }));
  expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(contrastRatio(colors.color, colors.background)).toBeGreaterThanOrEqual(
    4.5,
  );
});

test('existing teacher avatar opens a modal view and replacement flow', async ({
  page,
}) => {
  await page.setViewportSize({ height: 852, width: 393 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=menu-avatar');
  const manageAvatar = page.getByRole('button', {
    name: '管理林老師的教師頭像',
  });
  await manageAvatar.click();

  const dialog = page.getByRole('dialog', { name: '教師頭像' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: '關閉' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '查看圖像' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '上傳圖像' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: '查看圖像' })).toBeFocused();
  expect(
    await page
      .locator('.teacher-menu__navigation')
      .evaluate((element) => element.matches(':focus-within')),
  ).toBe(false);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(manageAvatar).toBeFocused();

  await manageAvatar.click();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '上傳圖像' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    buffer: Buffer.from('replacement'),
    mimeType: 'image/webp',
    name: 'replacement.webp',
  });
  await expect(dialog).toBeHidden();
  await expect(manageAvatar).toBeFocused();
});
