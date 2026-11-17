import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('offline harness readiness qualification', () => {
  it('collects synthetic facts and closes unsafe inputs without provider operations', () => {
    const driver = 'tests/contracts/helpers/harness_readiness_driver.py';
    expect(() =>
      execFileSync('python3', ['-B', driver], { timeout: 15_000 }),
    ).not.toThrow();
  });
});
