import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdminSessionState } from './use-admin-session-state';
import { useAdminStaleSessionRedirect } from './use-admin-stale-session-redirect';

vi.mock('./use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

function Probe({ isStale }: Readonly<{ isStale: boolean }>) {
  useAdminStaleSessionRedirect(isStale);
  return <p>目前頁面</p>;
}

function renderProbe(isStale: boolean) {
  return render(
    <MemoryRouter initialEntries={['/admin/access/admins']}>
      <Routes>
        <Route
          element={<Probe isStale={isStale} />}
          path="/admin/access/admins"
        />
        <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('useAdminStaleSessionRedirect', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    refetch.mockReset();
    refetch.mockResolvedValue(undefined);
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 0,
      refetch,
      state: 'stale',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('does nothing when the session is not stale', () => {
    renderProbe(false);

    expect(refetch).not.toHaveBeenCalled();
    expect(screen.getByText('目前頁面')).toBeInTheDocument();
  });

  it('refetches session state and redirects to challenge with return intent when stale', async () => {
    renderProbe(true);

    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
  });

  it('does not navigate after unmount even if refetch resolves late', async () => {
    let resolveRefetch: () => void = () => {
      throw new Error('resolveRefetch called before assignment');
    };
    refetch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRefetch = resolve;
        }),
    );
    const { unmount } = renderProbe(true);

    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
    unmount();
    resolveRefetch();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('challenge 頁')).not.toBeInTheDocument();
  });
});
