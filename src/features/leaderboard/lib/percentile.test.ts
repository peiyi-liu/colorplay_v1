import { describe, expect, it } from 'vitest';

import { toPercentile } from './percentile';

describe('toPercentile', () => {
  it('maps first place to PR 100', () => {
    expect(toPercentile(1, 50)).toBe(100);
  });

  it('maps mid ranks proportionally', () => {
    expect(toPercentile(23, 50)).toBe(56);
  });

  it('returns 0 for invalid inputs', () => {
    expect(toPercentile(0, 50)).toBe(0);
    expect(toPercentile(3, 0)).toBe(0);
    expect(toPercentile(51, 50)).toBe(0);
  });
});
