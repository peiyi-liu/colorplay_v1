import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invokeAdminCommand } from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminRevealDialog } from './admin-reveal-dialog';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, invokeAdminCommand: vi.fn() };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

const PLAINTEXT = '王小明';

function Harness() {
  const [open, setOpen] = useState(true);
  if (!open) return <p>資料瀏覽器</p>;
  return (
    <AdminRevealDialog
      column="full_name"
      domain="users"
      onClose={() => {
        setOpen(false);
      }}
      resource="profiles"
      locator={{ kind: 'row_token', value: 'tok-row-1' }}
    />
  );
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={['/admin/data/users/profiles']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route element={<Harness />} path="/admin/data/:domain/:resource" />
          <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return queryClient;
}

async function submitPurpose(
  user: ReturnType<typeof userEvent.setup>,
  purpose = '家長來電確認學生身分需要核對',
) {
  await user.type(screen.getByLabelText('揭露目的'), purpose);
  await user.click(screen.getByRole('button', { name: '揭露' }));
}

describe('AdminRevealDialog', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.mocked(invokeAdminCommand).mockReset();
    refetch.mockReset();
    refetch.mockResolvedValue(undefined);
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 60,
      refetch,
      state: 'privileged',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('blocks submission when the trimmed purpose is under 10 characters', async () => {
    const user = userEvent.setup();
    renderDialog();

    await submitPurpose(user, '太短');

    expect(
      await screen.findByText('請輸入至少 10 字的揭露目的'),
    ).toBeInTheDocument();
    expect(invokeAdminCommand).not.toHaveBeenCalled();
  });

  it('reveals exactly one row and one column, and shows the plaintext in the dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'ok',
      value: PLAINTEXT,
    });
    renderDialog();

    await submitPurpose(user);

    expect(await screen.findByText(PLAINTEXT)).toBeInTheDocument();
    expect(invokeAdminCommand).toHaveBeenCalledTimes(1);
    expect(invokeAdminCommand).toHaveBeenCalledWith(
      'admin_reveal_field',
      expect.any(String),
      {
        column: 'full_name',
        domain: 'users',
        purpose: '家長來電確認學生身分需要核對',
        resource: 'profiles',
        row_token: 'tok-row-1',
      },
    );
  });

  it('clears the plaintext from the document once the dialog is closed', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'ok',
      value: PLAINTEXT,
    });
    renderDialog();

    await submitPurpose(user);
    expect(await screen.findByText(PLAINTEXT)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '關閉' }));

    expect(await screen.findByText('資料瀏覽器')).toBeInTheDocument();
    expect(screen.queryByText(PLAINTEXT)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(PLAINTEXT);
  });

  it('never persists the plaintext to the query cache, storage or a toast', async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'ok',
      value: PLAINTEXT,
    });
    const queryClient = renderDialog();

    await submitPurpose(user);
    expect(await screen.findByText(PLAINTEXT)).toBeInTheDocument();

    const cacheDump = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((entry) => entry.state.data),
    );
    expect(cacheDump).not.toContain(PLAINTEXT);
    for (const call of setItem.mock.calls) {
      expect(call[1]).not.toContain(PLAINTEXT);
    }
    expect(window.localStorage.getItem('full_name')).toBeNull();
    expect(document.querySelector('.ui-toast-container')).toBeNull();
    setItem.mockRestore();
  });

  it('does not fabricate plaintext when the command replays without a value', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'replayed',
      result: { column: 'full_name', resource: 'profiles', result: 'revealed' },
    });
    renderDialog();

    await submitPurpose(user);

    expect(
      await screen.findByText(/先前已揭露過，明文不會再次提供/u),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('reveal-plaintext')).not.toBeInTheDocument();
  });

  it('mints a fresh idempotency key after a replay so the advised re-request is not a guaranteed conflict', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand)
      .mockResolvedValueOnce({
        outcome: 'replayed',
        result: { column: 'full_name', resource: 'profiles' },
      })
      .mockResolvedValueOnce({ outcome: 'ok', value: PLAINTEXT });
    renderDialog();

    await submitPurpose(user);
    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledTimes(1);
    });
    // UI 叫使用者「以新的目的重新申請」;新目的 = 不同 request hash,
    // 沿用舊 key 必然撞 IDEMPOTENCY_CONFLICT(spec §8.2)
    await user.clear(screen.getByLabelText('揭露目的'));
    await user.type(
      screen.getByLabelText('揭露目的'),
      '稽核抽查需要核對本人姓名',
    );
    await user.click(screen.getByRole('button', { name: '揭露' }));
    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledTimes(2);
    });

    const calls = vi.mocked(invokeAdminCommand).mock.calls;
    const [first, second] = calls;
    if (!first || !second) throw new Error('expected two calls');
    expect(second[1]).not.toBe(first[1]);
  });

  it('reports an empty column instead of silently doing nothing when the value is null', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      outcome: 'ok',
      value: null,
    });
    renderDialog();

    await submitPurpose(user);

    expect(await screen.findByText(/此欄位目前是空值/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '關閉' })).toBeInTheDocument();
    expect(screen.queryByTestId('reveal-plaintext')).not.toBeInTheDocument();
  });

  it('keeps the dialog open and explains a typed denial', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      code: 'COLUMN_NOT_ALLOWED',
      outcome: 'denied',
    });
    renderDialog();

    await submitPurpose(user);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '此欄位不允許這項操作',
      );
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('reveal-plaintext')).not.toBeInTheDocument();
  });

  it('redirects to challenge and refetches session state on a stale privileged session', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand).mockResolvedValueOnce({
      code: 'STALE_PRIVILEGED_SESSION',
      outcome: 'denied',
    });
    renderDialog();

    await submitPurpose(user);

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });

  it('reuses the idempotency key on retry but mints a fresh one after IDEMPOTENCY_CONFLICT', async () => {
    const user = userEvent.setup();
    vi.mocked(invokeAdminCommand)
      .mockResolvedValueOnce({
        code: 'AUTHORIZATION_RECEIPT_INVALID',
        outcome: 'denied',
      })
      .mockResolvedValueOnce({
        code: 'IDEMPOTENCY_CONFLICT',
        outcome: 'denied',
      })
      .mockResolvedValueOnce({ outcome: 'ok', value: PLAINTEXT });
    renderDialog();

    await submitPurpose(user);
    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledTimes(1);
    });
    await user.click(screen.getByRole('button', { name: '揭露' }));
    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledTimes(2);
    });
    await user.click(screen.getByRole('button', { name: '揭露' }));
    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledTimes(3);
    });

    const calls = vi.mocked(invokeAdminCommand).mock.calls;
    const [first, second, third] = calls;
    if (!first || !second || !third) {
      throw new Error('expected three invokeAdminCommand calls');
    }
    expect(second[1]).toBe(first[1]);
    expect(third[1]).not.toBe(second[1]);
  });

  it('closes on Escape without leaking the key to document listeners, and restores focus', async () => {
    const user = userEvent.setup();
    const outerListener = vi.fn();
    document.addEventListener('keydown', outerListener);
    try {
      function TriggerHarness() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button
              onClick={() => {
                setOpen(true);
              }}
              type="button"
            >
              揭露 full_name
            </button>
            {open ? (
              <AdminRevealDialog
                column="full_name"
                domain="users"
                onClose={() => {
                  setOpen(false);
                }}
                resource="profiles"
                locator={{ kind: 'row_token', value: 'tok-row-1' }}
              />
            ) : null}
          </>
        );
      }
      render(
        <MemoryRouter>
          <QueryClientProvider client={new QueryClient()}>
            <TriggerHarness />
          </QueryClientProvider>
        </MemoryRouter>,
      );

      const trigger = screen.getByRole('button', { name: '揭露 full_name' });
      trigger.focus();
      await user.click(trigger);
      await waitFor(() => {
        expect(document.activeElement).toHaveAttribute(
          'id',
          'admin-reveal-dialog-purpose',
        );
      });

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(document.activeElement).toBe(trigger);
      });
      expect(outerListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', outerListener);
    }
  });
});
