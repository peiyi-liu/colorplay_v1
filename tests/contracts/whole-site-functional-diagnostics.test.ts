import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import {
  createBusinessDiagnostics,
  createBusinessStageObserver,
  businessCheckpointSchema,
  businessStageHealthSchema,
} from '../../scripts/concurrency/business-diagnostics';
import { FunctionalError } from '../../scripts/concurrency/config';
import { runFunctionalStudent } from '../../scripts/concurrency/student-journey';
import { createActualFunctionalPorts } from '../../scripts/concurrency/functional-journeys';
import * as healthModule from '../../scripts/concurrency/functional-health';
import {
  readyScope,
  syntheticScope,
  syntheticSecrets,
} from './helpers/whole-site-functional';
const helpers = vi.hoisted(() => ({
  chapter: vi.fn(),
  review: vi.fn(),
  mastery: vi.fn(),
  remediation: vi.fn(),
  quiz: vi.fn(),
  purchase: vi.fn(),
  achievements: vi.fn(),
  ledger: vi.fn(),
}));
vi.mock('../../scripts/concurrency/student-learning', () => ({
  functionalChapter: helpers.chapter,
  reviewFunctionalCards: helpers.review,
  masteryFunctional: helpers.mastery,
  remediationFunctional: helpers.remediation,
}));
vi.mock('../../scripts/concurrency/student-quiz', () => ({
  formalFunctionalQuiz: helpers.quiz,
}));
vi.mock('../../scripts/concurrency/student-economy', () => ({
  purchaseEquipFunctional: helpers.purchase,
  achievementLeaderboardFunctional: helpers.achievements,
  studentLedgerReadback: helpers.ledger,
}));
const harness = () => {
  const writes: { name: string; value: unknown }[] = [];
  const journal = {
    directory: 'synthetic',
    write: vi.fn((name: string, value: unknown) => {
      writes.push({ name, value });
      return Promise.resolve();
    }),
  };
  const health = {
    settle: () => Promise.resolve(),
    snapshot: () => ({
      available: true,
      expectedMediaDrops: 4,
      expectedRefreshRejections: 1,
      unexpectedErrors: 1,
    }),
    diagnostics: () => ({
      schemaVersion: 1 as const,
      collection: 'OBSERVED' as const,
      components: {
        unexpected: 1,
        pageErrors: 0,
        unmatchedConsole: 0,
        unprovenNetworkLogs: 0,
        pendingErrors: 0,
      },
      events: [],
      droppedCount: 0,
    }),
    authDiagnostics: () => ({
      approvedPopupStaticGaps: 0,
      expectedLogoutAborts: 0,
      expectedRevokedLogouts: 0,
      unresolvedLogoutDeclarations: 0,
    }),
  };
  return { writes, journal, health };
};
beforeEach(() => {
  for (const mock of Object.values(helpers)) mock.mockReset();
  helpers.chapter.mockResolvedValue({ templateId: 'synthetic' });
  helpers.review.mockResolvedValue({ completedCards: 8 });
  helpers.quiz.mockResolvedValue({
    answeredCount: 10,
    correctCount: 10,
    xpAwarded: 750,
    tokensAwarded: 250,
  });
  helpers.mastery.mockResolvedValue({ completedStages: 5, attempts: 6 });
  helpers.purchase.mockResolvedValue({ replayConfirmed: true });
  helpers.achievements.mockResolvedValue({ selfXpConfirmed: true });
  helpers.ledger.mockResolvedValue({ ledgerReconciled: true });
});
afterEach(() => vi.restoreAllMocks());
describe('actual student caller bounded private diagnostics', () => {
  it('records the exact failed mastery substep before outer safe mapping and never starts purchase', async () => {
    const h = harness();
    helpers.mastery.mockRejectedValueOnce(
      new FunctionalError('FUNCTIONAL_AUTH_FAILED'),
    );
    await expect(
      runFunctionalStudent(
        {} as Page,
        {} as SupabaseClient<Database>,
        {
          label: 'S1',
          userId: 'synthetic',
          account: 'synthetic',
          email: 'synthetic@colorplay.test',
          password: 'SYNTHETIC_SECRET',
          replacementPassword: 'SYNTHETIC_SECRET',
          displayName: 'Synthetic',
        },
        syntheticScope(),
        h.journal,
        'class',
        new AbortController().signal,
        h.health,
      ),
    ).rejects.toThrow('FUNCTIONAL_STUDENT_FAILED');
    expect(
      h.writes.find((row) => row.name === 's1-business-mastery-failed')?.value,
    ).toMatchObject({
      step: 'mastery',
      status: 'failed',
      code: 'FUNCTIONAL_AUTH_FAILED',
      observation: { health: { unexpectedErrors: 1 } },
    });
    expect(helpers.purchase).not.toHaveBeenCalled();
    expect(JSON.stringify(h.writes)).not.toContain('SYNTHETIC_SECRET');
  });
  it('stops before actions on a failed intent and preserves an original failure when diagnostic persistence fails', async () => {
    const h = harness();
    const action = vi.fn(() => Promise.resolve());
    const diagnostic = createBusinessDiagnostics(h.journal);
    h.journal.write.mockRejectedValueOnce(Error('SYNTHETIC_SECRET'));
    await expect(diagnostic.step('review', action)).rejects.toThrow(
      'FUNCTIONAL_OWNERSHIP_INVALID',
    );
    expect(action).not.toHaveBeenCalled();
    const original = Error('SYNTHETIC_SECRET');
    h.journal.write
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => {
        throw Error('SYNTHETIC_SECRET');
      });
    await expect(
      diagnostic.step('mastery', () => Promise.reject(original)),
    ).rejects.toBe(original);
  });
  it('has at most eight steps/sixteen records, finite duration, no repeated action and no raw extras', async () => {
    const h = harness();
    let clock = 1;
    h.health.settle = () => {
      clock += 1000;
      return Promise.resolve();
    };
    const diagnostic = createBusinessDiagnostics(
      h.journal,
      undefined,
      () => clock,
      h.health,
    );
    for (const step of [
      'chapter',
      'review',
      'formal_quiz',
      'remediation',
      'mastery',
      'purchase',
      'achievements',
      'ledger',
    ] as const)
      await diagnostic.step(step, () => {
        clock += 2;
        return Promise.resolve();
      });
    expect(h.writes).toHaveLength(16);
    expect(h.writes[1]?.value).toMatchObject({ elapsedMs: 2 });
    await expect(
      diagnostic.step('chapter', () => Promise.resolve()),
    ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
    expect(
      businessCheckpointSchema.safeParse({
        ...(h.writes[0]?.value as object),
        raw: 'SYNTHETIC_SECRET',
      }).success,
    ).toBe(false);
  });
  it('never confirms an action that finishes after abort', async () => {
    const h = harness();
    const controller = new AbortController();
    const diagnostic = createBusinessDiagnostics(h.journal, controller.signal);
    await expect(
      diagnostic.step('review', () => {
        controller.abort();
        return Promise.resolve();
      }),
    ).rejects.toThrow('FUNCTIONAL_ABORTED');
    expect(h.writes[1]?.value).toMatchObject({
      status: 'failed',
      code: 'FUNCTIONAL_ABORTED',
    });
  });
});
describe('actual stage health snapshots retain unknown errors', () => {
  it('real canonical and failing health callbacks both retain cumulative health1 without making it zero', async () => {
    const h = harness();
    const scope = await readyScope();
    const health = healthModule.createFunctionalHealth(scope, () => null);
    vi.spyOn(health, 'snapshot').mockImplementation(h.health.snapshot);
    vi.spyOn(health, 'diagnostics').mockImplementation(h.health.diagnostics);
    vi.spyOn(healthModule, 'createFunctionalHealth').mockReturnValueOnce(
      health,
    );
    const ports = createActualFunctionalPorts({
      scope,
      secrets: syntheticSecrets,
      artifactSha256: 'a'.repeat(64),
      journal: h.journal,
      preflight: () => Promise.resolve(scope),
      canonicalBaseline: () => Promise.resolve(undefined),
      mediaOracle: () => Promise.reject(Error('NOT_USED')),
    });
    const signal = new AbortController().signal;
    await ports.preflight(signal);
    await ports.stage('canonical_baseline', signal);
    await expect(ports.stage('health', signal)).rejects.toThrow(
      'FUNCTIONAL_BROWSER_FAILED',
    );
    const snapshots = h.writes.map((row) =>
      businessStageHealthSchema.parse(row.value),
    );
    expect(snapshots.map((row) => row.health.unexpectedErrors)).toEqual([1, 1]);
    expect(snapshots.map((row) => row.outcome)).toEqual([
      'confirmed',
      'failed',
    ]);
  });
  it('an unavailable detail collector stops the actual student caller and keeps stage failures original', async () => {
    const h = harness();
    h.health.diagnostics = () => {
      throw Error('PRIVATE_DETAILS');
    };
    await expect(
      runFunctionalStudent(
        {} as Page,
        {} as SupabaseClient<Database>,
        {
          label: 'S1',
          userId: 'synthetic',
          account: 'synthetic',
          email: 'synthetic@colorplay.test',
          password: 'PRIVATE_PASSWORD',
          replacementPassword: 'PRIVATE_PASSWORD',
          displayName: 'Synthetic',
        },
        syntheticScope(),
        h.journal,
        'class',
        new AbortController().signal,
        h.health,
      ),
    ).rejects.toThrow('FUNCTIONAL_STUDENT_FAILED');
    expect(helpers.chapter).toHaveBeenCalledOnce();
    expect(helpers.review).not.toHaveBeenCalled();
    expect(h.writes.at(-1)?.value).toMatchObject({
      status: 'failed',
      observation: { details: { collection: 'UNAVAILABLE', components: null } },
    });
    const original = Error('PRIVATE_ORIGINAL');
    h.journal.write.mockRejectedValueOnce(Error('PRIVATE_WRITER'));
    await expect(
      createBusinessStageObserver(h.journal, h.health, () =>
        Promise.reject(original),
      )('student_s1', new AbortController().signal),
    ).rejects.toBe(original);
    expect(JSON.stringify(h.writes)).not.toContain('PRIVATE_');
  });
  it('rejects an unknown five-counter port even when it claims OBSERVED', async () => {
    const h = harness();
    const port = {
      ...h.health,
      diagnostics: () => ({
        schemaVersion: 1,
        collection: 'OBSERVED',
        components: null,
        events: [],
        droppedCount: 0,
      }),
    };
    await expect(
      createBusinessStageObserver(h.journal, port, () =>
        Promise.resolve('OPERATION_RETURNED'),
      )('student_s1', new AbortController().signal),
    ).rejects.toThrow('FUNCTIONAL_BROWSER_FAILED');
    expect(h.writes.at(-1)?.value).toMatchObject({
      details: { collection: 'UNAVAILABLE', components: null },
    });
  });
  it('does not mask original stage failure with health/journal failure or expose raw errors', async () => {
    const h = harness();
    const original = Error('SYNTHETIC_SECRET');
    h.health.settle = () => Promise.reject(Error('SYNTHETIC_SECRET'));
    const observed = createBusinessStageObserver(h.journal, h.health, () =>
      Promise.reject(original),
    );
    await expect(
      observed('student_s1', new AbortController().signal),
    ).rejects.toBe(original);
    expect(h.writes[0]?.value).toMatchObject({
      outcome: 'failed',
      health: { collection: 'UNAVAILABLE', unexpectedErrors: null },
    });
    expect(JSON.stringify(h.writes)).not.toContain('SYNTHETIC_SECRET');
    h.journal.write.mockRejectedValueOnce(Error('SYNTHETIC_SECRET'));
    await expect(
      observed('student_s2', new AbortController().signal),
    ).rejects.toBe(original);
  });
  it('a successful operation cannot PASS without its diagnostic write, and aborted collection is unavailable not zero', async () => {
    const h = harness();
    h.journal.write.mockRejectedValueOnce(Error('SYNTHETIC_SECRET'));
    await expect(
      createBusinessStageObserver(h.journal, h.health, () => Promise.resolve())(
        'student_s1',
        new AbortController().signal,
      ),
    ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
    const controller = new AbortController();
    h.health.settle = () => new Promise(() => undefined);
    await expect(
      createBusinessStageObserver(h.journal, h.health, () => {
        controller.abort();
        return Promise.resolve();
      })('student_s2', controller.signal),
    ).rejects.toThrow('FUNCTIONAL_ABORTED');
    expect(h.writes.at(-1)?.value).toMatchObject({
      health: { collection: 'UNAVAILABLE', unexpectedErrors: null },
    });
    expect(
      businessStageHealthSchema.safeParse({
        ...(h.writes.at(-1)?.value as object),
        raw: 'SYNTHETIC_SECRET',
      }).success,
    ).toBe(false);
  });
});
