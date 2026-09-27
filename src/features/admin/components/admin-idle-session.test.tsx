import { act, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_IDLE_TIMEOUT_MS, AdminIdleSession } from './admin-idle-session';

describe('AdminIdleSession', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('signs out after 20 minutes without interaction', async () => {
    vi.useFakeTimers();
    const signOut = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminIdleSession
                onSignOut={signOut}
                onTouch={vi.fn().mockResolvedValue(undefined)}
              />
            }
          />
          <Route path="/login" element={<p>登入頁</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await act(() => vi.advanceTimersByTimeAsync(ADMIN_IDLE_TIMEOUT_MS));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('resets the 20-minute window while the operator is active', async () => {
    vi.useFakeTimers();
    const signOut = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminIdleSession
                onSignOut={signOut}
                onTouch={vi.fn().mockResolvedValue(undefined)}
              />
            }
          />
          <Route path="/login" element={<p>登入頁</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await act(() => vi.advanceTimersByTimeAsync(15 * 60 * 1_000));
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    await act(() => vi.advanceTimersByTimeAsync(10 * 60 * 1_000));
    expect(signOut).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(10 * 60 * 1_000));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
