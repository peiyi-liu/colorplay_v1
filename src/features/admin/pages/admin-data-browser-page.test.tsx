import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminRpc, invokeAdminCommand } from '../api/admin-client';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminDataBrowserPage } from './admin-data-browser-page';

vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, adminRpc: vi.fn(), invokeAdminCommand: vi.fn() };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

const okRows = [
  {
    created_at: '2026-08-01T00:00:00Z',
    display_name: '小明',
    full_name: '王＊＊',
    id: 'row-1',
    login_account: '＊＊＊123',
    row_key: 'tok-row-1',
    role: 'student',
    updated_at: '2026-08-02T00:00:00Z',
  },
  {
    created_at: '2026-08-01T00:00:00Z',
    display_name: '小美',
    full_name: '陳＊＊',
    id: 'row-2',
    login_account: '＊＊＊456',
    row_key: 'tok-row-2',
    role: 'teacher',
    updated_at: '2026-08-02T00:00:00Z',
  },
];

const okResponse = { outcome: 'ok', page_size_limit: 50, rows: okRows };

/** 在同一個 route pattern 內只改 params,重現 React Router 重用元件實例的情況。 */
function SwitchResourceButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        void navigate('/admin/data/classrooms/classrooms');
      }}
      type="button"
    >
      切換資源
    </button>
  );
}

function renderPage(path = '/admin/data/users/profiles') {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route element={children} path="/admin/data/:domain/:resource" />
            <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  render(<AdminDataBrowserPage />, { wrapper: Wrapper });
  return queryClient;
}

describe('AdminDataBrowserPage', () => {
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

  it('shows a loading state before the resource resolves', () => {
    vi.mocked(adminRpc).mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });

  it('renders the server projection with personal columns kept masked', async () => {
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    renderPage();

    expect(await screen.findByText('小明')).toBeInTheDocument();
    // 遮罩值原樣呈現;頁面沒有任何地方出現明文
    expect(screen.getByText('王＊＊')).toBeInTheDocument();
    expect(screen.getByText('＊＊＊123')).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /profiles/u }),
    ).toBeInTheDocument();
    expect(vi.mocked(adminRpc).mock.calls[0]?.[0]).toBe('admin_list_resource');
    expect(vi.mocked(adminRpc).mock.calls[0]?.[1]).toMatchObject({
      p_domain: 'users',
      p_resource: 'profiles',
    });
  });

  it('offers filter and sort options strictly from the catalog', async () => {
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    renderPage();
    await screen.findByText('小明');

    const filterSelect = screen.getByLabelText('篩選欄位');
    const filterOptions = within(filterSelect)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(filterOptions).toEqual(['不篩選', 'role']);

    const sortSelect = screen.getByLabelText('排序欄位');
    const sortOptions = within(sortSelect)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(sortOptions).toEqual(['預設排序', 'display_name', 'created_at']);
  });

  it('re-queries with the catalog-shaped filter and sort arguments', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    renderPage();
    await screen.findByText('小明');

    await user.selectOptions(screen.getByLabelText('篩選欄位'), 'role');
    await user.type(screen.getByLabelText('篩選值'), 'teacher');
    await user.selectOptions(screen.getByLabelText('排序欄位'), 'created_at');
    await user.click(screen.getByRole('button', { name: '套用' }));

    await waitFor(() => {
      expect(adminRpc).toHaveBeenCalledWith(
        'admin_list_resource',
        expect.objectContaining({
          p_domain: 'users',
          p_filters: { role: { eq: 'teacher' } },
          p_resource: 'profiles',
          p_sort: { column: 'created_at' },
        }),
      );
    });
  });

  // 注意:現行 `admin_internal_deny` 只回 `{outcome, code}`,並不會附
  // request_id(spec §11 要求 response 含 request ID,是尚未補上的 DB 缺口)。
  // 這個案例證明的是「**萬一** server 之後補上就會顯示」的前向相容路徑,
  // 不代表今天的 RPC 會回這個欄位;真實形狀由下一個案例覆蓋。
  it('renders a request id only if a future server build supplies one, and never leaks existence', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'RESOURCE_NOT_ALLOWED',
      outcome: 'denied',
      request_id: '6f0f80d7-070d-568c-b65b-16b72a01ab45',
    });
    renderPage('/admin/data/users/secret_table');

    expect(await screen.findByText('此資源不可瀏覽')).toBeInTheDocument();
    expect(
      screen.getByText('6f0f80d7-070d-568c-b65b-16b72a01ab45'),
    ).toBeInTheDocument();
    // 不得洩漏資源是否存在
    expect(screen.queryByText(/不存在|找不到|已刪除/u)).toBeNull();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('never fabricates a request id for the shape the RPC actually returns today', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'RESOURCE_NOT_ALLOWED',
      outcome: 'denied',
    });
    renderPage('/admin/data/users/secret_table');

    expect(await screen.findByText('此資源不可瀏覽')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-request-id')).not.toBeInTheDocument();
  });

  it('offers no retry for a denial the server marked non-retryable', async () => {
    // §11 envelope:對決定性的拒絕重送同一個查詢只會再被拒一次,
    // 真正的出路是改條件重查,所以這裡不得留一個假的重試入口。
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'COLUMN_NOT_ALLOWED',
      message: '此欄位不允許這項操作。',
      outcome: 'denied',
      request_id: '4e4891dc-ee8b-5a3b-8396-fa098a2a3760',
      retryable: false,
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '此欄位不允許這項操作',
      );
    });
    expect(screen.getByTestId('admin-request-id')).toHaveTextContent(
      '4e4891dc-ee8b-5a3b-8396-fa098a2a3760',
    );
    expect(
      screen.queryByRole('button', { name: '重試' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('請調整篩選或排序條件後重新查詢。'),
    ).toBeInTheDocument();
  });

  it('keeps the retry entry for a denial the server marked retryable', async () => {
    vi.mocked(adminRpc).mockResolvedValue({
      code: 'SECURITY_AUDIT_UNAVAILABLE',
      message: '安全稽核暫時無法使用，操作已中止，請稍後再試。',
      outcome: 'denied',
      request_id: '42917e84-52b9-5782-816c-bab1aff4c74d',
      retryable: true,
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('安全稽核暫時無法');
    });
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });

  it('shows a retryable error when the list call throws', async () => {
    vi.mocked(adminRpc).mockRejectedValue(new Error('network down'));
    renderPage();

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
    renderPage();

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
  });

  it('opens the reveal dialog scoped to the clicked row and column', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    vi.mocked(invokeAdminCommand).mockResolvedValue({
      outcome: 'ok',
      value: '陳小美',
    });
    renderPage();
    await screen.findByText('小美');

    const secondRow = screen.getByText('小美').closest('tr') as HTMLElement;
    await user.click(
      within(secondRow).getByRole('button', { name: '揭露 full_name' }),
    );

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
        expect.objectContaining({
          column: 'full_name',
          domain: 'users',
          resource: 'profiles',
          row_token: 'tok-row-2',
        }),
      );
    });
  });

  it('returns the cell to its mask once the reveal dialog closes', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    vi.mocked(invokeAdminCommand).mockResolvedValue({
      outcome: 'ok',
      value: '陳小美',
    });
    renderPage();
    await screen.findByText('小美');

    const secondRow = screen.getByText('小美').closest('tr') as HTMLElement;
    await user.click(
      within(secondRow).getByRole('button', { name: '揭露 full_name' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('揭露目的'),
      '家長來電確認學生身分需要核對',
    );
    await user.click(within(dialog).getByRole('button', { name: '揭露' }));
    expect(await screen.findByText('陳小美')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '關閉' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('陳小美')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('陳小美');
    expect(screen.getByText('陳＊＊')).toBeInTheDocument();
  });

  it('keeps revealed plaintext out of the query cache entirely', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    vi.mocked(invokeAdminCommand).mockResolvedValue({
      outcome: 'ok',
      value: '陳小美',
    });
    const queryClient = renderPage();
    await screen.findByText('小美');

    const secondRow = screen.getByText('小美').closest('tr') as HTMLElement;
    await user.click(
      within(secondRow).getByRole('button', { name: '揭露 full_name' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('揭露目的'),
      '家長來電確認學生身分需要核對',
    );
    await user.click(within(dialog).getByRole('button', { name: '揭露' }));
    expect(await screen.findByText('陳小美')).toBeInTheDocument();

    const cacheDump = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((entry) => entry.state.data),
    );
    expect(cacheDump).not.toContain('陳小美');
  });

  it('drops revealed plaintext and the open dialog when the route switches resource', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    vi.mocked(invokeAdminCommand).mockResolvedValue({
      outcome: 'ok',
      value: '陳小美',
    });
    render(
      <MemoryRouter initialEntries={['/admin/data/users/profiles']}>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: {
                mutations: { retry: false },
                queries: { retry: false },
              },
            })
          }
        >
          <SwitchResourceButton />
          <Routes>
            <Route
              element={<AdminDataBrowserPage />}
              path="/admin/data/:domain/:resource"
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await screen.findByText('小美');
    const secondRow = screen.getByText('小美').closest('tr') as HTMLElement;
    await user.click(
      within(secondRow).getByRole('button', { name: '揭露 full_name' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('揭露目的'),
      '家長來電確認學生身分需要核對',
    );
    await user.click(within(dialog).getByRole('button', { name: '揭露' }));
    expect(await screen.findByText('陳小美')).toBeInTheDocument();

    // 同一個 route pattern 只換 params:React Router 會重用元件實例,
    // 明文與舊的 row/column 目標絕不能存活到新資源
    await user.click(screen.getByRole('button', { name: '切換資源' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.queryByText('陳小美')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('陳小美');
  });

  it('resets filter and sort state when the route switches resource', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    render(
      <MemoryRouter initialEntries={['/admin/data/users/profiles']}>
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: {
                mutations: { retry: false },
                queries: { retry: false },
              },
            })
          }
        >
          <SwitchResourceButton />
          <Routes>
            <Route
              element={<AdminDataBrowserPage />}
              path="/admin/data/:domain/:resource"
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await screen.findByText('小明');

    await user.selectOptions(screen.getByLabelText('篩選欄位'), 'role');
    await user.type(screen.getByLabelText('篩選值'), 'teacher');
    await user.click(screen.getByRole('button', { name: '套用' }));

    // role 是 profiles 的可篩選欄,對 classrooms 不成立;沿用舊 filter 會直接
    // 讓新資源的查詢吃到 COLUMN_NOT_ALLOWED
    await user.click(screen.getByRole('button', { name: '切換資源' }));

    await waitFor(() => {
      expect(screen.getByLabelText('篩選值')).toHaveValue('');
    });
    const lastCall = vi.mocked(adminRpc).mock.calls.at(-1);
    if (!lastCall) throw new Error('expected an admin_list_resource call');
    expect(lastCall[1].p_resource).toBe('classrooms');
    expect(lastCall[1].p_filters).toEqual({});
  });

  it('loads the next keyset page with the exact server-issued cursor and appends rows', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMSJ9',
        outcome: 'ok',
        page_size_limit: 2,
        rows: okRows,
      })
      .mockResolvedValueOnce({
        outcome: 'ok',
        page_size_limit: 2,
        rows: [
          {
            created_at: '2026-08-03T00:00:00Z',
            display_name: '小華',
            full_name: '林＊＊',
            id: 'row-3',
            login_account: '＊＊＊789',
            role: 'student',
            updated_at: '2026-08-03T00:00:00Z',
          },
        ],
      });
    renderPage();
    await screen.findByText('小明');

    await user.click(screen.getByRole('button', { name: '載入更多' }));

    expect(await screen.findByText('小華')).toBeInTheDocument();
    // 前一頁的資料要留著(累加),不是被換掉
    expect(screen.getByText('小明')).toBeInTheDocument();
    const secondCall = vi.mocked(adminRpc).mock.calls[1];
    if (!secondCall) throw new Error('expected a second page request');
    expect(secondCall[1].p_cursor).toBe('eyJrIjoiMSJ9');
  });

  it('redirects to challenge when a later page expires the privileged session', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMSJ9',
        outcome: 'ok',
        page_size_limit: 2,
        rows: okRows,
      })
      .mockResolvedValueOnce({
        code: 'STALE_PRIVILEGED_SESSION',
        outcome: 'denied',
      });
    renderPage();
    await screen.findByText('小明');

    await user.click(screen.getByRole('button', { name: '載入更多' }));

    // 第二頁的 denial 不能被 flatMap 靜靜吃掉 —— session 過期一定要導向 challenge
    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
  });

  it('does not bounce straight back to challenge after a successful round trip', async () => {
    const user = userEvent.setup();
    // 共用同一個 QueryClient 模擬「導向 challenge → 驗證成功 → 回到原頁」:
    // 若帶著 STALE denial 的快取沒被清掉,一掛載就會又被踢回 challenge。
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    function Harness() {
      return (
        <Routes>
          <Route
            element={<AdminDataBrowserPage />}
            path="/admin/data/:domain/:resource"
          />
          <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
        </Routes>
      );
    }
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMSJ9',
        outcome: 'ok',
        page_size_limit: 2,
        rows: okRows,
      })
      .mockResolvedValueOnce({
        code: 'STALE_PRIVILEGED_SESSION',
        outcome: 'denied',
      })
      .mockResolvedValue(okResponse);

    const first = render(
      <MemoryRouter initialEntries={['/admin/data/users/profiles']}>
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await screen.findByText('小明');
    await user.click(screen.getByRole('button', { name: '載入更多' }));
    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    first.unmount();

    // 驗證成功後回到原頁(同一個 QueryClient)
    render(
      <MemoryRouter initialEntries={['/admin/data/users/profiles']}>
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('小明')).toBeInTheDocument();
    expect(screen.queryByText('challenge 頁')).not.toBeInTheDocument();
  });

  it('surfaces a later-page denial without discarding the rows already loaded', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMSJ9',
        outcome: 'ok',
        page_size_limit: 2,
        rows: okRows,
      })
      .mockResolvedValueOnce({ code: 'COLUMN_NOT_ALLOWED', outcome: 'denied' });
    renderPage();
    await screen.findByText('小明');

    await user.click(screen.getByRole('button', { name: '載入更多' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '此欄位不允許這項操作',
      );
    });
    expect(screen.getByText('小明')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '載入更多' }),
    ).not.toBeInTheDocument();
    // server 沒說可重試:refetch 會原樣重送同一個 cursor/filter,只會再被拒
    // 一次。與其給一顆註定失敗的按鈕,不如引導使用者改查詢條件。
    expect(
      screen.queryByRole('button', { name: '重試載入更多' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/請調整篩選或排序條件後重新查詢/u),
    ).toBeInTheDocument();
  });

  it('retries the failed page and recovers the load-more entry', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMSJ9',
        outcome: 'ok',
        page_size_limit: 2,
        rows: okRows,
      })
      .mockResolvedValueOnce({
        code: 'SECURITY_AUDIT_UNAVAILABLE',
        outcome: 'denied',
        retryable: true,
      })
      .mockResolvedValue({
        next_cursor: 'eyJrIjoiMSJ9',
        outcome: 'ok',
        page_size_limit: 2,
        rows: okRows,
      });
    renderPage();
    await screen.findByText('小明');
    await user.click(screen.getByRole('button', { name: '載入更多' }));
    await screen.findByRole('button', { name: '重試載入更多' });

    await user.click(screen.getByRole('button', { name: '重試載入更多' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '載入更多' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: '重試載入更多' }),
    ).not.toBeInTheDocument();
  });

  it('explains an unrecognised later-page failure instead of showing an empty banner', async () => {
    const user = userEvent.setup();
    vi.mocked(adminRpc)
      .mockResolvedValueOnce({
        next_cursor: 'eyJrIjoiMSJ9',
        outcome: 'ok',
        page_size_limit: 2,
        rows: okRows,
      })
      .mockResolvedValueOnce({
        outcome: 'denied',
        request_id: 'e886d4de-ef1e-5d46-a25e-6b1b2cb4231b',
      });
    renderPage();
    await screen.findByText('小明');

    await user.click(screen.getByRole('button', { name: '載入更多' }));

    expect(
      await screen.findByText('載入更多資料失敗，請稍後重試。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('e886d4de-ef1e-5d46-a25e-6b1b2cb4231b'),
    ).toBeInTheDocument();
  });

  it('offers no load-more when the server issues no cursor', async () => {
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    renderPage();
    await screen.findByText('小明');

    expect(
      screen.queryByRole('button', { name: '載入更多' }),
    ).not.toBeInTheDocument();
  });

  it('links each row to its detail route using the server-issued row token', async () => {
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    renderPage();
    await screen.findByText('小明');

    const firstRow = screen.getByText('小明').closest('tr') as HTMLElement;
    expect(
      within(firstRow).getByRole('link', { name: '明細' }),
    ).toHaveAttribute('href', '/admin/data/users/profiles/tok-row-1');
  });

  it('never renders the navigation token as a data column', async () => {
    // row_key 是 opaque 導覽 token,不是資料:它不在 catalog 裡,若不明確
    // 排除就會被當成「server 多回的欄」顯示出來(spec §1.3.6)。
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    renderPage();
    await screen.findByText('小明');

    expect(
      screen.queryByRole('columnheader', { name: 'row_key' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('tok-row-1')).not.toBeInTheDocument();
  });

  it('reaches detail and reveal for a composite-key row that has no id column', async () => {
    // 複合主鍵資源(如 classroom_members)投影裡根本沒有 id 欄;定址完全
    // 依賴 server 簽發的 token,這正是 Task 13A 要補上的能力。
    const user = userEvent.setup();
    vi.mocked(adminRpc).mockResolvedValue({
      outcome: 'ok',
      page_size_limit: 50,
      rows: [
        {
          created_at: '2026-08-01T00:00:00Z',
          display_name: '小華',
          full_name: '林＊＊',
          login_account: '＊＊＊789',
          role: 'student',
          row_key: 'tok-composite-1',
          updated_at: '2026-08-02T00:00:00Z',
        },
      ],
    });
    vi.mocked(invokeAdminCommand).mockResolvedValue({
      outcome: 'ok',
      value: '林小華',
    });
    renderPage();
    await screen.findByText('小華');

    expect(screen.getByRole('link', { name: '明細' })).toHaveAttribute(
      'href',
      '/admin/data/users/profiles/tok-composite-1',
    );

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
        expect.objectContaining({ row_token: 'tok-composite-1' }),
      );
    });
    // 定址一律走 token,絕不改寫成 row_id(Edge 是 exactly one-of)
    const call = vi.mocked(invokeAdminCommand).mock.calls.at(-1);
    expect(call?.[2]).not.toHaveProperty('row_id');
  });

  it('exposes no export or download control (spec §7)', async () => {
    vi.mocked(adminRpc).mockResolvedValue(okResponse);
    renderPage();
    await screen.findByText('小明');

    expect(screen.queryByText(/匯出|下載|CSV|export|download/iu)).toBeNull();
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
