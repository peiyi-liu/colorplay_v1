import { sha256 } from '../../scripts/concurrency/local-runtime';
import { finalizeCapacityReceipt } from '../../scripts/concurrency/capacity-receipt';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NativeCapacityActor } from '../../scripts/concurrency/capacity-browser-runtime';
import type { CapacityRuntime } from '../../scripts/concurrency/capacity-runtime';
import {
  runOneCapacityLeg,
  type CapacityRunnerPorts,
} from '../../scripts/concurrency/capacity-runner';
import { createCapacityCollector } from '../../scripts/concurrency/capacity-collector';
import {
  runCapacityEntryBarrier,
  capacityEntryUi,
} from '../../scripts/concurrency/capacity-browser-entry';
import { createCapacityRunDiagnostics } from '../../scripts/concurrency/capacity-run-diagnostics';
import { createCapacityHealth } from '../../scripts/concurrency/capacity-health';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { createCapacityManifest } from '../../scripts/concurrency/capacity-manifest';
import {
  capacityFixture,
  completeCapacityReceipt,
  hostSample,
  vmSample,
} from './helpers/whole-site-capacity';
const required = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw Error('FIXTURE_REQUIRED');
  return v;
};
const fixture = async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    manifest = createCapacityManifest(scope),
    leg = required(manifest.legs[0]),
    good = completeCapacityReceipt(scope, manifest, leg.legId);
  const writes = new Map<string, unknown>();
  const writer = vi.fn(async (name: string, value: unknown) => {
    await Promise.resolve();
    writes.set(name, structuredClone(value));
  });
  const runtime = {
    scope,
    manifest,
    leg,
    bundle: good.bundle,
    predecessorSha256: null,
    request: {
      runId: good.runId,
      retention: {
        sequence: 0,
        previousProofSha256: null,
        completedRegistrationCohorts: [],
      },
    },
    journal: {
      directory: 'synthetic',
      write: writer,
    },
    preflight: () => Promise.resolve({}),
    retention: () =>
      Promise.resolve({
        databaseIdentitySha256: scope.databaseIdentitySha256,
        readOnlyProofSha256: '1'.repeat(64),
      }),
  } as unknown as CapacityRuntime;
  const work = {
    run: () =>
      Promise.resolve({
        completed: [0, 1, 2],
        barriers: [
          {
            result: 'VALID' as const,
            actorsExpected: 3,
            requestsObserved: 3,
            skewMs: 1,
          },
        ],
        outsider: null,
        samples: [],
        unexpectedErrors: 0,
      }),
    stop: () => Promise.resolve(required(good.health)),
    health: () => required(good.health),
  };
  return { runtime, work, writes, good, writer };
};
const unhealthy = () => {
  const h = createCapacityHealth('NATIVE_BROWSER');
  h.host({ startedAtNodeMs: 0, completedAtNodeMs: 0, sample: hostSample() });
  h.vm({ startedAtNodeMs: 0, completedAtNodeMs: 0, sample: vmSample() });
  h.eventLoop({ atNodeMs: 0, p95Ms: 1 });
  return h.snapshot(4000);
};
type Diagnostic = ReturnType<
  ReturnType<typeof createCapacityRunDiagnostics>['snapshot']
>;
afterEach(() => vi.useRealTimers());
describe('actual runner/collector entry seams, synthetic ports only', () => {
  it.each(['collector-first', 'ready-first'] as const)(
    'captures %s without inferring cause from final stale health',
    async (order) => {
      const f = await fixture();
      let clock = 1;
      const create: NonNullable<CapacityRunnerPorts['createJourneys']> = (
        _r,
        signal,
        onInvalid,
        diagnostics,
      ) => ({
        ...f.work,
        health: () => unhealthy(),
        run: async () => {
          await Promise.resolve();
          diagnostics?.readyStep(0, 'EMAIL');
          clock = 10;
          if (order === 'collector-first') {
            diagnostics?.collectorInvalid(unhealthy());
            onInvalid();
            clock = 11;
          }
          const original = Object.assign(Error('PRIVATE'), {
            name: 'TargetClosedError',
          });
          diagnostics?.readyFailure(0, original, signal);
          throw original;
        },
        stop: () => {
          clock = 20;
          return f.work.stop();
        },
      });
      const r = await runOneCapacityLeg(
        f.runtime,
        new AbortController().signal,
        { now: () => clock, createJourneys: create },
      );
      expect(r.result).toBe('INCONCLUSIVE');
      expect(r.runAborted).toBe(true);
      expect(r.timedOut).toBe(false);
      const d = required(
        f.writes.get('capacity-run-diagnostics'),
      ) as Diagnostic;
      expect(d.collection).toBe('OBSERVED');
      expect(d.firstSignal?.source).toBe(
        order === 'collector-first' ? 'COLLECTOR_INVALID' : 'FINALLY',
      );
      expect(d.firstReadyFailure?.signalAborted).toBe(
        order === 'collector-first',
      );
      expect(d.firstCollectorInvalid === null).toBe(order === 'ready-first');
      expect(d.firstSignal?.atNodeMs).toBe(
        order === 'collector-first' ? 10 : 20,
      );
      expect(JSON.stringify(d)).not.toContain('PRIVATE');
    },
  );
  it.each([false, true])(
    'distinguishes parent abort/already aborted=%s and ignores raw reason',
    async (already) => {
      const f = await fixture(),
        parent = new AbortController();
      let clock = 1;
      if (already) parent.abort('PRIVATE_REASON');
      const create: NonNullable<
        CapacityRunnerPorts['createJourneys']
      > = () => ({
        ...f.work,
        run: async () => {
          await Promise.resolve();
          clock = 9;
          parent.abort('PRIVATE_REASON');
          throw Error('PRIVATE');
        },
      });
      await runOneCapacityLeg(f.runtime, parent.signal, {
        now: () => clock,
        createJourneys: create,
      });
      const d = required(
        f.writes.get('capacity-run-diagnostics'),
      ) as Diagnostic;
      expect(d.firstSignal).toEqual({
        observation: already ? 'ALREADY_ABORTED' : 'OBSERVED',
        atNodeMs: already ? null : 9,
        source: 'PARENT_SIGNAL',
      });
      expect(JSON.stringify(d)).not.toContain('PRIVATE');
    },
  );
  it('records the original business deadline with no extra timer/grace', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = await fixture();
    const create: NonNullable<CapacityRunnerPorts['createJourneys']> = (
      _r,
      signal,
    ) => ({
      ...f.work,
      run: () =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(Error('PRIVATE'));
            },
            { once: true },
          );
        }),
    });
    const run = runOneCapacityLeg(f.runtime, new AbortController().signal, {
      now: () => Date.now(),
      createJourneys: create,
    });
    await vi.advanceTimersByTimeAsync(1470000);
    const r = await run;
    const d = required(f.writes.get('capacity-run-diagnostics')) as Diagnostic;
    expect(r.timedOut).toBe(true);
    expect(d.firstSignal).toMatchObject({
      source: 'BUSINESS_DEADLINE',
      atNodeMs: 1470000,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('unknown cleanup is not claimed fulfilled and fixed diagnostic is written only once', async () => {
    const f = await fixture();
    const r = await runOneCapacityLeg(f.runtime, new AbortController().signal, {
      createJourneys: () => ({
        ...f.work,
        stop: () => Promise.reject(Error('PRIVATE')),
      }),
    });
    const d = required(f.writes.get('capacity-run-diagnostics')) as Diagnostic;
    expect(d.stopCompleted?.result).toBe('UNKNOWN');
    expect(r.controls.cleanup).toBe(false);
    expect(r.result).toBe('INCONCLUSIVE');
  });
  it('diagnostic writer failure blocks original PASS candidate and never retries', async () => {
    const f = await fixture(),
      write = required(f.writer.getMockImplementation());
    let attempts = 0;
    vi.spyOn(f.runtime.journal, 'write').mockImplementation((name, value) => {
      if (name === 'capacity-run-diagnostics') {
        attempts++;
        return Promise.reject(Error('PRIVATE'));
      }
      return write(name, value);
    });
    const r = await runOneCapacityLeg(f.runtime, new AbortController().signal, {
      createJourneys: () => f.work,
    });
    expect(r.result).not.toBe('PASS');
    expect(r.controls.journey).toBe(true);
    expect(r.controls.retention).toBe(true);
    expect(attempts).toBe(1);
    expect(f.writes.has('capacity-result-candidate')).toBe(false);
  });
  it('collector records same computed invalid snapshot before callback without a new sampling timer', async () => {
    vi.useFakeTimers();
    let now = 0;
    const d = createCapacityRunDiagnostics(3, () => now),
      abort = new AbortController();
    let seen = false;
    const c = createCapacityCollector('NATIVE_BROWSER', abort.signal, {
      diagnostics: d,
      host: () => Promise.resolve(hostSample(1000000 + now)),
      vm: () => Promise.resolve(vmSample()),
      now: () => now,
      loop: () => 1,
      onInvalid: () => {
        seen = d.snapshot().firstCollectorInvalid !== null;
        abort.abort();
      },
    });
    const start = c.start();
    now = 1000;
    await vi.advanceTimersByTimeAsync(1000);
    await start;
    now = 5001;
    await vi.advanceTimersByTimeAsync(1000);
    await c.stop();
    expect(seen).toBe(true);
    expect(d.snapshot().firstCollectorInvalid?.reasons).toContain('host_stale');
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    [3, 'default', false],
    [40, 'default', false],
    [60, 'default', false],
    [40, 'reject', false],
    [60, 'reject', false],
    [3, 'default', true],
    [3, 'reject', false],
    [3, 'throw', false],
  ] as const)(
    'actual entry ready actors=%s custom=%s conflict=%s forwards one port',
    async (count, custom, conflict) => {
      const f = await fixture(),
        d = createCapacityRunDiagnostics(count),
        error = Object.assign(Error('PRIVATE'), { name: 'TimeoutError' });
      const leg = required(
        f.runtime.manifest.legs.find(
          (row) =>
            row.actors === count &&
            row.mode === 'NATIVE_BROWSER' &&
            row.scenario ===
              (count === 3 ? 'anonymous_entry_prepare' : 'fresh_registration'),
        ),
      );
      const predecessors: { receiptBytes: string }[] = [];
      let previous: string | null = null;
      const prefix = [];
      let cursor = leg.predecessorLegId;
      while (cursor !== null) {
        const prior = required(
          f.runtime.manifest.legs.find((row) => row.legId === cursor),
        );
        prefix.unshift(prior);
        cursor = prior.predecessorLegId;
      }
      for (const prior of prefix) {
        const value = finalizeCapacityReceipt(
          completeCapacityReceipt(
            f.runtime.scope,
            f.runtime.manifest,
            prior.legId,
            previous,
          ),
          f.runtime.manifest,
          f.runtime.scope,
        );
        expect(value.result).toBe('PASS');
        const receiptBytes = JSON.stringify(value);
        predecessors.push({ receiptBytes });
        previous = sha256(receiptBytes);
      }
      const actors = Array.from({ length: count }, (_, actorIndex) => {
        let url = 'about:blank';
        const locator = (label: string) => ({
          click: () => Promise.resolve(),
          waitFor: () => Promise.resolve(),
          fill: () =>
            label === '名字' && actorIndex === 0
              ? Promise.reject(error)
              : Promise.resolve(),
        });
        return {
          actorIndex,
          page: {
            url: () => url,
            goto: (u: string) => {
              url = u;
              return Promise.resolve(null);
            },
            waitForURL: () => Promise.resolve(),
            getByRole: (_r: string, v: { name: string }) => locator(v.name),
            getByLabel: (label: string) => locator(label),
          },
          observer: {
            arm: (phase: string) => ({
              finished: Promise.resolve({
                actorIndex,
                phase,
                clock: 'CHROMIUM_NETWORK_MONOTONIC',
                requestAtMs: actorIndex,
                durationMs: 1,
                status: 200,
                physicalRequests: 1,
              }),
              cancel: () => undefined,
            }),
            snapshot: () => ({
              available: true,
              unexpectedHttpErrors: 0,
              unexpectedNetworkFailures: 0,
              pendingAction: false,
            }),
          },
        } as unknown as NativeCapacityActor;
      });
      const readyCalls: number[] = [],
        failure = vi.spyOn(d, 'readyFailure');
      const ui =
        custom === 'default'
          ? capacityEntryUi
          : {
              ...capacityEntryUi,
              ready: (actor: NativeCapacityActor) => {
                readyCalls.push(actor.actorIndex);
                if (custom === 'throw') throw error;
                return Promise.reject(error);
              },
            };
      const facade = conflict ? createCapacityRunDiagnostics(count) : d;
      const running = runCapacityEntryBarrier({
        scope: f.runtime.scope,
        plan: f.runtime.manifest,
        legId: leg.legId,
        predecessors,
        ...(count === 3 ? { diagnostics: d } : {}),
        ...(count === 3
          ? {}
          : {
              identities: leg.members.map((alias, index) => ({
                alias,
                account: `reg${String(index)}`,
                password: 'synthetic',
                displayName: '合成學生',
                role: 'student' as const,
                userId: null,
              })),
            }),
        signal: new AbortController().signal,
        runtime: {
          diagnostics: facade,
          start: () => Promise.resolve(),
          createActor: (index: number) =>
            Promise.resolve(required(actors[index])),
          snapshot: () => ({ available: true }),
        },
        journal: f.runtime.journal,
        ui,
        readback: () => Promise.reject(Error('READBACK_MUST_NOT_RUN')),
      });
      if (conflict) {
        await expect(running).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
        expect(d.snapshot().actors).toEqual([]);
        expect(facade.snapshot().actors).toEqual([]);
        expect(f.writes.size).toBe(0);
        return;
      }
      const result = await running;
      expect(result.report.phase).toBe('ready');
      expect(result.report.result).toBe('FAIL');
      expect(d.snapshot().firstReadyFailure).toMatchObject({
        actorIndex: 0,
        subphase: custom === 'default' ? 'NAME' : null,
        subphaseObservation: custom === 'default' ? 'OBSERVED' : 'UNOBSERVED',
        errorName: 'TimeoutError',
        signalAborted: false,
      });
      expect(failure.mock.calls[0]?.[1]).toBe(error);
      if (custom !== 'default')
        expect(readyCalls).toEqual(
          custom === 'throw' ? [0] : [...Array(count).keys()],
        );
      expect(JSON.stringify(d.snapshot())).not.toContain('PRIVATE');
    },
  );
});

it('late event while the single diagnostic write settles cannot publish original PASS', async () => {
  const f = await fixture();
  let diagnostic: Parameters<
    NonNullable<CapacityRunnerPorts['createJourneys']>
  >[3];
  const write = required(f.writer.getMockImplementation());
  vi.spyOn(f.runtime.journal, 'write').mockImplementation(
    async (name, value) => {
      await write(name, value);
      if (name === 'capacity-run-diagnostics')
        diagnostic?.abortRequest('UNKNOWN');
    },
  );
  const result = await runOneCapacityLeg(
    f.runtime,
    new AbortController().signal,
    {
      createJourneys: (_runtime, _signal, _invalid, observed) => {
        diagnostic = observed;
        return f.work;
      },
    },
  );
  expect(result.result).not.toBe('PASS');
  expect(result.controls.journey).toBe(true);
  expect(f.writes.has('capacity-run-diagnostics')).toBe(true);
  expect(f.writes.has('capacity-result-candidate')).toBe(false);
});
