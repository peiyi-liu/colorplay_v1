import { z } from 'zod';
import type { MediaHttpResponse } from './media-http-contract';
import { fail } from './config';
export interface OwnedMediaReadbackRun {
  slot: string;
  runId: string;
  requestId: string;
  authSessionId: string;
  expectedStatus: 'verified' | 'aborted';
  // Includes source/manifest and each variant's exact SHA256, dimensions and bytes.
  receipt: NonNullable<MediaHttpResponse['asset']> | null;
}
export interface MediaReadbackInput {
  scopeRunId: string;
  actorId: string;
  runs: OwnedMediaReadbackRun[];
  draftIds: string[];
  expected: {
    verifiedRuns: number;
    abortedRuns: number;
    assets: number;
    variants: number;
    masterObjects: number;
    variantObjects: number;
    quarantineObjects: 0;
  };
}
export const mediaReadbackSchema = z.strictObject({
  verifiedRuns: z.number().int().nonnegative(),
  abortedRuns: z.number().int().nonnegative(),
  assets: z.number().int().nonnegative(),
  variants: z.number().int().nonnegative(),
  masterObjects: z.number().int().nonnegative(),
  variantObjects: z.number().int().nonnegative(),
  quarantineObjects: z.literal(0),
  hashesMatch: z.literal(true),
  canonicalUnchanged: z.literal(true),
});
// Root validates write-ahead ownership, exact actor/session/requests and the
// approved plan before READ ONLY SQL + bounded owned-object download/hash checks.
// Raw storage paths never cross this port or enter public evidence.
export type MediaReadonlyOracle = (
  input: MediaReadbackInput,
) => Promise<unknown>;
export const assertMediaReadback = (
  input: MediaReadbackInput,
  output: unknown,
) => {
  const parsed = mediaReadbackSchema.safeParse(output);
  if (!parsed.success) return fail('FUNCTIONAL_OPERATION_FAILED');
  for (const key of Object.keys(
    input.expected,
  ) as (keyof MediaReadbackInput['expected'])[]) {
    if (parsed.data[key] !== input.expected[key])
      return fail('FUNCTIONAL_OPERATION_FAILED');
  }
  return parsed.data;
};
