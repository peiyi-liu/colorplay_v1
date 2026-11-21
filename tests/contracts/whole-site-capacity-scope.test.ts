import { describe, it, expect } from 'vitest';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
import { sha256 } from '../../scripts/concurrency/local-runtime';
describe('capacity root authority and exact Local scope', () => {
  it('requires actual authoritative file bytes and a completed root process close', async () => {
    const h = await capacityFixture();
    const scope = parseCapacityScope(h.input, h.proof);
    expect(scope.planId).toBe(h.input.planId);
    expect(Object.isFrozen(scope)).toBe(true);
    expect(Object.isFrozen(scope.helpers)).toBe(true);
  });
  it.each(['appUrl', 'supabaseUrl', 'mailpitUrl', 'databaseUrl'])(
    'rejects wrong target %s',
    async (key) => {
      const h = await capacityFixture();
      expect(() =>
        parseCapacityScope(
          { ...h.input, [key]: 'https://foreign.invalid' },
          h.proof,
        ),
      ).toThrow();
    },
  );
  it('rejects candidate-only, changed bytes, raw extras and mismatched marker revision', async () => {
    const h = await capacityFixture();
    for (const input of [
      { ...h.input, artifactRevision: 'f'.repeat(40) },
      { ...h.input, raw: 'SYNTHETIC_SECRET' },
      { ...h.input, functionalResultSha256: 'f'.repeat(64) },
    ])
      expect(() => parseCapacityScope(input, h.proof)).toThrow();
    expect(() =>
      parseCapacityScope(h.input, {
        ...h.proof,
        receiptBytes: JSON.stringify({
          result: 'PENDING_EXTERNAL_ATTESTATION',
        }),
      }),
    ).toThrow();
  });
  it.each([
    { result: 'FAILED' },
    { exitCode: 1 },
    { signal: 'SIGTERM' },
    { elapsedMs: 1500001 },
    { observedOwnedProcessesRemaining: 1 },
    { stderrBytes: 1 },
    { ownedResourcesClosed: null },
    { sourceStillFrozen: false },
  ])('rejects negative root-close control %j', async (change) => {
    const h = await capacityFixture();
    const bytes = JSON.stringify({ ...h.processClose, ...change });
    expect(() =>
      parseCapacityScope(
        { ...h.input, functionalProcessCloseSha256: sha256(bytes) },
        { ...h.proof, processCloseBytes: bytes },
      ),
    ).toThrow();
  });
});
