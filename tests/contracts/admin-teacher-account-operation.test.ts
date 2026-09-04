import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildTeacherInternalEmail,
  generateTeacherPassword,
  redactTeacherAccountResult,
  resolveTeacherAccountReplay,
} from '../../supabase/functions/_shared/teacher-account-operation';

const migrationSource = readFileSync(
  'supabase/migrations/20260902000200_admin_teacher_accounts.sql',
  'utf8',
);
const edgeSource = readFileSync(
  'supabase/functions/admin-command/index.ts',
  'utf8',
);

describe('teacher account operation exported seam', () => {
  it('uses rejection sampling and emits 12 characters in all four classes', () => {
    let fills = 0;
    const password = generateTeacherPassword((target) => {
      fills += 1;
      target[0] = fills === 1 ? 255 : (fills * 17) % 200;
    });

    expect(password.length).toBe(12);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!#$%&*+\-=?@_]/.test(password)).toBe(true);
    expect(/^[A-Za-z0-9!#$%&*+\-=?@_]+$/.test(password)).toBe(true);
    expect(fills > 23).toBe(true);
  });

  it('derives Auth email only from an opaque reserved UUID and .invalid namespace', () => {
    const authUserId = '22000000-0000-0000-0000-000000000002';
    expect(
      buildTeacherInternalEmail(authUserId, 'teachers.local.invalid'),
    ).toBe(`${authUserId}@teachers.local.invalid`);
    expect(
      buildTeacherInternalEmail(
        authUserId.toUpperCase(),
        'teachers.local.invalid',
      ),
    ).toBe(`${authUserId}@teachers.local.invalid`);
    for (const [candidateId, namespace] of [
      ['teacher42', 'teachers.local.invalid'],
      ['00000000-0000-0000-0000-000000000000', 'teachers.local.invalid'],
      [authUserId, 'teachers.INVALID'],
      [authUserId, 'teachers.example.com'],
      [authUserId, 'invalid'],
    ] as const) {
      expect(() => buildTeacherInternalEmail(candidateId, namespace)).toThrow(
        'invalid teacher internal identity',
      );
    }
  });

  it('redacts replay payloads through a strict field allowlist', () => {
    const secret = `A1!a${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const result = redactTeacherAccountResult({
      outcome: 'ok',
      operation_id: crypto.randomUUID(),
      result: 'created',
      secret_replayable: true,
      password: secret,
      internal_email: `teacher42@${crypto.randomUUID()}.invalid`,
    });

    expect(result.secret_replayable).toBe(false);
    expect('password' in result).toBe(false);
    expect('internal_email' in result).toBe(false);
    expect(JSON.stringify(result).includes(secret)).toBe(false);
  });

  it.each(['create_teacher_account', 'reset_teacher_password'] as const)(
    'resumes an exact pending %s replay by operation ID',
    (command) => {
      expect(
        resolveTeacherAccountReplay(command, {
          outcome: 'ok',
          operation_id: '22000000-0000-4000-8000-000000000001',
          result: 'operation_pending',
          password: 'must-not-survive',
        }),
      ).toEqual({
        kind: 'resume',
        command,
        operationId: '22000000-0000-4000-8000-000000000001',
      });
    },
  );

  it('replays terminal teacher success metadata without a secret', () => {
    expect(
      resolveTeacherAccountReplay('create_teacher_account', {
        outcome: 'ok',
        operation_id: '22000000-0000-4000-8000-000000000001',
        teacher_id: '22000000-0000-4000-8000-000000000002',
        login_account: 'teacher42',
        result: 'created',
        secret_replayable: false,
        password: 'must-not-survive',
      }),
    ).toEqual({
      kind: 'response',
      payload: {
        outcome: 'ok',
        operation_id: '22000000-0000-4000-8000-000000000001',
        teacher_id: '22000000-0000-4000-8000-000000000002',
        login_account: 'teacher42',
        result: 'created',
        secret_replayable: false,
      },
    });
    expect(
      resolveTeacherAccountReplay('create_teacher_account', {
        outcome: 'ok',
        operation_id: '22000000-0000-4000-8000-000000000001',
        teacher_id: '22000000-0000-4000-8000-000000000002',
        login_account: 'teacher42',
        result: 'created',
        secret_replayable: true,
      }),
    ).toBeNull();
  });

  it('keeps update replay DB-only and rejects a non-terminal update receipt', () => {
    const terminal = {
      outcome: 'ok',
      operation_id: '22000000-0000-4000-8000-000000000001',
      teacher_id: '22000000-0000-4000-8000-000000000002',
      login_account: 'teacher42',
      result: 'updated',
      secret_replayable: false,
    };
    expect(
      resolveTeacherAccountReplay('update_teacher_account', terminal),
    ).toEqual({
      kind: 'response',
      payload: terminal,
    });
    expect(
      resolveTeacherAccountReplay('update_teacher_account', {
        ...terminal,
        result: 'operation_pending',
      }),
    ).toBeNull();
  });

  it('preserves only a fully validated teacher denial replay', () => {
    const safe = {
      outcome: 'denied' as const,
      code: 'TEACHER_AUTH_UNAVAILABLE',
      message: '帳號驗證服務暫時無法使用，請先查詢作業狀態再重試。',
      operation_id: '22000000-0000-4000-8000-000000000001',
      request_id: '22000000-0000-4000-8000-000000000003',
      retryable: true,
      password: 'must-not-survive',
    };
    expect(resolveTeacherAccountReplay('create_teacher_account', safe)).toEqual(
      {
        kind: 'denial',
        envelope: {
          outcome: 'denied',
          code: 'TEACHER_AUTH_UNAVAILABLE',
          message: '帳號驗證服務暫時無法使用，請先查詢作業狀態再重試。',
          request_id: '22000000-0000-4000-8000-000000000003',
          retryable: true,
        },
        operationId: '22000000-0000-4000-8000-000000000001',
      },
    );
    expect(
      resolveTeacherAccountReplay('create_teacher_account', {
        ...safe,
        code: 'TEACHER_NOT_IN_THE_ALLOWLIST',
      }),
    ).toBeNull();
    expect(
      resolveTeacherAccountReplay('create_teacher_account', {
        ...safe,
        retryable: 'yes',
      }),
    ).toBeNull();
  });
});

describe('teacher account execution fencing contract', () => {
  it('persists a bounded execution lease and durable Auth-call intent privately', () => {
    for (const column of [
      'execution_claim_token uuid',
      'execution_claimed_at timestamptz',
      'execution_claim_expires_at timestamptz',
      'auth_call_kind text',
      'auth_call_started_at timestamptz',
    ]) {
      expect(migrationSource).toContain(column);
    }
    expect(migrationSource).toContain(
      'create function public.svc_admin_claim_teacher_account_execution(',
    );
    expect(migrationSource).toContain(
      'create function public.svc_admin_begin_teacher_auth_call(',
    );
  });

  it.each([
    'svc_admin_mark_teacher_auth_applied',
    'svc_admin_commit_teacher_profile',
    'svc_admin_complete_teacher_account_operation',
    'svc_admin_begin_teacher_create_compensation',
    'svc_admin_complete_teacher_create_compensation',
    'svc_admin_require_teacher_reconciliation',
  ])('%s requires a DB-validated execution fencing token', (functionName) => {
    const functionStart = migrationSource.indexOf(
      `create function public.${functionName}(`,
    );
    expect(functionStart).toBeGreaterThan(-1);
    const signatureEnd = migrationSource.indexOf(
      ') returns jsonb',
      functionStart,
    );
    expect(migrationSource.slice(functionStart, signatureEnd)).toContain(
      'p_execution_claim_token uuid',
    );
  });

  it('wires claim, durable Auth-call intent, and fencing tokens through the service client only', () => {
    expect(edgeSource).toContain(
      "service.rpc('svc_admin_claim_teacher_account_execution'",
    );
    expect(edgeSource).toContain(
      "service.rpc('svc_admin_begin_teacher_auth_call'",
    );
    expect(edgeSource).toContain(
      'p_execution_claim_token: executionClaimToken',
    );
    expect(edgeSource).toMatch(/operationId:\s*saga\.operationId/);
    expect(edgeSource).not.toMatch(
      /console\.(?:info|warn|error)[^\n]*claimToken/,
    );
  });

  it('renews the bounded lease only from token-validated execution steps', () => {
    const renewals = migrationSource.match(
      /execution_claim_expires_at = now\(\) \+ interval '60 seconds'/g,
    );
    expect(renewals?.length ?? 0).toBeGreaterThanOrEqual(5);
  });
});
