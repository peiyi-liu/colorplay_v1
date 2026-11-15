import type { Database } from '../../src/types/database';
import { createClient } from '@supabase/supabase-js';

import { createAuthLoginAdmin } from '../../supabase/functions/auth-login/client-factory';
import { createAuthLoginHandler } from '../../supabase/functions/auth-login/handler';

// Use the real generated profile schema without instantiating unrelated browser tables.
interface ProfileDatabase {
  public: {
    Tables: Pick<Database['public']['Tables'], 'profiles'>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Database['public']['Enums'];
    CompositeTypes: Record<string, never>;
  };
}
export type Hop = 'profile' | 'user' | 'grant';
type Role = 'student' | 'teacher' | 'admin';
export const apiUrl = 'http://127.0.0.1:54321';
export const secretMarker = 'SYNTHETIC_PROVIDER_DETAIL_MARKER';
const userId = 'ca000000-0000-4000-8000-000000000001';
export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
export const loginRequest = (portal = 'student', signal?: AbortSignal) =>
  new Request('http://127.0.0.1/auth-login', {
    method: 'POST',
    body: JSON.stringify({
      account: 'synthetic01',
      password: 'synthetic-password',
      portal,
    }),
    ...(signal ? { signal } : {}),
  });
export interface Scenario {
  role?: Role;
  unknownAccount?: boolean;
  statuses?: Partial<Record<Hop, number>>;
  bodies?: Partial<Record<Hop, unknown>>;
  reject?: Hop;
  stall?: Hop;
  stallBody?: Hop;
  delays?: Partial<Record<Hop, number>>;
  ignoreAbort?: boolean;
  headers?: Partial<Record<Hop, Record<string, string>>>;
  grantRetryAfter?: readonly (string | undefined)[];
}
let clientIndex = 0;
export const setupHandler = (scenario: Scenario = {}) => {
  const calls: {
    hop: Hop;
    signal: AbortSignal | undefined;
    projectionMatches: boolean;
    accountFilterMatches: boolean;
  }[] = [];
  const releases = new Set<() => void>();
  let bodyCancellations = 0;
  let activeFetchListeners = 0;
  let grantReplyIndex = 0;
  const reply = (hop: Hop): Response => {
    const status = scenario.statuses?.[hop] ?? 200;
    const success = {
      profile: scenario.unknownAccount
        ? []
        : [{ id: userId, role: scenario.role ?? 'student' }],
      user: { user: { id: userId, email: 'synthetic@invalid.test' } },
      grant: {
        access_token: 'SYNTHETIC_ACCESS',
        refresh_token: 'SYNTHETIC_REFRESH',
      },
    };
    const body =
      scenario.bodies && Object.hasOwn(scenario.bodies, hop)
        ? scenario.bodies[hop]
        : status >= 400
          ? { message: secretMarker, code: 'synthetic_failure' }
          : success[hop];
    const headers = new Headers(scenario.headers?.[hop]);
    if (hop === 'grant' && scenario.grantRetryAfter) {
      const value = scenario.grantRetryAfter[grantReplyIndex++];
      if (value !== undefined) headers.set('Retry-After', value);
      else headers.delete('Retry-After');
    }
    if (scenario.stallBody !== hop) {
      const response = jsonResponse(body, status);
      headers.forEach((value, key) => {
        response.headers.set(key, value);
      });
      return response;
    }
    let cancelled = false;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          releases.add(() => {
            if (cancelled) return;
            controller.enqueue(new TextEncoder().encode(JSON.stringify(body)));
            controller.close();
          });
        },
        cancel() {
          cancelled = true;
          bodyCancellations += 1;
        },
      }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  };
  const transport: typeof fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const hop: Hop = url.includes('/rest/v1/profiles')
      ? 'profile'
      : url.includes('/auth/v1/admin/users/')
        ? 'user'
        : url.includes('/auth/v1/token?grant_type=password')
          ? 'grant'
          : (() => {
              throw new Error('SYNTHETIC_ENDPOINT_UNEXPECTED');
            })();
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    calls.push({
      hop,
      signal: signal ?? undefined,
      projectionMatches:
        hop === 'profile' &&
        new URL(url).searchParams.get('select') === 'id,role',
      accountFilterMatches:
        hop === 'profile' &&
        new URL(url).searchParams.get('login_account') === 'eq.synthetic01',
    });
    if (scenario.reject === hop) return Promise.reject(new Error(secretMarker));
    if (scenario.stall !== hop && !scenario.delays?.[hop])
      return Promise.resolve(reply(hop));
    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
        releases.delete(finish);
        if (signal && !scenario.ignoreAbort) {
          signal.removeEventListener('abort', abort);
          activeFetchListeners -= 1;
        }
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(reply(hop));
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('SYNTHETIC_ABORT'));
      };
      if (signal && !scenario.ignoreAbort) {
        signal.addEventListener('abort', abort, { once: true });
        activeFetchListeners += 1;
      }
      releases.add(finish);
      if (signal?.aborted && !scenario.ignoreAbort) abort();
      else if (scenario.stall !== hop)
        timer = setTimeout(finish, scenario.delays?.[hop]);
    });
  };
  const handler = createAuthLoginHandler({
    supabaseUrl: apiUrl,
    publishableKey: 'synthetic-public',
    fetch: transport,
    now: () => Date.now(),
    createAdmin: (fetcher) => {
      const client = createClient<ProfileDatabase>(apiUrl, 'synthetic-admin', {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `synthetic-server-${String(clientIndex++)}`,
        },
        global: { fetch: fetcher },
      });
      return createAuthLoginAdmin(
        client.from('profiles').select('id, role'),
        (id) => client.auth.admin.getUserById(id),
      );
    },
  });
  return {
    handler,
    calls,
    release: () => {
      for (const release of [...releases]) release();
    },
    bodyCancellations: () => bodyCancellations,
    activeFetchListeners: () => activeFetchListeners,
  };
};
