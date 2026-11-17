import {
  observeSendBatch,
  observeSendPerform,
} from './capacity-send-diagnostics';
import { generatorEmit } from './capacity-generator-diagnostics';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { capacityFailure, requireCapacityScope } from './capacity-scope';
import {
  validateCapacityManifest,
  findCapacityLeg,
  assertFreshCohort,
} from './capacity-manifest';
import { assertCapacityPredecessor } from './capacity-receipt';
import { evaluateBarrier } from './capacity-metrics';
import {
  runCapacityEntryBarrier,
  settleCapacityActors,
  dispatchCapacityActions,
  capacityActorStem,
  type CapacityEntryIdentity,
} from './capacity-browser-entry';
import { createCapacityMailbox } from './capacity-mailbox';
import {
  actualUi,
  newCapacityRegistrationReport,
  capacityRegistrationReportSchema,
  type CapacityRegistrationOptions,
} from './capacity-registration-ui';
export type { CapacityRegistrationOptions } from './capacity-registration-ui';
export { capacityRegistrationReportSchema } from './capacity-registration-ui';
import {
  capacityRegistrationActorSchema,
  capacityRegistrationFreshSchema,
  validateCapacityRegistrationOwnership,
  createCapacityReadbackQueue,
  type CapacityRegistrationOwnershipInput,
  type CapacityRegistrationOwnershipProof,
} from './capacity-registration-ownership';
export type {
  CapacityPrivateRegistrationActor,
  CapacityRegistrationOwnershipInput,
  CapacityRegistrationOwnershipProof,
  CapacityRegistrationOracle,
} from './capacity-registration-ownership';
export const runCapacityRegistration = async (
  options: CapacityRegistrationOptions,
) => {
  const { scope, plan, legId, signal, journal, oracle, runtime } = options;
  generatorEmit(runtime.generator, 'REGISTRATION', 'ENTERED');
  requireCapacityScope(scope);
  validateCapacityManifest(plan, scope);
  const leg = findCapacityLeg(plan, legId);
  assertCapacityPredecessor(plan, legId, options.predecessors, scope);
  if (
    leg.scenario !== 'fresh_registration' ||
    leg.mode !== 'NATIVE_BROWSER' ||
    ![40, 60].includes(leg.actors) ||
    typeof oracle.fresh !== 'function' ||
    typeof oracle.capture !== 'function' ||
    typeof options.subject !== 'function' ||
    signal.aborted
  )
    return capacityFailure();
  const size = leg.actors === 40 ? 40 : 60,
    actors = z
      .array(capacityRegistrationActorSchema)
      .length(size)
      .parse(options.actors),
    classroom = z
      .strictObject({
        classroomId: z.uuid(),
        joinCode: z.string().regex(/^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{8})?$/u),
      })
      .parse(options.classroom);
  if (
    actors.some(
      (actor, index) =>
        actor.actorIndex !== index || actor.alias !== leg.members[index],
    ) ||
    new Set(actors.map((actor) => actor.email)).size !== size ||
    new Set(actors.map((actor) => actor.account)).size !== size
  )
    return capacityFailure();
  const first = actors[0];
  if (!first) return capacityFailure();
  const local = first.email.split('@')[0];
  if (!local) return capacityFailure();
  const cohortPrefix = local.slice(0, local.lastIndexOf('.') + 1);
  if (
    !cohortPrefix.startsWith(scope.planId + '.') ||
    actors.some((actor) => !actor.email.startsWith(cohortPrefix))
  )
    return capacityFailure();
  const now = options.now ?? (() => performance.now()),
    began = now(),
    ui = options.ui ?? actualUi,
    queue = createCapacityReadbackQueue();
  const states = actors.map((actor) => ({
    actor,
    sent: false,
    verified: false,
    completed: false,
    unknown: false,
    subject: null as string | null,
    sendIntentName: null as string | null,
    sendIntentAtUtc: null as string | null,
    ownership: null as CapacityRegistrationOwnershipProof | null,
    mailObservedAfterSendMs: null as number | null,
    verifyUiMs: null as number | null,
    completeUiMs: null as number | null,
    postLoginUiMs: null as number | null,
    readbackDriverMs: 0,
  }));
  const report = newCapacityRegistrationReport(size);
  let fresh: z.infer<typeof capacityRegistrationFreshSchema> | null = null,
    mailbox: ReturnType<typeof createCapacityMailbox> | null = null,
    stopping = false;
  const check = () => {
    signal.throwIfAborted();
    if (stopping) return capacityFailure();
  };
  const capture = async (
    index: number,
    stage: CapacityRegistrationOwnershipInput['stage'],
  ) => {
    const state = states[index];
    if (!state || !fresh) return capacityFailure();
    const baseline = fresh;
    const at = now();
    try {
      return await queue.run(async () => {
        const input: CapacityRegistrationOwnershipInput = {
          scope,
          legId,
          cohortSize: size,
          classroomId: classroom.classroomId,
          actor: state.actor,
          freshProofSha256: baseline.readOnlyProofSha256,
          checkedAtDatabaseUtc: baseline.checkedAtDatabaseUtc,
          sendIntentName: state.sendIntentName,
          sendIntentAtUtc: state.sendIntentAtUtc,
          verifiedSubject: state.subject,
          stage,
        };
        const proof = validateCapacityRegistrationOwnership(
          input,
          await oracle.capture(input),
        );
        state.ownership = proof;
        return proof;
      });
    } finally {
      state.readbackDriverMs += Math.max(0, now() - at);
    }
  };
  try {
    fresh = capacityRegistrationFreshSchema.parse(
      await oracle.fresh({
        scope,
        legId,
        cohortSize: size,
        classroomId: classroom.classroomId,
        actors,
      }),
    );
    if (fresh.databaseIdentitySha256 !== scope.databaseIdentitySha256)
      return capacityFailure();
    assertFreshCohort(plan, size, fresh.existingAliases, scope);
    report.phase = 'intent';
    await settleCapacityActors(
      states.map((state) =>
        journal.write(
          capacityActorStem(legId, state.actor.actorIndex) + '-intent',
          {
            schemaVersion: 1,
            kind: 'CAPACITY_REGISTRATION_ACTOR_INTENT',
            planId: scope.planId,
            sourceRevision: scope.sourceRevision,
            legId,
            cohortSize: size,
            classroomId: classroom.classroomId,
            actor: state.actor,
            freshProofSha256: fresh?.readOnlyProofSha256,
            checkedAtDatabaseUtc: fresh?.checkedAtDatabaseUtc,
          },
        ),
      ),
    );
    report.phase = 'before_send';
    await settleCapacityActors(
      states.map((state) => capture(state.actor.actorIndex, 'before_send')),
    );
    check();
    mailbox = (options.mailboxFactory ?? createCapacityMailbox)(
      scope,
      { prefix: cohortPrefix, recipients: actors.map((actor) => actor.email) },
      signal,
    );
    await mailbox.baseline();
    const identities: CapacityEntryIdentity[] = actors.map((actor) => ({
      alias: actor.alias,
      account: actor.account,
      password: actor.password,
      displayName: actor.nickname,
      role: 'student',
      userId: null,
      email: actor.email,
      fullName: actor.fullName,
      nickname: actor.nickname,
      classCode: classroom.joinCode,
    }));
    report.phase = 'entry';
    const entry = await runCapacityEntryBarrier({
      scope,
      plan,
      legId,
      predecessors: options.predecessors,
      runtime,
      journal,
      signal,
      identities,
      ...(options.entryUi ? { ui: options.entryUi } : {}),
      readback: () => Promise.reject(new Error('CAPACITY_EVIDENCE_INVALID')),
    });
    report.entrySkewMs = entry.report.entry?.skewMs ?? null;
    if (entry.report.result !== 'PASS') {
      report.result = entry.report.result;
      return capacityFailure();
    }
    if (options.sendDiagnostics)
      await options.sendDiagnostics.prepare(entry.actors, ui);
    check();
    report.phase = 'send';
    await settleCapacityActors(
      states.map(async (state) => {
        if (!fresh) return capacityFailure();
        const name =
            capacityActorStem(legId, state.actor.actorIndex) +
            '-otp-send-intent',
          issuedAtUtc = new Date().toISOString();
        await journal.write(name, {
          schemaVersion: 1,
          kind: 'CAPACITY_REGISTRATION_OTP_SEND_INTENT',
          planId: scope.planId,
          sourceRevision: scope.sourceRevision,
          legId,
          cohortSize: size,
          actorIndex: state.actor.actorIndex,
          alias: state.actor.alias,
          email: state.actor.email,
          account: state.actor.account,
          classroomId: classroom.classroomId,
          freshProofSha256: fresh.readOnlyProofSha256,
          checkedAtDatabaseUtc: fresh.checkedAtDatabaseUtc,
          issuedAtUtc,
        });
        state.sendIntentName = name;
        state.sendIntentAtUtc = issuedAtUtc;
      }),
    );
    check();
    const sendAt = now();
    const sent = await observeSendBatch(options.sendDiagnostics, () =>
      dispatchCapacityActions(
        entry.actors,
        'otp_send',
        (actor) =>
          observeSendPerform(options.sendDiagnostics, actor, () => {
            check();
            return options.sendDiagnostics
              ? ui.send(
                  actor,
                  check,
                  options.sendDiagnostics.clickObserver(actor),
                )
              : ui.send(actor, check);
          }),
        signal,
        async (actor, response) => {
          const state = states[actor.actorIndex];
          if (!state) return capacityFailure();
          state.sent = true;
          await journal.write(
            capacityActorStem(legId, actor.actorIndex) + '-otp-send-confirmed',
            { schemaVersion: 1, actorIndex: actor.actorIndex, response },
          );
        },
      ),
    );
    report.sendBarrier = evaluateBarrier(
      sent.map(({ actorIndex, requestAtMs, clock }) => ({
        actorIndex,
        requestAtMs,
        clock,
      })),
      size,
    );
    if (report.sendBarrier.result !== 'VALID') {
      report.result = 'INCONCLUSIVE';
      return capacityFailure();
    }
    report.phase = 'mail';
    const codes = await mailbox.wait(),
      arrivals = mailbox.arrivals();
    await settleCapacityActors(
      entry.actors.map(async (actor) => {
        const state = states[actor.actorIndex],
          identity = identities[actor.actorIndex];
        if (!state || !identity) return capacityFailure();
        try {
          check();
          const code = codes.get(state.actor.email),
            arrival = arrivals.get(state.actor.email);
          if (
            !code ||
            !/^\d{6}$/u.test(code) ||
            arrival === undefined ||
            arrival < sendAt
          )
            return capacityFailure();
          state.mailObservedAfterSendMs = arrival - sendAt;
          report.phase = 'verify';
          await journal.write(
            capacityActorStem(legId, actor.actorIndex) + '-otp-verify-intent',
            { actorIndex: actor.actorIndex },
          );
          check();
          let at = now();
          await dispatchCapacityActions(
            [actor],
            'otp_verify',
            (item) => {
              check();
              return ui.verify(item, code, check);
            },
            signal,
            async (_item, response) => {
              await journal.write(
                capacityActorStem(legId, actor.actorIndex) +
                  '-otp-verify-response',
                response,
              );
            },
          );
          state.verifyUiMs = Math.max(0, now() - at);
          state.verified = true;
          state.subject = z
            .uuid()
            .parse(
              await queue.run(() => options.subject(actor, 'after_verify')),
            );
          await capture(actor.actorIndex, 'after_verify');
          check();
          report.phase = 'complete';
          await journal.write(
            capacityActorStem(legId, actor.actorIndex) +
              '-registration-complete-intent',
            { actorIndex: actor.actorIndex },
          );
          check();
          at = now();
          await dispatchCapacityActions(
            [actor],
            'registration_complete',
            (item) => {
              check();
              return ui.complete(item, identity, check);
            },
            signal,
            async (_item, response) => {
              await journal.write(
                capacityActorStem(legId, actor.actorIndex) +
                  '-registration-complete-response',
                response,
              );
            },
          );
          state.completeUiMs = Math.max(0, now() - at);
          check();
          report.phase = 'post_login';
          at = now();
          await journal.write(
            capacityActorStem(legId, actor.actorIndex) + '-post-login-intent',
            { actorIndex: actor.actorIndex },
          );
          check();
          await ui.postLogin(
            actor,
            { ...identity, userId: state.subject },
            signal,
            check,
          );
          state.postLoginUiMs = Math.max(0, now() - at);
          const logged = z
            .uuid()
            .parse(await queue.run(() => options.subject(actor, 'post_login')));
          if (logged !== state.subject) return capacityFailure();
          report.phase = 'readback';
          await capture(actor.actorIndex, 'completed');
          check();
          state.completed = true;
          await journal.write(
            capacityActorStem(legId, actor.actorIndex) + '-confirmed',
            {
              actorIndex: actor.actorIndex,
              userId: state.subject,
              rootProof: state.ownership,
            },
          );
        } catch {
          stopping = true;
          throw new Error('CAPACITY_EVIDENCE_INVALID');
        }
      }),
    );
    if (
      !runtime.snapshot().available ||
      entry.actors.some((actor) => {
        const sample = actor.observer.snapshot();
        return (
          !sample.available ||
          sample.pendingAction ||
          sample.unexpectedHttpErrors !== 0 ||
          sample.unexpectedNetworkFailures !== 0
        );
      })
    )
      return capacityFailure();
    report.result = 'PASS';
    report.phase = 'complete_cohort';
  } catch {
    if (report.result !== 'INCONCLUSIVE') report.result = 'FAIL';
  } finally {
    if (report.result !== 'PASS' && fresh)
      await Promise.allSettled(
        states.map(async (state) => {
          try {
            await capture(state.actor.actorIndex, 'partial_failure');
          } catch {
            state.unknown = true;
          }
          await journal
            .write(
              capacityActorStem(legId, state.actor.actorIndex) + '-partial',
              {
                actorIndex: state.actor.actorIndex,
                sendIntentName: state.sendIntentName,
                verifiedSubject: state.subject,
                ownership: state.ownership,
              },
            )
            .catch(() => {
              state.unknown = true;
            });
        }),
      );
    await queue.settle();
    if (mailbox)
      try {
        await mailbox.dispose();
        report.mailboxClosed = true;
      } catch {
        report.result = 'FAIL';
      }
    else report.mailboxClosed = true;
  }
  try {
    check();
  } catch {
    if (report.result === 'PASS') report.result = 'INCONCLUSIVE';
  }
  report.completedActors = states.filter((state) => state.completed).length;
  report.ownershipKnown = states.every(
    (state) =>
      state.ownership !== null &&
      state.ownership.ownership !== 'UNKNOWN' &&
      !state.unknown,
  );
  report.authCreatedActors = report.ownershipKnown
    ? states.filter(
        (state) => state.ownership?.ownership === 'OWNED_BY_OTP_INTENT',
      ).length
    : null;
  report.actors = states.map((state) => ({
    actorIndex: state.actor.actorIndex,
    sent: state.sent,
    verified: state.verified,
    completed: state.completed,
    unknown:
      state.unknown ||
      state.ownership === null ||
      state.ownership.ownership === 'UNKNOWN',
    mailObservedAfterSendMs: state.mailObservedAfterSendMs,
    verifyUiMs: state.verifyUiMs,
    completeUiMs: state.completeUiMs,
    postLoginUiMs: state.postLoginUiMs,
    readbackDriverMs: state.readbackDriverMs,
  }));
  report.elapsedMs = Math.max(0, now() - began);
  if (
    report.result === 'PASS' &&
    (report.completedActors !== size ||
      !report.ownershipKnown ||
      !report.mailboxClosed)
  )
    report.result = 'FAIL';
  generatorEmit(
    runtime.generator,
    'REGISTRATION',
    report.result === 'PASS' ? 'COMPLETED' : 'FAILED',
  );
  return { report: capacityRegistrationReportSchema.parse(report) };
};
