import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invokeAdminMfa } from '../api/admin-client';
import { AdminMfaEnrollPage } from './admin-mfa-enroll-page';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, invokeAdminMfa: vi.fn() };
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/mfa/enroll']}>
      <Routes>
        <Route element={<AdminMfaEnrollPage />} path="/admin/mfa/enroll" />
        <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
        <Route element={<p>登入頁</p>} path="/login" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminMfaEnrollPage', () => {
  beforeEach(() => {
    vi.mocked(invokeAdminMfa).mockReset();
  });

  it('shows the enrollment secret/QR after begin-enrollment succeeds, and submits the 6-digit code', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminMfa).mockResolvedValueOnce({
      factorId: 'factor-1',
      outcome: 'ok',
      qrUri: 'otpauth://totp/example',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    vi.mocked(invokeAdminMfa).mockResolvedValueOnce({ outcome: 'ok' });

    renderPage();

    expect(await screen.findByTestId('totp-secret')).toHaveTextContent(
      'JBSWY3DPEHPK3PXP',
    );
    expect(screen.getByTitle('管理員驗證器設定 QR code')).toBeInTheDocument();
    await user.type(screen.getByLabelText('驗證碼'), '123456');
    await user.click(screen.getByRole('button', { name: '完成綁定' }));

    await waitFor(() => {
      expect(invokeAdminMfa).toHaveBeenCalledWith({
        action: 'confirm-enrollment',
        code: '123456',
        factorId: 'factor-1',
      });
    });
  });

  it('shows a re-login prompt when primary re-auth has expired', async () => {
    vi.mocked(invokeAdminMfa).mockResolvedValueOnce({
      code: 'INSUFFICIENT_MFA',
      outcome: 'denied',
    });

    renderPage();

    expect(
      await screen.findByText('請重新輸入密碼登入後再繼續'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回登入' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('disables submission once the account locks mid-enrollment', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminMfa).mockResolvedValueOnce({
      factorId: 'factor-1',
      outcome: 'ok',
      qrUri: 'otpauth://totp/example',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    vi.mocked(invokeAdminMfa).mockResolvedValueOnce({
      code: 'MFA_LOCKED',
      outcome: 'denied',
    });

    renderPage();
    await screen.findByTestId('totp-secret');
    await user.type(screen.getByLabelText('驗證碼'), '000000');
    await user.click(screen.getByRole('button', { name: '完成綁定' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '完成綁定' })).toBeDisabled();
    });
  });

  it('navigates to the challenge page once enrollment is confirmed', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminMfa).mockResolvedValueOnce({
      factorId: 'factor-1',
      outcome: 'ok',
      qrUri: 'otpauth://totp/example',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    vi.mocked(invokeAdminMfa).mockResolvedValueOnce({ outcome: 'ok' });

    renderPage();
    await screen.findByTestId('totp-secret');
    await user.type(screen.getByLabelText('驗證碼'), '123456');
    await user.click(screen.getByRole('button', { name: '完成綁定' }));

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
  });

  it('shows a generic failure message when begin-enrollment throws', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminMfa)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        factorId: 'factor-1',
        outcome: 'ok',
        qrUri: 'otpauth://totp/example',
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });

    renderPage();

    expect(
      await screen.findByText('發生非預期的錯誤，請稍後再試或聯絡負責人。'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('totp-secret')).not.toBeInTheDocument();
    const retry = screen.getByRole('button', {
      name: '重新載入驗證器設定',
    });
    expect(retry).toHaveFocus();
    await user.click(retry);
    expect(await screen.findByTestId('totp-secret')).toBeInTheDocument();
  });

  it('shows a generic failure message when confirm-enrollment throws', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminMfa).mockResolvedValueOnce({
      factorId: 'factor-1',
      outcome: 'ok',
      qrUri: 'otpauth://totp/example',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });
    vi.mocked(invokeAdminMfa).mockRejectedValueOnce(new Error('network down'));

    renderPage();
    await screen.findByTestId('totp-secret');
    await user.type(screen.getByLabelText('驗證碼'), '123456');
    await user.click(screen.getByRole('button', { name: '完成綁定' }));

    expect(
      await screen.findByText('發生非預期的錯誤，請稍後再試或聯絡負責人。'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('驗證碼')).toHaveFocus();
    expect(screen.getByRole('button', { name: '完成綁定' })).toBeEnabled();
  });

  it('gives the submit button the standard primary-action affordances', async () => {
    vi.mocked(invokeAdminMfa).mockResolvedValueOnce({
      factorId: 'factor-1',
      outcome: 'ok',
      qrUri: 'otpauth://totp/example',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    });

    renderPage();

    const button = await screen.findByRole('button', { name: '完成綁定' });
    expect(button).toHaveClass('primary-action');
    expect(button).toHaveAttribute('data-acceptance-target');
  });
});
