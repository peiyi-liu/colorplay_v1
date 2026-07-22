import { describe, expect, it } from 'vitest';

import { encouragementFor, optionAccessibleName } from './standing-feedback';

describe('standing feedback copy', () => {
  it('names options with the color-shape double coding', () => {
    expect(optionAccessibleName(0, 'A')).toBe('選項 A：紅色三角形');
    expect(optionAccessibleName(3, 'D')).toBe('選項 D：綠色菱形');
  });

  it('celebrates the leader', () => {
    expect(
      encouragementFor({
        rank: 1,
        score: 300,
        participantCount: 5,
        aheadRank: null,
        pointsBehind: null,
      }),
    ).toBe('你是目前的全場第一，守住寶座！');
  });

  it('names the gap to the next rank', () => {
    expect(
      encouragementFor({
        rank: 3,
        score: 150,
        participantCount: 5,
        aheadRank: 2,
        pointsBehind: 120,
      }),
    ).toBe('差 120 分就能超越第 2 名，加油！');
  });

  it('handles an exact tie with the rank ahead', () => {
    expect(
      encouragementFor({
        rank: 2,
        score: 150,
        participantCount: 5,
        aheadRank: 1,
        pointsBehind: 0,
      }),
    ).toBe('和第 1 名同分，下一題就能反超！');
  });
});
