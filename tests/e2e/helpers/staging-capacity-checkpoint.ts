import { rename, writeFile } from 'node:fs/promises';

import type { CapacityStage } from './staging-capacity';

export type CapacityStageStatus =
  'cleanup' | 'completed' | 'failed' | 'finished' | 'running';

export async function writeSafeJson(path: string, value: unknown) {
  const temporaryPath = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

export async function writeCapacityStageCheckpoint(
  path: string,
  result: Record<string, unknown>,
  stage: CapacityStage,
  status: CapacityStageStatus,
) {
  result.current_stage = stage;
  result.stage_status = status;
  if (status === 'completed') result.last_completed_stage = stage;
  await writeSafeJson(path, result);
}
