import type { CapacityReviewReadinessObservation } from './capacity-review-readiness-observation';
import { createStudentReviewDiagnostics } from './capacity-student-review-diagnostics';
import {
  gameObserve,
  gameErrorClass,
  type GameObserver,
} from './capacity-game-diagnostics';
import type { Request } from '@playwright/test';
import type { CapacityScope } from './capacity-scope';
import { capacityFailure } from './capacity-scope';
import {
  runCapacityStudentGame,
  readCapacityTeacherDuringLoad,
  settleCapacityGameWork,
} from './capacity-game';
import type { CapacityGameActor } from './capacity-live-game';
import type { PrivateJournal } from './private-journal';
import { performance } from 'node:perf_hooks';
import { createLearningRepository } from '../../src/features/learning/api/learning-repository';
import { createEconomyRepository } from '../../src/features/rewards/api/economy-repository';
export interface CapacityGameLoadOptions {
  scope: CapacityScope;
  actors: readonly CapacityGameActor[];
  identities: readonly { userId: string | null }[];
  classroomId: string;
  journal: PrivateJournal;
  signal: AbortSignal;
  onActive: (delta: 1 | -1) => void;
  stop: () => void;
  diagnostics?: GameObserver;
  continueProtocolReads?: true;
  reviewReadiness?: CapacityReviewReadinessObservation;
}
export const runCapacityGameLoad = async (
  options: CapacityGameLoadOptions,
  ports: {
    student: typeof runCapacityStudentGame;
    teacher: typeof readCapacityTeacherDuringLoad;
  } = {
    student: runCapacityStudentGame,
    teacher: readCapacityTeacherDuringLoad,
  },
) => {
  const { scope, actors, identities, classroomId, journal, signal } = options,
    host = actors[0];
  if (
    !host ||
    actors.length < 3 ||
    identities.length !== actors.length ||
    signal.aborted
  )
    return capacityFailure();
  if (
    options.continueProtocolReads &&
    actors.some((actor) => actor.page !== undefined || !actor.observePhysical)
  )
    return capacityFailure();
  const controller = new AbortController(),
    owned = AbortSignal.any([signal, controller.signal]);
  let active = 0,
    completed = 0,
    observed = 0;
  let teacherDone = false;
  const doneTeaching = () => teacherDone;
  type ReadStop =
    | 'NOT_ENTERED'
    | 'TEACHER_DONE'
    | 'HARD_CAP'
    | 'ABORTED'
    | 'READ_FAILURE'
    | 'PHYSICAL_INVALID'
    | 'STATE_CHANGED'
    | 'MISSING_ORIGINAL_WINDOW'
    | 'CORE_FAILURE';
  const summary = () => ({
    schemaVersion: 1,
    authority: 'NON_AUTHORITY' as const,
    coreComplete: false,
    roundsStarted: 0,
    pairsConfirmed: 0,
    progressInvocations: 0,
    progressReturns: 0,
    economyInvocations: 0,
    economyReturns: 0,
    physicalRequests: 0,
    startedAtNodeMs: null as number | null,
    endedAtNodeMs: null as number | null,
    hardCapPairs: 8192,
    stopReason: 'NOT_ENTERED' as ReadStop,
    aborted: false,
  });
  const continueReads = async (
    actor: CapacityGameActor,
    state: ReturnType<typeof summary>,
  ) => {
    if (doneTeaching()) {
      state.stopReason = 'TEACHER_DONE';
      return;
    }
    const learning = createLearningRepository(actor.client);
    const economy = createEconomyRepository(actor.client);
    let baseline: string | undefined,
      requestOpen = false,
      unexpected = false;
    const hasUnexpected = () => unexpected;
    const fail = (reason: ReadStop): never => {
      state.stopReason = reason;
      return capacityFailure();
    };
    const check = () => {
      if (owned.aborted) fail('ABORTED');
    };
    state.startedAtNodeMs = performance.now();
    const unobserve = actor.observePhysical?.(() => {
      state.physicalRequests++;
      if (!requestOpen) unexpected = true;
    });
    if (!unobserve) return fail('PHYSICAL_INVALID');
    try {
      while (!doneTeaching()) {
        check();
        if (state.roundsStarted >= 8192) fail('HARD_CAP');
        state.roundsStarted++;
        const before = state.physicalRequests;
        requestOpen = true;
        state.progressInvocations++;
        const progress = await learning.listReviewProgress();
        state.progressReturns++;
        requestOpen = false;
        check();
        if (hasUnexpected() || state.physicalRequests !== before + 1)
          fail('PHYSICAL_INVALID');
        const cards = progress
          .map((p) => `${p.reviewCardId}:${String(p.cardVersion)}`)
          .sort();
        if (!cards.length || new Set(cards).size !== cards.length)
          fail('STATE_CHANGED');
        requestOpen = true;
        state.economyInvocations++;
        const value = await economy.getSummary();
        state.economyReturns++;
        requestOpen = false;
        check();
        if (hasUnexpected() || state.physicalRequests !== before + 2)
          fail('PHYSICAL_INVALID');
        if (
          ![value.totalXp, value.tokenBalance].every(
            (n) => Number.isSafeInteger(n) && n >= 0,
          )
        )
          fail('STATE_CHANGED');
        const current = JSON.stringify([
          cards,
          value.totalXp,
          value.tokenBalance,
        ]);
        if (baseline !== undefined && current !== baseline)
          fail('STATE_CHANGED');
        baseline = current;
        state.pairsConfirmed++;
      }
      if (hasUnexpected()) fail('PHYSICAL_INVALID');
      state.stopReason = 'TEACHER_DONE';
    } catch (error) {
      if (state.stopReason === 'NOT_ENTERED')
        state.stopReason = owned.aborted ? 'ABORTED' : 'READ_FAILURE';
      throw error;
    } finally {
      requestOpen = false;
      unobserve();
    }
  };
  const note: GameObserver = (row) => {
    gameObserve(options.diagnostics, { ...row, active, completed, observed });
  };
  const stop = (
    source:
      | 'STUDENT_FAILURE'
      | 'TEACHER_FAILURE'
      | 'NO_PHYSICAL_WINDOW'
      | 'SETTLE_FAILURE',
    error?: unknown,
  ) => {
    note({
      kind: 'STOP',
      state: 'FAILED',
      source,
      signalAborted: owned.aborted,
      errorClass: gameErrorClass(error),
    });
    controller.abort();
    options.stop();
  };
  let release: () => void = () => undefined;
  const first = new Promise<void>((resolve, reject) => {
    release = () => {
      owned.removeEventListener('abort', abort);
      resolve();
    };
    const abort = () => {
      owned.removeEventListener('abort', abort);
      reject(new Error('CAPACITY_EVIDENCE_INVALID'));
    };
    owned.addEventListener('abort', abort, { once: true });
    if (owned.aborted) abort();
  });
  void first.catch(() => undefined);
  const students = actors.slice(1).map((actor, index) => {
    const identity = identities[index + 1];
    const lifecycle = { started: false, done: false };
    const continuation = options.continueProtocolReads ? summary() : undefined;
    const review = actor.page
      ? createStudentReviewDiagnostics(actor.actorIndex)
      : undefined;
    const mark = () => {
      if (lifecycle.started || lifecycle.done || owned.aborted) return;
      lifecycle.started = true;
      active++;
      observed++;
      options.onActive(1);
      note({
        kind: 'WINDOW',
        state: 'ENTERED',
        actorIndex: actor.actorIndex,
        signalAborted: owned.aborted,
      });
      release();
    };
    let dispose: () => void;
    if (actor.page) {
      const page = actor.page;
      const request = (value: Request) => {
        try {
          const url = new URL(value.url());
          if (
            value.method() === 'GET' &&
            value.isNavigationRequest() &&
            url.origin === scope.appUrl &&
            /^\/app\/chapters\/[0-9a-f-]{36}$/u.test(url.pathname)
          )
            mark();
        } catch {
          /* Unknown request never starts a business window. */
        }
      };
      page.on('request', request);
      dispose = () => {
        page.off('request', request);
      };
    } else {
      if (!actor.observePhysical)
        return Promise.reject(new Error('CAPACITY_EVIDENCE_INVALID'));
      dispose = actor.observePhysical(mark);
    }
    return (async () => {
      try {
        if (!identity?.userId || owned.aborted) return capacityFailure();
        note({
          kind: 'STUDENT',
          state: 'ENTERED',
          actorIndex: actor.actorIndex,
          signalAborted: owned.aborted,
        });
        const result = await ports.student(
          actor,
          identity.userId,
          classroomId,
          60,
          journal,
          owned,
          review
            ? (event) => {
                review.observe(event);
                try {
                  if (!owned.aborted)
                    options.reviewReadiness?.observe(actor.actorIndex, event);
                } catch {
                  /* Passive only. */
                }
              }
            : undefined,
        );
        if (continuation) {
          continuation.coreComplete = true;
          if (!lifecycle.started) {
            continuation.stopReason = 'MISSING_ORIGINAL_WINDOW';
            return capacityFailure();
          }
          await continueReads(actor, continuation);
        }
        note({
          kind: 'STUDENT',
          state: 'RETURNED',
          actorIndex: actor.actorIndex,
          signalAborted: owned.aborted,
        });
        return result;
      } catch (error) {
        if (continuation && !continuation.coreComplete)
          continuation.stopReason = 'CORE_FAILURE';
        note({
          kind: 'STUDENT',
          state: 'FAILED',
          actorIndex: actor.actorIndex,
          signalAborted: owned.aborted,
          errorClass: gameErrorClass(error),
        });
        stop('STUDENT_FAILURE', error);
        return capacityFailure();
      } finally {
        lifecycle.done = true;
        dispose();
        completed++;
        if (lifecycle.started) {
          active--;
          options.onActive(-1);
          note({
            kind: 'WINDOW',
            state: 'RETURNED',
            actorIndex: actor.actorIndex,
            signalAborted: owned.aborted,
          });
        }
        if (completed === actors.length - 1 && observed === 0)
          stop('NO_PHYSICAL_WINDOW');
        if (review) {
          try {
            const snapshot = review.seal();
            await journal.write(
              `actor-${String(actor.actorIndex)}-student-review-diagnostics`,
              snapshot,
            );
          } catch {
            /* Diagnostic writer cannot replace the original outcome. */
          }
        }
        if (continuation) {
          continuation.endedAtNodeMs = performance.now();
          continuation.aborted = owned.aborted;
          try {
            await journal.write(
              `actor-${String(actor.actorIndex)}-protocol-read-continuation`,
              continuation,
            );
          } catch {
            /* Passive summary never replaces the business failure. */
          }
        }
      }
    })();
  });
  const teacher = (async () => {
    await first;
    if (owned.aborted || active === 0) return capacityFailure();
    await ports.teacher(host, classroomId, () => active > 0, owned, note);
    teacherDone = true;
  })();
  try {
    let failure: {
      source: 'STUDENT_FAILURE' | 'TEACHER_FAILURE' | 'SETTLE_FAILURE';
      error: unknown;
    } = { source: 'SETTLE_FAILURE', error: undefined };
    return await settleCapacityGameWork<unknown>(
      [...students, teacher],
      () => {
        stop(failure.source, failure.error);
      },
      (error, index) => {
        failure = {
          source:
            index === students.length ? 'TEACHER_FAILURE' : 'STUDENT_FAILURE',
          error,
        };
      },
    );
  } finally {
    controller.abort();
  }
};
