// tests/contracts/phase1-admin-edge-denial.test.ts
import { describe, expect, it } from 'vitest';

import { makeRecordAndDeny } from '../../supabase/functions/_shared/edge-denial';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

describe('edge denial recorder fail-closed contract', () => {
  it('returns the typed denial only after the recorder confirms it', async () => {
    const calls: unknown[] = [];
    const recordAndDeny = makeRecordAndDeny(
      {
        rpc: async (fn, args) => {
          calls.push([fn, args]);
          return {
            data: { outcome: 'denied', code: 'INSUFFICIENT_MFA' },
            error: null,
          };
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
    expect(await response.json()).toEqual({
      outcome: 'denied',
      code: 'INSUFFICIENT_MFA',
    });
    expect(calls).toHaveLength(1);
  });

  it('fails closed with 503 when the recorder errors', async () => {
    const recordAndDeny = makeRecordAndDeny(
      {
        rpc: async () => ({ data: null, error: { message: 'db down' } }),
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
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'SECURITY_AUDIT_UNAVAILABLE',
    });
  });

  it('fails closed with 503 on malformed recorder output', async () => {
    const recordAndDeny = makeRecordAndDeny(
      {
        rpc: async () => ({ data: { outcome: 'ok' }, error: null }),
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
    expect(response.status).toBe(503);
  });
});
