import { describe, expect, it } from 'vitest';

import { remainingSeconds, tick } from './live-clock';

// 由 live-pages.test.tsx（原 :153-164）原樣移入。
describe('remainingSeconds', () => {
  it('derives the countdown from server time, never the client clock alone', () => {
    const fetchedAt = 1_000_000;
    const serverTime = new Date(fetchedAt + 60_000).toISOString();
    const deadline = new Date(fetchedAt + 75_000).toISOString();
    expect(
      remainingSeconds(deadline, serverTime, fetchedAt + 5_000, fetchedAt),
    ).toBe(10);
    expect(remainingSeconds(null, serverTime, fetchedAt, fetchedAt)).toBeNull();
  });
});

describe('tick', () => {
  const fetchedAt = 1_000_000;
  const serverTime = new Date(fetchedAt + 60_000).toISOString();

  it('freezes the countdown from pausedRemainingMs while paused', () => {
    // 對照 live-session-page.tsx:418 與 teacher-live-session-page.tsx:207
    // 的 Math.ceil(pausedRemainingMs / 1000)。
    const paused = tick(
      { pausedRemainingMs: 4_200, serverTime, state: 'paused' },
      fetchedAt,
      fetchedAt,
    );
    expect(paused.secondsLeft).toBe(5);
    expect(paused.isFinalCountdown).toBe(false);
    expect(
      tick({ pausedRemainingMs: null, serverTime, state: 'paused' }, 0, 0)
        .secondsLeft,
    ).toBe(0);
  });

  it('derives ring fraction from the opened→deadline window, clamped to 0..1', () => {
    // 對照 live-presenter.tsx:82-89：分母 deadline − opened（至少 1ms），
    // 分子 secondsLeft × 1000，夾在 0..1。
    const openedAt = new Date(fetchedAt + 55_000).toISOString();
    const deadline = new Date(fetchedAt + 75_000).toISOString(); // 20 秒窗
    const halfway = tick(
      {
        question: { deadlineAt: deadline, openedAt },
        serverTime,
        state: 'question_open',
      },
      fetchedAt + 5_000, // server-now = +65s → 剩 10s / 20s 窗
      fetchedAt,
    );
    expect(halfway.secondsLeft).toBe(10);
    expect(halfway.fraction).toBeCloseTo(0.5, 5);
    // 沒有 openedAt 就沒有幾何：fraction 退為 0（原元件同行為）。
    const noGeometry = tick(
      {
        question: { deadlineAt: deadline, openedAt: null },
        serverTime,
        state: 'question_open',
      },
      fetchedAt,
      fetchedAt,
    );
    expect(noGeometry.fraction).toBe(0);
  });

  it('flags the final countdown only for the last five audible seconds', () => {
    // 對照 live-presenter.tsx:336：secondsLeft 1–5 才滴答，0 與 >5 不滴答。
    const at = (secondsLeft: number) =>
      tick(
        {
          question: {
            deadlineAt: new Date(
              fetchedAt + 60_000 + secondsLeft * 1000,
            ).toISOString(),
            openedAt: new Date(fetchedAt + 40_000).toISOString(),
          },
          serverTime,
          state: 'question_open',
        },
        fetchedAt,
        fetchedAt,
      );
    expect(at(5).isFinalCountdown).toBe(true);
    expect(at(1).isFinalCountdown).toBe(true);
    expect(at(6).isFinalCountdown).toBe(false);
    expect(at(0).isFinalCountdown).toBe(false);
  });
});
