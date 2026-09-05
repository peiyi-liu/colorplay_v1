import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminRpc, invokeAdminCommand } from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminDataDetailPage } from './admin-data-detail-page';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, adminRpc: vi.fn(), invokeAdminCommand: vi.fn() };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

const ROW_UUID = '3f7c1b2e-4a5d-4c6e-8f90-1a2b3c4d5e6f';

const profileRow = {
  created_at: '2026-08-01T00:00:00Z',
  display_name: '小明',
  full_name: '王＊＊',
  id: ROW_UUID,
  login_account: '＊＊＊123',
  role: 'student',
  updated_at: '2026-08-02T00:00:00Z',
};

/** spec §1.3.5:rowKey＝base64url(canonical JSON,鍵依字母序)。 */
function encodeRowKey(key: Record<string, string>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(key).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
  );
  const bytes = new TextEncoder().encode(canonical);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route
              element={children}
              path="/admin/data/:domain/:resource/:rowKey"
            />
            <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(<AdminDataDetailPage />, { wrapper: Wrapper });
}

describe('AdminDataDetailPage', () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.mocked(adminRpc).mockReset();
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

  it('shows a loading state before the row resolves', () => {
    vi.mocked(adminRpc).mockReturnValue(new Promise(() => undefined));
    renderPage(`/admin/data/users/profiles/${ROW_UUID}`);

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });

  it('addresses a bare uuid rowKey through the uuid overload', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      relations: [],
      row: profileRow,
    });
    renderPage(`/admin/data/users/profiles/${ROW_UUID}`);

    expect(await screen.findByText('小明')).toBeInTheDocument();
    expect(adminRpc).toHaveBeenCalledWith('admin_get_resource_detail', {
      p_domain: 'users',
      p_resource: 'profiles',
      p_row_id: ROW_UUID,
    });
  });

  it('passes a composite-key row token through verbatim without decoding it', async () => {
    // spec §1.3.6:token 是 server 簽發的 opaque 值。前端解碼它、或把它
    // 重建成 jsonb 物件,就等於在前端複製 server 的定址編碼規則 ——
    // 那是可信邊界禁止的,也是 hash drift 的來源。
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      relations: [],
      row: { created_at: '2026-08-01T00:00:00Z', user_id: 'u1' },
    });
    const rowToken = encodeRowKey({ classroom_id: 'c1', user_id: 'u1' });
    renderPage(`/admin/data/classrooms/classroom_members/${rowToken}`);

    await waitFor(() => {
      expect(adminRpc).toHaveBeenCalledWith('admin_get_resource_detail', {
        p_domain: 'classrooms',
        p_resource: 'classroom_members',
        p_row_token: rowToken,
      });
    });
    const call = vi.mocked(adminRpc).mock.calls.at(-1);
    expect(call?.[1]).not.toHaveProperty('p_row_key');
    expect(call?.[1]).not.toHaveProperty('p_row_id');
  });

  it('reveals a composite-key row through the same token it was loaded with', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      relations: [],
      row: { full_name: '林＊＊', user_id: 'u1' },
    });
    vi.mocked(invokeAdminCommand).mockResolvedValue({
      outcome: 'ok',
      value: '林小華',
    });
    const rowToken = encodeRowKey({ classroom_id: 'c1', user_id: 'u1' });
    renderPage(`/admin/data/users/profiles/${rowToken}`);
    await screen.findByText('林＊＊');

    await user.click(screen.getByRole('button', { name: '揭露 full_name' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('揭露目的'),
      '家長來電確認學生身分需要核對',
    );
    await user.click(within(dialog).getByRole('button', { name: '揭露' }));

    await waitFor(() => {
      expect(invokeAdminCommand).toHaveBeenCalledWith(
        'admin_reveal_field',
        expect.any(String),
        expect.objectContaining({ row_token: rowToken }),
      );
    });
    // 沒有 id 欄的資源以前根本開不了 reveal;定址一律沿用本頁的 token
    const call = vi.mocked(invokeAdminCommand).mock.calls.at(-1);
    expect(call?.[2]).not.toHaveProperty('row_id');
  });

  it('keeps personal fields masked and offers reveal for them only', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      relations: [],
      row: profileRow,
    });
    renderPage(`/admin/data/users/profiles/${ROW_UUID}`);

    expect(await screen.findByText('王＊＊')).toBeInTheDocument();
    expect(screen.getByText('＊＊＊123')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '揭露 full_name' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '揭露 display_name' }),
    ).not.toBeInTheDocument();
  });

  it('reveals a single field from the detail view without persisting plaintext', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      relations: [],
      row: profileRow,
    });
    vi.mocked(invokeAdminCommand).mockResolvedValue({
      outcome: 'ok',
      value: '王小明',
    });
    renderPage(`/admin/data/users/profiles/${ROW_UUID}`);
    await screen.findByText('王＊＊');

    await user.click(screen.getByRole('button', { name: '揭露 full_name' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('揭露目的'),
      '家長來電確認學生身分需要核對',
    );
    await user.click(within(dialog).getByRole('button', { name: '揭露' }));

    expect(await screen.findByText('王小明')).toBeInTheDocument();
    expect(invokeAdminCommand).toHaveBeenCalledWith(
      'admin_reveal_field',
      expect.any(String),
      expect.objectContaining({
        column: 'full_name',
        domain: 'users',
        resource: 'profiles',
        row_id: ROW_UUID,
      }),
    );

    await user.click(screen.getByRole('button', { name: '關閉' }));
    expect(screen.queryByText('王小明')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('王小明');
  });

  it('reports a missing row without leaking whether it ever existed', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      relations: [],
      row: null,
    });
    renderPage(`/admin/data/users/profiles/${ROW_UUID}`);

    expect(await screen.findByText('查無此筆資料')).toBeInTheDocument();
    expect(screen.queryByText(/已刪除|不存在於|曾經/u)).toBeNull();
  });

  it('refuses a row key whose characters cannot belong to a token at all', async () => {
    // 只檢查字元集,不解碼(spec §1.3.6)。明顯打錯的網址得到「位址無效」,
    // 而不是一句語意不符的欄位拒絕。
    renderPage('/admin/data/users/profiles/not a valid key');

    expect(await screen.findByText('此筆資料位址無效')).toBeInTheDocument();
    expect(adminRpc).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '返回列表' })).toBeInTheDocument();
  });

  it('lets the server judge a well-formed token it cannot decode', async () => {
    // 字元集合法但內容無效的 token 不由前端判斷 —— 前端沒有、也不該有
    // 解碼能力;server 會回 typed denial。
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'COLUMN_NOT_ALLOWED',
      message: '此欄位不允許這項操作。',
      outcome: 'denied',
      request_id: '212dfc6c-8112-5215-a37d-e44daf5624e1',
      retryable: false,
    });
    renderPage('/admin/data/users/profiles/not-a-valid-key');

    await waitFor(() => {
      expect(adminRpc).toHaveBeenCalledWith('admin_get_resource_detail', {
        p_domain: 'users',
        p_resource: 'profiles',
        p_row_token: 'not-a-valid-key',
      });
    });
    expect(await screen.findByTestId('admin-request-id')).toHaveTextContent(
      '212dfc6c-8112-5215-a37d-e44daf5624e1',
    );
    // 非可重試的拒絕不留假的重試入口
    expect(
      screen.queryByRole('button', { name: '重試' }),
    ).not.toBeInTheDocument();
  });

  it('shows the unbrowsable message on RESOURCE_NOT_ALLOWED', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'RESOURCE_NOT_ALLOWED',
      outcome: 'denied',
    });
    renderPage(`/admin/data/users/secret_table/${ROW_UUID}`);

    expect(await screen.findByText('此資源不可瀏覽')).toBeInTheDocument();
  });

  it('translates a typed denial through the shared banner', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'COLUMN_NOT_ALLOWED',
      outcome: 'denied',
    });
    renderPage(`/admin/data/users/profiles/${ROW_UUID}`);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '此欄位不允許這項操作',
      );
    });
  });

  it('shows a retryable error when the detail call throws', async () => {
    vi.mocked(adminRpc).mockRejectedValue(new Error('network down'));
    renderPage(`/admin/data/users/profiles/${ROW_UUID}`);

    expect(
      await screen.findByText('資料載入失敗，請稍後重試。'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });

  it('redirects to challenge and refetches session state on a stale privileged session', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'STALE_PRIVILEGED_SESSION',
      outcome: 'denied',
    });
    renderPage(`/admin/data/users/profiles/${ROW_UUID}`);

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
  });

  it('links back to the resource list and exposes no export control', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      relations: [],
      row: profileRow,
    });
    renderPage(`/admin/data/users/profiles/${ROW_UUID}`);
    await screen.findByText('小明');

    expect(screen.getByRole('link', { name: '返回列表' })).toHaveAttribute(
      'href',
      '/admin/data/users/profiles',
    );
    expect(screen.queryByText(/匯出|下載|CSV|export|download/iu)).toBeNull();
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
