import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import type { Browser, BrowserServer } from '@playwright/test';
import { expect, it, vi } from 'vitest';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import { createCapacityJourneys } from '../../scripts/concurrency/capacity-journeys';
import { createCapacityProxy } from '../../scripts/concurrency/capacity-network';
import { actualUi } from '../../scripts/concurrency/capacity-registration-ui';
import { observeRegistrationFinalGate } from '../../scripts/concurrency/capacity-registration-final-diagnostics';
import type { CapacityRuntime } from '../../scripts/concurrency/capacity-runtime';
import {
  readCapacityOnboardingConsoleEvidence,
  type NativeCapacityBrowserPorts,
} from '../../scripts/concurrency/capacity-browser-runtime';
import { capacityConsoleDiagnosticsSchema } from '../../scripts/concurrency/capacity-onboarding-console';
const h = vi.hoisted(() => ({
  ports: null as NativeCapacityBrowserPorts | null,
  registration: null as null | ((options: unknown) => Promise<unknown>),
}));
vi.mock('../../scripts/concurrency/capacity-browser-runtime', async (load) => {
  const actual =
    await load<
      typeof import('../../scripts/concurrency/capacity-browser-runtime')
    >();
  return {
    ...actual,
    createNativeCapacityBrowser: (
      ...args: Parameters<typeof actual.createNativeCapacityBrowser>
    ) => {
      if (!h.ports) throw Error('SYNTHETIC_PORTS_REQUIRED');
      return actual.createNativeCapacityBrowser(args[0], args[1], h.ports);
    },
  };
});
vi.mock('../../scripts/concurrency/capacity-collector', () => ({
  createCapacityCollector: () => ({
    start: () => Promise.resolve(),
    stop: () => Promise.resolve({}),
    snapshot: () => ({}),
    pending: () => 0,
  }),
}));
vi.mock('../../scripts/concurrency/capacity-protocol', () => ({
  createCapacityProtocolActor: () => ({
    login: () => Promise.resolve(),
    close: () => Promise.resolve(),
    samples: () => [],
  }),
  capacityTransportAccounting: () => ({}),
}));
vi.mock('../../scripts/concurrency/capacity-operation-observer', () => ({
  createCapacityOperationObserver: () =>
    Promise.resolve({
      run: (_a: unknown, _b: unknown, task: () => Promise<unknown>) => task(),
      samples: () => [],
      dispose: () => Promise.resolve(),
    }),
}));
vi.mock('../../scripts/concurrency/capacity-classrooms', async (load) => ({
  ...(await load<
    typeof import('../../scripts/concurrency/capacity-classrooms')
  >()),
  ensureCapacityClassrooms: () => Promise.resolve([{ cohortSize: 40 }]),
  capacityRegistrationClassroom: () => ({}),
}));
vi.mock('../../scripts/concurrency/capacity-registration', () => ({
  runCapacityRegistration: (options: unknown) => {
    if (!h.registration) throw Error('SYNTHETIC_REGISTRATION_REQUIRED');
    return h.registration(options);
  },
}));
const resource =
  'Failed to load resource: the server responded with a status of 403 (Forbidden)';
it.each([
  ['paired', 0, 1],
  ['log-first', 0, 1],
  ['missing-log', 1, 0],
  ['wrong-id', 1, 0],
  ['duplicate-log', 1, 0],
  ['duplicate-console', 2, 0],
  ['script-console', 1, 0],
  ['wrong-location', 1, 0],
  ['log-enable-failed', 1, 0],
  ['bad-body', 1, 0],
  ['no-root-gate', 1, 0],
  ['late-log', 1, 0],
  ['page-error', 1, 1],
  ['server-error', 1, 1],
  ['other-console', 1, 1],
] as const)(
  'actual journey %s preserves raw counters and exact native pairing',
  async (mode, expected, matched) => {
    const f = await capacityFixture(),
      scope = parseCapacityScope(f.input, f.proof),
      manifest = createCapacityManifest(scope);
    const leg = manifest.legs.find(
      (item) => item.legId === 'fresh_registration-native_browser-40',
    );
    if (!leg) throw Error('SYNTHETIC_LEG_REQUIRED');
    const body =
      mode === 'bad-body'
        ? '{"code":"wrong","message":"SYNTHETIC_PRIVATE"}'
        : '{"code":"session_not_found","message":"SYNTHETIC_PRIVATE"}';
    const cdp = Object.assign(new EventEmitter(), {
      send: vi.fn((method: string) =>
        method === 'Log.enable' && mode === 'log-enable-failed'
          ? Promise.reject(Error('SYNTHETIC'))
          : Promise.resolve(
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
    const log = () =>
      cdp.emit('Log.entryAdded', {
        entry: {
          level: 'error',
          source: 'network',
          text: resource,
          url: scope.supabaseUrl + '/auth/v1/logout?scope=local',
          networkRequestId: mode === 'wrong-id' ? 'FOREIGN' : 'LOGOUT',
        },
      });
    const locator = {
      fill: () => Promise.resolve(),
      waitFor: () => Promise.resolve(),
      first() {
        return this;
      },
      click: () => Promise.resolve(),
    };
    const page = Object.assign(new EventEmitter(), {
      close: () => Promise.resolve(),
      isClosed: () => false,
      url: () => url,
      getByLabel: () => locator,
      getByText: () => locator,
      locator: () => locator,
      waitForURL: () => Promise.resolve(),
      getByRole: (_role: string, options: { name: string }) => ({
        ...locator,
        click: () => {
          if (options.name === '完成註冊') {
            request('REGISTER', '/functions/v1/student-register');
            response('REGISTER', 200);
            finish('REGISTER');
            request('LOGOUT', '/auth/v1/logout?scope=local');
            response('LOGOUT', 403);
            const console = () =>
              page.emit('console', {
                type: () => 'error',
                args: () => (mode === 'script-console' ? [{}] : []),
                text: () => resource,
                location: () => ({
                  url:
                    mode === 'wrong-location'
                      ? scope.appUrl + '/script.js'
                      : scope.supabaseUrl + '/auth/v1/logout?scope=local',
                  lineNumber: 0,
                  columnNumber: 0,
                }),
              });
            if (mode === 'log-first') log();
            console();
            if (mode === 'duplicate-console') console();
            if (!['missing-log', 'late-log', 'log-first'].includes(mode)) log();
            if (mode === 'duplicate-log') log();
            if (mode === 'page-error')
              page.emit('pageerror', Error('SYNTHETIC'));
            if (mode === 'server-error')
              page.emit('response', { status: () => 500 });
            if (mode === 'other-console')
              page.emit('console', {
                type: () => 'error',
                text: () => 'SYNTHETIC_OTHER',
              });
            cdp.emit('Network.dataReceived', {
              requestId: 'LOGOUT',
              dataLength: Buffer.byteLength(body),
            });
            finish('LOGOUT');
            url = scope.appUrl + '/login';
          }
          if (options.name === '登入') {
            request('LOGIN', '/functions/v1/auth-login');
            response('LOGIN', 200);
            finish('LOGIN');
            url = scope.appUrl + '/app';
          }
          return Promise.resolve();
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
    h.ports = {
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
    };
    const identity = {
      alias: 'T1',
      userId: '00000000-0000-4000-8000-000000000001',
      role: 'teacher',
      account: 'synthetic',
      email: 'synthetic@colorplay.test',
      password: 'SYNTHETIC_PRIVATE',
      displayName: 'Synthetic',
    };
    const journal = {
      directory: 'SYNTHETIC',
      write: vi.fn<(name: string, value: unknown) => Promise<void>>(() =>
        Promise.resolve(),
      ),
    };
    h.registration = async (raw) => {
      const options = raw as {
        runtime: {
          start(): Promise<void>;
          createActor(
            index: number,
          ): Promise<
            import('../../scripts/concurrency/capacity-browser-runtime').NativeCapacityActor
          >;
          snapshot(): { available: boolean };
        };
      };
      await options.runtime.start();
      const actor = await options.runtime.createActor(0);
      expect(
        readCapacityOnboardingConsoleEvidence({ ...actor }),
      ).toBeUndefined();
      const ticket = actor.observer.arm('registration_complete');
      await actualUi.complete(
        actor,
        { ...identity, role: 'student' },
        () => undefined,
      );
      await ticket.finished;
      expect(actor.observer.snapshot().unexpectedHttpErrors).toBe(1);
      await actualUi.postLogin(
        actor,
        { ...identity, role: 'student' },
        new AbortController().signal,
        () => undefined,
      );
      if (mode !== 'no-root-gate') {
        expect(
          await observeRegistrationFinalGate(options.runtime, [actor], journal),
        ).toBe(mode !== 'bad-body');
      }
      expect(actor.observer.snapshot().unexpectedHttpErrors).toBe(
        ['bad-body', 'no-root-gate'].includes(mode) ? 1 : 0,
      );
      return {
        report: {
          result: 'PASS',
          entrySkewMs: 1,
          sendBarrier: {
            result: 'VALID',
            actorsExpected: 40,
            requestsObserved: 40,
            skewMs: 1,
          },
        },
      };
    };
    const runtime = {
      scope,
      manifest,
      leg,
      privatePlan: { actors: [identity] },
      subjects: () =>
        Promise.resolve({
          subjects: [
            {
              alias: 'T1',
              userId: identity.userId,
              role: 'teacher',
              loginAccount: identity.account,
              classroomId: null,
            },
          ],
        }),
      journal,
      rootAccounting: () => [],
    } as unknown as CapacityRuntime;
    const journey = createCapacityJourneys(
      runtime,
      new AbortController().signal,
      () => undefined,
    );
    try {
      const result = await journey.run();
      expect(result.unexpectedErrors).toBe(expected);
      if (mode === 'late-log') log();
    } finally {
      await journey.stop();
      const accounting = journal.write.mock.calls.find(
        ([name]) => name === 'transport-accounting',
      )?.[1] as { browserErrors: unknown } | undefined;
      const counters = capacityConsoleDiagnosticsSchema.parse(
        accounting?.browserErrors,
      );
      expect(counters).toMatchObject({
        sealed: true,
        provenMatched: matched,
        rawConsole:
          mode === 'duplicate-console' || mode === 'other-console' ? 2 : 1,
        rawPage: mode === 'page-error' ? 1 : 0,
        rawServer: mode === 'server-error' ? 1 : 0,
      });
      expect(
        cdp.send.mock.calls.filter(
          ([method]) => method === 'Network.getResponseBody',
        ),
      ).toHaveLength(1);
      expect(
        cdp.send.mock.calls.filter(([method]) => method === 'Log.enable'),
      ).toHaveLength(1);
      expect(cdp.detach).toHaveBeenCalledTimes(1);
      expect(page.listenerCount('console')).toBe(0);
      expect(cdp.listenerCount('Log.entryAdded')).toBe(0);
      expect(JSON.stringify(counters)).not.toMatch(
        /SYNTHETIC|LOGOUT|session_not_found|http/u,
      );
      h.ports = null;
      h.registration = null;
    }
  },
);
