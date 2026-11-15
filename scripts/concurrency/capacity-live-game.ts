import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  expect,
  type Page,
  type WebSocket as PageSocket,
} from '@playwright/test';
import {
  REALTIME_SUBSCRIBE_STATES,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { createLiveRepository } from '../../src/features/live/api/live-repository';
import {
  LiveRepositoryError,
  type LiveSessionState,
} from '../../src/features/live/types';
import {
  attachDiagnostics,
  joinLiveThroughUi,
} from '../../tests/e2e/helpers/staging-capacity-browser';
import { isLiveBroadcast } from '../live/capacity-live-broadcast';
import { isExplicitPermissionDenial } from '../live/capacity-permission-denial';
import { selectFunctionalLiveTemplate } from './teacher-live';
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
export const createCapacityLiveGate = (
  client: SupabaseClient<Database>,
  signal: AbortSignal,
) => {
  const repository = createLiveRepository(client),
    listeners = new Set<() => void>();
  let sequence = 0,
    closed = false,
    faulted = false;
  const notify = () => {
    if (closed) return;
    sequence++;
    for (const fn of listeners) fn();
  };
  const within = async <T>(
    action: (owned: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    const timeout = new AbortController(),
      timer = setTimeout(() => {
        timeout.abort();
      }, 20000),
      combined = AbortSignal.any([signal, timeout.signal]);
    let onAbort: () => void = () => undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        reject(new Error('CAPACITY_EVIDENCE_INVALID'));
      };
      combined.addEventListener('abort', onAbort, { once: true });
      if (combined.aborted) onAbort();
    });
    try {
      return await Promise.race([action(combined), expired]);
    } finally {
      clearTimeout(timer);
      combined.removeEventListener('abort', onAbort);
      timeout.abort();
    }
  };
  const subscribe = (sessionId: string, refusal = false) =>
    within(async (owned) => {
      if (owned.aborted || closed) return capacityFailure();
      const state = { explicit: false, joined: false };
      const channel = client
        .channel(`live-session:${sessionId}`, {
          config: { private: true, broadcast: { self: true } },
        })
        .on('broadcast', { event: 'live_state' }, notify);
      const pending = new Promise<void>((resolve, reject) => {
        const done = (ok: boolean) => {
          owned.removeEventListener('abort', abort);
          if (ok) resolve();
          else reject(new Error('CAPACITY_EVIDENCE_INVALID'));
        };
        const abort = () => {
          done(false);
        };
        owned.addEventListener('abort', abort, { once: true });
        channel.subscribe((status, error) => {
          if (closed || signal.aborted) return;
          if (state.joined) {
            if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED && !refusal) {
              faulted = true;
              notify();
            }
            return;
          }
          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            state.joined = true;
            done(!refusal);
          } else {
            state.explicit =
              status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR &&
              isExplicitPermissionDenial(error);
            done(refusal && state.explicit && !state.joined);
          }
        });
        if (owned.aborted) abort();
      });
      let failed = false;
      try {
        await pending;
      } catch {
        failed = true;
      }
      if (refusal) {
        const removed = await client.removeChannel(channel);
        if (removed !== 'ok') return capacityFailure();
      }
      if (failed || (refusal && (!state.explicit || state.joined)))
        return capacityFailure();
    });
  return {
    notify,
    subscribe,
    wait: (
      sessionId: string,
      predicate: (state: LiveSessionState) => boolean,
    ) =>
      within(async (owned) => {
        for (;;) {
          if (owned.aborted || closed || faulted) return capacityFailure();
          const observed = sequence,
            state = await repository.getState(sessionId);
          if (predicate(state)) return state;
          await new Promise<void>((resolve, reject) => {
            const finish = () => {
              listeners.delete(finish);
              owned.removeEventListener('abort', abort);
              resolve();
            };
            const abort = () => {
              listeners.delete(finish);
              owned.removeEventListener('abort', abort);
              reject(new Error('CAPACITY_EVIDENCE_INVALID'));
            };
            listeners.add(finish);
            owned.addEventListener('abort', abort, { once: true });
            if (owned.aborted) abort();
            else if (sequence !== observed) finish();
          });
        }
      }),
    close: () => {
      closed = true;
      for (const fn of listeners) fn();
      listeners.clear();
    },
  };
};
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
  const repository = createLiveRepository(host.client),
    gates = actors.map((a) => createCapacityLiveGate(a.client, signal));
  const outsideGate = createCapacityLiveGate(outsider.client, signal),
    bindings: {
      page: Page;
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
        const diagnostics = await attachDiagnostics(a.page);
        const listener = (socket: PageSocket) =>
          socket.on('framereceived', ({ payload }) => {
            if (isLiveBroadcast(payload)) gate.notify();
          });
        a.page.on('websocket', listener);
        bindings.push({ page: a.page, listener, diagnostics });
      }
    const options = await repository.listSectionOptions(),
      templates = await host.client
        .from('quiz_templates')
        .select('id, question_count')
        .eq('status', 'published')
        .in(
          'id',
          options.map((o) => o.quizTemplateId),
        )
        .retry(false);
    if (templates.error) return capacityFailure();
    const selected = selectFunctionalLiveTemplate(options, templates.data);
    await journal.write('live-create-intent', {
      classroomId,
      questionCount: selected.questionCount,
      sectionId: selected.sectionId,
    });
    check();
    let sessionId: string, code: string;
    const presenter = host.page?.getByRole('region', {
      name: 'Live 投影模式',
      exact: true,
    });
    if (host.page && presenter) {
      await host.page.goto('/teacher/live');
      await host.page
        .getByRole('combobox', { name: '1・選擇班級', exact: true })
        .selectOption(classroomId);
      await host.page
        .getByRole('group', { name: '選擇小節', exact: true })
        .locator('label')
        .filter({
          has: host.page.locator(`input[value="${selected.sectionId}"]`),
        })
        .click();
      check();
      await host.page
        .getByRole('button', { name: '建立課堂', exact: true })
        .click();
      const started = performance.now();
      await presenter
        .getByRole('button', { name: '開始遊戲', exact: true })
        .waitFor({ state: 'visible', timeout: 20000 });
      sessionId =
        /\/teacher\/live\/([0-9a-f-]{36})/u.exec(
          new URL(host.page.url()).pathname,
        )?.[1] ?? capacityFailure();
      code = (await presenter.getByLabel('課堂代碼').innerText()).trim();
      if (
        !(await (
          bindings[0] ?? capacityFailure()
        ).diagnostics.waitForSubscriptionAck(
          Math.max(0, 20000 - (performance.now() - started)),
          signal,
        ))
      )
        return capacityFailure();
    } else {
      const activity = await repository.createActivity({
        title: `容量 ${scope.planId}`,
        quizTemplateId: selected.quizTemplateId,
        sectionId: selected.sectionId,
        questionTimeLimitSeconds: 20,
      });
      check();
      const session = await repository.createSession({
        activityId: activity.activityId,
        classroomId,
        assignmentId: null,
      });
      sessionId = session.sessionId;
      code = session.joinCode;
      await repository.startSession(sessionId, session.stateVersion);
      await (gates[0] ?? capacityFailure()).subscribe(sessionId);
    }
    await journal.write('live-created', {
      sessionId,
      classroomId,
      questionCount: selected.questionCount,
    });
    const joins = actors.slice(1).map(async (a, index) => {
      check();
      if (a.page) {
        const start = performance.now(),
          outcome = await joinLiveThroughUi([a.page], code, {
            actorIndex: a.actorIndex,
          });
        const binding = bindings.find((b) => b.page === a.page);
        if (
          outcome[0]?.outcome !== 'connected' ||
          !(await binding?.diagnostics.waitForSubscriptionAck(
            Math.max(0, 20000 - (performance.now() - start)),
            signal,
          ))
        )
          return capacityFailure();
      } else {
        if (
          (
            await createLiveRepository(a.client).join({
              joinCode: code,
              requestId: randomUUID(),
            })
          ).sessionId !== sessionId
        )
          return capacityFailure();
        await (gates[index + 1] ?? capacityFailure()).subscribe(sessionId);
      }
    });
    const joined = await Promise.allSettled(joins);
    if (joined.some((r) => r.status === 'rejected')) return capacityFailure();
    let deniedJoin = false,
      deniedState = false;
    try {
      await createLiveRepository(outsider.client).join({
        joinCode: code,
        requestId: randomUUID(),
      });
    } catch (e) {
      deniedJoin =
        e instanceof LiveRepositoryError && e.code === 'JOIN_INVALID_CODE';
    }
    try {
      await createLiveRepository(outsider.client).getState(sessionId);
    } catch (e) {
      deniedState = e instanceof LiveRepositoryError && e.code === 'NOT_FOUND';
    }
    if (!deniedJoin || !deniedState) return capacityFailure();
    await outsideGate.subscribe(sessionId, true);
    const lobby = await repository.getState(sessionId);
    if (
      lobby.participantCount !== actors.length - 1 ||
      lobby.questionCount !== selected.questionCount
    )
      return capacityFailure();
    check();
    if (presenter)
      await presenter
        .getByRole('button', { name: '開始遊戲', exact: true })
        .click();
    else await repository.openQuestion(sessionId, lobby.stateVersion);
    for (let position = 1; position <= selected.questionCount; position++) {
      await journal.write(`live-question-${String(position)}-intent`, {
        sessionId,
        position,
        questionCount: selected.questionCount,
      });
      check();
      const answered = await Promise.allSettled(
        actors.slice(1).map(async (a, index) => {
          const state = await (gates[index + 1] ?? capacityFailure()).wait(
            sessionId,
            (s) =>
              s.state === 'question_open' && s.currentPosition === position,
          );
          const q = state.question;
          if (!q?.prompt || !q.publicOptions.length) return capacityFailure();
          const choice =
              q.publicOptions[index % q.publicOptions.length] ??
              capacityFailure(),
            prompt = q.prompt;
          check();
          await a.measure('submit_answer', 'warm', async () => {
            if (a.page) {
              await expect(
                a.page.getByText(prompt, { exact: true }).first(),
              ).toBeVisible({ timeout: 20000 });
              const buttons = a.page
                .getByRole('group', { name: '答案選項' })
                .getByRole('button');
              await buttons
                .first()
                .waitFor({ state: 'visible', timeout: 20000 });
              check();
              const response = a.page.waitForResponse(
                (r) =>
                  new URL(r.url()).origin === scope.supabaseUrl &&
                  new URL(r.url()).pathname ===
                    '/rest/v1/rpc/submit_live_answer' &&
                  r.request().method() === 'POST',
                { timeout: 20000 },
              );
              const settled = await Promise.allSettled([
                response,
                buttons.nth(index % q.publicOptions.length).click(),
              ]);
              if (
                settled[0].status !== 'fulfilled' ||
                settled[1].status !== 'fulfilled' ||
                !settled[0].value.ok() ||
                (await settled[0].value.finished()) !== null
              )
                return capacityFailure();
            } else
              await createLiveRepository(a.client).submitAnswer({
                sessionQuestionId: q.questionId,
                selectedOptionId: choice.id,
                idempotencyKey: randomUUID(),
              });
          });
        }),
      );
      if (answered.some((r) => r.status === 'rejected'))
        return capacityFailure();
      const feedback = await (gates[0] ?? capacityFailure()).wait(
        sessionId,
        (s) =>
          s.state === 'question_feedback' &&
          s.currentPosition === position &&
          s.answeredCount === actors.length - 1,
      );
      await journal.write(`live-question-${String(position)}-confirmed`, {
        sessionId,
        position,
        questionCount: selected.questionCount,
        answeredCount: feedback.answeredCount,
        participantCount: feedback.participantCount,
      });
      check();
      if (presenter) {
        await expect(
          presenter.getByRole('heading', { name: '本題解析', exact: true }),
        ).toBeVisible({ timeout: 20000 });
        await presenter
          .getByRole('button', { name: '即時排名', exact: true })
          .click();
        await presenter
          .getByRole('button', {
            name: position === selected.questionCount ? '結算成績' : '下一題',
            exact: true,
          })
          .click();
      } else {
        const state = await repository.getState(sessionId);
        if (position === selected.questionCount)
          await repository.finalize(sessionId, state.stateVersion);
        else await repository.advance(sessionId, state.stateVersion);
      }
    }
    await (gates[0] ?? capacityFailure()).wait(
      sessionId,
      (s) => s.state === 'completed',
    );
    const report = await repository.getSessionDetail(sessionId);
    if (
      !report.completedAt ||
      report.participants.length !== actors.length - 1 ||
      report.questions.length !== selected.questionCount ||
      report.questions.some((q) => q.answered !== actors.length - 1) ||
      report.participants.some(
        (p) => p.answers.length !== selected.questionCount,
      )
    )
      return capacityFailure();
    if (host.page) {
      await host.page.goto(`/teacher/live/${sessionId}/report`);
      await expect(
        host.page.getByRole('heading', { name: 'Live 課程報表', exact: true }),
      ).toBeVisible();
    }
    if (
      bindings.some(
        (b) =>
          b.diagnostics.consoleErrors.length ||
          b.diagnostics.pageErrors.length ||
          b.diagnostics.serverErrors.length,
      )
    )
      return capacityFailure();
    return {
      questions: selected.questionCount,
      participants: actors.length - 1,
      outsiderDenied: true,
      reportConfirmed: true,
    };
  } finally {
    for (const b of bindings) b.page.off('websocket', b.listener);
    for (const gate of [...gates, outsideGate]) gate.close();
  }
};
