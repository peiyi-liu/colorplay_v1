import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminRpc } from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminAuditPage } from './admin-audit-page';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, adminRpc: vi.fn() };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

const auditRows = [
  {
    action: 'admin_reveal_field',
    actor_principal_id: 'principal-1',
    actor_type: 'admin',
    admin_session_id: 'session-1',
    before_after_redacted: { column: 'full_name', resource: 'profiles' },
    compensates_event_id: null,
    correlation_id: 'corr-1',
    id: 'event-1',
    mfa_age_seconds: 42,
    occurred_at: '2026-08-09T10:00:00Z',
    reason_or_purpose_redacted: '家長來電確認學生身分需要核對',
    request_id: 'req-1',
    result: 'success',
    source_summary_redacted: null,
    target_principal_id: null,
    target_type: 'browser_resource',
  },
  {
    action: 'deactivate_admin',
    actor_principal_id: 'principal-1',
    actor_type: 'admin',
    admin_session_id: 'session-1',
    before_after_redacted: { after: 'deactivated', before: 'active' },
    compensates_event_id: null,
    correlation_id: 'corr-2',
    id: 'event-2',
    mfa_age_seconds: 10,
    occurred_at: '2026-08-09T09:00:00Z',
    reason_or_purpose_redacted: '帳號異常需要立即停用處理',
    request_id: 'req-2',
    result: 'LAST_ADMIN_PROTECTED',
    source_summary_redacted: null,
    target_principal_id: 'principal-2',
    target_type: 'admin_command',
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={['/admin/audit']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route element={children} path="/admin/audit" />
            <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<AdminAuditPage />, { wrapper: Wrapper });
}

describe('AdminAuditPage', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.mocked(adminRpc).mockReset();
    refetch.mockReset();
    refetch.mockResolvedValue(undefined);
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 60,
      refetch,
      state: 'privileged',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('shows a loading state before the query resolves', () => {
    vi.mocked(adminRpc).mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });

  it('renders redacted audit rows', async () => {
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: auditRows });
    renderPage();

    expect(await screen.findByText('admin_reveal_field')).toBeInTheDocument();
    expect(screen.getByText('deactivate_admin')).toBeInTheDocument();
    expect(screen.getByText('LAST_ADMIN_PROTECTED')).toBeInTheDocument();
    expect(screen.getByText('browser_resource')).toBeInTheDocument();
    expect(
      screen.getByText('家長來電確認學生身分需要核對'),
    ).toBeInTheDocument();
    expect(vi.mocked(adminRpc).mock.calls[0]?.[0]).toBe('admin_query_audit');
  });

  it('offers every spec §10 filter and passes them to the RPC', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: auditRows });
    renderPage();
    await screen.findByText('admin_reveal_field');

    await user.type(screen.getByLabelText('起始時間'), '2026-08-09T00:00');
    await user.type(screen.getByLabelText('結束時間'), '2026-08-09T23:59');
    await user.type(
      screen.getByLabelText('Actor principal'),
      '3f7c1b2e-4a5d-4c6e-8f90-1a2b3c4d5e6f',
    );
    await user.type(screen.getByLabelText('動作'), 'deactivate_admin');
    await user.type(screen.getByLabelText('目標類型'), 'admin_command');
    await user.type(screen.getByLabelText('結果'), 'success');
    await user.click(screen.getByRole('button', { name: '查詢' }));

    await waitFor(() => {
      expect(adminRpc).toHaveBeenCalledWith(
        'admin_query_audit',
        expect.objectContaining({
          p_action: 'deactivate_admin',
          p_actor_principal_id: '3f7c1b2e-4a5d-4c6e-8f90-1a2b3c4d5e6f',
          p_result: 'success',
          p_target_type: 'admin_command',
        }),
      );
    });
    const lastCall = vi.mocked(adminRpc).mock.calls.at(-1);
    if (!lastCall) throw new Error('expected an admin_query_audit call');
    // AGENTS.md:時間存 UTC、以 Asia/Taipei 解讀/顯示。datetime-local 沒有
    // 時區資訊,必須固定當成台北時間(+08:00),不能跟著瀏覽器時區跑。
    expect(lastCall[1].p_from).toBe('2026-08-08T16:00:00.000Z');
    expect(lastCall[1].p_to).toBe('2026-08-09T15:59:00.000Z');
  });

  it('sends null rather than empty strings for untouched filters', async () => {
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: auditRows });
    renderPage();
    await screen.findByText('admin_reveal_field');

    expect(adminRpc).toHaveBeenCalledWith('admin_query_audit', {
      p_action: null,
      p_actor_principal_id: null,
      p_cursor: null,
      p_from: null,
      p_result: null,
      p_target_type: null,
      p_to: null,
    });
  });

  it('loads the next audit page with the exact server-issued cursor and appends rows', async () => {
    const user = userEvent.setup();
    const laterRow = {
      ...auditRows[0],
      action: 'issue_admin_invitation',
      id: 'event-3',
    };
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMiJ9',
        outcome: 'ok',
        rows: auditRows,
      })
      .mockResolvedValueOnce({ outcome: 'ok', rows: [laterRow] });
    renderPage();
    await screen.findByText('admin_reveal_field');

    await user.click(screen.getByRole('button', { name: '載入更多' }));

    expect(
      await screen.findByText('issue_admin_invitation'),
    ).toBeInTheDocument();
    expect(screen.getByText('deactivate_admin')).toBeInTheDocument();
    const secondCall = vi.mocked(adminRpc).mock.calls[1];
    if (!secondCall) throw new Error('expected a second page request');
    expect(secondCall[1].p_cursor).toBe('eyJrIjoiMiJ9');
  });

  it('redirects to challenge when a later audit page expires the session', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMiJ9',
        outcome: 'ok',
        rows: auditRows,
      })
      .mockResolvedValueOnce({
        code: 'STALE_PRIVILEGED_SESSION',
        outcome: 'denied',
      });
    renderPage();
    await screen.findByText('admin_reveal_field');

    await user.click(screen.getByRole('button', { name: '載入更多' }));

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
  });

  it('surfaces a later audit page denial with a retry entry', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMiJ9',
        outcome: 'ok',
        rows: auditRows,
      })
      .mockResolvedValueOnce({
        code: 'COLUMN_NOT_ALLOWED',
        outcome: 'denied',
        request_id: 'req-audit-2',
      });
    renderPage();
    await screen.findByText('admin_reveal_field');

    await user.click(screen.getByRole('button', { name: '載入更多' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '此欄位不允許這項操作',
      );
    });
    expect(screen.getByText('admin_reveal_field')).toBeInTheDocument();
    // 可追蹤的 partial failure(spec §3.3):必須帶出 request ID
    expect(screen.getByText('req-audit-2')).toBeInTheDocument();
    // 非 retryable:不給註定重蹈覆轍的按鈕,改引導調整查詢條件
    expect(
      screen.queryByRole('button', { name: '重試載入更多' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/請調整查詢條件後重新查詢/u)).toBeInTheDocument();
  });

  it('offers a retry for the audit page only when the server marks it retryable', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMiJ9',
        outcome: 'ok',
        rows: auditRows,
      })
      .mockResolvedValueOnce({
        code: 'SECURITY_AUDIT_UNAVAILABLE',
        outcome: 'denied',
        retryable: true,
      });
    renderPage();
    await screen.findByText('admin_reveal_field');

    await user.click(screen.getByRole('button', { name: '載入更多' }));

    expect(
      await screen.findByRole('button', { name: '重試載入更多' }),
    ).toBeInTheDocument();
  });

  it('offers no load-more when the audit RPC issues no cursor', async () => {
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: auditRows });
    renderPage();
    await screen.findByText('admin_reveal_field');

    expect(
      screen.queryByRole('button', { name: '載入更多' }),
    ).not.toBeInTheDocument();
  });

  it('exposes no export or download control (spec §10)', async () => {
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: auditRows });
    renderPage();
    await screen.findByText('admin_reveal_field');

    expect(screen.queryByText(/匯出|下載|CSV|export|download/iu)).toBeNull();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(document.querySelector('a[href^="blob:"]')).toBeNull();
    expect(document.querySelector('a[href^="data:"]')).toBeNull();
  });

  it('shows a truthful empty state', async () => {
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: [] });
    renderPage();

    expect(
      await screen.findByText('這段期間沒有稽核事件。'),
    ).toBeInTheDocument();
  });

  it('shows a retryable error when the query throws', async () => {
    vi.mocked(adminRpc).mockRejectedValue(new Error('network down'));
    renderPage();

    expect(
      await screen.findByText('稽核查詢失敗，請稍後重試。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });

  it('translates a typed denial through the shared banner', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'COLUMN_NOT_ALLOWED',
      outcome: 'denied',
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '此欄位不允許這項操作',
      );
    });
  });

  it('keeps the filter form editable when the query fails, so a bad filter can be corrected', async () => {
    vi.mocked(adminRpc).mockRejectedValue(
      new Error('invalid input syntax for type uuid'),
    );
    renderPage();

    expect(
      await screen.findByText('稽核查詢失敗，請稍後重試。'),
    ).toBeInTheDocument();
    // 只留「重試」等於把同一個壞值再送一次,使用者永遠出不來
    expect(screen.getByLabelText('Actor principal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查詢' })).toBeInTheDocument();
  });

  it('rejects a malformed actor principal before spending a request', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: auditRows });
    renderPage();
    await screen.findByText('admin_reveal_field');
    const callsBefore = vi.mocked(adminRpc).mock.calls.length;

    await user.type(screen.getByLabelText('Actor principal'), 'not-a-uuid');
    await user.click(screen.getByRole('button', { name: '查詢' }));

    expect(
      await screen.findByText('Actor principal 必須是有效的 UUID'),
    ).toBeInTheDocument();
    expect(vi.mocked(adminRpc).mock.calls.length).toBe(callsBefore);
  });

  it('accepts a well-formed actor principal uuid', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({ outcome: 'ok', rows: auditRows });
    renderPage();
    await screen.findByText('admin_reveal_field');

    await user.type(
      screen.getByLabelText('Actor principal'),
      '3f7c1b2e-4a5d-4c6e-8f90-1a2b3c4d5e6f',
    );
    await user.click(screen.getByRole('button', { name: '查詢' }));

    await waitFor(() => {
      expect(adminRpc).toHaveBeenCalledWith(
        'admin_query_audit',
        expect.objectContaining({
          p_actor_principal_id: '3f7c1b2e-4a5d-4c6e-8f90-1a2b3c4d5e6f',
        }),
      );
    });
    expect(
      screen.queryByText('Actor principal 必須是有效的 UUID'),
    ).not.toBeInTheDocument();
  });

  it('redirects to challenge and refetches session state on a stale privileged session', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'STALE_PRIVILEGED_SESSION',
      outcome: 'denied',
    });
    renderPage();

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
  });
});
