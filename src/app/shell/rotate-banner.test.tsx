import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RotateBanner } from './rotate-banner';

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) =>
      listeners.add(cb),
    matches,
    media: '(orientation: portrait)',
    removeEventListener: (
      _: string,
      cb: (event: MediaQueryListEvent) => void,
    ) => listeners.delete(cb),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue(media as unknown as MediaQueryList),
  );
  return {
    fire: (next: boolean) => {
      media.matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
  };
}

describe('RotateBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('直向時以 status 角色顯示轉橫提示', () => {
    stubMatchMedia(true);
    render(<RotateBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('轉橫體驗更佳');
  });

  it('橫向時不渲染', () => {
    stubMatchMedia(false);
    render(<RotateBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('關閉後於同 session 記住不再顯示', async () => {
    stubMatchMedia(true);
    const { unmount } = render(<RotateBanner />);
    await userEvent.click(screen.getByRole('button', { name: '關閉轉向提示' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(sessionStorage.getItem('colorplay.rotate-banner-dismissed')).toBe(
      '1',
    );
    unmount();
    render(<RotateBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('轉向變化即時切換顯示', () => {
    const media = stubMatchMedia(false);
    render(<RotateBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    media.fire(true);
    expect(screen.getByRole('status')).toBeVisible();
  });
});
