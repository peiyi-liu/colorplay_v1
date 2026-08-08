import { expect, test, type Page } from '@playwright/test';

import { TEST_USERS } from '../fixtures/users';
import { signInStudent } from './helpers/auth';

const SCROLL_EYEBROW = '學生端 · 森林王國村';
const SCROLL_TITLE = '學習地圖';
const SCROLL_INSTRUCTION = '選擇一棟建築，查看章節的複習、精熟度與解鎖條件。';

async function readDialogueGeometry(page: Page) {
  return page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(
      '.chapter-map__viewport',
    );
    const lane = document.querySelector<HTMLElement>(
      '.chapter-map__dialogue-lane',
    );
    const panel = document.querySelector<HTMLElement>('.chapter-map__panel');
    if (!viewport || !lane || !panel) {
      throw new Error('Learning map dialogue geometry is missing');
    }

    const viewportRect = viewport.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const panelChildren = Array.from(panel.children).map((child) => {
      const rect = child.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      };
    });

    return {
      lanePosition: getComputedStyle(lane).position,
      panel: {
        bottom: panelRect.bottom,
        clientHeight: panel.clientHeight,
        left: panelRect.left,
        overflowY: getComputedStyle(panel).overflowY,
        right: panelRect.right,
        scrollHeight: panel.scrollHeight,
        top: panelRect.top,
        width: panelRect.width,
      },
      panelChildren,
      viewport: {
        bottom: viewportRect.bottom,
        left: viewportRect.left,
        right: viewportRect.right,
        top: viewportRect.top,
        width: viewportRect.width,
      },
    };
  });
}

async function expectPanelContentComplete(page: Page) {
  const geometry = await readDialogueGeometry(page);
  expect(geometry.panel.overflowY).toBe('visible');
  expect(geometry.panel.scrollHeight).toBeLessThanOrEqual(
    geometry.panel.clientHeight + 1,
  );
  for (const child of geometry.panelChildren) {
    expect.soft(child.left).toBeGreaterThanOrEqual(geometry.panel.left - 1);
    expect.soft(child.right).toBeLessThanOrEqual(geometry.panel.right + 1);
    expect.soft(child.top).toBeGreaterThanOrEqual(geometry.panel.top - 1);
    expect.soft(child.bottom).toBeLessThanOrEqual(geometry.panel.bottom + 1);
  }
}

for (const viewport of [
  { height: 720, label: '1280x720', width: 1280 },
  { height: 375, label: '812x375', width: 812 },
] as const) {
  test(`keeps all scroll copy clear and legible at ${viewport.label}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signInStudent(page, TEST_USERS.learningStudent);

    const eyebrow = page.getByText(SCROLL_EYEBROW, { exact: true });
    const title = page.getByRole('heading', { level: 1, name: SCROLL_TITLE });
    const instruction = page.getByText(SCROLL_INSTRUCTION, { exact: true });
    await expect(eyebrow).toBeVisible();
    await expect(title).toBeVisible();
    await expect(instruction).toBeVisible();

    const typography = await page
      .locator('.chapter-map-scroll')
      .evaluate((scroll) => {
        const eyebrowElement =
          scroll.querySelector<HTMLElement>('p:first-child');
        const titleElement = scroll.querySelector<HTMLElement>('h1');
        const instructionElement =
          scroll.querySelector<HTMLElement>('p:last-child');
        if (!eyebrowElement || !titleElement || !instructionElement) {
          throw new Error('Learning map scroll copy is incomplete');
        }
        return {
          eyebrow: Number.parseFloat(getComputedStyle(eyebrowElement).fontSize),
          instruction: Number.parseFloat(
            getComputedStyle(instructionElement).fontSize,
          ),
          scrollHeight: scroll.getBoundingClientRect().height,
          title: Number.parseFloat(getComputedStyle(titleElement).fontSize),
        };
      });

    expect(typography.eyebrow).toBeGreaterThanOrEqual(11);
    expect(typography.title).toBeGreaterThanOrEqual(20);
    expect(typography.instruction).toBeGreaterThanOrEqual(11);
    expect(typography.scrollHeight).toBeGreaterThanOrEqual(56);
  });
}

test('places the complete chapter dialogue inside the desktop map bottom-right', async ({
  page,
}) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await signInStudent(page, TEST_USERS.learningStudent);

  const buildingButtons = page
    .getByRole('list', { name: '六章學習地圖' })
    .getByRole('button');
  await expect(buildingButtons).toHaveCount(6);

  const initial = await readDialogueGeometry(page);
  expect(initial.lanePosition).toBe('absolute');
  expect(initial.panel.width).toBeGreaterThanOrEqual(360);
  expect(initial.panel.width).toBeLessThanOrEqual(460);
  expect(initial.viewport.right - initial.panel.right).toBeGreaterThanOrEqual(
    8,
  );
  expect(initial.viewport.right - initial.panel.right).toBeLessThanOrEqual(28);
  expect(initial.viewport.bottom - initial.panel.bottom).toBeGreaterThanOrEqual(
    8,
  );
  expect(initial.viewport.bottom - initial.panel.bottom).toBeLessThanOrEqual(
    28,
  );

  for (let index = 0; index < 6; index += 1) {
    const button = buildingButtons.nth(index);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectPanelContentComplete(page);
  }
});

test('right-aligns the complete dialogue below the short-landscape map', async ({
  page,
}) => {
  await page.setViewportSize({ height: 375, width: 812 });
  await signInStudent(page, TEST_USERS.learningStudent);

  const buildingButtons = page
    .getByRole('list', { name: '六章學習地圖' })
    .getByRole('button');
  await expect(buildingButtons).toHaveCount(6);

  const initial = await readDialogueGeometry(page);
  expect(initial.lanePosition).toBe('relative');
  expect(initial.panel.top).toBeGreaterThanOrEqual(initial.viewport.bottom + 6);
  expect(initial.panel.width).toBeGreaterThanOrEqual(360);
  expect(initial.panel.width).toBeLessThanOrEqual(460);
  expect(initial.viewport.right - initial.panel.right).toBeGreaterThanOrEqual(
    0,
  );
  expect(initial.viewport.right - initial.panel.right).toBeLessThanOrEqual(14);

  for (let index = 0; index < 6; index += 1) {
    const button = buildingButtons.nth(index);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectPanelContentComplete(page);
  }
});

test('keeps the complete chapter dialogue in document flow below the portrait map', async ({
  page,
}) => {
  await page.setViewportSize({ height: 812, width: 375 });
  await signInStudent(page, TEST_USERS.learningStudent);
  await expect(
    page.getByRole('heading', { level: 1, name: SCROLL_TITLE }),
  ).toBeVisible();

  const geometry = await readDialogueGeometry(page);
  expect(geometry.lanePosition).toBe('relative');
  expect(geometry.panel.top).toBeGreaterThanOrEqual(
    geometry.viewport.bottom + 6,
  );
  expect(geometry.panel.width).toBeGreaterThanOrEqual(
    geometry.viewport.width - 24,
  );
  await expectPanelContentComplete(page);
});
