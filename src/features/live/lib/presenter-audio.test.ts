import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPresenterAudio } from './presenter-audio';

const fakeContext = () => {
  const oscillators: { start: ReturnType<typeof vi.fn> }[] = [];
  const closeMock = vi.fn();
  const context = {
    close: closeMock,
    createGain: () => ({
      connect: vi.fn(),
      gain: {
        linearRampToValueAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
      },
    }),
    createOscillator: () => {
      const oscillator = {
        connect: vi.fn(),
        frequency: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
        type: 'sine',
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    state: 'running',
  } as unknown as AudioContext;
  return { closeMock, context, oscillators };
};

describe('createPresenterAudio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates the context lazily and plays the reveal sting', () => {
    const { context, oscillators } = fakeContext();
    const factory = vi.fn(() => context);
    const audio = createPresenterAudio(factory);

    expect(factory).not.toHaveBeenCalled();
    audio.playReveal();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(oscillators.length).toBe(2);
    expect(oscillators[0]?.start).toHaveBeenCalled();
  });

  it('skips synthesis entirely while muted', () => {
    const factory = vi.fn(() => fakeContext().context);
    const audio = createPresenterAudio(factory);

    audio.setMuted(true);
    audio.playFanfare();
    audio.tick();

    expect(factory).not.toHaveBeenCalled();
  });

  it('keeps a single lobby loop and stops it on dispose', () => {
    const { closeMock, context, oscillators } = fakeContext();
    const audio = createPresenterAudio(() => context);

    audio.startLobbyLoop();
    audio.startLobbyLoop();
    const initialNotes = oscillators.length;
    expect(initialNotes).toBe(3);

    vi.advanceTimersByTime(2400);
    expect(oscillators.length).toBe(6);

    audio.dispose();
    vi.advanceTimersByTime(5000);
    expect(oscillators.length).toBe(6);
    expect(closeMock).toHaveBeenCalled();
  });
});
