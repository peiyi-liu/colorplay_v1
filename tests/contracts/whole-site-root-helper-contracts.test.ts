import { describe, expect, it } from 'vitest';
import { capacityScopeSchema } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';

describe('explicit Linux helper closure contracts', () => {
  it('admits the ten real Linux scope helpers instead of a fabricated vm sampler', async () => {
    const f = await capacityFixture();
    const names = [
      'functional-preflight.py',
      'canonical-baseline.py',
      'media-readback.py',
      'execution-profile-preflight.py',
      'linux-host-sample.py',
      'backend-cgroup-sample.py',
      'linux_proc.py',
      'linux_cgroup.py',
      'linux_runtime_common.py',
      'linux_host_contract.py',
    ];
    expect(
      capacityScopeSchema.safeParse({
        ...f.input,
        executionProfileSha256: 'a'.repeat(64),
        helpers: Object.fromEntries(
          names.map((name) => [name, 'b'.repeat(64)]),
        ),
      }).success,
    ).toBe(true);
  });
});
import {
  approveRootHelperClosure,
  helperClosureSchema,
  linuxClosureNames,
  requireRootHelperAuthority,
  rootBytesSha256,
} from '../../scripts/concurrency/root-helper-contracts';
describe('exact fourteen-file closure authority', () => {
  const setup = () => {
    const files = Object.fromEntries(
      linuxClosureNames.map((name) => [name, 'b'.repeat(64)]),
    );
    const body = {
      schemaVersion: 1,
      sourceRevision: 'a'.repeat(40),
      executionProfileSha256: 'c'.repeat(64),
      files,
    };
    return { body, files, text: JSON.stringify(body) };
  };
  it('freezes the actual closure and rejects cloned capability', () => {
    const f = setup(),
      a = approveRootHelperClosure(
        f.text,
        rootBytesSha256(f.text),
        f.body.sourceRevision,
        f.body.executionProfileSha256,
        f.files,
      );
    expect(requireRootHelperAuthority(a)).toBe(a);
    expect(Object.isFrozen(a.closure.files)).toBe(true);
    expect(() => requireRootHelperAuthority(structuredClone(a))).toThrow(
      'ROOT_HELPER_INVALID',
    );
  });
  it.each([
    'missing-library',
    'extra-path',
    'shadow-hash',
    'wrong-bytes',
    'wrong-source',
    'wrong-profile',
    'unobserved-file',
  ])('refuses %s', (bad) => {
    const f = setup();
    if (bad === 'missing-library')
      Reflect.deleteProperty(f.body.files, 'linux_proc.py');
    if (bad === 'extra-path')
      Object.assign(f.body.files, { '../foreign.py': 'b'.repeat(64) });
    const text = JSON.stringify(f.body),
      observed = { ...f.files };
    if (bad === 'shadow-hash') observed['media-readback.py'] = '0'.repeat(64);
    if (bad === 'unobserved-file')
      Reflect.deleteProperty(observed, 'linux_runtime_common.py');
    expect(() =>
      approveRootHelperClosure(
        text,
        bad === 'wrong-bytes' ? '0'.repeat(64) : rootBytesSha256(text),
        bad === 'wrong-source' ? 'f'.repeat(40) : f.body.sourceRevision,
        bad === 'wrong-profile'
          ? 'f'.repeat(64)
          : f.body.executionProfileSha256,
        observed,
      ),
    ).toThrow();
  });
  it('does not normalize a missing or unknown entry into the fixed closure', () => {
    const f = setup();
    expect(Object.keys(helperClosureSchema.parse(f.body).files)).toHaveLength(
      14,
    );
    expect(
      helperClosureSchema.safeParse({
        ...f.body,
        files: { ...f.files, 'vm-sample.py': 'b'.repeat(64) },
      }).success,
    ).toBe(false);
  });
});
