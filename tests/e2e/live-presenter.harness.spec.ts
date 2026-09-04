import { expect, test, type Locator, type Page } from '@playwright/test';

// LivePresenter now delegates 'lobby' to LiveProjectorHud and
// 'question'/'paused'/'reveal' to LiveProjectorRound (JRPG/image-perf
// refactor); only 'draft'/'cancelled'/'podium' still render through
// LivePresenter's own fallback branch. Selectors below reflect that split.

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

type Scenario = (typeof SCENARIOS)[number];

const LAYOUT: Record<
  Scenario,
  Readonly<{ body: string; footer: string; header: string }>
> = {
  cancelled: {
    body: '.live-presenter__status',
    footer: '.live-presenter__controls',
    header: '.live-presenter__bar',
  },
  draft: {
    body: '.live-presenter__status',
    footer: '.live-presenter__controls',
    header: '.live-presenter__bar',
  },
  'lobby-boundary': {
    body: '.live-presenter__lobby',
    footer: '.live-projector__controls',
    header: '.live-projector__status-bar',
  },
  'paused-boundary': {
    body: '.live-round__question',
    footer: '.live-round__controls',
    header: '.live-projector__status-bar',
  },
  'podium-boundary': {
    body: '.live-presenter__podium-stage',
    footer: '.live-presenter__controls',
    header: '.live-presenter__bar',
  },
  'question-boundary': {
    body: '.live-round__question',
    footer: '.live-round__controls',
    header: '.live-projector__status-bar',
  },
  'reveal-boundary': {
    // Default render is the statistics step; explanation/ranking are
    // exercised separately below since they require real waits/clicks.
    body: '.live-round__statistics',
    footer: '.live-round__controls',
    header: '.live-projector__status-bar',
  },
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
    const stage = document.querySelector<HTMLElement>('.live-round__stage');
    const header = document.querySelector<HTMLElement>(
      '.live-projector__status-bar',
    );
    const body = document.querySelector<HTMLElement>('.live-round__question');
    const footer = document.querySelector<HTMLElement>('.live-round__controls');
    const heading = body?.querySelector<HTMLElement>('h2');
    const options = Array.from(
      body?.querySelectorAll<HTMLElement>('.live-round__option') ?? [],
    );
    if (!stage || !header || !body || !footer || !heading || !options[0]) {
      throw new Error('measurement target missing');
    }
    return {
      body: rectangle(body),
      footer: rectangle(footer),
      header: rectangle(header),
      optionFontSize: getComputedStyle(options[0]).fontSize,
      promptFontSize: getComputedStyle(heading).fontSize,
      stageClientHeight: stage.clientHeight,
      stageScrollHeight: stage.scrollHeight,
    };
  });

// The redesigned LiveProjectorRound wraps text and grows each option row
// instead of enforcing a fixed single-line character budget, so real-longest
// content (74-char prompt / 50-char option, from artifacts/content/questions.csv)
// no longer overflows uniformly across viewports the way it did pre-refactor.
// It now only overflows the shorter 1280x720/1366x768 viewports -- recorded
// here as the current, verified boundary rather than assumed unchanged.
test('records the real-longest content overflow per viewport', async ({
  page,
}) => {
  const runtime = observeRuntime(page);
  const expected: Record<string, boolean> = {
    '1024x768': false,
    '1280x720': true,
    '1366x768': true,
    '1920x1080': false,
  };
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(
      '/dev-harness/live-presenter.html?scenario=question-boundary&promptLength=74&optionLength=50',
    );
    await page.waitForLoadState('networkidle');

    const metrics = await measureQuestion(page);
    const key = `${String(viewport.width)}x${String(viewport.height)}`;
    console.info(`REAL_LONGEST_METRICS ${key} ${JSON.stringify(metrics)}`);
    const overflows = metrics.stageScrollHeight > metrics.stageClientHeight;
    expect(overflows).toBe(expected[key]);
  }
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

      const viewportRoot = page.locator('html');
      const presenter = page.getByRole('region', { name: 'Live 投影模式' });
      const layout = LAYOUT[scenario];
      const header = page.locator(layout.header).first();
      const footer = page.locator(layout.footer).first();
      const body = page.locator(layout.body).first();

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

      if (scenario === 'question-boundary' || scenario === 'paused-boundary') {
        const heading = body.locator('h2');
        const options = body.locator('.live-round__option');
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
        }
      }

      if (scenario === 'lobby-boundary') {
        // The redesigned wall renders 60 fixed-size circular portraits
        // (LiveProjectorHud) instead of a scrollable list of visible
        // names, so it no longer needs (or exposes) keyboard scrolling --
        // verified here as "all chips fit, none clipped" instead.
        const chips = page.locator('.live-presenter__wall-chip');
        await expect(chips).toHaveCount(60);
        for (const chip of await chips.all()) {
          await expectInside(chip, body);
        }
      }

      expect(runtime.consoleErrors).toEqual([]);
      expect(runtime.pageErrors).toEqual([]);
      expect(runtime.unexpectedRequests).toEqual([]);
    });
  }
}

test('all presenter phases keep the visible cluster centered in the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });

  for (const scenario of SCENARIOS) {
    await page.goto(
      `/dev-harness/live-presenter.html?scenario=${scenario}&promptLength=36&optionLength=21`,
    );
    await page.waitForLoadState('networkidle');

    const offset = await page
      .locator(LAYOUT[scenario].body)
      .first()
      .evaluate((body, viewportHeight) => {
        const visibleChildren = Array.from(body.children).filter(
          (element) => getComputedStyle(element).display !== 'none',
        );
        const boxes = visibleChildren.map((element) =>
          element.getBoundingClientRect(),
        );
        const top = Math.min(...boxes.map((box) => box.top));
        const bottom = Math.max(...boxes.map((box) => box.bottom));
        return (top + bottom) / 2 - viewportHeight / 2;
      }, 720);
    expect(Math.abs(offset), scenario).toBeLessThanOrEqual(8);
  }
});

test('reveal-boundary explanation and ranking steps stay bounded', async ({
  page,
}) => {
  const runtime = observeRuntime(page);
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto(
    '/dev-harness/live-presenter.html?scenario=reveal-boundary&promptLength=36&optionLength=21',
  );
  await page.waitForLoadState('networkidle');

  const presenter = page.getByRole('region', { name: 'Live 投影模式' });
  const stage = page.locator('.live-round__stage');

  await expect(page.locator('.live-round__explanation')).toBeVisible({
    timeout: 6_000,
  });
  await expectInside(stage, presenter);

  await page.getByRole('button', { name: '即時排名' }).click();
  const ranking = page.locator('.live-round__ranking');
  await expect(ranking).toBeVisible();
  await expect(ranking).toHaveAttribute('aria-labelledby', 'live-round-ranking');
  await expectInside(ranking, stage);

  expect(runtime.consoleErrors).toEqual([]);
  expect(runtime.pageErrors).toEqual([]);
  expect(runtime.unexpectedRequests).toEqual([]);
});

// Unlike the retired single-line layout, LiveProjectorRound wraps text, so
// promptLength alone is no longer a binding constraint at this viewport --
// verified (not assumed) that even the full 74-char REAL_LONGEST_PROMPT at
// optionLength=21 still fits (see the real-longest test above). optionLength
// is the actual driver: measured the exact break point at promptLength=36
// (the documented LIVE_PRESENTER_PROMPT_LIMIT) by bisecting 21..50 and
// found it between 42 (fits) and 43 (overflows).
test('the next boundary 36 by 43 exceeds 1280x720', async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto(
    '/dev-harness/live-presenter.html?scenario=question-boundary&promptLength=36&optionLength=43',
  );
  await page.waitForLoadState('networkidle');

  const metrics = await measureQuestion(page);
  expect(metrics.stageScrollHeight).toBeGreaterThan(metrics.stageClientHeight);
});

test('optionLength 42 still fits at promptLength 36 on 1280x720', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto(
    '/dev-harness/live-presenter.html?scenario=question-boundary&promptLength=36&optionLength=42',
  );
  await page.waitForLoadState('networkidle');

  const metrics = await measureQuestion(page);
  expect(metrics.stageScrollHeight).toBe(metrics.stageClientHeight);
});

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

test('lobby-boundary keyboard order exposes a 3:1 focus indicator', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto(
    '/dev-harness/live-presenter.html?scenario=lobby-boundary&promptLength=36&optionLength=21',
  );
  await page.waitForLoadState('networkidle');
  const order = [
    page.getByRole('button', { name: '開始遊戲' }),
    page.getByRole('button', { name: '音效' }),
    page.getByRole('button', { name: '退出' }),
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

test('reveal-boundary ranking step keyboard order exposes a focus indicator', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto(
    '/dev-harness/live-presenter.html?scenario=reveal-boundary&promptLength=36&optionLength=21',
  );
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.live-round__explanation')).toBeVisible({
    timeout: 6_000,
  });
  await page.getByRole('button', { name: '即時排名' }).click();
  await expect(page.locator('.live-round__ranking')).toBeVisible();

  // pause/close are disabled in the feedback phase (no matching host
  // action) so browsers skip them in Tab order -- only next/mute/exit
  // are real stops.
  const order = [
    page.getByRole('button', { name: '下一題' }),
    page.getByRole('button', { name: '音效' }),
    page.getByRole('button', { name: '退出' }),
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

for (const viewport of VIEWPORTS) {
  test(`controls meet 44px and pending stays visible at ${String(viewport.width)}x${String(viewport.height)}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      '/dev-harness/live-presenter.html?scenario=question-boundary&promptLength=36&optionLength=21&pending=1',
    );
    await page.waitForLoadState('networkidle');

    // LiveProjectorRound renders a fixed 5-button footer (pause/close/
    // next/mute/exit) and disables individual buttons rather than
    // swapping every label to "處理中…" -- unlike the retired monolith's
    // generic footerActions loop.
    const controls = page.locator('.live-round__controls button');
    await expect(controls).toHaveCount(5);
    for (const control of await controls.all()) {
      await expectTouchTarget(control);
    }
    const disabledControls = page.locator(
      '.live-round__controls button:disabled',
    );
    await expect(disabledControls).toHaveCount(4);
    await expect(
      page.getByRole('button', { name: '音效' }),
    ).toBeEnabled();
    for (const control of await disabledControls.all()) {
      const cursor = await control.evaluate(
        (element) => getComputedStyle(element).cursor,
      );
      expect(cursor).toBe('not-allowed');
    }

    await page.goto('/dev-harness/live-presenter.html?scenario=cancelled');
    await page.waitForLoadState('networkidle');
    const exitControls = page.locator('.live-presenter__bar button');
    await expect(exitControls).toHaveCount(1);
    for (const control of await exitControls.all()) {
      await expectTouchTarget(control);
    }
  });
}

test('reduced motion clears named presenter keyframes', async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/dev-harness/live-presenter.html?scenario=lobby-boundary');
  await page.waitForLoadState('networkidle');
  const wallChip = page.locator('.live-presenter__wall-chip').first();
  await expect(wallChip).toBeVisible();
  // Chips only animate while joining (`data-joining="true"`); at rest the
  // wall renders with `animation: none`. Set the attribute directly to
  // exercise the same CSS rule the "just joined" transition relies on,
  // without needing to simulate a live participant join.
  await wallChip.evaluate((element) => {
    element.setAttribute('data-joining', 'true');
  });
  await expect
    .poll(() =>
      wallChip.evaluate((element) => getComputedStyle(element).animationName),
    )
    .toBe('live-avatar-bubble-rise');

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
