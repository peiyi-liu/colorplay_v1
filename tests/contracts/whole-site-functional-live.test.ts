import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { createSdkLiveActor } from '../../scripts/live/capacity-actors';
import { createCapacityReceipt } from '../../scripts/live/capacity-receipt';
import { selectFunctionalLiveTemplate } from '../../scripts/concurrency/teacher-live';
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
  it('uses the minimum published eligible real question count, never a fabricated three-round finalize', () => {
    const options = [
      { sectionId: 's', quizTemplateId: 'a' },
      { sectionId: 't', quizTemplateId: 'b' },
    ];
    expect(
      selectFunctionalLiveTemplate(options, [
        { id: 'a', question_count: 10 },
        { id: 'b', question_count: 3 },
      ]),
    ).toMatchObject({ quizTemplateId: 'b', questionCount: 3 });
    expect(
      selectFunctionalLiveTemplate(options, [
        { id: 'a', question_count: 10 },
        { id: 'b', question_count: 21 },
      ]),
    ).toMatchObject({ questionCount: 10 });
    expect(() =>
      selectFunctionalLiveTemplate(options, [{ id: 'a', question_count: 21 }]),
    ).toThrow('FUNCTIONAL_OPERATION_FAILED');
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
