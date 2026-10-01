import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_IDLE_TIMEOUT_MS, AdminIdleSession } from './admin-idle-session';
import { ADMIN_SESSION_EXPIRED_EVENT } from '../api/admin-client';

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
  it('ends the login immediately when an admin command reports an expired MFA/session', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <AdminIdleSession
          onSignOut={signOut}
          onTouch={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );
    act(() => {
      window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT));
    });
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
  });
  it('counts nested scroll activity and persists the final interaction', async () => {
    vi.useFakeTimers();
    const signOut = vi.fn().mockResolvedValue(undefined);
    const touch = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <MemoryRouter>
        <AdminIdleSession onSignOut={signOut} onTouch={touch} />
        <div>表格</div>
      </MemoryRouter>,
    );
    await act(() => vi.advanceTimersByTimeAsync(15 * 60 * 1_000));
    act(() => {
      container
        .querySelector('div')
        ?.dispatchEvent(new Event('scroll', { bubbles: false }));
    });
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(touch).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(10 * 60 * 1_000));
    expect(signOut).not.toHaveBeenCalled();
  });
});
