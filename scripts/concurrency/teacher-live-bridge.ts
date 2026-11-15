import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { createSdkLiveActor } from '../live/capacity-actors';
import { parseCapacityConfig } from '../live/capacity-config';
import type { ActorEvidence } from '../live/capacity-receipt';
import { isLiveBroadcast } from '../live/capacity-live-broadcast';
import {
  attachDiagnostics,
  sessionTokensFromPage,
} from '../../tests/e2e/helpers/staging-capacity-browser';
import {
  createFunctionalClient,
  type FunctionalSecrets,
} from './local-runtime';
import type { FunctionalScope } from './config';
import { fail } from './config';
import type { FunctionalIdentity } from './owned-fixtures';
export const liveFunctionalConfig = (scope: FunctionalScope) =>
  parseCapacityConfig(
    [
      '--environment',
      'local',
      '--profile',
      'browser',
      '--actors',
      '3',
      '--run-id',
      `c40-ws-${scope.runId.slice(-12)}`,
      '--revision',
      scope.expectedRevision,
      '--url',
      scope.appUrl,
      '--supabase-url',
      scope.supabaseUrl,
      '--database-url',
      scope.databaseUrl,
    ],
    { COLORPLAY_LIVE_CONFIRM: 'LOCAL_LOW_DEVICE_ONLY' },
  );
export const liveFunctionalActor = (
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  identity: FunctionalIdentity,
  signal: AbortSignal,
  index: number,
) => {
  const evidence: ActorEvidence = {
    index,
    role: identity.label === 'T1' ? 'host' : 'participant',
    transport: 'sdk',
    status: 'not_run',
    requests: 'unavailable',
    broadcasts: 'unavailable',
    timings: [],
    uiProof: 'not_applicable',
  };
  const base = createSdkLiveActor(
    liveFunctionalConfig(scope),
    { ...secrets, teacherPassword: identity.password },
    {
      account: identity.account,
      email: identity.email,
      password: identity.password,
      displayName: identity.displayName,
      role: identity.label === 'T1' ? 'teacher' : 'student',
    },
    signal,
    evidence,
    (ownedSignal, onRequest) =>
      createFunctionalClient(
        scope,
        secrets.anonKey,
        ownedSignal,
        (input, init) => {
          onRequest();
          return fetch(input, init);
        },
      ),
  );
  return { ...base, evidence };
};
export const restoreFunctionalActor = async (
  base: ReturnType<typeof liveFunctionalActor>,
  source: SupabaseClient<Database> | Page,
  scope: FunctionalScope,
  identity: FunctionalIdentity,
) => {
  const tokens =
    'evaluate' in source
      ? await sessionTokensFromPage(source, scope.supabaseUrl)
      : (await source.auth.getSession()).data.session;
  if (!tokens) return fail('FUNCTIONAL_AUTH_FAILED');
  await base.restoreSession(tokens);
  if ((await base.actor.identity()).userId !== identity.userId)
    return fail('FUNCTIONAL_AUTH_FAILED');
};
export const bindFunctionalLivePage = async (
  page: Page,
  base: ReturnType<typeof liveFunctionalActor>,
) => {
  const diagnostics = await attachDiagnostics(page);
  const listener = (socket: import('@playwright/test').WebSocket) => {
    socket.on('framereceived', ({ payload }) => {
      if (isLiveBroadcast(payload)) base.broadcast();
    });
  };
  page.on('websocket', listener);
  return { diagnostics, dispose: () => page.off('websocket', listener) };
};
