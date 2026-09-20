import { createHash, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../src/types/database';

const STAGING_PROJECT_REF = 'onkxnkzeixpezetkmocf';
const STAGING_SUPABASE_URL = 'https://onkxnkzeixpezetkmocf.supabase.co';
const STAGING_APP_URL = 'https://staging.colorplayapp.com';
const CONFIRMATION = 'STAGING_1_PLUS_39_ONLY';
const RUN_ID_PATTERN = /^c40-[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u;
const SHA_PATTERN = /^[a-f0-9]{40}$/u;

export type CapacityConfig = Readonly<{
  accessToken: string;
  anonKey: string;
  appUrl: typeof STAGING_APP_URL;
  expectedSha: string;
  projectRef: typeof STAGING_PROJECT_REF;
  resultPath: string;
  runId: string;
  secretKey: string;
  supabaseUrl: typeof STAGING_SUPABASE_URL;
}>;

export type CapacityCredentials = Readonly<{
  account: string;
  displayName: string;
  email: string;
  password: string;
  role: 'student' | 'teacher';
}>;

export type CapacityAccount = CapacityCredentials & Readonly<{ id: string }>;

export type SessionTokens = Readonly<{
  access_token: string;
  refresh_token: string;
}>;

export interface CreatedResources {
  activityId?: string;
  classroomId?: string;
  classroomName?: string;
  sessionId?: string;
}

type QueryRow = Record<string, unknown>;

export class CapacityHarnessError extends Error {
  readonly publicCode: string;

  constructor(publicCode: string) {
    super(publicCode);
    this.name = 'CapacityHarnessError';
    this.publicCode = publicCode;
  }
}

const fail = (code: string): never => {
  throw new CapacityHarnessError(code);
};

const requireString = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    return fail('CAPACITY_CONFIGURATION_INVALID');
  }
  return value;
};

export function readCapacityConfig(
  env: NodeJS.ProcessEnv = process.env,
): CapacityConfig {
  const projectRef = requireString(env, 'STAGING_SUPABASE_PROJECT_REF');
  const expectedRef = requireString(
    env,
    'STAGING_EXPECTED_SUPABASE_PROJECT_REF',
  );
  const supabaseUrl = requireString(env, 'STAGING_SUPABASE_URL');
  const appUrl = requireString(env, 'COLORPLAY_CAPACITY_APP_URL');
  const confirmation = requireString(env, 'COLORPLAY_CAPACITY_CONFIRM');
  const runId = requireString(env, 'COLORPLAY_CAPACITY_RUN_ID');
  const expectedSha = requireString(env, 'COLORPLAY_CAPACITY_EXPECTED_SHA');
  const namedSecret = env.STAGING_SUPABASE_SECRET_KEY;
  if (namedSecret?.trim() === '') {
    return fail('CAPACITY_CONFIGURATION_INVALID');
  }
  const secretKey =
    namedSecret ?? requireString(env, 'STAGING_SUPABASE_SERVICE_ROLE_KEY');

  if (
    projectRef !== STAGING_PROJECT_REF ||
    expectedRef !== STAGING_PROJECT_REF ||
    supabaseUrl !== STAGING_SUPABASE_URL ||
    appUrl !== STAGING_APP_URL ||
    confirmation !== CONFIRMATION ||
    !RUN_ID_PATTERN.test(runId) ||
    !SHA_PATTERN.test(expectedSha)
  ) {
    return fail('CAPACITY_TARGET_INVALID');
  }

  return {
    accessToken: requireString(env, 'STAGING_SUPABASE_ACCESS_TOKEN'),
    anonKey: requireString(env, 'STAGING_SUPABASE_ANON_KEY'),
    appUrl,
    expectedSha,
    projectRef,
    resultPath: `/private/tmp/colorplay-capacity-${runId}-result.json`,
    runId,
    secretKey,
    supabaseUrl,
  };
}

export function percentile(values: readonly number[], percentileRank: number) {
  if (values.length === 0 || percentileRank < 0 || percentileRank > 100) {
    return fail('CAPACITY_PERCENTILE_INVALID');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.ceil((percentileRank / 100) * sorted.length) - 1,
  );
  return sorted[index] ?? fail('CAPACITY_PERCENTILE_INVALID');
}

export function summarizeDurations(values: readonly number[]) {
  const rounded = values.map((value) => Math.round(value));
  return {
    count: rounded.length,
    max_ms: Math.max(...rounded),
    p50_ms: percentile(rounded, 50),
    p95_ms: percentile(rounded, 95),
  };
}

const shortRunHash = (runId: string) =>
  createHash('sha256').update(runId).digest('hex').slice(0, 8);

export function buildStudentAccountPlan(
  runId: string,
): readonly Omit<CapacityAccount, 'id'>[] {
  if (!RUN_ID_PATTERN.test(runId)) return fail('CAPACITY_RUN_ID_INVALID');
  const prefix = `cp${shortRunHash(runId)}`;
  return Array.from({ length: 39 }, (_unused, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    const account = `${prefix}${suffix}`;
    return {
      account,
      displayName: `容量學生 ${suffix}`,
      email: `${account}@capacity.colorplay.invalid`,
      password: `A${randomBytes(4).toString('hex')}z1`,
      role: 'student' as const,
    };
  });
}

export function createServiceClient(
  config: CapacityConfig,
): SupabaseClient<Database> {
  return createClient<Database>(config.supabaseUrl, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createSessionClient(
  config: CapacityConfig,
): SupabaseClient<Database> {
  return createClient<Database>(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createSyntheticAccounts(
  config: CapacityConfig,
  service: SupabaseClient<Database>,
  runId: string,
  onCreated?: (account: CapacityAccount) => void,
): Promise<readonly CapacityAccount[]> {
  const plan = buildStudentAccountPlan(runId);
  const collisionRows = await findSyntheticAccountRows(config, runId);
  if (collisionRows.length !== 0) {
    fail('CAPACITY_ACCOUNT_COLLISION');
  }
  const created: CapacityAccount[] = [];
  for (const fixture of plan) {
    let createdId: string | undefined;
    try {
      const { data, error } = await service.auth.admin.createUser({
        email: fixture.email,
        email_confirm: true,
        password: fixture.password,
        user_metadata: {
          capacity_account: fixture.account,
          capacity_fixture: 'staging-capacity',
          capacity_run_id: runId,
        },
      });
      if (!error) createdId = data.user.id;
    } catch {
      // An interrupted response can still mean that Auth committed the user.
      // Reconciliation below is the source of truth for both error shapes.
    }
    if (createdId === undefined) {
      const reconciled = await findSyntheticAccountRows(
        config,
        runId,
        fixture.email,
      );
      const row = reconciled[0];
      if (
        reconciled.length !== 1 ||
        typeof row?.id !== 'string' ||
        row.email !== fixture.email ||
        row.capacity_run_id !== runId ||
        row.capacity_account !== fixture.account
      ) {
        throw new CapacityHarnessError('CAPACITY_ACCOUNT_CREATE_FAILED');
      }
      createdId = row.id;
    }
    const account = { ...fixture, id: createdId };
    created.push(account);
    onCreated?.(account);
    const { data: profile, error: profileError } = await service
      .from('profiles')
      .update({
        display_name: fixture.displayName,
        full_name: fixture.displayName,
        login_account: fixture.account,
      })
      .eq('id', createdId)
      .select('full_name, id, login_account, role')
      .single();
    if (
      profileError ||
      profile.id !== createdId ||
      profile.full_name !== fixture.displayName ||
      profile.login_account !== fixture.account ||
      profile.role !== 'student'
    ) {
      fail('CAPACITY_PROFILE_SETUP_FAILED');
    }
  }
  return created;
}

export async function findSyntheticAccountRows(
  config: CapacityConfig,
  runId: string,
  email?: string,
): Promise<readonly QueryRow[]> {
  if (!RUN_ID_PATTERN.test(runId)) return fail('CAPACITY_RUN_ID_INVALID');
  const plannedEmails = buildStudentAccountPlan(runId).map(
    (account) => account.email,
  );
  const emailPredicate = email
    ? `lower(email) = lower(${sqlText(email)})`
    : `lower(email) = any(array[${plannedEmails
        .map((value) => sqlText(value.toLowerCase()))
        .join(', ')}])`;
  const predicate = email
    ? emailPredicate
    : `(${emailPredicate}
         or raw_user_meta_data ->> 'capacity_run_id' = ${sqlText(runId)})`;
  return managementQuery(
    config,
    `select id::text,
            lower(email) as email,
            raw_user_meta_data ->> 'capacity_run_id' as capacity_run_id,
            raw_user_meta_data ->> 'capacity_account' as capacity_account
       from auth.users
      where ${predicate}
      order by id;`,
  );
}

export async function readReleaseMarker(config: CapacityConfig) {
  let response: Response;
  try {
    response = await fetch(`${config.appUrl}/admin-release.json`, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return fail('CAPACITY_RELEASE_MARKER_NETWORK_FAILED');
  }
  const marker: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    typeof marker !== 'object' ||
    marker === null ||
    !('environment' in marker) ||
    marker.environment !== 'staging' ||
    !('revision' in marker) ||
    marker.revision !== config.expectedSha
  ) {
    return fail('CAPACITY_RELEASE_MARKER_INVALID');
  }
  return { environment: 'staging', revision: config.expectedSha } as const;
}

export async function managementQuery(
  config: CapacityConfig,
  query: string,
): Promise<readonly QueryRow[]> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.supabase.com/v1/projects/${config.projectRef}/database/query`,
      {
        body: JSON.stringify({ query }),
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    return fail('CAPACITY_MANAGEMENT_NETWORK_FAILED');
  }
  if (!response.ok) return fail('CAPACITY_MANAGEMENT_QUERY_FAILED');
  const payload: unknown = await response.json().catch(() => null);
  if (!Array.isArray(payload)) return fail('CAPACITY_MANAGEMENT_QUERY_FAILED');
  return payload.filter(
    (row): row is QueryRow =>
      typeof row === 'object' && row !== null && !Array.isArray(row),
  );
}

const sqlText = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export async function writeSafeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export function publicErrorCode(error: unknown): string {
  return error instanceof CapacityHarnessError
    ? error.publicCode
    : 'CAPACITY_HARNESS_FAILED';
}
