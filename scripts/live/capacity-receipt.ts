import { z } from 'zod';

import { writeSafeJson } from '../../tests/e2e/helpers/staging-capacity-checkpoint';
import { summarizeDurations } from '../../tests/e2e/helpers/staging-capacity';
import { capacityProfileCounts, type CapacityConfig } from './capacity-config';
import { initialGeneratorHealth } from './capacity-generator-health';
import {
  browserJoinDiagnosticsSchema,
  emptyBrowserJoinSnapshot,
} from '../../tests/e2e/helpers/live-browser-join-diagnostics';
import {
  emptyOutsiderDiagnostics,
  outsiderDiagnosticsSchema,
} from './capacity-outsider-diagnostics';

export const STAGES = [
  'release_marker',
  'account_setup',
  'browser_setup',
  'login',
  'teacher_preflight',
  'classroom_create',
  'classroom_join',
  'live_launch',
  'live_join',
  'host_roster',
  'live_start',
  'round_answer',
  'round_gate',
  'round_reveal',
  'round_transition',
  'browser_diagnostics',
] as const;
const finite = z.number().nonnegative();
const counter = z.union([finite.int(), z.literal('unavailable')]);
const duration = finite.nullable();
const statistic = z
  .object({
    count: finite.int(),
    max_ms: finite,
    p50_ms: finite,
    p95_ms: finite,
  })
  .nullable();
const actorStageSchema = z.object({
  stage: z.enum([
    'login',
    'classroom_join',
    'live_join',
    'subscribe',
    'snapshot',
    'answer',
  ]),
  elapsedMs: finite,
  sample: z.enum(['first', 'subsequent']),
});
export type ActorStage = z.infer<typeof actorStageSchema>['stage'];
const actorSchema = z.object({
  index: z.number().int().min(1).max(40),
  role: z.enum(['host', 'participant']),
  transport: z.enum(['sdk', 'browser']),
  status: z.enum(['not_run', 'connected', 'completed', 'failed']),
  requests: counter,
  broadcasts: counter,
  timings: z.array(actorStageSchema).max(1000),
  browserJoinDiagnostics: browserJoinDiagnosticsSchema.optional(),
  uiProof: z.union([
    z.literal('not_applicable'),
    z.object({
      login: z.boolean(),
      join: z.boolean(),
      answerRounds: finite.int().max(3),
    }),
  ]),
});
export type ActorEvidence = z.infer<typeof actorSchema>;
const receiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().regex(/^c40-[a-z0-9-]{1,31}$/u),
    repoSha: z.string().regex(/^[a-f0-9]{40}$/u),
    webRevision: z
      .string()
      .regex(/^[a-f0-9]{40}$/u)
      .nullable(),
    environment: z.enum(['local', 'staging']),
    profile: z.enum(['protocol', 'browser', 'hybrid']),
    totalActors: z.union([
      z.literal(3),
      z.literal(10),
      z.literal(20),
      z.literal(40),
    ]),
    browserParticipants: z.union([z.literal(0), z.literal(2)]),
    browserContexts: z.union([z.literal(0), z.literal(3)]),
    actors: z.array(actorSchema).min(3).max(40),
    stages: z
      .array(
        z.object({
          stage: z.enum(STAGES),
          outcome: z.enum(['running', 'ok', 'error']),
          elapsedMs: duration,
        }),
      )
      .max(100),
    generatorHealth: z.object({
      rssBytes: counter,
      eventLoopLagP95Ms: z.union([finite, z.literal('unavailable')]),
      cpuPercent: z.union([finite, z.literal('unavailable')]),
      limited: z.boolean(),
      limitReason: z.enum(['rss', 'event_loop']).nullable(),
    }),
    cleanup: z.object({
      status: z.enum(['not_run', 'verified', 'failed', 'blocked']),
      remaining: z
        .record(
          z.enum([
            'auth_users_remaining',
            'profiles_remaining',
            'classrooms_remaining',
            'live_activities_remaining',
            'live_sessions_remaining',
            'identity_limiters_remaining',
          ]),
          finite.int(),
        )
        .optional(),
      sharedIpLimiter: z.literal('preserved'),
    }),
    result: z.enum([
      'NOT_RUN',
      'RUNNING',
      'BLOCKED',
      'PASS',
      'FAIL',
      'INCONCLUSIVE',
    ]),
    failureStage: z.enum(STAGES).nullable(),
    failureReason: z
      .enum([
        'configuration',
        'environment',
        'revision',
        'preflight',
        'operation',
        'generator_limited',
      ])
      .nullable(),
    outsider: z.enum(['not_run', 'rejected', 'failed']),
    outsiderDiagnostics: outsiderDiagnosticsSchema.optional(),
    rounds: z
      .array(
        z.object({
          position: z.number().int().min(1).max(3),
          answerCount: finite.int(),
          distinctParticipants: finite.int(),
          timing: statistic,
          snapshotsMatched: z.boolean(),
        }),
      )
      .max(3),
    metrics: z
      .array(
        z.object({
          stage: actorStageSchema.shape.stage,
          firstObservation: statistic,
          subsequent: statistic,
        }),
      )
      .max(6),
    coldStartAttribution: z.literal('unavailable'),
    physicalDeviceProof: z.literal(false),
    replacesAcLive012: z.literal(false),
    current_stage: z.enum(STAGES).optional(),
    last_completed_stage: z.enum(STAGES).optional(),
    stage_status: z
      .enum(['cleanup', 'completed', 'failed', 'finished', 'running'])
      .optional(),
  })
  .superRefine((receipt, context) => {
    const counts = capacityProfileCounts(receipt);
    const invalid = () => {
      context.addIssue({
        code: 'custom',
        message: 'LIVE_CAPACITY_EVIDENCE_INVALID',
      });
    };
    if (
      receipt.actors.length !== receipt.totalActors ||
      receipt.browserContexts !== counts.browserContexts ||
      new Set(receipt.actors.map((actor) => actor.index)).size !==
        receipt.totalActors
    )
      invalid();
    for (let index = 0; index < receipt.totalActors; index += 1) {
      const actor = receipt.actors[index];
      const transport =
        receipt.profile !== 'protocol' && index < 3 ? 'browser' : 'sdk';
      if (
        actor?.index !== index + 1 ||
        actor.role !== (index === 0 ? 'host' : 'participant') ||
        actor.transport !== transport ||
        (actor.uiProof === 'not_applicable') !== (transport === 'sdk')
      )
        invalid();
    }
    if (
      (receipt.profile === 'protocol' && receipt.browserParticipants !== 0) ||
      (receipt.profile !== 'protocol' && receipt.browserParticipants !== 2) ||
      (receipt.profile === 'browser' && receipt.totalActors !== 3)
    )
      invalid();
    if (
      receipt.result === 'PASS' &&
      (receipt.cleanup.status !== 'verified' ||
        receipt.generatorHealth.limited ||
        receipt.outsider !== 'rejected' ||
        receipt.rounds.length !== 3 ||
        receipt.actors.some(
          (actor) =>
            actor.status !== 'completed' ||
            actor.requests === 'unavailable' ||
            actor.broadcasts === 'unavailable' ||
            actor.broadcasts === 0 ||
            (actor.uiProof !== 'not_applicable' &&
              (!actor.uiProof.login ||
                !actor.uiProof.join ||
                (actor.role === 'participant' &&
                  actor.uiProof.answerRounds !== 3))),
        ) ||
        receipt.rounds.some(
          (round, index) =>
            round.position !== index + 1 ||
            round.answerCount !== receipt.totalActors - 1 ||
            round.distinctParticipants !== receipt.totalActors - 1 ||
            !round.snapshotsMatched ||
            round.timing === null ||
            round.timing.p95_ms > 800,
        ))
    )
      invalid();
  });
export type CapacityReceipt = z.infer<typeof receiptSchema>;
export const sanitizeCapacityReceipt = (value: unknown): CapacityReceipt =>
  receiptSchema.parse(value);
export const createCapacityReceipt = (
  config: CapacityConfig,
  repoSha: string,
): CapacityReceipt =>
  sanitizeCapacityReceipt({
    schemaVersion: 1,
    runId: config.runId,
    repoSha,
    webRevision: null,
    environment: config.environment,
    profile: config.profile,
    totalActors: config.totalActors,
    browserParticipants: config.browserParticipants,
    browserContexts: capacityProfileCounts(config).browserContexts,
    actors: Array.from(
      { length: config.totalActors },
      (_value, index): ActorEvidence => {
        const browser = config.profile !== 'protocol' && index < 3;
        return {
          index: index + 1,
          role: index === 0 ? 'host' : 'participant',
          transport: browser ? 'browser' : 'sdk',
          status: 'not_run',
          requests: 'unavailable',
          broadcasts: 'unavailable',
          timings: [],
          ...(browser
            ? {
                browserJoinDiagnostics: {
                  join: emptyBrowserJoinSnapshot(index + 1),
                  subscribe: emptyBrowserJoinSnapshot(index + 1),
                },
              }
            : {}),
          uiProof: browser
            ? { login: false, join: false, answerRounds: 0 }
            : 'not_applicable',
        };
      },
    ),
    stages: [],
    generatorHealth: initialGeneratorHealth(),
    cleanup: { status: 'not_run', sharedIpLimiter: 'preserved' },
    result: 'NOT_RUN',
    failureStage: null,
    failureReason: null,
    outsider: 'not_run',
    outsiderDiagnostics: emptyOutsiderDiagnostics(),
    rounds: [],
    metrics: [],
    coldStartAttribution: 'unavailable',
    physicalDeviceProof: false,
    replacesAcLive012: false,
  });
export const summarizeActorMetrics = (
  actors: readonly ActorEvidence[],
): CapacityReceipt['metrics'] => {
  const stages: ActorStage[] = [
    'login',
    'classroom_join',
    'live_join',
    'subscribe',
    'snapshot',
    'answer',
  ];
  return stages.map((stage) => {
    const values = actors.flatMap((actor) =>
      actor.timings.filter((timing) => timing.stage === stage),
    );
    const summarize = (sample: 'first' | 'subsequent') => {
      const durations = values
        .filter((value) => value.sample === sample)
        .map((value) => value.elapsedMs);
      return durations.length === 0 ? null : summarizeDurations(durations);
    };
    return {
      stage,
      firstObservation: summarize('first'),
      subsequent: summarize('subsequent'),
    };
  });
};
export const writeCapacityReceipt = async (
  path: string,
  receipt: CapacityReceipt,
) => writeSafeJson(path, sanitizeCapacityReceipt(receipt));
