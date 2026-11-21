import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../src/types/database';
import {
  failCapacity,
  requireLocalExecution,
  type CapacityConfig,
} from './capacity-config';

export interface CapacitySecrets {
  anonKey: string;
  serviceKey: string;
  teacherPassword: string;
}
const keyRole = (value: string): unknown => {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    return typeof parsed === 'object' && parsed !== null && 'role' in parsed
      ? parsed.role
      : null;
  } catch {
    return null;
  }
};

export const readLocalSecrets = (env: NodeJS.ProcessEnv): CapacitySecrets => {
  const anonKey = env.COLORPLAY_LIVE_ANON_KEY;
  const serviceKey = env.COLORPLAY_LIVE_SERVICE_KEY;
  const teacherPassword = env.COLORPLAY_LIVE_TEACHER_PASSWORD;
  if (
    !anonKey ||
    !serviceKey ||
    !teacherPassword ||
    anonKey === serviceKey ||
    (!anonKey.startsWith('sb_publishable_') && keyRole(anonKey) !== 'anon') ||
    (!serviceKey.startsWith('sb_secret_') &&
      keyRole(serviceKey) !== 'service_role') ||
    env.COLORPLAY_LIVE_CONFIRM !== 'LOCAL_LOW_DEVICE_ONLY'
  )
    return failCapacity('LIVE_CAPACITY_LOCAL_CREDENTIALS_REQUIRED');
  return { anonKey, serviceKey, teacherPassword };
};

export const createLocalClient = (
  config: CapacityConfig,
  key: string,
  signal: AbortSignal,
  onRequest: () => void = () => undefined,
) => {
  requireLocalExecution(config);
  return createClient<Database>(config.supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 10 } },
    global: {
      fetch: (input, init) => {
        const url = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        if (url.origin !== new URL(config.supabaseUrl).origin)
          return Promise.reject(new Error('LIVE_CAPACITY_TARGET_INVALID'));
        onRequest();
        return fetch(input, {
          ...init,
          redirect: 'error',
          signal: init?.signal
            ? AbortSignal.any([
                signal,
                init.signal,
                AbortSignal.timeout(20_000),
              ])
            : AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        });
      },
    },
  });
};
