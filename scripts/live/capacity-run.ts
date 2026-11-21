import { open, readFile, unlink } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { chromium, type Browser, type BrowserContext } from '@playwright/test';

import {
  summarizeDurations,
  type CapacityCredentials,
  type CapacityStage,
} from '../../tests/e2e/helpers/staging-capacity';
import { createCapacityStageRunner } from '../../tests/e2e/helpers/staging-capacity-stage-runner';
import {
  assertIndependentActorIdentities,
  createSdkLiveActor,
  type LiveActor,
} from './capacity-actors';
import { createBrowserLiveActor } from './capacity-browser-actor';
import {
  assertCapacityEscalation,
  failCapacity,
  requireLocalExecution,
  type CapacityConfig,
} from './capacity-config';
import { createCapacityFixtures } from './capacity-fixtures';
import { monitorGeneratorHealth } from './capacity-generator-health';
import {
  runCapacityLifecycle,
  settleCapacityOperations,
} from './capacity-lifecycle';
import { readLocalSecrets } from './capacity-local-client';
import { createLocalDatabase } from './capacity-local-database';
import { preflightLocalCapacity } from './capacity-preflight';
import {
  createCapacityReceipt,
  sanitizeCapacityReceipt,
  summarizeActorMetrics,
  writeCapacityReceipt,
  type ActorEvidence,
  type CapacityReceipt,
} from './capacity-receipt';

export const runLowDeviceCapacity = async (
  config: CapacityConfig,
  git: { repoSha: string; dirty: boolean },
  env: NodeJS.ProcessEnv = process.env,
): Promise<CapacityReceipt> => {
  // This gate precedes local persistence as well as all network activity.
  if (!config.dryRun) requireLocalExecution(config);
  const receipt = createCapacityReceipt(config, git.repoSha);
  // Reserve the output exclusively: a reused marker cannot overwrite evidence.
  let output: Awaited<ReturnType<typeof open>>;
  try {
    output = await open(config.resultPath, 'wx', 0o600);
  } catch {
    return failCapacity('LIVE_CAPACITY_RUN_ID_REUSED');
  }
  try {
    await output.writeFile(`${JSON.stringify(receipt)}\n`, 'utf8');
  } finally {
    await output.close();
  }
  if (config.dryRun) {
    await writeCapacityReceipt(config.resultPath, receipt);
    return receipt;
  }
  // The Hosted gate is independent of parsing: even a manually constructed
  // config cannot turn the current dry-run-only permission into a live run.
  requireLocalExecution(config);
  if (git.dirty || git.repoSha !== config.expectedRevision) {
    receipt.result = 'BLOCKED';
    receipt.failureReason = 'revision';
    await writeCapacityReceipt(config.resultPath, receipt);
    return receipt;
  }
  let secrets: ReturnType<typeof readLocalSecrets>;
  let database: ReturnType<typeof createLocalDatabase>;
  try {
    secrets = readLocalSecrets(env);
    database = createLocalDatabase(config);
  } catch {
    receipt.result = 'BLOCKED';
    receipt.failureReason = 'configuration';
    await writeCapacityReceipt(config.resultPath, receipt);
    return receipt;
  }
  const controller = new AbortController();
  try {
    receipt.webRevision = await preflightLocalCapacity(
      config,
      secrets,
      database,
      controller.signal,
    );
  } catch {
    receipt.result = 'BLOCKED';
    receipt.failureReason = 'environment';
    await writeCapacityReceipt(config.resultPath, receipt);
    return receipt;
  }
  try {
    const previous: unknown = config.previousReceiptPath
      ? JSON.parse(await readFile(config.previousReceiptPath, 'utf8'))
      : null;
    assertCapacityEscalation(
      config,
      previous === null ? null : sanitizeCapacityReceipt(previous),
    );
  } catch {
    receipt.result = 'BLOCKED';
    receipt.failureReason = 'preflight';
    await writeCapacityReceipt(config.resultPath, receipt);
    return receipt;
  }
  // The same run marker cannot race setup from another profile/process on this
  // Local host. A stale lock requires explicit recovery, never auto-deletion.
  const lockPath = `/private/tmp/colorplay-low-device-${config.runId}.lock`;
  try {
    const lock = await open(lockPath, 'wx', 0o600);
    await lock.close();
  } catch {
    receipt.result = 'BLOCKED';
    receipt.failureReason = 'preflight';
    await writeCapacityReceipt(config.resultPath, receipt);
    return receipt;
  }
  receipt.result = 'RUNNING';
  const generator = monitorGeneratorHealth(() => {
    controller.abort();
  });
  const fixtures = createCapacityFixtures(
    config,
    secrets,
    database,
    controller.signal,
  );
  const actors: LiveActor[] = [];
  let outsider: LiveActor | undefined;
  let browser: Browser | undefined;
  const contexts: BrowserContext[] = [];
  const stageRunner = createCapacityStageRunner({
    result: receipt,
    resultPath: config.resultPath,
    onTimeout: () => {
      controller.abort();
    },
  });
  const runStage = async <T>(
    stage: CapacityStage,
    operation: () => Promise<T>,
  ): Promise<T> => {
    receipt.failureStage = stage;
    const started = performance.now();
    const entry: CapacityReceipt['stages'][number] = {
      stage,
      outcome: 'running',
      elapsedMs: null,
    };
    receipt.stages.push(entry);
    try {
      const value = await stageRunner.run(stage, async () => {
        controller.signal.throwIfAborted();
        return operation();
      });
      entry.outcome = 'ok';
      entry.elapsedMs = performance.now() - started;
      receipt.generatorHealth = generator.snapshot();
      return value;
    } catch (error) {
      entry.outcome = 'error';
      entry.elapsedMs = performance.now() - started;
      throw error;
    }
  };
  try {
    const lifecycle = await runCapacityLifecycle({
      controller,
      generatorLimited: () => generator.snapshot().limited,
      operate: async () => {
        await runStage('browser_setup', async () => {
          if (config.profile !== 'protocol')
            browser = await chromium.launch({ headless: true });
          const teacher: CapacityCredentials = {
            account: 'teacher01',
            displayName: '容量教師',
            email: 'teacher@colorplay.test',
            password: secrets.teacherPassword,
            role: 'teacher',
          };
          const credentials = [teacher, ...fixtures.plan.participants];
          for (const [index, fixture] of credentials.entries()) {
            controller.signal.throwIfAborted();
            const evidence = receipt.actors[index];
            if (!evidence)
              return failCapacity('LIVE_CAPACITY_ACTOR_COUNT_INVALID');
            const actor =
              evidence.transport === 'browser' && browser
                ? await createBrowserLiveActor(
                    browser,
                    config,
                    secrets,
                    fixture,
                    controller.signal,
                    evidence,
                    (context) => contexts.push(context),
                  )
                : createSdkLiveActor(
                    config,
                    secrets,
                    fixture,
                    controller.signal,
                    evidence,
                  ).actor;
            actors.push(actor);
          }
          if (contexts.length !== receipt.browserContexts)
            return failCapacity('LIVE_CAPACITY_BROWSER_COUNT_INVALID');
          const outsiderEvidence: ActorEvidence = {
            index: 0,
            role: 'participant',
            transport: 'sdk',
            status: 'not_run',
            requests: 'unavailable',
            broadcasts: 'unavailable',
            timings: [],
            uiProof: 'not_applicable',
          };
          outsider = createSdkLiveActor(
            config,
            secrets,
            fixtures.plan.outsider,
            controller.signal,
            outsiderEvidence,
          ).actor;
        });
        await runStage('account_setup', () => fixtures.createAccounts());
        await runStage('login', async () => {
          await settleCapacityOperations(
            [...actors, ...(outsider ? [outsider] : [])].map(
              (actor) => () => actor.login(),
            ),
          );
        });
        const identities = await runStage('teacher_preflight', async () => {
          if (actors.length !== config.totalActors || !outsider)
            return failCapacity('LIVE_CAPACITY_ACTOR_COUNT_INVALID');
          const proofs = await settleCapacityOperations(
            [...actors, outsider].map((actor) => () => actor.identity()),
          );
          assertIndependentActorIdentities(proofs);
          const teacher = proofs[0];
          if (!teacher)
            return failCapacity('LIVE_CAPACITY_TEACHER_PREFLIGHT_FAILED');
          await fixtures.verifyTeacher(teacher.userId);
          return proofs;
        });
        if (identities.length !== config.totalActors + 1)
          return failCapacity('LIVE_CAPACITY_ACTOR_COUNT_INVALID');
        const host = actors[0];
        if (!host) return failCapacity('LIVE_CAPACITY_HOST_MISSING');
        const participants = actors.slice(1);
        const classroom = await runStage('classroom_create', () =>
          fixtures.createClassroom(host.client),
        );
        await runStage('classroom_join', async () => {
          await settleCapacityOperations(
            participants.map(
              (actor) => () => actor.joinClassroom(classroom.joinCode),
            ),
          );
        });
        const live = await runStage('live_launch', () =>
          fixtures.launchLive(host.client),
        );
        await runStage('live_join', async () => {
          await settleCapacityOperations(
            participants.map((actor) => async () => {
              if ((await actor.joinLive(live.joinCode)) !== live.sessionId)
                return failCapacity('LIVE_CAPACITY_LIVE_SESSION_MISMATCH');
            }),
          );
          await settleCapacityOperations(
            actors.map((actor) => () => actor.subscribe(live.sessionId)),
          );
          if (!outsider) return failCapacity('LIVE_CAPACITY_OUTSIDER_MISSING');
          receipt.outsider = 'failed';
          try {
            await outsider.proveOutsiderRefusal(live.sessionId, live.joinCode);
            receipt.outsider = 'rejected';
          } finally {
            receipt.outsiderDiagnostics = outsider.getOutsiderDiagnostics();
          }
        });
        await runStage('host_roster', async () => {
          const state = await host.getState(live.sessionId);
          if (state.participantCount !== config.totalActors - 1)
            return failCapacity('LIVE_CAPACITY_ROSTER_MISMATCH');
        });
        for (let position = 1; position <= 3; position += 1) {
          await runStage(
            position === 1 ? 'live_start' : 'round_transition',
            () => host.openRound(live.sessionId, position === 1),
          );
          const states = await runStage('round_gate', () =>
            settleCapacityOperations(
              participants.map(
                (actor) => () =>
                  actor.waitForState(
                    live.sessionId,
                    (state) =>
                      state.state === 'question_open' &&
                      state.currentPosition === position,
                  ),
              ),
            ),
          );
          await runStage('round_answer', async () => {
            await settleCapacityOperations(
              participants.map((actor, index) => () => {
                const state = states[index];
                if (!state)
                  return Promise.reject(
                    new Error('LIVE_CAPACITY_STATE_MISSING'),
                  );
                return actor.submitAnswer(state);
              }),
            );
          });
          const snapshots = await runStage('round_reveal', () =>
            settleCapacityOperations(
              actors.map(
                (actor) => () =>
                  actor.waitForState(
                    live.sessionId,
                    (state) =>
                      state.state === 'question_feedback' &&
                      state.currentPosition === position,
                  ),
              ),
            ),
          );
          await runStage('round_gate', async () => {
            const authoritative = await fixtures.verifyRound(position);
            const durations = participants.flatMap((actor) => {
              const timing = actor.evidence.timings
                .filter((entry) => entry.stage === 'answer')
                .at(-1);
              return timing ? [timing.elapsedMs] : [];
            });
            const timing = summarizeDurations(durations);
            const snapshotsMatched =
              snapshots.length === config.totalActors &&
              new Set(snapshots.map((state) => state.stateVersion)).size ===
                1 &&
              snapshots.every(
                (state) => state.participantCount === config.totalActors - 1,
              ) &&
              snapshots.every(
                (state) =>
                  state.sessionId === live.sessionId &&
                  state.currentPosition === position &&
                  state.state === 'question_feedback',
              );
            receipt.rounds.push({
              position,
              ...authoritative,
              timing,
              snapshotsMatched,
            });
            if (
              durations.length !== config.totalActors - 1 ||
              authoritative.answerCount !== config.totalActors - 1 ||
              authoritative.distinctParticipants !== config.totalActors - 1 ||
              !snapshotsMatched ||
              timing.p95_ms > 800
            )
              return failCapacity('LIVE_CAPACITY_ROUND_GATE_FAILED');
          });
        }
        await runStage('browser_diagnostics', async () => {
          for (const actor of actors) {
            await actor.assertBrowserHealth?.();
            if (
              typeof actor.evidence.broadcasts !== 'number' ||
              actor.evidence.broadcasts === 0
            )
              return failCapacity('LIVE_CAPACITY_BROADCAST_UNOBSERVED');
            actor.evidence.status = 'completed';
          }
        });
        receipt.failureStage = null;
      },
      close: async () => {
        const results = await Promise.allSettled(
          [...actors, ...(outsider ? [outsider] : [])].map((actor) =>
            actor.close(),
          ),
        );
        // Browser.close also catches contexts whose creation response was lost.
        if (browser) await browser.close();
        if (results.some((result) => result.status === 'rejected'))
          return failCapacity('LIVE_CAPACITY_TRANSPORT_CLEANUP_FAILED');
      },
      cleanup: async (signal) => {
        await stageRunner.checkpoint('cleanup');
        const remaining = await fixtures.cleanup(signal);
        receipt.cleanup = sanitizeCapacityReceipt({
          ...receipt,
          cleanup: {
            status: 'verified',
            sharedIpLimiter: 'preserved',
            remaining,
          },
        }).cleanup;
      },
    });
    receipt.cleanup.status = lifecycle.cleanup;
    receipt.result = lifecycle.result;
    receipt.generatorHealth = generator.snapshot();
    receipt.metrics = summarizeActorMetrics(receipt.actors);
    if (receipt.result !== 'PASS')
      receipt.failureReason = receipt.generatorHealth.limited
        ? 'generator_limited'
        : 'operation';
    const safeReceipt = sanitizeCapacityReceipt(receipt);
    await stageRunner.checkpoint('finished');
    await writeCapacityReceipt(config.resultPath, safeReceipt);
    return safeReceipt;
  } finally {
    generator.stop();
    if (receipt.cleanup.status === 'verified')
      await unlink(lockPath).catch(() => undefined);
  }
};
