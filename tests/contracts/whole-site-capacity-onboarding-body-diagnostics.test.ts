import { describe, expect, it, vi } from 'vitest';
import { createOnboardingLogout } from '../../scripts/concurrency/capacity-onboarding-logout';
const trace = vi.hoisted(() => [] as string[]);
vi.mock('zod', async (load) => {
  const actual = await load<typeof import('zod')>();
  const strictObject: typeof actual.z.strictObject = (shape, params) => {
    const schema = actual.z.strictObject(shape, params);
    const literal = shape.error_code instanceof actual.z.ZodLiteral;
    const envelope = shape.base64Encoded instanceof actual.z.ZodLiteral;
    if (literal || envelope) {
      const original = schema.safeParse.bind(schema);
      schema.safeParse = (...args: Parameters<typeof original>) => {
        trace.push(literal ? 'schema' : 'envelope');
        return original(...args);
      };
    }
    return schema;
  };
  return { ...actual, z: { ...actual.z, strictObject } };
});
import {
  createOnboardingBodyDiagnostics,
  onboardingBodyDiagnosticsSchema,
} from '../../scripts/concurrency/capacity-onboarding-body-diagnostics';
const origin = 'http://127.0.0.1:58321';
const drain = async () => {
  for (let n = 0; n < 10; n++) await Promise.resolve();
};
const run = async (
  body: string,
  response: unknown = { body, base64Encoded: false },
) => {
  const read = vi.fn(() => {
    trace.push('read');
    return Promise.resolve(response);
  });
  const state = createOnboardingLogout(origin, read);
  state.arm('registration_complete', 3);
  const lease = state.begin();
  if (!lease) throw Error('SYNTHETIC_LEASE_REQUIRED');
  state.completed('registration_complete', 3);
  state.request('PRIVATE_ID', origin + '/auth/v1/logout?scope=local', 'POST');
  state.response('PRIVATE_ID', 403);
  state.data({ requestId: 'PRIVATE_ID', dataLength: Buffer.byteLength(body) });
  state.finished('PRIVATE_ID');
  await drain();
  lease.complete();
  state.arm('post_registration_login', 4);
  state.completed('post_registration_login', 4);
  state.loginComplete();
  return { state, read, snapshot: state.snapshot() };
};
describe('actual onboarding helper body diagnostic boundaries', () => {
  it.each([
    ['{"error_code":"session_not_found",}', 'JSON_INVALID'],
    [
      '{"error_code":"session_not_found","message":"PRIVATE_BODY"}',
      'KEY_UNKNOWN',
    ],
  ])(
    'keeps original CODE rejection and distinguishes guard %s',
    async (body, reason) => {
      const h = await run(body);
      expect(h.state.finalize()).toBe(0);
      expect(h.read).toHaveBeenCalledTimes(1);
      expect(h.snapshot).toMatchObject({
        firstFailure: 'CODE',
        code: 'UNKNOWN',
        bodyDiagnostics: { parserReason: reason },
      });
    },
  );
  it.each([
    [
      '{"error_code":"session_not_found","error_code":"session_not_found"}',
      'KEY_DUPLICATE',
      'LEXER',
    ],
    ['{"\\u0065rror_code":"session_not_found"}', 'KEY_NONCANONICAL', 'LEXER'],
    [
      '{"error_code":"session_not_found","PRIVATE_KEY":1}',
      'KEY_UNKNOWN',
      'LEXER',
    ],
    ['[{"error_code":"session_not_found"}]', 'TOP_SHAPE', 'SCHEMA'],
    ['{"error_code":"wrong"}', 'ERROR_CODE', 'SCHEMA'],
    ['{"error_code":403}', 'ERROR_CODE', 'SCHEMA'],
    ['{"code":401,"error_code":"session_not_found"}', 'CODE_FIELD', 'SCHEMA'],
    ['{"error_code":"session_not_found","msg":false}', 'MSG_FIELD', 'SCHEMA'],
    ['{}', 'ERROR_CODE', 'LEXER'],
  ])(
    'preserves rejection, guard stage and privacy %s',
    async (body, reason, stage) => {
      const h = await run(body);
      expect(h.state.finalize()).toBe(0);
      expect(h.snapshot.bodyDiagnostics).toMatchObject({
        parserStage: stage,
        parserReason: reason,
      });
      expect(JSON.stringify(h.snapshot)).not.toMatch(
        /PRIVATE_KEY|session_not_found|wrong/u,
      );
    },
  );
  it('mixed aliases are rejected on the second key without top-level/field-type evidence', async () => {
    const h = await run(
      '{"message":"PRIVATE_BODY","error_code":"session_not_found"}',
    );
    expect(h.snapshot.bodyDiagnostics).toMatchObject({
      topLevelKind: 'UNOBSERVED',
      unrecognizedKeyCount: 0,
      fields: {
        message: { presence: 'TOKEN_SEEN', type: 'UNOBSERVED' },
        error_code: { presence: 'TOKEN_SEEN', type: 'UNOBSERVED' },
        status: { presence: 'UNOBSERVED', type: 'UNOBSERVED' },
      },
    });
    expect(h.state.finalize()).toBe(0);
  });
  it('unrecognized raw names are counted without being serialized', async () => {
    const h = await run('{"PRIVATE_KEY":1,"error_code":"session_not_found"}');
    expect(h.snapshot.bodyDiagnostics.unrecognizedKeyCount).toBe(1);
    expect(JSON.stringify(h.snapshot)).not.toContain('PRIVATE_KEY');
  });
  it('uses one original JSON parse and original real-Zod safeParse calls in the original order', async () => {
    const original = JSON.parse;
    const spy = vi
      .spyOn(JSON, 'parse')
      .mockImplementation((...args: Parameters<typeof JSON.parse>): unknown => {
        trace.push('json');
        const value: unknown = original(...args);
        return value;
      });
    try {
      for (const [body, calls] of [
        [
          '{"error_code":"session_not_found"}',
          ['read', 'envelope', 'json', 'schema'],
        ],
        ['{"message":"PRIVATE"}', ['read', 'envelope']],
        ['{"error_code":"session_not_found",}', ['read', 'envelope', 'json']],
      ] as const) {
        trace.length = 0;
        const h = await run(body);
        expect(trace).toEqual(calls);
        expect(h.read).toHaveBeenCalledTimes(1);
      }
    } finally {
      spy.mockRestore();
    }
  });
  it.each([
    ['{"error_code":"session_not_found"}', 'ABSENT'],
    ['{"code":403,"error_code":"session_not_found","msg":"色彩"}', 'MATCH'],
  ])(
    'retains acceptance and exposes only fixed value matches %s',
    async (body, code) => {
      const h = await run(body);
      expect(h.state.finalize()).toBe(1);
      expect(h.snapshot.bodyDiagnostics).toMatchObject({
        collection: 'OBSERVED',
        parserStage: 'COMPLETE',
        parserReason: 'ACCEPTED',
        topLevelKind: 'OBJECT',
        codeValue: code,
        errorCodeValue: 'MATCH',
      });
      expect(JSON.stringify(h.snapshot)).not.toContain('色彩');
    },
  );
  it.each(['base64', 'mismatch', 'oversize'] as const)(
    'does not invent parser evidence before original BODY guard: %s',
    async (mode) => {
      const body = '{"error_code":"session_not_found"}';
      const response =
        mode === 'base64'
          ? { body, base64Encoded: true }
          : {
              body: mode === 'oversize' ? 'x'.repeat(4097) : body + ' ',
              base64Encoded: false,
            };
      const h = await run(body, response);
      expect(h.state.finalize()).toBe(0);
      expect(h.snapshot).toMatchObject({
        firstFailure: 'BODY',
        bodyDiagnostics: {
          collection: 'UNOBSERVED',
          parserStage: 'UNOBSERVED',
          topLevelKind: 'UNOBSERVED',
          unrecognizedKeyCount: null,
        },
      });
    },
  );
  it('keeps new schema strict and finite', () => {
    const initial = createOnboardingBodyDiagnostics().snapshot();
    expect(
      onboardingBodyDiagnosticsSchema.safeParse({
        ...initial,
        rawBody: 'PRIVATE',
      }).success,
    ).toBe(false);
    expect(
      onboardingBodyDiagnosticsSchema.safeParse({
        ...initial,
        parserReason: 'constructor',
      }).success,
    ).toBe(false);
  });
  it('does not invoke proxy traps or getters while projecting a schema failure', () => {
    let reads = 0;
    const getter = {
      get error_code() {
        reads++;
        return 'PRIVATE';
      },
    };
    const proxy = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          reads++;
          throw Error('PRIVATE');
        },
        get() {
          reads++;
          throw Error('PRIVATE');
        },
      },
    );
    for (const value of [getter, proxy]) {
      const d = createOnboardingBodyDiagnostics();
      d.stage('SCHEMA');
      d.schema(value, { success: false });
      expect(d.snapshot().collection).toBe('UNAVAILABLE');
      expect(reads).toBe(0);
    }
  });
  it('diagnostic snapshot failure cannot replace successful original lifecycle or discount', async () => {
    const spy = vi
      .spyOn(onboardingBodyDiagnosticsSchema, 'parse')
      .mockImplementation(() => {
        throw new Error('PRIVATE');
      });
    try {
      const h = await run('{"error_code":"session_not_found"}');
      expect(h.state.finalize()).toBe(1);
      expect(h.state.discount()).toBe(1);
      expect(h.snapshot.bodyDiagnostics.collection).toBe('UNAVAILABLE');
    } finally {
      spy.mockRestore();
    }
  });
  it.each([
    'error',
    'message',
    'error_description',
    'status',
    'status_code',
    'request_id',
    'error_id',
  ] as const)(
    'observes known alias token without accepting its schema: %s',
    async (key) => {
      const body = JSON.stringify({
        error_code: 'session_not_found',
        [key]: 'PRIVATE_ALIAS',
      });
      const h = await run(body);
      expect(h.state.finalize()).toBe(0);
      expect(h.snapshot.bodyDiagnostics).toMatchObject({
        parserStage: 'LEXER',
        parserReason: 'KEY_UNKNOWN',
        topLevelKind: 'UNOBSERVED',
        unrecognizedKeyCount: 0,
      });
      expect(h.snapshot.bodyDiagnostics.fields[key]).toEqual({
        presence: 'TOKEN_SEEN',
        type: 'UNOBSERVED',
      });
      expect(h.snapshot.bodyDiagnostics.fields.msg.presence).toBe('UNOBSERVED');
      expect(JSON.stringify(h.snapshot)).not.toContain('PRIVATE_ALIAS');
    },
  );
  it('supports an explicit92B synthetic payload without claiming it matches actual VM7 body', async () => {
    const base = { code: 403, error_code: 'session_not_found', msg: '' };
    const body = JSON.stringify({
      ...base,
      msg: 'x'.repeat(92 - Buffer.byteLength(JSON.stringify(base))),
    });
    expect(Buffer.byteLength(body)).toBe(92);
    const h = await run(body);
    expect(h.state.finalize()).toBe(1);
    expect(h.snapshot.bodyDiagnostics.parserReason).toBe('ACCEPTED');
  });
  it('keeps already observed reason through diagnostic projection or snapshot failure', () => {
    const d = createOnboardingBodyDiagnostics();
    d.stage('LEXER');
    d.rejected('KEY_UNKNOWN');
    const spy = vi
      .spyOn(onboardingBodyDiagnosticsSchema, 'parse')
      .mockImplementation(() => {
        throw Error('PRIVATE');
      });
    try {
      expect(d.snapshot()).toMatchObject({
        collection: 'UNAVAILABLE',
        parserReason: 'KEY_UNKNOWN',
      });
    } finally {
      spy.mockRestore();
    }
    d.rejected('PRIVATE' as never);
    expect(d.snapshot()).toMatchObject({
      collection: 'UNAVAILABLE',
      parserReason: 'KEY_UNKNOWN',
    });
    expect(JSON.stringify(d.snapshot())).not.toContain('PRIVATE');
  });
  it('observes a synthetic92-byte valid envelope without attributing it to VM7 body', async () => {
    const base = { error_code: 'session_not_found', msg: '' };
    const overhead = Buffer.byteLength(JSON.stringify(base));
    const body = JSON.stringify({ ...base, msg: 'x'.repeat(92 - overhead) });
    expect(Buffer.byteLength(body)).toBe(92);
    const h = await run(body);
    expect(h.state.finalize()).toBe(1);
    expect(h.snapshot.bodyDiagnostics).toMatchObject({
      parserReason: 'ACCEPTED',
      errorCodeValue: 'MATCH',
    });
  });
});
