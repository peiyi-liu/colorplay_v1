import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTeacherAccountRepository,
  TeacherAccountRepositoryError,
} from './teacher-account-repository';

const UUID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const TEACHER_SAFE_CODES = [
  'TEACHER_ACCOUNT_INVALID',
  'TEACHER_ACCOUNT_CONFLICT',
  'TEACHER_OPERATION_PENDING',
  'TEACHER_AUTH_UNAVAILABLE',
  'TEACHER_RECONCILIATION_REQUIRED',
] as const;
const STATUS_CHECK_CODES = new Set<string>(TEACHER_SAFE_CODES.slice(2));
const transport = {
  cacheWrite: vi.fn(),
  invokeCommand: vi.fn(),
  rpc: vi.fn(),
};
const teacherDetail = (overrides: Record<string, unknown> = {}) => ({
  available_commands: ['update_teacher_account', 'reset_teacher_password'],
  contact_email_masked: 't***@example.test',
  contact_email_present: true,
  created_at: '2026-09-03T08:00:00+00:00',
  display_name: '王老師',
  full_name: '王老師',
  login_account: 'teacher01',
  operation_state: 'ready',
  role: 'teacher',
  teacher_id: UUID,
  ...overrides,
});
describe('teacher account repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps a teacher page and forwards the opaque cursor without decoding it', async () => {
    transport.rpc.mockResolvedValue({
      next_cursor: 'opaque.server.cursor',
      outcome: 'ok',
      request_id: REQUEST_ID,
      rows: [
        {
          contact_email_masked: 't***@example.test',
          contact_email_present: true,
          created_at: '2026-09-03T08:00:00+00:00',
          display_name: '王老師',
          login_account: 'teacher01',
          operation_state: 'ready',
          teacher_id: UUID,
        },
        {
          contact_email_masked: null,
          contact_email_present: false,
          created_at: '2026-09-03T08:01:00+00:00',
          display_name: '李老師',
          login_account: 'teacher02',
          operation_state: 'reconciliation_required',
          teacher_id: '33333333-3333-4333-8333-333333333333',
        },
      ],
    });
    const repository = createTeacherAccountRepository(transport);
    await expect(
      repository.listTeachers({
        cursor: 'opaque.server.cursor.input',
        search: 'teacher',
        state: 'operation_pending',
      }),
    ).resolves.toEqual({
      nextCursor: 'opaque.server.cursor',
      outcome: 'ok',
      requestId: REQUEST_ID,
      rows: [
        {
          contactEmailMasked: 't***@example.test',
          contactEmailPresent: true,
          createdAt: '2026-09-03T08:00:00+00:00',
          displayName: '王老師',
          loginAccount: 'teacher01',
          operationState: 'ready',
          teacherId: UUID,
        },
        {
          contactEmailMasked: null,
          contactEmailPresent: false,
          createdAt: '2026-09-03T08:01:00+00:00',
          displayName: '李老師',
          loginAccount: 'teacher02',
          operationState: 'reconciliation_required',
          teacherId: '33333333-3333-4333-8333-333333333333',
        },
      ],
    });
    expect(transport.rpc).toHaveBeenCalledWith('admin_list_teachers', {
      p_cursor: 'opaque.server.cursor.input',
      p_search: 'teacher',
      p_state: 'operation_pending',
    });
    expect(transport.invokeCommand).not.toHaveBeenCalled();
  });

  it('maps teacher detail with only server-provided commands', async () => {
    transport.rpc.mockResolvedValue({
      outcome: 'ok',
      request_id: REQUEST_ID,
      teacher: teacherDetail(),
    });
    const repository = createTeacherAccountRepository(transport);

    await expect(repository.getTeacher(UUID)).resolves.toEqual({
      outcome: 'ok',
      requestId: REQUEST_ID,
      teacher: {
        availableCommands: ['update_teacher_account', 'reset_teacher_password'],
        contactEmailMasked: 't***@example.test',
        contactEmailPresent: true,
        createdAt: '2026-09-03T08:00:00+00:00',
        displayName: '王老師',
        fullName: '王老師',
        loginAccount: 'teacher01',
        operationState: 'ready',
        role: 'teacher',
        teacherId: UUID,
      },
    });
    expect(transport.rpc).toHaveBeenCalledWith('admin_get_teacher', {
      p_teacher_id: UUID,
    });
  });

  it('fails closed on inconsistent masks and any internal Auth Email field', async () => {
    const repository = createTeacherAccountRepository(transport);
    transport.rpc.mockResolvedValueOnce({
      next_cursor: null,
      outcome: 'ok',
      request_id: REQUEST_ID,
      rows: [
        {
          contact_email_masked: null,
          contact_email_present: true,
          created_at: '2026-09-03T08:00:00+00:00',
          display_name: '王老師',
          login_account: 'teacher01',
          operation_state: 'operation_pending',
          teacher_id: UUID,
        },
      ],
    });

    await expect(
      repository.listTeachers({ cursor: null, search: null, state: null }),
    ).rejects.toBeInstanceOf(TeacherAccountRepositoryError);

    transport.rpc.mockResolvedValueOnce({
      outcome: 'ok',
      request_id: REQUEST_ID,
      teacher: teacherDetail({
        internal_email: 'teacher01@teachers.local.invalid',
      }),
    });

    await expect(repository.getTeacher(UUID)).rejects.toBeInstanceOf(
      TeacherAccountRepositoryError,
    );
  });

  it.each([
    { full_name: null },
    { available_commands: [], operation_state: 'ready' },
    { operation_state: 'operation_pending' },
    { operation_state: 'reconciliation_required' },
  ])('fails closed on invalid detail invariant %#', async (overrides) => {
    transport.rpc.mockResolvedValue({
      outcome: 'ok',
      request_id: REQUEST_ID,
      teacher: teacherDetail(overrides),
    });
    await expect(
      createTeacherAccountRepository(transport).getTeacher(UUID),
    ).rejects.toBeInstanceOf(TeacherAccountRepositoryError);
  });

  it.each(TEACHER_SAFE_CODES)(
    'returns %s as a typed denial without retrying the read',
    async (code) => {
      transport.rpc.mockResolvedValue({
        code,
        message: '安全訊息',
        ...(STATUS_CHECK_CODES.has(code) ? { operationId: UUID } : {}),
        outcome: 'denied',
        request_id: REQUEST_ID,
        retryable: code === 'TEACHER_AUTH_UNAVAILABLE',
      });
      const repository = createTeacherAccountRepository(transport);

      await expect(
        repository.listTeachers({ cursor: null, search: null, state: null }),
      ).resolves.toEqual({
        code,
        message: '安全訊息',
        operationId: STATUS_CHECK_CODES.has(code) ? UUID : null,
        outcome: 'denied',
        requestId: REQUEST_ID,
        retryable: code === 'TEACHER_AUTH_UNAVAILABLE',
        statusCheckRequired: STATUS_CHECK_CODES.has(code),
      });
      expect(transport.rpc).toHaveBeenCalledTimes(1);
    },
  );

  it('returns a newly created password only from the direct mutation result', async () => {
    const password = 'A1!abc234567';
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const loggerWrite = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined);
    transport.invokeCommand.mockResolvedValue({
      login_account: 'teacher03',
      operation_id: '44444444-4444-4444-8444-444444444444',
      outcome: 'ok',
      password,
      request_id: REQUEST_ID,
      result: 'created',
      secret_replayable: true,
      teacher_id: UUID,
    });
    const repository = createTeacherAccountRepository(transport);

    await expect(
      repository.createTeacher({
        contactEmail: null,
        fullName: '陳老師',
        reason: '建立新的教師教學帳號',
        requestId: 'create-request-key',
      }),
    ).resolves.toEqual({
      loginAccount: 'teacher03',
      operationId: '44444444-4444-4444-8444-444444444444',
      outcome: 'ok',
      password,
      requestId: REQUEST_ID,
      result: 'created',
      secretReplayable: true,
      teacherId: UUID,
    });
    expect(transport.invokeCommand).toHaveBeenCalledTimes(1);
    expect(transport.invokeCommand).toHaveBeenCalledWith(
      'create_teacher_account',
      'create-request-key',
      {
        contact_email: null,
        full_name: '陳老師',
        reason: '建立新的教師教學帳號',
      },
    );
    expect(transport.cacheWrite).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(loggerWrite).not.toHaveBeenCalled();
    storageWrite.mockRestore();
    loggerWrite.mockRestore();
  });

  it('updates only the editable teacher fields through the named command', async () => {
    transport.invokeCommand.mockResolvedValue({
      login_account: 'teacher01',
      operation_id: '44444444-4444-4444-8444-444444444444',
      outcome: 'ok',
      request_id: REQUEST_ID,
      result: 'updated',
      secret_replayable: false,
      teacher_id: UUID,
    });
    const repository = createTeacherAccountRepository(transport);

    await expect(
      repository.updateTeacher({
        contactEmail: 'teacher@example.test',
        fullName: '王老師（更新）',
        reason: '修正教師顯示名稱與聯絡信箱',
        requestId: 'update-request-key',
        teacherId: UUID,
      }),
    ).resolves.toEqual({
      loginAccount: 'teacher01',
      operationId: '44444444-4444-4444-8444-444444444444',
      outcome: 'ok',
      requestId: REQUEST_ID,
      result: 'updated',
      secretReplayable: false,
      teacherId: UUID,
    });
    expect(transport.invokeCommand).toHaveBeenCalledWith(
      'update_teacher_account',
      'update-request-key',
      {
        contact_email: 'teacher@example.test',
        full_name: '王老師（更新）',
        reason: '修正教師顯示名稱與聯絡信箱',
        teacher_id: UUID,
      },
    );
  });

  it('returns a reset password only from the direct mutation result', async () => {
    const password = 'Z9!xyz234567';
    transport.invokeCommand.mockResolvedValue({
      login_account: 'teacher01',
      operation_id: '55555555-5555-4555-8555-555555555555',
      outcome: 'ok',
      password,
      request_id: REQUEST_ID,
      result: 'password_reset',
      secret_replayable: true,
      teacher_id: UUID,
    });
    const repository = createTeacherAccountRepository(transport);

    await expect(
      repository.resetTeacherPassword({
        reason: '執行教師密碼安全重設',
        requestId: 'reset-request-key',
        teacherId: UUID,
      }),
    ).resolves.toEqual({
      loginAccount: 'teacher01',
      operationId: '55555555-5555-4555-8555-555555555555',
      outcome: 'ok',
      password,
      requestId: REQUEST_ID,
      result: 'password_reset',
      secretReplayable: true,
      teacherId: UUID,
    });
    expect(transport.invokeCommand).toHaveBeenCalledTimes(1);
    expect(transport.invokeCommand).toHaveBeenCalledWith(
      'reset_teacher_password',
      'reset-request-key',
      { reason: '執行教師密碼安全重設', teacher_id: UUID },
    );
    expect(transport.cacheWrite).not.toHaveBeenCalled();
  });

  it.each([
    {
      code: 'TEACHER_OPERATION_PENDING' as const,
      operationId: '66666666-6666-4666-8666-666666666666',
      run: (repository: ReturnType<typeof createTeacherAccountRepository>) =>
        repository.createTeacher({
          contactEmail: null,
          fullName: '競爭中的教師',
          reason: '驗證建立作業等待狀態',
          requestId: 'pending-create-key',
        }),
    },
    {
      code: 'TEACHER_ACCOUNT_INVALID' as const,
      operationId: null,
      run: (repository: ReturnType<typeof createTeacherAccountRepository>) =>
        repository.updateTeacher({
          contactEmail: null,
          fullName: '不存在的教師',
          reason: '驗證更新拒絕不會重試',
          requestId: 'invalid-update-key',
          teacherId: UUID,
        }),
    },
    {
      code: 'TEACHER_RECONCILIATION_REQUIRED' as const,
      operationId: '77777777-7777-4777-8777-777777777777',
      run: (repository: ReturnType<typeof createTeacherAccountRepository>) =>
        repository.resetTeacherPassword({
          reason: '驗證重設作業需要對帳',
          requestId: 'reconcile-reset-key',
          teacherId: UUID,
        }),
    },
  ])(
    'returns $code with operation metadata and never retries the mutation',
    async ({ code, operationId, run }) => {
      transport.invokeCommand.mockResolvedValue({
        code,
        message: '安全訊息',
        ...(operationId ? { operationId } : {}),
        outcome: 'denied',
        request_id: REQUEST_ID,
        retryable: false,
      });
      const repository = createTeacherAccountRepository(transport);

      await expect(run(repository)).resolves.toEqual({
        code,
        message: '安全訊息',
        operationId,
        outcome: 'denied',
        requestId: REQUEST_ID,
        retryable: false,
        statusCheckRequired: STATUS_CHECK_CODES.has(code),
      });
      expect(transport.invokeCommand).toHaveBeenCalledTimes(1);
      expect(transport.cacheWrite).not.toHaveBeenCalled();
    },
  );

  it('accepts a completed replay only as redacted metadata', async () => {
    transport.invokeCommand.mockResolvedValue({
      outcome: 'replayed',
      result: {
        login_account: 'teacher01',
        operation_id: '88888888-8888-4888-8888-888888888888',
        outcome: 'ok',
        request_id: REQUEST_ID,
        result: 'created',
        secret_replayable: false,
        teacher_id: UUID,
      },
    });
    const repository = createTeacherAccountRepository(transport);

    const result = await repository.createTeacher({
      contactEmail: null,
      fullName: '重播教師',
      reason: '驗證完成作業重播不回傳密碼',
      requestId: 'replayed-create-key',
    });

    expect(result).toEqual({
      loginAccount: 'teacher01',
      operationId: '88888888-8888-4888-8888-888888888888',
      outcome: 'replayed',
      requestId: REQUEST_ID,
      result: 'created',
      secretReplayable: false,
      teacherId: UUID,
    });
    expect('password' in result).toBe(false);
    expect(transport.invokeCommand).toHaveBeenCalledTimes(1);
    expect(transport.cacheWrite).not.toHaveBeenCalled();
  });

  it('preserves stale-session denial semantics and rejects unknown codes', async () => {
    const repository = createTeacherAccountRepository(transport);
    transport.rpc.mockResolvedValueOnce({
      code: 'STALE_PRIVILEGED_SESSION',
      message: '特權連線已失效',
      outcome: 'denied',
      request_id: REQUEST_ID,
      retryable: false,
    });
    await expect(repository.getTeacher(UUID)).resolves.toMatchObject({
      code: 'STALE_PRIVILEGED_SESSION',
      outcome: 'denied',
      requestId: REQUEST_ID,
    });

    transport.rpc.mockResolvedValueOnce({
      code: 'RAW_DATABASE_ERROR',
      message: 'unsafe',
      outcome: 'denied',
      request_id: REQUEST_ID,
      retryable: false,
    });
    await expect(repository.getTeacher(UUID)).rejects.toBeInstanceOf(
      TeacherAccountRepositoryError,
    );
  });

  it('rejects a create response that carries an internal Auth Email', async () => {
    transport.invokeCommand.mockResolvedValue({
      internal_email: 'teacher01@teachers.local.invalid',
      login_account: 'teacher01',
      operation_id: '99999999-9999-4999-8999-999999999999',
      outcome: 'ok',
      password: 'A1!abc234567',
      request_id: REQUEST_ID,
      result: 'created',
      secret_replayable: true,
      teacher_id: UUID,
    });
    const repository = createTeacherAccountRepository(transport);

    await expect(
      repository.createTeacher({
        contactEmail: null,
        fullName: 'Auth 欄位探針',
        reason: '驗證 internal email 不得進入前端',
        requestId: 'internal-email-probe',
      }),
    ).rejects.toBeInstanceOf(TeacherAccountRepositoryError);
    expect(transport.invokeCommand).toHaveBeenCalledTimes(1);
  });

  it('looks up an ambiguous teacher command by its exact command and original request key', async () => {
    transport.rpc.mockResolvedValue({
      legal_follow_up: 'wait',
      login_account: 'teacher03',
      operation_id: '44444444-4444-4444-8444-444444444444',
      operation_type: 'create_teacher_account',
      outcome: 'ok',
      request_id: REQUEST_ID,
      state: 'identity_reserved',
      teacher_id: null,
    });
    const repository = createTeacherAccountRepository(transport);

    await expect(
      repository.getOperation({
        command: 'create_teacher_account',
        requestId: 'create-request-key',
      }),
    ).resolves.toEqual({
      legalFollowUp: 'wait',
      loginAccount: 'teacher03',
      operationId: '44444444-4444-4444-8444-444444444444',
      operationType: 'create_teacher_account',
      outcome: 'ok',
      requestId: REQUEST_ID,
      state: 'identity_reserved',
      teacherId: null,
    });
    expect(transport.rpc).toHaveBeenCalledWith('admin_get_teacher_operation', {
      p_command_name: 'create_teacher_account',
      p_idempotency_key: 'create-request-key',
    });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(transport.invokeCommand).not.toHaveBeenCalled();
  });

  it.each([
    ['requested', 'wait'],
    ['auth_created_or_password_updated', 'wait'],
    ['completed', 'none'],
    ['compensated', 'none'],
    ['reconciliation_required', 'health_reconciliation'],
  ] as const)(
    'maps operation state %s only with the server-owned %s follow-up',
    async (state, legalFollowUp) => {
      transport.rpc.mockResolvedValue({
        legal_follow_up: legalFollowUp,
        login_account: 'teacher01',
        operation_id: '44444444-4444-4444-8444-444444444444',
        operation_type: 'reset_teacher_password',
        outcome: 'ok',
        request_id: REQUEST_ID,
        state,
        teacher_id: UUID,
      });

      await expect(
        createTeacherAccountRepository(transport).getOperation({
          command: 'reset_teacher_password',
          requestId: 'reset-request-key',
        }),
      ).resolves.toMatchObject({ state, legalFollowUp });
      expect(transport.rpc).toHaveBeenCalledTimes(1);
      expect(transport.invokeCommand).not.toHaveBeenCalled();
    },
  );

  it('maps a uniform not-found status to retrying the same request key', async () => {
    transport.rpc.mockResolvedValue({
      legal_follow_up: 'retry_same_request',
      login_account: null,
      operation_id: null,
      operation_type: 'update_teacher_account',
      outcome: 'ok',
      request_id: REQUEST_ID,
      state: 'not_found',
      teacher_id: null,
    });

    await expect(
      createTeacherAccountRepository(transport).getOperation({
        command: 'update_teacher_account',
        requestId: 'unknown-update-key',
      }),
    ).resolves.toEqual({
      legalFollowUp: 'retry_same_request',
      loginAccount: null,
      operationId: null,
      operationType: 'update_teacher_account',
      outcome: 'ok',
      requestId: REQUEST_ID,
      state: 'not_found',
      teacherId: null,
    });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(transport.invokeCommand).not.toHaveBeenCalled();
  });

  it('maps a terminal command result without an operation as completed and not retryable', async () => {
    transport.rpc.mockResolvedValue({
      legal_follow_up: 'none',
      login_account: null,
      operation_id: null,
      operation_type: 'update_teacher_account',
      outcome: 'ok',
      request_id: REQUEST_ID,
      state: 'completed',
      teacher_id: null,
    });

    await expect(
      createTeacherAccountRepository(transport).getOperation({
        command: 'update_teacher_account',
        requestId: 'terminal-denial-key',
      }),
    ).resolves.toMatchObject({
      legalFollowUp: 'none',
      operationId: null,
      state: 'completed',
    });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(transport.invokeCommand).not.toHaveBeenCalled();
  });

  it('maps an actor-isolated blocking operation to an anonymous pending status', async () => {
    transport.rpc.mockResolvedValue({
      legal_follow_up: 'wait',
      login_account: null,
      operation_id: null,
      operation_type: 'reset_teacher_password',
      outcome: 'ok',
      request_id: REQUEST_ID,
      state: 'operation_pending',
      teacher_id: null,
    });

    await expect(
      createTeacherAccountRepository(transport).getOperation({
        command: 'reset_teacher_password',
        requestId: 'foreign-blocked-key',
      }),
    ).resolves.toEqual({
      legalFollowUp: 'wait',
      loginAccount: null,
      operationId: null,
      operationType: 'reset_teacher_password',
      outcome: 'ok',
      requestId: REQUEST_ID,
      state: 'operation_pending',
      teacherId: null,
    });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(transport.invokeCommand).not.toHaveBeenCalled();
  });

  it.each(['STALE_PRIVILEGED_SESSION', ...TEACHER_SAFE_CODES] as const)(
    'returns %s as a typed operation-status denial without any retry',
    async (code) => {
      transport.rpc.mockResolvedValue({
        code,
        message: '安全訊息',
        ...(STATUS_CHECK_CODES.has(code) ? { operationId: UUID } : {}),
        outcome: 'denied',
        request_id: REQUEST_ID,
        retryable: false,
      });

      await expect(
        createTeacherAccountRepository(transport).getOperation({
          command: 'create_teacher_account',
          requestId: 'denied-create-key',
        }),
      ).resolves.toMatchObject({ code, outcome: 'denied' });
      expect(transport.rpc).toHaveBeenCalledTimes(1);
      expect(transport.invokeCommand).not.toHaveBeenCalled();
    },
  );

  it.each([
    { internal_email: 'teacher01@teachers.local.invalid' },
    { legal_follow_up: 'retry_same_request', state: 'requested' },
    { legal_follow_up: 'wait', operation_id: null },
    { legal_follow_up: 'wait', operation_type: 'delete_teacher_account' },
  ])('fails closed on malformed operation status %#', async (overrides) => {
    transport.rpc.mockResolvedValue({
      legal_follow_up: 'wait',
      login_account: 'teacher01',
      operation_id: '44444444-4444-4444-8444-444444444444',
      operation_type: 'create_teacher_account',
      outcome: 'ok',
      request_id: REQUEST_ID,
      state: 'requested',
      teacher_id: null,
      ...overrides,
    });

    await expect(
      createTeacherAccountRepository(transport).getOperation({
        command: 'create_teacher_account',
        requestId: 'malformed-create-key',
      }),
    ).rejects.toBeInstanceOf(TeacherAccountRepositoryError);
    expect(transport.rpc).toHaveBeenCalledTimes(1);
    expect(transport.invokeCommand).not.toHaveBeenCalled();
  });
});
