import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('isolated VM workflow and Python host/provenance contract', () => {
  it('runs actual pure validators and collectors without native operations', () => {
    expect(() =>
      execFileSync(
        'python3',
        ['-B', 'tests/contracts/helpers/linux_vm_contract_driver.py'],
        { timeout: 15_000 },
      ),
    ).not.toThrow();
  });
  it('uses only the unique ephemeral runner label and paid outer budget', () => {
    const text = readFileSync(
      '.github/workflows/local-capacity-vm.yml',
      'utf8',
    );
    expect(text).toContain('codex/local-capacity-vm-20261118');
    expect(text).toContain('runs-on: colorplay-local-vm-20261118-a61f29');
    expect(text).toContain('timeout-minutes: 150');
    expect(text).toContain(
      'COLORPLAY_LOCAL_HOST_PROFILE_KIND: LINUX_VM_12CPU_32G_V1',
    );
    expect(text).toContain('persist-credentials: false');
    expect(text).toContain('capacity-linux:');
    expect(text).not.toContain('secrets.');
    expect(text).not.toContain('COLORPLAY_LOCAL_DIAGNOSTIC_ONLY');
  });
});
