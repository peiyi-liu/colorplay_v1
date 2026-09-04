import { expect, test } from '@playwright/test';

const PAGE = '/dev-harness/live-session.html?scenario=question';

test('student Live choice locks immediately and waits for reveal', async ({
  page,
}) => {
  await page.goto(PAGE);

  await expect(page.getByRole('heading', { name: '課堂挑戰' })).toBeVisible();
  await expect(page.getByText('請看投影幕作答')).toBeVisible();
  await expect(page.getByText('第 3 / 20 題')).toBeVisible();
  await expect(page.getByText('連線正常')).toBeVisible();
  await expect(page.getByText('24 人在線')).toBeVisible();
  await expect(page.getByRole('timer', { name: '剩餘秒數' })).toBeVisible();

  const choices = page
    .getByRole('group', { name: '答案選項' })
    .getByRole('button');
  await expect(choices).toHaveCount(4);
  await choices.nth(2).click();
  const waitingReveal = page.getByText('答案已送出，等待揭曉…');
  await expect(waitingReveal).toBeVisible();
  await expect(waitingReveal).toBeInViewport();
  await expect(choices.nth(2)).toHaveAccessibleName(/已選擇/u);
  for (let index = 0; index < 4; index += 1) {
    await expect(choices.nth(index)).toBeDisabled();
  }
});

for (const viewport of [
  { width: 393, height: 852 },
  { width: 320, height: 568 },
]) {
  test(`student Live fits ${String(viewport.width)}px without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(PAGE);
    await expect(page.getByText('請看投影幕作答')).toBeVisible();
    const choices = page
      .getByRole('group', { name: '答案選項' })
      .getByRole('button');
    await expect(choices).toHaveCount(4);
    const boxes = await choices.evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
    expect(Math.abs((boxes[0]?.y ?? 0) - (boxes[1]?.y ?? 1))).toBeLessThan(1);
    expect(Math.abs((boxes[2]?.y ?? 0) - (boxes[3]?.y ?? 1))).toBeLessThan(1);
    expect(Math.abs((boxes[0]?.x ?? 0) - (boxes[2]?.x ?? 1))).toBeLessThan(1);
    expect(Math.abs((boxes[1]?.x ?? 0) - (boxes[3]?.x ?? 1))).toBeLessThan(1);
    expect(boxes[1]?.x ?? 0).toBeGreaterThan(
      (boxes[0]?.x ?? 0) + (boxes[0]?.width ?? 0),
    );
    const optionRegion = await page
      .getByRole('group', { name: '答案選項' })
      .boundingBox();
    expect(optionRegion).not.toBeNull();
    if (!optionRegion) return;
    expect(optionRegion.y).toBeLessThanOrEqual(viewport.height * 0.58);
    expect(optionRegion.y + optionRegion.height).toBeGreaterThanOrEqual(
      viewport.height * 0.93,
    );
    expect(boxes[0]?.height ?? 0).toBeGreaterThanOrEqual(100);
    const optionGlyphSize = await choices
      .nth(0)
      .locator(':scope > span')
      .first()
      .evaluate((glyph) => Number.parseFloat(getComputedStyle(glyph).fontSize));
    const optionKeySize = await choices
      .nth(0)
      .locator('.live-option-key')
      .evaluate((key) => Number.parseFloat(getComputedStyle(key).fontSize));
    expect(optionGlyphSize).toBeGreaterThanOrEqual(30);
    expect(optionKeySize).toBeGreaterThanOrEqual(30);
    const background = await page
      .locator('.live-student-arena')
      .evaluate((arena) => {
        const style = getComputedStyle(arena);
        return {
          image: style.backgroundImage,
          position: style.backgroundPosition,
          size: style.backgroundSize,
        };
      });
    expect(background.image).toContain('live-student-arena-desktop-v1.webp');
    expect(background.image).not.toContain('live-student-arena-mobile-v1.webp');
    expect(background.position).toContain('50% 72%');
    expect(background.size).toContain('auto 120%');
    const overflow = await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
}

test('waiting room shows host wait state without a countdown', async ({
  page,
}) => {
  await page.goto('/dev-harness/live-session.html?scenario=lobby');
  await expect(page.getByText('等待主持人開始…')).toBeVisible();
  await expect(page.getByText('等待開始')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
});

for (const scenario of ['correct', 'wrong', 'timeout'] as const) {
  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 852, width: 393 },
    { height: 393, width: 852 },
  ] as const) {
    test(`student Live ${scenario} feedback owns the ${String(viewport.width)}x${String(viewport.height)} viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/dev-harness/live-session.html?scenario=${scenario}`);
      const result = page.locator('.live-result-screen');
      await expect(result).toBeVisible();
      const geometry = await result.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          height: bounds.height,
          left: bounds.left,
          position: getComputedStyle(element).position,
          right: bounds.right,
          top: bounds.top,
          width: bounds.width,
        };
      });
      expect(geometry).toMatchObject({
        bottom: viewport.height,
        height: viewport.height,
        left: 0,
        position: 'fixed',
        right: viewport.width,
        top: 0,
        width: viewport.width,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
  }
}

test('route back button shares the Live status row without covering its content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto(PAGE);

  const back = await page
    .getByRole('button', { name: '返回前一頁' })
    .boundingBox();
  const statusBar = await page
    .locator('.live-student-status-bar')
    .boundingBox();
  expect(back).not.toBeNull();
  expect(statusBar).not.toBeNull();
  if (!back || !statusBar) return;

  const sharesRow =
    back.y < statusBar.y + statusBar.height &&
    back.y + back.height > statusBar.y;
  expect(sharesRow).toBe(true);

  const statusItems = await page
    .locator('.live-student-status-bar > *')
    .evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
  for (const item of statusItems) {
    const coversItem =
      back.x < item.x + item.width &&
      back.x + back.width > item.x &&
      back.y < item.y + item.height &&
      back.y + back.height > item.y;
    expect(coversItem).toBe(false);
  }
});
