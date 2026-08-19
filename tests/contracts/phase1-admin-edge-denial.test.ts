// tests/contracts/phase1-admin-edge-denial.test.ts
// Task 13A-3:recorder 回的是完整 §11 envelope,Edge 必須原樣轉送;
// 任何欄位缺漏、型別不符或碼不相符一律 fail closed。
import { describe, expect, it } from 'vitest';

import { makeRecordAndDeny } from '../../supabase/functions/_shared/edge-denial';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const envelope = (code: string) => ({
  outcome: 'denied',
  code,
  message: '需要重新完成雙因素驗證。',
  request_id: '3f1d0f5a-1c2b-4d3e-8f90-0a1b2c3d4e5f',
  retryable: false,
});

const recorderReturning = (
  data: unknown,
  error: { message: string } | null = null,
) => ({
  rpc: () => Promise.resolve({ data, error }),
});

const failClosed = async (response: Response) => {
  expect(response.status).toBe(503);
  const body = (await response.json()) as Record<string, unknown>;
  expect(body.outcome).toBe('denied');
  expect(body.code).toBe('SECURITY_AUDIT_UNAVAILABLE');
  expect(typeof body.message).toBe('string');
  expect(typeof body.request_id).toBe('string');
  // 這條路徑代表 durable audit 無法確認,唯一可重試的穩定碼
  expect(body.retryable).toBe(true);
  return body;
};

describe('edge denial recorder fail-closed contract', () => {
  it('passes the confirmed envelope through verbatim', async () => {
    const calls: unknown[] = [];
    const recordAndDeny = makeRecordAndDeny(
      {
        rpc: (fn, args) => {
          calls.push([fn, args]);
          return Promise.resolve({
            data: envelope('INSUFFICIENT_MFA'),
            error: null,
          });
        },
      },
      'edge/test',
      jsonResponse,
    );
    const response = await recordAndDeny(
      'challenge',
      'user-1',
      'INSUFFICIENT_MFA',
      401,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(envelope('INSUFFICIENT_MFA'));
    expect(calls).toHaveLength(1);
  });

  it('fails closed with a 503 envelope when the recorder errors', async () => {
    const recordAndDeny = makeRecordAndDeny(
      recorderReturning(null, { message: 'db down' }),
      'edge/test',
      jsonResponse,
    );
    await failClosed(
      await recordAndDeny('challenge', 'user-1', 'INSUFFICIENT_MFA', 401),
    );
  });

  it('fails closed on malformed recorder output', async () => {
    const recordAndDeny = makeRecordAndDeny(
      recorderReturning({ outcome: 'ok' }),
      'edge/test',
      jsonResponse,
    );
    await failClosed(
      await recordAndDeny('challenge', 'user-1', 'INSUFFICIENT_MFA', 401),
    );
  });

  it('fails closed when the recorder omits envelope fields', async () => {
    // 修訂前的壓縮形狀({outcome, code})現在必須被視為畸形:少了
    // request_id/retryable 就無法宣稱是「已入帳的可追蹤 denial」。
    const recordAndDeny = makeRecordAndDeny(
      recorderReturning({ outcome: 'denied', code: 'INSUFFICIENT_MFA' }),
      'edge/test',
      jsonResponse,
    );
    await failClosed(
      await recordAndDeny('challenge', 'user-1', 'INSUFFICIENT_MFA', 401),
    );
  });

  it('fails closed when retryable has the wrong type', async () => {
    const recordAndDeny = makeRecordAndDeny(
      recorderReturning({
        ...envelope('INSUFFICIENT_MFA'),
        retryable: 'false',
      }),
      'edge/test',
      jsonResponse,
    );
    await failClosed(
      await recordAndDeny('challenge', 'user-1', 'INSUFFICIENT_MFA', 401),
    );
  });

  it('fails closed when the recorded code is not the requested one', async () => {
    const recordAndDeny = makeRecordAndDeny(
      recorderReturning(envelope('MFA_LOCKED')),
      'edge/test',
      jsonResponse,
    );
    await failClosed(
      await recordAndDeny('challenge', 'user-1', 'INSUFFICIENT_MFA', 401),
    );
  });

  it('merges optional extra fields into the confirmed denial response', async () => {
    const recordAndDeny = makeRecordAndDeny(
      recorderReturning(envelope('FACTOR_BINDING_MISMATCH')),
      'edge/test',
      jsonResponse,
    );
    const response = await recordAndDeny(
      'challenge',
      'user-1',
      'FACTOR_BINDING_MISMATCH',
      403,
      { operationId: 'op-123' },
    );
    expect(await response.json()).toEqual({
      ...envelope('FACTOR_BINDING_MISMATCH'),
      operationId: 'op-123',
    });
  });

  it('never includes extra fields in the fail-closed 503 response', async () => {
    const recordAndDeny = makeRecordAndDeny(
      recorderReturning(null, { message: 'db down' }),
      'edge/test',
      jsonResponse,
    );
    const body = await failClosed(
      await recordAndDeny(
        'challenge',
        'user-1',
        'FACTOR_BINDING_MISMATCH',
        403,
        { operationId: 'op-123' },
      ),
    );
    expect(body).not.toHaveProperty('operationId');
    expect(Object.keys(body).sort()).toEqual([
      'code',
      'message',
      'outcome',
      'request_id',
      'retryable',
    ]);
  });

  it('gives each fail-closed response its own correlation id', async () => {
    const recordAndDeny = makeRecordAndDeny(
      recorderReturning(null, { message: 'db down' }),
      'edge/test',
      jsonResponse,
    );
    const first = await failClosed(
      await recordAndDeny('challenge', 'user-1', 'INSUFFICIENT_MFA', 401),
    );
    const second = await failClosed(
      await recordAndDeny('challenge', 'user-1', 'INSUFFICIENT_MFA', 401),
    );
    expect(first.request_id).not.toBe(second.request_id);
  });

  it('fails closed on a code the Edge does not recognise (2026-08-19 review)', async () => {
    // 版本漂移防線:DB 若因 bug 或部署順序回了一個 Edge 尚未認得的碼,
    // 不得讓任意 message/retryable 原樣穿透給前端 —— 未知碼一律當畸形
    // envelope 處理,fail closed。
    const recordAndDeny = makeRecordAndDeny(
      recorderReturning({
        outcome: 'denied',
        code: 'NOT_A_REAL_STABLE_CODE',
        message: 'raw internal detail that should never reach the client',
        request_id: '3f1d0f5a-1c2b-4d3e-8f90-0a1b2c3d4e5f',
        retryable: true,
      }),
      'edge/test',
      jsonResponse,
    );
    const body = await failClosed(
      await recordAndDeny('challenge', 'user-1', 'NOT_A_REAL_STABLE_CODE', 403),
    );
    expect(body.message).not.toContain('raw internal detail');
  });
});
