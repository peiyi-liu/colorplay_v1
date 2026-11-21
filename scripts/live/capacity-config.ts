import { randomBytes } from 'node:crypto';

import { z } from 'zod';

export type CapacityProfile = 'protocol' | 'browser' | 'hybrid';
export interface CapacityConfig {
  environment: 'local' | 'staging';
  profile: CapacityProfile;
  totalActors: number;
  browserParticipants: number;
  runId: string;
  expectedRevision: string;
  appUrl: string;
  supabaseUrl: string;
  databaseUrl: string | null;
  resultPath: string;
  previousReceiptPath: string | null;
  dryRun: boolean;
}
export class LiveCapacityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'LiveCapacityError';
  }
}
export const failCapacity = (code: string): never => {
  throw new LiveCapacityError(code);
};
const SHA = /^[a-f0-9]{40}$/u;
const RUN = /^c40-[a-z0-9](?:[a-z0-9-]{0,29}[a-z0-9])?$/u;
export const STAGING_APP = 'https://staging.colorplayapp.com';
export const STAGING_SUPABASE = 'https://onkxnkzeixpezetkmocf.supabase.co';
const OPTIONS = new Set([
  'environment',
  'profile',
  'actors',
  'run-id',
  'revision',
  'url',
  'supabase-url',
  'database-url',
  'previous-receipt',
]);

export const assertLoopbackUrl = (value: string, database = false): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return failCapacity('LIVE_CAPACITY_TARGET_INVALID');
  }
  const protocol = database
    ? url.protocol === 'postgresql:' || url.protocol === 'postgres:'
    : url.protocol === 'http:';
  if (
    !protocol ||
    !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
    url.port === '' ||
    url.search ||
    url.hash ||
    (!database && (url.username || url.password || url.pathname !== '/')) ||
    (database && (!url.username || url.pathname !== '/postgres'))
  )
    return failCapacity('LIVE_CAPACITY_TARGET_INVALID');
  return url;
};

export const capacityProfileCounts = (
  config: Pick<
    CapacityConfig,
    'profile' | 'totalActors' | 'browserParticipants'
  >,
) => {
  const browserContexts =
    config.profile === 'protocol' ? 0 : 1 + config.browserParticipants;
  return {
    participants: config.totalActors - 1,
    browserContexts,
    sdkParticipants: config.totalActors - 1 - config.browserParticipants,
    sdkActors: config.totalActors - browserContexts,
  };
};

export const parseCapacityConfig = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): CapacityConfig => {
  const values = new Map<string, string>();
  let dryRun = false;
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--dry-run') {
      if (dryRun) return failCapacity('LIVE_CAPACITY_ARGUMENT_INVALID');
      dryRun = true;
      continue;
    }
    const key = option?.startsWith('--') ? option.slice(2) : '';
    const value = args[index + 1];
    if (
      !OPTIONS.has(key) ||
      !value ||
      value.startsWith('--') ||
      values.has(key)
    )
      return failCapacity('LIVE_CAPACITY_ARGUMENT_INVALID');
    values.set(key, value);
    index += 1;
  }
  const environment = values.get('environment') ?? 'local';
  const profile = values.get('profile') ?? 'protocol';
  const totalActors = Number(values.get('actors') ?? '3');
  if (
    (environment !== 'local' && environment !== 'staging') ||
    !['protocol', 'browser', 'hybrid'].includes(profile) ||
    ![3, 10, 20, 40].includes(totalActors) ||
    (profile === 'browser' && totalActors !== 3)
  )
    return failCapacity('LIVE_CAPACITY_ARGUMENT_INVALID');
  const suppliedRunId = values.get('run-id') ?? env.COLORPLAY_LIVE_RUN_ID;
  const runId =
    suppliedRunId ??
    `c40-ld-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const expectedRevision =
    values.get('revision') ?? env.COLORPLAY_LIVE_EXPECTED_REVISION ?? '';
  if (!RUN.test(runId) || !SHA.test(expectedRevision))
    return failCapacity('LIVE_CAPACITY_SCOPE_INVALID');
  const appUrl =
    values.get('url') ??
    env.COLORPLAY_LIVE_APP_URL ??
    (environment === 'local' ? 'http://127.0.0.1:5173' : STAGING_APP);
  const supabaseUrl =
    values.get('supabase-url') ??
    env.COLORPLAY_LIVE_SUPABASE_URL ??
    (environment === 'local' ? 'http://127.0.0.1:54321' : STAGING_SUPABASE);
  const databaseUrl =
    values.get('database-url') ?? env.COLORPLAY_LIVE_DATABASE_URL ?? null;
  if (environment === 'staging') {
    if (
      !dryRun ||
      !suppliedRunId ||
      env.COLORPLAY_LIVE_CONFIRM !== 'STAGING_LOW_DEVICE_DRY_RUN_ONLY' ||
      appUrl !== STAGING_APP ||
      supabaseUrl !== STAGING_SUPABASE ||
      databaseUrl !== null
    )
      return failCapacity('LIVE_CAPACITY_HOSTED_NOT_AUTHORIZED');
  } else {
    assertLoopbackUrl(appUrl);
    assertLoopbackUrl(supabaseUrl);
    if (databaseUrl !== null) assertLoopbackUrl(databaseUrl, true);
  }
  return {
    environment,
    profile: profile as CapacityProfile,
    totalActors,
    browserParticipants: profile === 'protocol' ? 0 : 2,
    runId,
    expectedRevision,
    appUrl,
    supabaseUrl,
    databaseUrl,
    resultPath: `/private/tmp/colorplay-low-device-${runId}-${profile}-${String(totalActors)}.json`,
    previousReceiptPath: values.get('previous-receipt') ?? null,
    dryRun,
  };
};

export const requireLocalExecution = (config: CapacityConfig) => {
  if (config.environment !== 'local')
    return failCapacity('LIVE_CAPACITY_HOSTED_NOT_AUTHORIZED');
  assertLoopbackUrl(config.supabaseUrl);
  assertLoopbackUrl(config.appUrl);
  if (config.databaseUrl) assertLoopbackUrl(config.databaseUrl, true);
};

const previousSchema = z.object({
  environment: z.literal('local'),
  profile: z.enum(['protocol', 'browser', 'hybrid']),
  totalActors: z.number(),
  repoSha: z.string(),
  result: z.literal('PASS'),
  generatorHealth: z.object({ limited: z.literal(false) }),
  cleanup: z.object({ status: z.literal('verified') }),
});
export const assertCapacityEscalation = (
  config: CapacityConfig,
  previous: unknown,
) => {
  if (config.totalActors === 3) return;
  const parsed = previousSchema.safeParse(previous);
  const required =
    config.totalActors === 10 ? 3 : config.totalActors === 20 ? 10 : 20;
  if (
    !parsed.success ||
    parsed.data.profile !== config.profile ||
    parsed.data.totalActors !== required ||
    parsed.data.repoSha !== config.expectedRevision
  )
    return failCapacity('LIVE_CAPACITY_PREVIOUS_LEVEL_REQUIRED');
};
