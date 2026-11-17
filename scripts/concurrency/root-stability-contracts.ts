import { z } from 'zod';
const windowMs = 1500,
  timingToleranceMs = 1e-9;
const count = z.number().int().min(0).max(65536).nullable();
export const rootStabilitySchema = z
  .strictObject({
    attempts: z.number().int().min(0).max(76),
    elapsedMs: z.number().min(0).max(30000).nullable(),
    stopReason: z.enum(['WINDOW_EXHAUSTED', 'ATTEMPT_CAP', 'CLOCK_INVALID']),
    lastAttemptOutcome: z.enum([
      'COMPLETE_MISMATCH',
      'SMAPS_DISAPPEARED',
      'STABLE_AFTER_DEADLINE',
      'UNOBSERVED',
    ]),
    lastMismatchKinds: z
      .array(
        z.enum([
          'NODE_MISSING',
          'NODE_BINARY',
          'NODE_IDENTITY',
          'CHROME_SET',
          'CHROME_IDENTITY',
        ]),
      )
      .max(5),
    comparisonComplete: z.boolean(),
    beforeChromeCount: count,
    afterChromeCount: count,
    addedCount: count,
    removedCount: count,
    changedIdentityCount: count,
  })
  .superRefine((v, ctx) => {
    const invalid = () => {
      ctx.addIssue({ code: 'custom', message: 'STABILITY_INCONSISTENT' });
    };
    const kinds = new Set(v.lastMismatchKinds);
    if (kinds.size !== v.lastMismatchKinds.length) invalid();
    if (
      kinds.has('NODE_MISSING') &&
      (kinds.has('NODE_BINARY') || kinds.has('NODE_IDENTITY'))
    )
      invalid();
    if (kinds.has('NODE_BINARY') && !kinds.has('NODE_IDENTITY')) invalid();
    if ((v.stopReason === 'CLOCK_INVALID') !== (v.elapsedMs === null))
      invalid();
    if (v.stopReason === 'ATTEMPT_CAP' && v.attempts !== 76) invalid();
    if (v.elapsedMs !== null) {
      if (
        v.stopReason === 'WINDOW_EXHAUSTED' &&
        v.elapsedMs < windowMs - timingToleranceMs
      )
        invalid();
      if (
        v.stopReason === 'ATTEMPT_CAP' &&
        v.elapsedMs > windowMs + timingToleranceMs
      )
        invalid();
    }
    if (v.comparisonComplete) {
      const before = v.beforeChromeCount,
        after = v.afterChromeCount,
        added = v.addedCount,
        removed = v.removedCount,
        changed = v.changedIdentityCount;
      if (
        before === null ||
        after === null ||
        added === null ||
        removed === null ||
        changed === null
      )
        invalid();
      else if (
        before + added - removed !== after ||
        removed > before ||
        added > after ||
        changed > before - removed ||
        kinds.has('CHROME_SET') !== (added > 0 || removed > 0) ||
        kinds.has('CHROME_IDENTITY') !== changed > 0
      )
        invalid();
    } else if (
      v.afterChromeCount !== null ||
      v.addedCount !== null ||
      v.removedCount !== null ||
      v.changedIdentityCount !== null ||
      kinds.size > 0
    )
      invalid();
    if (
      v.lastAttemptOutcome === 'COMPLETE_MISMATCH' &&
      (!v.comparisonComplete || kinds.size === 0)
    )
      invalid();
    if (
      v.lastAttemptOutcome === 'STABLE_AFTER_DEADLINE' &&
      (!v.comparisonComplete ||
        kinds.size > 0 ||
        v.stopReason !== 'WINDOW_EXHAUSTED')
    )
      invalid();
    if (
      v.lastAttemptOutcome === 'SMAPS_DISAPPEARED' &&
      (v.comparisonComplete || v.beforeChromeCount === null)
    )
      invalid();
    if (
      v.lastAttemptOutcome === 'UNOBSERVED' &&
      v.comparisonComplete &&
      (v.stopReason !== 'CLOCK_INVALID' || kinds.size > 0)
    )
      invalid();
    if (
      v.attempts === 0 &&
      (v.lastAttemptOutcome !== 'UNOBSERVED' ||
        v.comparisonComplete ||
        v.beforeChromeCount !== null)
    )
      invalid();
    if (
      v.stopReason === 'ATTEMPT_CAP' &&
      !['COMPLETE_MISMATCH', 'SMAPS_DISAPPEARED'].includes(v.lastAttemptOutcome)
    )
      invalid();
  });
export const rootStabilityContextValid = (v: {
  result: string;
  code: string;
  stage: string;
  errno: string | null;
  stability?: z.infer<typeof rootStabilitySchema> | undefined;
}) =>
  v.stability === undefined ||
  (v.result === 'HOST_SAMPLE_UNAVAILABLE' &&
    v.code === 'PROCESS_TREE_INCOMPLETE' &&
    ['SMAPS', 'STABILITY'].includes(v.stage) &&
    v.errno === null &&
    (!v.stability.comparisonComplete || v.stage === 'STABILITY'));
