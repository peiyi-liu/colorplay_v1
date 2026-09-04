import { expect, test } from '@playwright/test';

const expectedEnvironment =
  process.env.EXPECTED_DEPLOYMENT_ENVIRONMENT ?? 'local';

function relativeLuminance(color: string): number {
  const channels = color
    .match(/[\d.]+/gu)
    ?.slice(0, 3)
    .map(Number);
  if (channels?.length !== 3) throw new Error('MARKER_COLOR_INVALID');
  const [red, green, blue] = channels;
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error('MARKER_COLOR_INVALID');
  }
  const linearChannels = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (linearChannels[0] ?? 0) +
    0.7152 * (linearChannels[1] ?? 0) +
    0.0722 * (linearChannels[2] ?? 0)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

test('the built artifact exposes only the expected Staging marker', async ({
  page,
}) => {
  expect(['local', 'staging', 'production']).toContain(expectedEnvironment);

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('link', { name: '開始冒險' })).toBeVisible();

    const marker = page.getByRole('status', { name: 'STAGING 測試環境' });
    if (expectedEnvironment === 'staging') {
      await expect(marker).toBeVisible();
      const measurement = await marker.evaluate((element) => {
        const styles = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          backgroundColor: styles.backgroundColor,
          bottom: bounds.bottom,
          color: styles.color,
          left: bounds.left,
          pointerEvents: styles.pointerEvents,
          right: bounds.right,
          top: bounds.top,
        };
      });
      expect(measurement.pointerEvents).toBe('none');
      expect(
        contrastRatio(measurement.color, measurement.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(measurement.left).toBeGreaterThanOrEqual(0);
      expect(measurement.top).toBeGreaterThanOrEqual(0);
      expect(measurement.right).toBeLessThanOrEqual(viewport.width);
      expect(measurement.bottom).toBeLessThanOrEqual(viewport.height);

      const skipLink = page.getByRole('link', { name: '跳到主要內容' });
      await skipLink.focus();
      await expect(skipLink).toBeVisible();
      const stacking = await marker.evaluate((element) => {
        const markerBounds = element.getBoundingClientRect();
        const skipLinkElement =
          document.querySelector<HTMLElement>('.skip-link');
        if (!skipLinkElement) throw new Error('SKIP_LINK_MISSING');
        const skipBounds = skipLinkElement.getBoundingClientRect();
        return {
          markerZIndex: Number(getComputedStyle(element).zIndex),
          overlaps:
            markerBounds.left < skipBounds.right &&
            markerBounds.right > skipBounds.left &&
            markerBounds.top < skipBounds.bottom &&
            markerBounds.bottom > skipBounds.top,
          skipZIndex: Number(getComputedStyle(skipLinkElement).zIndex),
        };
      });
      if (stacking.overlaps) {
        expect(stacking.skipZIndex).toBeGreaterThan(stacking.markerZIndex);
      }
    } else {
      await expect(marker).toHaveCount(0);
    }
  }
});
