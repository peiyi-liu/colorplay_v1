import { describe, expect, it } from 'vitest';

import {
  CHAPTER_GROUND_ANCHORS,
  CHAPTER_MAP_WORLD,
  anchorStyle,
  getChapterGroundAnchor,
} from './chapter-map-layout';

describe('chapter map world layout', () => {
  it('keeps the six building contact points at their specified logical coordinates', () => {
    expect(CHAPTER_MAP_WORLD).toEqual({ height: 800, width: 1200 });
    expect(CHAPTER_GROUND_ANCHORS).toMatchObject({
      1: { x: 290, y: 298 },
      2: { x: 582, y: 282 },
      3: { x: 896, y: 298 },
      4: { x: 300, y: 575 },
      5: { x: 586, y: 620 },
      6: { x: 888, y: 575 },
    });
  });

  it('converts logical points to world-relative styles without moving the ground point', () => {
    expect(anchorStyle(getChapterGroundAnchor(1))).toMatchObject({
      '--chapter-anchor-x': '290',
      '--chapter-anchor-y': '298',
      '--chapter-visual-offset-x': '0cqw',
      '--chapter-visual-offset-y': '0cqh',
      left: '24.166666666666668%',
      top: '37.25%',
    });
    expect(anchorStyle(getChapterGroundAnchor(6))).toMatchObject({
      left: '74%',
      top: '71.875%',
    });
  });

  it('keeps visual offsets within eight logical pixels and rejects unknown chapter positions', () => {
    for (const anchor of Object.values(CHAPTER_GROUND_ANCHORS)) {
      expect(Math.abs(anchor.visualOffsetX)).toBeLessThanOrEqual(8);
      expect(Math.abs(anchor.visualOffsetY)).toBeLessThanOrEqual(8);
    }

    expect(() => getChapterGroundAnchor(7)).toThrow(
      'Unknown chapter sort order: 7',
    );
  });

  it('scales non-zero visual offsets with the logical world and rejects offsets outside its safety bound', () => {
    expect(
      anchorStyle({
        visualOffsetX: 6,
        visualOffsetY: -4,
        x: 290,
        y: 298,
      }),
    ).toMatchObject({
      '--chapter-visual-offset-x': '0.5cqw',
      '--chapter-visual-offset-y': '-0.5cqh',
    });

    expect(() =>
      anchorStyle({
        visualOffsetX: 9,
        visualOffsetY: 0,
        x: 290,
        y: 298,
      }),
    ).toThrow('Chapter visual offset exceeds 8 logical pixels');
    expect(() =>
      anchorStyle({
        visualOffsetX: 0,
        visualOffsetY: -9,
        x: 290,
        y: 298,
      }),
    ).toThrow('Chapter visual offset exceeds 8 logical pixels');
  });
});
