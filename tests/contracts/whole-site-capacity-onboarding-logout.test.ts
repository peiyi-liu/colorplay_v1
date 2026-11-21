import {
  createOnboardingLogout,
  isExactLocalLogout,
} from '../../scripts/concurrency/capacity-onboarding-logout';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { Browser, BrowserServer } from '@playwright/test';
import { it, expect, vi } from 'vitest';
import {
  createNativeCapacityBrowser,
  openCapacityOnboardingLogout,
} from '../../scripts/concurrency/capacity-browser-runtime';
import { createCapacityProxy } from '../../scripts/concurrency/capacity-network';
import { actualUi } from '../../scripts/concurrency/capacity-registration-ui';
import {
  observeRegistrationFinalGate,
  registrationFinalGateSchema,
} from '../../scripts/concurrency/capacity-registration-final-diagnostics';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
const setup = async (boundary: 'OWNED' | 'FOREIGN' = 'OWNED') => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    stop = new AbortController();
  const body = JSON.stringify({
    code: 403,
    error_code: 'session_not_found',
    msg: 'SYNTHETIC_PRIVATE',
  });
  const cdp = Object.assign(new EventEmitter(), {
    send: vi.fn<(method: string) => Promise<unknown>>((method: string) =>
      Promise.resolve(
        method === 'Network.getResponseBody'
          ? { body, base64Encoded: false }
          : undefined,
      ),
    ),
    detach: vi.fn(() => Promise.resolve()),
  });
  let tick = 10,
    url = scope.appUrl + '/register';
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
  const locator = {
    fill: vi.fn(() => Promise.resolve()),
    waitFor: vi.fn(() => Promise.resolve()),
    first() {
      return this;
    },
    click: vi.fn(() => Promise.resolve()),
  };
  const page = Object.assign(new EventEmitter(), {
    close: vi.fn(() => Promise.resolve()),
    isClosed: () => false,
    url: () => url,
    getByLabel: () => locator,
    getByText: () => locator,
    locator: () => locator,
    waitForURL: vi.fn(() => Promise.resolve()),
    getByRole: (_role: string, options: { name: string }) => ({
      ...locator,
      click: () => {
        if (options.name === '完成註冊') {
          request('REGISTER', '/functions/v1/student-register');
          response('REGISTER', 200);
          finish('REGISTER');
          request('LOGOUT', '/auth/v1/logout?scope=local');
          response('LOGOUT', 403);
          cdp.emit('Network.dataReceived', {
            requestId: 'LOGOUT',
            dataLength: Buffer.byteLength(body),
          });
          finish('LOGOUT');
          url =
            (boundary === 'FOREIGN' ? 'http://foreign.invalid' : scope.appUrl) +
            '/login';
        }
        if (options.name === '登入') {
          request('LOGIN', '/functions/v1/auth-login');
          response('LOGIN', 200);
          finish('LOGIN');
          url = scope.appUrl + '/app';
        }
      },
    }),
  });
  const context = Object.assign(new EventEmitter(), {
    pages: () => [page],
    newPage: () => Promise.resolve(page),
    close: () => Promise.resolve(),
    grantPermissions: () => Promise.resolve(),
    setDefaultTimeout: vi.fn(),
    newCDPSession: () => Promise.resolve(cdp),
  });
  const server = Object.assign(new EventEmitter(), {
    listening: false,
    listen: (_p: number, _h: string, done: () => void) => {
      server.listening = true;
      queueMicrotask(done);
      return server;
    },
    address: () => ({ address: '127.0.0.1', port: 61234 }),
    close: (done: () => void) => {
      server.listening = false;
      done();
      return server;
    },
  });
  const runtime = createNativeCapacityBrowser(scope, stop.signal, {
    proxy: (signal) =>
      createCapacityProxy(scope, signal, () => server as unknown as Server),
    launchServer: () =>
      Promise.resolve({
        process: () => ({ pid: 123 }),
        wsEndpoint: () => 'ws://127.0.0.1:61235/SYNTHETIC',
        close: () => Promise.resolve(),
      } as unknown as BrowserServer),
    connect: () =>
      Promise.resolve({
        newContext: () => Promise.resolve(context),
        close: () => Promise.resolve(),
      } as unknown as Browser),
  });
  await runtime.start();
  const actor = await runtime.createActor(0);
  const journal = {
    directory: 'SYNTHETIC',
    write: vi.fn<(name: string, value: unknown) => Promise<void>>(() =>
      Promise.resolve(),
    ),
  };
  const identity = {
    alias: 'REG40_01',
    account: 'synthetic',
    password: 'SYNTHETIC_PRIVATE',
    displayName: 'Synthetic',
    role: 'student' as const,
    userId: null,
  };
  return { runtime, actor, cdp, journal, identity, stop, page };
};
it('actual owned runtime/UI only discounts the proven onboarding logout after successful subsequent login and final gate', async () => {
  const h = await setup();
  try {
    expect(openCapacityOnboardingLogout({ ...h.actor })).toBeUndefined();
    const ticket = h.actor.observer.arm('registration_complete');
    await actualUi.complete(h.actor, h.identity, () => undefined);
    await ticket.finished;
    expect(h.actor.observer.snapshot().unexpectedHttpErrors).toBe(1);
    await actualUi.postLogin(
      h.actor,
      h.identity,
      h.stop.signal,
      () => undefined,
    );
    expect(
      await observeRegistrationFinalGate(h.runtime, [h.actor], h.journal),
    ).toBe(true);
    expect(h.actor.observer.snapshot().unexpectedHttpErrors).toBe(0);
    const gate = registrationFinalGateSchema.parse(
      h.journal.write.mock.calls[0]?.[1],
    );
    expect(gate.gate).toBe('ACCEPTED');
    expect(gate.actors[0]?.diagnostics.onboarding).toMatchObject({
      expectedEvents: 1,
      code: 'SESSION_NOT_FOUND',
      bodyReads: 1,
      firstFailure: null,
    });
    expect(
      h.cdp.send.mock.calls.filter(
        ([method]) => method === 'Network.getResponseBody',
      ),
    ).toHaveLength(1);
    expect(JSON.stringify(gate)).not.toMatch(
      /SYNTHETIC_PRIVATE|"LOGOUT"|"REGISTER"/,
    );
  } finally {
    await h.runtime.close();
  }
});

const origin = 'http://127.0.0.1:58321';
const text = JSON.stringify({
  code: 403,
  error_code: 'session_not_found',
  msg: 'PRIVATE_BODY',
});
const drain = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const pure = (response: unknown = { body: text, base64Encoded: false }) => {
  const read = vi.fn<(id: string) => Promise<unknown>>(() =>
    Promise.resolve(response),
  );
  const state = createOnboardingLogout(origin, read);
  state.arm('registration_complete', 3);
  const lease = state.begin();
  if (!lease) throw Error('SYNTHETIC_LEASE_MISSING');
  const request = () => {
    state.request('PRIVATE_ID', origin + '/auth/v1/logout?scope=local', 'POST');
  };
  const data = () => {
    state.data({
      requestId: 'PRIVATE_ID',
      dataLength: Buffer.byteLength(text),
    });
  };
  const completed = () => {
    lease.complete();
    state.arm('post_registration_login', 4);
    state.completed('post_registration_login', 4);
    state.loginComplete();
  };
  return { state, read, lease, request, data, completed };
};
it.each([
  [origin + '/auth/v1/logout', 'POST'],
  [origin + '/auth/v1/logout?scope=global', 'POST'],
  [origin + '/auth/v1/logout?scope=local&scope=local', 'POST'],
  [origin + '/auth/v1/logout?scope=local&extra=1', 'POST'],
  [origin + '/auth/v1/logout?scope=local#private', 'POST'],
  [origin + '/auth/v1/logout/?scope=local', 'POST'],
  ['http://foreign.invalid/auth/v1/logout?scope=local', 'POST'],
  [origin + '/auth/v1/logout?scope=local', 'GET'],
  [origin + '/auth/v1/logout?scope=local', 'OPTIONS'],
])('does not whitelist non-exact logout %s %s', (url, method) => {
  expect(isExactLocalLogout(url, method, origin)).toBe(false);
  const h = pure();
  h.state.completed('registration_complete', 3);
  h.state.request('PRIVATE_ID', url, method);
  h.state.response('PRIVATE_ID', 403);
  h.data();
  h.state.finished('PRIVATE_ID');
  h.completed();
  expect(h.state.finalize()).toBe(0);
  expect(h.read).not.toHaveBeenCalled();
});
it.each([401, 404, 429, 500, 200])(
  'does not expand the exception to HTTP%s',
  (status) => {
    const h = pure();
    h.state.completed('registration_complete', 3);
    h.request();
    h.state.response('PRIVATE_ID', status);
    h.data();
    h.state.finished('PRIVATE_ID');
    h.completed();
    expect(h.state.finalize()).toBe(0);
    expect(h.read).not.toHaveBeenCalled();
  },
);
it.each([
  ...[
    JSON.stringify({ code: 403, error_code: 'unknown' }),
    JSON.stringify({ code: 403, error_code: 'SESSION_NOT_FOUND' }),
    JSON.stringify({ code: 401, error_code: 'session_not_found' }),
    '{"error_code":"other","error_code":"session_not_found"}',
    '{"error_code":"unexpected","\\u0065rror_code":"session_not_found"}',
    '{"code":401,"\\u0063ode":403,"error_code":"session_not_found"}',
    JSON.stringify({
      error_code: 'session_not_found',
      privateToken: 'PRIVATE',
    }),
    'not json',
    'null',
    '[]',
  ].map((body) => ({ body, base64Encoded: false })),
  { body: text, base64Encoded: true },
])(
  'rejects unknown/malformed response-code proof without storing the body',
  async (result) => {
    const h = pure(result);
    h.state.completed('registration_complete', 3);
    h.request();
    h.state.response('PRIVATE_ID', 403);
    h.state.data({
      requestId: 'PRIVATE_ID',
      dataLength: Buffer.byteLength(result.body),
    });
    h.state.finished('PRIVATE_ID');
    await drain();
    h.completed();
    expect(h.state.finalize()).toBe(0);
    expect(JSON.stringify(h.state.snapshot())).not.toMatch(
      /PRIVATE|not json|unknown|SESSION_NOT_FOUND/,
    );
  },
);
it.each([
  'EARLY',
  'LATE',
  'DUPLICATE',
  'FAILED',
  'NO_UI',
  'NO_LOGIN',
  'WRONG_GENERATION',
  'CANCEL',
] as const)('requires complete exact lifecycle %s', async (kind) => {
  const h = pure();
  if (kind !== 'EARLY') h.state.completed('registration_complete', 3);
  if (kind === 'LATE') h.lease.complete();
  h.request();
  if (kind === 'DUPLICATE') h.request();
  h.state.response('PRIVATE_ID', 403);
  h.data();
  if (kind === 'FAILED') h.state.failed('PRIVATE_ID');
  if (kind === 'CANCEL') h.lease.cancel();
  h.state.finished('PRIVATE_ID');
  await drain();
  if (kind !== 'NO_UI') h.lease.complete();
  h.state.arm('post_registration_login', kind === 'WRONG_GENERATION' ? 5 : 4);
  if (kind !== 'NO_LOGIN') {
    h.state.completed('post_registration_login', 4);
    h.state.loginComplete();
  }
  expect(h.state.finalize()).toBe(0);
});
it.each([undefined, -1, NaN, Infinity, 0.5, 4097])(
  'rejects missing/invalid/oversize decoded length %s before reading',
  (dataLength) => {
    const h = pure();
    h.state.completed('registration_complete', 3);
    h.request();
    h.state.response('PRIVATE_ID', 403);
    h.state.data({ requestId: 'PRIVATE_ID', dataLength });
    h.state.finished('PRIVATE_ID');
    h.completed();
    expect(h.state.finalize()).toBe(0);
    expect(h.read).not.toHaveBeenCalled();
  },
);
it('pending parser, disposal and late completion cannot discount an event or add a teardown wait', async () => {
  let resolve: (value: unknown) => void = () => undefined;
  const h = pure();
  h.read.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  h.state.completed('registration_complete', 3);
  h.request();
  h.state.response('PRIVATE_ID', 403);
  h.data();
  h.state.finished('PRIVATE_ID');
  await drain();
  h.completed();
  expect(h.state.snapshot().pending).toBe(1);
  expect(h.state.finalize()).toBe(0);
  h.state.cancel('DISPOSE');
  resolve({ body: text, base64Encoded: false });
  await drain();
  expect(h.state.finalize()).toBe(0);
  expect(h.state.snapshot()).toMatchObject({
    expectedEvents: 0,
    pending: 0,
    revoked: true,
  });
});
it.each([
  text,
  JSON.stringify({
    code: 403,
    error_code: 'session_not_found',
    msg: 'PRIVATE_BODY "code":401 "error_code":other',
  }),
])(
  'pure state has no authority until all lifecycle proofs and explicit finalization are present',
  async (body) => {
    const h = pure({ body, base64Encoded: false });
    h.state.completed('registration_complete', 3);
    h.request();
    h.state.response('PRIVATE_ID', 403);
    h.state.data({
      requestId: 'PRIVATE_ID',
      dataLength: Buffer.byteLength(body),
    });
    h.state.finished('PRIVATE_ID');
    await drain();
    h.completed();
    expect(h.state.snapshot().expectedEvents).toBe(0);
    expect(h.state.finalize()).toBe(1);
    expect(h.state.finalize()).toBe(0);
    expect(h.state.snapshot()).toMatchObject({
      expectedEvents: 1,
      bodyReads: 1,
      code: 'SESSION_NOT_FOUND',
    });
    expect(JSON.stringify(h.state.snapshot())).not.toMatch(
      /PRIVATE_BODY|PRIVATE_ID/,
    );
    h.state.cancel('DISPOSE');
    expect(h.state.discount()).toBe(1);
    expect(h.state.snapshot()).toMatchObject({
      expectedEvents: 1,
      revoked: true,
    });
  },
);

it.each([
  'REUSED_URL',
  'REDIRECT',
  'DUP_RESPONSE',
  'DUP_FINISHED',
  'LATE_DATA',
  'POST_READ_DATA',
] as const)(
  'rejects ambiguous or late same-request lifecycle %s',
  async (kind) => {
    const h = pure();
    h.state.completed('registration_complete', 3);
    if (kind === 'REDIRECT')
      h.state.request(
        'PRIVATE_ID',
        origin + '/auth/v1/logout?scope=local',
        'POST',
        true,
      );
    else h.request();
    if (kind === 'REUSED_URL')
      h.state.request('PRIVATE_ID', origin + '/other', 'GET');
    h.state.response('PRIVATE_ID', 403);
    if (kind === 'DUP_RESPONSE') h.state.response('PRIVATE_ID', 403);
    h.data();
    h.state.finished('PRIVATE_ID');
    if (kind === 'DUP_FINISHED') h.state.finished('PRIVATE_ID');
    if (kind === 'LATE_DATA') h.data();
    await drain();
    if (kind === 'POST_READ_DATA') h.data();
    h.completed();
    expect(h.state.finalize()).toBe(0);
  },
);
it('a reused ID observed earlier in the owned window cannot become a new logout candidate', () => {
  const h = pure();
  h.state.completed('registration_complete', 3);
  h.state.request('PRIVATE_ID', origin + '/other', 'GET');
  h.request();
  h.state.response('PRIVATE_ID', 403);
  h.data();
  h.state.finished('PRIVATE_ID');
  h.completed();
  expect(h.state.finalize()).toBe(0);
  expect(h.read).not.toHaveBeenCalled();
});
it('revocation restores the single discount and repeated finalization cannot subtract twice', async () => {
  const h = pure();
  h.state.completed('registration_complete', 3);
  h.request();
  h.state.response('PRIVATE_ID', 403);
  h.data();
  h.state.finished('PRIVATE_ID');
  await drain();
  h.completed();
  expect(h.state.finalize()).toBe(1);
  expect(h.state.discount()).toBe(1);
  expect(h.state.finalize()).toBe(0);
  h.data();
  expect(h.state.discount()).toBe(0);
  expect(h.state.snapshot()).toMatchObject({
    expectedEvents: 0,
    classifiedEvents: 1,
    revoked: true,
  });
});
it('actual UI foreign login boundary never earns the exception despite a successful later login', async () => {
  const h = await setup('FOREIGN');
  try {
    const ticket = h.actor.observer.arm('registration_complete');
    await actualUi.complete(h.actor, h.identity, () => undefined);
    await ticket.finished;
    await actualUi.postLogin(
      h.actor,
      h.identity,
      h.stop.signal,
      () => undefined,
    );
    expect(
      await observeRegistrationFinalGate(h.runtime, [h.actor], h.journal),
    ).toBe(false);
    expect(h.actor.observer.snapshot().unexpectedHttpErrors).toBe(1);
  } finally {
    await h.runtime.close();
  }
});
