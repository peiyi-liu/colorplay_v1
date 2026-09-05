import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import {
  invokeAdminCommand,
  type AdminCommandResponse,
} from '../api/admin-client';
import { AdminCommandDialog } from './admin-command-dialog';
import { AdminOperationProvider } from './admin-operation-notices';
vi.mock('../api/admin-client', async (original) => ({
  ...(await original<typeof import('../api/admin-client')>()),
  invokeAdminCommand: vi.fn(),
}));
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: () => ({ state: 'privileged', refetch: vi.fn() }),
}));
afterEach(() => vi.useRealTimers());
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <ToastProvider>
          <AdminOperationProvider>
            {open ? (
              <AdminCommandDialog
                command="reset_admin_mfa"
                args={{
                  target_principal_id: '019fe0fe-a795-7c83-9412-27e368974a7c',
                }}
                requiresReason={false}
                title="重設驗證器"
                onCancel={() => {
                  setOpen(false);
                }}
                onSettled={() => {
                  setOpen(false);
                }}
              />
            ) : (
              <p>已關閉確認框</p>
            )}
          </AdminOperationProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
it('keeps a safe late result after stopping waiting without resending the command', async () => {
  vi.useFakeTimers();
  let resolve!: (value: AdminCommandResponse) => void;
  vi.mocked(invokeAdminCommand).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<Harness />);
  await act(async () => {
    await Promise.resolve();
    const form = screen.getByRole('button', { name: '確認' }).closest('form');
    if (!form) throw new Error('Expected command form');
    fireEvent.submit(form);
  });
  await act(() => vi.advanceTimersByTimeAsync(10_001));
  expect(screen.getByText(/關閉視窗不會撤銷/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '關閉視窗，稍後查看' }));
  await act(async () => {
    await Promise.resolve();
    resolve({
      outcome: 'ok',
      result: 'recovery_pending',
      password: 'SECRET_SENTINEL',
    });
  });
  expect(screen.getByText(/請求已受理，作業仍待處理/)).toBeVisible();
  expect(screen.queryByText(/SECRET_SENTINEL/)).not.toBeInTheDocument();
  expect(invokeAdminCommand).toHaveBeenCalledTimes(1);
});
it('does not claim completion after a network error or send again', async () => {
  vi.mocked(invokeAdminCommand)
    .mockReset()
    .mockRejectedValue(new Error('SECRET_SENTINEL'));
  render(<Harness />);
  await act(async () => {
    await Promise.resolve();
    const form = screen.getByRole('button', { name: '確認' }).closest('form');
    if (!form) throw new Error('Expected command form');
    fireEvent.submit(form);
  });
  expect(screen.getByRole('button', { name: '確認' })).toBeDisabled();
  expect(screen.queryByText(/SECRET_SENTINEL/)).not.toBeInTheDocument();
  expect(invokeAdminCommand).toHaveBeenCalledTimes(1);
});
