import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

import {
  failCapacity,
  requireLocalExecution,
  type CapacityConfig,
} from './capacity-config';
import type { CapacitySecrets } from './capacity-local-client';
import type { LocalDatabase } from './capacity-local-database';

const execute = promisify(execFile);
export const capacityRepositoryRoot = resolve(import.meta.dirname, '../..');
export const readCapacityGitState = async () => {
  try {
    const options = {
      cwd: capacityRepositoryRoot,
      env: {
        ...process.env,
        ...(process.platform === 'darwin'
          ? { DEVELOPER_DIR: '/Library/Developer/CommandLineTools' }
          : {}),
      },
      timeout: 5000,
    };
    const [revision, status] = await Promise.all([
      execute('git', ['rev-parse', 'HEAD'], options),
      execute(
        'git',
        ['status', '--porcelain', '--untracked-files=normal'],
        options,
      ),
    ]);
    const repoSha = revision.stdout.trim();
    if (!/^[a-f0-9]{40}$/u.test(repoSha))
      return failCapacity('LIVE_CAPACITY_REVISION_UNAVAILABLE');
    return { repoSha, dirty: status.stdout.trim() !== '' };
  } catch {
    return failCapacity('LIVE_CAPACITY_REVISION_UNAVAILABLE');
  }
};

export const preflightLocalCapacity = async (
  config: CapacityConfig,
  secrets: CapacitySecrets,
  database: LocalDatabase,
  signal: AbortSignal,
): Promise<string | null> => {
  requireLocalExecution(config);
  const [row] = await database.rows(
    'select current_database() as database_name',
    signal,
  );
  if (row?.database_name !== 'postgres')
    return failCapacity('LIVE_CAPACITY_LOCAL_DATABASE_UNAVAILABLE');
  const health = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
    headers: { apikey: secrets.anonKey },
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!health.ok) return failCapacity('LIVE_CAPACITY_LOCAL_AUTH_UNAVAILABLE');
  if (config.profile === 'protocol') return null;
  const response = await fetch(`${config.appUrl}/admin-release.json`, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  const parsed = z
    .object({
      environment: z.enum(['local', 'development']),
      revision: z.string(),
    })
    .safeParse(await response.json().catch(() => null));
  if (
    !response.ok ||
    !parsed.success ||
    parsed.data.revision !== config.expectedRevision
  )
    return failCapacity('LIVE_CAPACITY_LOCAL_WEB_REVISION_UNPROVEN');
  return parsed.data.revision;
};
