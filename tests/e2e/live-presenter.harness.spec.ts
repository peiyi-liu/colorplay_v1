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
        await expect(standings).toHaveAttribute('tabindex', '0');
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

  await expect(page.getByText('投影視窗過小')).toBeVisible();
  await expect(page.getByText('本場已取消')).toBeHidden();
  await page.getByRole('button', { name: '離開投影' }).click();
  await expect(page.getByRole('status')).toHaveText('已離開投影');
  expect(runtime.consoleErrors).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
  expect(runtime.unexpectedRequests).toEqual([]);
});
