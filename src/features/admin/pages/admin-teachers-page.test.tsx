import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeacherAccountRepository } from '../api/teacher-account-repository';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminTeachersPage } from './admin-teachers-page';

const repository = vi.hoisted(() => ({
  createTeacher: vi.fn<TeacherAccountRepository['createTeacher']>(),
  getOperation: vi.fn<TeacherAccountRepository['getOperation']>(),
  getTeacher: vi.fn<TeacherAccountRepository['getTeacher']>(),
  listTeachers: vi.fn<TeacherAccountRepository['listTeachers']>(),
  resetTeacherPassword:
    vi.fn<TeacherAccountRepository['resetTeacherPassword']>(),
  updateTeacher: vi.fn<TeacherAccountRepository['updateTeacher']>(),
}));

vi.mock('../api/teacher-account-repository', async () => {
  const actual = await vi.importActual<
    typeof import('../api/teacher-account-repository')
  >('../api/teacher-account-repository');
  return {
    ...actual,
    createTeacherAccountRepository: () =>
      repository as unknown as TeacherAccountRepository,
  };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const TEACHER_ID = '11111111-1111-4111-8111-111111111111';
const PASSWORD = 'A1!abc234567';

const listResult = {
  nextCursor: null,
  outcome: 'ok' as const,
  requestId: REQUEST_ID,
  rows: [
    {
      contactEmailMasked: 't***@example.test',
      contactEmailPresent: true,
      createdAt: '2026-09-03T08:00:00+00:00',
      displayName: '王老師',
      loginAccount: 'teacher01',
      operationState: 'ready' as const,
      teacherId: TEACHER_ID,
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={['/admin/teachers']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route element={children} path="/admin/teachers" />
            <Route
              element={<h1>教師詳情</h1>}
              path="/admin/teachers/:teacherId"
            />
            <Route element={<p>健康狀態頁</p>} path="/admin/health" />
            <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return {
    queryClient,
    ...render(<AdminTeachersPage />, { wrapper: Wrapper }),
  };
}

async function submitCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '新增教師' }));
  await user.type(screen.getByLabelText('教師姓名'), '陳老師');
  await user.type(
    screen.getByLabelText('操作原因'),
    '建立教師帳號供新學期課程使用',
  );
  await user.click(screen.getByRole('button', { name: '確認新增' }));
}

describe('AdminTeachersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.listTeachers.mockResolvedValue(listResult);
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 0,
      refetch: vi.fn().mockResolvedValue(undefined),
      state: 'privileged',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('renders server rows and submits search/state filters with cursor pagination', async () => {
    const user = userEvent.setup();
    repository.listTeachers
      .mockResolvedValueOnce({ ...listResult, nextCursor: 'teacher-cursor-1' })
      .mockResolvedValueOnce({ ...listResult, nextCursor: null, rows: [] });
    renderPage();

    expect(await screen.findByText('王老師')).toBeInTheDocument();
    expect(screen.getByText('t***@example.test')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看教師' })).toHaveAttribute(
      'href',
      `/admin/teachers/${TEACHER_ID}`,
    );
    await user.click(screen.getByRole('button', { name: '載入更多' }));
    expect(repository.listTeachers).toHaveBeenLastCalledWith({
      cursor: 'teacher-cursor-1',
      search: null,
      state: null,
    });

    await user.type(screen.getByLabelText('搜尋教師'), 'teacher01');
    await user.selectOptions(screen.getByLabelText('作業狀態'), 'ready');
    await user.click(screen.getByRole('button', { name: '套用篩選' }));
    await waitFor(() => {
      expect(repository.listTeachers).toHaveBeenLastCalledWith({
        cursor: null,
        search: 'teacher01',
        state: 'ready',
      });
    });
  });

  it('keeps a new password out of caches, storage, history and logs, then clears it on close', async () => {
    const user = userEvent.setup();
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const logWrite = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);
    const sendBeacon = vi.fn();
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });
    repository.createTeacher.mockResolvedValue({
      loginAccount: 'teacher03',
      operationId: '44444444-4444-4444-8444-444444444444',
      outcome: 'ok',
      password: PASSWORD,
      requestId: REQUEST_ID,
      result: 'created',
      secretReplayable: true,
      teacherId: TEACHER_ID,
    });
    const { queryClient } = renderPage();

    await submitCreate(user);
    expect(await screen.findByText(PASSWORD)).toBeInTheDocument();
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain(PASSWORD);
    expect(
      JSON.stringify(
        queryClient
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.data),
      ),
    ).not.toContain(PASSWORD);
    expect(JSON.stringify(window.history.state)).not.toContain(PASSWORD);
    expect(storageWrite).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining(PASSWORD),
    );
    expect(logWrite).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(
      JSON.stringify({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      }),
    ).not.toContain(PASSWORD);

    await user.click(screen.getByRole('button', { name: '關閉並清除' }));
    expect(
      await screen.findByRole('heading', { name: '教師詳情' }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(PASSWORD);
    expect(JSON.stringify(window.history.state)).not.toContain(PASSWORD);
    storageWrite.mockRestore();
    logWrite.mockRestore();
  });

  it('allows an explicit retry only after not-found status and reuses the same request key', async () => {
    const user = userEvent.setup();
    repository.createTeacher
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        loginAccount: 'teacher03',
        operationId: '44444444-4444-4444-8444-444444444444',
        outcome: 'replayed',
        requestId: REQUEST_ID,
        result: 'created',
        secretReplayable: false,
        teacherId: TEACHER_ID,
      });
    repository.getOperation.mockResolvedValue({
      legalFollowUp: 'retry_same_request',
      loginAccount: null,
      operationId: null,
      operationType: 'create_teacher_account',
      outcome: 'ok',
      requestId: REQUEST_ID,
      state: 'not_found',
      teacherId: null,
    });
    renderPage();

    await submitCreate(user);
    expect(
      await screen.findByRole('button', { name: '以相同代碼重試' }),
    ).toBeInTheDocument();
    expect(repository.createTeacher).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: '以相同代碼重試' }));
    expect(repository.createTeacher).toHaveBeenCalledTimes(2);
    const firstInput = repository.createTeacher.mock.calls[0]?.[0];
    const secondInput = repository.createTeacher.mock.calls[1]?.[0];
    if (!firstInput || !secondInput)
      throw new Error('Expected two create calls');
    expect(firstInput.requestId).toBe(secondInput.requestId);
  });

  it('shows an anonymous wait state without foreign operation identity', async () => {
    const user = userEvent.setup();
    repository.createTeacher.mockRejectedValue(new Error('response lost'));
    repository.getOperation.mockResolvedValue({
      legalFollowUp: 'wait',
      loginAccount: null,
      operationId: null,
      operationType: 'create_teacher_account',
      outcome: 'ok',
      requestId: REQUEST_ID,
      state: 'operation_pending',
      teacherId: null,
    });
    renderPage();

    await submitCreate(user);
    expect(await screen.findByText('作業仍在處理中。')).toBeInTheDocument();
    expect(screen.queryByText(/operation id/iu)).toBeNull();
    expect(repository.createTeacher).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: '重新查詢狀態' }),
    ).toBeInTheDocument();
  });

  it('renders truthful empty and deterministic denial states', async () => {
    repository.listTeachers.mockResolvedValueOnce({
      ...listResult,
      rows: [],
    });
    const first = renderPage();
    expect(await screen.findByText('尚未建立教師帳號。')).toBeInTheDocument();
    first.unmount();

    repository.listTeachers.mockResolvedValueOnce({
      code: 'TEACHER_ACCOUNT_INVALID',
      message: '教師帳號資料或狀態無效。',
      operationId: null,
      outcome: 'denied',
      requestId: REQUEST_ID,
      retryable: false,
      statusCheckRequired: false,
    });
    renderPage();
    expect(
      await screen.findByText(`追蹤代碼：${REQUEST_ID}`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull();
  });

  it('redirects stale list denials through the existing privileged-session flow', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 0,
      refetch,
      state: 'privileged',
    } as unknown as ReturnType<typeof useAdminSessionState>);
    repository.listTeachers.mockResolvedValue({
      code: 'STALE_PRIVILEGED_SESSION',
      message: '特權連線已失效',
      operationId: null,
      outcome: 'denied',
      requestId: REQUEST_ID,
      retryable: false,
      statusCheckRequired: false,
    });
    renderPage();

    expect(await screen.findByText('challenge 頁')).toBeInTheDocument();
    expect(refetch).toHaveBeenCalled();
  });
});
