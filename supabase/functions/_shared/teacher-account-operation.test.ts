import { describe, expect, it } from 'vitest';

import {
  executeTeacherAccountSaga,
  reconcileTeacherAccountOperation,
  type TeacherAccountOperationDependencies,
  type TeacherAccountReconciliationDependencies,
  type TeacherAccountSagaResult,
} from './teacher-account-operation';

const OPERATION_ID = '22000000-0000-0000-0000-000000000001';
const AUTH_USER_ID = '22000000-0000-0000-0000-000000000002';
const EXECUTION_CLAIM_TOKEN = '22000000-0000-4000-8000-000000000003';
let accountCounter = 41;

const ok = <T>(data: T) => Promise.resolve({ data, error: null });
const failed = (message: string) =>
  Promise.resolve({ data: null, error: new Error(message) });
const unexpected = (label: string): never => {
  throw new Error(`unexpected ${label}`);
};
const callNames = (calls: unknown[]): unknown[] =>
  calls.map((entry) => (entry as unknown[])[0]);
const callAt = (calls: unknown[], index: number): unknown[] =>
  calls[index] as unknown[];

const createHarness = () => {
  const storeCalls: unknown[] = [];
  const authCalls: unknown[] = [];
  const safeEvents: unknown[] = [];
  const password = `A1!a${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
  const loginAccount = `teacher${++accountCounter}`;
  const namespace = 'teachers.local.invalid';
  const internalEmail = `${loginAccount}@${namespace}`;
  const operation = {
    operation_id: OPERATION_ID,
    operation_type: 'create_teacher_account' as
      'create_teacher_account' | 'reset_teacher_password',
    state: 'identity_reserved',
    reserved_auth_user_id: AUTH_USER_ID,
    cleanup_auth_user_id: AUTH_USER_ID,
    teacher_id: null as string | null,
    login_account: loginAccount,
    reconciliation_action: null,
    auth_call_kind: null as
      | null
      | 'create_user'
      | 'reset_password'
      | 'enable_user'
      | 'delete_user',
    redacted_result: {
      operation_id: OPERATION_ID,
      login_account: loginAccount,
      result: 'operation_pending',
      secret_replayable: false,
    } as Record<string, unknown>,
  };
  const completion = {
    outcome: 'ok' as const,
    operation_id: OPERATION_ID,
    teacher_id: AUTH_USER_ID,
    login_account: loginAccount,
    result: 'created',
    secret_replayable: false as const,
    newly_completed: true,
  };
  const dependencies: TeacherAccountOperationDependencies = {
    internalEmailNamespace: namespace,
    generatePassword: () => password,
    recordSafeEvent: (event) => safeEvents.push(event),
    store: {
      claimExecution: (input) => {
        storeCalls.push(['claimExecution', input]);
        const terminal = [
          'completed',
          'compensated',
          'reconciliation_required',
        ].includes(operation.state);
        return ok({
          outcome: 'ok' as const,
          claim_status: terminal ? ('terminal' as const) : ('acquired' as const),
          claim_token: terminal ? null : EXECUTION_CLAIM_TOKEN,
          operation,
        });
      },
      beginAuthCall: (input) => {
        storeCalls.push(['beginAuthCall', input]);
        operation.auth_call_kind = input.authCallKind;
        return ok({ outcome: 'ok' as const });
      },
      markAuthApplied: (input) => {
        storeCalls.push(['markAuthApplied', input]);
        return ok({ outcome: 'ok' as const });
      },
      commitTeacherProfile: (input) => {
        storeCalls.push(['commitTeacherProfile', input]);
        return ok({ outcome: 'ok' as const });
      },
      completeOperation: (input) => {
        storeCalls.push(['completeOperation', input]);
        return ok(completion);
      },
      beginCreateCompensation: (input) => {
        storeCalls.push(['beginCreateCompensation', input]);
        return ok({ outcome: 'ok' as const });
      },
      completeCreateCompensation: (input) => {
        storeCalls.push(['completeCreateCompensation', input]);
        return ok({ outcome: 'ok' as const });
      },
      requireReconciliation: (input) => {
        storeCalls.push(['requireReconciliation', input]);
        return ok({ outcome: 'ok' as const });
      },
    },
    auth: {
      getUserById: (userId) => {
        authCalls.push(['getUserById', userId]);
        return ok({ user: null });
      },
      createUser: (attributes) => {
        authCalls.push(['createUser', attributes]);
        return ok({ user: { id: AUTH_USER_ID } });
      },
      updateUserById: (userId, attributes) => {
        authCalls.push(['updateUserById', userId, attributes]);
        return ok({ user: { id: userId } });
      },
      deleteUser: (userId) => {
        authCalls.push(['deleteUser', userId]);
        return ok({});
      },
    },
  };
  return {
    authCalls,
    completion,
    dependencies,
    internalEmail,
    loginAccount,
    operation,
    password,
    safeEvents,
    storeCalls,
  };
};

type Harness = ReturnType<typeof createHarness>;

const execute = (harness: Harness) =>
  executeTeacherAccountSaga(
    {
      command: harness.operation.operation_type,
      operationId: OPERATION_ID,
    },
    harness.dependencies,
  );

const makeReset = (harness: Harness): void => {
  harness.operation.operation_type = 'reset_teacher_password';
  harness.operation.state = 'requested';
  harness.operation.reserved_auth_user_id = null;
  harness.operation.teacher_id = AUTH_USER_ID;
  harness.completion.result = 'password_reset';
  harness.dependencies.store.commitTeacherProfile = () =>
    unexpected('commitTeacherProfile');
  harness.dependencies.auth.createUser = () => unexpected('createUser');
  harness.dependencies.auth.deleteUser = () => unexpected('deleteUser');
};

const expectDenied = (
  result: TeacherAccountSagaResult,
  code:
    | 'TEACHER_OPERATION_PENDING'
    | 'TEACHER_AUTH_UNAVAILABLE'
    | 'TEACHER_RECONCILIATION_REQUIRED',
): void => {
  expect(result.kind).toBe('denied');
  expect(result.operationId).toBe(OPERATION_ID);
  expect(result.kind === 'denied' ? result.code : null).toBe(code);
};

const expectAbsentFromProtectedSinks = (
  harness: Harness,
  result?: TeacherAccountSagaResult,
  extra?: string,
): void => {
  const sinks = JSON.stringify({
    result,
    storeCalls: harness.storeCalls,
    safeEvents: harness.safeEvents,
  });
  expect(sinks.includes(harness.password)).toBe(false);
  expect(sinks.includes(harness.internalEmail)).toBe(false);
  if (extra) expect(sinks.includes(extra)).toBe(false);
};

const createReconciliationHarness = (
  command: 'create_teacher_account' | 'reset_teacher_password',
  cleanupAuthUserId = AUTH_USER_ID,
) => {
  const storeCalls: unknown[] = [];
  const authCalls: unknown[] = [];
  const safeEvents: unknown[] = [];
  const claimToken = crypto.randomUUID();
  const dependencies: TeacherAccountReconciliationDependencies = {
    recordSafeEvent: (event) => safeEvents.push(event),
    store: {
      claimReconciliation: (input) => {
        storeCalls.push(['claimReconciliation', input]);
        return ok({
          outcome: 'ok' as const,
          claim_token: claimToken,
          operation: {
            operation_id: OPERATION_ID,
            operation_type: command,
            state: 'reconciliation_required',
            reserved_auth_user_id:
              command === 'create_teacher_account' ? AUTH_USER_ID : null,
            cleanup_auth_user_id:
              command === 'create_teacher_account' ? cleanupAuthUserId : null,
            teacher_id:
              command === 'reset_teacher_password' ? AUTH_USER_ID : null,
            login_account: null,
            auth_call_kind: null,
            reconciliation_action:
              command === 'create_teacher_account'
                ? 'delete_cleanup_auth_user'
                : 'close_password_reset_redacted',
            redacted_result: {
              operation_id: OPERATION_ID,
              result: 'reconciliation_required',
              secret_replayable: false,
            },
          },
        });
      },
      resolveReconciliation: (input) => {
        storeCalls.push(['resolveReconciliation', input]);
        return ok({ outcome: 'ok' as const });
      },
      releaseReconciliation: (input) => {
        storeCalls.push(['releaseReconciliation', input]);
        return ok({ outcome: 'ok' as const });
      },
    },
    auth: {
      deleteUser: (userId) => {
        authCalls.push(['deleteUser', userId]);
        return ok({});
      },
    },
  };
  return { authCalls, claimToken, dependencies, safeEvents, storeCalls };
};

describe('teacher account operation saga', () => {
  it.each(['create_teacher_account', 'reset_teacher_password'] as const)(
    'returns pending with zero Auth side effects when another worker owns an active %s execution claim',
    async (command) => {
    const harness = createHarness();
    if (command === 'reset_teacher_password') makeReset(harness);
    const requestId = crypto.randomUUID();
    Object.assign(harness.dependencies.store, {
      claimExecution: (input: unknown) => {
        harness.storeCalls.push(['claimExecution', input]);
        return ok({
          outcome: 'denied' as const,
          code: 'TEACHER_OPERATION_PENDING',
          message: '教師帳號已有尚未完成的安全作業。',
          request_id: requestId,
          retryable: false,
          operation_id: OPERATION_ID,
        });
      },
    });
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');
    harness.dependencies.auth.getUserById = () => unexpected('getUserById');
    harness.dependencies.auth.createUser = () => unexpected('createUser');

    const result = await execute(harness);

    expectDenied(result, 'TEACHER_OPERATION_PENDING');
    expect(callNames(harness.storeCalls)).toEqual(['claimExecution']);
    expect(harness.authCalls).toEqual([]);
    expect(result.kind === 'denied' && result.envelope).toEqual({
      outcome: 'denied',
      code: 'TEACHER_OPERATION_PENDING',
      message: '教師帳號已有尚未完成的安全作業。',
      request_id: requestId,
      retryable: false,
    });
    },
  );

  it('never lets an expired create worker compensate an identity owned by a takeover worker', async () => {
    const harness = createHarness();
    harness.dependencies.store.markAuthApplied = (input) => {
      harness.storeCalls.push(['markAuthApplied', input]);
      return ok({ outcome: 'denied' } as unknown as { outcome: 'ok' });
    };
    harness.dependencies.store.beginCreateCompensation = (input) => {
      harness.storeCalls.push(['beginCreateCompensation', input]);
      return ok({ outcome: 'denied' } as unknown as { outcome: 'ok' });
    };
    harness.dependencies.auth.deleteUser = () => unexpected('deleteUser');

    await expect(execute(harness)).rejects.toThrow(
      'teacher account operation failed at begin_create_compensation',
    );

    expect(callNames(harness.authCalls)).toEqual([
      'getUserById',
      'createUser',
    ]);
    expect(callAt(harness.storeCalls, 1)[1]).toMatchObject({
      executionClaimToken: EXECUTION_CLAIM_TOKEN,
    });
    expect(callAt(harness.storeCalls, 2)[1]).toMatchObject({
      executionClaimToken: EXECUTION_CLAIM_TOKEN,
    });
  });

  it('moves an expired reset attempt with durable Auth-call intent to redacted reconciliation without a second password write', async () => {
    const harness = createHarness();
    makeReset(harness);
    harness.operation.auth_call_kind = 'reset_password';
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');
    harness.dependencies.auth.updateUserById = () =>
      unexpected('updateUserById');

    const result = await execute(harness);

    expectDenied(result, 'TEACHER_RECONCILIATION_REQUIRED');
    expect(harness.authCalls).toEqual([]);
    expect(callNames(harness.storeCalls)).toEqual([
      'claimExecution',
      'requireReconciliation',
    ]);
    expect(result.kind === 'denied' && 'password' in result).toBe(false);
  });

  it('quarantines an expired create attempt with durable Auth-call intent instead of creating or deleting blindly', async () => {
    const harness = createHarness();
    harness.operation.auth_call_kind = 'create_user';
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');
    harness.dependencies.auth.createUser = () => unexpected('createUser');
    harness.dependencies.auth.deleteUser = () => unexpected('deleteUser');

    const result = await execute(harness);

    expectDenied(result, 'TEACHER_RECONCILIATION_REQUIRED');
    expect(callNames(harness.authCalls)).toEqual(['getUserById']);
    expect(callNames(harness.storeCalls)).toEqual([
      'claimExecution',
      'requireReconciliation',
    ]);
  });

  it.each([
    ['create_teacher_account', 'create_user'],
    ['reset_teacher_password', 'reset_password'],
  ] as const)(
    'durably records %s Auth-call intent before the provider mutation',
    async (command, authCallKind) => {
      const harness = createHarness();
      if (command === 'reset_teacher_password') makeReset(harness);
      Object.assign(harness.dependencies.store, {
        beginAuthCall: (input: unknown) => {
          harness.storeCalls.push(['beginAuthCall', input]);
          return ok({ outcome: 'ok' as const });
        },
      });
      const originalCreate = harness.dependencies.auth.createUser;
      const originalUpdate = harness.dependencies.auth.updateUserById;
      harness.dependencies.auth.createUser = (attributes) => {
        expect(callNames(harness.storeCalls)).toContain('beginAuthCall');
        return originalCreate(attributes);
      };
      harness.dependencies.auth.updateUserById = (userId, attributes) => {
        if ('password' in attributes) {
          expect(callNames(harness.storeCalls)).toContain('beginAuthCall');
        }
        return originalUpdate(userId, attributes);
      };

      await execute(harness);

      const beginCall = harness.storeCalls.find(
        (entry) => (entry as unknown[])[0] === 'beginAuthCall',
      ) as unknown[];
      expect(beginCall[1]).toMatchObject({
        operationId: OPERATION_ID,
        expectedOperationType: command,
        executionClaimToken: EXECUTION_CLAIM_TOKEN,
        authCallKind,
      });
    },
  );

  it('rejects a DB projection whose operation ID does not match the request', async () => {
    const harness = createHarness();
    harness.operation.operation_id = crypto.randomUUID();
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');
    harness.dependencies.auth.createUser = () => unexpected('createUser');
    harness.dependencies.auth.getUserById = () => unexpected('getUserById');

    await expect(execute(harness)).rejects.toThrow(
      'teacher account operation identity mismatch',
    );
    expect(callNames(harness.storeCalls)).toEqual(['claimExecution']);
    expect(harness.authCalls).toEqual([]);
  });

  it('returns a one-time password only after create is durably completed', async () => {
    const harness = createHarness();
    const result = await execute(harness);

    expect(result.kind).toBe('response');
    expect(result.kind === 'response' && result.payload.result).toBe('created');
    expect(result.kind === 'response' && result.payload.secret_replayable).toBe(
      true,
    );
    expect(
      result.kind === 'response' &&
        result.payload.password === harness.password,
    ).toBe(true);
    const createArgs = callAt(harness.authCalls, 1)[1] as Record<
      string,
      unknown
    >;
    expect(createArgs.id).toBe(AUTH_USER_ID);
    expect(createArgs.email === harness.internalEmail).toBe(true);
    expect(createArgs.password === harness.password).toBe(true);
    expect(createArgs.email_confirm).toBe(true);
    expect(createArgs.ban_duration).toBe('876000h');
    expect(callAt(harness.authCalls, 2)).toEqual([
      'updateUserById',
      AUTH_USER_ID,
      { ban_duration: 'none' },
    ]);
    expect(callNames(harness.storeCalls)).toEqual([
      'claimExecution',
      'beginAuthCall',
      'markAuthApplied',
      'commitTeacherProfile',
      'beginAuthCall',
      'completeOperation',
    ]);
    expectAbsentFromProtectedSinks(harness);
  });

  it('compensates an exact existing reserved identity on create re-entry without minting a secret', async () => {
    const harness = createHarness();
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');
    harness.dependencies.auth.getUserById = (userId) => {
      harness.authCalls.push(['getUserById', userId]);
      return ok({ user: { id: userId } });
    };
    harness.dependencies.auth.createUser = () => unexpected('createUser');

    const result = await execute(harness);

    expectDenied(result, 'TEACHER_AUTH_UNAVAILABLE');
    expect(callNames(harness.authCalls)).toEqual(['getUserById', 'deleteUser']);
    expect(callAt(harness.authCalls, 1)).toEqual(['deleteUser', AUTH_USER_ID]);
    expectAbsentFromProtectedSinks(harness, result);
  });

  it.each([
    'auth_created_or_password_updated',
    'profile_committed',
    'compensation_pending',
  ])(
    'safely resumes create state %s through exact-ID compensation',
    async (state) => {
      const harness = createHarness();
      harness.operation.state = state;
      harness.dependencies.generatePassword = () =>
        unexpected('generatePassword');
      harness.dependencies.auth.getUserById = () => unexpected('getUserById');
      harness.dependencies.auth.createUser = () => unexpected('createUser');

      const result = await execute(harness);

      expectDenied(result, 'TEACHER_AUTH_UNAVAILABLE');
      expect(callNames(harness.authCalls)).toEqual(['deleteUser']);
      expect(callAt(harness.authCalls, 0)).toEqual([
        'deleteUser',
        AUTH_USER_ID,
      ]);
      expect(callNames(harness.storeCalls)).toEqual([
        'claimExecution',
        'beginCreateCompensation',
        'beginAuthCall',
        'completeCreateCompensation',
      ]);
      expectAbsentFromProtectedSinks(harness, result);
    },
  );

  it('rejects a raced completed operation whose persisted success is not exactly bound', async () => {
    const harness = createHarness();
    harness.operation.state = 'completed';
    harness.operation.teacher_id = AUTH_USER_ID;
    harness.operation.redacted_result = {
      outcome: 'ok',
      operation_id: OPERATION_ID,
      teacher_id: crypto.randomUUID(),
      login_account: harness.loginAccount,
      result: 'created',
      secret_replayable: false,
    };
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');

    await expect(execute(harness)).rejects.toThrow(
      'teacher completed receipt is malformed',
    );
    expect(callNames(harness.storeCalls)).toEqual(['claimExecution']);
    expect(harness.authCalls).toEqual([]);
  });

  it('rejects completion when newly_completed is missing', async () => {
    const harness = createHarness();
    delete (harness.completion as unknown as Record<string, unknown>)
      .newly_completed;

    await expect(execute(harness)).rejects.toThrow(
      'teacher completion response is malformed',
    );
    expectAbsentFromProtectedSinks(harness);
  });

  it.each(['provider error', 'mismatched identity'] as const)(
    'handles an Auth create %s without exposing provider details',
    async (failureKind) => {
      const harness = createHarness();
      const mismatchedCreatedId = crypto.randomUUID();
      const providerMessage = `provider rejected ${harness.password} for ${harness.internalEmail}`;
      harness.dependencies.auth.createUser = (attributes) => {
        harness.authCalls.push(['createUser', attributes]);
        return failureKind === 'provider error'
          ? failed(providerMessage)
          : ok({ user: { id: mismatchedCreatedId } });
      };

      const result = await execute(harness);

      expectDenied(
        result,
        failureKind === 'provider error'
          ? 'TEACHER_RECONCILIATION_REQUIRED'
          : 'TEACHER_AUTH_UNAVAILABLE',
      );
      expect(callNames(harness.authCalls)).toEqual(
        failureKind === 'provider error'
          ? ['getUserById', 'createUser']
          : ['getUserById', 'createUser', 'deleteUser'],
      );
      if (failureKind === 'mismatched identity') {
        expect(callAt(harness.authCalls, 2)).toEqual([
          'deleteUser',
          mismatchedCreatedId,
        ]);
      }
      expect(callNames(harness.storeCalls)).toEqual(
        failureKind === 'provider error'
          ? ['claimExecution', 'beginAuthCall', 'requireReconciliation']
          : [
              'claimExecution',
              'beginAuthCall',
              'beginCreateCompensation',
              'beginAuthCall',
              'completeCreateCompensation',
            ],
      );
      expectAbsentFromProtectedSinks(harness, result, providerMessage);
    },
  );

  it('durably binds and retries the actual mismatched provider-created ID after cleanup failure', async () => {
    const harness = createHarness();
    const actualCreatedId = crypto.randomUUID();
    harness.dependencies.auth.createUser = (attributes) => {
      harness.authCalls.push(['createUser', attributes]);
      return ok({ user: { id: actualCreatedId } });
    };
    harness.dependencies.auth.deleteUser = (userId) => {
      harness.authCalls.push(['deleteUser', userId]);
      return failed('cleanup unavailable');
    };

    const result = await execute(harness);

    expectDenied(result, 'TEACHER_RECONCILIATION_REQUIRED');
    expect(callAt(harness.authCalls, 2)).toEqual([
      'deleteUser',
      actualCreatedId,
    ]);
    const compensationCall = harness.storeCalls.find(
      (entry) => (entry as unknown[])[0] === 'beginCreateCompensation',
    ) as unknown[];
    expect(compensationCall[1]).toMatchObject({
      cleanupAuthUserId: actualCreatedId,
    });

    const reconciliation = createReconciliationHarness(
      'create_teacher_account',
      actualCreatedId,
    );
    await reconcileTeacherAccountOperation(
      { command: 'create_teacher_account', operationId: OPERATION_ID },
      reconciliation.dependencies,
    );
    expect(reconciliation.authCalls).toEqual([
      ['deleteUser', actualCreatedId],
      ['deleteUser', AUTH_USER_ID],
    ]);
  });

  it('fails closed before entropy or Auth when the internal namespace is invalid', async () => {
    const harness = createHarness();
    harness.dependencies.internalEmailNamespace = 'mail.example.com';
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');
    harness.dependencies.auth.createUser = () => unexpected('createUser');
    harness.dependencies.auth.getUserById = () => unexpected('getUserById');

    const result = await execute(harness);

    expectDenied(result, 'TEACHER_AUTH_UNAVAILABLE');
    expect(harness.authCalls).toEqual([]);
    expect(callNames(harness.storeCalls)).toEqual([
      'claimExecution',
      'beginCreateCompensation',
      'completeCreateCompensation',
    ]);
    expectAbsentFromProtectedSinks(harness, result);
  });

  it('removes the reserved Auth identity when profile commit fails', async () => {
    const harness = createHarness();
    const databaseMessage = `profile failure contained ${harness.password}`;
    harness.dependencies.store.commitTeacherProfile = (input) => {
      harness.storeCalls.push(['commitTeacherProfile', input]);
      return failed(databaseMessage);
    };

    const result = await execute(harness);

    expectDenied(result, 'TEACHER_AUTH_UNAVAILABLE');
    expect(callNames(harness.authCalls)).toEqual([
      'getUserById',
      'createUser',
      'deleteUser',
    ]);
    expect(callNames(harness.storeCalls)).toEqual([
      'claimExecution',
      'beginAuthCall',
      'markAuthApplied',
      'commitTeacherProfile',
      'beginCreateCompensation',
      'beginAuthCall',
      'completeCreateCompensation',
    ]);
    expectAbsentFromProtectedSinks(harness, result, databaseMessage);
  });

  it.each(['Auth delete', 'compensation commit'])(
    'requires exact-operation reconciliation when %s fails',
    async (failureStep) => {
      const harness = createHarness();
      const cleanupMessage = `${failureStep} mentioned ${harness.internalEmail}`;
      harness.dependencies.store.commitTeacherProfile = (input) => {
        harness.storeCalls.push(['commitTeacherProfile', input]);
        return failed('profile failed');
      };
      if (failureStep === 'Auth delete') {
        harness.dependencies.auth.deleteUser = (userId) => {
          harness.authCalls.push(['deleteUser', userId]);
          return failed(cleanupMessage);
        };
      } else {
        harness.dependencies.store.completeCreateCompensation = (input) => {
          harness.storeCalls.push(['completeCreateCompensation', input]);
          return failed(cleanupMessage);
        };
      }

      const result = await execute(harness);

      expectDenied(result, 'TEACHER_RECONCILIATION_REQUIRED');
      expect(callNames(harness.storeCalls).at(-1)).toBe(
        'requireReconciliation',
      );
      expectAbsentFromProtectedSinks(harness, result, cleanupMessage);
    },
  );

  it('returns a one-time password only after reset is durably completed', async () => {
    const harness = createHarness();
    makeReset(harness);
    const result = await execute(harness);

    expect(result.kind === 'response' && result.payload.result).toBe(
      'password_reset',
    );
    expect(result.kind === 'response' && result.payload.secret_replayable).toBe(
      true,
    );
    expect(
      result.kind === 'response' &&
        result.payload.password === harness.password,
    ).toBe(true);
    const resetArgs = callAt(harness.authCalls, 0)[2] as Record<
      string,
      unknown
    >;
    expect(resetArgs.password === harness.password).toBe(true);
    expect(callNames(harness.storeCalls)).toEqual([
      'claimExecution',
      'beginAuthCall',
      'markAuthApplied',
      'completeOperation',
    ]);
    expectAbsentFromProtectedSinks(harness);
  });

  it('moves a reset with an already-applied but lost plaintext into redacted reconciliation', async () => {
    const harness = createHarness();
    makeReset(harness);
    harness.operation.state = 'auth_created_or_password_updated';
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');
    harness.dependencies.auth.updateUserById = () =>
      unexpected('updateUserById');

    const result = await execute(harness);

    expectDenied(result, 'TEACHER_RECONCILIATION_REQUIRED');
    expect(harness.authCalls).toEqual([]);
    expect(callNames(harness.storeCalls)).toEqual([
      'claimExecution',
      'requireReconciliation',
    ]);
    expectAbsentFromProtectedSinks(harness, result);
  });

  it.each([
    ['reset_teacher_password', 'password update'],
    ['create_teacher_account', 'create unban'],
  ] as const)(
    'fails closed when %s receives a mismatched Auth ID from %s',
    async (command) => {
      const harness = createHarness();
      if (command === 'reset_teacher_password') makeReset(harness);
      harness.dependencies.auth.updateUserById = (userId, attributes) => {
        harness.authCalls.push(['updateUserById', userId, attributes]);
        return ok({ user: { id: crypto.randomUUID() } });
      };

      const result = await execute(harness);

      expectDenied(result, 'TEACHER_RECONCILIATION_REQUIRED');
      expect(callNames(harness.storeCalls).at(-1)).toBe(
        'requireReconciliation',
      );
      expectAbsentFromProtectedSinks(harness, result);
    },
  );

  it.each(['auth update', 'durable finalize'])(
    'withholds the reset password when %s fails',
    async (failureStep) => {
      const harness = createHarness();
      makeReset(harness);
      const failureMessage = `${failureStep} failed after ${harness.password}`;
      if (failureStep === 'auth update') {
        harness.dependencies.auth.updateUserById = (userId, attributes) => {
          harness.authCalls.push(['updateUserById', userId, attributes]);
          return failed(failureMessage);
        };
      } else {
        harness.dependencies.store.completeOperation = (input) => {
          harness.storeCalls.push(['completeOperation', input]);
          return failed(failureMessage);
        };
      }

      const result = await execute(harness);

      expectDenied(result, 'TEACHER_RECONCILIATION_REQUIRED');
      expect(callNames(harness.storeCalls).at(-1)).toBe(
        'requireReconciliation',
      );
      expect(
        callAt(harness.storeCalls, harness.storeCalls.length - 1)[1],
      ).toEqual({
        operationId: OPERATION_ID,
        expectedOperationType: 'reset_teacher_password',
        safeCode: 'TEACHER_RECONCILIATION_REQUIRED',
        executionClaimToken: EXECUTION_CLAIM_TOKEN,
      });
      expectAbsentFromProtectedSinks(harness, result, failureMessage);
    },
  );

  it('never returns a generated password when completion was a replay', async () => {
    const harness = createHarness();
    harness.completion.newly_completed = false;

    const result = await execute(harness);

    expect(result.kind).toBe('response');
    expect(result.kind === 'response' && result.payload.secret_replayable).toBe(
      false,
    );
    expect(result.kind === 'response' && 'password' in result.payload).toBe(
      false,
    );
    expectAbsentFromProtectedSinks(harness, result);
  });

  it.each([
    ['operation_id', crypto.randomUUID()],
    ['teacher_id', crypto.randomUUID()],
    ['login_account', 'teacher999999'],
    ['result', 'wrong_result'],
    ['newly_completed', 'true'],
  ] as const)(
    'rejects completion with a mismatched or malformed %s before releasing plaintext',
    async (field, value) => {
      const harness = createHarness();
      (harness.completion as unknown as Record<string, unknown>)[field] = value;

      await expect(execute(harness)).rejects.toThrow(
        'teacher completion response is malformed',
      );
      expectAbsentFromProtectedSinks(harness);
    },
  );

  it.each(['unban', 'terminal complete'])(
    'keeps a profile-committed identity in reconciliation when %s fails',
    async (failureStep) => {
      const harness = createHarness();
      const failureMessage = `${failureStep} failed for ${harness.internalEmail}`;
      if (failureStep === 'unban') {
        harness.dependencies.auth.updateUserById = (userId, attributes) => {
          harness.authCalls.push(['updateUserById', userId, attributes]);
          return failed(failureMessage);
        };
      } else {
        harness.dependencies.store.completeOperation = (input) => {
          harness.storeCalls.push(['completeOperation', input]);
          return failed(failureMessage);
        };
      }

      const result = await execute(harness);

      expectDenied(result, 'TEACHER_RECONCILIATION_REQUIRED');
      expect(callNames(harness.storeCalls).at(-1)).toBe(
        'requireReconciliation',
      );
      expect(
        callAt(harness.storeCalls, harness.storeCalls.length - 1)[1],
      ).toEqual({
        operationId: OPERATION_ID,
        expectedOperationType: 'create_teacher_account',
        safeCode: 'TEACHER_RECONCILIATION_REQUIRED',
        executionClaimToken: EXECUTION_CLAIM_TOKEN,
      });
      expectAbsentFromProtectedSinks(harness, result, failureMessage);
    },
  );

  it.each(['create_teacher_account', 'reset_teacher_password'] as const)(
    'fails closed when %s cannot durably record the Auth change',
    async (command) => {
      const harness = createHarness();
      if (command === 'reset_teacher_password') makeReset(harness);
      const databaseMessage = `mark failed after ${harness.password}`;
      harness.dependencies.store.markAuthApplied = (input) => {
        harness.storeCalls.push(['markAuthApplied', input]);
        return command === 'create_teacher_account'
          ? Promise.resolve({
              data: { outcome: 'denied' } as unknown as { outcome: 'ok' },
              error: null,
            })
          : failed(databaseMessage);
      };

      const result = await execute(harness);

      expectDenied(
        result,
        command === 'create_teacher_account'
          ? 'TEACHER_AUTH_UNAVAILABLE'
          : 'TEACHER_RECONCILIATION_REQUIRED',
      );
      expect(callNames(harness.storeCalls)).toEqual(
        command === 'create_teacher_account'
          ? [
              'claimExecution',
              'beginAuthCall',
              'markAuthApplied',
              'beginCreateCompensation',
              'beginAuthCall',
              'completeCreateCompensation',
            ]
          : [
              'claimExecution',
              'beginAuthCall',
              'markAuthApplied',
              'requireReconciliation',
            ],
      );
      expectAbsentFromProtectedSinks(harness, result, databaseMessage);
    },
  );

  it.each([
    ['create_teacher_account', 'created'],
    ['reset_teacher_password', 'password_reset'],
  ] as const)(
    'replays %s terminal metadata without regenerating a secret',
    async (command, terminalResult) => {
      const harness = createHarness();
      const redacted = {
        outcome: 'ok',
        operation_id: OPERATION_ID,
        teacher_id: AUTH_USER_ID,
        login_account: harness.loginAccount,
        result: terminalResult,
        secret_replayable: false,
      };
      harness.operation.operation_type = command;
      harness.operation.state = 'completed';
      harness.operation.teacher_id = AUTH_USER_ID;
      harness.operation.redacted_result = redacted;
      harness.dependencies.generatePassword = () =>
        unexpected('generatePassword');
      harness.dependencies.auth.createUser = () => unexpected('createUser');
      harness.dependencies.auth.updateUserById = () =>
        unexpected('updateUserById');
      harness.dependencies.auth.deleteUser = () => unexpected('deleteUser');

      const result = await execute(harness);

      expect(result).toEqual({
        kind: 'response',
        operationId: OPERATION_ID,
        payload: redacted,
      });
      expect(callNames(harness.storeCalls)).toEqual(['claimExecution']);
      expect(harness.authCalls).toEqual([]);
      expectAbsentFromProtectedSinks(harness, result);
    },
  );

  it('returns a safe denial for an operation already awaiting reconciliation', async () => {
    const harness = createHarness();
    harness.operation.state = 'reconciliation_required';
    harness.operation.redacted_result = {
      outcome: 'denied',
      code: 'TEACHER_RECONCILIATION_REQUIRED',
      message: '教師帳號作業需要受控對帳，請前往系統健康頁。',
      request_id: crypto.randomUUID(),
      retryable: false,
    };
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');
    harness.dependencies.auth.createUser = () => unexpected('createUser');

    const result = await execute(harness);

    expectDenied(result, 'TEACHER_RECONCILIATION_REQUIRED');
    expect(callNames(harness.storeCalls)).toEqual(['claimExecution']);
    expectAbsentFromProtectedSinks(harness, result);
  });

  it('replays the exact durable denial when reconciliation terminalizes during a pending replay', async () => {
    const harness = createHarness();
    const envelope = {
      outcome: 'denied' as const,
      code: 'TEACHER_RECONCILIATION_REQUIRED',
      message: '教師帳號作業需要受控對帳，請前往系統健康頁。',
      request_id: crypto.randomUUID(),
      retryable: false,
    };
    harness.operation.state = 'compensated';
    harness.operation.redacted_result = envelope;
    harness.dependencies.generatePassword = () =>
      unexpected('generatePassword');
    harness.dependencies.auth.getUserById = () => unexpected('getUserById');
    harness.dependencies.auth.createUser = () => unexpected('createUser');

    const result = await execute(harness);

    expect(result).toEqual({
      kind: 'denied',
      operationId: OPERATION_ID,
      code: 'TEACHER_RECONCILIATION_REQUIRED',
      envelope,
    });
    expect(callNames(harness.storeCalls)).toEqual(['claimExecution']);
    expect(harness.authCalls).toEqual([]);
  });

  it('fails closed instead of guessing a code for a malformed terminal denial', async () => {
    const harness = createHarness();
    harness.operation.state = 'compensated';
    harness.operation.redacted_result = {
      outcome: 'denied',
      code: 'TEACHER_RECONCILIATION_REQUIRED',
    };

    await expect(execute(harness)).rejects.toThrow(
      'teacher compensated receipt is malformed',
    );
    expect(callNames(harness.storeCalls)).toEqual(['claimExecution']);
    expect(harness.authCalls).toEqual([]);
  });
});

describe('teacher account reconciliation', () => {
  it('refuses automatic reconciliation for an uncertain non-idempotent Auth call', async () => {
    const harness = createReconciliationHarness('create_teacher_account');
    const originalClaim = harness.dependencies.store.claimReconciliation;
    harness.dependencies.store.claimReconciliation = async (input) => {
      const result = await originalClaim(input);
      if (result.data?.outcome === 'ok') {
        result.data.operation.auth_call_kind = 'create_user';
      }
      return result;
    };
    harness.dependencies.auth.deleteUser = () => unexpected('deleteUser');

    await expect(
      reconcileTeacherAccountOperation(
        { command: 'create_teacher_account', operationId: OPERATION_ID },
        harness.dependencies,
      ),
    ).rejects.toThrow('teacher reconciliation contains uncertain Auth intent');
    expect(harness.authCalls).toEqual([]);
  });

  it.each([
    ['create_teacher_account', true],
    ['reset_teacher_password', false],
  ] as const)(
    'resolves %s by exact ID, kind, and claim token',
    async (command, deletesAuth) => {
      const harness = createReconciliationHarness(command);

      const result = await reconcileTeacherAccountOperation(
        { command, operationId: OPERATION_ID },
        harness.dependencies,
      );

      expect(result).toEqual({ kind: 'resolved', operationId: OPERATION_ID });
      expect(callNames(harness.authCalls)).toEqual(
        deletesAuth ? ['deleteUser'] : [],
      );
      expect(callNames(harness.storeCalls)).toEqual([
        'claimReconciliation',
        'resolveReconciliation',
      ]);
      expect(callAt(harness.storeCalls, 1)[1]).toEqual({
        operationId: OPERATION_ID,
        expectedOperationType: command,
        claimToken: harness.claimToken,
      });
    },
  );

  it('releases an exact create claim when orphan cleanup fails', async () => {
    const harness = createReconciliationHarness('create_teacher_account');
    const providerMessage = `provider cleanup ${crypto.randomUUID()}`;
    harness.dependencies.auth.deleteUser = (userId) => {
      harness.authCalls.push(['deleteUser', userId]);
      return failed(providerMessage);
    };

    const result = await reconcileTeacherAccountOperation(
      { command: 'create_teacher_account', operationId: OPERATION_ID },
      harness.dependencies,
    );

    expect(result).toEqual({
      kind: 'deferred',
      operationId: OPERATION_ID,
      code: 'TEACHER_AUTH_UNAVAILABLE',
    });
    expect(callNames(harness.storeCalls)).toEqual([
      'claimReconciliation',
      'releaseReconciliation',
    ]);
    expect(
      JSON.stringify({ result, ...harness }).includes(providerMessage),
    ).toBe(false);
  });

  it('retries the actual provider-returned create identity after mismatched-ID cleanup fails', async () => {
    const actualCreatedId = crypto.randomUUID();
    const harness = createReconciliationHarness(
      'create_teacher_account',
      actualCreatedId,
    );

    await reconcileTeacherAccountOperation(
      { command: 'create_teacher_account', operationId: OPERATION_ID },
      harness.dependencies,
    );

    expect(callAt(harness.authCalls, 0)).toEqual([
      'deleteUser',
      actualCreatedId,
    ]);
    expect(callAt(harness.storeCalls, 1)[1]).toEqual({
      operationId: OPERATION_ID,
      expectedOperationType: 'create_teacher_account',
      claimToken: harness.claimToken,
    });
  });

  it('cannot resolve mismatched-ID reconciliation while the reserved identity cleanup still fails', async () => {
    const actualCreatedId = crypto.randomUUID();
    const harness = createReconciliationHarness(
      'create_teacher_account',
      actualCreatedId,
    );
    harness.dependencies.auth.deleteUser = (userId) => {
      harness.authCalls.push(['deleteUser', userId]);
      return userId === actualCreatedId ? ok({}) : failed('reserved remains');
    };

    const result = await reconcileTeacherAccountOperation(
      { command: 'create_teacher_account', operationId: OPERATION_ID },
      harness.dependencies,
    );

    expect(result.kind).toBe('deferred');
    expect(harness.authCalls).toEqual([
      ['deleteUser', actualCreatedId],
      ['deleteUser', AUTH_USER_ID],
    ]);
    expect(callNames(harness.storeCalls)).toEqual([
      'claimReconciliation',
      'releaseReconciliation',
    ]);
  });
});
