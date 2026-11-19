import { z } from 'zod';
import { createLiveDiagnostics } from './functional-live-diagnostics';
import type { LiveSessionState } from '../../src/features/live/types';
import { performance } from 'node:perf_hooks';
import { expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { createLiveRepository } from '../../src/features/live/api/live-repository';
import { joinLiveThroughUi } from '../../tests/e2e/helpers/staging-capacity-browser';
import { settleCapacityOperations } from '../live/capacity-lifecycle';
import {
  liveFunctionalActor,
  restoreFunctionalActor,
  bindFunctionalLivePage,
} from './teacher-live-bridge';
import type { FunctionalIdentities } from './owned-fixtures';
import type { FunctionalSecrets } from './local-runtime';
import type { PrivateJournal } from './private-journal';
import { fail, safely, type FunctionalScope } from './config';
export const selectFunctionalLiveTemplate = (
  options: readonly { sectionId: string; quizTemplateId: string }[],
) => options[0] ?? fail('FUNCTIONAL_OPERATION_FAILED');
export const assertFunctionalLiveCount = (
  state: LiveSessionState,
  expected: number,
) => {
  if (
    !Number.isInteger(expected) ||
    expected < 1 ||
    expected > 20 ||
    state.questionCount !== expected
  )
    return fail('FUNCTIONAL_OPERATION_FAILED');
  return state;
};
export const bindFunctionalLiveSession = async (
  client: SupabaseClient<Database>,
  expected: {
    sessionId: string;
    classroomId: string;
    sectionId: string;
    quizTemplateId: string;
    teacherId?: string;
  },
  lobby: LiveSessionState,
  signal: AbortSignal,
) => {
  const signalIsAborted = () => signal.aborted;
  const subject = await client.auth.getUser();
  const teacherId = subject.data.user?.id;
  if (
    signalIsAborted() ||
    subject.error ||
    !teacherId ||
    (expected.teacherId && expected.teacherId !== teacherId) ||
    !lobby.isHost ||
    lobby.sessionId !== expected.sessionId
  )
    return fail('FUNCTIONAL_OPERATION_FAILED');
  const session = await client
    .from('live_sessions')
    .select(
      'id, host_teacher_id, classroom_id, live_activity_id, question_count',
    )
    .eq('id', expected.sessionId)
    .abortSignal(signal)
    .retry(false)
    .single();
  const row = z
    .object({
      id: z.string(),
      host_teacher_id: z.string(),
      classroom_id: z.string(),
      live_activity_id: z.string(),
      question_count: z.number().int().min(1).max(20),
    })
    .safeParse(session.data);
  if (
    session.error ||
    !row.success ||
    row.data.id !== expected.sessionId ||
    row.data.host_teacher_id !== teacherId ||
    row.data.classroom_id !== expected.classroomId
  )
    return fail('FUNCTIONAL_OPERATION_FAILED');
  const activity = await client
    .from('live_activities')
    .select('id, owner_teacher_id, section_id, quiz_template_id')
    .eq('id', row.data.live_activity_id)
    .abortSignal(signal)
    .retry(false)
    .single();
  const linked = z
    .object({
      id: z.string(),
      owner_teacher_id: z.string(),
      section_id: z.string(),
      quiz_template_id: z.string(),
    })
    .safeParse(activity.data);
  if (
    signalIsAborted() ||
    activity.error ||
    !linked.success ||
    linked.data.id !== row.data.live_activity_id ||
    linked.data.owner_teacher_id !== teacherId ||
    linked.data.section_id !== expected.sectionId ||
    linked.data.quiz_template_id !== expected.quizTemplateId
  )
    return fail('FUNCTIONAL_OPERATION_FAILED');
  assertFunctionalLiveCount(lobby, row.data.question_count);
  return row.data.question_count;
};
export const runTeacherLiveJourney = async (
  pages: readonly [Page, Page, Page],
  teacher: SupabaseClient<Database>,
  outsider: SupabaseClient<Database>,
  identities: FunctionalIdentities,
  scope: FunctionalScope,
  secrets: FunctionalSecrets,
  signal: AbortSignal,
  journal: PrivateJournal,
  classroomId: string,
) =>
  safely(async () => {
    const diagnostic = createLiveDiagnostics(scope, pages, journal);
    try {
      const repository = diagnostic.sync('SETUP', () =>
        createLiveRepository(teacher),
      );
      const options = await diagnostic.step('SETUP', () =>
        repository.listSectionOptions(),
      );
      const selected = diagnostic.sync('SETUP', () =>
        selectFunctionalLiveTemplate(options),
      );
      const actors = diagnostic.sync('SETUP', () =>
        [identities.T1, identities.S1, identities.S2, identities.R1].map(
          (identity, index) =>
            liveFunctionalActor(scope, secrets, identity, signal, index + 1),
        ),
      );
      const bindings: Awaited<ReturnType<typeof bindFunctionalLivePage>>[] = [];
      try {
        for (const [index, page] of pages.entries()) {
          const base = actors[index];
          const identity = [identities.T1, identities.S1, identities.S2][index];
          if (!base || !identity) return fail('FUNCTIONAL_OPERATION_FAILED');
          bindings.push(await bindFunctionalLivePage(page, base));
          await restoreFunctionalActor(base, page, scope, identity);
        }
        const [host, s1, s2, r1] = actors;
        if (!host || !s1 || !s2 || !r1)
          return fail('FUNCTIONAL_OPERATION_FAILED');
        await restoreFunctionalActor(r1, outsider, scope, identities.R1);
        await journal.write('teacher-live-launch-intent', {
          classroomId,
          teacherId: identities.T1.userId,
          sectionId: selected.sectionId,
          existingActivityIds: (await repository.listMyActivities()).map(
            (row) => row.activityId,
          ),
          mode: 'NORMAL_TEACHER_UI',
        });
        const presenter = pages[0].getByRole('region', {
          name: 'Live 投影模式',
          exact: true,
        });
        await diagnostic.step('PRESENTER_GOTO', () =>
          diagnostic.documents.intent(pages[0], 'LIVE_PRESENTER', () =>
            pages[0].goto('/teacher/live'),
          ),
        );
        await pages[0]
          .getByRole('combobox', { name: '1・選擇班級', exact: true })
          .selectOption(classroomId);
        await pages[0]
          .getByRole('group', { name: '選擇小節', exact: true })
          .locator('label')
          .filter({
            has: pages[0].locator(`input[value="${selected.sectionId}"]`),
          })
          .click();
        await pages[0]
          .getByRole('button', { name: '建立課堂', exact: true })
          .click();
        const hostReadyStarted = performance.now();
        await presenter
          .getByRole('button', { name: '開始遊戲', exact: true })
          .waitFor({ state: 'visible', timeout: 20_000 });
        const sessionId = /\/teacher\/live\/([0-9a-f-]{36})/u.exec(
          new URL(pages[0].url()).pathname,
        )?.[1];
        const code = (
          await presenter.getByLabel('課堂代碼').innerText()
        ).trim();
        if (!sessionId || !/^\d{6}$/u.test(code))
          return fail('FUNCTIONAL_OPERATION_FAILED');
        diagnostic.documents.session(sessionId, classroomId);
        await journal.write('teacher-live-launched', {
          classroomId,
          sessionId,
        });
        if (
          !(await bindings[0]?.diagnostics.waitForSubscriptionAck(
            Math.max(0, 20_000 - (performance.now() - hostReadyStarted)),
            signal,
            'HOST_PROGRESS',
          ))
        )
          return fail('FUNCTIONAL_OPERATION_FAILED');
        for (const [index, page] of pages.slice(1).entries()) {
          const joined = await joinLiveThroughUi([page], code, {
            actorIndex: index + 2,
          });
          if (
            joined[0]?.outcome !== 'connected' ||
            !(
              await bindings[index + 1]?.diagnostics.realtime()
            )?.subscriptionStatusSequence.includes('SUBSCRIBED')
          )
            return fail('FUNCTIONAL_OPERATION_FAILED');
        }
        await r1.actor.proveOutsiderRefusal(sessionId, code);
        const lobby = await host.actor.getState(sessionId);
        if (!identities.T1.userId) return fail('FUNCTIONAL_OPERATION_FAILED');
        const questionCount = await bindFunctionalLiveSession(
          teacher,
          {
            ...selected,
            sessionId,
            classroomId,
            teacherId: identities.T1.userId,
          },
          lobby,
          signal,
        );
        if (lobby.participantCount !== 2)
          return fail('FUNCTIONAL_OPERATION_FAILED');
        await presenter
          .getByRole('button', { name: '開始遊戲', exact: true })
          .click();
        await presenter
          .getByRole('alertdialog', { name: '立即開始', exact: true })
          .getByRole('button', { name: '開始', exact: true })
          .click();
        const detailedRounds: { position: number; answerMs: number[] }[] = [];
        for (let position = 1; position <= questionCount; position++) {
          await journal.write(`teacher-live-round-${String(position)}-intent`, {
            sessionId,
            position,
            questionCount: questionCount,
            expectedAnswers: 2,
          });
          const states = await settleCapacityOperations(
            [s1, s2].map(
              (base) => () =>
                base.actor.waitForState(
                  sessionId,
                  (state) =>
                    state.state === 'question_open' &&
                    state.currentPosition === position,
                ),
            ),
          );
          const answerMs = await settleCapacityOperations(
            pages.slice(1).map((page, index) => async () => {
              const state = states[index];
              if (state) assertFunctionalLiveCount(state, questionCount);
              if (!state?.question) return fail('FUNCTIONAL_OPERATION_FAILED');
              await expect(
                page
                  .getByText(
                    `第 ${String(position)} / ${String(questionCount)} 題`,
                    { exact: false },
                  )
                  .first(),
              ).toBeVisible({ timeout: 20_000 });
              const buttons = page
                .getByRole('group', { name: '答案選項' })
                .getByRole('button');
              await buttons
                .first()
                .waitFor({ state: 'visible', timeout: 20_000 });
              const response = page.waitForResponse(
                (value) =>
                  new URL(value.url()).origin ===
                    new URL(scope.supabaseUrl).origin &&
                  new URL(value.url()).pathname ===
                    '/rest/v1/rpc/submit_live_answer' &&
                  value.request().method() === 'POST',
                { timeout: 20_000 },
              );
              const settled = await Promise.allSettled([
                response,
                buttons
                  .nth(index % state.question.publicOptions.length)
                  .click(),
              ]);
              if (
                settled[0].status !== 'fulfilled' ||
                settled[1].status !== 'fulfilled'
              )
                return fail('FUNCTIONAL_OPERATION_FAILED');
              const received = settled[0].value;
              const finished = await received.finished();
              const elapsed = received.request().timing().responseEnd;
              if (
                !received.ok() ||
                finished !== null ||
                !Number.isFinite(elapsed) ||
                elapsed < 0 ||
                elapsed > 800
              )
                return fail('FUNCTIONAL_OPERATION_FAILED');
              return elapsed;
            }),
          );
          const feedback = await host.actor.waitForState(
            sessionId,
            (state) =>
              state.state === 'question_feedback' &&
              state.currentPosition === position &&
              state.answeredCount === 2,
          );
          assertFunctionalLiveCount(feedback, questionCount);
          await journal.write(
            `teacher-live-round-${String(position)}-confirmed`,
            {
              sessionId,
              position,
              questionCount: questionCount,
              answeredCount: feedback.answeredCount,
              participantCount: feedback.participantCount,
              confirmedRounds: position,
              ...(position <= 3 ? { answerMs } : {}),
            },
          );
          if (position <= 3) detailedRounds.push({ position, answerMs });
          await diagnostic.step(
            'ROUND_EXPLANATION',
            () =>
              expect(
                presenter.getByRole('heading', {
                  name: '本題解析',
                  exact: true,
                }),
              ).toBeVisible({ timeout: 20_000 }),
            position,
          );
          await diagnostic.step(
            'ROUND_RANKING',
            () =>
              presenter
                .getByRole('button', { name: '即時排名', exact: true })
                .click(),
            position,
          );
          const action = presenter.getByRole('button', {
            name: position === questionCount ? '結算成績' : '下一題',
            exact: true,
          });
          await diagnostic.step(
            'ROUND_ACTION_ENABLED',
            () => expect(action).toBeEnabled({ timeout: 20_000 }),
            position,
          );
          await diagnostic.step(
            'ROUND_ACTION_CLICK',
            () => action.click(),
            position,
          );
        }
        const completed = await diagnostic.step('COMPLETED_WAIT', () =>
          host.actor.waitForState(
            sessionId,
            (state) => state.state === 'completed',
          ),
        );
        diagnostic.sync('COMPLETED_COUNT', () =>
          assertFunctionalLiveCount(completed, questionCount),
        );
        const report = await diagnostic.step('REPORT_RPC', () =>
          repository.getSessionDetail(sessionId),
        );
        diagnostic.sync('REPORT_PREDICATE', () => {
          if (
            !report.completedAt ||
            report.sessionId !== sessionId ||
            report.classroomId !== classroomId ||
            report.activity.quizTemplateId !== selected.quizTemplateId ||
            report.participants.length !== 2 ||
            report.questions.length !== questionCount ||
            report.questions.some((question) => question.answered !== 2) ||
            report.participants.some(
              (participant) => participant.answers.length !== questionCount,
            )
          )
            return fail('FUNCTIONAL_OPERATION_FAILED');
        });
        await diagnostic.step('REPORT_GOTO', () =>
          diagnostic.documents.intent(pages[0], 'LIVE_REPORT', () =>
            pages[0].goto(`/teacher/live/${sessionId}/report`),
          ),
        );
        await diagnostic.step('REPORT_HEADING', () =>
          expect(
            pages[0].getByRole('heading', {
              name: 'Live 課程報表',
              exact: true,
            }),
          ).toBeVisible(),
        );
        const health = bindings.map(({ diagnostics }) => ({
          consoleErrors: diagnostics.consoleErrors.length,
          pageErrors: diagnostics.pageErrors.length,
          serverErrors: diagnostics.serverErrors.length,
        }));
        diagnostic.sync('HEALTH', () => {
          if (
            health.some(
              (entry) =>
                entry.consoleErrors || entry.pageErrors || entry.serverErrors,
            )
          )
            return fail('FUNCTIONAL_BROWSER_FAILED');
        });
        await diagnostic.step('COMPLETE_JOURNAL', () =>
          journal.write('teacher-live-completed', {
            sessionId,
            classroomId,
            questionCount: questionCount,
          }),
        );
        return {
          questionCount: questionCount,
          detailedRounds,
          remainingRounds: questionCount - detailedRounds.length,
          answers: questionCount * 2,
          finalized: true,
          report: true,
          outsider: r1.actor.getOutsiderDiagnostics(),
          sdkCompanions: 3,
          sdkOutsider: 1,
          physicalSdkRequests: actors.map((base) => base.evidence.requests),
          health,
        };
      } catch (error) {
        diagnostic.operationFailure(error);
        throw error;
      } finally {
        await diagnostic.cleanup(async () => {
          for (const [index, binding] of bindings.entries())
            diagnostic.sync(
              'BINDING_DISPOSE',
              () => binding.dispose(),
              index + 1,
            );
          await settleCapacityOperations(
            actors.map(
              (base, index) => () =>
                diagnostic.step(
                  'ACTOR_CLOSE',
                  () => base.actor.close(),
                  undefined,
                  index + 1,
                ),
            ),
          );
        });
      }
    } finally {
      await diagnostic.finish();
    }
  });
