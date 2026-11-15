import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  capacityFailure,
  requireCapacityScope,
  type CapacityScope,
} from './capacity-scope';
import {
  validateCapacityManifest,
  findCapacityLeg,
  type CapacityManifest,
} from './capacity-manifest';
import { assertCapacityPredecessor } from './capacity-receipt';
import { evaluateBarrier, barrierResultSchema } from './capacity-metrics';
import type { NativeCapacityActor } from './capacity-browser-runtime';
import type {
  CapacityActionPhase,
  CapacityActionObservation,
} from './capacity-request-observer';
import type { PrivateJournal } from './private-journal';
export const capacityEntryIdentitySchema = z.strictObject({
  alias: z.string().regex(/^(T1|REG(?:40|60)_[0-9]{2})$/u),
  account: z.string().regex(/^[a-z0-9]{3,20}$/u),
  password: z.string().min(6).max(128),
  displayName: z.string().min(2).max(40),
  role: z.enum(['student', 'teacher']),
  userId: z.uuid().nullable(),
  email: z.string().max(254).optional(),
  fullName: z.string().min(1).max(40).optional(),
  nickname: z.string().min(2).max(16).optional(),
  classCode: z
    .string()
    .regex(/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{8})?$/u)
    .optional(),
});
export type CapacityEntryIdentity = z.infer<typeof capacityEntryIdentitySchema>;
export interface CapacityEntryUi {
  landing: (actor: NativeCapacityActor, scope: CapacityScope) => Promise<void>;
  ready: (
    actor: NativeCapacityActor,
    scope: CapacityScope,
    identity: CapacityEntryIdentity | undefined,
    registration: boolean,
  ) => Promise<void>;
  submit: (actor: NativeCapacityActor) => Promise<void>;
  confirmed: (
    actor: NativeCapacityActor,
    identity: CapacityEntryIdentity,
  ) => Promise<void>;
}
const loginFields = async (
  actor: NativeCapacityActor,
  identity: CapacityEntryIdentity,
) => {
  if (identity.role === 'teacher')
    await actor.page.getByText('教師端登入', { exact: true }).click();
  await actor.page
    .getByRole('textbox', { name: '帳號', exact: true })
    .fill(identity.account);
  await actor.page.getByLabel('密碼', { exact: true }).fill(identity.password);
  await actor.page
    .getByRole('button', { name: '登入', exact: true })
    .waitFor({ state: 'visible' });
};
export const capacityEntryUi: CapacityEntryUi = {
  landing: async (actor, scope) => {
    if (actor.page.url() !== 'about:blank') return capacityFailure();
    await actor.page.goto(scope.appUrl);
    await actor.page
      .getByRole('heading', { name: 'ColorPlay', exact: true })
      .waitFor({ state: 'visible' });
  },
  ready: async (actor, scope, identity, registration) => {
    await actor.page
      .getByRole('link', { name: '開始冒險', exact: true })
      .click();
    await actor.page.waitForURL(
      (url) => url.origin === scope.appUrl && url.pathname === '/login',
    );
    if (!registration) {
      if (!identity) return capacityFailure();
      await loginFields(actor, identity);
      return;
    }
    await actor.page
      .getByRole('link', { name: '註冊帳號', exact: true })
      .click();
    await actor.page.waitForURL(
      (url) => url.origin === scope.appUrl && url.pathname === '/register',
    );
    await actor.page
      .getByLabel('名字', { exact: true })
      .fill(identity?.fullName ?? '匿名準備');
    await actor.page
      .getByLabel('暱稱', { exact: true })
      .fill(identity?.nickname ?? `準備${String(actor.actorIndex)}`);
    await actor.page
      .getByLabel('班級序號', { exact: true })
      .fill(identity?.classCode ?? 'ABCDEFGH');
    await actor.page
      .getByRole('button', { name: '下一步', exact: true })
      .click();
    await actor.page
      .getByLabel('E-mail', { exact: true })
      .fill(
        identity?.email ??
          `${scope.planId}.prepare.${String(actor.actorIndex)}@colorplay.test`,
      );
    await actor.page
      .getByRole('button', { name: '傳送驗證碼', exact: true })
      .waitFor({ state: 'visible' });
  },
  submit: async (actor) => {
    await actor.page.getByRole('button', { name: '登入', exact: true }).click();
  },
  confirmed: async (actor, identity) => {
    await actor.page.waitForURL(
      (url) =>
        url.pathname === (identity.role === 'teacher' ? '/teacher' : '/app'),
    );
    await actor.page
      .getByText(
        identity.role === 'teacher'
          ? `${identity.displayName}・教師端`
          : identity.displayName,
        { exact: true },
      )
      .first()
      .waitFor({ state: 'visible' });
    if (identity.role === 'teacher')
      await actor.page
        .getByRole('form', { name: '分析篩選', exact: true })
        .waitFor({ state: 'visible' });
    else
      await actor.page
        .locator('.lobby--map-fullscreen .chapter-map-shell')
        .waitFor({ state: 'visible' });
  },
};
export const capacityActorStem = (legId: string, index: number) =>
  `${legId.replaceAll('_', '-')}-a${String(index).padStart(2, '0')}`;
export const dispatchCapacityActions = async (
  actors: readonly NativeCapacityActor[],
  phase: CapacityActionPhase,
  perform: (actor: NativeCapacityActor) => Promise<void>,
  signal: AbortSignal,
  confirmed: (
    actor: NativeCapacityActor,
    observation: CapacityActionObservation,
  ) => Promise<void> = () => Promise.resolve(),
) => {
  signal.throwIfAborted();
  const armed: {
    actor: NativeCapacityActor;
    token: ReturnType<NativeCapacityActor['observer']['arm']>;
  }[] = [];
  try {
    for (const actor of actors)
      armed.push({ actor, token: actor.observer.arm(phase) });
  } catch {
    for (const { token } of armed) token.cancel();
    return capacityFailure();
  }
  const results = await Promise.allSettled(
    armed.map(async ({ actor, token }) => {
      try {
        signal.throwIfAborted();
        await perform(actor);
        const result = await token.finished;
        signal.throwIfAborted();
        await confirmed(actor, result);
        return result;
      } catch {
        token.cancel();
        return capacityFailure();
      }
    }),
  );
  if (results.some((result) => result.status !== 'fulfilled'))
    return capacityFailure();
  return results.map((result) =>
    result.status === 'fulfilled' ? result.value : capacityFailure(),
  );
};
const readbackSchema = z.strictObject({
  subject: z.uuid().nullable(),
  role: z.enum(['student', 'teacher']).nullable(),
  account: z
    .string()
    .regex(/^[a-z0-9]{3,20}$/u)
    .nullable(),
  bootstrapComplete: z.boolean(),
  anonymousNoAuthOrMail: z.boolean(),
  proofSha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type CapacityEntryReadback = z.infer<typeof readbackSchema>;
const action = z.strictObject({
  actorIndex: z.number().int().min(0).max(59),
  phase: z.enum([
    'entry',
    'login',
    'post_registration_login',
    'otp_send',
    'otp_verify',
    'registration_complete',
  ]),
  clock: z.literal('CHROMIUM_NETWORK_MONOTONIC'),
  requestAtMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  status: z.number().int().min(200).max(299),
  physicalRequests: z.literal(1),
});
export const capacityEntryReportSchema = z.strictObject({
  mode: z.literal('NATIVE_BROWSER'),
  journey: z.enum([
    'ANONYMOUS_PREPARATION_ONLY',
    'REGISTRATION_FORM_PREPARATION_ONLY',
    'EXISTING_LOGIN_ENTRY',
  ]),
  result: z.enum(['PASS', 'FAIL', 'INCONCLUSIVE']),
  phase: z.enum(['setup', 'entry', 'ready', 'submit', 'readback', 'complete']),
  actorsStarted: z.number().int().min(3).max(60),
  actorsCompleted: z.number().int().min(0).max(60),
  entry: barrierResultSchema.nullable(),
  submit: barrierResultSchema.nullable(),
  observations: z.array(action).max(120),
  uiElapsedMs: z.number().nonnegative(),
  readbackRequests: z.number().int().nonnegative(),
  anonymousNoMutationProof: z.boolean().nullable(),
});
export interface CapacityEntryOptions {
  scope: CapacityScope;
  plan: CapacityManifest;
  legId: string;
  predecessors: readonly { receiptBytes: string }[];
  runtime: {
    start: () => Promise<void>;
    createActor: (index: number) => Promise<NativeCapacityActor>;
    snapshot: () => { available: boolean };
  };
  identities?: readonly CapacityEntryIdentity[];
  journal: PrivateJournal;
  signal: AbortSignal;
  readback: (
    actor: NativeCapacityActor,
    identity: CapacityEntryIdentity | undefined,
  ) => Promise<CapacityEntryReadback>;
  ui?: CapacityEntryUi;
}
export const settleCapacityActors = async <T>(work: Promise<T>[]) => {
  const results = await Promise.allSettled(work);
  if (results.some((result) => result.status !== 'fulfilled'))
    return capacityFailure();
  return results.map((result) =>
    result.status === 'fulfilled' ? result.value : capacityFailure(),
  );
};
export const runCapacityEntryBarrier = async (
  options: CapacityEntryOptions,
) => {
  const { scope, plan, legId, runtime, journal, signal } = options;
  requireCapacityScope(scope);
  validateCapacityManifest(plan, scope);
  const leg = findCapacityLeg(plan, legId);
  assertCapacityPredecessor(plan, legId, options.predecessors, scope);
  if (
    leg.mode !== 'NATIVE_BROWSER' ||
    leg.scenario === 'backend_game' ||
    signal.aborted
  )
    return capacityFailure();
  const anonymous = leg.scenario === 'anonymous_entry_prepare',
    registration = leg.scenario === 'fresh_registration';
  if (!registration && typeof options.readback !== 'function')
    return capacityFailure();
  const identities = options.identities?.map((value) =>
    capacityEntryIdentitySchema.parse(value),
  );
  if (
    !anonymous &&
    (identities?.length !== leg.actors ||
      identities.some(
        (identity, index) =>
          identity.alias !== leg.members[index] ||
          (registration
            ? identity.role !== 'student' || identity.userId !== null
            : identity.userId === null),
      ))
  )
    return capacityFailure();
  const actors: NativeCapacityActor[] = [],
    ui = options.ui ?? capacityEntryUi,
    began = performance.now();
  const report = capacityEntryReportSchema.parse({
    mode: 'NATIVE_BROWSER',
    journey: anonymous
      ? 'ANONYMOUS_PREPARATION_ONLY'
      : registration
        ? 'REGISTRATION_FORM_PREPARATION_ONLY'
        : 'EXISTING_LOGIN_ENTRY',
    result: 'FAIL',
    phase: 'setup',
    actorsStarted: leg.actors,
    actorsCompleted: 0,
    entry: null,
    submit: null,
    observations: [],
    uiElapsedMs: 0,
    readbackRequests: 0,
    anonymousNoMutationProof: null,
  });
  try {
    await settleCapacityActors(
      Array.from({ length: leg.actors }, (_, index) =>
        journal.write(capacityActorStem(legId, index) + '-entry-intent', {
          schemaVersion: 1,
          planId: scope.planId,
          sourceRevision: scope.sourceRevision,
          legId,
          actorIndex: index,
          alias: identities?.[index]?.alias ?? null,
        }),
      ),
    );
    signal.throwIfAborted();
    await runtime.start();
    actors.push(
      ...(await settleCapacityActors(
        Array.from({ length: leg.actors }, (_, index) =>
          runtime.createActor(index),
        ),
      )),
    );
    report.phase = 'entry';
    const entries = await dispatchCapacityActions(
      actors,
      'entry',
      (actor) => ui.landing(actor, scope),
      signal,
    );
    report.observations.push(...entries);
    report.entry = evaluateBarrier(
      entries.map(({ actorIndex, requestAtMs, clock }) => ({
        actorIndex,
        requestAtMs,
        clock,
      })),
      leg.actors,
    );
    if (report.entry.result !== 'VALID') {
      report.result = 'INCONCLUSIVE';
      return {
        actors,
        report: capacityEntryReportSchema.parse({
          ...report,
          uiElapsedMs: performance.now() - began,
        }),
      };
    }
    report.phase = 'ready';
    await settleCapacityActors(
      actors.map((actor) =>
        ui.ready(
          actor,
          scope,
          identities?.[actor.actorIndex],
          registration || anonymous,
        ),
      ),
    );
    if (!registration && !anonymous) {
      report.phase = 'submit';
      await settleCapacityActors(
        actors.map((actor) =>
          journal.write(
            capacityActorStem(legId, actor.actorIndex) + '-login-intent',
            {
              schemaVersion: 1,
              planId: scope.planId,
              sourceRevision: scope.sourceRevision,
              legId,
              actorIndex: actor.actorIndex,
            },
          ),
        ),
      );
      const logins = await dispatchCapacityActions(
        actors,
        'login',
        ui.submit,
        signal,
      );
      report.observations.push(...logins);
      report.submit = evaluateBarrier(
        logins.map(({ actorIndex, requestAtMs, clock }) => ({
          actorIndex,
          requestAtMs,
          clock,
        })),
        leg.actors,
      );
      if (report.submit.result !== 'VALID') {
        report.result = 'INCONCLUSIVE';
        return {
          actors,
          report: capacityEntryReportSchema.parse({
            ...report,
            uiElapsedMs: performance.now() - began,
          }),
        };
      }
      await settleCapacityActors(
        actors.map((actor) => {
          const identity = identities?.[actor.actorIndex];
          return identity
            ? ui.confirmed(actor, identity)
            : Promise.reject(new Error('CAPACITY_EVIDENCE_INVALID'));
        }),
      );
    }
    if (!registration) {
      report.phase = 'readback';
      await settleCapacityActors(
        actors.map(async (actor) => {
          const identity = identities?.[actor.actorIndex];
          const proof = readbackSchema.parse(
            await options.readback(actor, identity),
          );
          report.readbackRequests++;
          if (
            !proof.bootstrapComplete ||
            (anonymous
              ? proof.subject !== null ||
                proof.role !== null ||
                !proof.anonymousNoAuthOrMail
              : proof.subject !== identity?.userId ||
                proof.role !== identity.role ||
                proof.account !== identity.account)
          )
            return capacityFailure();
          await journal.write(
            capacityActorStem(legId, actor.actorIndex) + '-entry-confirmed',
            { actorIndex: actor.actorIndex, proofSha256: proof.proofSha256 },
          );
        }),
      );
      report.anonymousNoMutationProof = anonymous ? true : null;
    }
    signal.throwIfAborted();
    if (
      !runtime.snapshot().available ||
      actors.some((actor) => {
        const state = actor.observer.snapshot();
        return (
          !state.available ||
          state.unexpectedHttpErrors !== 0 ||
          state.unexpectedNetworkFailures !== 0 ||
          state.pendingAction
        );
      })
    )
      return capacityFailure();
    report.actorsCompleted = leg.actors;
    report.result = 'PASS';
    report.phase = 'complete';
  } catch {
    report.result = 'FAIL';
  }
  report.uiElapsedMs = performance.now() - began;
  return { actors, report: capacityEntryReportSchema.parse(report) };
};
export const loginCapacityActor = async (
  actor: NativeCapacityActor,
  identity: CapacityEntryIdentity,
  signal: AbortSignal,
  ui: CapacityEntryUi = capacityEntryUi,
) => {
  signal.throwIfAborted();
  await loginFields(actor, identity);
  const result = await dispatchCapacityActions(
    [actor],
    'post_registration_login',
    ui.submit,
    signal,
  );
  await ui.confirmed(actor, identity);
  return result[0] ?? capacityFailure();
};
