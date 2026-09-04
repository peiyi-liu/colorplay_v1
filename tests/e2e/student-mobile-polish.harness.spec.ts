import { expect, test, type Page } from '@playwright/test';

const MOBILE_VIEWPORT = { height: 852, width: 393 } as const;
const NARROW_VIEWPORTS = [
  MOBILE_VIEWPORT,
  { height: 900, width: 650 },
  { height: 900, width: 700 },
] as const;

const overlap = async (page: Page, first: string, second: string) =>
  page.evaluate(
    ([firstSelector, secondSelector]) => {
      const firstElement = document.querySelector<HTMLElement>(firstSelector);
      const secondElement = document.querySelector<HTMLElement>(secondSelector);
      if (!firstElement || !secondElement)
        throw new Error('LAYOUT_TARGET_MISSING');
      const firstRect = firstElement.getBoundingClientRect();
      const secondRect = secondElement.getBoundingClientRect();
      return !(
        firstRect.right <= secondRect.left ||
        secondRect.right <= firstRect.left ||
        firstRect.bottom <= secondRect.top ||
        secondRect.bottom <= firstRect.top
      );
    },
    [first, second] as const,
  );

for (const viewport of NARROW_VIEWPORTS) {
  for (const surface of ['mistakes', 'leaderboard'] as const) {
    test(`${String(viewport.width)}px ${surface} keeps the back button clear of the title frame`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/dev-harness/student-collection.html?surface=${surface}`,
      );
      await expect(page.locator('.student-route-back')).toBeVisible();
      const header =
        surface === 'mistakes'
          ? '.mistakes-codex > header'
          : '.guild-board > header';
      await expect
        .poll(() => overlap(page, '.student-route-back', header))
        .toBe(false);
    });
  }
}

test('mobile mistakes centers the page count and separates pagination from retry', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto('/dev-harness/student-collection.html?surface=mistakes');
  const pager = page.getByRole('group', { name: /3-1 .* 錯題分頁/u });
  const retry = page.getByRole('button', { name: '再挑戰（補救練習）' });
  await expect(pager).toBeVisible();
  await expect(retry).toBeVisible();

  const metrics = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>(
      '.mistake-group .game-pager__nav',
    );
    const status = document.querySelector<HTMLElement>(
      '.mistake-group .game-pager__status',
    );
    const previous = document.querySelector<HTMLElement>(
      '.mistake-group [aria-label="上一頁"]',
    );
    const next = document.querySelector<HTMLElement>(
      '.mistake-group [aria-label="下一頁"]',
    );
    const action = document.querySelector<HTMLElement>(
      '.mistake-group__actions',
    );
    if (!nav || !status || !previous || !next || !action) {
      throw new Error('MISTAKE_PAGER_TARGET_MISSING');
    }
    const navRect = nav.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    const previousRect = previous.getBoundingClientRect();
    const nextRect = next.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    return {
      centerError: Math.abs(
        statusRect.left +
          statusRect.width / 2 -
          (previousRect.right + nextRect.left) / 2,
      ),
      verticalGap: actionRect.top - navRect.bottom,
    };
  });
  expect(metrics.centerError).toBeLessThanOrEqual(1);
  expect(metrics.verticalGap).toBeGreaterThanOrEqual(16);
});

for (const viewport of NARROW_VIEWPORTS) {
  test(`${String(viewport.width)}px shop keeps the back button clear of the title frame`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/shop.html');
    await expect(page.locator('.student-route-back')).toBeVisible();
    await expect
      .poll(() => overlap(page, '.student-route-back', '.blook-shop__header'))
      .toBe(false);
  });
}

test('mobile learning lobby stays locked to the viewport', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto('/dev-harness/learning-map.html');
  await expect(page.getByRole('heading', { name: '學習地圖' })).toBeVisible();
  await page.mouse.wheel(0, 600);
  const scroll = await page.evaluate(() => ({
    body: document.body.scrollTop,
    document: document.documentElement.scrollTop,
    main: document.querySelector<HTMLElement>('#main-content')?.scrollTop ?? -1,
    window: window.scrollY,
  }));
  expect(scroll).toEqual({ body: 0, document: 0, main: 0, window: 0 });
});

test('landscape learning lobby exposes a vertical escape hatch at short heights', async ({
  page,
}) => {
  await page.setViewportSize({ height: 393, width: 852 });
  await page.goto('/dev-harness/learning-map.html');
  const main = page.locator('#main-content');
  await expect(page.getByRole('heading', { name: '學習地圖' })).toBeVisible();
  await expect
    .poll(() =>
      main.evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true);
  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => main.evaluate((element) => element.scrollTop > 0))
    .toBe(true);
});

for (const viewport of [
  { height: 480, width: 1280 },
  { height: 500, width: 393 },
] as const) {
  test(`${String(viewport.width)}px short quiz and result keep their bottom controls reachable`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const { action, route } of [
      {
        action: '.question-card__action button',
        route: '/dev-harness/quiz-session.html?scenario=idle',
      },
      {
        action: '.quiz-result__actions a',
        route: '/dev-harness/quiz-result.html?scenario=section',
      },
    ]) {
      await page.goto(route);
      const main = page.locator('#main-content');
      await expect
        .poll(() =>
          main.evaluate(
            (element) =>
              element.scrollHeight > element.clientHeight ||
              document.documentElement.scrollHeight > window.innerHeight,
          ),
        )
        .toBe(true);
      const lastAction = page.locator(action).last();
      await lastAction.scrollIntoViewIfNeeded();
      await expect(lastAction).toBeVisible();
    }
  });
}

test('mobile completed review status is readable and page turn uses one page', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await page.goto('/dev-harness/chapter-detail.html?scenario=in-progress');
  const completedCard = page.getByRole('button', {
    name: '選擇複習卡：色彩的分類',
  });
  await completedCard.click();
  await expect(completedCard).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '進入複習' }).click();
  const status = page.locator('.review-card__status', {
    hasText: '已完成複習',
  });
  await expect(status).toBeVisible();
  const statusStyle = await status.evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundImage: style.backgroundImage, color: style.color };
  });
  expect(statusStyle.backgroundImage).not.toBe('none');
  expect(statusStyle.color).toBe('rgb(255, 255, 255)');

  await page.getByRole('button', { name: '返回複習卡選擇' }).click();
  await page.getByRole('button', { name: '選擇複習卡：色彩三要素' }).click();
  await page.getByRole('button', { name: '進入複習' }).click();

  const next = page.getByRole('button', { name: '閱讀下一頁' });
  await next.click();
  const turnRatio = await page
    .locator('.chapter-review-reader__viewport')
    .evaluate((element) => {
      const width = element.getBoundingClientRect().width;
      const turnWidth = Number.parseFloat(
        getComputedStyle(element, '::after').width,
      );
      return turnWidth / width;
    });
  expect(turnRatio).toBeGreaterThanOrEqual(0.9);
  expect(turnRatio).toBeLessThanOrEqual(1.01);
});
