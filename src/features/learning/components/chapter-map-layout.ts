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
  1: { x: 290, y: 298, visualOffsetX: 0, visualOffsetY: 0 },
  2: { x: 582, y: 282, visualOffsetX: 0, visualOffsetY: 0 },
  3: { x: 896, y: 298, visualOffsetX: 0, visualOffsetY: 0 },
  4: { x: 300, y: 575, visualOffsetX: 0, visualOffsetY: 0 },
  5: { x: 586, y: 620, visualOffsetX: 0, visualOffsetY: 0 },
  6: { x: 888, y: 575, visualOffsetX: 0, visualOffsetY: 0 },
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

export const anchorStyle = (
  anchor: ChapterGroundAnchor,
): ChapterAnchorStyle => ({
  '--chapter-anchor-x': String(anchor.x),
  '--chapter-anchor-y': String(anchor.y),
  '--chapter-visual-offset-x': `${String(anchor.visualOffsetX)}px`,
  '--chapter-visual-offset-y': `${String(anchor.visualOffsetY)}px`,
  left: `${String((anchor.x / CHAPTER_MAP_WORLD.width) * 100)}%`,
  top: `${String((anchor.y / CHAPTER_MAP_WORLD.height) * 100)}%`,
});

export const getChapterGroundAnchor = (
  sortOrder: number,
): ChapterGroundAnchor => {
  const anchor = CHAPTER_GROUND_ANCHORS[sortOrder];
  if (!anchor) {
    throw new Error(`Unknown chapter sort order: ${String(sortOrder)}`);
  }

  return anchor;
};
