import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IDLE_LOGOUT_MS, useIdleLogout } from './use-idle-logout';

describe('useIdleLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onIdle after 30 minutes without activity', () => {
    const onIdle = vi.fn();
    renderHook(() => {
      useIdleLogout(true, onIdle);
    });

    act(() => {
      vi.advanceTimersByTime(IDLE_LOGOUT_MS - 1);
    });
    expect(onIdle).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('resets the countdown on user activity', () => {
    const onIdle = vi.fn();
    renderHook(() => {
      useIdleLogout(true, onIdle);
    });

    act(() => {
      vi.advanceTimersByTime(IDLE_LOGOUT_MS - 1000);
      window.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(IDLE_LOGOUT_MS - 1000);
    });
    expect(onIdle).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('does nothing while signed out and cleans up on unmount', () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() => {
      useIdleLogout(false, onIdle);
    });
    act(() => {
      vi.advanceTimersByTime(IDLE_LOGOUT_MS * 2);
    });
    expect(onIdle).not.toHaveBeenCalled();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
