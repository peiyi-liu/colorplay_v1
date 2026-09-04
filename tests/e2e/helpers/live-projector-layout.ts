import { expect, type Locator, type Page } from '@playwright/test';

export const expectInside = async (
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

export const expectFooterAligned = async (
  footer: Locator,
  presenter: Locator,
  tolerance = 1,
) => {
  const [footerBox, presenterBox] = await Promise.all([
    footer.boundingBox(),
    presenter.boundingBox(),
  ]);
  expect(footerBox).not.toBeNull();
  expect(presenterBox).not.toBeNull();
  if (!footerBox || !presenterBox) return;
  expect(
    Math.abs(
      footerBox.y + footerBox.height - (presenterBox.y + presenterBox.height),
    ),
  ).toBeLessThanOrEqual(tolerance);
};

export const visibleChildrenCenterOffset = (
  element: Element,
  viewportHeight: number,
) => {
  const boxes = Array.from(element.children)
    .filter((child) => getComputedStyle(child).display !== 'none')
    .map((child) => child.getBoundingClientRect());
  if (boxes.length === 0) throw new Error('visible content missing');
  const top = Math.min(...boxes.map((box) => box.top));
  const bottom = Math.max(...boxes.map((box) => box.bottom));
  return (top + bottom) / 2 - viewportHeight / 2;
};

export const measureLiveLobbyGeometry = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.live-presenter');
    const arena = document.querySelector<HTMLElement>('.live-presenter__wall');
    const lobby = document.querySelector<HTMLElement>('.live-presenter__lobby');
    const footer = document.querySelector<HTMLElement>(
      '.live-projector__controls',
    );
    const portraits = Array.from(
      document.querySelectorAll<HTMLElement>('.live-presenter__wall-chip'),
    );
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>('.live-projector__control'),
    ).map((control) => {
      const rect = control.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    });
    if (!root || !arena || !footer || !lobby) {
      throw new Error('missing Live projector');
    }
    const arenaBounds = arena.getBoundingClientRect();
    const footerBounds = footer.getBoundingClientRect();
    const rootBounds = root.getBoundingClientRect();
    const lobbyChildBounds = Array.from(lobby.children)
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => element.getBoundingClientRect());
    const lobbyClusterTop = Math.min(
      ...lobbyChildBounds.map((bounds) => bounds.top),
    );
    const lobbyClusterBottom = Math.max(
      ...lobbyChildBounds.map((bounds) => bounds.bottom),
    );
    return {
      contentCenterOffset:
        (lobbyClusterTop + lobbyClusterBottom) / 2 -
        document.documentElement.clientHeight / 2,
      arenaDoesNotScroll:
        arena.scrollHeight <= arena.clientHeight &&
        arena.scrollWidth <= arena.clientWidth,
      controls,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      footerBottomGap:
        document.documentElement.clientHeight - footerBounds.bottom,
      rootHeight: root.scrollHeight,
      rootBounds: {
        bottom: rootBounds.bottom,
        left: rootBounds.left,
        right: rootBounds.right,
        top: rootBounds.top,
      },
      rootWidth: root.scrollWidth,
      portraitsFit: portraits.every((portrait) => {
        const bounds = portrait.getBoundingClientRect();
        return (
          bounds.left >= arenaBounds.left - 1 &&
          bounds.right <= arenaBounds.right + 1 &&
          bounds.top >= arenaBounds.top - 1 &&
          bounds.bottom <= arenaBounds.bottom + 1 &&
          bounds.bottom <= footerBounds.top + 1
        );
      }),
      viewportHeight: document.documentElement.clientHeight,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
