import { describe, expect, it } from 'vitest';

import { cueFor } from './live-audio-cue';

// Cue 是 Phase 之間變化的一次性事件（CONTEXT.md）：
// 屬於轉場、不屬於狀態，所以重連（previous === null）永不發聲。
describe('cueFor', () => {
  it('fires the reveal chime only on a live transition into reveal', () => {
    expect(cueFor('question', 'reveal')).toBe('reveal');
    expect(cueFor('paused', 'reveal')).toBe('reveal');
    expect(cueFor('reveal', 'reveal')).toBeNull();
  });

  it('fires the closing fanfare only on a live transition into the podium', () => {
    expect(cueFor('reveal', 'podium')).toBe('fanfare');
    expect(cueFor('podium', 'podium')).toBeNull();
  });

  it('stays silent on reconnect into any phase', () => {
    expect(cueFor(null, 'reveal')).toBeNull();
    expect(cueFor(null, 'podium')).toBeNull();
    expect(cueFor(null, 'lobby')).toBeNull();
  });

  it('has no cue for ordinary phase changes', () => {
    expect(cueFor('lobby', 'question')).toBe(null);
    expect(cueFor('question', 'paused')).toBeNull();
    expect(cueFor('paused', 'question')).toBeNull();
    expect(cueFor('reveal', 'question')).toBeNull();
  });
});
