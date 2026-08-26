import { expect, test, type Locator, type Page } from '@playwright/test';

const VIEWPORTS = [
  { height: 768, width: 1024 },
  { height: 720, width: 1280 },
  { height: 768, width: 1366 },
  { height: 1080, width: 1920 },
] as const;

const SCENARIOS = [
  'draft',
  'lobby-boundary',
  'question-boundary',
  'paused-boundary',
  'reveal-boundary',
  'podium-boundary',
  'cancelled',
] as const;

const bodySelector = (scenario: (typeof SCENARIOS)[number]) => {
  if (scenario === 'draft' || scenario === 'cancelled') {
    return '.live-presenter__status';
  }
  if (scenario === 'lobby-boundary') return '.live-presenter__lobby';
  if (scenario === 'question-boundary' || scenario === 'paused-boundary') {
    return '.live-presenter__question';
  }
  if (scenario === 'reveal-boundary') return '.live-presenter__feedback';
  return '.live-presenter__podium-stage';
};

const observeRuntime = (page: Page) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://localhost:4178') {
      unexpectedRequests.push(request.url());
    }
  });
  return { consoleErrors, pageErrors, unexpectedRequests };
};

const expectInside = async (
  child: Locator,
  parent: Locator,
  tolerance = 0.5,
) => {
  const [childBox, parentBox] = await Promise.all([
    child.boundingBox(),
    parent.boundingBox(),
  ]);
  expect(childBox).not.toBeNull();
  expect(parentBox).not.toBeNull();
  if (!childBox || !parentBox) return;
  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x - tolerance);
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y - tolerance);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(
    parentBox.x + parentBox.width + tolerance,
  );
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(
    parentBox.y + parentBox.height + tolerance,
  );
};

const expectTouchTarget = async (control: Locator) => {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
};

const focusEvidence = (control: Locator) =>
  control.evaluate((element) => {
    const channels = (color: string): readonly [number, number, number] => {
      const values = color
        .match(/[\d.]+/gu)
        ?.slice(0, 3)
        .map(Number);
      if (values?.length !== 3 || values.some(Number.isNaN)) {
        throw new Error(`unsupported computed color: ${color}`);
      }
      return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
    };
    const luminance = (color: string) => {
      const linear = channels(color).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : Math.pow((value + 0.055) / 1.055, 2.4);
      });
      return (
        0.2126 * (linear[0] ?? 0) +
        0.7152 * (linear[1] ?? 0) +
        0.0722 * (linear[2] ?? 0)
      );
    };
    const presenter = element.closest('.live-presenter');
    if (!presenter) throw new Error('presenter missing for focus evidence');
    const style = getComputedStyle(element);
    const outline = luminance(style.outlineColor);
    const background = luminance(getComputedStyle(presenter).backgroundColor);
    return {
      contrast:
        (Math.max(outline, background) + 0.05) /
        (Math.min(outline, background) + 0.05),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });

const measureQuestion = (page: Page) =>
  page.evaluate(() => {
    const rectangle = (element: HTMLElement) => {
      const { height, width, x, y } = element.getBoundingClientRect();
      return { height, width, x, y };
    };
    const presenter = document.querySelector<HTMLElement>('.live-presenter');
    const header = document.querySelector<HTMLElement>('.live-presenter__bar');
    const body = document.querySelector<HTMLElement>(
      '.live-presenter__question',
    );
    const footer = document.querySelector<HTMLElement>(
      '.live-presenter__controls',
    );
    const heading = body?.querySelector<HTMLElement>('h2');
    const options = Array.from(
      body?.querySelectorAll<HTMLElement>('.live-presenter__option') ?? [],
    );
    if (!presenter || !header || !body || !footer || !heading || !options[0]) {
      throw new Error('measurement target missing');
    }
    return {
      body: rectangle(body),
      footer: rectangle(footer),
      header: rectangle(header),
      optionFontSize: getComputedStyle(options[0]).fontSize,
      presenterClientHeight: presenter.clientHeight,
      presenterScrollHeight: presenter.scrollHeight,
      promptFontSize: getComputedStyle(heading).fontSize,
    };
  });

test('records the real-longest 1024x768 overflow baseline', async ({
  page,
}) => {
  const runtime = observeRuntime(page);
  await page.setViewportSize({ height: 768, width: 1024 });
  await page.goto(
    '/dev-harness/live-presenter.html?scenario=question-boundary&promptLength=74&optionLength=50',
  );
  await page.waitForLoadState('networkidle');

  const metrics = await measureQuestion(page);
  console.info(`REAL_LONGEST_METRICS ${JSON.stringify(metrics)}`);
  expect(metrics.promptFontSize).toBe('51.2px');
  expect(metrics.optionFontSize).toBe('32px');
  expect(
    metrics.body.y < metrics.header.y + metrics.header.height ||
      metrics.body.y + metrics.body.height > metrics.footer.y,
  ).toBe(true);
  expect(runtime.consoleErrors).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
  expect(runtime.unexpectedRequests).toEqual([]);
});

for (const viewport of VIEWPORTS) {
  for (const scenario of SCENARIOS) {
    test(`${scenario} stays bounded at ${String(viewport.width)}x${String(viewport.height)}`, async ({
      page,
    }) => {
      const runtime = observeRuntime(page);
      await page.setViewportSize(viewport);
      await page.goto(
        `/dev-harness/live-presenter.html?scenario=${scenario}&promptLength=36&optionLength=21`,
      );
      await page.waitForLoadState('networkidle');
      if (scenario === 'reveal-boundary') {
        await expect(
          page.getByRole('region', { name: '目前排行榜' }),
        ).toBeVisible();
      }

      const viewportRoot = page.locator('html');
      const presenter = page.getByRole('region', { name: 'Live 投影模式' });
      const header = page.locator('.live-presenter__bar');
      const footer = page.locator('.live-presenter__controls');
      const body = page.locator(bodySelector(scenario));

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        const presenterElement =
          document.querySelector<HTMLElement>('.live-presenter');
        if (!presenterElement) throw new Error('presenter missing');
        return {
          documentX: root.scrollWidth - root.clientWidth,
          documentY: root.scrollHeight - root.clientHeight,
          presenterX:
            presenterElement.scrollWidth - presenterElement.clientWidth,
          presenterY:
            presenterElement.scrollHeight - presenterElement.clientHeight,
        };
      });
      expect(overflow).toEqual({
        documentX: 0,
        documentY: 0,
        presenterX: 0,
        presenterY: 0,
      });
      await expectInside(presenter, viewportRoot);
      await expectInside(header, presenter);
      await expectInside(footer, presenter);
      await expectInside(body, presenter);

      const [headerBox, bodyBox, footerBox] = await Promise.all([
        header.boundingBox(),
        body.boundingBox(),
        footer.boundingBox(),
      ]);
      expect(headerBox).not.toBeNull();
      expect(bodyBox).not.toBeNull();
      expect(footerBox).not.toBeNull();
      if (headerBox && bodyBox && footerBox) {
        expect(bodyBox.y).toBeGreaterThanOrEqual(
          headerBox.y + headerBox.height - 0.5,
        );
        expect(bodyBox.y + bodyBox.height).toBeLessThanOrEqual(
          footerBox.y + 0.5,
        );
      }

      if (scenario === 'question-boundary' || scenario === 'paused-boundary') {
        const heading = body.locator('h2');
        const options = body.locator('.live-presenter__option');
        await expect(heading).toHaveText(/^.{36}$/u);
        await expect(options).toHaveCount(4);
        expect(await options.allTextContents()).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/.{21}$/u),
            expect.stringMatching(/.{21}$/u),
            expect.stringMatching(/.{21}$/u),
            expect.stringMatching(/.{21}$/u),
          ]),
        );
        await expectInside(heading, body);
        for (const option of await options.all()) {
          await expectInside(option, body);
          const clipping = await option.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              lineClamp: style.getPropertyValue('-webkit-line-clamp'),
              overflow: style.overflow,
              textOverflow: style.textOverflow,
            };
          });
          expect(clipping).toEqual({
            lineClamp: 'none',
            overflow: 'visible',
            textOverflow: 'clip',
          });
        }
      }

      if (scenario === 'lobby-boundary') {
        const wall = page.getByRole('list', { name: '已加入同學名單' });
        await expect(wall).toHaveAttribute('tabindex', '0');
        const scroll = await wall.evaluate((element) => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }));
        expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
        await wall.focus();
        await page.keyboard.press('PageDown');
        await expect
          .poll(() => wall.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0);
      }

      if (scenario === 'reveal-boundary') {
        const standings = page.getByRole('region', { name: '目前排行榜' });
        const correctRow = page.locator('.live-presenter__chart-row--correct');
        await expect(standings).toHaveAttribute('tabindex', '0');
        await expect(correctRow).toHaveCSS(
          'transform',
          /matrix\(1\.06, 0, 0, 1\.06,/u,
        );
        await expectInside(correctRow, body);
        await standings.focus();
        await expect(standings).toBeFocused();
      }

      expect(runtime.consoleErrors).toEqual([]);
      expect(runtime.pageErrors).toEqual([]);
      expect(runtime.unexpectedRequests).toEqual([]);
    });
  }
}

for (const boundary of [
  { optionLength: 21, promptLength: 37 },
  { optionLength: 22, promptLength: 36 },
]) {
  test(`the next boundary ${String(boundary.promptLength)} by ${String(boundary.optionLength)} exceeds 1280x720`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: 720, width: 1280 });
    await page.goto(
      `/dev-harness/live-presenter.html?scenario=question-boundary&promptLength=${String(boundary.promptLength)}&optionLength=${String(boundary.optionLength)}`,
    );
    await page.waitForLoadState('networkidle');

    const metrics = await measureQuestion(page);
    expect(
      metrics.body.y < metrics.header.y + metrics.header.height ||
        metrics.body.y + metrics.body.height > metrics.footer.y,
    ).toBe(true);
  });
}

test('too-small cancelled keeps the existing exit path', async ({ page }) => {
  const runtime = observeRuntime(page);
  await page.setViewportSize({ height: 600, width: 900 });
  await page.goto(
    '/dev-harness/live-presenter.html?scenario=too-small-cancelled',
  );
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('alert')).toHaveText('投影視窗過小');
  await expect(page.getByText('本場已取消')).toBeHidden();
  await page.getByRole('button', { name: '離開投影' }).click();
  await expect(page.getByRole('status')).toHaveText('已離開投影');
  expect(runtime.consoleErrors).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
  expect(runtime.unexpectedRequests).toEqual([]);
});

for (const scenario of ['lobby-boundary', 'reveal-boundary'] as const) {
  test(`${scenario} keyboard order exposes a 3:1 focus indicator`, async ({
    page,
  }) => {
    await page.setViewportSize({ height: 720, width: 1280 });
    await page.goto(
      `/dev-harness/live-presenter.html?scenario=${scenario}&promptLength=36&optionLength=21`,
    );
    await page.waitForLoadState('networkidle');
    const scrollRegion =
      scenario === 'lobby-boundary'
        ? page.getByRole('list', { name: '已加入同學名單' })
        : page.getByRole('region', { name: '目前排行榜' });
    await expect(scrollRegion).toBeVisible();
    const order = [
      page.getByRole('button', { name: '音效開啟' }),
      page.getByRole('button', { name: '取消挑戰' }),
      scrollRegion,
      page.getByRole('button', {
        name: scenario === 'lobby-boundary' ? '開始第一題' : '下一題',
      }),
    ];

    for (const target of order) {
      await page.keyboard.press('Tab');
      await expect(target).toBeFocused();
      const evidence = await focusEvidence(target);
      expect(evidence.outlineStyle).not.toBe('none');
      expect(evidence.outlineWidth).toBeGreaterThanOrEqual(3);
      expect(evidence.contrast).toBeGreaterThanOrEqual(3);
    }
  });
}

for (const viewport of VIEWPORTS) {
  test(`controls meet 44px and pending stays visible at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      '/dev-harness/live-presenter.html?scenario=question-boundary&promptLength=36&optionLength=21&pending=1',
    );
    await page.waitForLoadState('networkidle');

    const activeControls = page.locator(
      '.live-presenter__bar button, .live-presenter__controls button',
    );
    await expect(activeControls).toHaveCount(4);
    for (const control of await activeControls.all()) {
      await expectTouchTarget(control);
    }
    const pendingControls = page.locator(
      '.live-presenter__controls button:disabled',
    );
    await expect(pendingControls).toHaveCount(2);
    await expect(page.getByRole('button', { name: '處理中…' })).toBeVisible();
    for (const control of await pendingControls.all()) {
      const style = await control.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { cursor: computed.cursor, opacity: Number(computed.opacity) };
      });
      expect(style.cursor).toBe('wait');
      expect(style.opacity).toBeLessThan(1);
    }

    await page.goto('/dev-harness/live-presenter.html?scenario=cancelled');
    await page.waitForLoadState('networkidle');
    const exitControls = page.locator('.live-presenter__bar button');
    await expect(exitControls).toHaveCount(2);
    for (const control of await exitControls.all()) {
      await expectTouchTarget(control);
    }
  });
}

test('reduced motion clears named presenter keyframes', async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/dev-harness/live-presenter.html?scenario=lobby-boundary');
  const wallChip = page.locator('.live-presenter__wall-chip').first();
  await expect(wallChip).toBeVisible();
  await expect
    .poll(() =>
      wallChip.evaluate((element) => getComputedStyle(element).animationName),
    )
    .toBe('live-wall-pop');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      wallChip.evaluate((element) => getComputedStyle(element).animationName),
    )
    .toBe('none');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/dev-harness/live-presenter.html?scenario=podium-boundary');
  const podiumStep = page.locator('.live-presenter__podium-step').first();
  const podium = page.locator('.live-presenter__podium');
  await expect(podiumStep).toBeVisible();
  expect(
    await podiumStep.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe('live-podium-reveal');
  expect(
    await podium.evaluate(
      (element) => getComputedStyle(element, '::before').animationName,
    ),
  ).toBe('fireworks-burst');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await podiumStep.evaluate(
      (element) => getComputedStyle(element).animationName,
    ),
  ).toBe('none');
  expect(
    await podium.evaluate(
      (element) => getComputedStyle(element, '::before').animationName,
    ),
  ).toBe('none');
});
