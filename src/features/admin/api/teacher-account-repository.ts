import {
  adminRpc,
  extractErrorCode,
  invokeAdminCommand,
  type AdminCommandName,
} from './admin-client';
import {
  teacherCreateSuccessWireSchema,
  teacherDetailWireSchema,
  teacherDeniedWireSchema,
  teacherListWireSchema,
  teacherOperationStatusWireSchema,
  teacherResetSuccessWireSchema,
  teacherReplayWireSchema,
  teacherUpdateSuccessWireSchema,
  type TeacherDeniedResult,
  type CreateTeacherAccountInput,
  type GetTeacherOperationInput,
  type ResetTeacherPasswordInput,
  type TeacherCreateOutcome,
  type TeacherDetailOutcome,
  type TeacherListOutcome,
  type TeacherOperationState,
  type TeacherOperationStatusOutcome,
  type TeacherResetOutcome,
  type TeacherReplayResult,
  type TeacherTerminalResult,
  type TeacherUpdateOutcome,
  type UpdateTeacherAccountInput,
} from './teacher-account-contract';

export class TeacherAccountRepositoryError extends Error {
  readonly code = 'INVALID_RESPONSE' as const;

  constructor() {
    super('TEACHER_ACCOUNT_INVALID_RESPONSE');
    this.name = 'TeacherAccountRepositoryError';
  }
}

type TeacherMutationCommand = Extract<
  AdminCommandName,
  'create_teacher_account' | 'update_teacher_account' | 'reset_teacher_password'
>;
type TeacherReadRpc =
  'admin_list_teachers' | 'admin_get_teacher' | 'admin_get_teacher_operation';

export interface TeacherAccountTransport {
  invokeCommand(
    command: TeacherMutationCommand,
    idempotencyKey: string,
    args: Record<string, unknown>,
  ): Promise<unknown>;
  rpc(fn: TeacherReadRpc, args: Record<string, unknown>): Promise<unknown>;
}

export interface TeacherAccountRepository {
  createTeacher(
    input: CreateTeacherAccountInput,
  ): Promise<TeacherCreateOutcome>;
  getTeacher(teacherId: string): Promise<TeacherDetailOutcome>;
  getOperation(
    input: GetTeacherOperationInput,
  ): Promise<TeacherOperationStatusOutcome>;
  listTeachers(
    input: Readonly<{
      cursor: string | null;
      search: string | null;
      state: TeacherOperationState | null;
    }>,
  ): Promise<TeacherListOutcome>;
  resetTeacherPassword(
    input: ResetTeacherPasswordInput,
  ): Promise<TeacherResetOutcome>;
  updateTeacher(
    input: UpdateTeacherAccountInput,
  ): Promise<TeacherUpdateOutcome>;
}

const defaultTransport: TeacherAccountTransport = {
  invokeCommand: (command, idempotencyKey, args) =>
    invokeAdminCommand(command, idempotencyKey, args),
  rpc: (fn, args) => adminRpc<unknown>(fn, args),
};

const STATUS_CHECK_CODES = new Set([
  'TEACHER_OPERATION_PENDING',
  'TEACHER_AUTH_UNAVAILABLE',
  'TEACHER_RECONCILIATION_REQUIRED',
]);

const parseDenied = (payload: unknown): TeacherDeniedResult | null => {
  const parsed = teacherDeniedWireSchema.safeParse(payload);
  if (!parsed.success) return null;
  const code = extractErrorCode(parsed.data);
  if (code === null) throw new TeacherAccountRepositoryError();
  return {
    code,
    message: parsed.data.message,
    operationId: parsed.data.operationId ?? null,
    outcome: 'denied',
    requestId: parsed.data.request_id,
    retryable: parsed.data.retryable,
    statusCheckRequired: STATUS_CHECK_CODES.has(code),
  };
};

const parseReplay = <TResult extends TeacherTerminalResult>(
  payload: unknown,
  expectedResult: TResult,
): TeacherReplayResult<TResult> | null => {
  const parsed = teacherReplayWireSchema.safeParse(payload);
  if (!parsed.success) return null;
  if (parsed.data.result.result !== expectedResult) {
    throw new TeacherAccountRepositoryError();
  }
  return {
    loginAccount: parsed.data.result.login_account,
    operationId: parsed.data.result.operation_id,
    outcome: 'replayed',
    requestId: parsed.data.result.request_id,
    result: expectedResult,
    secretReplayable: false,
    teacherId: parsed.data.result.teacher_id,
  };
};

export function createTeacherAccountRepository(
  transport: TeacherAccountTransport = defaultTransport,
): TeacherAccountRepository {
  return {
    async createTeacher(input) {
      const payload = await transport.invokeCommand(
        'create_teacher_account',
        input.requestId,
        {
          contact_email: input.contactEmail,
          full_name: input.fullName,
          reason: input.reason,
        },
      );
      const denial = parseDenied(payload);
      if (denial !== null) return denial;
      const replay = parseReplay(payload, 'created');
      if (replay !== null) return replay;
      const parsed = teacherCreateSuccessWireSchema.safeParse(payload);
      if (!parsed.success) throw new TeacherAccountRepositoryError();
      return {
        loginAccount: parsed.data.login_account,
        operationId: parsed.data.operation_id,
        outcome: 'ok',
        password: parsed.data.password,
        requestId: parsed.data.request_id,
        result: parsed.data.result,
        secretReplayable: parsed.data.secret_replayable,
        teacherId: parsed.data.teacher_id,
      };
    },
    async getTeacher(teacherId) {
      const payload = await transport.rpc('admin_get_teacher', {
        p_teacher_id: teacherId,
      });
      const denial = parseDenied(payload);
      if (denial !== null) return denial;
      const parsed = teacherDetailWireSchema.safeParse(payload);
      if (!parsed.success) throw new TeacherAccountRepositoryError();
      const teacher = parsed.data.teacher;
      return {
        outcome: 'ok',
        requestId: parsed.data.request_id,
        teacher: {
          availableCommands: teacher.available_commands,
          contactEmailMasked: teacher.contact_email_masked,
          contactEmailPresent: teacher.contact_email_present,
          createdAt: teacher.created_at,
          displayName: teacher.display_name,
          fullName: teacher.full_name,
          loginAccount: teacher.login_account,
          operationState: teacher.operation_state,
          role: teacher.role,
          teacherId: teacher.teacher_id,
        },
      };
    },
    async getOperation(input) {
      const payload = await transport.rpc('admin_get_teacher_operation', {
        p_command_name: input.command,
        p_idempotency_key: input.requestId,
      });
      const denial = parseDenied(payload);
      if (denial !== null) return denial;
      const parsed = teacherOperationStatusWireSchema.safeParse(payload);
      if (!parsed.success) throw new TeacherAccountRepositoryError();
      return {
        legalFollowUp: parsed.data.legal_follow_up,
        loginAccount: parsed.data.login_account,
        operationId: parsed.data.operation_id,
        operationType: parsed.data.operation_type,
        outcome: parsed.data.outcome,
        requestId: parsed.data.request_id,
        state: parsed.data.state,
        teacherId: parsed.data.teacher_id,
      };
    },
    async listTeachers(input) {
      const payload = await transport.rpc('admin_list_teachers', {
        p_cursor: input.cursor,
        p_search: input.search,
        p_state: input.state,
      });
      const denial = parseDenied(payload);
      if (denial !== null) return denial;
      const parsed = teacherListWireSchema.safeParse(payload);
      if (!parsed.success) throw new TeacherAccountRepositoryError();
      return {
        nextCursor: parsed.data.next_cursor,
        outcome: 'ok',
        requestId: parsed.data.request_id,
        rows: parsed.data.rows.map((row) => ({
          contactEmailMasked: row.contact_email_masked,
          contactEmailPresent: row.contact_email_present,
          createdAt: row.created_at,
          displayName: row.display_name,
          loginAccount: row.login_account,
          operationState: row.operation_state,
          teacherId: row.teacher_id,
        })),
      };
    },
    async resetTeacherPassword(input) {
      const payload = await transport.invokeCommand(
        'reset_teacher_password',
        input.requestId,
        { reason: input.reason, teacher_id: input.teacherId },
      );
      const denial = parseDenied(payload);
      if (denial !== null) return denial;
      const replay = parseReplay(payload, 'password_reset');
      if (replay !== null) return replay;
      const parsed = teacherResetSuccessWireSchema.safeParse(payload);
      if (!parsed.success) throw new TeacherAccountRepositoryError();
      return {
        loginAccount: parsed.data.login_account,
        operationId: parsed.data.operation_id,
        outcome: 'ok',
        password: parsed.data.password,
        requestId: parsed.data.request_id,
        result: parsed.data.result,
        secretReplayable: parsed.data.secret_replayable,
        teacherId: parsed.data.teacher_id,
      };
    },
    async updateTeacher(input) {
      const payload = await transport.invokeCommand(
        'update_teacher_account',
        input.requestId,
        {
          contact_email: input.contactEmail,
          full_name: input.fullName,
          reason: input.reason,
          teacher_id: input.teacherId,
        },
      );
      const denial = parseDenied(payload);
      if (denial !== null) return denial;
      const replay = parseReplay(payload, 'updated');
      if (replay !== null) return replay;
      const parsed = teacherUpdateSuccessWireSchema.safeParse(payload);
      if (!parsed.success) throw new TeacherAccountRepositoryError();
      return {
        loginAccount: parsed.data.login_account,
        operationId: parsed.data.operation_id,
        outcome: 'ok',
        requestId: parsed.data.request_id,
        result: parsed.data.result,
        secretReplayable: parsed.data.secret_replayable,
        teacherId: parsed.data.teacher_id,
      };
    },
  };
}
