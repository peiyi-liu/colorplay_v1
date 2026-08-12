import { describe, expect, it } from 'vitest';

import { withoutNumberPrefix } from './quiz-labels';

describe('withoutNumberPrefix', () => {
  it.each([
    ['3 色彩表示', '色彩表示'],
    ['3-1 色彩三要素', '色彩三要素'],
    ['第 3 章・色彩表示', '色彩表示'],
    ['3-1・色彩三要素', '色彩三要素'],
    ['色彩表示', '色彩表示'],
  ])('normalizes %s to %s', (title, expected) => {
    expect(withoutNumberPrefix(title)).toBe(expected);
  });
});
