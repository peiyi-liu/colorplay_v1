import { PassThrough } from 'node:stream';
import { expect, it } from 'vitest';
import { executeRootHelper } from '../../scripts/concurrency/root-helper-executor';
it('actual exported executor observes nonzero close while still rejecting the original operation', async () => {
  const stdout = new PassThrough(),
    stdin = new PassThrough();
  let close:
    ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  const events: unknown[] = [];
  const task = executeRootHelper(
    'host-sample.py',
    [],
    null,
    new AbortController().signal,
    undefined,
    {
      platform: 'darwin',
      killGroup: () => undefined,
      spawn: () => ({
        pid: 123,
        stdout,
        stdin,
        onError: () => undefined,
        onClose: (callback) => {
          close = callback;
        },
      }),
    },
    (event) => {
      events.push(event);
    },
  );
  stdout.emit(
    'data',
    Buffer.from(
      '{"result":"HOST_SAMPLE_UNAVAILABLE","code":"PROCESS_TREE_INCOMPLETE","stage":"STABILITY","errno":null,"rawProviderOutput":false}',
    ),
  );
  expect(
    events.some(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        Reflect.get(value, 'event') === 'CLOSE',
    ),
  ).toBe(false);
  close?.(1, null);
  await expect(task).rejects.toThrow('ROOT_HELPER_INVALID');
  expect(events).toContainEqual(
    expect.objectContaining({
      event: 'CLOSE',
      exitCode: 1,
      stopSignal: null,
      pidPresent: true,
    }),
  );
});

import { afterEach, describe, vi } from 'vitest';
import {
  createRootHelperDiagnostics,
  rootHelperDiagnosticsSchema,
} from '../../scripts/concurrency/root-helper-contracts';
const setup = (options: { pid?: number; spawnThrows?: boolean } = {}) => {
  const stdout = new PassThrough(),
    stdin = new PassThrough();
  let close:
    ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  let error: ((value?: unknown) => void) | undefined;
  const killGroup = vi.fn();
  const spawn = vi.fn(() => {
    if (options.spawnThrows)
      throw Object.assign(Error('PRIVATE'), { code: 'EACCES' });
    return {
      pid: options.pid,
      stdout,
      stdin,
      onError: (fn: (value?: unknown) => void) => {
        error = fn;
      },
      onClose: (fn: NonNullable<typeof close>) => {
        close = fn;
      },
    };
  });
  const d = createRootHelperDiagnostics(),
    trace = d.begin('host-sample.py', 0),
    signal = new AbortController();
  const run = () =>
    executeRootHelper(
      'host-sample.py',
      [],
      null,
      signal.signal,
      undefined,
      { platform: 'darwin', spawn, killGroup },
      trace.observe,
    );
  return {
    d,
    trace,
    signal,
    run,
    stdout,
    stdin,
    spawn,
    killGroup,
    close: (code: number | null = 0, value: NodeJS.Signals | null = null) => {
      close?.(code, value);
    },
    error: (value?: unknown) => {
      error?.(value);
    },
  };
};
const envelope = (
  code = 'PROCESS_TREE_INCOMPLETE',
  stage = 'STABILITY',
  number: string | null = null,
) =>
  JSON.stringify({
    result: 'HOST_SAMPLE_UNAVAILABLE',
    code,
    stage,
    errno: number,
    rawProviderOutput: false,
  });
afterEach(() => vi.useRealTimers());
describe('closed executor events and original operation semantics', () => {
  it.each(['known', 'unknown', 'malformed', 'wrong-kind'] as const)(
    'decodes only complete bounded failed stdout: %s',
    async (kind) => {
      const f = setup({ pid: 123 }),
        task = f.run();
      f.stdout.emit(
        'data',
        Buffer.from(
          kind === 'malformed'
            ? '{'
            : kind === 'wrong-kind'
              ? envelope().replace(
                  'HOST_SAMPLE_UNAVAILABLE',
                  'BACKEND_SAMPLE_UNAVAILABLE',
                )
              : envelope(
                  kind === 'known'
                    ? 'PROCESS_TREE_INCOMPLETE'
                    : 'PRIVATE_SECRET',
                  kind === 'known' ? 'STABILITY' : 'constructor',
                  kind === 'known' ? 'EACCES' : '__proto__',
                ),
        ),
      );
      expect(
        f.d.snapshot().calls[0]?.events.some((e) => e.event === 'CLOSE'),
      ).toBe(false);
      f.close(1);
      await expect(task).rejects.toThrow('ROOT_HELPER_INVALID');
      f.trace.finish();
      const value = f.d.snapshot(),
        terminal = value.calls[0]?.events.find(
          (e) => e.domain === 'EXECUTOR' && e.event === 'CLOSE',
        );
      expect(terminal).toMatchObject({
        event: 'CLOSE',
        exitCode: 1,
        stopSignal: null,
        pidPresent: true,
        envelopeState: 'UNOBSERVED',
      });
      const decoded = value.calls[0]?.events.find(
        (e) => e.event === 'ENVELOPE',
      );
      expect(decoded).toMatchObject({
        envelopeState:
          kind === 'malformed' || kind === 'wrong-kind'
            ? 'UNAVAILABLE'
            : 'OBSERVED',
      });
      if (kind === 'known' || kind === 'unknown')
        expect(decoded).toMatchObject({
          envelope: {
            code: kind === 'known' ? 'PROCESS_TREE_INCOMPLETE' : 'UNKNOWN',
            stage: kind === 'known' ? 'STABILITY' : 'UNKNOWN',
            errno: kind === 'known' ? 'EACCES' : 'UNKNOWN',
          },
        });
      expect(JSON.stringify(value)).not.toMatch(
        /PRIVATE|constructor|__proto__/,
      );
      expect(rootHelperDiagnosticsSchema.safeParse(value).success).toBe(true);
    },
  );
  it.each([
    'timeout',
    'abort',
    'oversize',
    'stdin',
    'stdout',
    'error',
    'signal',
  ] as const)('preserves %s failure and waits for onClose', async (kind) => {
    vi.useFakeTimers();
    const f = setup({ pid: 123 }),
      task = f.run();
    let settled = false;
    void task.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    const rejected = expect(task).rejects.toThrow('ROOT_HELPER_INVALID');
    const code = Object.assign(Error('PRIVATE'), { code: 'EPIPE' });
    if (kind === 'timeout') await vi.advanceTimersByTimeAsync(30000);
    if (kind === 'abort') f.signal.abort('PRIVATE');
    if (kind === 'oversize') f.stdout.emit('data', Buffer.alloc(131073));
    if (kind === 'stdin') f.stdin.emit('error', code);
    if (kind === 'stdout') f.stdout.emit('error', code);
    if (kind === 'error') f.error(code);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(
      f.d.snapshot().calls[0]?.events.some((e) => e.event === 'CLOSE'),
    ).toBe(false);
    f.close(kind === 'signal' ? 0 : 1, kind === 'signal' ? 'SIGTERM' : null);
    await rejected;
    f.trace.finish();
    const first = f.d.snapshot().calls[0]?.firstFailure;
    expect(first?.event).toBe(
      {
        timeout: 'DEADLINE',
        abort: 'ABORT',
        oversize: 'OUTPUT_LIMIT',
        stdin: 'STDIN',
        stdout: 'STDOUT',
        error: 'ERROR',
        signal: 'CLOSE',
      }[kind],
    );
    f.stdout.emit('data', Buffer.from('PRIVATE'));
    f.close(0);
    expect(f.d.snapshot().collection).toBe('UNAVAILABLE');
    expect(f.d.snapshot().calls[0]?.firstFailure).toEqual(first);
    expect(JSON.stringify(f.d.snapshot())).not.toContain('PRIVATE');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('records spawn failure without inventing close and does not replace its original rejection', async () => {
    const f = setup({ spawnThrows: true });
    await expect(f.run()).rejects.toThrow('ROOT_HELPER_INVALID');
    f.trace.finish();
    expect(f.d.snapshot().calls[0]?.firstFailure).toMatchObject({
      event: 'SPAWN',
      nodeCode: 'EACCES',
    });
    expect(
      f.d.snapshot().calls[0]?.events.some((e) => e.event === 'CLOSE'),
    ).toBe(false);
  });
  it('no-pid close is only a callback witness, including a legitimate negative spawn code', async () => {
    const f = setup(),
      task = f.run();
    f.error(Object.assign(Error('PRIVATE'), { code: 'ENOENT' }));
    f.close(-2);
    await expect(task).rejects.toThrow();
    f.trace.finish();
    expect(
      f.d.snapshot().calls[0]?.events.find((e) => e.event === 'CLOSE'),
    ).toMatchObject({
      pidPresent: false,
      exitCode: -2,
      envelopeState: 'UNOBSERVED',
    });
    expect(JSON.stringify(f.d.snapshot())).not.toContain('processClosed');
  });
  it('keeps positive byte decoding unchanged even when UTF8 witness fails', async () => {
    const f = setup({ pid: 123 }),
      task = f.run();
    const data = Buffer.from([0x22, 0xff, 0x22]);
    f.stdout.emit('data', data);
    f.close();
    await expect(task).resolves.toBe(data.toString('utf8'));
    expect(f.d.snapshot().calls[0]?.firstFailure?.event).toBe('UTF8');
  });
  it('admission remains before spawn and emits no close', async () => {
    const f = setup({ pid: 123 });
    f.signal.abort();
    await expect(f.run()).rejects.toThrow();
    expect(f.spawn).not.toHaveBeenCalled();
    expect(f.d.snapshot().calls[0]?.firstFailure?.event).toBe('ADMISSION');
  });
  it('bad custom observer cannot change original success', async () => {
    const stdout = new PassThrough(),
      stdin = new PassThrough();
    let done: (() => void) | undefined;
    const task = executeRootHelper(
      'host-sample.py',
      [],
      null,
      new AbortController().signal,
      undefined,
      {
        platform: 'darwin',
        killGroup: () => undefined,
        spawn: () => ({
          pid: 123,
          stdout,
          stdin,
          onError: () => undefined,
          onClose: (fn) => {
            done = () => {
              fn(0, null);
            };
          },
        }),
      },
      () => {
        throw Error('PRIVATE');
      },
    );
    stdout.emit('data', Buffer.from('unchanged'));
    done?.();
    await expect(task).resolves.toBe('unchanged');
  });
});
describe('pure bounded diagnostic shape and native/custom distinction', () => {
  it('custom phase-only IO remains executor UNOBSERVED and incomplete close is unavailable', () => {
    const d = createRootHelperDiagnostics(() => 1),
      r = d.begin('host-sample.py', 0);
    r.phase('EXECUTE', 'ENTERED');
    r.observe({ event: 'JSON_PARSE', state: 'COMPLETED' });
    expect(d.snapshot().calls[0]?.executorWitness).toBe('UNOBSERVED');
    r.observe({ event: 'CLOSE', state: 'COMPLETED' });
    expect(d.snapshot().collection).toBe('UNAVAILABLE');
  });
  it('overflow and late events retain first failure and never store unsafe extra fields', () => {
    const d = createRootHelperDiagnostics(() => 1),
      r = d.begin('host-sample.py', 0);
    r.observe({ event: 'STDIN', state: 'FAILED', nodeCode: 'EPIPE' });
    const first = d.snapshot().calls[0]?.firstFailure;
    for (let i = 0; i < 70; i++)
      r.observe({ event: 'STDOUT', state: 'COMPLETED' });
    expect(d.snapshot()).toMatchObject({
      collection: 'UNAVAILABLE',
      overflow: true,
    });
    expect(d.snapshot().calls[0]?.events).toHaveLength(64);
    expect(d.snapshot().calls[0]?.firstFailure).toEqual(first);
    r.finish();
    r.observe({ event: 'ERROR', state: 'FAILED', message: 'PRIVATE' });
    expect(JSON.stringify(d.snapshot())).not.toContain('PRIVATE');
  });
  it('call bound is finite without throwing into operations', () => {
    const d = createRootHelperDiagnostics(() => 0);
    for (let i = 0; i < 10001; i++) d.begin('host-sample.py', 0).finish();
    expect(d.snapshot().calls).toHaveLength(10000);
    expect(d.snapshot()).toMatchObject({
      collection: 'UNAVAILABLE',
      overflow: true,
    });
  });
});
