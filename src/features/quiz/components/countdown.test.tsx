import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Countdown } from './countdown';

describe('Countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('derives the visible countdown from the server deadline and expires once', () => {
    const onExpire = vi.fn();
    render(
      <Countdown
        deadlineAt="2026-07-14T12:00:02.500Z"
        onExpire={onExpire}
        paused={false}
      />,
    );

    expect(screen.getByText('剩餘 3 秒')).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('時間到')).toBeVisible();
    expect(onExpire).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it('shows a terminal label without firing expiry while feedback is open', () => {
    const onExpire = vi.fn();
    render(
      <Countdown
        deadlineAt="2026-07-14T12:00:00.000Z"
        onExpire={onExpire}
        paused
      />,
    );

    expect(screen.getByText('已作答')).toBeVisible();
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('renders the ATB fill scaled to remaining time when startedAt is given', () => {
    vi.setSystemTime(new Date('2099-07-14T12:00:10.000Z'));
    const { container } = render(
      <Countdown
        deadlineAt="2099-07-14T12:00:20.000Z"
        onExpire={() => undefined}
        paused={false}
        startedAt="2099-07-14T12:00:00.000Z"
      />,
    );

    const fill = container.querySelector('.atb__fill');
    expect(fill).not.toBeNull();
    expect(fill).toHaveStyle({ transform: 'scaleX(0.5)' });
    expect(screen.getByText('剩餘 10 秒')).toBeVisible();
  });

  it('omits the ATB track when startedAt is absent', () => {
    const { container } = render(
      <Countdown
        deadlineAt="2099-07-14T12:00:20.000Z"
        onExpire={() => undefined}
        paused={false}
      />,
    );

    expect(container.querySelector('.atb__track')).toBeNull();
    expect(container.querySelector('.quiz-countdown')).not.toBeNull();
  });
});
