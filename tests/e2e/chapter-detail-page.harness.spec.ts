import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

import { expectSingleBackButtonBelowHud } from './helpers/chapter-detail-shell';

for (const viewport of [
  { height: 720, label: '1280', width: 1280 },
  { height: 852, label: '393', width: 393 },
] as const) {
  test(`05a chapter journey matches the student shell at ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dev-harness/chapter-detail.html?scenario=in-progress');
    await page.waitForLoadState('networkidle');

    const journey = page.getByRole('region', { name: '第三章複習旅程' });
    await expect(journey).toBeVisible();
    await expectSingleBackButtonBelowHud(page, '返回前一頁');
    await expect(page.locator('.chapter-review-node')).toHaveCount(6);
    await expect(journey.locator('.primary-action')).toHaveCount(1);

    const surface = await journey.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        backgroundAttachment: style.backgroundAttachment,
        backgroundImage: style.backgroundImage,
        borderWidth: `${style.borderTopWidth} ${style.borderRightWidth} ${style.borderBottomWidth} ${style.borderLeftWidth}`,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        top: box.top,
      };
    });
    const hudBottom = await page
      .locator('.hud-top--student')
      .evaluate((element) => element.getBoundingClientRect().bottom);
    expect(surface.left).toBeLessThanOrEqual(1);
    expect(surface.right).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(Math.abs(surface.top - hudBottom)).toBeLessThanOrEqual(1);
    expect(surface.borderWidth).toBe('0px 0px 0px 0px');
    expect(surface.backgroundImage).toContain(
      viewport.width === 393
        ? 'chapter-archive-world-mobile-v3'
        : 'chapter-archive-world-desktop-v3',
    );
    expect(surface.backgroundAttachment).not.toContain('fixed');

    await expect(page.locator('.chapter-review-node__book-art')).toHaveCount(6);
    await expect(
      page.locator('.chapter-review-node__platform-art'),
    ).toHaveCount(0);
    await expect(page.locator('.chapter-detail__subtopic-title')).toHaveCount(
      0,
    );
    const subtopicMenu = journey.getByRole('navigation', {
      name: '第三章小節',
    });
    await expect(subtopicMenu).toBeVisible();
    await expect(
      subtopicMenu.locator('.chapter-archive__subtopic-menu-item'),
    ).toHaveCount(2);
    await expect(
      subtopicMenu.getByRole('button', {
        name: '3-1 色彩三要素與色名的表示',
      }),
    ).toHaveAttribute('aria-current', 'true');
    await expect(
      subtopicMenu.getByRole('link', { name: '小節挑戰' }),
    ).toBeVisible();
    await expect(
      subtopicMenu.getByRole('link', { name: '章節總挑戰' }),
    ).toBeVisible();
    await expect(journey.getByText('開始挑戰')).toHaveCount(0);
    await expect(journey.getByText('第 1 / 2 頁')).toBeVisible();

    const selectedArtifact = page.locator(
      '.chapter-review-node[data-current="true"] .chapter-review-node__artifact',
    );
    await expect(selectedArtifact).toHaveAttribute('data-selected', 'true');
    expect(
      await selectedArtifact.evaluate(
        (element) => getComputedStyle(element).filter,
      ),
    ).not.toBe('none');

    const hoverTarget = page.locator('.chapter-review-node').first();
    const hoverArtifact = hoverTarget.locator('.chapter-review-node__artifact');
    await hoverTarget.hover();
    expect(
      await hoverArtifact.evaluate(
        (element) => getComputedStyle(element).filter,
      ),
    ).not.toBe('none');

    const hoverSummaryStyle = await hoverTarget
      .locator('button')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderLeftWidth: style.borderLeftWidth,
          outlineStyle: style.outlineStyle,
        };
      });
    expect(hoverSummaryStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(hoverSummaryStyle.borderLeftWidth).toBe('0px');
    expect(hoverSummaryStyle.outlineStyle).toBe('none');

    const routeDecoration = await page
      .locator('.chapter-archive__nodes')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element, '::before');
        return {
          borderLeftWidth: style.borderLeftWidth,
          borderTopWidth: style.borderTopWidth,
          content: style.content,
        };
      });
    expect(routeDecoration.borderLeftWidth).toBe('0px');
    expect(routeDecoration.borderTopWidth).toBe('0px');
    expect(routeDecoration.content).toBe('none');

    if (viewport.width === 1280) {
      const desktopLayout = await page.evaluate(() => {
        const firstNodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.chapter-archive__subtopic .chapter-review-node:first-child',
          ),
        );
        const objects = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.chapter-review-node__book-art, .chapter-archive__actions, .chapter-archive__challenge-actions, .chapter-detail__progress, .chapter-archive__challenge-action, .chapter-archive__continue, .chapter-archive__pagination',
          ),
        );
        return {
          firstNodeLefts: firstNodes.map(
            (node) => node.getBoundingClientRect().left,
          ),
          libraryColumns: (() => {
            const menu = document
              .querySelector<HTMLElement>('.chapter-archive__subtopic-menu')
              ?.getBoundingClientRect();
            const subtopic = document
              .querySelector<HTMLElement>('.chapter-archive__subtopic')
              ?.getBoundingClientRect();
            return menu && subtopic
              ? { menuRight: menu.right, subtopicLeft: subtopic.left }
              : null;
          })(),
          lowerControls: (() => {
            const boxFor = (selector: string) => {
              const box = document
                .querySelector<HTMLElement>(selector)
                ?.getBoundingClientRect();
              return box
                ? {
                    bottom: box.bottom,
                    left: box.left,
                    right: box.right,
                    top: box.top,
                  }
                : null;
            };
            return {
              challengeActions: boxFor('.chapter-archive__challenge-actions'),
              continueAction: boxFor('.chapter-archive__continue'),
              pagination: boxFor('.chapter-archive__pagination'),
            };
          })(),
          objectBottoms: objects.map((object) => ({
            bottom: object.getBoundingClientRect().bottom,
            className: object.className,
          })),
          maxObjectBottom: Math.max(
            ...objects.map((object) => object.getBoundingClientRect().bottom),
          ),
          boxDetails: Array.from(
            document.querySelectorAll<HTMLElement>(
              '.chapter-detail__progress, .chapter-archive__title, .chapter-review-node',
            ),
          ).map((element) => {
            const box = element.getBoundingClientRect();
            return {
              bottom: box.bottom,
              className: element.className,
              left: box.left,
              right: box.right,
              top: box.top,
            };
          }),
          overlaps: (() => {
            const labeledBoxes: {
              box: DOMRect;
              label: string;
            }[] = [
              '.chapter-detail__progress',
              '.chapter-archive__title',
              '.chapter-archive__subtitle',
              '.chapter-archive__subtopic-menu-item',
              '.chapter-archive__continue',
              '.chapter-archive__challenge-action',
            ].flatMap((selector) =>
              Array.from(document.querySelectorAll<HTMLElement>(selector)).map(
                (element, index) => ({
                  box: element.getBoundingClientRect(),
                  label: `${selector}:${String(index)}`,
                }),
              ),
            );
            document
              .querySelectorAll<HTMLElement>('.chapter-review-node')
              .forEach((node, index) => {
                const nodeBox = node.getBoundingClientRect();
                const bookBox = node
                  .querySelector<HTMLElement>('.chapter-review-node__book-art')
                  ?.getBoundingClientRect();
                const left = Math.min(
                  nodeBox.left,
                  bookBox?.left ?? nodeBox.left,
                );
                const right = Math.max(
                  nodeBox.right,
                  bookBox?.right ?? nodeBox.right,
                );
                const top = Math.min(nodeBox.top, bookBox?.top ?? nodeBox.top);
                const bottom = Math.max(
                  nodeBox.bottom,
                  bookBox?.bottom ?? nodeBox.bottom,
                );
                labeledBoxes.push({
                  box: new DOMRect(left, top, right - left, bottom - top),
                  label: `.chapter-review-node:${String(index)}`,
                });
              });
            return labeledBoxes.flatMap((first, firstIndex) =>
              labeledBoxes.slice(firstIndex + 1).flatMap((second) => {
                const overlapWidth =
                  Math.min(first.box.right, second.box.right) -
                  Math.max(first.box.left, second.box.left);
                const overlapHeight =
                  Math.min(first.box.bottom, second.box.bottom) -
                  Math.max(first.box.top, second.box.top);
                return overlapWidth > 2 && overlapHeight > 2
                  ? [`${first.label} x ${second.label}`]
                  : [];
              }),
            );
          })(),
          progress: (() => {
            const element = document.querySelector<HTMLElement>(
              '.chapter-detail__progress',
            );
            const box = element?.getBoundingClientRect();
            return box && element
              ? {
                  contentContained: Array.from(element.children).every(
                    (child) => {
                      const childBox = child.getBoundingClientRect();
                      return (
                        childBox.left >= box.left - 1 &&
                        childBox.right <= box.right + 1 &&
                        childBox.top >= box.top - 1 &&
                        childBox.bottom <= box.bottom + 1
                      );
                    },
                  ),
                  left: box.left,
                  bottom: box.bottom,
                  right: box.right,
                  top: box.top,
                }
              : null;
          })(),
          library: (() => {
            const box = document
              .querySelector<HTMLElement>('.chapter-archive__library')
              ?.getBoundingClientRect();
            return box
              ? { center: box.left + box.width / 2, width: box.width }
              : null;
          })(),
          continueBottomGap: (() => {
            const journey = document
              .querySelector<HTMLElement>('.chapter-archive')
              ?.getBoundingClientRect();
            const button = document
              .querySelector<HTMLElement>('.chapter-archive__continue')
              ?.getBoundingClientRect();
            return journey && button ? journey.bottom - button.bottom : -1;
          })(),
          titleTop:
            document
              .querySelector<HTMLElement>('.chapter-archive__title')
              ?.getBoundingClientRect().top ?? -1,
          title: (() => {
            const box = document
              .querySelector<HTMLElement>('.chapter-archive__title-group')
              ?.getBoundingClientRect();
            return box
              ? {
                  bottom: box.bottom,
                  center: box.left + box.width / 2,
                  top: box.top,
                }
              : null;
          })(),
        };
      });
      expect(desktopLayout.firstNodeLefts).toHaveLength(1);
      expect(desktopLayout.libraryColumns?.menuRight ?? Infinity).toBeLessThan(
        desktopLayout.libraryColumns?.subtopicLeft ?? 0,
      );
      expect(
        desktopLayout.maxObjectBottom,
        JSON.stringify(desktopLayout.objectBottoms),
      ).toBeLessThanOrEqual(surface.bottom);
      expect(desktopLayout.progress?.top ?? 0).toBeGreaterThanOrEqual(
        hudBottom,
      );
      expect(
        viewport.width - (desktopLayout.progress?.right ?? 0),
      ).toBeLessThanOrEqual(44);
      expect(desktopLayout.progress?.contentContained).toBe(true);
      expect(
        Math.abs((desktopLayout.title?.center ?? 0) - viewport.width / 2),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.min(
          desktopLayout.title?.bottom ?? 0,
          desktopLayout.progress?.bottom ?? 0,
        ) -
          Math.max(
            desktopLayout.title?.top ?? 0,
            desktopLayout.progress?.top ?? 0,
          ),
      ).toBeGreaterThan(0);
      expect(desktopLayout.library?.width ?? Infinity).toBeLessThanOrEqual(
        1004,
      );
      expect(
        Math.abs((desktopLayout.library?.center ?? 0) - viewport.width / 2),
      ).toBeLessThanOrEqual(1);
      expect(desktopLayout.continueBottomGap).toBeGreaterThanOrEqual(24);
      expect(
        (desktopLayout.progress?.top ?? 0) - surface.top,
      ).toBeGreaterThanOrEqual(24);
      expect(desktopLayout.titleTop - surface.top).toBeGreaterThanOrEqual(24);
      expect(desktopLayout.lowerControls.challengeActions).not.toBeNull();
      expect(
        desktopLayout.lowerControls.challengeActions?.right ?? Infinity,
      ).toBeLessThanOrEqual(desktopLayout.libraryColumns?.menuRight ?? 0);
      expect(
        Math.abs(
          ((desktopLayout.lowerControls.continueAction?.left ?? 0) +
            (desktopLayout.lowerControls.continueAction?.right ?? 0)) /
            2 -
            viewport.width / 2,
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        desktopLayout.lowerControls.pagination?.bottom ?? Infinity,
      ).toBeLessThanOrEqual(
        desktopLayout.lowerControls.continueAction?.top ?? 0,
      );
      expect(
        desktopLayout.overlaps,
        JSON.stringify(desktopLayout.boxDetails),
      ).toEqual([]);
    }

    const metrics = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>('.chapter-review-node'),
      );
      return {
        documentOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        labelsRightOfBooks: nodes.every((node) => {
          const book = node.querySelector<HTMLElement>(
            '.chapter-review-node__book',
          );
          const copy = node.querySelector<HTMLElement>(
            '.chapter-review-node__copy',
          );
          if (!book || !copy) return false;
          return (
            copy.getBoundingClientRect().left >=
            book.getBoundingClientRect().right - 1
          );
        }),
        textClipping: Array.from(
          document.querySelectorAll<HTMLElement>(
            '.chapter-archive__title, .chapter-archive__subtitle, .chapter-archive__subtopic-menu-name, .chapter-review-node__title, .chapter-review-node__status',
          ),
        )
          .filter(
            (element) =>
              element.scrollWidth > element.clientWidth + 1 ||
              element.scrollHeight > element.clientHeight + 1,
          )
          .map((element) => ({
            className: element.className,
            clientHeight: element.clientHeight,
            clientWidth: element.clientWidth,
            scrollHeight: element.scrollHeight,
            scrollWidth: element.scrollWidth,
            text: element.textContent,
          })),
      };
    });

    expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
    expect(metrics.textClipping).toEqual([]);
    if (viewport.width === 393) expect(metrics.labelsRightOfBooks).toBe(true);

    const beforeSelection = await page
      .locator('.chapter-review-node')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return {
            height: box.height,
            left: box.left,
            top: box.top,
            width: box.width,
          };
        }),
      );
    await hoverTarget.locator('button').click();
    const afterSelection = await page
      .locator('.chapter-review-node')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return {
            height: box.height,
            left: box.left,
            top: box.top,
            width: box.width,
          };
        }),
      );
    expect(afterSelection).toEqual(beforeSelection);
    await expect(hoverTarget).toHaveAttribute('data-selected', 'true');
    expect(
      await hoverArtifact.evaluate(
        (element) => getComputedStyle(element).transform,
      ),
    ).toBe('none');

    const controls = journey.locator(
      'button:visible, a:visible, summary:visible',
    );
    for (let index = 0; index < (await controls.count()); index += 1) {
      const box = await controls.nth(index).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await mkdir(`artifacts/design-audit/jrpg-chapter-entry/${viewport.label}`, {
      recursive: true,
    });
    await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      path: `artifacts/design-audit/jrpg-chapter-entry/${viewport.label}/chapter-entry.png`,
    });

    await journey.getByRole('button', { name: '下一頁' }).click();
    await expect(page.locator('.chapter-review-node')).toHaveCount(4);
    await expect(journey.getByText('第 2 / 2 頁')).toBeVisible();
    await expect(
      journey.getByRole('button', { name: '選擇複習卡：彩度的變化' }),
    ).toBeVisible();

    await subtopicMenu.getByRole('button', { name: '3-2 色彩體系' }).click();
    await expect(page.locator('.chapter-review-node')).toHaveCount(5);
    await expect(journey.getByText(/第 \d+ \/ \d+ 頁/u)).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: '3-2 色彩體系' }),
    ).toBeVisible();
    await journey
      .getByRole('button', { name: '選擇複習卡：常用的色彩體系' })
      .click();

    await journey.getByRole('button', { name: '進入複習' }).click();
    await expect(
      page.getByRole('region', { name: /複習卡閱讀：/u }),
    ).toBeVisible();
    await expect(page.getByRole('article')).toBeVisible();
    await expectSingleBackButtonBelowHud(page, '返回複習卡選擇');
  });
}
