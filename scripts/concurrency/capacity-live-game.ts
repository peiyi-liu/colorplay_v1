import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  expect,
  type Page,
  type WebSocket as PageSocket,
} from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { createLiveRepository } from '../../src/features/live/api/live-repository';
import { LiveRepositoryError } from '../../src/features/live/types';
import {
  attachDiagnostics,
  joinLiveThroughUi,
} from '../../tests/e2e/helpers/staging-capacity-browser';
import { isLiveBroadcast } from '../live/capacity-live-broadcast';
import {
  selectFunctionalLiveTemplate,
  bindFunctionalLiveSession,
  assertFunctionalLiveCount,
} from './teacher-live';
import { capacityFailure, type CapacityScope } from './capacity-scope';
import type { PrivateJournal } from './private-journal';
import type { CapacityOperation } from './capacity-manifest';
import type { OperationSample } from './capacity-metrics';
export interface CapacityGameActor {
  actorIndex: number;
  client: SupabaseClient<Database>;
  page?: Page;
  observePhysical?: (listener: () => void) => () => void;
  observed?: (operation: CapacityOperation) => boolean;
  measure<T>(
    op: CapacityOperation,
    cache: OperationSample['cache'],
    action: () => Promise<T>,
    readRetry?: boolean,
    replayOf?: string | null,
  ): Promise<T>;
}
import { createCapacityLiveGate } from './capacity-live-gate';
export { createCapacityLiveGate } from './capacity-live-gate';
import { createCapacityLiveDiagnostics } from './capacity-live-diagnostics';
export const runCapacityLiveGame = async (
  scope: CapacityScope,
  actors: readonly CapacityGameActor[],
  outsider: CapacityGameActor,
  classroomId: string,
  journal: PrivateJournal,
  signal: AbortSignal,
) => {
  const host = actors[0];
  if (!host || actors.length < 3 || actors.length > 60)
    return capacityFailure();
  const diagnostic = createCapacityLiveDiagnostics(signal),
    main = diagnostic.context(host.actorIndex),
    cleanup = diagnostic.context(null, true);
  const traces = actors.map((a) => diagnostic.context(a.actorIndex));
  const repository = createLiveRepository(host.client),
    gates = actors.map((a) =>
      createCapacityLiveGate(a.client, signal, (event) => {
        diagnostic.sdk(a.actorIndex, event);
      }),
    );
  const outsideGate = createCapacityLiveGate(
      outsider.client,
      signal,
      (event) => {
        diagnostic.sdk(outsider.actorIndex, event);
      },
    ),
    bindings: {
      page: Page;
      actorIndex: number;
      listener: (socket: PageSocket) => void;
      diagnostics: Awaited<ReturnType<typeof attachDiagnostics>>;
    }[] = [];
  const check = () => {
    if (signal.aborted) return capacityFailure();
  };
  try {
    for (const [index, a] of actors.entries())
      if (a.page) {
        const gate = gates[index] ?? capacityFailure();
        main.enter('ATTACH_DIAGNOSTICS');
        const diagnostics = await attachDiagnostics(a.page);
        main.returned();
        const listener = (socket: PageSocket) =>
          socket.on('framereceived', ({ payload }) => {
            if (isLiveBroadcast(payload)) gate.notify();
          });
        a.page.on('websocket', listener);
        bindings.push({
          page: a.page,
          actorIndex: a.actorIndex,
          listener,
          diagnostics,
        });
      }
    main.enter('SELECT_OPTIONS');
    const options = await repository.listSectionOptions();
    main.returned();
    main.enter('SELECT_TEMPLATE');
    const selected = selectFunctionalLiveTemplate(options);
    main.returned();
    main.enter('CREATE_INTENT');
    await journal.write('live-create-intent', {
      classroomId,
      sectionId: selected.sectionId,
    });
    main.returned();
    check();
    let sessionId: string, code: string;
    const presenter = host.page?.getByRole('region', {
      name: 'Live 投影模式',
      exact: true,
    });
    if (host.page && presenter) {
      main.enter('HOST_NAVIGATE');
      await host.page.goto('/teacher/live');
      main.returned();
      main.enter('HOST_CLASSROOM');
      await host.page
        .getByRole('combobox', { name: '1・選擇班級', exact: true })
        .selectOption(classroomId);
      main.returned();
      main.enter('HOST_TEMPLATE');
      await host.page
        .getByRole('group', { name: '選擇小節', exact: true })
        .locator('label')
        .filter({
          has: host.page.locator(`input[value="${selected.sectionId}"]`),
        })
        .click();
      main.returned();
      check();
      main.enter('HOST_CREATE');
      await host.page
        .getByRole('button', { name: '建立課堂', exact: true })
        .click();
      main.returned();
      const started = performance.now();
      main.enter('HOST_READY');
      await presenter
        .getByRole('button', { name: '開始遊戲', exact: true })
        .waitFor({ state: 'visible', timeout: 20000 });
      main.returned();
      main.enter('HOST_SESSION_ROUTE');
      sessionId =
        /\/teacher\/live\/([0-9a-f-]{36})/u.exec(
          new URL(host.page.url()).pathname,
        )?.[1] ?? capacityFailure();
      main.returned();
      main.enter('HOST_CODE');
      code = (await presenter.getByLabel('課堂代碼').innerText()).trim();
      main.returned();
      main.enter('HOST_ACK');
      if (
        !(await (
          bindings[0] ?? capacityFailure()
        ).diagnostics.waitForSubscriptionAck(
          Math.max(0, 20000 - (performance.now() - started)),
          signal,
        ))
      )
        return capacityFailure();
      main.returned();
    } else {
      main.enter('CREATE_ACTIVITY');
      const activity = await repository.createActivity({
        title: `容量 ${scope.planId}`,
        quizTemplateId: selected.quizTemplateId,
        sectionId: selected.sectionId,
        questionTimeLimitSeconds: 20,
      });
      main.returned();
      check();
      main.enter('CREATE_SESSION');
      const session = await repository.createSession({
        activityId: activity.activityId,
        classroomId,
        assignmentId: null,
      });
      main.returned();
      sessionId = session.sessionId;
      code = session.joinCode;
      main.enter('START_SESSION');
      await repository.startSession(sessionId, session.stateVersion);
      main.returned();
      main.enter('HOST_SUBSCRIBE');
      await (gates[0] ?? capacityFailure()).subscribe(sessionId);
      main.returned();
    }
    main.enter('CREATED_WRITE');
    await journal.write('live-created', {
      sessionId,
      classroomId,
    });
    main.returned();
    const joins = actors.slice(1).map(async (a, index) => {
      const trace = traces[index + 1] ?? diagnostic.context(a.actorIndex);
      try {
        check();
        if (a.page) {
          trace.enter('STUDENT_JOIN');
          const start = performance.now(),
            outcome = await joinLiveThroughUi([a.page], code, {
              actorIndex: a.actorIndex,
              observe: (snapshot) => {
                diagnostic.join(a.actorIndex, snapshot);
              },
            });
          trace.returned();
          const binding = bindings.find((b) => b.page === a.page);
          if (
            outcome[0]?.outcome !== 'connected' ||
            !(await (trace.enter('STUDENT_ACK'),
            binding?.diagnostics.waitForSubscriptionAck(
              Math.max(0, 20000 - (performance.now() - start)),
              signal,
            )))
          ) {
            trace.rejected('STUDENT_JOIN');
            return capacityFailure();
          }
          trace.returned();
        } else {
          trace.enter('STUDENT_API_JOIN');
          if (
            (
              await createLiveRepository(a.client).join({
                joinCode: code,
                requestId: randomUUID(),
              })
            ).sessionId !== sessionId
          )
            return capacityFailure();
          trace.returned();
          trace.enter('STUDENT_SUBSCRIBE');
          await (gates[index + 1] ?? capacityFailure()).subscribe(sessionId);
          trace.returned();
        }
      } catch (error) {
        trace.failed(error);
        throw error;
      }
    });
    main.enter('JOIN_BATCH');
    const joined = await Promise.allSettled(joins);
    main.returned();
    if (joined.some((r) => r.status === 'rejected')) {
      main.rejected('JOIN_BATCH');
      return capacityFailure();
    }
    let deniedJoin = false,
      deniedState = false;
    main.enter('OUTSIDER_JOIN');
    try {
      await createLiveRepository(outsider.client).join({
        joinCode: code,
        requestId: randomUUID(),
      });
    } catch (e) {
      main.caught(e);
      deniedJoin =
        e instanceof LiveRepositoryError && e.code === 'JOIN_INVALID_CODE';
    }
    main.returned();
    main.enter('OUTSIDER_STATE');
    try {
      await createLiveRepository(outsider.client).getState(sessionId);
    } catch (e) {
      main.caught(e);
      deniedState = e instanceof LiveRepositoryError && e.code === 'NOT_FOUND';
    }
    main.returned();
    main.predicate('OUTSIDER_JOIN', deniedJoin);
    main.predicate('OUTSIDER_STATE', deniedState);
    if (!deniedJoin || !deniedState) return capacityFailure();
    main.enter('OUTSIDER_REFUSAL');
    await outsideGate.subscribe(sessionId, true);
    main.returned();
    main.enter('LOBBY_STATE');
    const lobby = await repository.getState(sessionId);
    main.returned();
    main.enter('BIND_SESSION');
    const questionCount = await bindFunctionalLiveSession(
      host.client,
      { ...selected, sessionId, classroomId },
      lobby,
      signal,
    );
    main.returned();
    main.enter('PARTICIPANT_COUNT');
    if (lobby.participantCount !== actors.length - 1) return capacityFailure();
    main.returned();
    check();
    if (presenter) {
      main.enter('START_CLICK');
      await presenter
        .getByRole('button', { name: '開始遊戲', exact: true })
        .click();
      main.returned();
      main.enter('START_CONFIRM');
      await presenter
        .getByRole('alertdialog', { name: '立即開始', exact: true })
        .getByRole('button', { name: '開始', exact: true })
        .click();
      main.returned();
    } else {
      main.enter('OPEN_QUESTION');
      await repository.openQuestion(sessionId, lobby.stateVersion);
      main.returned();
    }
    for (let position = 1; position <= questionCount; position++) {
      main.enter('QUESTION_INTENT', position);
      await journal.write(`live-question-${String(position)}-intent`, {
        sessionId,
        position,
        questionCount,
      });
      main.returned();
      check();
      main.enter('QUESTION_BATCH', position);
      const answered = await Promise.allSettled(
        actors.slice(1).map(async (a, index) => {
          const trace = traces[index + 1] ?? diagnostic.context(a.actorIndex);
          try {
            trace.enter('QUESTION_STATE', position);
            const state = await (gates[index + 1] ?? capacityFailure()).wait(
              sessionId,
              (s) =>
                s.state === 'question_open' && s.currentPosition === position,
            );
            trace.returned();
            trace.enter('QUESTION_COUNT', position);
            assertFunctionalLiveCount(state, questionCount);
            trace.returned();
            trace.enter('QUESTION_OPTIONS', position);
            const q = state.question;
            if (!q?.prompt || !q.publicOptions.length) return capacityFailure();
            const choice =
                q.publicOptions[index % q.publicOptions.length] ??
                capacityFailure(),
              prompt = q.prompt;
            trace.returned();
            check();
            trace.enter('ANSWER_MEASURE', position);
            await a.measure('submit_answer', 'warm', async () => {
              if (a.page) {
                trace.enter('PROMPT_VISIBLE', position);
                await expect(
                  a.page.getByText(prompt, { exact: true }).first(),
                ).toBeVisible({ timeout: 20000 });
                trace.returned();
                trace.enter('OPTIONS_VISIBLE', position);
                const buttons = a.page
                  .getByRole('group', { name: '答案選項' })
                  .getByRole('button');
                await buttons
                  .first()
                  .waitFor({ state: 'visible', timeout: 20000 });
                trace.returned();
                check();
                trace.enter('ANSWER_RESPONSE', position);
                const response = a.page.waitForResponse(
                  (r) =>
                    new URL(r.url()).origin === scope.supabaseUrl &&
                    new URL(r.url()).pathname ===
                      '/rest/v1/rpc/submit_live_answer' &&
                    r.request().method() === 'POST',
                  { timeout: 20000 },
                );
                trace.returned();
                trace.enter('ANSWER_SETTLE', position);
                const settled = await Promise.allSettled([
                  response,
                  buttons.nth(index % q.publicOptions.length).click(),
                ]);
                if (
                  settled[0].status !== 'fulfilled' ||
                  settled[1].status !== 'fulfilled' ||
                  !settled[0].value.ok() ||
                  (await (trace.enter('ANSWER_FINISHED', position),
                  settled[0].value.finished())) !== null
                )
                  return capacityFailure();
                trace.returned('ANSWER_SETTLE');
              } else {
                trace.enter('ANSWER_API', position);
                await createLiveRepository(a.client).submitAnswer({
                  sessionQuestionId: q.questionId,
                  selectedOptionId: choice.id,
                  idempotencyKey: randomUUID(),
                });
                trace.returned();
              }
            });
            trace.returned();
          } catch (error) {
            trace.failed(error);
            throw error;
          }
        }),
      );
      main.returned();
      if (answered.some((r) => r.status === 'rejected'))
        return capacityFailure();
      main.enter('FEEDBACK_STATE', position);
      const feedback = await (gates[0] ?? capacityFailure()).wait(
        sessionId,
        (s) =>
          s.state === 'question_feedback' &&
          s.currentPosition === position &&
          s.answeredCount === actors.length - 1,
      );
      assertFunctionalLiveCount(feedback, questionCount);
      main.returned();
      main.enter('QUESTION_CONFIRMED', position);
      await journal.write(`live-question-${String(position)}-confirmed`, {
        sessionId,
        position,
        questionCount,
        answeredCount: feedback.answeredCount,
        participantCount: feedback.participantCount,
      });
      main.returned();
      check();
      if (presenter) {
        main.enter('FEEDBACK_VISIBLE', position);
        await expect(
          presenter.getByRole('heading', { name: '本題解析', exact: true }),
        ).toBeVisible({ timeout: 20000 });
        main.returned();
        main.enter('RANKING_CLICK', position);
        await presenter
          .getByRole('button', { name: '即時排名', exact: true })
          .click();
        main.returned();
        main.enter('NEXT_CLICK', position);
        await presenter
          .getByRole('button', {
            name: position === questionCount ? '結算成績' : '下一題',
            exact: true,
          })
          .click();
        main.returned();
      } else {
        main.enter('ADVANCE_STATE', position);
        const state = await repository.getState(sessionId);
        main.returned();
        main.enter(
          position === questionCount ? 'FINALIZE_API' : 'ADVANCE_API',
          position,
        );
        if (position === questionCount)
          await repository.finalize(sessionId, state.stateVersion);
        else await repository.advance(sessionId, state.stateVersion);
        main.returned();
      }
    }
    main.enter('COMPLETED_STATE');
    assertFunctionalLiveCount(
      await (gates[0] ?? capacityFailure()).wait(
        sessionId,
        (s) => s.state === 'completed',
      ),
      questionCount,
    );
    main.returned();
    main.enter('REPORT_RPC');
    const report = await repository.getSessionDetail(sessionId);
    main.returned();
    main.enter('REPORT_VALIDATE');
    if (
      !report.completedAt ||
      report.sessionId !== sessionId ||
      report.classroomId !== classroomId ||
      report.activity.quizTemplateId !== selected.quizTemplateId ||
      report.participants.length !== actors.length - 1 ||
      report.questions.length !== questionCount ||
      report.questions.some((q) => q.answered !== actors.length - 1) ||
      report.participants.some((p) => p.answers.length !== questionCount)
    )
      return capacityFailure();
    main.returned();
    if (host.page) {
      main.enter('REPORT_NAVIGATE');
      await host.page.goto(`/teacher/live/${sessionId}/report`);
      main.returned();
      main.enter('REPORT_VISIBLE');
      await expect(
        host.page.getByRole('heading', { name: 'Live 課程報表', exact: true }),
      ).toBeVisible();
      main.returned();
    }
    main.enter('BROWSER_ERRORS');
    if (
      bindings.some(
        (b) =>
          b.diagnostics.consoleErrors.length ||
          b.diagnostics.pageErrors.length ||
          b.diagnostics.serverErrors.length,
      )
    )
      return capacityFailure();
    main.returned();
    return {
      questions: questionCount,
      participants: actors.length - 1,
      outsiderDenied: true,
      reportConfirmed: true,
    };
  } catch (error) {
    main.failed(error);
    throw error;
  } finally {
    try {
      for (const b of bindings) {
        cleanup.enter('WEBSOCKET_OFF');
        b.page.off('websocket', b.listener);
        cleanup.returned();
      }
      for (const gate of [...gates, outsideGate]) {
        cleanup.enter('GATE_CLOSE');
        gate.close();
        cleanup.returned();
      }
    } catch (error) {
      cleanup.failed(error);
      // eslint-disable-next-line no-unsafe-finally -- Preserve original cleanup overriding the operation error.
      throw error;
    } finally {
      try {
        for (const b of bindings)
          diagnostic.captureRealtime(b.actorIndex, b.diagnostics);
        await journal.write('capacity-live-diagnostics', diagnostic.seal());
      } catch {
        /* Best effort only; never replace original result/exception. */
      }
    }
  }
};
