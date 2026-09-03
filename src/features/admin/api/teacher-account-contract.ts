import { z } from 'zod';

import type { AdminErrorCode } from './admin-client';

export const teacherOperationStateSchema = z.enum([
  'ready',
  'operation_pending',
  'reconciliation_required',
]);

export const teacherMutationCommandSchema = z.enum([
  'create_teacher_account',
  'update_teacher_account',
  'reset_teacher_password',
]);

export const teacherOperationStatusStateSchema = z.enum([
  'operation_pending',
  'requested',
  'identity_reserved',
  'auth_created_or_password_updated',
  'profile_committed',
  'completed',
  'compensation_pending',
  'compensated',
  'reconciliation_required',
]);

export const teacherOperationLegalFollowUpSchema = z.enum([
  'none',
  'wait',
  'retry_same_request',
  'health_reconciliation',
]);

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const loginAccountSchema = z.string().regex(/^teacher[0-9]{2,13}$/u);
const teacherPasswordSchema = z
  .string()
  .length(12)
  .regex(/[A-Z]/u)
  .regex(/[a-z]/u)
  .regex(/[0-9]/u)
  .regex(/[!#$%&*+\-=?@_]/u)
  .regex(/^[A-Za-z0-9!#$%&*+\-=?@_]+$/u);

export const teacherSummaryWireSchema = z
  .strictObject({
    contact_email_masked: z.string().min(1).nullable(),
    contact_email_present: z.boolean(),
    created_at: timestampSchema,
    display_name: z.string().min(1),
    login_account: loginAccountSchema,
    operation_state: teacherOperationStateSchema,
    teacher_id: uuidSchema,
  })
  .refine(
    (value) =>
      value.contact_email_present === (value.contact_email_masked !== null),
    { message: 'masked contact Email presence mismatch' },
  );

export const teacherListWireSchema = z.strictObject({
  next_cursor: z.string().min(1).nullable(),
  outcome: z.literal('ok'),
  request_id: uuidSchema,
  rows: z.array(teacherSummaryWireSchema).max(50),
});

export const teacherDetailWireSchema = z.strictObject({
  outcome: z.literal('ok'),
  request_id: uuidSchema,
  teacher: z
    .strictObject({
      available_commands: z.array(
        z.enum(['update_teacher_account', 'reset_teacher_password']),
      ),
      contact_email_masked: z.string().min(1).nullable(),
      contact_email_present: z.boolean(),
      created_at: timestampSchema,
      display_name: z.string().min(1),
      full_name: z.string().min(1).max(40),
      login_account: loginAccountSchema,
      operation_state: teacherOperationStateSchema,
      role: z.literal('teacher'),
      teacher_id: uuidSchema,
    })
    .refine(
      (value) =>
        value.contact_email_present === (value.contact_email_masked !== null),
      { message: 'masked contact Email presence mismatch' },
    )
    .refine(
      (value) =>
        value.operation_state === 'ready'
          ? value.available_commands.length === 2 &&
            value.available_commands[0] === 'update_teacher_account' &&
            value.available_commands[1] === 'reset_teacher_password'
          : value.available_commands.length === 0,
      {
        message: 'available commands do not match operation state',
        path: ['available_commands'],
      },
    ),
});

const teacherOperationFoundWireSchema = z
  .strictObject({
    legal_follow_up: teacherOperationLegalFollowUpSchema,
    login_account: loginAccountSchema.nullable(),
    operation_id: uuidSchema.nullable(),
    operation_type: teacherMutationCommandSchema,
    outcome: z.literal('ok'),
    request_id: uuidSchema,
    state: teacherOperationStatusStateSchema,
    teacher_id: uuidSchema.nullable(),
  })
  .refine(
    (value) => {
      const expected =
        value.state === 'reconciliation_required'
          ? 'health_reconciliation'
          : value.state === 'completed' || value.state === 'compensated'
            ? 'none'
            : 'wait';
      return value.legal_follow_up === expected;
    },
    {
      message: 'legal follow-up does not match the operation state',
      path: ['legal_follow_up'],
    },
  )
  .refine(
    (value) =>
      value.state === 'operation_pending'
        ? value.operation_id === null &&
          value.teacher_id === null &&
          value.login_account === null
        : value.state === 'completed' || value.operation_id !== null,
    {
      message: 'operation identity does not match the safe status state',
      path: ['operation_id'],
    },
  );

const teacherOperationNotFoundWireSchema = z.strictObject({
  legal_follow_up: z.literal('retry_same_request'),
  login_account: z.null(),
  operation_id: z.null(),
  operation_type: teacherMutationCommandSchema,
  outcome: z.literal('ok'),
  request_id: uuidSchema,
  state: z.literal('not_found'),
  teacher_id: z.null(),
});

export const teacherOperationStatusWireSchema = z.union([
  teacherOperationFoundWireSchema,
  teacherOperationNotFoundWireSchema,
]);

export const teacherDeniedWireSchema = z
  .strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    operationId: uuidSchema.optional(),
    outcome: z.literal('denied'),
    request_id: uuidSchema,
    retryable: z.boolean(),
  })
  .refine(
    (value) =>
      ![
        'TEACHER_OPERATION_PENDING',
        'TEACHER_AUTH_UNAVAILABLE',
        'TEACHER_RECONCILIATION_REQUIRED',
      ].includes(value.code) || value.operationId !== undefined,
    { message: 'status-check denial requires operationId' },
  );

export const teacherCreateSuccessWireSchema = z.strictObject({
  login_account: loginAccountSchema,
  operation_id: uuidSchema,
  outcome: z.literal('ok'),
  password: teacherPasswordSchema,
  request_id: uuidSchema,
  result: z.literal('created'),
  secret_replayable: z.literal(true),
  teacher_id: uuidSchema,
});

export const teacherUpdateSuccessWireSchema = z.strictObject({
  login_account: loginAccountSchema,
  operation_id: uuidSchema,
  outcome: z.literal('ok'),
  request_id: uuidSchema,
  result: z.literal('updated'),
  secret_replayable: z.literal(false),
  teacher_id: uuidSchema,
});

export const teacherResetSuccessWireSchema = z.strictObject({
  login_account: loginAccountSchema,
  operation_id: uuidSchema,
  outcome: z.literal('ok'),
  password: teacherPasswordSchema,
  request_id: uuidSchema,
  result: z.literal('password_reset'),
  secret_replayable: z.literal(true),
  teacher_id: uuidSchema,
});

export const teacherReplayWireSchema = z.strictObject({
  outcome: z.literal('replayed'),
  result: z.strictObject({
    login_account: loginAccountSchema,
    operation_id: uuidSchema,
    outcome: z.literal('ok'),
    request_id: uuidSchema,
    result: z.enum(['created', 'updated', 'password_reset']),
    secret_replayable: z.literal(false),
    teacher_id: uuidSchema,
  }),
});

export type TeacherOperationState = z.infer<typeof teacherOperationStateSchema>;
export type TeacherMutationCommand = z.infer<
  typeof teacherMutationCommandSchema
>;
export type TeacherOperationStatusState = z.infer<
  typeof teacherOperationStatusStateSchema
>;
export type TeacherOperationLegalFollowUp = z.infer<
  typeof teacherOperationLegalFollowUpSchema
>;

export interface TeacherAccountSummary {
  contactEmailMasked: string | null;
  contactEmailPresent: boolean;
  createdAt: string;
  displayName: string;
  loginAccount: string;
  operationState: TeacherOperationState;
  teacherId: string;
}

export interface TeacherListResult {
  nextCursor: string | null;
  outcome: 'ok';
  requestId: string;
  rows: readonly TeacherAccountSummary[];
}

export interface TeacherDeniedResult {
  code: AdminErrorCode;
  message: string;
  operationId: string | null;
  outcome: 'denied';
  requestId: string;
  retryable: boolean;
  statusCheckRequired: boolean;
}

export type TeacherListOutcome = TeacherListResult | TeacherDeniedResult;

export type TeacherAccountCommand =
  'update_teacher_account' | 'reset_teacher_password';

export interface TeacherAccountDetail extends TeacherAccountSummary {
  availableCommands: readonly TeacherAccountCommand[];
  fullName: string;
  role: 'teacher';
}

export interface TeacherDetailResult {
  outcome: 'ok';
  requestId: string;
  teacher: TeacherAccountDetail;
}

export type TeacherDetailOutcome = TeacherDetailResult | TeacherDeniedResult;

export interface GetTeacherOperationInput {
  command: TeacherMutationCommand;
  requestId: string;
}

export interface TeacherOperationStatusResult {
  legalFollowUp: TeacherOperationLegalFollowUp;
  loginAccount: string | null;
  operationId: string | null;
  operationType: TeacherMutationCommand;
  outcome: 'ok';
  requestId: string;
  state: TeacherOperationStatusState | 'not_found';
  teacherId: string | null;
}

export type TeacherOperationStatusOutcome =
  TeacherOperationStatusResult | TeacherDeniedResult;

export interface CreateTeacherAccountInput {
  contactEmail: string | null;
  fullName: string;
  reason: string;
  requestId: string;
}

export interface TeacherCreateResult {
  loginAccount: string;
  operationId: string;
  outcome: 'ok';
  password: string;
  requestId: string;
  result: 'created';
  secretReplayable: true;
  teacherId: string;
}

export type TeacherTerminalResult = 'created' | 'updated' | 'password_reset';

export interface TeacherReplayResult<
  TResult extends TeacherTerminalResult = TeacherTerminalResult,
> {
  loginAccount: string;
  operationId: string;
  outcome: 'replayed';
  requestId: string;
  result: TResult;
  secretReplayable: false;
  teacherId: string;
}

export type TeacherCreateOutcome =
  TeacherCreateResult | TeacherDeniedResult | TeacherReplayResult<'created'>;

export interface UpdateTeacherAccountInput {
  contactEmail: string | null;
  fullName: string;
  reason: string;
  requestId: string;
  teacherId: string;
}

export interface TeacherUpdateResult {
  loginAccount: string;
  operationId: string;
  outcome: 'ok';
  requestId: string;
  result: 'updated';
  secretReplayable: false;
  teacherId: string;
}

export type TeacherUpdateOutcome =
  TeacherUpdateResult | TeacherDeniedResult | TeacherReplayResult<'updated'>;

export interface ResetTeacherPasswordInput {
  reason: string;
  requestId: string;
  teacherId: string;
}

export interface TeacherResetResult {
  loginAccount: string;
  operationId: string;
  outcome: 'ok';
  password: string;
  requestId: string;
  result: 'password_reset';
  secretReplayable: true;
  teacherId: string;
}

export type TeacherResetOutcome =
  | TeacherResetResult
  | TeacherDeniedResult
  | TeacherReplayResult<'password_reset'>;
