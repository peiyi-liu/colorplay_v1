import { expect, type Locator } from '@playwright/test';

type Rect = Readonly<{
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}>;

const rectFor = async (locator: Locator): Promise<Rect> =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    };
  });

const backgroundDragPoint = async (
  mapViewport: Locator,
  direction: -1 | 1,
): Promise<Readonly<{ x: number; y: number }>> =>
  mapViewport.evaluate((element, dragDirection) => {
    const rect = element.getBoundingClientRect();
    const xRatios = dragDirection < 0 ? [0.82, 0.72, 0.62] : [0.18, 0.28, 0.38];
    const yRatios = [0.5, 0.2, 0.8, 0.65, 0.35];

    for (const xRatio of xRatios) {
      for (const yRatio of yRatios) {
        const x = rect.left + rect.width * xRatio;
        const y = rect.top + rect.height * yRatio;
        if (
          document
            .elementFromPoint(x, y)
            ?.classList.contains('chapter-map__base')
        ) {
          return { x, y };
        }
      }
    }

    throw new Error('No pointer-reachable village background point was found');
  }, direction);

export async function expectPointerReachable(locator: Locator): Promise<void> {
  const page = locator.page();
  await expect(locator).toBeAttached();

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const target = await rectFor(locator);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('Pointer reachability requires a viewport');

    const verticalClip = await locator.evaluate((element) => {
      let ancestor = element.parentElement;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        const overflowY = style.overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          const targetRect = element.getBoundingClientRect();
          const ancestorRect = ancestor.getBoundingClientRect();
          if (
            targetRect.top < ancestorRect.top - 1 ||
            targetRect.bottom > ancestorRect.bottom + 1
          ) {
            return {
              bottom: ancestorRect.bottom,
              left: ancestorRect.left,
              right: ancestorRect.right,
              top: ancestorRect.top,
            };
          }
        }
        ancestor = ancestor.parentElement;
      }
      return null;
    });

    if (
      target.top < -1 ||
      target.bottom > viewport.height + 1 ||
      verticalClip
    ) {
      const clip = verticalClip ?? {
        bottom: viewport.height,
        left: 0,
        right: viewport.width,
        top: 0,
      };
      const below = target.bottom > clip.bottom;
      await page.mouse.move(
        Math.min(
          Math.max((clip.left + clip.right) / 2, 12),
          viewport.width - 12,
        ),
        Math.min(
          Math.max((clip.top + clip.bottom) / 2, 12),
          viewport.height - 12,
        ),
      );
      await page.mouse.wheel(
        0,
        below ? viewport.height * 0.75 : -viewport.height * 0.75,
      );
      await page.waitForTimeout(50);
      continue;
    }

    const mapViewport = locator.locator(
      'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " chapter-map__viewport ")][1]',
    );
    if ((await mapViewport.count()) > 0) {
      const mapRect = await rectFor(mapViewport);
      if (target.left < mapRect.left + 1 || target.right > mapRect.right - 1) {
        const direction: -1 | 1 = target.right > mapRect.right ? -1 : 1;
        const start = await backgroundDragPoint(mapViewport, direction);
        const distance = Math.min(140, mapRect.width * 0.3);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + direction * distance, start.y, {
          steps: 10,
        });
        await page.mouse.up();
        await page.waitForTimeout(50);
        continue;
      }
    }

    await expect(locator).toBeInViewport();
    await locator.click({ timeout: 5_000 });
    return;
  }

  const diagnostics = await locator.evaluate((element) => {
    const ancestors = [];
    let ancestor = element.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      if (style.overflowY !== 'visible') {
        const rect = ancestor.getBoundingClientRect();
        ancestors.push({
          className: ancestor.className,
          clientHeight: ancestor.clientHeight,
          overflowY: style.overflowY,
          rect: { bottom: rect.bottom, top: rect.top },
          scrollHeight: ancestor.scrollHeight,
          scrollTop: ancestor.scrollTop,
        });
      }
      ancestor = ancestor.parentElement;
    }
    const target = element.getBoundingClientRect();
    return {
      ancestors,
      target: { bottom: target.bottom, top: target.top },
    };
  });
  throw new Error(
    `Pointer target remained unreachable: ${await locator.toString()} ${JSON.stringify(diagnostics)}`,
  );
}

export async function readRenderedContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    type Rgba = Readonly<{ a: number; b: number; g: number; r: number }>;

    const parseColor = (value: string): Rgba => {
      if (value === 'transparent') return { a: 0, b: 0, g: 0, r: 0 };
      const channels = value.match(/[\d.]+/gu)?.map(Number);
      if (!channels || channels.length < 3) {
        throw new Error(`Unsupported computed color: ${value}`);
      }
      return {
        a: channels[3] ?? 1,
        b: channels[2] ?? 0,
        g: channels[1] ?? 0,
        r: channels[0] ?? 0,
      };
    };

    const composite = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (alpha === 0) return { a: 0, b: 0, g: 0, r: 0 };
      return {
        a: alpha,
        b:
          (foreground.b * foreground.a +
            background.b * background.a * (1 - foreground.a)) /
          alpha,
        g:
          (foreground.g * foreground.a +
            background.g * background.a * (1 - foreground.a)) /
          alpha,
        r:
          (foreground.r * foreground.a +
            background.r * background.a * (1 - foreground.a)) /
          alpha,
      };
    };

    const backgrounds: Rgba[] = [];
    let current: Element | null = element;
    while (current) {
      const color = parseColor(getComputedStyle(current).backgroundColor);
      backgrounds.push(color);
      if (color.a >= 1) break;
      current = current.parentElement;
    }

    let renderedBackground: Rgba = { a: 1, b: 255, g: 255, r: 255 };
    for (const background of backgrounds.reverse()) {
      renderedBackground = composite(background, renderedBackground);
    }
    const renderedForeground = composite(
      parseColor(getComputedStyle(element).color),
      renderedBackground,
    );
    const luminance = (color: Rgba): number => {
      const channel = (value: number): number => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * channel(color.r) +
        0.7152 * channel(color.g) +
        0.0722 * channel(color.b)
      );
    };
    const foregroundLuminance = luminance(renderedForeground);
    const backgroundLuminance = luminance(renderedBackground);
    return (
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    );
  });
}

export async function expectVisibleFocusRing(locator: Locator): Promise<void> {
  const page = locator.page();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const target = await rectFor(locator);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('Focus visibility requires a viewport');
    if (target.top >= 0 && target.bottom <= viewport.height) break;
    const below = target.bottom > viewport.height;
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(
      0,
      below ? viewport.height * 0.75 : -viewport.height * 0.75,
    );
    await page.waitForTimeout(50);
  }
  await locator.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(locator).toBeFocused();

  const measurement = await locator.evaluate((element) => {
    const focusCandidates = [
      element,
      ...Array.from(element.querySelectorAll('*')),
    ];
    const candidate = focusCandidates.find((node) => {
      const style = getComputedStyle(node);
      return (
        (style.outlineStyle !== 'none' &&
          Number.parseFloat(style.outlineWidth) >= 3) ||
        (node.matches(':focus-visible') && style.boxShadow !== 'none')
      );
    });

    if (!candidate) {
      return { reason: 'missing-3px-ring', visible: false };
    }

    const style = getComputedStyle(candidate);
    const width = Number.parseFloat(style.outlineWidth) || 0;
    const offset = Number.parseFloat(style.outlineOffset) || 0;
    const extent = Math.max(width + offset, 0);
    const rect = candidate.getBoundingClientRect();
    const ring = {
      bottom: rect.bottom + extent,
      left: rect.left - extent,
      right: rect.right + extent,
      top: rect.top - extent,
    };

    if (
      ring.left < -1 ||
      ring.top < -1 ||
      ring.right > window.innerWidth + 1 ||
      ring.bottom > window.innerHeight + 1
    ) {
      return { reason: 'viewport-clipped', ring, visible: false };
    }

    let ancestor = candidate.parentElement;
    while (ancestor) {
      const ancestorStyle = getComputedStyle(ancestor);
      const clipsX = ['auto', 'clip', 'hidden', 'scroll'].includes(
        ancestorStyle.overflowX,
      );
      const clipsY = ['auto', 'clip', 'hidden', 'scroll'].includes(
        ancestorStyle.overflowY,
      );
      if (clipsX || clipsY) {
        const clip = ancestor.getBoundingClientRect();
        if (
          (clipsX &&
            (ring.left < clip.left - 1 || ring.right > clip.right + 1)) ||
          (clipsY && (ring.top < clip.top - 1 || ring.bottom > clip.bottom + 1))
        ) {
          return {
            clip: {
              bottom: clip.bottom,
              left: clip.left,
              right: clip.right,
              top: clip.top,
            },
            reason: 'ancestor-clipped',
            ring,
            visible: false,
          };
        }
      }
      ancestor = ancestor.parentElement;
    }

    const foreignHudOverlap = Array.from(
      document.querySelectorAll<HTMLElement>('.hud-top, .hud-command'),
    ).some((hud) => {
      if (hud.contains(element)) return false;
      const hudRect = hud.getBoundingClientRect();
      return !(
        ring.right <= hudRect.left ||
        ring.left >= hudRect.right ||
        ring.bottom <= hudRect.top ||
        ring.top >= hudRect.bottom
      );
    });

    return {
      outlineWidth: width,
      reason: foreignHudOverlap ? 'hud-overlap' : 'visible',
      ring,
      visible: !foreignHudOverlap,
    };
  });

  expect(measurement.visible, JSON.stringify(measurement)).toBe(true);
}

export async function readWorldAnchorError(
  building: Locator,
): Promise<{ x: number; y: number }> {
  return building.evaluate((element) => {
    const world = element.closest<HTMLElement>('.chapter-map__world');
    if (!world) throw new Error('Building is missing its logical map world');
    const worldWidth = Number(world.dataset.worldWidth);
    const worldHeight = Number(world.dataset.worldHeight);
    const groundX = Number((element as HTMLElement).dataset.groundX);
    const groundY = Number((element as HTMLElement).dataset.groundY);
    if (![worldWidth, worldHeight, groundX, groundY].every(Number.isFinite)) {
      throw new Error('Building logical anchor data is incomplete');
    }

    const worldRect = world.getBoundingClientRect();
    const buildingRect = element.getBoundingClientRect();
    const renderedScaleX = worldRect.width / worldWidth;
    const renderedScaleY = worldRect.height / worldHeight;
    const expectedX = worldRect.left + groundX * renderedScaleX;
    const expectedY = worldRect.top + groundY * renderedScaleY;
    const actualX = buildingRect.left + buildingRect.width / 2;
    const actualY = buildingRect.bottom;

    return {
      x: Math.abs(actualX - expectedX) / renderedScaleX,
      y: Math.abs(actualY - expectedY) / renderedScaleY,
    };
  });
}
