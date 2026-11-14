import { describe, expect, it } from 'vitest';

import {
  calculateReadQueryRetryDelay,
  readQueryRetryDelay,
} from './read-retry';
import {
  calculateReadQueryRetryDelay as compatibleCalculate,
  readQueryRetryDelay as compatibleDelay,
  shouldRetryReviewMedia,
} from '../../features/learning/hooks/use-learning';
import { LearningError } from '../../features/learning/api/learning-repository';

describe('bounded read retry jitter', () => {
  it.each([
    [0, 250, 500],
    [1, 500, 1000],
    [2, 1000, 2000],
    [3, 2000, 4000],
    [20, 2000, 4000],
  ])(
    'bounds exponential attempt %i independently of randomness',
    (attempt, low, high) => {
      expect(calculateReadQueryRetryDelay(attempt, () => 0)).toBe(low);
      expect(calculateReadQueryRetryDelay(attempt, () => 1)).toBe(high);
    },
  );

  it('keeps learning exports compatible and preserves its unavailable media exception', () => {
    expect(compatibleCalculate).toBe(calculateReadQueryRetryDelay);
    expect(compatibleDelay).toBe(readQueryRetryDelay);
    expect(
      [0, 1, 2, 3].map((count) =>
        shouldRetryReviewMedia(count, new LearningError('UNAVAILABLE')),
      ),
    ).toEqual([true, true, true, false]);
    expect(
      shouldRetryReviewMedia(0, new LearningError('INVALID_RESPONSE')),
    ).toBe(false);
  });
});
