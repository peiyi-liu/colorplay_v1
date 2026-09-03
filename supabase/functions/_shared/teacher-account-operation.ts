import { readDenialEnvelope, type DenialEnvelope } from './denial-envelope.ts';

export type TeacherAccountCommand =
  'create_teacher_account' | 'reset_teacher_password';
export type TeacherAccountNamedCommand =
  TeacherAccountCommand | 'update_teacher_account';

const PASSWORD_LENGTH = 12;
const PASSWORD_CLASSES = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
  '!#$%&*+-=?@_',
] as const;
const PASSWORD_ALPHABET = PASSWORD_CLASSES.join('');

export type FillRandom = (target: Uint8Array) => void;

const webCryptoFill: FillRandom = (target) => {
  crypto.getRandomValues(target);
};

const randomIndex = (length: number, fillRandom: FillRandom): number => {
  const limit = 256 - (256 % length);
  const random = new Uint8Array(1);
  do {
    fillRandom(random);
  } while (random[0]! >= limit);
  return random[0]! % length;
};

export function generateTeacherPassword(
  fillRandom: FillRandom = webCryptoFill,
): string {
  const password = PASSWORD_CLASSES.map(
    (characters) => characters[randomIndex(characters.length, fillRandom)],
  );
  while (password.length < PASSWORD_LENGTH) {
    password.push(
      PASSWORD_ALPHABET[randomIndex(PASSWORD_ALPHABET.length, fillRandom)],
    );
  }
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, fillRandom);
    [password[index], password[swapIndex]] = [
      password[swapIndex],
      password[index],
    ];
  }
  return password.join('');
}

const TEACHER_LOGIN_ACCOUNT = /^teacher[0-9]{2,13}$/;
const INTERNAL_EMAIL_NAMESPACE =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+invalid$/;

export function buildTeacherInternalEmail(
  loginAccount: string,
  namespace: string,
): string {
  if (
    !TEACHER_LOGIN_ACCOUNT.test(loginAccount) ||
    namespace.length > 253 ||
    !INTERNAL_EMAIL_NAMESPACE.test(namespace)
  ) {
    throw new Error('invalid teacher internal identity');
  }
  return `${loginAccount}@${namespace}`;
}

type RpcResult<T> = PromiseLike<{ data: T | null; error: unknown | null }>;

interface TeacherAccountOperation {
  operation_id: string;
  operation_type: TeacherAccountCommand;
  state: string;
  reserved_auth_user_id: string | null;
  cleanup_auth_user_id: string | null;
  teacher_id: string | null;
  login_account: string | null;
  reconciliation_action: string | null;
  auth_call_kind:
    | null
    | 'create_user'
    | 'reset_password'
    | 'enable_user'
    | 'delete_user';
  redacted_result: Record<string, unknown>;
}

interface ClaimedExecution {
  outcome: 'ok';
  claim_status: 'acquired' | 'terminal';
  claim_token: string | null;
  operation: TeacherAccountOperation;
}

interface CompletedOperation {
  outcome: 'ok';
  operation_id: string;
  teacher_id: string;
  login_account: string;
  result: string;
  secret_replayable: false;
  newly_completed: boolean;
}

interface SafeEvent {
  command: TeacherAccountCommand;
  operationId: string;
  step: string;
  safeCode?: string;
}

export interface TeacherAccountOperationDependencies {
  internalEmailNamespace: string;
  generatePassword: () => string;
  recordSafeEvent: (event: SafeEvent) => void;
  store: {
    claimExecution: (input: {
      operationId: string;
      expectedOperationType: TeacherAccountCommand;
    }) => RpcResult<ClaimedExecution | DenialEnvelope & { operation_id: string }>;
    markAuthApplied: (input: {
      operationId: string;
      expectedOperationType: TeacherAccountCommand;
      executionClaimToken: string;
      authUserId: string;
    }) => RpcResult<{ outcome: 'ok' }>;
    beginAuthCall: (input: {
      operationId: string;
      expectedOperationType: TeacherAccountCommand;
      executionClaimToken: string;
      authCallKind:
        | 'create_user'
        | 'reset_password'
        | 'enable_user'
        | 'delete_user';
    }) => RpcResult<{ outcome: 'ok' }>;
    commitTeacherProfile: (input: {
      operationId: string;
      expectedOperationType: TeacherAccountCommand;
      executionClaimToken: string;
    }) => RpcResult<{ outcome: 'ok' }>;
    completeOperation: (input: {
      operationId: string;
      expectedOperationType: TeacherAccountCommand;
      executionClaimToken: string;
    }) => RpcResult<CompletedOperation>;
    beginCreateCompensation: (input: {
      operationId: string;
      expectedOperationType: 'create_teacher_account';
      safeCode: string;
      cleanupAuthUserId: string;
      executionClaimToken: string;
    }) => RpcResult<{ outcome: 'ok' }>;
    completeCreateCompensation: (input: {
      operationId: string;
      expectedOperationType: 'create_teacher_account';
      safeCode: string;
      executionClaimToken: string;
    }) => RpcResult<{ outcome: 'ok' }>;
    requireReconciliation: (input: {
      operationId: string;
      expectedOperationType: TeacherAccountCommand;
      safeCode: string;
      executionClaimToken: string;
    }) => RpcResult<{ outcome: 'ok' }>;
  };
  auth: {
    getUserById: (userId: string) => RpcResult<{ user: { id: string } | null }>;
    createUser: (attributes: {
      id: string;
      email: string;
      password: string;
      email_confirm: true;
      ban_duration: string;
    }) => RpcResult<{ user: { id: string } }>;
    updateUserById: (
      userId: string,
      attributes: { password?: string; ban_duration?: string },
    ) => RpcResult<{ user: { id: string } }>;
    deleteUser: (userId: string) => RpcResult<unknown>;
  };
}

interface ReconciliationClaim {
  outcome: 'ok';
  claim_token: string;
  operation: TeacherAccountOperation;
}

export interface TeacherAccountReconciliationDependencies {
  recordSafeEvent: (event: SafeEvent) => void;
  store: {
    claimReconciliation: (input: {
      operationId: string;
      expectedOperationType: TeacherAccountCommand;
    }) => RpcResult<ReconciliationClaim>;
    resolveReconciliation: (input: {
      operationId: string;
      expectedOperationType: TeacherAccountCommand;
      claimToken: string;
    }) => RpcResult<{ outcome: 'ok' }>;
    releaseReconciliation: (input: {
      operationId: string;
      expectedOperationType: TeacherAccountCommand;
      claimToken: string;
      safeCode: 'TEACHER_AUTH_UNAVAILABLE';
    }) => RpcResult<{ outcome: 'ok' }>;
  };
  auth: {
    deleteUser: (userId: string) => RpcResult<unknown>;
  };
}

export type TeacherAccountSagaResult =
  | {
      kind: 'response';
      operationId: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: 'denied';
      operationId: string;
      code: TeacherDenialCode;
      envelope?: DenialEnvelope;
    };

export type TeacherAccountReconciliationResult =
  | { kind: 'resolved'; operationId: string }
  | {
      kind: 'deferred';
      operationId: string;
      code: 'TEACHER_AUTH_UNAVAILABLE';
    };

export type TeacherAccountReplayResolution =
  | {
      kind: 'resume';
      command: TeacherAccountCommand;
      operationId: string;
    }
  | { kind: 'response'; payload: Record<string, unknown> }
  | { kind: 'denial'; envelope: DenialEnvelope };

export type TeacherDenialCode =
  | 'TEACHER_ACCOUNT_INVALID'
  | 'TEACHER_ACCOUNT_CONFLICT'
  | 'TEACHER_OPERATION_PENDING'
  | 'TEACHER_AUTH_UNAVAILABLE'
  | 'TEACHER_RECONCILIATION_REQUIRED';

const TEACHER_DENIAL_CODES = new Set<TeacherDenialCode>([
  'TEACHER_ACCOUNT_INVALID',
  'TEACHER_ACCOUNT_CONFLICT',
  'TEACHER_OPERATION_PENDING',
  'TEACHER_AUTH_UNAVAILABLE',
  'TEACHER_RECONCILIATION_REQUIRED',
]);
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveTeacherAccountReplay(
  command: TeacherAccountNamedCommand,
  value: unknown,
): TeacherAccountReplayResolution | null {
  const denial = readDenialEnvelope(value);
  if (denial !== null) {
    return TEACHER_DENIAL_CODES.has(denial.code as TeacherDenialCode)
      ? { kind: 'denial', envelope: denial }
      : null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const operationId = payload.operation_id;
  if (
    payload.outcome !== 'ok' ||
    typeof operationId !== 'string' ||
    !UUID_SHAPE.test(operationId)
  ) {
    return null;
  }
  const terminalResult = {
    create_teacher_account: 'created',
    update_teacher_account: 'updated',
    reset_teacher_password: 'password_reset',
  }[command];
  if (
    payload.result === 'operation_pending' &&
    command !== 'update_teacher_account'
  ) {
    return { kind: 'resume', command, operationId };
  }
  if (
    payload.result !== terminalResult ||
    typeof payload.teacher_id !== 'string' ||
    !UUID_SHAPE.test(payload.teacher_id) ||
    typeof payload.login_account !== 'string' ||
    !TEACHER_LOGIN_ACCOUNT.test(payload.login_account) ||
    payload.secret_replayable !== false
  ) {
    return null;
  }
  return { kind: 'response', payload: redactTeacherAccountResult(payload) };
}

const readTeacherDenial = (value: unknown): DenialEnvelope | null => {
  const denial = readDenialEnvelope(value);
  return denial !== null &&
    TEACHER_DENIAL_CODES.has(denial.code as TeacherDenialCode)
    ? denial
    : null;
};

const rpcFailed = (result: {
  data: { outcome?: unknown } | null;
  error: unknown | null;
}): boolean =>
  result.error !== null || result.data === null || result.data.outcome !== 'ok';

const requireData = <T extends { outcome: 'ok' }>(
  result: { data: T | null; error: unknown | null },
  step: string,
): T => {
  if (rpcFailed(result)) {
    throw new Error(`teacher account operation failed at ${step}`);
  }
  return result.data!;
};

export const redactTeacherAccountResult = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = { secret_replayable: false };
  for (const field of [
    'outcome',
    'operation_id',
    'teacher_id',
    'login_account',
    'result',
    'request_id',
  ]) {
    const candidate = value[field];
    if (typeof candidate === 'string') result[field] = candidate;
  }
  return result;
};

const completionResponse = (
  operationId: string,
  command: TeacherAccountCommand,
  expectedTeacherId: string,
  expectedLoginAccount: string,
  value: unknown,
  password: string,
): TeacherAccountSagaResult => {
  const completed = readCompletedOperation(
    value,
    operationId,
    command,
    expectedTeacherId,
    expectedLoginAccount,
  );
  const payload = redactTeacherAccountResult(
    completed as unknown as Record<string, unknown>,
  );
  if (!completed.newly_completed) {
    return { kind: 'response', operationId, payload };
  }
  return {
    kind: 'response',
    operationId,
    payload: { ...payload, secret_replayable: true, password },
  };
};

const readCompletedOperation = (
  value: unknown,
  operationId: string,
  command: TeacherAccountCommand,
  expectedTeacherId: string,
  expectedLoginAccount: string,
): CompletedOperation => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('teacher completion response is malformed');
  }
  const completed = value as Record<string, unknown>;
  const expectedResult =
    command === 'create_teacher_account' ? 'created' : 'password_reset';
  if (
    completed.outcome !== 'ok' ||
    completed.operation_id !== operationId ||
    completed.teacher_id !== expectedTeacherId ||
    completed.login_account !== expectedLoginAccount ||
    completed.result !== expectedResult ||
    completed.secret_replayable !== false ||
    typeof completed.newly_completed !== 'boolean'
  ) {
    throw new Error('teacher completion response is malformed');
  }
  return completed as unknown as CompletedOperation;
};

const readCompletedReceipt = (
  value: unknown,
  operation: TeacherAccountOperation,
): Record<string, unknown> => {
  const expectedResult =
    operation.operation_type === 'create_teacher_account'
      ? 'created'
      : 'password_reset';
  if (
    operation.teacher_id === null ||
    operation.login_account === null ||
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error('teacher completed receipt is malformed');
  }
  const receipt = value as Record<string, unknown>;
  if (
    receipt.outcome !== 'ok' ||
    receipt.operation_id !== operation.operation_id ||
    receipt.teacher_id !== operation.teacher_id ||
    receipt.login_account !== operation.login_account ||
    receipt.result !== expectedResult ||
    receipt.secret_replayable !== false
  ) {
    throw new Error('teacher completed receipt is malformed');
  }
  return receipt;
};

const requireReconciliation = async (
  operationId: string,
  expectedOperationType: TeacherAccountCommand,
  executionClaimToken: string,
  dependencies: TeacherAccountOperationDependencies,
): Promise<TeacherAccountSagaResult> => {
  const safeCode = 'TEACHER_RECONCILIATION_REQUIRED';
  requireData(
    await dependencies.store.requireReconciliation({
      operationId,
      expectedOperationType,
      safeCode,
      executionClaimToken,
    }),
    'require_reconciliation',
  );
  dependencies.recordSafeEvent({
    command: expectedOperationType,
    operationId,
    step: 'reconciliation_required',
    safeCode,
  });
  return { kind: 'denied', operationId, code: safeCode };
};

const compensateCreate = async (
  operationId: string,
  cleanupAuthUserId: string,
  executionClaimToken: string,
  dependencies: TeacherAccountOperationDependencies,
): Promise<TeacherAccountSagaResult> => {
  const safeCode = 'TEACHER_AUTH_UNAVAILABLE';
  requireData(
    await dependencies.store.beginCreateCompensation({
      operationId,
      expectedOperationType: 'create_teacher_account',
      safeCode,
      cleanupAuthUserId,
      executionClaimToken,
    }),
    'begin_create_compensation',
  );
  requireData(
    await dependencies.store.beginAuthCall({
      operationId,
      expectedOperationType: 'create_teacher_account',
      executionClaimToken,
      authCallKind: 'delete_user',
    }),
    'begin_auth_call',
  );
  const cleanup = await dependencies.auth.deleteUser(cleanupAuthUserId);
  if (cleanup.error !== null || cleanup.data === null) {
    return requireReconciliation(
      operationId,
      'create_teacher_account',
      executionClaimToken,
      dependencies,
    );
  }
  const completion = await dependencies.store.completeCreateCompensation({
    operationId,
    expectedOperationType: 'create_teacher_account',
    safeCode,
    executionClaimToken,
  });
  if (rpcFailed(completion)) {
    return requireReconciliation(
      operationId,
      'create_teacher_account',
      executionClaimToken,
      dependencies,
    );
  }
  dependencies.recordSafeEvent({
    command: 'create_teacher_account',
    operationId,
    step: 'create_failed_compensated',
    safeCode,
  });
  return { kind: 'denied', operationId, code: safeCode };
};

export async function executeTeacherAccountSaga(
  input: { command: TeacherAccountCommand; operationId: string },
  dependencies: TeacherAccountOperationDependencies,
): Promise<TeacherAccountSagaResult> {
  const claimResult = await dependencies.store.claimExecution({
      operationId: input.operationId,
      expectedOperationType: input.command,
    });
  if (claimResult.error !== null || claimResult.data === null) {
    throw new Error('teacher account operation failed at claim_execution');
  }
  const claimDenial = readTeacherDenial(claimResult.data);
  if (claimDenial !== null) {
    const operationId = (claimResult.data as { operation_id?: unknown })
      .operation_id;
    if (
      claimDenial.code !== 'TEACHER_OPERATION_PENDING' ||
      operationId !== input.operationId
    ) {
      throw new Error('teacher execution claim denial mismatch');
    }
    return {
      kind: 'denied',
      operationId: input.operationId,
      code: 'TEACHER_OPERATION_PENDING',
      envelope: claimDenial,
    };
  }
  const claim = claimResult.data as ClaimedExecution;
  if (
    claim.outcome !== 'ok' ||
    (claim.claim_status !== 'acquired' && claim.claim_status !== 'terminal') ||
    (claim.claim_status === 'acquired' &&
      (typeof claim.claim_token !== 'string' ||
        !UUID_SHAPE.test(claim.claim_token))) ||
    (claim.claim_status === 'terminal' && claim.claim_token !== null)
  ) {
    throw new Error('teacher execution claim is malformed');
  }
  const operation = claim.operation;

  if (
    operation.operation_id !== input.operationId ||
    operation.operation_type !== input.command
  ) {
    throw new Error('teacher account operation identity mismatch');
  }

  if (claim.claim_status === 'terminal') {
    if (
      operation.state !== 'completed' &&
      operation.state !== 'compensated' &&
      operation.state !== 'reconciliation_required'
    ) {
      throw new Error('teacher terminal execution claim state mismatch');
    }
  } else if (
    operation.state === 'completed' ||
    operation.state === 'compensated' ||
    operation.state === 'reconciliation_required'
  ) {
    throw new Error('teacher acquired execution claim state mismatch');
  }

  if (operation.state === 'completed') {
    return {
      kind: 'response',
      operationId: input.operationId,
      payload: redactTeacherAccountResult(
        readCompletedReceipt(operation.redacted_result, operation),
      ),
    };
  }
  if (operation.state === 'reconciliation_required') {
    const envelope = readTeacherDenial(operation.redacted_result);
    if (envelope === null) {
      throw new Error('teacher reconciliation receipt is malformed');
    }
    return {
      kind: 'denied',
      operationId: input.operationId,
      code: envelope.code as TeacherDenialCode,
      envelope,
    };
  }
  if (operation.state === 'compensated') {
    const envelope = readTeacherDenial(operation.redacted_result);
    if (envelope === null) {
      throw new Error('teacher compensated receipt is malformed');
    }
    return {
      kind: 'denied',
      operationId: input.operationId,
      code: envelope.code as TeacherDenialCode,
      envelope,
    };
  }

  if (claim.claim_status !== 'acquired' || claim.claim_token === null) {
    throw new Error('teacher execution claim is not active');
  }
  const executionClaimToken = claim.claim_token;

  if (input.command === 'reset_teacher_password') {
    if (
      operation.state === 'auth_created_or_password_updated' ||
      operation.auth_call_kind === 'reset_password'
    ) {
      return requireReconciliation(
        input.operationId,
        input.command,
        executionClaimToken,
        dependencies,
      );
    }
    if (
      operation.state !== 'requested' ||
      operation.teacher_id === null ||
      operation.login_account === null
    ) {
      throw new Error('teacher password reset is not executable');
    }
    const password = dependencies.generatePassword();
    const teacherId = operation.teacher_id;
    requireData(
      await dependencies.store.beginAuthCall({
        operationId: input.operationId,
        expectedOperationType: input.command,
        executionClaimToken,
        authCallKind: 'reset_password',
      }),
      'begin_auth_call',
    );
    const passwordUpdate = await dependencies.auth.updateUserById(teacherId, {
      password,
    });
    if (
      passwordUpdate.error !== null ||
      passwordUpdate.data === null ||
      passwordUpdate.data.user.id !== teacherId
    ) {
      return requireReconciliation(
        input.operationId,
        input.command,
        executionClaimToken,
        dependencies,
      );
    }
    const markResult = await dependencies.store.markAuthApplied({
      operationId: input.operationId,
      expectedOperationType: input.command,
      executionClaimToken,
      authUserId: teacherId,
    });
    if (rpcFailed(markResult)) {
      return requireReconciliation(
        input.operationId,
        input.command,
        executionClaimToken,
        dependencies,
      );
    }
    const completion = await dependencies.store.completeOperation({
      operationId: input.operationId,
      expectedOperationType: input.command,
      executionClaimToken,
    });
    if (rpcFailed(completion)) {
      return requireReconciliation(
        input.operationId,
        input.command,
        executionClaimToken,
        dependencies,
      );
    }
    const completed = completion.data;
    return completionResponse(
      input.operationId,
      input.command,
      teacherId,
      operation.login_account,
      completed,
      password,
    );
  }

  if (
    operation.reserved_auth_user_id === null ||
    operation.login_account === null
  ) {
    throw new Error('teacher account operation is not executable');
  }

  const authUserId = operation.reserved_auth_user_id;
  if (
    operation.state === 'auth_created_or_password_updated' ||
    operation.state === 'profile_committed' ||
    operation.state === 'compensation_pending'
  ) {
    return compensateCreate(
      input.operationId,
      operation.cleanup_auth_user_id ?? authUserId,
      executionClaimToken,
      dependencies,
    );
  }
  if (operation.state !== 'identity_reserved') {
    throw new Error('teacher account operation is not executable');
  }

  if (operation.auth_call_kind === 'create_user') {
    const uncertainIdentity = await dependencies.auth.getUserById(authUserId);
    if (uncertainIdentity.error !== null || uncertainIdentity.data === null) {
      return requireReconciliation(
        input.operationId,
        input.command,
        executionClaimToken,
        dependencies,
      );
    }
    if (uncertainIdentity.data.user === null) {
      return requireReconciliation(
        input.operationId,
        input.command,
        executionClaimToken,
        dependencies,
      );
    }
    if (uncertainIdentity.data.user.id !== authUserId) {
      return requireReconciliation(
        input.operationId,
        input.command,
        executionClaimToken,
        dependencies,
      );
    }
    return compensateCreate(
      input.operationId,
      authUserId,
      executionClaimToken,
      dependencies,
    );
  }
  if (operation.auth_call_kind !== null) {
    return requireReconciliation(
      input.operationId,
      input.command,
      executionClaimToken,
      dependencies,
    );
  }

  let internalEmail: string;
  try {
    internalEmail = buildTeacherInternalEmail(
      operation.login_account,
      dependencies.internalEmailNamespace,
    );
  } catch {
    const safeCode = 'TEACHER_AUTH_UNAVAILABLE';
    requireData(
      await dependencies.store.beginCreateCompensation({
        operationId: input.operationId,
        expectedOperationType: 'create_teacher_account',
        safeCode,
        cleanupAuthUserId: authUserId,
        executionClaimToken,
      }),
      'begin_create_compensation',
    );
    requireData(
      await dependencies.store.completeCreateCompensation({
        operationId: input.operationId,
        expectedOperationType: 'create_teacher_account',
        safeCode,
        executionClaimToken,
      }),
      'complete_create_compensation',
    );
    return { kind: 'denied', operationId: input.operationId, code: safeCode };
  }

  const existing = await dependencies.auth.getUserById(authUserId);
  if (existing.error !== null || existing.data === null) {
    return requireReconciliation(
      input.operationId,
      input.command,
      executionClaimToken,
      dependencies,
    );
  }
  if (existing.data.user !== null) {
    if (existing.data.user.id !== authUserId) {
      return requireReconciliation(
        input.operationId,
        input.command,
        executionClaimToken,
        dependencies,
      );
    }
    return compensateCreate(
      input.operationId,
      authUserId,
      executionClaimToken,
      dependencies,
    );
  }
  const password = dependencies.generatePassword();

  requireData(
    await dependencies.store.beginAuthCall({
      operationId: input.operationId,
      expectedOperationType: input.command,
      executionClaimToken,
      authCallKind: 'create_user',
    }),
    'begin_auth_call',
  );

  const createResult = await dependencies.auth.createUser({
    id: authUserId,
    email: internalEmail,
    password,
    email_confirm: true,
    ban_duration: '876000h',
  });
  if (createResult.error !== null || createResult.data === null) {
    return requireReconciliation(
      input.operationId,
      input.command,
      executionClaimToken,
      dependencies,
    );
  }
  const created = createResult.data;
  if (created.user.id !== authUserId) {
    return compensateCreate(
      input.operationId,
      created.user.id,
      executionClaimToken,
      dependencies,
    );
  }

  const markResult = await dependencies.store.markAuthApplied({
    operationId: input.operationId,
    expectedOperationType: input.command,
    executionClaimToken,
    authUserId,
  });
  if (rpcFailed(markResult)) {
    return compensateCreate(
      input.operationId,
      authUserId,
      executionClaimToken,
      dependencies,
    );
  }
  const profileResult = await dependencies.store.commitTeacherProfile({
    operationId: input.operationId,
    expectedOperationType: input.command,
    executionClaimToken,
  });
  if (rpcFailed(profileResult)) {
    return compensateCreate(
      input.operationId,
      authUserId,
      executionClaimToken,
      dependencies,
    );
  }
  requireData(
    await dependencies.store.beginAuthCall({
      operationId: input.operationId,
      expectedOperationType: input.command,
      executionClaimToken,
      authCallKind: 'enable_user',
    }),
    'begin_auth_call',
  );
  const enableResult = await dependencies.auth.updateUserById(authUserId, {
    ban_duration: 'none',
  });
  if (
    enableResult.error !== null ||
    enableResult.data === null ||
    enableResult.data.user.id !== authUserId
  ) {
    return requireReconciliation(
      input.operationId,
      input.command,
      executionClaimToken,
      dependencies,
    );
  }
  const completion = await dependencies.store.completeOperation({
    operationId: input.operationId,
    expectedOperationType: input.command,
    executionClaimToken,
  });
  if (rpcFailed(completion)) {
    return requireReconciliation(
      input.operationId,
      input.command,
      executionClaimToken,
      dependencies,
    );
  }
  const completed = completion.data;

  return completionResponse(
    input.operationId,
    input.command,
    authUserId,
    operation.login_account,
    completed,
    password,
  );
}

export async function reconcileTeacherAccountOperation(
  input: { command: TeacherAccountCommand; operationId: string },
  dependencies: TeacherAccountReconciliationDependencies,
): Promise<TeacherAccountReconciliationResult> {
  const claim = requireData(
    await dependencies.store.claimReconciliation({
      operationId: input.operationId,
      expectedOperationType: input.command,
    }),
    'claim_reconciliation',
  );
  const operation = claim.operation;
  if (
    claim.claim_token === '' ||
    operation.operation_id !== input.operationId ||
    operation.operation_type !== input.command ||
    operation.state !== 'reconciliation_required'
  ) {
    throw new Error('teacher reconciliation claim mismatch');
  }
  if (
    operation.auth_call_kind !== null &&
    operation.auth_call_kind !== 'delete_user'
  ) {
    throw new Error('teacher reconciliation contains uncertain Auth intent');
  }

  if (input.command === 'create_teacher_account') {
    if (
      operation.reconciliation_action !== 'delete_cleanup_auth_user' ||
      operation.cleanup_auth_user_id === null
    ) {
      throw new Error('teacher create reconciliation action mismatch');
    }
    const cleanupIds = [operation.cleanup_auth_user_id];
    if (
      operation.reserved_auth_user_id !== null &&
      operation.reserved_auth_user_id !== operation.cleanup_auth_user_id
    ) {
      cleanupIds.push(operation.reserved_auth_user_id);
    }
    for (const cleanupId of cleanupIds) {
      const cleanup = await dependencies.auth.deleteUser(cleanupId);
      if (cleanup.error !== null || cleanup.data === null) {
        const safeCode = 'TEACHER_AUTH_UNAVAILABLE';
        requireData(
          await dependencies.store.releaseReconciliation({
            operationId: input.operationId,
            expectedOperationType: input.command,
            claimToken: claim.claim_token,
            safeCode,
          }),
          'release_reconciliation',
        );
        dependencies.recordSafeEvent({
          command: input.command,
          operationId: input.operationId,
          step: 'reconciliation_deferred',
          safeCode,
        });
        return {
          kind: 'deferred',
          operationId: input.operationId,
          code: safeCode,
        };
      }
    }
  } else if (
    operation.reconciliation_action !== 'close_password_reset_redacted'
  ) {
    throw new Error('teacher reset reconciliation action mismatch');
  }

  requireData(
    await dependencies.store.resolveReconciliation({
      operationId: input.operationId,
      expectedOperationType: input.command,
      claimToken: claim.claim_token,
    }),
    'resolve_reconciliation',
  );
  dependencies.recordSafeEvent({
    command: input.command,
    operationId: input.operationId,
    step: 'reconciliation_resolved',
  });
  return { kind: 'resolved', operationId: input.operationId };
}
