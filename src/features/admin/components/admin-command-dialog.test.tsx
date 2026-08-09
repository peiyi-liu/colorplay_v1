import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../../../components/ui/toast';
import {
  invokeAdminCommand,
  type AdminCommandResponse,
} from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminCommandDialog } from './admin-command-dialog';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, invokeAdminCommand: vi.fn() };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

function Harness({
  onSettled,
}: Readonly<{ onSettled: (result: AdminCommandResponse) => void }>) {
  const [open, setOpen] = useState(true);
  if (!open) return <p>清單頁</p>;
  return (
    <AdminCommandDialog
      args={{ reason: undefined, target_principal_id: 'target-1' }}
      command="deactivate_admin"
      onCancel={() => {
        setOpen(false);
      }}
      onSettled={(result) => {
        setOpen(false);
        onSettled(result);
      }}
      requiresReason
      title="停用管理員"
    />
  );
}

function renderDialog(
  onSettled: (result: AdminCommandResponse) => void = vi.fn(),
) {
  render(
    <MemoryRouter initialEntries={['/admin/access/admins']}>
      <ToastProvider>
        <Routes>
          <Route
            element={<Harness onSettled={onSettled} />}
            path="/admin/access/admins"
          />
          <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('AdminCommandDialog', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.mocked(invokeAdminCommand).mockReset();
    refetch.mockReset();
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 0,
      refetch,
      state: 'privileged',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('blocks submission when the trimmed reason is under 10 characters', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('原因'), '太短');
    await user.click(screen.getByRole('button', { name: '確認' }));

    expect(
      await screen.findByText('請輸入至少 10 字的原因'),
    ).toBeInTheDocument();
    expect(invokeAdminCommand).not.toHaveBeenCalled();
  });

  it('closes and reports the result on success', async () => {
    const user = userEvent.setup();
    const onSettled = vi.fn();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      audit_event_id: 'audit-1',
      outcome: 'ok',
      result: 'deactivated',
    });
    renderDialog(onSettled);

    await user.type(screen.getByLabelText('原因'), '帳號異常需要立即停用處理');
    await user.click(screen.getByRole('button', { name: '確認' }));

    expect(await screen.findByText('清單頁')).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'ok' }),
    );
    expect(invokeAdminCommand).toHaveBeenCalledWith(
      'deactivate_admin',
      expect.any(String),
      expect.objectContaining({
        reason: '帳號異常需要立即停用處理',
        target_principal_id: 'target-1',
      }),
    );
    // spec §3.4:命令結果要以 aria-live 播報,不能只是「dialog 消失了」。
    expect(await screen.findByRole('status')).toHaveTextContent('操作已完成');
  });

  it('shows a clear denial message and keeps the dialog open for LAST_ADMIN_PROTECTED', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      code: 'LAST_ADMIN_PROTECTED',
      outcome: 'denied',
    });
    renderDialog();

    await user.type(screen.getByLabelText('原因'), '帳號異常需要立即停用處理');
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '不能對最後一位有效管理員執行此操作',
      );
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認' })).toBeEnabled();
  });

  it('refetches session state and redirects to challenge on STALE_PRIVILEGED_SESSION', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      code: 'STALE_PRIVILEGED_SESSION',
      outcome: 'denied',
    });
    renderDialog();

    await user.type(screen.getByLabelText('原因'), '帳號異常需要立即停用處理');
    await user.click(screen.getByRole('button', { name: '確認' }));

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('reuses the same idempotency key on a same-content retry', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      code: 'AUTHORIZATION_RECEIPT_INVALID',
      outcome: 'denied',
    });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      audit_event_id: 'audit-1',
      outcome: 'ok',
    });
    renderDialog();

    await user.type(screen.getByLabelText('原因'), '帳號異常需要立即停用處理');
    await user.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledTimes(2);
    });

    const calls = vi.mocked(invokeAdminCommand).mock.calls;
    const firstCall = calls[0];
    const secondCall = calls[1];
    if (!firstCall || !secondCall) {
      throw new Error('expected two invokeAdminCommand calls');
    }
    expect(secondCall[1]).toBe(firstCall[1]);
  });

  it('mints a fresh idempotency key after IDEMPOTENCY_CONFLICT', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      code: 'IDEMPOTENCY_CONFLICT',
      outcome: 'denied',
    });
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      audit_event_id: 'audit-1',
      outcome: 'ok',
    });
    renderDialog();

    await user.type(screen.getByLabelText('原因'), '帳號異常需要立即停用處理');
    await user.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledTimes(2);
    });

    const calls = vi.mocked(invokeAdminCommand).mock.calls;
    const firstCall = calls[0];
    const secondCall = calls[1];
    if (!firstCall || !secondCall) {
      throw new Error('expected two invokeAdminCommand calls');
    }
    expect(secondCall[1]).not.toBe(firstCall[1]);
  });

  it('cancels without invoking the command', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(await screen.findByText('清單頁')).toBeInTheDocument();
    expect(invokeAdminCommand).not.toHaveBeenCalled();
  });

  it('stops Escape from bubbling to document-level listeners (e.g. the mobile drawer, which is not a blocking overlay)', async () => {
    const user = userEvent.setup();
    const outerListener = vi.fn();
    document.addEventListener('keydown', outerListener);
    try {
      renderDialog();

      await user.keyboard('{Escape}');

      expect(await screen.findByText('清單頁')).toBeInTheDocument();
      expect(outerListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', outerListener);
    }
  });

  it('gives both actions the standard action affordances at 44px+', () => {
    renderDialog();

    const submit = screen.getByRole('button', { name: '確認' });
    const cancel = screen.getByRole('button', { name: '取消' });
    expect(submit).toHaveClass('primary-action');
    expect(submit).toHaveAttribute('data-primary-action');
    expect(cancel).toHaveClass('secondary-action');
  });

  it('moves focus into the dialog on open and restores it to the trigger on cancel', async () => {
    const user = userEvent.setup();
    function TriggerHarness() {
      const [open, setOpen] = useState(false);
      const [onSettled] = useState(() => vi.fn());
      return (
        <>
          <button
            onClick={() => {
              setOpen(true);
            }}
            type="button"
          >
            開啟
          </button>
          {open ? (
            <AdminCommandDialog
              args={{ target_principal_id: 'target-1' }}
              command="deactivate_admin"
              onCancel={() => {
                setOpen(false);
              }}
              onSettled={onSettled}
              requiresReason
              title="停用管理員"
            />
          ) : null}
        </>
      );
    }
    render(
      <MemoryRouter>
        <ToastProvider>
          <TriggerHarness />
        </ToastProvider>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: '開啟' });
    trigger.focus();
    await user.click(trigger);

    await waitFor(() => {
      expect(document.activeElement).toHaveAttribute(
        'id',
        'admin-command-dialog-reason',
      );
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
