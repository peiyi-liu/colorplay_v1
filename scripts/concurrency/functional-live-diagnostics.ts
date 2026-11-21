import { performance } from 'node:perf_hooks';
import { errors, type Page } from '@playwright/test';
import {
  FunctionalError,
  functionalFailureCode,
  type FunctionalScope,
} from './config';
import type { PrivateJournal } from './private-journal';
import { bindLiveDocuments } from './functional-document-observation';
const stages = [
  'SETUP',
  'ROUND_EXPLANATION',
  'ROUND_RANKING',
  'ROUND_ACTION_ENABLED',
  'ROUND_ACTION_CLICK',
  'COMPLETED_WAIT',
  'COMPLETED_COUNT',
  'REPORT_RPC',
  'REPORT_PREDICATE',
  'PRESENTER_GOTO',
  'REPORT_GOTO',
  'REPORT_HEADING',
  'HEALTH',
  'COMPLETE_JOURNAL',
  'BINDING_DISPOSE',
  'ACTOR_CLOSE',
] as const;
type Stage = (typeof stages)[number];
type State = 'BEGIN' | 'RETURNED' | 'FAILED';
interface Failure {
  stage: Stage | 'UNOBSERVED';
  position: number | null;
  actorOrdinal: number | null;
  errorClass: 'FUNCTIONAL' | 'PLAYWRIGHT_TIMEOUT' | 'ERROR' | 'OTHER';
  code: string;
  timeoutCode: 'PLAYWRIGHT_TIMEOUT' | 'UNOBSERVED';
}
export const createLiveDiagnostics = (
  scope: FunctionalScope,
  pages: readonly Page[],
  journal: PrivateJournal,
) => {
  const documents = bindLiveDocuments(scope, pages);
  let unavailable = false,
    overflow = false,
    sealed = false;
  let current: Stage | 'UNOBSERVED' = 'UNOBSERVED',
    position: number | null = null,
    actorOrdinal: number | null = null;
  let operationFailure: Failure | null = null,
    cleanupFailure: Failure | null = null;
  const events: {
    seq: number;
    stage: Stage;
    state: State;
    position: number | null;
    actorOrdinal: number | null;
    atNodeMs: number;
  }[] = [];
  const record = (
    stage: Stage,
    state: State,
    round?: number,
    ordinal?: number,
  ) => {
    try {
      if (sealed) {
        unavailable = true;
        return;
      }
      if (
        !stages.includes(stage) ||
        (round !== undefined &&
          (!Number.isInteger(round) || round < 1 || round > 20)) ||
        (ordinal !== undefined &&
          (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 4))
      ) {
        unavailable = true;
        return;
      }
      current = stage;
      position = round ?? null;
      actorOrdinal = ordinal ?? null;
      if (events.length >= 512) {
        overflow = true;
        return;
      }
      events.push({
        seq: events.length + 1,
        stage,
        state,
        position,
        actorOrdinal,
        atNodeMs: performance.now(),
      });
      if (state === 'RETURNED') {
        current = 'UNOBSERVED';
        position = actorOrdinal = null;
      }
    } catch {
      unavailable = true;
    }
  };
  const failure = (error: unknown, cleanup: boolean) => {
    try {
      const value: Failure = {
        stage: current,
        position,
        actorOrdinal,
        errorClass:
          error instanceof errors.TimeoutError
            ? 'PLAYWRIGHT_TIMEOUT'
            : error instanceof FunctionalError
              ? 'FUNCTIONAL'
              : error instanceof Error
                ? 'ERROR'
                : 'OTHER',
        code:
          error instanceof FunctionalError
            ? functionalFailureCode(error)
            : 'UNOBSERVED',
        timeoutCode:
          error instanceof errors.TimeoutError
            ? 'PLAYWRIGHT_TIMEOUT'
            : 'UNOBSERVED',
      };
      if (cleanup) cleanupFailure ??= value;
      else operationFailure ??= value;
    } catch {
      unavailable = true;
    }
  };
  return {
    documents,
    step: async <T>(
      stage: Stage,
      operation: () => T | Promise<T>,
      round?: number,
      ordinal?: number,
    ): Promise<T> => {
      record(stage, 'BEGIN', round, ordinal);
      try {
        const value = await operation();
        record(stage, 'RETURNED', round, ordinal);
        return value;
      } catch (error) {
        record(stage, 'FAILED', round, ordinal);
        failure(error, stage === 'ACTOR_CLOSE' || stage === 'BINDING_DISPOSE');
        throw error;
      }
    },
    sync: <T>(stage: Stage, operation: () => T, ordinal?: number): T => {
      record(stage, 'BEGIN', undefined, ordinal);
      try {
        const value = operation();
        record(stage, 'RETURNED', undefined, ordinal);
        return value;
      } catch (error) {
        record(stage, 'FAILED', undefined, ordinal);
        failure(error, stage === 'BINDING_DISPOSE');
        throw error;
      }
    },
    operationFailure: (error: unknown) => {
      failure(error, false);
    },
    cleanupFailure: (error: unknown) => {
      failure(error, true);
    },
    cleanup: async <T>(operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        failure(error, true);
        throw error;
      }
    },
    finish: async () => {
      try {
        documents.close();
        sealed = true;
        const value = {
          schemaVersion: 1,
          authority: 'NON_AUTHORITY',
          collection: unavailable || overflow ? 'UNAVAILABLE' : 'OBSERVED',
          sourceRevision: scope.expectedRevision,
          runId: scope.runId,
          executionProfileSha256: scope.executionProfileSha256 ?? null,
          jobSha256: null,
          bootIdSha256: null,
          clock: 'NODE_PERFORMANCE',
          operationFailure,
          cleanupFailure,
          events,
          overflow,
          documents: documents.snapshot(),
        };
        if (Buffer.byteLength(JSON.stringify(value)) > 262144) return;
        await journal.write('teacher-live-finish-diagnostics', value);
      } catch {
        unavailable = true;
      }
    },
  };
};
