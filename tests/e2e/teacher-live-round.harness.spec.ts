import { expect, test, type Page } from '@playwright/test';

const observeRuntimeErrors = (page: Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
};

const expectPresenterOwnsViewport = async (page: Page) => {
  const geometry = await page.locator('.live-presenter').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      left: bounds.left,
      position: getComputedStyle(element).position,
      right: bounds.right,
      top: bounds.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  expect(geometry.position).toBe('fixed');
  expect(geometry.left).toBeCloseTo(0, 0);
  expect(geometry.top).toBeCloseTo(0, 0);
  expect(geometry.right).toBeCloseTo(geometry.viewportWidth, 0);
  expect(geometry.bottom).toBeCloseTo(geometry.viewportHeight, 0);
};

test('Live round follows question, statistics, explanation, ranking, and next-question order', async ({
  page,
}) => {
  const runtimeErrors = observeRuntimeErrors(page);
  const testTime = new Date('2026-08-13T00:00:00.000Z');
  await page.clock.install({ time: testTime });
  await page.clock.pauseAt(testTime);
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=live-round');
  await page.waitForLoadState('networkidle');

  await expect(
    page.getByRole('region', { name: 'Live 投影模式' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: '色光的三原色是以下哪三種顏色？',
    }),
  ).toBeVisible();
  await expect(page.getByText('作答倒數環')).toBeVisible();
  await expect(page.getByRole('timer', { name: '剩餘秒數' })).toBeVisible();
  await expect(page.getByRole('button', { name: '下一題' })).toBeDisabled();
  await expect(page.getByRole('button')).toHaveCount(5);
  await expect(page.locator('.teacher-menu')).toHaveCount(0);
  await expect(page.locator('.hud-command')).toHaveCount(0);
  await expectPresenterOwnsViewport(page);

  await page.getByRole('button', { name: '暫停時間' }).click();
  await expect(page.getByText('作答時間已暫停')).toBeVisible();
  await expect(page.getByRole('button', { name: '繼續作答' })).toBeVisible();
  await expectPresenterOwnsViewport(page);
  await page.getByRole('button', { name: '繼續作答' }).click();
  await expectPresenterOwnsViewport(page);

  await page.getByRole('button', { name: '結束作答' }).click();
  await expect(page.getByRole('heading', { name: '作答統計' })).toBeVisible();
  await expect(page.getByText('逾時／未選擇')).toBeVisible();
  await expect(page.getByText('18 人／45%')).toBeVisible();
  await expectPresenterOwnsViewport(page);
  const answerEmphasis = await page.evaluate(
    ({ correct, incorrect }) => {
      const correctElement = document.querySelector<HTMLElement>(correct);
      const incorrectElement = document.querySelector<HTMLElement>(incorrect);
      if (!correctElement || !incorrectElement) {
        throw new Error('missing answer distribution rows');
      }
      const correctBounds = correctElement.getBoundingClientRect();
      const incorrectBounds = incorrectElement.getBoundingClientRect();
      return {
        borderColor: getComputedStyle(correctElement).borderColor,
        correctHeight: correctBounds.height,
        incorrectHeight: incorrectBounds.height,
      };
    },
    {
      correct: '[aria-label="正確答案：A. 紅、綠、藍"]',
      incorrect: '[aria-label="B. 紅、黃、藍"]',
    },
  );
  expect(answerEmphasis.borderColor).toBe('rgb(255, 193, 57)');
  expect(answerEmphasis.correctHeight).toBeGreaterThan(
    answerEmphasis.incorrectHeight,
  );
  await expect(page.getByRole('button', { name: '下一題' })).toBeDisabled();

  await page.clock.fastForward(4_999);
  await expect(page.getByRole('heading', { name: '作答統計' })).toBeVisible();
  await page.clock.fastForward(1);
  await expect(page.getByRole('heading', { name: '本題解析' })).toBeVisible();
  await expectPresenterOwnsViewport(page);
  await expect(
    page.getByText(/加法混色以紅光、綠光、藍光為三原色/u),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '下一題' })).toBeDisabled();

  await page.getByRole('button', { name: '即時排名' }).click();
  await expect(page.getByRole('heading', { name: '即時排名' })).toBeVisible();
  await expect(page.getByText('晨星')).toBeVisible();
  await expect(page.getByText('880 分')).toBeVisible();
  await expectPresenterOwnsViewport(page);
  const podiumGeometry = await page
    .getByRole('list', { name: '即時排名前三名' })
    .locator('li')
    .evaluateAll((entries) =>
      entries.map((entry) => {
        const bounds = entry.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          height: bounds.height,
          rank: entry.getAttribute('data-rank'),
          x: bounds.x,
          y: bounds.y,
        };
      }),
    );
  const first = podiumGeometry.find(({ rank }) => rank === '1');
  const second = podiumGeometry.find(({ rank }) => rank === '2');
  const third = podiumGeometry.find(({ rank }) => rank === '3');
  if (!first || !second || !third) throw new Error('missing podium ranks');
  expect(second.x).toBeLessThan(first.x);
  expect(first.x).toBeLessThan(third.x);
  expect(first.height).toBeGreaterThan(second.height);
  expect(second.height).toBeGreaterThan(third.height);
  expect(first.y).toBeLessThan(second.y);
  expect(second.y).toBeLessThan(third.y);
  expect(Math.abs(first.bottom - second.bottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.bottom - third.bottom)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: '下一題' })).toBeEnabled();

  await page.getByRole('button', { name: '下一題' }).click();
  await expect(page.getByText('第 2 / 10 題').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '下一題' })).toBeDisabled();
  await expectPresenterOwnsViewport(page);
  expect(runtimeErrors.consoleErrors).toEqual([]);
  expect(runtimeErrors.pageErrors).toEqual([]);
});

test('Live final podium owns the whole projector viewport', async ({
  page,
}) => {
  await page.setViewportSize({ height: 768, width: 1366 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=live-podium');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: '最終頒獎台' })).toBeVisible();
  await expectPresenterOwnsViewport(page);
});

for (const viewport of [
  { height: 768, width: 1024 },
  { height: 720, width: 1280 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
] as const) {
  test(`Live round feedback fits the projector at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    const runtimeErrors = observeRuntimeErrors(page);
    const testTime = new Date('2026-08-13T00:00:00.000Z');
    await page.clock.install({ time: testTime });
    await page.clock.pauseAt(testTime);
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/teacher-routes.html?scenario=live-round');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: '結束作答' }).click();
    await page.clock.fastForward(5_000);
    await expect(page.getByRole('heading', { name: '本題解析' })).toBeVisible();

    const scrollGeometry = await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('.live-round__scroll');
      const button = document.querySelector<HTMLElement>(
        '.live-round__ranking-button',
      );
      if (!scroll || !button) throw new Error('missing explanation scroll');
      const scrollBounds = scroll.getBoundingClientRect();
      const buttonBounds = button.getBoundingClientRect();
      return {
        buttonBottomInsetRatio:
          (scrollBounds.bottom - buttonBounds.bottom) / scrollBounds.height,
        buttonInsidePaper:
          buttonBounds.left >= scrollBounds.left + scrollBounds.width * 0.1 &&
          buttonBounds.right <= scrollBounds.right - scrollBounds.width * 0.1 &&
          buttonBounds.top >= scrollBounds.top + scrollBounds.height * 0.1 &&
          buttonBounds.bottom <=
            scrollBounds.bottom - scrollBounds.height * 0.1,
        imageRendering: getComputedStyle(scroll).imageRendering,
        scrollHeight: scrollBounds.height,
      };
    });
    expect(scrollGeometry.buttonInsidePaper).toBe(true);
    expect(scrollGeometry.buttonBottomInsetRatio).toBeGreaterThanOrEqual(0.15);
    expect(scrollGeometry.imageRendering).toBe('pixelated');
    expect(scrollGeometry.scrollHeight).toBeGreaterThanOrEqual(540);

    const explanationGeometry = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.live-presenter');
      const controls = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          '.live-round__controls button, .live-round__ranking-button',
        ),
      ).map((control) => {
        const bounds = control.getBoundingClientRect();
        return { height: bounds.height, width: bounds.width };
      });
      if (!root) throw new Error('missing Live projector');
      return {
        controls,
        documentHeight: document.documentElement.scrollHeight,
        documentWidth: document.documentElement.scrollWidth,
        rootHeight: root.scrollHeight,
        rootWidth: root.scrollWidth,
        viewportHeight: document.documentElement.clientHeight,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(explanationGeometry.documentWidth).toBeLessThanOrEqual(
      explanationGeometry.viewportWidth,
    );
    expect(explanationGeometry.documentHeight).toBeLessThanOrEqual(
      explanationGeometry.viewportHeight,
    );
    expect(explanationGeometry.rootWidth).toBeLessThanOrEqual(
      explanationGeometry.viewportWidth,
    );
    expect(explanationGeometry.rootHeight).toBeLessThanOrEqual(
      explanationGeometry.viewportHeight,
    );
    expect(
      explanationGeometry.controls.every(
        ({ height, width }) => height >= 44 && width >= 44,
      ),
    ).toBe(true);

    await page.getByRole('button', { name: '即時排名' }).click();
    await expect(page.getByRole('heading', { name: '即時排名' })).toBeVisible();
    const rankingFits = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.live-round__stage');
      if (!stage) throw new Error('missing Live round stage');
      return {
        clientHeight: stage.clientHeight,
        clientWidth: stage.clientWidth,
        scrollHeight: stage.scrollHeight,
        scrollWidth: stage.scrollWidth,
      };
    });
    expect(rankingFits.scrollWidth).toBeLessThanOrEqual(
      rankingFits.clientWidth,
    );
    expect(rankingFits.scrollHeight).toBeLessThanOrEqual(
      rankingFits.clientHeight,
    );
    expect(runtimeErrors.consoleErrors).toEqual([]);
    expect(runtimeErrors.pageErrors).toEqual([]);
  });
}

test('Live round keeps its countdown legible with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto('/dev-harness/teacher-routes.html?scenario=live-round');
  await page.waitForLoadState('networkidle');

  const countdown = page.locator('.live-round__timer-fill');
  await expect(page.getByRole('timer', { name: '剩餘秒數' })).toBeVisible();
  expect(
    await countdown.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toBe('0s');
});
