import { z } from 'zod';
export const samplerTimingStages = [
  'REQUEST',
  'CONTEXT',
  'PROFILE',
  'HOST_FACTS',
  'BINARY',
  'MEMBERS',
  'PROCESS_METADATA',
  'SMAPS',
  'STABILITY',
  'CPU',
  'MEMINFO',
  'PSI',
  'OOM',
  'PROFILE_RECHECK',
] as const;
const ms = z.number().min(0).max(30000);
export const samplerTimingSchema = z.discriminatedUnion('collection', [
  z
    .strictObject({
      collection: z.literal('OBSERVED'),
      scope: z.literal('PYTHON_REQUEST_TO_RETURN_ONLY'),
      stages: z
        .array(
          z.strictObject({
            stage: z.enum(samplerTimingStages),
            visits: z.number().int().min(1).max(65536),
            wallMs: ms,
            ownCpuMs: ms,
          }),
        )
        .min(1)
        .max(24),
      wallMs: ms,
      ownCpuMs: ms,
      lastStage: z.enum(samplerTimingStages),
    })
    .superRefine((v, c) => {
      if (
        new Set(v.stages.map((r) => r.stage)).size !== v.stages.length ||
        !v.stages.some((r) => r.stage === v.lastStage) ||
        Math.abs(v.stages.reduce((s, r) => s + r.wallMs, 0) - v.wallMs) >
          1e-6 ||
        Math.abs(v.stages.reduce((s, r) => s + r.ownCpuMs, 0) - v.ownCpuMs) >
          1e-6
      )
        c.addIssue({ code: 'custom', message: 'TIMING_INCONSISTENT' });
    }),
  z.strictObject({
    collection: z.literal('UNAVAILABLE'),
    scope: z.literal('PYTHON_REQUEST_TO_RETURN_ONLY'),
    reason: z.enum(['CLOCK_INVALID', 'BOUNDS', 'OBSERVER_ERROR']),
  }),
]);
export type SamplerTiming = z.infer<typeof samplerTimingSchema>;
