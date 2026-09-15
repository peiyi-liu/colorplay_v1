import { describe, expect, it } from 'vitest';
import { LEARNING_MAP_PLATFORMS } from '../../../../tests/fixtures/learning-map-platforms';

import {
  CHAPTER_GROUND_ANCHORS,
  CHAPTER_MAP_MOBILE_WORLD,
  CHAPTER_MAP_WORLD,
  anchorStyle,
  getChapterGroundAnchor,
} from './chapter-map-layout';

describe('chapter map world layout', () => {
  it('keeps the six building contact points at their specified logical coordinates', () => {
    expect(CHAPTER_MAP_WORLD).toEqual({ height: 941, width: 1672 });
    expect(CHAPTER_MAP_MOBILE_WORLD).toEqual({ height: 1672, width: 941 });
    Object.values(CHAPTER_GROUND_ANCHORS).forEach((anchor, index) => {
      expect({ x: anchor.x, y: anchor.y }).toEqual(
        LEARNING_MAP_PLATFORMS.desktop[index],
      );
      expect({ x: anchor.mobileX, y: anchor.mobileY }).toEqual(
        LEARNING_MAP_PLATFORMS.mobile[index],
      );
    });
  });

  it('converts logical points to world-relative styles without moving the ground point', () => {
    expect(anchorStyle(getChapterGroundAnchor(1))).toMatchObject({
      '--chapter-anchor-x': '480',
      '--chapter-anchor-y': '230',
      '--chapter-mobile-left': '51.010%',
      '--chapter-mobile-top': '16.447%',
      '--chapter-visual-offset-x': '0.000cqw',
      '--chapter-visual-offset-y': '0.000cqh',
      left: '28.708%',
      top: '24.442%',
    });
    expect(anchorStyle(getChapterGroundAnchor(6))).toMatchObject({
      left: '29.007%',
      top: '80.765%',
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
        mobileX: 500,
        mobileY: 270,
        x: 290,
        y: 298,
      }),
    ).toMatchObject({
      '--chapter-visual-offset-x': '0.359cqw',
      '--chapter-visual-offset-y': '-0.425cqh',
    });

    expect(() =>
      anchorStyle({
        visualOffsetX: 9,
        visualOffsetY: 0,
        mobileX: 500,
        mobileY: 270,
        x: 290,
        y: 298,
      }),
    ).toThrow('Chapter visual offset exceeds 8 logical pixels');
    expect(() =>
      anchorStyle({
        visualOffsetX: 0,
        visualOffsetY: -9,
        mobileX: 500,
        mobileY: 270,
        x: 290,
        y: 298,
      }),
    ).toThrow('Chapter visual offset exceeds 8 logical pixels');
  });
});
