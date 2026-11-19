import { createCapacityLiveQuestionObservation } from './capacity-live-question-observation';
import { captureCapacityOperationLifecycle } from './capacity-operation-diagnostics';
import {
  createCapacityGameDiagnostics,
  captureCapacityOperationAccounting,
} from './capacity-game-diagnostics';
import { createCapacitySendDiagnostics } from './capacity-send-diagnostics';
import { createCapacityErrorCounts } from './capacity-onboarding-console';
import {
  createGeneratorDiagnostics,
  finishGeneratorJournal,
  generatorEmit,
  generatorOperation,
} from './capacity-generator-diagnostics';
import type { CapacityRunDiagnostics } from './capacity-run-diagnostics';
import { runCapacityGameLoad } from './capacity-game-load';
import {
  capacityClassroomSchema as classSchema,
  readCapacityPlanRecord,
  ensureCapacityClassrooms,
  capacityRegistrationClassroom,
} from './capacity-classrooms';
import { expect } from '@playwright/test';
import { createClassroomRepository } from '../../src/features/classrooms/api/classroom-repository';
import { createProfileRepository } from '../../src/features/profile/api/profile-repository';
import { fetchStudentChapterMap } from '../../src/features/learning/api/chapter-map';
import { sessionTokensFromPage } from '../../tests/e2e/helpers/staging-capacity-browser';
import {
  createNativeCapacityBrowser,
  readCapacityOnboardingConsoleEvidence,
  type NativeCapacityActor,
} from './capacity-browser-runtime';
import { createCapacityOperationObserver } from './capacity-operation-observer';
import {
  createCapacityProtocolActor,
  capacityTransportAccounting,
} from './capacity-protocol';
import {
  runCapacityEntryBarrier,
  settleCapacityActors,
} from './capacity-browser-entry';
import { runCapacityRegistration } from './capacity-registration';
import { createCapacityCollector } from './capacity-collector';
import { capacityGameActor } from './capacity-game';
import {
  runCapacityLiveGame,
  type CapacityGameActor,
} from './capacity-live-game';
import { evaluateBarrier } from './capacity-metrics';
import {
  capacityFailure,
  requireCapacityScope,
  capacityExecutionProfile,
} from './capacity-scope';
import type { CapacityRuntime } from './capacity-runtime';
import {
  resolveCapacitySubjects,
  type CapacityPrivateActor,
} from './capacity-private-plan';
const requireValue = <T>(value: T | null | undefined): T =>
  value ?? capacityFailure();

export const createCapacityJourneys = (
  runtime: CapacityRuntime,
  signal: AbortSignal,
  onInvalid: () => void,
  diagnostics?: CapacityRunDiagnostics,
) => {
  const { scope, manifest, leg } = runtime;
  requireCapacityScope(scope);
  const profile = capacityExecutionProfile(scope);
  const generator =
    process.platform === 'linux' && profile && leg.mode === 'NATIVE_BROWSER'
      ? createGeneratorDiagnostics({
          sourceRevision: scope.sourceRevision,
          planId: scope.planId,
          legId: leg.legId,
          executionProfileSha256: profile.sha256,
        })
      : undefined;
  const sendDiagnostics =
    generator && profile && leg.scenario === 'fresh_registration'
      ? createCapacitySendDiagnostics({
          sourceRevision: scope.sourceRevision,
          planId: scope.planId,
          legId: leg.legId,
          executionProfileSha256: profile.sha256,
          actorsExpected: leg.actors,
        })
      : undefined;
  const gameDiagnostics = createCapacityGameDiagnostics();
  const liveQuestionObservation = createCapacityLiveQuestionObservation(
    scope,
    signal,
  );
  let stopping = false,
    business = 0,
    id = 0;
  const native =
    leg.mode === 'NATIVE_BROWSER'
      ? createNativeCapacityBrowser(
          scope,
          signal,
          undefined,
          generator?.observe,
        )
      : null;
  const clients: ReturnType<typeof createCapacityProtocolActor>[] = [],
    observers = new Map<
      number,
      Awaited<ReturnType<typeof createCapacityOperationObserver>>
    >();
  const initialReads = new Map<
    number,
    {
      finish: () => void;
      task: Promise<unknown>;
    }
  >();
  const errors = createCapacityErrorCounts(
    readCapacityOnboardingConsoleEvidence,
  );
  const check = () => {
    if (stopping || signal.aborted) return capacityFailure();
  };
  const nextId = () => `op-${String(++id).padStart(6, '0')}`;
  const createClient = (
    identity: CapacityPrivateActor,
    index: number,
    onLoginRequest?: (at: number) => void,
  ) => {
    check();
    const client = createCapacityProtocolActor(
      scope,
      runtime.anonKey,
      identity,
      index,
      signal,
      nextId,
      {
        businessActive: () => business > 0,
        ...(onLoginRequest ? { onLoginRequest } : {}),
      },
    );
    clients.push(client);
    return client;
  };
  const collector = createCapacityCollector(leg.mode, signal, {
    host: (owned) =>
      runtime.host(
        native
          ? { mode: leg.mode, ...native.identity() }
          : { mode: 'NODE_PROTOCOL', nodePid: process.pid },
        owned,
      ),
    ...(capacityExecutionProfile(scope)
      ? {
          executionProfileAuthority:
            capacityExecutionProfile(scope) ?? capacityFailure(),
          backend: runtime.backend,
        }
      : { vm: runtime.vm }),
    onInvalid,
    ...(generator
      ? { passiveLoop: generator.interval, passiveHealth: generator.health }
      : {}),
    ...(diagnostics ? { diagnostics } : {}),
  });
  const browser = {
    ...(generator ? { generator: generator.observe } : {}),
    ...(diagnostics ? { diagnostics } : {}),
    start: async () => {
      if (!native) return capacityFailure();
      check();
      generator?.start();
      await generatorOperation(generator?.observe, 'NATIVE_START', null, () =>
        native.start(),
      );
      check();
      await generatorOperation(generator?.observe, 'BASELINE', null, () =>
        collector.start(),
      );
      check();
    },
    snapshot: () => native?.snapshot() ?? { available: false },
    createActor: async (index: number) => {
      check();
      if (!native) return capacityFailure();
      const actor = await native.createActor(index);
      check();
      errors.track(actor);
      liveQuestionObservation.register(actor);
      const observer = await generatorOperation(
        generator?.observe,
        'OPERATION_OBSERVER',
        index,
        () =>
          createCapacityOperationObserver(
            scope,
            actor.context,
            actor.page,
            index,
            signal,
            nextId,
            () => business > 0,
          ),
      );
      check();
      observers.set(index, observer);
      if (leg.scenario !== 'anonymous_entry_prepare') {
        let finish!: () => void;
        const ready = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const task = observer.run(
          leg.scenario === 'existing_login_game' && index === 0
            ? 'teacher_dashboard'
            : 'published_content',
          'cold',
          () => ready,
        );
        void task.catch(() => undefined);
        initialReads.set(index, { finish, task });
      }
      return actor;
    },
  };
  const fromPage = async (
    actor: NativeCapacityActor,
    identity: CapacityPrivateActor,
  ) => {
    const client = createClient(identity, actor.actorIndex),
      tokens = await sessionTokensFromPage(actor.page, scope.supabaseUrl);
    check();
    if ((await client.client.auth.setSession(tokens)).error)
      return capacityFailure();
    const user = await client.client.auth.getUser();
    if (
      user.error ||
      !user.data.user.id ||
      (identity.userId !== null && identity.userId !== user.data.user.id)
    )
      return capacityFailure();
    return client;
  };
  const subjects = async (aliases: readonly string[]) =>
    resolveCapacitySubjects(
      runtime.privatePlan,
      aliases,
      (await runtime.subjects(aliases)).subjects,
    );
  const initialDone = async () => {
    for (const read of initialReads.values()) read.finish();
    const result = await Promise.allSettled(
      [...initialReads.values()].map((read) => read.task),
    );
    if (result.some((r) => r.status === 'rejected')) return capacityFailure();
  };
  const actorFor = (
    protocol: ReturnType<typeof createCapacityProtocolActor>,
    page?: NativeCapacityActor,
  ) =>
    capacityGameActor(
      protocol,
      page?.page,
      page ? requireValue(observers.get(page.actorIndex)) : undefined,
    );
  return {
    run: async () => {
      check();
      let barriers: ReturnType<typeof evaluateBarrier>[],
        outsider: boolean | null = null;
      if (leg.scenario === 'anonymous_entry_prepare') {
        const before = await runtime.anonymous('before');
        let after: ReturnType<typeof runtime.anonymous> | null = null;
        const entry = await runCapacityEntryBarrier({
          ...(diagnostics ? { diagnostics } : {}),
          scope,
          plan: manifest,
          legId: leg.legId,
          predecessors: runtime.predecessors,
          runtime: browser,
          journal: runtime.planJournal,
          signal,
          readback: async (actor) => {
            const empty = await actor.page.evaluate(() => {
              const tab = sessionStorage.getItem('colorplay-auth-tab-id');
              const key = `sb-${new URL('http://127.0.0.1:58321').hostname.split('.')[0] ?? 'local'}-auth-token`;
              return (
                sessionStorage.getItem(tab ? `${key}-${tab}` : key) === null
              );
            });
            after ??= runtime.anonymous('after');
            const proof = await after;
            if (
              !empty ||
              proof.authSetSha256 !== before.authSetSha256 ||
              proof.ownedMailpitIdsSha256 !== before.ownedMailpitIdsSha256 ||
              proof.authCount !== before.authCount ||
              proof.messageCount !== before.messageCount
            )
              return capacityFailure();
            return {
              subject: null,
              role: null,
              account: null,
              bootstrapComplete: true,
              anonymousNoAuthOrMail: true,
              proofSha256: proof.readOnlyProofSha256,
            };
          },
        });
        await runtime.journal.write('entry-observations', entry.report);
        if (entry.report.result !== 'PASS') return capacityFailure();
        barriers = [requireValue(entry.report.entry)];
      } else if (leg.scenario === 'fresh_registration') {
        const teacherIdentity = requireValue((await subjects(['T1']))[0]),
          teacher = createClient(teacherIdentity, 0);
        await teacher.login();
        const classes = await ensureCapacityClassrooms(
            runtime,
            actorFor(teacher),
            signal,
          ),
          classroom = classes.find((c) => c.cohortSize === leg.actors);
        if (!classroom) return capacityFailure();
        const identities = runtime.privatePlan.actors.filter((a) =>
          leg.members.includes(a.alias),
        );
        const result = await runCapacityRegistration({
          ...(sendDiagnostics ? { sendDiagnostics } : {}),
          scope,
          plan: manifest,
          legId: leg.legId,
          predecessors: runtime.predecessors,
          actors: identities.map((a, index) => ({
            actorIndex: index,
            alias: a.alias,
            email: a.email,
            account: a.account,
            password: a.password,
            fullName: a.displayName,
            nickname: a.displayName,
          })),
          classroom: capacityRegistrationClassroom(classroom),
          runtime: browser,
          journal: runtime.planJournal,
          signal,
          oracle: runtime.registration,
          subject: async (actor) => {
            const identity = identities[actor.actorIndex];
            if (!identity) return capacityFailure();
            const client = await fromPage(actor, identity);
            const result = await client.client.auth.getUser();
            if (result.error) return capacityFailure();
            return result.data.user.id;
          },
        });
        await initialDone();
        await runtime.journal.write('registration-observations', result.report);
        if (result.report.result !== 'PASS') return capacityFailure();
        if (result.report.entrySkewMs === null || !result.report.sendBarrier)
          return capacityFailure();
        barriers = [
          {
            result: 'VALID',
            actorsExpected: leg.actors,
            requestsObserved: leg.actors,
            skewMs: result.report.entrySkewMs,
          },
          result.report.sendBarrier,
        ];
      } else {
        const identities = await subjects(leg.members),
          outsiderIdentity = requireValue((await subjects(['R1']))[0]);
        const classRecord = classSchema.parse(
          await readCapacityPlanRecord(
            runtime.journalRoot,
            'registration-classroom-60-confirmed',
          ),
        );
        const gameActors: CapacityGameActor[] = [];
        if (native) {
          const entry = await runCapacityEntryBarrier({
            ...(diagnostics ? { diagnostics } : {}),
            scope,
            plan: manifest,
            legId: leg.legId,
            predecessors: runtime.predecessors,
            runtime: browser,
            identities: identities.map((a) => ({
              ...a,
              role: a.role === 'teacher' ? 'teacher' : 'student',
            })),
            journal: runtime.planJournal,
            signal,
            readback: async (actor, expected) => {
              const identity = identities[actor.actorIndex];
              if (!identity || !expected) return capacityFailure();
              const protocol = await fromPage(actor, identity),
                profile = await createProfileRepository(
                  protocol.client,
                ).getMyProfile();
              if (
                profile.id !== identity.userId ||
                profile.displayName !== identity.displayName ||
                profile.role !== identity.role ||
                profile.role === 'admin'
              )
                return capacityFailure();
              if (identity.role === 'student') {
                const membership = await createClassroomRepository(
                  protocol.client,
                ).listMine();
                if (
                  membership.length !== 1 ||
                  membership[0]?.classroomId !== classRecord.classroomId
                )
                  return capacityFailure();
                await expect(
                  actor.page.locator(
                    '.lobby--map-fullscreen .chapter-map-shell',
                  ),
                ).toBeVisible();
              }
              gameActors[actor.actorIndex] = actorFor(protocol, actor);
              return {
                subject: identity.userId,
                role: profile.role,
                account: identity.account,
                bootstrapComplete: true,
                anonymousNoAuthOrMail: false,
                proofSha256: (await runtime.subjects([identity.alias]))
                  .readOnlyProofSha256,
              };
            },
          });
          await initialDone();
          await runtime.journal.write('entry-observations', entry.report);
          if (entry.report.result !== 'PASS') return capacityFailure();
          barriers = [
            requireValue(entry.report.entry),
            requireValue(entry.report.submit),
          ];
        } else {
          await collector.start();
          const requests: {
            actorIndex: number;
            requestAtMs: number;
            clock: 'NODE_PERFORMANCE';
          }[] = [];
          const actors = identities.map((identity, index) =>
            createClient(identity, index, (at) => {
              if (!requests.some((r) => r.actorIndex === index))
                requests.push({
                  actorIndex: index,
                  requestAtMs: at,
                  clock: 'NODE_PERFORMANCE',
                });
            }),
          );
          await runtime.journal.write('backend-login-barrier-intent', {
            actors: leg.actors,
          });
          check();
          await settleCapacityActors(actors.map((a) => a.login()));
          barriers = [evaluateBarrier(requests, leg.actors)];
          if (barriers[0]?.result !== 'VALID') return capacityFailure();
          for (const a of actors) {
            gameActors.push(actorFor(a));
            if (a.actorIndex > 0)
              await a.measure(
                'published_content',
                'cold',
                () => fetchStudentChapterMap(a.client),
                true,
              );
          }
        }
        const outside = createClient(outsiderIdentity, 0);
        await outside.login();
        await runCapacityGameLoad({
          scope,
          actors: gameActors,
          identities,
          classroomId: classRecord.classroomId,
          journal: runtime.journal,
          signal,
          onActive: (delta) => {
            business += delta;
          },
          stop: onInvalid,
          diagnostics: gameDiagnostics.observe,
        });
        check();
        const live = await runCapacityLiveGame(
          scope,
          gameActors,
          actorFor(outside),
          classRecord.classroomId,
          runtime.journal,
          signal,
          liveQuestionObservation,
        );
        outsider = live.outsiderDenied;
      }
      return {
        completed: Array.from({ length: leg.actors }, (_, i) => i),
        barriers,
        outsider,
        samples:
          leg.mode === 'NODE_PROTOCOL'
            ? clients.flatMap((c) => c.samples())
            : [...observers.values()].flatMap((o) => o.samples()),
        unexpectedErrors: errors.aggregate(),
      };
    },
    stop: async () => {
      let originalFailed = true;
      generatorEmit(generator?.observe, 'STOP', 'ENTERED');
      try {
        stopping = true;
        liveQuestionObservation.stopAccepting();
        for (const read of initialReads.values()) read.finish();
        const pending = [...initialReads.values()].map((r) => r.task);
        const results = await Promise.allSettled([
          ...pending,
          ...clients.map((c) => c.close()),
          ...[...observers.values()].map((o) => o.dispose()),
          ...(native ? [native.close()] : []),
        ]);
        errors.dispose();
        const health = await collector.stop();
        if (
          results.some((r) => r.status === 'rejected') ||
          collector.pending() !== 0 ||
          native?.snapshot().resourcesClosed === false
        )
          return capacityFailure();
        const diagnosticRuntime: {
          rootDiagnostics?: CapacityRuntime['rootDiagnostics'];
        } = runtime;
        await runtime.journal.write('transport-accounting', {
          mode: leg.mode,
          ...capacityTransportAccounting(clients, [...observers.values()]),
          rootHelperCalls: runtime.rootAccounting(),
          rootHelperDiagnostics: diagnosticRuntime.rootDiagnostics?.() ?? {
            schemaVersion: 1,
            collection: 'UNOBSERVED',
            clock: 'NODE_MONOTONIC',
            calls: [],
            overflow: false,
          },
          sqlStatementCount: 'UNAVAILABLE',
          nativeSloSource: 'CDP_HTTP_ONLY',
          browserErrors: errors.diagnostics(),
          gameWork: gameDiagnostics.seal(),
          operationLifecycle: [...observers.values()].map(
            captureCapacityOperationLifecycle,
          ),
          operationAccounting: [...observers.values()].map((observer) =>
            captureCapacityOperationAccounting(observer),
          ),
        });
        originalFailed = false;
        return health;
      } finally {
        await liveQuestionObservation.finish();
        await sendDiagnostics?.finish(runtime.journal);
        if (generator) {
          generatorEmit(
            generator.observe,
            'STOP',
            originalFailed ? 'FAILED' : 'COMPLETED',
          );
          await finishGeneratorJournal(
            generator,
            runtime.journal,
            originalFailed,
          );
        }
      }
    },
    health: () => collector.snapshot(),
  };
};
