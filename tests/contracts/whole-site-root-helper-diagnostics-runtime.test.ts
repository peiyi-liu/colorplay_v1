import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import * as executor from '../../scripts/concurrency/root-helper-executor';
import { executeCapacityRoot } from '../../scripts/concurrency/capacity-runtime';
import { createRootHelperDiagnostics } from '../../scripts/concurrency/root-helper-contracts';
afterEach(() => vi.restoreAllMocks());
it.each(['valid', 'invalid', 'execute-reject'] as const)(
  'actual exported capacity adapter preserves %s and observes only actual parse phases',
  async (kind) => {
    const d = createRootHelperDiagnostics(),
      trace = d.begin('host-sample.py', 0);
    const spy = vi.spyOn(executor, 'executeRootHelper');
    if (kind === 'execute-reject') spy.mockRejectedValueOnce(Error('PRIVATE'));
    else spy.mockResolvedValueOnce(kind === 'valid' ? '[1]' : '{PRIVATE');
    const task = executeCapacityRoot(
      'host-sample.py',
      [],
      null,
      new AbortController().signal,
      undefined,
      trace.observe,
    );
    if (kind === 'valid') await expect(task).resolves.toEqual([1]);
    else await expect(task).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    trace.finish();
    const value = d.snapshot();
    expect(value.calls[0]?.executorWitness).toBe('UNOBSERVED');
    const parsed = value.calls[0]?.events.filter(
      (e) => e.event === 'JSON_PARSE',
    );
    expect(parsed?.map((e) => e.state)).toEqual(
      kind === 'execute-reject'
        ? []
        : ['ENTERED', kind === 'valid' ? 'COMPLETED' : 'FAILED'],
    );
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
    expect(spy).toHaveBeenCalledOnce();
  },
);
it('runs only synthetic Python provider/errno/positive-output controls, never native proc helpers', () => {
  const result = execFileSync(
    process.platform === 'darwin'
      ? '/opt/homebrew/bin/python3'
      : '/usr/bin/python3',
    ['-B', 'tests/contracts/helpers/root_sampler_failure_driver.py'],
    {
      cwd: process.cwd(),
      env: {
        PATH: '/usr/bin:/bin',
        DEVELOPER_DIR: '/Library/Developer/CommandLineTools',
      },
      timeout: 10000,
      maxBuffer: 65536,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  expect(result.toString()).toBe('');
});
