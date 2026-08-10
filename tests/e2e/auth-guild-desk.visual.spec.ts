import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const viewports = [
  { height: 720, label: '1280', width: 1280 },
  { height: 852, label: '393', width: 393 },
] as const;

test.describe('JRPG guild-desk login', () => {
  for (const viewport of viewports) {
    test(`keeps the production login functional at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/login');

      await expect(page.getByRole('heading', { name: '登入' })).toBeVisible();
      await expect(page.getByText('冒險者公會')).toBeAttached();
      await expect(
        page.locator('.auth-portal-brand__mark img'),
      ).toHaveAttribute('src', '/colorplay-grimoire-design.png');

      const account = page.getByRole('textbox', { name: '帳號' });
      const password = page.locator('#login-password');
      const submit = page.getByRole('button', { name: '登入' });
      await expect(account).toBeVisible();
      await expect(password).toBeVisible();
      await expect(submit).toBeVisible();

      const metrics = await page.evaluate(() => {
        const selectors = [
          '.auth-portal',
          '.auth-window',
          '#login-account',
          '#login-password',
          '.login-form__action-row .primary-action',
          '.login-form__links',
        ];
        const elements = selectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`AUTH_ELEMENT_MISSING:${selector}`);
          const box = element.getBoundingClientRect();
          return {
            box: {
              bottom: box.bottom,
              height: box.height,
              left: box.left,
              right: box.right,
              top: box.top,
              width: box.width,
            },
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            selector,
          };
        });
        const main = document.querySelector<HTMLElement>('#main-content');
        if (!main) throw new Error('AUTH_MAIN_MISSING');
        return {
          backgroundImage: getComputedStyle(main).backgroundImage,
          documentOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          elements,
        };
      });

      expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
      expect(
        metrics.elements.every(
          ({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth + 1,
        ),
      ).toBe(true);

      const boxes = Object.fromEntries(
        metrics.elements.map(({ box, selector }) => [selector, box]),
      );
      const portal = boxes['.auth-portal'];
      const accountBox = boxes['#login-account'];
      const passwordBox = boxes['#login-password'];
      const submitBox = boxes['.login-form__action-row .primary-action'];
      if (!portal || !accountBox || !passwordBox || !submitBox) {
        throw new Error('AUTH_METRIC_MISSING');
      }
      expect(accountBox.height).toBeGreaterThanOrEqual(44);
      expect(passwordBox.height).toBeGreaterThanOrEqual(44);
      expect(submitBox.height).toBeGreaterThanOrEqual(44);
      expect(accountBox.bottom).toBeLessThanOrEqual(passwordBox.top);
      expect(passwordBox.bottom).toBeLessThanOrEqual(submitBox.top);

      if (viewport.width === 1280) {
        expect(portal.left).toBeGreaterThan(viewport.width * 0.45);
        expect(metrics.backgroundImage).toContain('guild-desk-desktop.png');
      } else {
        expect(portal.top).toBeGreaterThan(350);
        expect(metrics.backgroundImage).toContain('guild-desk-mobile.png');
      }

      const screenshotDirectory = `artifacts/design-audit/jrpg-auth-guild-desk/${viewport.label}`;
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        path: `${screenshotDirectory}/login.png`,
      });
    });
  }
});
