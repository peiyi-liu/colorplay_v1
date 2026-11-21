import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('qualifies the actual root sampler using only deterministic fake providers and joined owned threads', () => {
  const output = execFileSync(
    process.platform === 'darwin'
      ? '/opt/homebrew/bin/python3'
      : '/usr/bin/python3',
    ['-B', 'tests/contracts/helpers/root_pss_concurrency_driver.py'],
    {
      cwd: process.cwd(),
      env: {
        PATH: '/usr/bin:/bin',
        DEVELOPER_DIR: '/Library/Developer/CommandLineTools',
      },
      timeout: 15000,
      maxBuffer: 65536,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  expect(output.toString()).toBe('');
});
