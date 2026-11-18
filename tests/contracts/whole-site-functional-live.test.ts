import { createLiveDiagnostics } from '../../scripts/concurrency/functional-live-diagnostics';
import type { PrivateJournal } from '../../scripts/concurrency/private-journal';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LiveSessionState } from '../../src/features/live/types';
import type { Database } from '../../src/types/database';
import { createSdkLiveActor } from '../../scripts/live/capacity-actors';
import { createCapacityReceipt } from '../../scripts/live/capacity-receipt';
import {
  selectFunctionalLiveTemplate,
  bindFunctionalLiveSession,
  assertFunctionalLiveCount,
} from '../../scripts/concurrency/teacher-live';
import { liveFunctionalConfig } from '../../scripts/concurrency/teacher-live-bridge';
import { createFunctionalClient } from '../../scripts/concurrency/local-runtime';
import {
  syntheticScope,
  syntheticSecrets,
} from './helpers/whole-site-functional';
const credentials = {
  account: 'synthetic',
  email: 'synthetic@colorplay.test',
  password: 'synthetic',
  displayName: '合成',
  role: 'teacher' as const,
};
const setup = () => {
  const scope = syntheticScope();
  const config = liveFunctionalConfig(scope);
  const evidence = createCapacityReceipt(config, scope.expectedRevision)
    .actors[0];
  if (!evidence) throw new Error('SYNTHETIC_MISSING');
  return { scope, config, evidence };
};
describe('functional Live preserves its existing actor lifecycle', () => {
  it('does not substitute a Quiz template10 count for the actual Live20 session', () => {
    const option = { sectionId: 's', quizTemplateId: 'a' };
    expect(selectFunctionalLiveTemplate([option])).toEqual(option);
  });
  it.each([
    'valid20',
    'session',
    'host',
    'classroom',
    'activity',
    'owner',
    'section',
    'template',
    'count',
    'noninteger',
    'too-many',
    'error',
    'not-host',
    'aborted',
  ])('binds actual Live count and rejects wrong scope: %s', async (mode) => {
    const session = {
      id: 'live-session',
      host_teacher_id: 'teacher',
      classroom_id: 'classroom',
      live_activity_id: 'activity',
      question_count: 20,
    };
    const activity = {
      id: 'activity',
      owner_teacher_id: 'teacher',
      section_id: 'section',
      quiz_template_id: 'template',
    };
    if (mode === 'session') session.id = 'other';
    if (mode === 'host') session.host_teacher_id = 'other';
    if (mode === 'classroom') session.classroom_id = 'other';
    if (mode === 'activity') activity.id = 'other';
    if (mode === 'owner') activity.owner_teacher_id = 'other';
    if (mode === 'section') activity.section_id = 'other';
    if (mode === 'template') activity.quiz_template_id = 'other';
    if (mode === 'count') session.question_count = 10;
    if (mode === 'noninteger') session.question_count = 19.5;
    if (mode === 'too-many') session.question_count = 21;
    const signal = new AbortController();
    if (mode === 'aborted') signal.abort();
    const retry = vi.fn().mockReturnThis();
    const client = {
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: { id: 'teacher' } }, error: null }),
      },
      from: (table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        retry,
        single: () =>
          Promise.resolve({
            data: table === 'live_sessions' ? session : activity,
            error: mode === 'error' ? { message: 'SYNTHETIC_PRIVATE' } : null,
          }),
      }),
    } as unknown as SupabaseClient<Database>;
    const lobby = {
      sessionId: 'live-session',
      questionCount: 20,
      isHost: mode !== 'not-host',
    } as LiveSessionState;
    const pending = bindFunctionalLiveSession(
      client,
      {
        sessionId: 'live-session',
        classroomId: 'classroom',
        sectionId: 'section',
        quizTemplateId: 'template',
        teacherId: 'teacher',
      },
      lobby,
      signal.signal,
    );
    if (mode === 'valid20') {
      expect(await pending).toBe(20);
      expect(retry).toHaveBeenCalledWith(false);
    } else await expect(pending).rejects.toThrow('FUNCTIONAL_OPERATION_FAILED');
  });
  it('requires a stable authoritative count through question, feedback and completion snapshots', () => {
    expect(() =>
      assertFunctionalLiveCount({ questionCount: 10 } as LiveSessionState, 20),
    ).toThrow('FUNCTIONAL_OPERATION_FAILED');
    expect(() =>
      assertFunctionalLiveCount({ questionCount: 20 } as LiveSessionState, 20),
    ).not.toThrow();
  });
  it('passes the owned combined signal and counts actual injected client fetches', async () => {
    const h = setup();
    const run = new AbortController();
    let client: SupabaseClient<Database> | null = null;
    let ownedSignal: AbortSignal | null = null;
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({ id: '10000000-0000-4000-8000-000000000001' }),
      ),
    );
    const factory = vi.fn((signal: AbortSignal, onRequest: () => void) => {
      ownedSignal = signal;
      client = createFunctionalClient(
        h.scope,
        syntheticSecrets.anonKey,
        signal,
        (input, init) => {
          onRequest();
          return fetcher(input, init);
        },
      );
      return client;
    });
    const base = createSdkLiveActor(
      h.config,
      { ...syntheticSecrets, teacherPassword: 'synthetic' },
      credentials,
      run.signal,
      h.evidence,
      factory,
    );
    const active = client as SupabaseClient<Database> | null;
    if (!active) throw new Error('SYNTHETIC_MISSING');
    await active.auth.getUser('SYNTHETIC_TOKEN');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(h.evidence.requests).toBe(1);
    expect(factory).toHaveBeenCalledTimes(1);
    await base.actor.close();
    const signal = ownedSignal as AbortSignal | null;
    expect(signal?.aborted).toBe(true);
    expect(run.signal.aborted).toBe(false);
    await active.auth.getUser('SYNTHETIC_TOKEN');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(h.evidence.requests).toBe(1);
    expect(JSON.stringify(h.evidence)).not.toContain('SYNTHETIC_TOKEN');
  });
  it('aborts the injected transport on a run abort without borrowing another actor signal', async () => {
    const h = setup();
    const run = new AbortController();
    let signal: AbortSignal | null = null;
    const base = createSdkLiveActor(
      h.config,
      { ...syntheticSecrets, teacherPassword: 'synthetic' },
      credentials,
      run.signal,
      h.evidence,
      (owned, count) => {
        signal = owned;
        return createFunctionalClient(
          h.scope,
          syntheticSecrets.anonKey,
          owned,
          (input, init) => {
            count();
            return fetch(input, init);
          },
        );
      },
    );
    run.abort();
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    await base.actor.close();
    expect(h.evidence.requests).toBe(0);
  });
  it.each(['hosted', 'foreign-url'] as const)(
    'rejects %s before invoking an injected factory',
    (target) => {
      const h = setup();
      const factory = vi.fn(() => {
        throw new Error('SYNTHETIC_FACTORY_MUST_NOT_RUN');
      });
      const config =
        target === 'hosted'
          ? { ...h.config, environment: 'staging' as const }
          : { ...h.config, supabaseUrl: 'https://remote.invalid' };
      expect(() =>
        createSdkLiveActor(
          config,
          { ...syntheticSecrets, teacherPassword: 'synthetic' },
          credentials,
          new AbortController().signal,
          h.evidence,
          factory,
        ),
      ).toThrow();
      expect(factory).not.toHaveBeenCalled();
    },
  );
  it('retains the old default client construction when no factory is supplied', async () => {
    const h = setup();
    const base = createSdkLiveActor(
      h.config,
      { ...syntheticSecrets, teacherPassword: 'synthetic' },
      credentials,
      new AbortController().signal,
      h.evidence,
    );
    await base.actor.close();
    expect(h.evidence.requests).toBe(0);
  });
});

it('unwrapped failure cannot blame an already returned diagnostic step', async () => {
  const writes: unknown[] = [];
  const diagnostic = createLiveDiagnostics(syntheticScope(), [], {
    write: (_name: string, value: unknown) => {
      writes.push(value);
      return Promise.resolve();
    },
  } as PrivateJournal);
  await diagnostic.step('REPORT_RPC', () => Promise.resolve(42));
  diagnostic.operationFailure(new Error('SYNTHETIC_PRIVATE'));
  await diagnostic.finish();
  expect(writes[0]).toMatchObject({
    operationFailure: { stage: 'UNOBSERVED' },
  });
});
