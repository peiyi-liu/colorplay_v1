import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { sessionTokensFromPage } from '../../tests/e2e/helpers/staging-capacity-browser';
import { fail, type FunctionalScope } from './config';
import { createFunctionalClient } from './local-runtime';
import { createFunctionalContext } from './browser-runtime';
import { createFunctionalHealth } from './functional-health';
import { captureFunctionalHealth } from './auth-recovery-diagnostics';
import {
  createFunctionalBrowserCloser,
  closeFunctionalClient,
} from './functional-close';
import { createFunctionalAuthHooks } from './functional-auth-observation';
import { createMediaHookBinding } from './media-hook-binding';
import {
  provisionFunctionalIdentities,
  functionalFixturePorts,
  createFunctionalClassrooms,
  joinFunctionalStudents,
  type FunctionalIdentities,
} from './owned-fixtures';
import {
  loginFunctionalApi,
  loginFunctionalPage,
  pageClient,
  registerFunctionalStudent,
  resetFunctionalPassword,
  assertInvalidFunctionalLogin,
  authIsolationJourney,
  controlledRevokedRefresh,
} from './auth-journey';
import { runFunctionalStudent } from './student-journey';
import {
  runTeacherReadJourney,
  teacherCrossTenantDenials,
} from './teacher-journey';
import { runTeacherLiveJourney } from './teacher-live';
import { runAdminJourney, adminRoleDenials } from './admin-journey';
import { runMediaJourney } from './media-journey';
import { requiredProofs, type FunctionalStage } from './functional-receipt';
import type { FunctionalRunPorts } from './functional-runner';
import type { FunctionalRuntime } from './functional-runtime';
export const createActualFunctionalPorts = (
  runtime: FunctionalRuntime,
): FunctionalRunPorts => {
  let ready: FunctionalScope | null = null;
  let phase: FunctionalStage | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let stopping = false;
  const isStopped = (signal?: AbortSignal) => stopping || signal?.aborted;
  let starting: Promise<void> | undefined;
  const browserCloser = createFunctionalBrowserCloser(
    () => browser,
    () => context,
  );
  let identities: FunctionalIdentities | null = null;
  let classes: Awaited<ReturnType<typeof createFunctionalClassrooms>> | null =
    null;
  const clients = new Set<SupabaseClient<Database>>();
  const api = new Map<string, SupabaseClient<Database>>();
  const pages = new Map<string, Page>();
  const health = createFunctionalHealth(
    runtime.scope,
    () => phase,
    runtime.approvedStaticAssetPaths ?? [],
  );
  const authObservations = createFunctionalAuthHooks(
    health,
    async (value) =>
      (await sessionTokensFromPage(value, scope().supabaseUrl)).access_token,
  );
  let binding: ReturnType<typeof createMediaHookBinding> | null = null;
  let s1MemberRef: string | null = null;
  const keep = (client: SupabaseClient<Database>) => {
    clients.add(client);
    return client;
  };
  const client = (label: string) =>
    api.get(label) ?? fail('FUNCTIONAL_AUTH_FAILED');
  const page = (label: string) =>
    pages.get(label) ?? fail('FUNCTIONAL_BROWSER_FAILED');
  const scope = () => ready ?? fail('FUNCTIONAL_PREFLIGHT_FAILED');
  const all = () => identities ?? fail('FUNCTIONAL_FIXTURE_FAILED');
  const classroom = () => classes ?? fail('FUNCTIONAL_FIXTURE_FAILED');
  const newPage = async (label: string) => {
    if (!context || isStopped()) return fail('FUNCTIONAL_BROWSER_FAILED');
    const value = await context.newPage();
    if (isStopped()) {
      await value.close();
      return fail('FUNCTIONAL_ABORTED');
    }
    health.identify(value, label);
    pages.set(label, value);
    return value;
  };
  const launchBrowser = async (signal: AbortSignal) => {
    if (isStopped()) return fail('FUNCTIONAL_ABORTED');
    signal.throwIfAborted();
    browser = await chromium.launch({
      headless: true,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
      },
    });
    if (isStopped(signal)) return fail('FUNCTIONAL_ABORTED');
    binding = createMediaHookBinding(signal);
    const source = binding.hooks;
    context = await createFunctionalContext(browser, scope(), {
      signal,
      beforeSend: async (request) => {
        const result = await source.beforeSend(request);
        if (result === 'drop') health.expectMediaDrop(page('A1'), request);
        return result;
      },
      afterResponse: async (request, response) => {
        const result = await source.afterResponse(request, response);
        if (result === 'drop') health.expectMediaDrop(page('A1'), request);
        return result;
      },
    });
    if (isStopped(signal)) return fail('FUNCTIONAL_ABORTED');
    const original = context.newPage.bind(context);
    const owned = context;
    // This is one owned context, not a global patch. Helpers await observers
    // before navigation; native popups get synchronous PW listeners immediately.
    context.on('page', (value) => {
      void health.attach(owned, value);
    });
    context.newPage = async () => {
      if (isStopped(signal)) return fail('FUNCTIONAL_ABORTED');
      const value = await original();
      if (isStopped(signal)) {
        await value.close();
        return fail('FUNCTIONAL_ABORTED');
      }
      await health.attach(owned, value);
      if (isStopped(signal)) {
        await value.close();
        return fail('FUNCTIONAL_ABORTED');
      }
      return value;
    };
    context.setDefaultTimeout(15_000);
  };
  const startBrowser = (signal: AbortSignal) => {
    if (isStopped() || starting) return fail('FUNCTIONAL_ABORTED');
    starting = launchBrowser(signal);
    void starting.catch(() => undefined);
    return starting;
  };
  const proof = (
    stage: FunctionalStage,
    counts: Record<string, number> = {},
  ) => ({ proofs: [...requiredProofs[stage]], counts });
  const stages: FunctionalRunPorts['stage'] = async (stage, signal) => {
    if (isStopped()) return fail('FUNCTIONAL_ABORTED');
    phase = stage;
    signal.throwIfAborted();
    if (stage === 'canonical_baseline') return proof(stage);
    if (stage === 'fixture_setup') {
      await startBrowser(signal);
      signal.throwIfAborted();
      api.set(
        'service',
        keep(
          createFunctionalClient(scope(), runtime.secrets.serviceKey, signal),
        ),
      );
      identities = await provisionFunctionalIdentities(
        scope(),
        runtime.journal,
        functionalFixturePorts(client('service'), scope()),
        signal,
      );
      return proof(stage, { identities: 5 });
    }
    if (stage === 'classroom_setup') {
      for (const label of ['T1', 'T2', 'S1', 'S2'] as const)
        api.set(
          label,
          keep(
            await loginFunctionalApi(
              scope(),
              runtime.secrets,
              all()[label],
              signal,
            ),
          ),
        );
      classes = await createFunctionalClassrooms(
        client('T1'),
        client('T2'),
        scope(),
        runtime.journal,
      );
      await joinFunctionalStudents(
        scope(),
        [client('S1'), client('S2')],
        classes.c1,
        runtime.journal,
      );
      return proof(stage, { classrooms: 2, students: 2 });
    }
    if (stage === 'registration_recovery') {
      const value = await newPage('R1');
      keep(
        await registerFunctionalStudent(
          value,
          scope(),
          all().R1,
          classroom().c2,
          runtime.secrets,
          runtime.journal,
          signal,
          authObservations,
        ),
      );
      const oldPassword = await resetFunctionalPassword(
        value,
        scope(),
        all().R1,
        runtime.journal,
        signal,
        authObservations,
      );
      await assertInvalidFunctionalLogin(
        scope(),
        all().R1,
        oldPassword,
        runtime.secrets.anonKey,
        signal,
      );
      api.set(
        'R1',
        keep(
          await pageClient(value, scope(), runtime.secrets, signal, all().R1),
        ),
      );
      await runtime.journal.write('r1-active-password-confirmed', {
        identity: all().R1,
      });
      return proof(stage, { identities: 6 });
    }
    if (stage === 'auth_controls') {
      await assertInvalidFunctionalLogin(
        scope(),
        all().S1,
        `${all().S1.password}-invalid`,
        runtime.secrets.anonKey,
        signal,
      );
      if (!context) return fail('FUNCTIONAL_BROWSER_FAILED');
      await authIsolationJourney(
        context,
        scope(),
        runtime.secrets,
        signal,
        all().S1,
        all().S2,
        authObservations,
      );
      return proof(stage);
    }
    if (stage === 'student_s1' || stage === 'student_s2') {
      const label = stage === 'student_s1' ? 'S1' : 'S2';
      const value = await newPage(label);
      await loginFunctionalPage(value, all()[label]);
      const owned = keep(
        await pageClient(value, scope(), runtime.secrets, signal, all()[label]),
      );
      api.set(label, owned);
      const result = await runFunctionalStudent(
        value,
        owned,
        all()[label],
        scope(),
        runtime.journal,
        classroom().c1.classroomId,
      );
      if (
        !result.review.progressConfirmed ||
        result.review.completedCards < 1 ||
        result.quiz.answered < 1 ||
        !result.ledger.ledgerReconciled ||
        !result.achievements.selfXpConfirmed ||
        (label === 'S1'
          ? !result.mastery ||
            !result.purchase?.replayConfirmed ||
            !result.purchase.equipConfirmed
          : result.remediation?.resolvedMistakes !== 2)
      )
        return fail('FUNCTIONAL_STUDENT_FAILED');
      return proof(stage, {
        cards: result.review.completedCards,
        answers: result.quiz.answered,
        correct: result.quiz.correct,
        xp: result.quiz.xp,
        tokens: result.quiz.tokens,
      });
    }
    if (stage === 'teacher_reads') {
      const value = await newPage('T1');
      const result = await runTeacherReadJourney(
        value,
        scope(),
        runtime.secrets,
        signal,
        runtime.journal,
        all().T1,
        all().S1,
        classroom().c1.classroomId,
      );
      s1MemberRef = result.s1MemberRef;
      api.set('T1-ui', keep(result.client));
      return proof(stage, {
        classrooms: 3,
        students: result.evidence.memberCount,
      });
    }
    if (stage === 'tenant_denials') {
      if (!s1MemberRef) return fail('FUNCTIONAL_OPERATION_FAILED');
      await teacherCrossTenantDenials(
        client('T1'),
        client('T2'),
        client('R1'),
        classroom().c1.classroomId,
        classroom().c2.classroomId,
        s1MemberRef,
      );
      return proof(stage);
    }
    if (stage === 'live_finalized') {
      const result = await runTeacherLiveJourney(
        [page('T1'), page('S1'), page('S2')],
        client('T1-ui'),
        client('R1'),
        all(),
        scope(),
        runtime.secrets,
        signal,
        runtime.journal,
        classroom().c1.classroomId,
      );
      if (
        !result.finalized ||
        !result.report ||
        result.answers !== 2 * result.questionCount
      )
        return fail('FUNCTIONAL_OPERATION_FAILED');
      return proof(stage, {
        questions: result.questionCount,
        answers: result.answers,
      });
    }
    if (stage === 'admin_reads') {
      const result = await runAdminJourney(
        await newPage('A1'),
        all().A1,
        scope(),
        runtime.secrets,
        signal,
        runtime.journal,
      );
      api.set('A1', keep(result.client));
      if (result.evidence.reads.length !== 10)
        return fail('FUNCTIONAL_OPERATION_FAILED');
      return proof(stage, { adminReads: result.evidence.reads.length });
    }
    if (stage === 'admin_denials') {
      for (const label of ['S1', 'T1'] as const)
        await adminRoleDenials(
          page(label),
          client(label === 'T1' ? 'T1-ui' : label),
          all()[label],
          scope(),
          runtime.secrets,
          signal,
        );
      return proof(stage);
    }
    if (stage === 'media') {
      if (!binding) return fail('FUNCTIONAL_BROWSER_FAILED');
      const result = await runMediaJourney(
        page('A1'),
        client('A1'),
        all().A1,
        scope(),
        runtime.secrets,
        signal,
        runtime.journal,
        binding,
        (input) => runtime.mediaOracle(input, signal),
      );
      return proof(stage, {
        mediaAssets: result.readback.assets,
        mediaVariants: result.readback.variants,
        drafts: result.retainedDrafts,
      });
    }
    if (stage === 'controlled_refresh') {
      health.expectRefresh(
        page('S2'),
        (await sessionTokensFromPage(page('S2'), scope().supabaseUrl))
          .refresh_token,
      );
      await controlledRevokedRefresh(
        page('S2'),
        scope(),
        all().S2,
        client('service'),
      );
      return proof(stage);
    }
    await health.settle();
    const result = health.snapshot();
    if (
      !result.available ||
      result.expectedMediaDrops !== 4 ||
      result.expectedRefreshRejections !== 1 ||
      result.unexpectedErrors !== 0
    )
      return fail('FUNCTIONAL_BROWSER_FAILED');
    return proof(stage, {
      expectedMediaDrops: result.expectedMediaDrops,
      unexpectedErrors: result.unexpectedErrors,
    });
  };
  let closing:
    Promise<{ resourcesClosed: boolean; settled: boolean }> | undefined;
  return {
    artifactSha256: runtime.artifactSha256,
    mediaOraclePresent: typeof runtime.mediaOracle === 'function',
    journal: runtime.journal,
    preflight: async (signal) => {
      ready = await runtime.preflight(signal);
      return ready;
    },
    canonicalBaseline: runtime.canonicalBaseline,
    stage: stages,
    close: () => {
      stopping = true;
      return (closing ??= (async () => {
        const beforeHealth = captureFunctionalHealth(health);
        const beforeWrite = Promise.resolve().then(() =>
          runtime.journal.write('functional-health-before-close', {
            phase,
            ...beforeHealth,
          }),
        );
        void beforeWrite.catch(() => undefined);
        const outcomes = await Promise.allSettled([
          browserCloser.close(starting),
          ...[...clients].map(closeFunctionalClient),
        ]);
        await health.settle();
        const afterHealth = captureFunctionalHealth(health);
        await health.dispose();
        const diagnostics = await Promise.allSettled([
          beforeWrite,
          runtime.journal.write('functional-cleanup-diagnostic', {
            phase,
            health: afterHealth,
            ...browserCloser.summary(outcomes.slice(1)),
            authObservation: health.authDiagnostics(),
            physicalProcessExit: 'ROOT_ATTESTATION_REQUIRED',
          }),
        ]);
        if (
          diagnostics.some((result) => result.status !== 'fulfilled') ||
          afterHealth.collection === 'UNAVAILABLE' ||
          outcomes.some((result) => result.status !== 'fulfilled') ||
          browserCloser.hasFailures() ||
          health.snapshot().unexpectedErrors !== 0
        )
          return fail('FUNCTIONAL_BROWSER_FAILED');
        return { resourcesClosed: true, settled: true };
      })());
    },
  };
};
