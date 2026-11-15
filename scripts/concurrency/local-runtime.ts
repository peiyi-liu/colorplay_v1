import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../../src/types/database';
import { readCapacityGitState } from '../live/capacity-preflight';
import {
  fail,
  parseFunctionalScope,
  safely,
  type FunctionalScope,
} from './config';

export interface FunctionalSecrets {
  anonKey: string;
  serviceKey: string;
}
export const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const scopedFetch = (
  scope: FunctionalScope,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): typeof fetch => {
  parseFunctionalScope(scope);
  const allowed = [scope.appUrl, scope.supabaseUrl, scope.mailpitUrl].map(
    (value) => new URL(value).origin,
  );
  return (input, init) => {
    if (signal.aborted) return Promise.reject(new Error('FUNCTIONAL_ABORTED'));
    const target = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (!allowed.includes(target.origin))
      return Promise.reject(new Error('FUNCTIONAL_SCOPE_INVALID'));
    return transport(input, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.any([
        signal,
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(15_000),
      ]),
    });
  };
};
export const createFunctionalClient = (
  scope: FunctionalScope,
  key: string,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) =>
  createClient<Database>(scope.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: `${scope.runId}-${randomUUID()}`,
    },
    global: { fetch: scopedFetch(scope, signal, transport) },
  });
const keyRole = (key: string): unknown => {
  try {
    const data: unknown = JSON.parse(
      Buffer.from(key.split('.')[1] ?? '', 'base64url').toString(),
    );
    return z.object({ role: z.enum(['anon', 'service_role']) }).parse(data)
      .role;
  } catch {
    return null;
  }
};
const readyScopes = new WeakSet<object>();
export const requireFunctionalReady = (scope: FunctionalScope) => {
  if (!readyScopes.has(scope)) return fail('FUNCTIONAL_PREFLIGHT_FAILED');
};
const counts = z.strictObject({
  migrations: z.literal(120),
  publicTables: z.literal(71),
  publicWithoutRls: z.literal(0),
  auth: z.literal(0),
  profiles: z.literal(0),
  classrooms: z.literal(0),
  xp: z.literal(0),
  wallet: z.literal(0),
  mediaRuns: z.literal(0),
  mediaAssets: z.literal(0),
});
export interface FunctionalPreflightPorts {
  git(): Promise<{ repoSha: string; dirty: boolean }>;
  baseline(): Promise<unknown>;
  databaseIdentity(): Promise<string>;
  attestation(): Promise<string>;
  fetch: typeof fetch;
}
// The root loader supplies a fresh read-only DB attestation; secrets never enter
// this public output. All gates precede Auth creation / any fixture mutation.
export const preflightFunctional = async (
  input: unknown,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
  ports: Omit<FunctionalPreflightPorts, 'git' | 'fetch'> &
    Partial<Pick<FunctionalPreflightPorts, 'git' | 'fetch'>>,
): Promise<FunctionalScope> =>
  safely(async () => {
    const scope = parseFunctionalScope(input);
    if (
      sha256(secrets.anonKey) !== scope.anonKeySha256 ||
      sha256(secrets.serviceKey) !== scope.serviceKeySha256 ||
      keyRole(secrets.anonKey) !== 'anon' ||
      keyRole(secrets.serviceKey) !== 'service_role'
    )
      return fail('FUNCTIONAL_PREFLIGHT_FAILED');
    const state = await (ports.git ?? readCapacityGitState)();
    if (state.dirty || state.repoSha !== scope.expectedRevision)
      return fail('FUNCTIONAL_PREFLIGHT_FAILED');
    const attestationText = await ports.attestation();
    if (
      sha256(attestationText) !== scope.runtimeAttestationSha256 ||
      sha256(await ports.databaseIdentity()) !== scope.databaseIdentitySha256
    )
      return fail('FUNCTIONAL_PREFLIGHT_FAILED');
    z.object({
      projectId: z.literal(scope.projectId),
      appUrl: z.literal(scope.appUrl),
      supabaseUrl: z.literal(scope.supabaseUrl),
      mailpitUrl: z.literal(scope.mailpitUrl),
      databaseIdentitySha256: z.literal(scope.databaseIdentitySha256),
      anonKeySha256: z.literal(scope.anonKeySha256),
      serviceKeySha256: z.literal(scope.serviceKeySha256),
    }).parse(JSON.parse(attestationText));
    counts.parse(await ports.baseline());
    const response = await scopedFetch(
      scope,
      signal,
      ports.fetch,
    )(`${scope.appUrl}/admin-release.json`, { cache: 'no-store' });
    const marker = z
      .object({
        environment: z.enum(['local', 'development']),
        revision: z.literal(scope.expectedRevision),
      })
      .parse(await response.json());
    if (!response.ok || marker.revision !== scope.expectedRevision)
      return fail('FUNCTIONAL_PREFLIGHT_FAILED');
    signal.throwIfAborted();
    readyScopes.add(scope);
    return Object.freeze(scope);
  }, 'FUNCTIONAL_PREFLIGHT_FAILED');
