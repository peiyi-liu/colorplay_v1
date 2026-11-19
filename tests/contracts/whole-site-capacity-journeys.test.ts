import { syntheticLinuxRuntime } from './helpers/whole-site-linux-runtime';
import { linuxScopeHelperNames } from '../../scripts/concurrency/root-helper-contracts';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import { createCapacityJourneys } from '../../scripts/concurrency/capacity-journeys';
import type { CapacityRuntime } from '../../scripts/concurrency/capacity-runtime';
afterEach(() => vi.restoreAllMocks());
const required = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined)
    throw new Error('SYNTHETIC_FIXTURE_MISSING');
  return value;
};

const fixture = async (linux = false) => {
  const f = await capacityFixture(),
    profile = linux
      ? syntheticLinuxRuntime(f.input.databaseIdentitySha256)
      : undefined;
  const receiptBytes = JSON.stringify({
      ...f.receipt,
      ...(profile ? { executionProfileSha256: profile.profileSha } : {}),
    }),
    processCloseBytes = JSON.stringify({
      ...f.processClose,
      functionalResultSha256: sha256(receiptBytes),
      ...(profile ? { executionProfileSha256: profile.profileSha } : {}),
    });
  const scope = parseCapacityScope(
      {
        ...f.input,
        functionalResultSha256: sha256(receiptBytes),
        functionalProcessCloseSha256: sha256(processCloseBytes),
        ...(profile
          ? {
              executionProfileSha256: profile.profileSha,
              helpers: Object.fromEntries(
                linuxScopeHelperNames.map((n) => [n, profile.hashes[n]]),
              ),
            }
          : {}),
      },
      {
        receiptBytes,
        processCloseBytes,
        ...(profile ? { executionProfileAuthority: profile.authority } : {}),
      },
    ),
    manifest = createCapacityManifest(scope),
    leg = required(
      manifest.legs.find((l) => l.legId === 'backend_game-node_protocol-3'),
    );
  const actors = leg.members.map((alias, index) => ({
    alias,
    userId: randomUUID(),
    role: index === 0 ? 'teacher' : 'student',
    account: `synthetic${String(index)}`,
    email: `synthetic${String(index)}@colorplay.test`,
    displayName: `合成${String(index)}`,
    password: 'AaSynthetic',
  }));
  const runtime = {
    scope,
    manifest,
    leg,
    privatePlan: { actors },
    subjects: vi.fn(async () => {
      await Promise.resolve();
      return {
        subjects: actors.map((a) => ({
          alias: a.alias,
          userId: a.userId,
          role: 'admin',
          loginAccount: a.account,
          classroomId: null,
        })),
      };
    }),
    host: vi.fn(),
    vm: vi.fn(),
    backend: vi.fn(),
    journal: {
      directory: 'synthetic',
      write: vi.fn(async () => {
        await Promise.resolve();
        return undefined;
      }),
    },
    rootAccounting: () => [],
  } as unknown as CapacityRuntime;
  return { runtime, signal: new AbortController() };
};
describe('capacity journey stop and owned-subject gate', () => {
  it('stopped or aborted journey cannot admit a new root read, browser or auth task', async () => {
    const f = await fixture();
    f.signal.abort();
    const journey = createCapacityJourneys(
      f.runtime,
      f.signal.signal,
      () => undefined,
    );
    await expect(journey.run()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.runtime.subjects).not.toHaveBeenCalled();
    expect(f.runtime.host).not.toHaveBeenCalled();
    await journey.stop();
    expect(Reflect.get(f.runtime.journal, 'write')).not.toHaveBeenCalledWith(
      'capacity-send-diagnostics',
      expect.anything(),
    );
  });
  it('does not turn a foreign role from ownership readback into a capacity actor', async () => {
    const f = await fixture(),
      journey = createCapacityJourneys(
        f.runtime,
        f.signal.signal,
        () => undefined,
      );
    await expect(journey.run()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.runtime.host).not.toHaveBeenCalled();
    expect(f.runtime.vm).not.toHaveBeenCalled();
    await journey.stop();
  });
});

it('preserves Linux authority and refuses foreign subjects before host/backend, without selecting vm fallback', async () => {
  const f = await fixture(true),
    journey = createCapacityJourneys(
      f.runtime,
      f.signal.signal,
      () => undefined,
    );
  await expect(journey.run()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  expect(f.runtime.host).not.toHaveBeenCalled();
  expect(f.runtime.backend).not.toHaveBeenCalled();
  expect(f.runtime.vm).not.toHaveBeenCalled();
  await journey.stop();
});

import { EventEmitter } from 'node:events';
import { chromium, type Browser, type BrowserServer } from '@playwright/test';
import type { Server } from 'node:http';
import * as nativeBrowser from '../../scripts/concurrency/capacity-browser-runtime';
import * as network from '../../scripts/concurrency/capacity-network';
import * as questionObservation from '../../scripts/concurrency/capacity-live-question-observation';
import {
  createLiveConnectionDiagnostics,
  observeLiveSnapshots,
} from '../e2e/helpers/live-connection-diagnostics';
import type { LiveSessionState } from '../../src/features/live/types';

it.each([
  'normal',
  'close-fails',
  'writer-fails',
  'response-during-close',
  'response-during-drain',
] as const)(
  'actual journeys.stop owns %s observation work until native close and drain, writes only once',
  async (mode) => {
    const f = await fixture();
    f.runtime.leg = required(
      f.runtime.manifest.legs.find(
        (l) => l.legId === 'existing_login_game-native_browser-3',
      ),
    );
    const trace: string[] = [],
      page = new EventEmitter(),
      context = new EventEmitter(),
      cdp = new EventEmitter(),
      server = new EventEmitter();
    const frame = {},
      session = '11000000-0000-4000-8000-000000000001';
    let uiRead: Promise<unknown> | undefined;
    let rejectRead: (reason: unknown) => void = () => undefined,
      closed = false;
    Object.assign(page, {
      url: () => f.runtime.scope.appUrl + '/app/live/' + session,
      mainFrame: () => frame,
      isClosed: () => closed,
      evaluate: () => {
        uiRead = new Promise((_done, failed) => {
          rejectRead = failed;
          trace.push('READ');
        });
        return uiRead;
      },
    });
    Object.assign(cdp, {
      send: () => Promise.resolve({}),
      detach: () => Promise.resolve(),
    });
    Object.assign(context, {
      pages: () => [page],
      newPage: () => Promise.resolve(page),
      newCDPSession: () => Promise.resolve(cdp),
      grantPermissions: () => Promise.resolve(),
      setDefaultTimeout: () => undefined,
      close: () => Promise.resolve(),
    });
    Object.assign(server, {
      listening: false,
      address: () => ({ address: '127.0.0.1', port: 12345 }),
      listen: (_port: number, _host: string, done: () => void) => {
        Reflect.set(server, 'listening', true);
        done();
      },
      close: (done: () => void) => {
        Reflect.set(server, 'listening', false);
        done();
      },
    });
    const proxy = network.createCapacityProxy;
    vi.spyOn(network, 'createCapacityProxy').mockImplementation(
      (scope, signal) =>
        proxy(scope, signal, () => server as unknown as Server),
    );
    vi.spyOn(chromium, 'launchServer').mockResolvedValue({
      process: () => ({ pid: 777 }),
      wsEndpoint: () => 'ws://127.0.0.1:12345/synthetic',
      close: () => Promise.resolve(),
    } as unknown as BrowserServer);
    let allowReadSettlement: () => void = () => undefined;
    let duringClose: () => void = () => undefined;
    const readSettlement = new Promise<void>((resolve) => {
      allowReadSettlement = resolve;
    });
    vi.spyOn(chromium, 'connect').mockResolvedValue({
      newContext: () => Promise.resolve(context),
      close: () => {
        trace.push('BROWSER_CLOSE');
        closed = true;
        duringClose();
        page.emit('close');
        void readSettlement.then(() => {
          trace.push('READ_REJECT');
          rejectRead(Error('PRIVATE_READ'));
        });
        return mode === 'close-fails'
          ? Promise.reject(Error('PRIVATE_CLOSE'))
          : Promise.resolve();
      },
    } as unknown as Browser);
    const browser = nativeBrowser.createNativeCapacityBrowser(
      f.runtime.scope,
      f.signal.signal,
    );
    await browser.start();
    const actor = await browser.createActor(1);
    const owner = questionObservation.createCapacityLiveQuestionObservation(
      f.runtime.scope,
      f.signal.signal,
    );
    owner.register(actor);
    owner.bind(actor.page, 1, session);
    const connection = createLiveConnectionDiagnostics();
    observeLiveSnapshots(actor.page, connection);
    connection.beginGeneration(1);
    const request = () => ({
      method: () => 'POST',
      url: () =>
        f.runtime.scope.supabaseUrl + '/rest/v1/rpc/get_live_session_state',
    });
    const requests = [request(), request()];
    for (const req of requests) page.emit('request', req);
    let body1: (value: unknown) => void = () => undefined,
      body2: (value: unknown) => void = () => undefined;
    const first = new Promise<unknown>((resolve) => {
        body1 = resolve;
      }),
      second = new Promise<unknown>((resolve) => {
        body2 = resolve;
      });
    const respond = (index: number, body: Promise<unknown>) =>
      page.emit('response', {
        request: () => requests[index],
        ok: () => true,
        json: () => body,
      });
    if (mode.startsWith('response-'))
      duringClose = () => {
        respond(0, first);
      };
    owner.watch(actor.page, 1, 5, {
      state: 'question_open',
      stateVersion: 9,
      currentPosition: 5,
      questionCount: 20,
      questionDisplay: 'screen_only',
      isHost: false,
    } as LiveSessionState)({ wait: 'MODE_TEXT', state: 'FAILED' });
    expect(owner.pending()).toBe(1);
    const write = vi.fn((name: string) => {
      if (name === 'capacity-live-diagnostics') {
        trace.push('WRITE');
        expect(owner.pending()).toBe(0);
        expect(owner.snapshot().closed).toBe(true);
        if (mode === 'writer-fails')
          return Promise.reject(Error('PRIVATE_WRITER'));
      }
      return Promise.resolve();
    });
    f.runtime.journal.write = write;
    owner.handoff(() =>
      f.runtime.journal.write('capacity-live-diagnostics', owner.snapshot()),
    );
    vi.spyOn(
      questionObservation,
      'createCapacityLiveQuestionObservation',
    ).mockReturnValue(owner);
    vi.spyOn(nativeBrowser, 'createNativeCapacityBrowser').mockReturnValue(
      browser,
    );
    const journey = createCapacityJourneys(
      f.runtime,
      f.signal.signal,
      () => undefined,
    );
    let stopSettled = false;
    const stop = journey.stop().then(
      () => {
        stopSettled = true;
      },
      (error: unknown) => {
        stopSettled = true;
        throw error;
      },
    );
    void stop.catch(() => undefined);
    await vi.waitFor(() => {
      expect(trace).toContain('BROWSER_CLOSE');
    });
    expect(stopSettled).toBe(false);
    expect(trace).not.toContain('WRITE');
    allowReadSettlement();
    if (mode.startsWith('response-')) {
      await Promise.allSettled([uiRead]);
      await Promise.resolve();
      await vi.waitFor(() => {
        expect(owner.pending()).toBe(1);
      });
      expect(stopSettled).toBe(false);
      expect(trace).not.toContain('WRITE');
      if (mode === 'response-during-drain') {
        respond(1, second);
        expect(owner.pending()).toBe(2);
        body1({});
        await vi.waitFor(() => {
          expect(owner.pending()).toBe(1);
        });
        expect(stopSettled).toBe(false);
        expect(trace).not.toContain('WRITE');
      }
      body1({});
      body2({});
    } else {
      body1({});
      body2({});
    }
    if (mode === 'close-fails')
      await expect(stop).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    else await expect(stop).resolves.toBeUndefined();
    expect(trace.indexOf('READ_REJECT')).toBeLessThan(trace.indexOf('WRITE'));
    expect(
      write.mock.calls.filter(([name]) => name === 'capacity-live-diagnostics'),
    ).toHaveLength(1);
    expect(owner.pending()).toBe(0);
    vi.restoreAllMocks();
  },
);
