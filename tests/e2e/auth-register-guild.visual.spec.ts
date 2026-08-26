import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const viewports = [
  { height: 720, label: '1280', width: 1280 },
  { height: 852, label: '393', width: 393 },
] as const;

test.describe('JRPG guild registration desk', () => {
  for (const viewport of viewports) {
    test(`keeps the designed registration form usable at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/register');

      const portal = page.locator('.auth-portal--register');
      await expect(portal).toBeVisible();
      await expect(
        page.getByRole('heading', { name: '註冊帳號' }),
      ).toBeVisible();
      await expect(page.getByRole('list', { name: '註冊步驟' })).toBeVisible();
      await expect(
        page.locator('.auth-register-progress [aria-current="step"]'),
      ).toContainText('基本資料');
      await expect(page.getByText('冒險者公會')).toHaveCount(0);
      await expect(page.getByText('建立你的冒險者通行證')).toHaveCount(0);
      await expect(
        page.getByRole('img', { name: 'ColorPlay 藍金寶典' }),
      ).toHaveCount(0);

      const metrics = await page.evaluate(() => {
        const selectors = [
          '.auth-portal--register',
          '.auth-portal--register .auth-window',
          '#register-full-name',
          '#register-nickname',
          '#register-class-code',
          '.auth-portal--register .primary-action',
        ];
        const elements = selectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`REGISTER_ELEMENT_MISSING:${selector}`);
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
        if (!main) throw new Error('REGISTER_MAIN_MISSING');
        const frame = document.querySelector<HTMLElement>(
          '.auth-portal--register .auth-window',
        );
        if (!frame) throw new Error('REGISTER_FRAME_MISSING');
        const portal = document.querySelector<HTMLElement>(
          '.auth-portal--register',
        );
        if (!portal) throw new Error('REGISTER_PORTAL_MISSING');
        return {
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
          mainVerticalOverflow: main.scrollHeight - main.clientHeight,
          mainOverflowY: getComputedStyle(main).overflowY,
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
      expect(
        metrics.elements
          .filter(({ selector }) => selector.startsWith('#register-'))
          .every(({ box }) => box.height >= 44),
      ).toBe(true);

      const portalBox = metrics.elements.find(
        ({ selector }) => selector === '.auth-portal--register',
      )?.box;
      if (!portalBox) throw new Error('REGISTER_PORTAL_METRIC_MISSING');
      expect(portalBox.top).toBeGreaterThanOrEqual(0);
      expect(portalBox.bottom).toBeLessThanOrEqual(viewport.height);
      if (viewport.width === 1280) {
        expect(portalBox.left).toBeGreaterThan(viewport.width * 0.45);
      } else {
        expect(portalBox.left).toBeGreaterThanOrEqual(0);
        expect(portalBox.right).toBeLessThanOrEqual(viewport.width);
      }

      const screenshotDirectory = `artifacts/design-audit/jrpg-auth-register/${viewport.label}`;
      await mkdir(screenshotDirectory, { recursive: true });
      await page.screenshot({
        animations: 'disabled',
        fullPage: false,
        path: `${screenshotDirectory}/register.png`,
      });

      await page.getByLabel('名字').fill('王小明');
      await page.getByLabel('暱稱').fill('彩彩');
      await page.getByLabel('班級序號').fill('ABCD-1234-EF56-7890');
      await page.getByRole('button', { name: '下一步' }).click();
      await expect(
        page.locator('.auth-register-progress [aria-current="step"]'),
      ).toContainText('E-mail 驗證');
      await expect(page.getByLabel('E-mail')).toBeVisible();
      await expect(page.locator('#register-full-name')).toHaveCount(0);

      const emailStepOverflow = await page.evaluate(() => ({
        document: document.documentElement.scrollHeight - window.innerHeight,
        main: (() => {
          const main = document.querySelector<HTMLElement>('#main-content');
          if (!main) throw new Error('REGISTER_MAIN_MISSING');
          return main.scrollHeight - main.clientHeight;
        })(),
      }));
      expect(emailStepOverflow.document).toBeLessThanOrEqual(1);
      expect(emailStepOverflow.main).toBeLessThanOrEqual(1);
    });
  }
});
