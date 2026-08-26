import { expect, test, type Page } from '@playwright/test';

const analyticsUrl = '/dev-harness/teacher-routes.html?scenario=analytics';

const observeRuntimeErrors = (page: Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
};

for (const viewport of [
  { height: 720, label: 'desktop', width: 1280 },
  { height: 852, label: 'compact-mobile', width: 320 },
  { height: 852, label: 'mobile', width: 393 },
] as const) {
  test(`teacher analytics home is readable at ${viewport.label}`, async ({
    page,
  }) => {
    const errors = observeRuntimeErrors(page);
    await page.setViewportSize(viewport);
    await page.goto(analyticsUrl);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { level: 1, name: '教學分析' }),
    ).toBeVisible();
    const filterDeck = page.locator('.teacher-analytics-filter-deck');
    if (viewport.width >= 768) {
      await expect(page.getByRole('form', { name: '分析篩選' })).toBeVisible();
    } else {
      await expect(filterDeck).not.toHaveAttribute('open', '');
      await expect(filterDeck.locator('summary')).toContainText('色彩一班');
      await filterDeck.locator('summary').click();
      await expect(page.getByRole('form', { name: '分析篩選' })).toBeVisible();
    }
    await expect(page.getByRole('region', { name: '班級總覽' })).toContainText(
      '3/4',
    );
    await expect(page.getByRole('region', { name: '題目分析' })).toBeVisible();
    await expect(
      page.locator('.teacher-analytics-disclosures details').first(),
    ).toBeVisible();

    const hierarchy = await page.evaluate(() => {
      const question = document
        .querySelector<HTMLElement>('[aria-label="題目分析"]')
        ?.getBoundingClientRect();
      const live = document
        .querySelector<HTMLElement>('[aria-label="Live 課程"]')
        ?.getBoundingClientRect();
      return question && live
        ? {
            liveLeft: live.left,
            liveTop: live.top,
            questionLeft: question.left,
            questionTop: question.top,
            questionWidth: question.width,
            liveWidth: live.width,
          }
        : null;
    });
    expect(hierarchy).not.toBeNull();
    if (viewport.width >= 768) {
      expect(hierarchy?.questionLeft).toBeLessThan(hierarchy?.liveLeft ?? 0);
      expect(hierarchy?.questionWidth).toBeGreaterThan(
        hierarchy?.liveWidth ?? Number.POSITIVE_INFINITY,
      );
    } else {
      expect(hierarchy?.questionTop).toBeLessThan(hierarchy?.liveTop ?? 0);
    }

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      targets: Array.from(
        document.querySelectorAll<HTMLElement>(
          '.teacher-menu a, .teacher-menu button, .teacher-menu__avatar, .teacher-assessment-source-tabs button',
        ),
      )
        .filter((target) => target.offsetParent !== null)
        .map((target) => {
          const rect = target.getBoundingClientRect();
          return { height: rect.height, width: rect.width };
        }),
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(
      geometry.targets.every(
        ({ height, width }) => height >= 44 && width >= 44,
      ),
    ).toBe(true);
    expect(errors.consoleErrors).toEqual([]);
    expect(errors.pageErrors).toEqual([]);
  });
}

test('Live source hides chapter completion and question analysis shows authoritative answers in disclosures', async ({
  page,
}) => {
  await page.setViewportSize({ height: 852, width: 393 });
  await page.goto(analyticsUrl);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Live 課堂' }).click();
  await expect(page.getByText('各章節完成人數')).toHaveCount(0);

  await page.goto('/dev-harness/teacher-routes.html?scenario=questions');
  await page.waitForLoadState('networkidle');
  await expect(
    page.getByRole('heading', { level: 1, name: '題目分析' }),
  ).toBeVisible();
  const disclosure = page
    .locator('.teacher-question-drilldown details')
    .first();
  await expect(disclosure).toHaveAttribute('open', '');
  const button = page.getByRole('button', {
    name: /查看 QB3101 題目內容（手機）/u,
  });
  await expect(button).toBeVisible();
  expect(await button.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('✓ 正確答案').last()).toBeVisible();
  await expect(button).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('question analysis desktop keeps the table and authoritative answer label', async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=questions');
  await expect(
    page.locator('.teacher-question-drilldown details').first(),
  ).toHaveAttribute('open', '');
  const table = page.getByRole('table', {
    name: '3-1 色彩三要素題目分析',
  });
  await expect(table).toBeVisible();
  await table.getByRole('button', { name: '查看 QB3101 題目內容' }).click();
  await expect(table.getByText('✓ 正確答案')).toBeVisible();
});

test('teacher HUD remains fixed while analytics scrolls', async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto(analyticsUrl);
  await page.waitForLoadState('networkidle');
  const before = await page
    .locator('.teacher-menu')
    .evaluate((menu) => menu.getBoundingClientRect().top);
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  const after = await page
    .locator('.teacher-menu')
    .evaluate((menu) => menu.getBoundingClientRect().top);
  expect(before).toBe(0);
  expect(after).toBe(0);
});
