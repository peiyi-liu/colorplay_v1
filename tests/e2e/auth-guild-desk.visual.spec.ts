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
      ).toHaveAttribute('src', '/colorplay-grimoire-pixel.png');

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
            style: {
              borderRadius: getComputedStyle(element).borderRadius,
            },
          };
        });
        const main = document.querySelector<HTMLElement>('#main-content');
        if (!main) throw new Error('AUTH_MAIN_MISSING');
        const portal = document.querySelector<HTMLElement>('.auth-portal');
        if (!portal) throw new Error('AUTH_PORTAL_MISSING');
        const frame = document.querySelector<HTMLElement>('.auth-window');
        if (!frame) throw new Error('AUTH_FRAME_MISSING');
        return {
          backgroundImage: getComputedStyle(main).backgroundImage,
          documentOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          documentVerticalOverflow:
            document.documentElement.scrollHeight - window.innerHeight,
          elements,
          frameStyle: {
            borderRadius: getComputedStyle(frame).borderRadius,
            borderTopWidth: getComputedStyle(frame).borderTopWidth,
          },
          mainOverflowY: getComputedStyle(main).overflowY,
          mainVerticalOverflow: main.scrollHeight - main.clientHeight,
          villageContent: getComputedStyle(portal, '::after').content,
        };
      });

      expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
      expect(metrics.documentVerticalOverflow).toBeLessThanOrEqual(1);
      expect(metrics.mainVerticalOverflow).toBeLessThanOrEqual(1);
      expect(metrics.mainOverflowY).toBe('hidden');
      expect(metrics.villageContent).toBe('none');
      expect(metrics.frameStyle.borderRadius).toBe('0px');
      expect(metrics.frameStyle.borderTopWidth).toBe('3px');
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
      expect(portal.top).toBeGreaterThanOrEqual(0);
      expect(portal.bottom).toBeLessThanOrEqual(viewport.height);
      expect(accountBox.bottom).toBeLessThanOrEqual(passwordBox.top);
      expect(passwordBox.bottom).toBeLessThanOrEqual(submitBox.top);
      expect(
        metrics.elements
          .filter(({ selector }) =>
            ['#login-account', '#login-password'].includes(selector),
          )
          .every(({ style }) => style.borderRadius === '0px'),
      ).toBe(true);

      if (viewport.width === 1280) {
        expect(portal.left).toBeGreaterThan(viewport.width * 0.45);
        expect(metrics.backgroundImage).toContain('guild-desk-desktop.webp');
        await expect(page.getByText('歡迎回來，冒險者。')).toBeVisible();
        const welcomeBox = await page
          .getByText('歡迎回來，冒險者。')
          .boundingBox();
        expect(welcomeBox).not.toBeNull();
        expect(welcomeBox?.x ?? viewport.width).toBeLessThan(portal.left);
      } else {
        expect(portal.top).toBeGreaterThan(250);
        expect(metrics.backgroundImage).toContain('guild-desk-mobile.webp');
        await expect(page.getByText('冒險者公會')).toBeVisible();
        await expect(page.getByText('歡迎回來，冒險者。')).toBeHidden();
      }

      const screenshotDirectory = `artifacts/design-audit/jrpg-auth-guild-desk/${viewport.label}`;
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        fullPage: false,
        path: `${screenshotDirectory}/login.png`,
      });

      await page
        .locator('.login-form__portal label')
        .filter({ hasText: '教師端登入' })
        .click();
      await expect(page.getByLabel('班級序號')).toBeVisible();
      const teacherMetrics = await page.evaluate(() => {
        const portal = document.querySelector<HTMLElement>('.auth-portal');
        const classCode =
          document.querySelector<HTMLElement>('#login-class-code');
        const main = document.querySelector<HTMLElement>('#main-content');
        if (!portal || !classCode || !main) {
          throw new Error('TEACHER_AUTH_METRIC_MISSING');
        }
        const portalBox = portal.getBoundingClientRect();
        const classCodeBox = classCode.getBoundingClientRect();
        return {
          classCodeBottom: classCodeBox.bottom,
          documentOverflow:
            document.documentElement.scrollHeight - window.innerHeight,
          mainOverflow: main.scrollHeight - main.clientHeight,
          portalBottom: portalBox.bottom,
          portalTop: portalBox.top,
        };
      });
      expect(teacherMetrics.documentOverflow).toBeLessThanOrEqual(1);
      expect(teacherMetrics.mainOverflow).toBeLessThanOrEqual(1);
      expect(teacherMetrics.portalTop).toBeGreaterThanOrEqual(0);
      expect(teacherMetrics.portalBottom).toBeLessThanOrEqual(viewport.height);
      expect(teacherMetrics.classCodeBottom).toBeLessThanOrEqual(
        viewport.height,
      );
    });
  }
});
