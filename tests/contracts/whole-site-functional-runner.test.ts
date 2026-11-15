import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import * as browserRuntime from '../../scripts/concurrency/browser-runtime';
import { createActualFunctionalPorts } from '../../scripts/concurrency/functional-journeys';
import type { FunctionalRuntime } from '../../scripts/concurrency/functional-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  runFunctional,
  type FunctionalRunPorts,
} from '../../scripts/concurrency/functional-runner';
import {
  functionalStages,
  requiredProofs,
} from '../../scripts/concurrency/functional-receipt';
import { syntheticSecrets, readyScope } from './helpers/whole-site-functional';
const harness = async () => {
  const scope = await readyScope();
  const order: string[] = [];
  const writes: unknown[] = [];
  const ports: FunctionalRunPorts = {
    preflight: vi.fn(() => Promise.resolve(scope)),
    canonicalBaseline: vi.fn(() => {
      order.push('canonical');
      return Promise.resolve();
    }),
    stage: vi.fn<FunctionalRunPorts['stage']>((stage) => {
      order.push(stage);
      return Promise.resolve({
        proofs: [...requiredProofs[stage]],
        counts: {},
      });
    }),
    close: vi.fn(() =>
      Promise.resolve({ resourcesClosed: true, settled: true }),
    ),
    journal: {
      directory: 'synthetic',
      write: (name, value) => {
        writes.push({ name, value });
        return Promise.resolve();
      },
    },
    artifactSha256: 'a'.repeat(64),
    mediaOraclePresent: true,
    now: () => Date.now(),
  };
  return { ports, scope, order, writes };
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('whole-site complete runner with fake ports only', () => {
  it('settles an owned browser that finishes launching after abort before claiming cleanup', async () => {
    const scope = await readyScope();
    const controller = new AbortController();
    let finish: (value: Browser) => void = () => undefined;
    const launch = new Promise<Browser>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(chromium, 'launch').mockReturnValueOnce(launch);
    const late = { close: vi.fn(() => Promise.resolve()), newContext: vi.fn() };
    const runtime: FunctionalRuntime = {
      scope,
      secrets: syntheticSecrets,
      artifactSha256: 'a'.repeat(64),
      journal: { directory: 'synthetic', write: () => Promise.resolve() },
      preflight: () => Promise.resolve(scope),
      canonicalBaseline: () => Promise.resolve(undefined),
      mediaOracle: () => Promise.reject(new Error('SYNTHETIC_NOT_USED')),
    };
    const ports = createActualFunctionalPorts(runtime);
    await ports.preflight(controller.signal);
    const task = ports.stage('fixture_setup', controller.signal);
    const caught = expect(task).rejects.toThrow();
    controller.abort();
    const closed = ports.close();
    finish(late as unknown as Browser);
    await caught;
    await closed;
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(late.newContext).not.toHaveBeenCalled();
  });
  it.each(['context_pending', 'startup_rejection'] as const)(
    'settles %s without allowing fixtures or leaving a late owned context',
    async (mode) => {
      const scope = await readyScope();
      const controller = new AbortController();
      let finish: (value: BrowserContext) => void = () => undefined;
      const contextPromise = new Promise<BrowserContext>((resolve) => {
        finish = resolve;
      });
      const owned = { close: vi.fn(() => Promise.resolve()) };
      const created = { close: vi.fn(() => Promise.resolve()) };
      vi.spyOn(chromium, 'launch').mockImplementationOnce(() =>
        mode === 'startup_rejection'
          ? Promise.reject(new Error('SYNTHETIC_STARTUP_SECRET'))
          : Promise.resolve(owned as unknown as Browser),
      );
      const create = vi
        .spyOn(browserRuntime, 'createFunctionalContext')
        .mockReturnValueOnce(contextPromise);
      const write = vi.fn(() => Promise.resolve());
      const ports = createActualFunctionalPorts({
        scope,
        secrets: syntheticSecrets,
        artifactSha256: 'a'.repeat(64),
        journal: { directory: 'synthetic', write },
        preflight: () => Promise.resolve(scope),
        canonicalBaseline: () => Promise.resolve(undefined),
        mediaOracle: () => Promise.reject(new Error('SYNTHETIC_NOT_USED')),
      });
      await ports.preflight(controller.signal);
      const task = ports.stage('fixture_setup', controller.signal);
      const caught = expect(task).rejects.toThrow();
      if (mode === 'context_pending') {
        await vi.waitFor(() => {
          expect(create).toHaveBeenCalledTimes(1);
        });
        controller.abort();
        const closed = ports.close();
        finish(created as unknown as BrowserContext);
        await caught;
        await closed;
        expect(created.close).toHaveBeenCalledTimes(1);
        expect(owned.close).toHaveBeenCalledTimes(1);
      } else {
        await caught;
        await expect(ports.close()).resolves.toEqual({
          resourcesClosed: true,
          settled: true,
        });
        expect(create).not.toHaveBeenCalled();
      }
      expect(write).not.toHaveBeenCalled();
    },
  );
  it('requires preflight, canonical then every ordered stage and refresh last before health', async () => {
    const h = await harness();
    const result = await runFunctional(h.ports);
    expect(result.result).toBe('PASS');
    expect(h.order).toEqual(['canonical', ...functionalStages]);
    expect(functionalStages.at(-2)).toBe('controlled_refresh');
    expect(result.cleanup).toEqual({
      status: 'verified',
      resourcesClosed: true,
      settled: true,
    });
    expect(h.writes.length).toBeGreaterThan(functionalStages.length);
  });
  it('a failed preflight or absent root oracle performs zero stage mutations', async () => {
    const h = await harness();
    h.ports.preflight = () => Promise.reject(new Error('SYNTHETIC_SECRET'));
    await expect(runFunctional(h.ports)).rejects.toThrow(
      'FUNCTIONAL_PREFLIGHT_FAILED',
    );
    expect(h.order).toEqual([]);
    const second = await harness();
    second.ports.mediaOraclePresent = false;
    await expect(runFunctional(second.ports)).rejects.toThrow();
    expect(second.order).toEqual([]);
  });
  it('missing or raw injected proof cannot pass and later stages never start', async () => {
    const h = await harness();
    h.ports.stage = (stage) =>
      Promise.resolve(
        stage === 'student_s1'
          ? { proofs: [], counts: {}, token: 'SYNTHETIC_SECRET' }
          : { proofs: [...requiredProofs[stage]], counts: {} },
      );
    const result = await runFunctional(h.ports);
    expect(result.result).toBe('FAIL');
    expect(result.failureStage).toBe('student_s1');
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC_SECRET');
    expect(h.ports.close).toHaveBeenCalledTimes(1);
  });
  it('cleanup failure cannot promote successful stages into PASS', async () => {
    const h = await harness();
    h.ports.close = () => Promise.reject(new Error('SYNTHETIC_RAW_PROVIDER'));
    const result = await runFunctional(h.ports);
    expect(result.result).toBe('FAIL');
    expect(result.cleanup.status).toBe('failed');
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC_RAW_PROVIDER');
  });
  it('closes after a preflight timeout without starting or journaling any fixture', async () => {
    vi.useFakeTimers();
    const h = await harness();
    h.ports.preflight = () => new Promise(() => undefined);
    const result = runFunctional(h.ports);
    const caught = expect(result).rejects.toThrow(
      'FUNCTIONAL_PREFLIGHT_FAILED',
    );
    await vi.advanceTimersByTimeAsync(25 * 60_000);
    await caught;
    expect(h.ports.close).toHaveBeenCalledTimes(1);
    expect(h.order).toEqual([]);
    expect(h.writes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('uses at most the reserved 30 seconds for stalled cleanup, even after a short run', async () => {
    vi.useFakeTimers();
    const h = await harness();
    h.ports.close = () => new Promise(() => undefined);
    const result = runFunctional(h.ports);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await result).result).toBe('INCONCLUSIVE');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('a failed journal intent blocks that stage action', async () => {
    const h = await harness();
    const write = h.ports.journal.write.bind(h.ports.journal);
    h.ports.journal = {
      directory: 'synthetic',
      write: (name, value) =>
        name === 'stage-fixture-setup-intent'
          ? Promise.reject(new Error('SYNTHETIC_SECRET'))
          : write(name, value),
    };
    const result = await runFunctional(h.ports);
    expect(result.result).toBe('FAIL');
    expect(result.failureStage).toBe('fixture_setup');
    expect(h.order).toEqual(['canonical', 'canonical_baseline']);
  });
  it('observes abort and late task completion without publishing a late success', async () => {
    vi.useFakeTimers();
    const h = await harness();
    let release: () => void = () => undefined;
    h.ports.stage = (_stage, signal) =>
      new Promise((resolve) => {
        release = () => {
          resolve({
            proofs: [...requiredProofs.canonical_baseline],
            counts: {},
          });
        };
        signal.addEventListener('abort', release, { once: true });
      });
    const pending = runFunctional(h.ports);
    await vi.advanceTimersByTimeAsync(25 * 60_000);
    const result = await pending;
    expect(result.result).toBe('INCONCLUSIVE');
    expect(result.timedOut).toBe(true);
    release();
    await Promise.resolve();
    expect(result.result).not.toBe('PASS');
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
