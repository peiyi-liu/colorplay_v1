import { describe, expect, it } from 'vitest';
import {
  finishFunctionalReceipt,
  functionalStages,
  newFunctionalReceipt,
  requiredProofs,
  validateStageProof,
  functionalReceiptSchema,
} from '../../scripts/concurrency/functional-receipt';
import { syntheticScope } from './helpers/whole-site-functional';
describe('strict functional receipt never promotes absent authority', () => {
  it('keeps not-run observations null and cannot pass an empty journey', () => {
    const value = newFunctionalReceipt(syntheticScope(), 'a'.repeat(64));
    expect(
      value.stages.every((row) => row.elapsedMs === null && row.proof === null),
    ).toBe(true);
    expect(finishFunctionalReceipt(value).result).toBe('FAIL');
  });
  it.each(['missing', 'duplicate', 'raw', 'extra-count'] as const)(
    'rejects %s required proof with no raw projection',
    (bad) => {
      const value = { proofs: [...requiredProofs.media], counts: {} };
      const invalid =
        bad === 'missing'
          ? { ...value, proofs: [] }
          : bad === 'duplicate'
            ? { ...value, proofs: Array(6).fill('zip_cancel') }
            : bad === 'raw'
              ? { ...value, nested: { token: 'SYNTHETIC_SECRET' } }
              : { ...value, counts: { rawPath: 'SYNTHETIC_PRIVATE' } };
      expect(() => validateStageProof('media', invalid)).toThrow(
        'FUNCTIONAL_OPERATION_FAILED',
      );
    },
  );
  it('needs every exact stage and cleanup resource/settlement proof', () => {
    const value = newFunctionalReceipt(syntheticScope(), 'a'.repeat(64));
    value.stages = functionalStages.map((stage) => ({
      stage,
      status: 'pass',
      elapsedMs: 1,
      proof: { proofs: [...requiredProofs[stage]], counts: {} },
    }));
    expect(finishFunctionalReceipt(value).result).not.toBe('PASS');
    value.cleanup = {
      status: 'verified',
      resourcesClosed: true,
      settled: true,
    };
    expect(finishFunctionalReceipt(value).result).toBe('PASS');
    value.stages.reverse();
    expect(finishFunctionalReceipt(value).result).toBe('FAIL');
  });
  it('strict public schema refuses credentials even deeply nested', () => {
    const value = newFunctionalReceipt(syntheticScope(), 'a'.repeat(64));
    expect(
      functionalReceiptSchema.safeParse({ ...value, token: 'SYNTHETIC_SECRET' })
        .success,
    ).toBe(false);
    expect(
      functionalReceiptSchema.safeParse({
        ...value,
        cleanup: { ...value.cleanup, cause: { password: 'SYNTHETIC_PRIVATE' } },
      }).success,
    ).toBe(false);
  });
});
