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
  const controller = new AbortController(),
    owned = AbortSignal.any([signal, controller.signal]);
  let active = 0,
    completed = 0,
    observed = 0;
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
        );
        note({
          kind: 'STUDENT',
          state: 'RETURNED',
          actorIndex: actor.actorIndex,
          signalAborted: owned.aborted,
        });
        return result;
      } catch (error) {
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
      }
    })();
  });
  const teacher = (async () => {
    await first;
    if (owned.aborted || active === 0) return capacityFailure();
    return ports.teacher(host, classroomId, () => active > 0, owned, note);
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
