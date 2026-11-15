import { validateCapacityHealth, type CapacityHealth } from './capacity-health';
import {
  capacityExecutionProfile,
  capacityFailure,
  type CapacityScope,
  type CapacityMode,
} from './capacity-scope';
export const validateReceiptHealth = (
  input: unknown,
  scope: CapacityScope,
): CapacityHealth => {
  const health = validateCapacityHealth(input, capacityExecutionProfile(scope));
  if (
    ('kind' in health ? health.executionProfileSha256 : undefined) !==
    scope.executionProfileSha256
  )
    return capacityFailure();
  return health;
};
export const receiptHealthStatus = (
  health: CapacityHealth | null,
  mode: CapacityMode,
): 'generator_unknown' | 'generator_limited' | 'backend_resource' | null => {
  if (
    health &&
    'kind' in health &&
    health.reasons.some(
      (reason) =>
        reason === 'backend_oom' || reason === 'backend_limits_changed',
    )
  )
    return 'backend_resource';
  if (
    health?.mode !== mode ||
    health.validity === 'UNKNOWN' ||
    health.hostSamples < 1 ||
    health.nodeRssMaxBytes === null ||
    health.lastHostAgeMs === null ||
    health.lastHostAgeMs > 3000 ||
    health.eventLoopP95MaxMs === null
  )
    return 'generator_unknown';
  if ('kind' in health) {
    if (
      health.backendSamples < 1 ||
      health.lastBackendAgeMs === null ||
      health.lastBackendAgeMs > 7000 ||
      (mode !== 'NODE_PROTOCOL' &&
        (health.browserTreeRssMaxBytes === null ||
          health.browserTreePssMaxBytes === null))
    )
      return 'generator_unknown';
  } else if (
    health.vmSamples < 1 ||
    health.lastVmAgeMs === null ||
    health.lastVmAgeMs > 7000 ||
    (mode !== 'NODE_PROTOCOL' &&
      (health.browserTreeRssMaxBytes === null ||
        health.browserTreeFootprintMaxBytes === null))
  )
    return 'generator_unknown';
  return health.validity === 'GENERATOR_LIMITED' ? 'generator_limited' : null;
};
