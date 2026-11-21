import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeRootHelper,
  type RootHelperProcessPorts,
} from '../../scripts/concurrency/root-helper-executor';
import {
  approveRootHelperClosure,
  linuxClosureNames,
  rootBytesSha256,
  ROOT_RUNTIME_DIRECTORY,
} from '../../scripts/concurrency/root-helper-contracts';
const authority = () => {
  const files = Object.fromEntries(
    linuxClosureNames.map((n) => [n, 'b'.repeat(64)]),
  );
  const text = JSON.stringify({
    schemaVersion: 1,
    sourceRevision: 'a'.repeat(40),
    executionProfileSha256: 'c'.repeat(64),
    files,
  });
  return approveRootHelperClosure(
    text,
    rootBytesSha256(text),
    'a'.repeat(40),
    'c'.repeat(64),
    files,
  );
};
const setup = (platform = 'darwin', duringSpawn?: () => void) => {
  const stdout = new PassThrough(),
    stdin = new PassThrough();
  let closed:
      | ((code: number | null, signal: NodeJS.Signals | null) => void)
      | undefined,
    error: (() => void) | undefined;
  const spawn = vi.fn(() => {
    duringSpawn?.();
    return {
      pid: 123,
      stdout,
      stdin,
      onError: (fn: () => void) => {
        error = fn;
      },
      onClose: (
        fn: (code: number | null, signal: NodeJS.Signals | null) => void,
      ) => {
        closed = fn;
      },
    };
  });
  const killGroup = vi.fn();
  const ports: RootHelperProcessPorts = { platform, spawn, killGroup };
  return {
    ports,
    stdout,
    stdin,
    spawn,
    killGroup,
    close: (code = 0, signal: NodeJS.Signals | null = null) =>
      closed?.(code, signal),
    error: () => error?.(),
  };
};
const args = ['a'.repeat(40), 'wsb-abcdef-123456'];
afterEach(() => vi.useRealTimers());
describe('fixed bounded subprocess executor', () => {
  it('retains Darwin fixed executable and forwards only bounded output after normal close', async () => {
    const f = setup(),
      task = executeRootHelper(
        'functional-preflight.py',
        args,
        null,
        new AbortController().signal,
        undefined,
        f.ports,
      );
    expect(f.spawn.mock.calls[0]).toEqual([
      '/opt/homebrew/bin/python3',
      [ROOT_RUNTIME_DIRECTORY + '/functional-preflight.py', ...args],
    ]);
    f.stdout.emit('data', Buffer.from('{"ok":true}'));
    f.close();
    expect(await task).toBe('{"ok":true}');
    expect(f.killGroup).not.toHaveBeenCalled();
  });
  it('allows approved Linux bootstrap using fixed Python and -B, never a library entry', async () => {
    const f = setup('linux'),
      argv = ['a'.repeat(40), 'c'.repeat(64), 'd'.repeat(32)];
    const task = executeRootHelper(
      'execution-profile-preflight.py',
      argv,
      null,
      new AbortController().signal,
      authority(),
      f.ports,
    );
    expect(f.spawn.mock.calls[0]).toEqual([
      '/usr/bin/python3',
      [
        '-B',
        ROOT_RUNTIME_DIRECTORY + '/execution-profile-preflight.py',
        ...argv,
      ],
    ]);
    f.close();
    await task;
  });
  it.each([
    'missing-authority',
    'wrong-platform',
    'legacy-vm',
    'library',
    'bad-args',
    'input-overflow',
    'already-aborted',
  ])('refuses %s before spawn', async (bad) => {
    const f = setup(bad === 'wrong-platform' ? 'darwin' : 'linux'),
      abort = new AbortController();
    if (bad === 'already-aborted') abort.abort();
    const helper =
      bad === 'library'
        ? 'linux_proc.py'
        : bad === 'legacy-vm'
          ? 'vm-sample.py'
          : 'linux-host-sample.py';
    await expect(
      executeRootHelper(
        helper as never,
        bad === 'bad-args' ? ['EXTRA'] : [],
        bad === 'input-overflow' ? 'X'.repeat(131073) : null,
        abort.signal,
        bad === 'missing-authority' ? undefined : authority(),
        f.ports,
      ),
    ).rejects.toThrow('ROOT_HELPER_INVALID');
    expect(f.spawn).not.toHaveBeenCalled();
  });
  it.each([
    'abort',
    'startup-abort',
    'timeout',
    'output-overflow',
    'stdin-error',
    'process-error',
    'nonzero',
    'signal',
  ])('waits for real close and releases timers after %s', async (bad) => {
    vi.useFakeTimers();
    const abort = new AbortController(),
      f = setup(
        'darwin',
        bad === 'startup-abort'
          ? () => {
              abort.abort();
            }
          : undefined,
      );
    let settled = false;
    const task = executeRootHelper(
      'functional-preflight.py',
      args,
      null,
      abort.signal,
      undefined,
      f.ports,
    );
    const rejected = expect(task).rejects.toThrow('ROOT_HELPER_INVALID');
    void task.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    if (bad === 'abort') abort.abort();
    if (bad === 'timeout') await vi.advanceTimersByTimeAsync(30000);
    if (bad === 'output-overflow') f.stdout.emit('data', Buffer.alloc(131073));
    if (bad === 'stdin-error')
      f.stdin.emit('error', new Error('SYNTHETIC_PRIVATE_MARKER'));
    if (bad === 'process-error') f.error();
    await Promise.resolve();
    expect(settled).toBe(false);
    f.close(bad === 'nonzero' ? 1 : 0, bad === 'signal' ? 'SIGTERM' : null);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('does not kill a closed PID or extend output on late stream events', async () => {
  vi.useFakeTimers();
  const f = setup(),
    task = executeRootHelper(
      'functional-preflight.py',
      args,
      null,
      new AbortController().signal,
      undefined,
      f.ports,
    );
  f.close();
  await task;
  f.stdout.emit('error', new Error('LATE_SYNTHETIC'));
  f.stdin.emit('error', new Error('LATE_SYNTHETIC'));
  f.stdout.emit('data', Buffer.alloc(131073));
  expect(f.killGroup).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
