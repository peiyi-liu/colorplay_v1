import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  invokeAdminMfa,
  listOwnVerifiedTotpFactorId,
} from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminMfaChallengePage } from './admin-mfa-challenge-page';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return {
    ...actual,
    invokeAdminMfa: vi.fn(),
    listOwnVerifiedTotpFactorId: vi.fn(),
  };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

function renderPage(
  initialEntries: NonNullable<
    Parameters<typeof MemoryRouter>[0]['initialEntries']
  >,
) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          element={<AdminMfaChallengePage />}
          path="/admin/mfa/challenge"
        />
        <Route element={<p>稽核頁</p>} path="/admin/audit" />
        <Route element={<p>admin 首頁</p>} path="/admin" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminMfaChallengePage', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.mocked(invokeAdminMfa).mockReset();
    vi.mocked(listOwnVerifiedTotpFactorId).mockReset();
    refetch.mockReset();
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 0,
      refetch,
      state: 'stale',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('returns to the saved intent and refetches session state on success', async () => {
    const user = userEvent.setup();
    vi.mocked(listOwnVerifiedTotpFactorId).mockResolvedValue('factor-1');
    vi.mocked(invokeAdminMfa).mockResolvedValue({ outcome: 'ok' });

    renderPage([
      { pathname: '/admin/mfa/challenge', state: { returnTo: '/admin/audit' } },
    ]);

    const input = await screen.findByLabelText('驗證碼');
    await user.type(input, '123456');
    await user.click(screen.getByRole('button', { name: '驗證' }));

    expect(await screen.findByText('稽核頁')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
    expect(invokeAdminMfa).toHaveBeenCalledWith({
      action: 'challenge',
      code: '123456',
      factorId: 'factor-1',
    });
  });

  it('stays on the page and lets the admin retry on a wrong code', async () => {
    const user = userEvent.setup();
    vi.mocked(listOwnVerifiedTotpFactorId).mockResolvedValue('factor-1');
    vi.mocked(invokeAdminMfa).mockResolvedValue({
      code: 'INSUFFICIENT_MFA',
      outcome: 'denied',
    });

    renderPage(['/admin/mfa/challenge']);

    const input = await screen.findByLabelText('驗證碼');
    await user.type(input, '000000');
    await user.click(screen.getByRole('button', { name: '驗證' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '需要重新完成雙因素驗證',
      );
    });
    expect(screen.getByRole('button', { name: '驗證' })).toBeEnabled();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('shows a fail-closed incident state with a traceable operation id and no bypass', async () => {
    const user = userEvent.setup();
    vi.mocked(listOwnVerifiedTotpFactorId).mockResolvedValue('factor-1');
    vi.mocked(invokeAdminMfa).mockResolvedValue({
      code: 'FACTOR_BINDING_MISMATCH',
      operationId: 'op-abc-123',
      outcome: 'denied',
    });

    renderPage(['/admin/mfa/challenge']);

    const input = await screen.findByLabelText('驗證碼');
    await user.type(input, '000000');
    await user.click(screen.getByRole('button', { name: '驗證' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('驗證器綁定異常');
    });
    expect(screen.getByText('op-abc-123')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('驗證碼')).not.toBeInTheDocument();
  });

  it('shows the incident state without an id line when the server omits one', async () => {
    const user = userEvent.setup();
    vi.mocked(listOwnVerifiedTotpFactorId).mockResolvedValue('factor-1');
    vi.mocked(invokeAdminMfa).mockResolvedValue({
      code: 'FACTOR_BINDING_MISMATCH',
      outcome: 'denied',
    });

    renderPage(['/admin/mfa/challenge']);

    const input = await screen.findByLabelText('驗證碼');
    await user.type(input, '000000');
    await user.click(screen.getByRole('button', { name: '驗證' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('驗證器綁定異常');
    });
    expect(
      screen.queryByTestId('incident-operation-id'),
    ).not.toBeInTheDocument();
  });

  it('waits for the session refetch to resolve before navigating away', async () => {
    const user = userEvent.setup();
    vi.mocked(listOwnVerifiedTotpFactorId).mockResolvedValue('factor-1');
    vi.mocked(invokeAdminMfa).mockResolvedValue({ outcome: 'ok' });
    let resolveRefetch: () => void = () => {
      throw new Error('resolveRefetch called before assignment');
    };
    refetch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRefetch = resolve;
        }),
    );

    renderPage(['/admin/mfa/challenge']);
    const input = await screen.findByLabelText('驗證碼');
    await user.type(input, '123456');
    await user.click(screen.getByRole('button', { name: '驗證' }));

    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
    expect(screen.queryByText('admin 首頁')).not.toBeInTheDocument();

    resolveRefetch();
    expect(await screen.findByText('admin 首頁')).toBeInTheDocument();
  });

  it('shows a generic failure message when the challenge call throws', async () => {
    const user = userEvent.setup();
    vi.mocked(listOwnVerifiedTotpFactorId).mockResolvedValue('factor-1');
    vi.mocked(invokeAdminMfa).mockRejectedValue(new Error('network down'));

    renderPage(['/admin/mfa/challenge']);
    const input = await screen.findByLabelText('驗證碼');
    await user.type(input, '123456');
    await user.click(screen.getByRole('button', { name: '驗證' }));

    expect(
      await screen.findByText('發生非預期的錯誤，請稍後再試或聯絡負責人。'),
    ).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('shows a generic failure message when the factor lookup fails unexpectedly', async () => {
    vi.mocked(listOwnVerifiedTotpFactorId).mockRejectedValue(new Error('boom'));

    renderPage(['/admin/mfa/challenge']);

    expect(
      await screen.findByText('發生非預期的錯誤，請稍後再試或聯絡負責人。'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('驗證碼')).not.toBeInTheDocument();
  });

  it('gives the submit button the standard primary-action affordances', async () => {
    vi.mocked(listOwnVerifiedTotpFactorId).mockResolvedValue('factor-1');

    renderPage(['/admin/mfa/challenge']);

    const button = await screen.findByRole('button', { name: '驗證' });
    expect(button).toHaveClass('primary-action');
    expect(button).toHaveAttribute('data-acceptance-target');
  });
});
