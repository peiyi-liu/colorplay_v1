import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeacherAccountRepository } from '../api/teacher-account-repository';
import { useAdminSessionState } from '../hooks/use-admin-session-state';
import { AdminTeacherDetailPage } from './admin-teacher-detail-page';

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
vi.mock('../api/admin-client', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-client')>(
    '../api/admin-client',
  );
  return { ...actual, invokeAdminCommand: vi.fn() };
});
vi.mock('../hooks/use-admin-session-state', () => ({
  useAdminSessionState: vi.fn(),
}));

const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const TEACHER_ID = '11111111-1111-4111-8111-111111111111';
const PASSWORD = 'Z9!xyz234567';
const detailResult = {
  outcome: 'ok' as const,
  requestId: REQUEST_ID,
  teacher: {
    availableCommands: [
      'update_teacher_account',
      'reset_teacher_password',
    ] as const,
    contactEmailMasked: 't***@example.test',
    contactEmailPresent: true,
    createdAt: '2026-09-03T08:00:00+00:00',
    displayName: '王老師',
    fullName: '王老師',
    loginAccount: 'teacher01',
    operationState: 'ready' as const,
    role: 'teacher' as const,
    teacherId: TEACHER_ID,
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={[`/admin/teachers/${TEACHER_ID}`]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route element={children} path="/admin/teachers/:teacherId" />
            <Route element={<p>健康狀態頁</p>} path="/admin/health" />
            <Route element={<p>challenge 頁</p>} path="/admin/mfa/challenge" />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return {
    queryClient,
    ...render(<AdminTeacherDetailPage />, { wrapper: Wrapper }),
  };
}

describe('AdminTeacherDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.getTeacher.mockResolvedValue(detailResult);
    vi.mocked(useAdminSessionState).mockReturnValue({
      isPending: false,
      mfaAgeSeconds: 0,
      refetch: vi.fn().mockResolvedValue(undefined),
      state: 'privileged',
    } as unknown as ReturnType<typeof useAdminSessionState>);
  });

  it('renders safe details and opens the existing reveal dialog for contact Email', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('heading', { name: '王老師' }),
    ).toBeVisible();
    expect(screen.getByText('teacher01')).toBeInTheDocument();
    expect(screen.getByText('t***@example.test')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '揭露聯絡 Email' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      '揭露「profiles」的 contact_email',
    );
  });

  it('requires explicit confirmation before clearing an existing contact Email', async () => {
    const user = userEvent.setup();
    repository.updateTeacher.mockResolvedValue({
      loginAccount: 'teacher01',
      operationId: '44444444-4444-4444-8444-444444444444',
      outcome: 'ok',
      requestId: REQUEST_ID,
      result: 'updated',
      secretReplayable: false,
      teacherId: TEACHER_ID,
    });
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: '更新教師資料' }),
    );
    await user.clear(screen.getByLabelText('教師姓名'));
    await user.type(screen.getByLabelText('教師姓名'), '王老師更新');
    await user.type(
      screen.getByLabelText('操作原因'),
      '修正教師姓名與聯絡資料內容',
    );
    await user.click(screen.getByRole('button', { name: '確認更新' }));

    expect(repository.updateTeacher).not.toHaveBeenCalled();
    expect(
      screen.getByText('請勾選確認清除現有聯絡 Email'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('登入帳號')).toBeNull();
    expect(screen.queryByLabelText('角色')).toBeNull();

    await user.click(
      screen.getByRole('checkbox', {
        name: '我確認要清除目前的聯絡 Email',
      }),
    );
    await user.click(screen.getByRole('button', { name: '確認更新' }));

    await waitFor(() => {
      expect(repository.updateTeacher).toHaveBeenCalledWith(
        expect.objectContaining({
          contactEmail: null,
          fullName: '王老師更新',
          reason: '修正教師姓名與聯絡資料內容',
          teacherId: TEACHER_ID,
        }),
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      '教師資料已更新',
    );
  });

  it('shows and clears a reset password without writing it to caches or history', async () => {
    const user = userEvent.setup();
    repository.resetTeacherPassword.mockResolvedValue({
      loginAccount: 'teacher01',
      operationId: '55555555-5555-4555-8555-555555555555',
      outcome: 'ok',
      password: PASSWORD,
      requestId: REQUEST_ID,
      result: 'password_reset',
      secretReplayable: true,
      teacherId: TEACHER_ID,
    });
    const { queryClient, unmount } = renderPage();

    await user.click(await screen.findByRole('button', { name: '重設密碼' }));
    expect(screen.getByText(/舊密碼會立即失效/u)).toBeInTheDocument();
    await user.type(
      screen.getByLabelText('操作原因'),
      '教師忘記密碼需要安全重設',
    );
    await user.click(screen.getByRole('button', { name: '確認重設密碼' }));
    expect(await screen.findByText(PASSWORD)).toBeInTheDocument();
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(
      PASSWORD,
    );
    expect(
      JSON.stringify(queryClient.getMutationCache().getAll()),
    ).not.toContain(PASSWORD);
    expect(JSON.stringify(window.history.state)).not.toContain(PASSWORD);

    unmount();
    expect(document.body).not.toHaveTextContent(PASSWORD);
  });

  it.each([
    ['health_reconciliation', '前往健康狀態'],
    ['none', '已完成，不會再次重送。'],
  ] as const)(
    'obeys server legal follow-up %s without retrying the mutation',
    async (legalFollowUp, expectedText) => {
      const user = userEvent.setup();
      repository.updateTeacher.mockRejectedValue(new Error('response lost'));
      repository.getOperation.mockResolvedValue({
        legalFollowUp,
        loginAccount: 'teacher01',
        operationId: '55555555-5555-4555-8555-555555555555',
        operationType: 'update_teacher_account',
        outcome: 'ok',
        requestId: REQUEST_ID,
        state:
          legalFollowUp === 'health_reconciliation'
            ? 'reconciliation_required'
            : 'completed',
        teacherId: TEACHER_ID,
      });
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: '更新教師資料' }),
      );
      await user.type(
        screen.getByLabelText('聯絡 Email（選填）'),
        'updated@example.test',
      );
      await user.type(
        screen.getByLabelText('操作原因'),
        '確認不明結果的安全後續處理',
      );
      await user.click(screen.getByRole('button', { name: '確認更新' }));

      expect(await screen.findByText(expectedText)).toBeInTheDocument();
      expect(repository.updateTeacher).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole('button', { name: '以相同代碼重試' }),
      ).toBeNull();
    },
  );

  it('checks status after a typed ambiguous denial and never auto-retries', async () => {
    const user = userEvent.setup();
    repository.updateTeacher.mockResolvedValue({
      code: 'TEACHER_AUTH_UNAVAILABLE',
      message: '驗證服務暫時無法使用',
      operationId: '55555555-5555-4555-8555-555555555555',
      outcome: 'denied',
      requestId: REQUEST_ID,
      retryable: true,
      statusCheckRequired: true,
    });
    repository.getOperation.mockResolvedValue({
      legalFollowUp: 'wait',
      loginAccount: null,
      operationId: null,
      operationType: 'update_teacher_account',
      outcome: 'ok',
      requestId: REQUEST_ID,
      state: 'operation_pending',
      teacherId: null,
    });
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: '更新教師資料' }),
    );
    await user.type(
      screen.getByLabelText('聯絡 Email（選填）'),
      'updated@example.test',
    );
    await user.type(
      screen.getByLabelText('操作原因'),
      '驗證暫時失敗後先查詢狀態',
    );
    await user.click(screen.getByRole('button', { name: '確認更新' }));

    expect(await screen.findByText('作業仍在處理中。')).toBeInTheDocument();
    expect(repository.updateTeacher).toHaveBeenCalledTimes(1);
    expect(repository.getOperation).toHaveBeenCalledWith({
      command: 'update_teacher_account',
      requestId: repository.updateTeacher.mock.calls[0]?.[0].requestId,
    });
    expect(
      screen.queryByText('55555555-5555-4555-8555-555555555555'),
    ).toBeNull();
  });

  it('clears the prior follow-up while a status recheck fails', async () => {
    const user = userEvent.setup();
    repository.updateTeacher.mockRejectedValue(new Error('response lost'));
    repository.getOperation
      .mockResolvedValueOnce({
        legalFollowUp: 'wait',
        loginAccount: null,
        operationId: null,
        operationType: 'update_teacher_account',
        outcome: 'ok',
        requestId: REQUEST_ID,
        state: 'operation_pending',
        teacherId: null,
      })
      .mockRejectedValueOnce(new Error('status unavailable'));
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: '更新教師資料' }),
    );
    await user.type(
      screen.getByLabelText('聯絡 Email（選填）'),
      'updated@example.test',
    );
    await user.type(
      screen.getByLabelText('操作原因'),
      '重新查詢狀態失敗時清理舊提示',
    );
    await user.click(screen.getByRole('button', { name: '確認更新' }));
    await user.click(
      await screen.findByRole('button', { name: '重新查詢狀態' }),
    );

    expect(
      await screen.findByText('狀態查詢失敗；系統沒有重送教師帳號操作。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('作業仍在處理中。')).toBeNull();
    expect(repository.updateTeacher).toHaveBeenCalledTimes(1);
    expect(repository.getOperation).toHaveBeenCalledTimes(2);
  });

  it('keeps deterministic denials in the confirmation without a status lookup', async () => {
    const user = userEvent.setup();
    repository.resetTeacherPassword.mockResolvedValue({
      code: 'TEACHER_ACCOUNT_INVALID',
      message: '教師帳號資料或狀態無效',
      operationId: null,
      outcome: 'denied',
      requestId: REQUEST_ID,
      retryable: false,
      statusCheckRequired: false,
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: '重設密碼' }));
    await user.type(
      screen.getByLabelText('操作原因'),
      '驗證確定拒絕不查詢也不重試',
    );
    await user.click(screen.getByRole('button', { name: '確認重設密碼' }));

    expect(
      await screen.findByText('教師帳號資料或狀態無效。'),
    ).toBeInTheDocument();
    expect(repository.getOperation).not.toHaveBeenCalled();
    expect(repository.resetTeacherPassword).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('suppresses mutations while the server reports an operation pending', async () => {
    repository.getTeacher.mockResolvedValue({
      ...detailResult,
      teacher: {
        ...detailResult.teacher,
        availableCommands: [],
        operationState: 'operation_pending',
      },
    });
    renderPage();

    expect(await screen.findByText('作業處理中')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '更新教師資料' })).toBeNull();
    expect(screen.queryByRole('button', { name: '重設密碼' })).toBeNull();
  });
});
