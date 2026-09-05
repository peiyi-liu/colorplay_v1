import { z } from 'zod';
import { adminRpc } from './admin-client';
const metric = z.object({
  signal: z.string(),
  status: z.enum(['ok', 'attention', 'unknown', 'stale']),
  source: z.enum(['database', 'collector']),
  checked_at: z.iso.datetime({ offset: true }),
  observed_at: z.iso.datetime({ offset: true }).nullable(),
  window_started_at: z.iso.datetime({ offset: true }).nullish(),
  value: z.number().nonnegative().nullish(),
  sample_count: z.number().int().nonnegative().nullish(),
  failed_count: z.number().int().nonnegative().nullish(),
  p95_ms: z.number().nonnegative().nullish(),
  revision: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .nullish(),
  evidence_run_id: z.number().int().positive().nullish(),
  environment: z.literal('staging').optional(),
});
export type PlatformMetric = z.infer<typeof metric>;
const response = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('ok'),
    checked_at: z.string(),
    metrics: z.array(metric),
  }),
  z.object({ outcome: z.literal('denied'), code: z.string() }),
]);
export async function getAdminPlatformHealth() {
  return response.parse(await adminRpc<unknown>('admin_platform_health', {}));
}
