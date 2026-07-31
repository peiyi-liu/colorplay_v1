import { describe, expect, it } from 'vitest';

import type { AchievementCatalogItem } from '../../achievements/types';
import { crossedLevelBoundary, unlockedSince } from './reward-derivations';

const item = (
  overrides: Partial<AchievementCatalogItem>,
): AchievementCatalogItem => ({
  badgeKey: 'first_quiz',
  description: '完成第一場挑戰',
  displayName: '初出茅廬',
  progress: 1,
  stableCode: 'first_quiz',
  state: 'unlocked',
  target: 1,
  unlockedAt: '2026-07-31T01:00:00.000Z',
  ...overrides,
});

describe('crossedLevelBoundary', () => {
  it('detects a crossing when this award pushes total past a 500 boundary', () => {
    expect(crossedLevelBoundary(750, 750, 500)).toBe(true);
    expect(crossedLevelBoundary(500, 100, 500)).toBe(true);
  });

  it('returns false without a crossing or without an award', () => {
    expect(crossedLevelBoundary(400, 100, 500)).toBe(false);
    expect(crossedLevelBoundary(750, 0, 500)).toBe(false);
    expect(crossedLevelBoundary(750, 750, 0)).toBe(false);
  });
});

describe('unlockedSince', () => {
  it('keeps only unlocked items at or after the boundary', () => {
    const kept = item({ stableCode: 'kept' });
    const older = item({
      stableCode: 'older',
      unlockedAt: '2026-07-30T00:00:00.000Z',
    });
    const locked = item({
      stableCode: 'locked',
      state: 'in_progress',
      unlockedAt: null,
    });
    expect(
      unlockedSince([kept, older, locked], '2026-07-31T01:00:00.000Z'),
    ).toEqual([kept]);
  });

  it('returns nothing for an invalid boundary', () => {
    expect(unlockedSince([item({})], 'not-a-date')).toEqual([]);
  });
});
