import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, it, vi } from 'vitest';
import { createOnboardingLogout } from '../../scripts/concurrency/capacity-onboarding-logout';
import {
  createCapacityRequestObserver,
  getCapacityOnboardingController,
} from '../../scripts/concurrency/capacity-request-observer';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
const trace = vi.hoisted(() => [] as string[]);
vi.mock('zod', async (load) => {
  const actual = await load<typeof import('zod')>();
  const strictObject: typeof actual.z.strictObject = (shape, params) => {
    const schema = actual.z.strictObject(shape, params);
    const body =
      shape.error_code instanceof actual.z.ZodLiteral ||
      shape.message instanceof actual.z.ZodString;
    const envelope = shape.base64Encoded instanceof actual.z.ZodLiteral;
    if (body || envelope) {
      const original = schema.safeParse.bind(schema);
      schema.safeParse = (...args: Parameters<typeof original>) => {
        trace.push(body ? 'schema' : 'envelope');
        return original(...args);
      };
    }
    return schema;
  };
  return { ...actual, z: { ...actual.z, strictObject } };
});
const origin = 'http://127.0.0.1:58321';
const modern = [
  '{"code":"session_not_found","message":"PRIVATE_BODY"}',
  '{"message":"PRIVATE_BODY","code":"session_not_found"}',
] as const;
const drain = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const run = async (
  body: string,
  change?: (state: ReturnType<typeof createOnboardingLogout>) => void,
  response: unknown = { body, base64Encoded: false },
) => {
  const read = vi.fn(() => {
    trace.push('read');
    return Promise.resolve(response);
  });
  const state = createOnboardingLogout(origin, read);
  state.arm('registration_complete', 1);
  const lease = state.begin();
  if (!lease) throw Error('SYNTHETIC_LEASE_REQUIRED');
  state.completed('registration_complete', 1);
  state.request('OWNED', origin + '/auth/v1/logout?scope=local', 'POST');
  state.response('OWNED', 403);
  state.data({ requestId: 'OWNED', dataLength: Buffer.byteLength(body) });
  state.finished('OWNED');
  change?.(state);
  await drain();
  lease.complete();
  state.arm('post_registration_login', 2);
  state.completed('post_registration_login', 2);
  state.loginComplete();
  return { state, read };
};
it.each(modern)(
  'accepts the exact synthetic modern contract in either key order: %s',
  async (body) => {
    const h = await run(body);
    expect(h.state.finalize()).toBe(1);
    expect(h.state.discount()).toBe(1);
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(h.state.snapshot()).toMatchObject({
      bodyReads: 1,
      pending: 0,
      firstFailure: null,
      bodyDiagnostics: {
        parserReason: 'ACCEPTED',
        codeValue: 'OTHER',
        errorCodeValue: 'ABSENT',
        fields: {
          code: { presence: 'PRESENT', type: 'STRING' },
          message: { presence: 'PRESENT', type: 'STRING' },
        },
      },
    });
    expect(JSON.stringify(h.state.snapshot())).not.toMatch(
      /PRIVATE_BODY|session_not_found/u,
    );
  },
);
it.each([
  '{"code":"wrong","message":"PRIVATE"}',
  '{"code":"user_not_found","message":"PRIVATE"}',
  '{"code":"SESSION_NOT_FOUND","message":"PRIVATE"}',
  '{"code":403,"message":"PRIVATE"}',
  '{"code":null,"message":"PRIVATE"}',
  '{"code":"session_not_found"}',
  '{"message":"PRIVATE"}',
  '{"code":"session_not_found","message":null}',
  '{"code":"session_not_found","message":403}',
  JSON.stringify({ code: 'session_not_found', message: 'x'.repeat(2049) }),
  '{"code":"session_not_found","message":"PRIVATE","status":403}',
  '{"code":"session_not_found","message":"PRIVATE","constructor":0}',
  '{"code":"session_not_found","message":"PRIVATE","__proto__":0}',
  '{"error_code":"session_not_found","message":"PRIVATE"}',
  '{"message":"PRIVATE","error_code":"session_not_found"}',
  '{"code":"session_not_found","msg":"PRIVATE","message":"PRIVATE"}',
  '{"message":"PRIVATE","msg":"PRIVATE","code":"session_not_found"}',
  '{"code":"session_not_found","code":"session_not_found","message":"PRIVATE"}',
  '{"message":"PRIVATE","message":"PRIVATE","code":"session_not_found"}',
  '{"code":"wrong","\\u0063ode":"session_not_found","message":"PRIVATE"}',
  '{"code":"session_not_found","\\u006dessage":"PRIVATE"}',
  '{"message":"PRIVATE","\\u0065rror_code":"session_not_found"}',
  '[{"code":"session_not_found","message":"PRIVATE"}]',
  '"PRIVATE"',
  'null',
  'false',
  '403',
  '{"code":"session_not_found","message":"PRIVATE",}',
  '{"code":"session_not_found","message":{"code":"session_not_found"}}',
])(
  'rejects synthetic noncontract bodies without leaking values: %s',
  async (body) => {
    const h = await run(body);
    expect(h.state.finalize()).toBe(0);
    expect(h.state.discount()).toBe(0);
    expect(h.state.snapshot()).toMatchObject({
      firstFailure: 'CODE',
      code: 'UNKNOWN',
    });
    expect(h.read).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.state.snapshot())).not.toMatch(
      /PRIVATE|session_not_found|user_not_found|wrong/u,
    );
  },
);
it.each([
  '{"error_code":"session_not_found"}',
  '{"code":403,"error_code":"session_not_found","msg":"PRIVATE"}',
  '{"msg":"PRIVATE","error_code":"session_not_found","code":403}',
  JSON.stringify({ code: 'session_not_found', message: 'x'.repeat(2048) }),
])(
  'preserves exact legacy cases and the modern message bound: %s',
  async (body) => {
    const h = await run(body);
    expect(h.state.finalize()).toBe(1);
    expect(h.state.finalize()).toBe(0);
    expect(h.state.discount()).toBe(1);
  },
);
it('retains exactly one original parse and selected safeParse, never a union double parse', async () => {
  const original = JSON.parse;
  const spy = vi
    .spyOn(JSON, 'parse')
    .mockImplementation((...args: Parameters<typeof JSON.parse>): unknown => {
      trace.push('json');
      return original(...args);
    });
  try {
    for (const body of [...modern, '{"error_code":"session_not_found"}']) {
      trace.length = 0;
      const h = await run(body);
      expect(trace).toEqual(['read', 'envelope', 'json', 'schema']);
      expect(h.state.finalize()).toBe(1);
    }
    for (const body of [
      '{"message":"PRIVATE"}',
      '{"message":"PRIVATE","error_code":"session_not_found"}',
    ]) {
      trace.length = 0;
      const h = await run(body);
      expect(trace).toEqual(['read', 'envelope']);
      expect(h.state.finalize()).toBe(0);
    }
  } finally {
    spy.mockRestore();
  }
});
it.each(['base64', 'utf8-length', 'cap'] as const)(
  'preserves original BODY rejection: %s',
  async (mode) => {
    const body = modern[0];
    const h = await run(body, undefined, {
      body:
        mode === 'utf8-length'
          ? body.replace('PRIVATE_BODY', '色彩')
          : mode === 'cap'
            ? 'x'.repeat(4097)
            : body,
      base64Encoded: mode === 'base64',
    });
    expect(h.state.finalize()).toBe(0);
    expect(h.state.snapshot().firstFailure).toBe('BODY');
    expect(h.state.snapshot().bodyDiagnostics.collection).toBe('UNOBSERVED');
    expect(h.read).toHaveBeenCalledTimes(1);
  },
);
it.each(['ABORT', 'DISPOSE', 'OWNER', 'POST_LOGIN'] as const)(
  'modern evidence cannot bypass cancellation or ownership: %s',
  async (reason) => {
    const h = await run(modern[0], (state) => {
      state.cancel(reason);
    });
    expect(h.state.finalize()).toBe(0);
    expect(h.state.snapshot().firstFailure).toBe(reason);
    expect(h.state.discount()).toBe(0);
  },
);
it('does not grant pending or late evidence a discount', async () => {
  let release: (value: unknown) => void = () => undefined;
  const state = createOnboardingLogout(
    origin,
    () =>
      new Promise((done) => {
        release = done;
      }),
  );
  state.arm('registration_complete', 1);
  const lease = state.begin();
  state.completed('registration_complete', 1);
  state.request('OWNED', origin + '/auth/v1/logout?scope=local', 'POST');
  state.response('OWNED', 403);
  state.data({ requestId: 'OWNED', dataLength: Buffer.byteLength(modern[0]) });
  state.finished('OWNED');
  await drain();
  lease?.complete();
  state.arm('post_registration_login', 2);
  state.completed('post_registration_login', 2);
  state.loginComplete();
  expect(state.finalize()).toBe(0);
  expect(state.snapshot().firstFailure).toBe('PENDING');
  release({ body: modern[0], base64Encoded: false });
  await drain();
  expect(state.discount()).toBe(0);
  expect(state.snapshot()).toMatchObject({ pending: 0, code: 'UNOBSERVED' });
});
it.each(modern)(
  'actual request observer retains the 403 until complete same-generation lifecycle: %s',
  async (body) => {
    const fixture = await capacityFixture();
    const scope = parseCapacityScope(fixture.input, fixture.proof);
    const stop = new AbortController();
    const cdp = Object.assign(new EventEmitter(), {
      send: vi.fn((method: string) =>
        Promise.resolve(
          method === 'Network.getResponseBody'
            ? { body, base64Encoded: false }
            : undefined,
        ),
      ),
      detach: vi.fn(() => Promise.resolve()),
    });
    const page = Object.assign(new EventEmitter(), { isClosed: () => false });
    const observer = await createCapacityRequestObserver(
      scope,
      {
        newCDPSession: () => Promise.resolve(cdp),
      } as unknown as BrowserContext,
      page as unknown as Page,
      0,
      stop.signal,
    );
    const controller = getCapacityOnboardingController(observer);
    if (!controller) throw Error('SYNTHETIC_CONTROLLER_REQUIRED');
    let tick = 10;
    const request = (id: string, path: string) =>
      cdp.emit('Network.requestWillBeSent', {
        requestId: id,
        timestamp: tick++,
        request: { method: 'POST', url: scope.supabaseUrl + path },
      });
    const response = (id: string, status: number) =>
      cdp.emit('Network.responseReceived', {
        requestId: id,
        response: { status },
      });
    const finish = (id: string) =>
      cdp.emit('Network.loadingFinished', { requestId: id, timestamp: tick++ });
    try {
      const register = observer.arm('registration_complete');
      const lease = controller.begin();
      expect(lease).toBeDefined();
      request('REGISTER', '/functions/v1/student-register');
      response('REGISTER', 200);
      finish('REGISTER');
      await register.finished;
      request('LOGOUT', '/auth/v1/logout?scope=local');
      response('LOGOUT', 403);
      cdp.emit('Network.dataReceived', {
        requestId: 'LOGOUT',
        dataLength: Buffer.byteLength(body),
      });
      finish('LOGOUT');
      await drain();
      lease?.complete();
      expect(observer.snapshot().unexpectedHttpErrors).toBe(1);
      const login = observer.arm('post_registration_login');
      request('LOGIN', '/functions/v1/auth-login');
      response('LOGIN', 200);
      finish('LOGIN');
      await login.finished;
      controller.loginComplete();
      expect(observer.snapshot().unexpectedHttpErrors).toBe(1);
      controller.finalizeCounter();
      expect(observer.snapshot()).toMatchObject({
        available: true,
        pendingAction: false,
        unexpectedHttpErrors: 0,
      });
      expect(
        cdp.send.mock.calls.filter(
          ([method]) => method === 'Network.getResponseBody',
        ),
      ).toHaveLength(1);
      expect(controller.snapshot().bodyDiagnostics).toMatchObject({
        parserReason: 'ACCEPTED',
        codeValue: 'OTHER',
        errorCodeValue: 'ABSENT',
      });
    } finally {
      await observer.dispose();
    }
    expect(cdp.detach).toHaveBeenCalledTimes(1);
  },
);
