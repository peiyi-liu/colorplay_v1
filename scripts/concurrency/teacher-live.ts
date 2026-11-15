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
  templates: readonly { id: string; question_count: number }[],
) => {
  const eligible = templates
    .filter(
      (row) =>
        row.question_count >= 3 &&
        row.question_count <= 20 &&
        options.some((option) => option.quizTemplateId === row.id),
    )
    .sort((a, b) => a.question_count - b.question_count);
  const chosen = eligible[0];
  const option = options.find((row) => row.quizTemplateId === chosen?.id);
  return chosen && option
    ? { ...option, questionCount: chosen.question_count }
    : fail('FUNCTIONAL_OPERATION_FAILED');
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
    const repository = createLiveRepository(teacher);
    const options = await repository.listSectionOptions();
    const templates = await teacher
      .from('quiz_templates')
      .select('id, question_count')
      .eq('status', 'published')
      .in(
        'id',
        options.map((row) => row.quizTemplateId),
      )
      .retry(false);
    if (templates.error) return fail('FUNCTIONAL_OPERATION_FAILED');
    const selected = selectFunctionalLiveTemplate(options, templates.data);
    const actors = [
      identities.T1,
      identities.S1,
      identities.S2,
      identities.R1,
    ].map((identity, index) =>
      liveFunctionalActor(scope, secrets, identity, signal, index + 1),
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
      await pages[0].goto('/teacher/live');
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
      const code = (await presenter.getByLabel('課堂代碼').innerText()).trim();
      if (!sessionId || !/^\d{6}$/u.test(code))
        return fail('FUNCTIONAL_OPERATION_FAILED');
      await journal.write('teacher-live-launched', { classroomId, sessionId });
      if (
        !(await bindings[0]?.diagnostics.waitForSubscriptionAck(
          Math.max(0, 20_000 - (performance.now() - hostReadyStarted)),
          signal,
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
      if (
        lobby.participantCount !== 2 ||
        lobby.questionCount !== selected.questionCount
      )
        return fail('FUNCTIONAL_OPERATION_FAILED');
      await presenter
        .getByRole('button', { name: '開始遊戲', exact: true })
        .click();
      await presenter
        .getByRole('alertdialog', { name: '立即開始', exact: true })
        .getByRole('button', { name: '開始', exact: true })
        .click();
      const detailedRounds: { position: number; answerMs: number[] }[] = [];
      for (let position = 1; position <= selected.questionCount; position++) {
        await journal.write(`teacher-live-round-${String(position)}-intent`, {
          sessionId,
          position,
          questionCount: selected.questionCount,
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
            if (!state?.question) return fail('FUNCTIONAL_OPERATION_FAILED');
            await expect(
              page
                .getByText(
                  `第 ${String(position)} / ${String(selected.questionCount)} 題`,
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
              buttons.nth(index % state.question.publicOptions.length).click(),
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
        await journal.write(
          `teacher-live-round-${String(position)}-confirmed`,
          {
            sessionId,
            position,
            questionCount: selected.questionCount,
            answeredCount: feedback.answeredCount,
            participantCount: feedback.participantCount,
            confirmedRounds: position,
            ...(position <= 3 ? { answerMs } : {}),
          },
        );
        if (position <= 3) detailedRounds.push({ position, answerMs });
        await expect(
          presenter.getByRole('heading', { name: '本題解析', exact: true }),
        ).toBeVisible({ timeout: 20_000 });
        await presenter
          .getByRole('button', { name: '即時排名', exact: true })
          .click();
        const action = presenter.getByRole('button', {
          name: position === selected.questionCount ? '結算成績' : '下一題',
          exact: true,
        });
        await expect(action).toBeEnabled({ timeout: 20_000 });
        await action.click();
      }
      await host.actor.waitForState(
        sessionId,
        (state) => state.state === 'completed',
      );
      const report = await repository.getSessionDetail(sessionId);
      if (
        !report.completedAt ||
        report.participants.length !== 2 ||
        report.questions.length !== selected.questionCount ||
        report.questions.some((question) => question.answered !== 2) ||
        report.participants.some(
          (participant) =>
            participant.answers.length !== selected.questionCount,
        )
      )
        return fail('FUNCTIONAL_OPERATION_FAILED');
      await pages[0].goto(`/teacher/live/${sessionId}/report`);
      await expect(
        pages[0].getByRole('heading', { name: 'Live 課程報表', exact: true }),
      ).toBeVisible();
      const health = bindings.map(({ diagnostics }) => ({
        consoleErrors: diagnostics.consoleErrors.length,
        pageErrors: diagnostics.pageErrors.length,
        serverErrors: diagnostics.serverErrors.length,
      }));
      if (
        health.some(
          (entry) =>
            entry.consoleErrors || entry.pageErrors || entry.serverErrors,
        )
      )
        return fail('FUNCTIONAL_BROWSER_FAILED');
      await journal.write('teacher-live-completed', {
        sessionId,
        classroomId,
        questionCount: selected.questionCount,
      });
      return {
        questionCount: selected.questionCount,
        detailedRounds,
        remainingRounds: selected.questionCount - detailedRounds.length,
        answers: selected.questionCount * 2,
        finalized: true,
        report: true,
        outsider: r1.actor.getOutsiderDiagnostics(),
        sdkCompanions: 3,
        sdkOutsider: 1,
        physicalSdkRequests: actors.map((base) => base.evidence.requests),
        health,
      };
    } finally {
      for (const binding of bindings) binding.dispose();
      await settleCapacityOperations(
        actors.map((base) => () => base.actor.close()),
      );
    }
  });
