import type { CSSProperties } from 'react';

export const CHAPTER_MAP_WORLD = { height: 800, width: 1200 } as const;

export type ChapterGroundAnchor = Readonly<{
  x: number;
  y: number;
  visualOffsetX: number;
  visualOffsetY: number;
}>;

export const CHAPTER_GROUND_ANCHORS: Readonly<
  Record<number, ChapterGroundAnchor>
> = {
  1: { x: 290, y: 298, visualOffsetX: 0, visualOffsetY: 8 },
  2: { x: 582, y: 282, visualOffsetX: 0, visualOffsetY: 8 },
  3: { x: 896, y: 298, visualOffsetX: 0, visualOffsetY: 8 },
  4: { x: 300, y: 575, visualOffsetX: 0, visualOffsetY: 8 },
  5: { x: 586, y: 620, visualOffsetX: 0, visualOffsetY: 8 },
  6: { x: 888, y: 575, visualOffsetX: 0, visualOffsetY: 8 },
};

export const ADVENTURER_GROUND_ANCHOR: ChapterGroundAnchor = {
  x: 496,
  y: 456,
  visualOffsetX: 0,
  visualOffsetY: 0,
};

type ChapterAnchorStyle = CSSProperties &
  Readonly<{
    '--chapter-anchor-x': string;
    '--chapter-anchor-y': string;
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

export const anchorStyle = (
  anchor: ChapterGroundAnchor,
): ChapterAnchorStyle => {
  assertVisualOffsetIsSafe(anchor);

  return {
    '--chapter-anchor-x': String(anchor.x),
    '--chapter-anchor-y': String(anchor.y),
    '--chapter-visual-offset-x': `${String(
      (anchor.visualOffsetX / CHAPTER_MAP_WORLD.width) * 100,
    )}cqw`,
    '--chapter-visual-offset-y': `${String(
      (anchor.visualOffsetY / CHAPTER_MAP_WORLD.height) * 100,
    )}cqh`,
    left: `${String((anchor.x / CHAPTER_MAP_WORLD.width) * 100)}%`,
    top: `${String((anchor.y / CHAPTER_MAP_WORLD.height) * 100)}%`,
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
