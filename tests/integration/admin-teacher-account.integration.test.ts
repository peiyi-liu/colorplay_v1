import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { describe, expect, it } from 'vitest';

import {
  executeTeacherAccountSaga,
  generateTeacherPassword,
  type TeacherAccountOperationDependencies,
} from '../../supabase/functions/_shared/teacher-account-operation';

const url = process.env.SUPABASE_URL ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (
  new URL(url).origin !== 'http://127.0.0.1:54321' ||
  anonKey === '' ||
  serviceKey === ''
) {
  throw new Error('LOCAL_ENV_INVALID');
}

const service = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

async function invokeEdge(fn: string, token: string, body: unknown) {
  const response = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return asRecord(await response.json());
}

async function provisionAdmin(tag: string) {
  const email = `admin.t6.${tag}.${String(Date.now())}@colorplay.test`;
  const password = 'LocalOnly-Task6Admin1!';
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  const userId = created.data.user?.id ?? '';
  expect(userId).not.toBe('');
  await service.rpc('svc_admin_bootstrap_identity', {
    p_user_id: userId,
    p_runbook_operation_id: crypto.randomUUID(),
  });
  const client = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  const accessToken = signIn.data.session?.access_token ?? '';
  expect(accessToken).not.toBe('');
  const enrollment = await invokeEdge('admin-mfa', accessToken, {
    action: 'begin-enrollment',
  });
  const factorId = asString(enrollment.factorId);
  const secret = asString(enrollment.totpSecret);
  const code = () =>
    new OTPAuth.TOTP({ digits: 6, period: 30, secret }).generate();
  await invokeEdge('admin-mfa', accessToken, {
    action: 'confirm-enrollment',
    factorId,
    code: code(),
  });
  await invokeEdge('admin-mfa', accessToken, {
    action: 'challenge',
    factorId,
    code: code(),
  });
  return { accessToken, factorId, userId };
}

async function reserveCreateOperation(
  actor: Awaited<ReturnType<typeof provisionAdmin>>,
  tag: string,
) {
  const args = {
    contact_email: `t6.${tag}@example.test`,
    full_name: `T6-${tag}-AUTH-CREATE`,
    reason: 'Task 6 真實 Auth 建立失敗後必須安全進入對帳',
  };
  const hash = await service.rpc('svc_admin_canonical_hash_hex', {
    p_fields: args,
  });
  expect(hash.error).toBeNull();
  const encodedPayload = actor.accessToken.split('.')[1] ?? '';
  const jwtPayload: unknown = JSON.parse(
    atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')),
  );
  const sessionId = asString(asRecord(jwtPayload).session_id);
  const idempotencyKey = crypto.randomUUID();
  const receipt = await service.rpc('svc_admin_issue_command_receipt', {
    p_actor_user_id: actor.userId,
    p_auth_session_id: sessionId,
    p_command_name: 'create_teacher_account',
    p_idempotency_key: idempotencyKey,
    p_request_hash: `\\x${asString(hash.data)}`,
    p_verified_factor_id: actor.factorId,
    p_requires_fresh_totp: true,
  });
  const receiptId = asString(asRecord(receipt.data).receipt_id);
  expect(receiptId).not.toBe('');
  const user = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${actor.accessToken}` } },
  });
  const reservation = await user.rpc('create_teacher_account', {
    p_receipt_id: receiptId,
    p_idempotency_key: idempotencyKey,
    p_contact_email: args.contact_email,
    p_full_name: args.full_name,
    p_reason: args.reason,
  });
  expect(reservation.error).toBeNull();
  const operationId = asString(asRecord(reservation.data).operation_id);
  expect(operationId).not.toBe('');
  return operationId;
}

function realDependencies(): TeacherAccountOperationDependencies {
  const rpc = (fn: string, args: Record<string, unknown>) =>
    service.rpc(fn, args);
  return {
    internalEmailNamespace: 'admin-b-task6.local.invalid',
    generatePassword: generateTeacherPassword,
    recordSafeEvent: () => undefined,
    store: {
      claimExecution: ({ operationId, expectedOperationType }) =>
        rpc('svc_admin_claim_teacher_account_execution', {
          p_operation_id: operationId,
          p_expected_operation_type: expectedOperationType,
        }),
      beginAuthCall: (input) =>
        rpc('svc_admin_begin_teacher_auth_call', {
          p_operation_id: input.operationId,
          p_expected_operation_type: input.expectedOperationType,
          p_execution_claim_token: input.executionClaimToken,
          p_auth_call_kind: input.authCallKind,
        }),
      markAuthApplied: (input) =>
        rpc('svc_admin_mark_teacher_auth_applied', {
          p_operation_id: input.operationId,
          p_expected_operation_type: input.expectedOperationType,
          p_execution_claim_token: input.executionClaimToken,
          p_auth_user_id: input.authUserId,
        }),
      commitTeacherProfile: (input) =>
        rpc('svc_admin_commit_teacher_profile', {
          p_operation_id: input.operationId,
          p_expected_operation_type: input.expectedOperationType,
          p_execution_claim_token: input.executionClaimToken,
        }),
      completeOperation: (input) =>
        rpc('svc_admin_complete_teacher_account_operation', {
          p_operation_id: input.operationId,
          p_expected_operation_type: input.expectedOperationType,
          p_execution_claim_token: input.executionClaimToken,
        }),
      beginCreateCompensation: (input) =>
        rpc('svc_admin_begin_teacher_create_compensation', {
          p_operation_id: input.operationId,
          p_expected_operation_type: input.expectedOperationType,
          p_safe_code: input.safeCode,
          p_cleanup_auth_user_id: input.cleanupAuthUserId,
          p_execution_claim_token: input.executionClaimToken,
        }),
      completeCreateCompensation: (input) =>
        rpc('svc_admin_complete_teacher_create_compensation', {
          p_operation_id: input.operationId,
          p_expected_operation_type: input.expectedOperationType,
          p_safe_code: input.safeCode,
          p_execution_claim_token: input.executionClaimToken,
        }),
      requireReconciliation: (input) =>
        rpc('svc_admin_require_teacher_reconciliation', {
          p_operation_id: input.operationId,
          p_expected_operation_type: input.expectedOperationType,
          p_safe_code: input.safeCode,
          p_execution_claim_token: input.executionClaimToken,
        }),
    },
    auth: {
      getUserById: async (userId) => {
        const result = await service.auth.admin.getUserById(userId);
        return {
          data: { user: result.data.user ? { id: result.data.user.id } : null },
          error: result.error,
        };
      },
      createUser: async (attributes) => {
        const result = await service.auth.admin.createUser(attributes);
        return {
          data: result.data.user ? { user: { id: result.data.user.id } } : null,
          error: result.error,
        };
      },
      updateUserById: async (userId, attributes) => {
        const result = await service.auth.admin.updateUserById(
          userId,
          attributes,
        );
        return {
          data: result.data.user ? { user: { id: result.data.user.id } } : null,
          error: result.error,
        };
      },
      deleteUser: async (userId) => {
        const result = await service.auth.admin.deleteUser(userId);
        return result.error?.status === 404
          ? { data: {}, error: null }
          : result;
      },
    },
  };
}

describe('admin teacher account integration', () => {
  it('durably requires reconciliation when Auth create fails after intent is recorded', async () => {
    const tag = `t6i-${crypto.randomUUID().slice(0, 8)}`;
    const actor = await provisionAdmin(tag);
    const operationId = await reserveCreateOperation(actor, tag);
    const dependencies = realDependencies();
    dependencies.auth.createUser = () =>
      Promise.resolve({
        data: null,
        error: new Error('INJECTED_AUTH_CREATE_FAILURE'),
      });

    const result = await executeTeacherAccountSaga(
      { command: 'create_teacher_account', operationId },
      dependencies,
    );

    expect(result).toMatchObject({
      kind: 'denied',
      code: 'TEACHER_RECONCILIATION_REQUIRED',
      operationId,
    });
    const status = await service.rpc(
      'svc_admin_list_teacher_reconciliation_candidates',
      {
        p_limit: 20,
      },
    );
    expect(status.error).toBeNull();
    expect(asRecord(status.data).operations).toContainEqual({
      operation_id: operationId,
      operation_type: 'create_teacher_account',
    });
  }, 60_000);

  it('creates ten unique accounts concurrently, updates one, resets its password, and removes exact Auth fixtures', async () => {
    const tag = `t6i-${crypto.randomUUID().slice(0, 8)}`;
    const actor = await provisionAdmin(tag);
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, index) => {
        const suffix = String(index + 1).padStart(2, '0');
        return invokeEdge('admin-command', actor.accessToken, {
          command: 'create_teacher_account',
          idempotencyKey: crypto.randomUUID(),
          args: {
            contact_email: `t6.${tag}.c${suffix}@example.test`,
            full_name: `T6-${tag}-C${suffix}`,
            reason: `Task 6 並發建立教師帳號案例 C${suffix}`,
          },
        });
      }),
    );
    expect(created.every((entry) => entry.outcome === 'ok')).toBe(true);
    expect(new Set(created.map((entry) => entry.login_account)).size).toBe(10);
    expect(new Set(created.map((entry) => entry.teacher_id)).size).toBe(10);

    const target = created[0];
    if (!target) throw new Error('TASK6_CONCURRENT_CREATE_EMPTY');
    const teacherId = asString(target.teacher_id);
    const loginAccount = asString(target.login_account);
    const oldPassword = asString(target.password);
    expect(oldPassword).toHaveLength(12);
    const authIdentity = await service.auth.admin.getUserById(teacherId);
    const internalEmail = authIdentity.data.user?.email ?? '';
    expect(authIdentity.error).toBeNull();
    expect(internalEmail).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@(?:[a-z0-9-]+\.)+invalid$/u,
    );
    expect(internalEmail).not.toContain(loginAccount);
    expect(internalEmail).not.toContain(`updated.${tag}@example.test`);
    const initialLogin = await createClient(url, anonKey, {
      auth: { persistSession: false },
    }).auth.signInWithPassword({ email: internalEmail, password: oldPassword });
    expect(initialLogin.error).toBeNull();

    const updated = await invokeEdge('admin-command', actor.accessToken, {
      command: 'update_teacher_account',
      idempotencyKey: crypto.randomUUID(),
      args: {
        contact_email: `updated.${tag}@example.test`,
        full_name: `T6-${tag}-UPDATED`,
        reason: 'Task 6 驗證教師姓名與聯絡 Email 更新',
        teacher_id: teacherId,
      },
    });
    expect(updated).toMatchObject({ outcome: 'ok', result: 'updated' });
    const profile = await service
      .from('profiles')
      .select('full_name, contact_email')
      .eq('id', teacherId)
      .single();
    expect(profile.data).toEqual({
      contact_email: `updated.${tag}@example.test`,
      full_name: `T6-${tag}-UPDATED`,
    });

    const reset = await invokeEdge('admin-command', actor.accessToken, {
      command: 'reset_teacher_password',
      idempotencyKey: crypto.randomUUID(),
      args: {
        reason: 'Task 6 驗證重設後舊密碼立即失效',
        teacher_id: teacherId,
      },
    });
    expect(reset).toMatchObject({
      outcome: 'ok',
      result: 'password_reset',
      teacher_id: teacherId,
    });
    const newPassword = asString(reset.password);
    expect(newPassword).toHaveLength(12);
    expect(newPassword).not.toBe(oldPassword);
    const oldLogin = await createClient(url, anonKey, {
      auth: { persistSession: false },
    }).auth.signInWithPassword({ email: internalEmail, password: oldPassword });
    expect(oldLogin.error).not.toBeNull();
    const newLogin = await createClient(url, anonKey, {
      auth: { persistSession: false },
    }).auth.signInWithPassword({ email: internalEmail, password: newPassword });
    expect(newLogin.error).toBeNull();

    for (const entry of created) {
      const fixtureId = asString(entry.teacher_id);
      const removal = await service.auth.admin.deleteUser(fixtureId);
      expect(removal.error).toBeNull();
    }
    const residual = await service
      .from('profiles')
      .select('id')
      .in(
        'id',
        created.map((entry) => asString(entry.teacher_id)),
      );
    expect(residual.data).toEqual([]);
  }, 120_000);
});
