import type { CSSProperties } from 'react';

export const CHAPTER_MAP_WORLD = { height: 941, width: 1672 } as const;
export const CHAPTER_MAP_MOBILE_WORLD = { height: 1672, width: 941 } as const;

export type ChapterGroundAnchor = Readonly<{
  x: number;
  y: number;
  mobileX: number;
  mobileY: number;
  visualOffsetX: number;
  visualOffsetY: number;
}>;

export const CHAPTER_GROUND_ANCHORS: Readonly<
  Record<number, ChapterGroundAnchor>
> = {
  1: {
    mobileX: 500,
    mobileY: 270,
    visualOffsetX: 0,
    visualOffsetY: 0,
    x: 480,
    y: 220,
  },
  2: {
    mobileX: 515,
    mobileY: 540,
    visualOffsetX: 0,
    visualOffsetY: 0,
    x: 1000,
    y: 210,
  },
  3: {
    mobileX: 320,
    mobileY: 735,
    visualOffsetX: 0,
    visualOffsetY: 0,
    x: 815,
    y: 500,
  },
  4: {
    mobileX: 585,
    mobileY: 900,
    visualOffsetX: 0,
    visualOffsetY: 0,
    x: 330,
    y: 515,
  },
  5: {
    mobileX: 335,
    mobileY: 1085,
    visualOffsetX: 0,
    visualOffsetY: 0,
    x: 1100,
    y: 735,
  },
  6: {
    mobileX: 540,
    mobileY: 1270,
    visualOffsetX: 0,
    visualOffsetY: 0,
    x: 480,
    y: 760,
  },
};

export const ADVENTURER_GROUND_ANCHOR: ChapterGroundAnchor = {
  mobileX: 470,
  mobileY: 1410,
  x: 496,
  y: 456,
  visualOffsetX: 0,
  visualOffsetY: 0,
};

type ChapterAnchorStyle = CSSProperties &
  Readonly<{
    '--chapter-anchor-x': string;
    '--chapter-anchor-y': string;
    '--chapter-mobile-left': string;
    '--chapter-mobile-top': string;
    '--chapter-visual-offset-x': string;
    '--chapter-visual-offset-y': string;
  }>;

const assertVisualOffsetIsSafe = (anchor: ChapterGroundAnchor): void => {
  if (
    Math.abs(anchor.visualOffsetX) > 8 ||
    Math.abs(anchor.visualOffsetY) > 8
  ) {
    throw new Error('Chapter visual offset exceeds 8 logical pixels');
  }
};

const percentage = (value: number, total: number): string =>
  `${((value / total) * 100).toFixed(3)}%`;

const containerOffset = (value: number, total: number, unit: 'cqh' | 'cqw') =>
  `${((value / total) * 100).toFixed(3)}${unit}`;

export const anchorStyle = (
  anchor: ChapterGroundAnchor,
): ChapterAnchorStyle => {
  assertVisualOffsetIsSafe(anchor);

  return {
    '--chapter-anchor-x': String(anchor.x),
    '--chapter-anchor-y': String(anchor.y),
    '--chapter-mobile-left': percentage(
      anchor.mobileX,
      CHAPTER_MAP_MOBILE_WORLD.width,
    ),
    '--chapter-mobile-top': percentage(
      anchor.mobileY,
      CHAPTER_MAP_MOBILE_WORLD.height,
    ),
    '--chapter-visual-offset-x': containerOffset(
      anchor.visualOffsetX,
      CHAPTER_MAP_WORLD.width,
      'cqw',
    ),
    '--chapter-visual-offset-y': containerOffset(
      anchor.visualOffsetY,
      CHAPTER_MAP_WORLD.height,
      'cqh',
    ),
    left: percentage(anchor.x, CHAPTER_MAP_WORLD.width),
    top: percentage(anchor.y, CHAPTER_MAP_WORLD.height),
  };
};

export const getChapterGroundAnchor = (
  sortOrder: number,
): ChapterGroundAnchor => {
  const anchor = CHAPTER_GROUND_ANCHORS[sortOrder];
  if (!anchor) {
    throw new Error(`Unknown chapter sort order: ${String(sortOrder)}`);
  }

  return anchor;
};
