import { expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import { fetchStudentChapterMap } from '../../src/features/learning/api/chapter-map';
import { createLearningRepository } from '../../src/features/learning/api/learning-repository';
import { createMasteryRepository } from '../../src/features/learning/api/mastery-repository';
import { createEconomyRepository } from '../../src/features/rewards/api/economy-repository';
import { GENERATED_CORRECT_ANSWERS } from '../../tests/fixtures/question-answers.generated';
import { REVIEW_MANIFEST } from '../../tests/fixtures/review-manifest.generated';
import {
  walkReviewCards,
  completeReviewCard,
} from '../../tests/e2e/helpers/review-card-walk';
import { fail, safely, type FunctionalScope } from './config';
import type { PrivateJournal } from './private-journal';
import { finishFunctionalQuiz, quizSessionIdFromPage } from './student-quiz';

export const functionalChapter = async (client: SupabaseClient<Database>) =>
  safely(async () => {
    const map = await fetchStudentChapterMap(client);
    const chapter = map.chapters.find(
      (row) =>
        row.stableCode === 'chapter-3' &&
        row.templateId &&
        row.templateQuestionCount &&
        ['available', 'completed'].includes(row.accessState),
    );
    if (!chapter?.templateId) return fail('FUNCTIONAL_STUDENT_FAILED');
    return { ...chapter, templateId: chapter.templateId };
  }, 'FUNCTIONAL_STUDENT_FAILED');
export const reviewFunctionalCards = async (
  page: Page,
  client: SupabaseClient<Database>,
) =>
  safely(async () => {
    const chapter = await functionalChapter(client);
    const repository = createLearningRepository(client);
    const sections = await repository.listChapterReview(chapter.chapterId);
    const cards = sections.flatMap((section) =>
      section.subtopics.flatMap((subtopic) => subtopic.cards),
    );
    if (!cards.length) return fail('FUNCTIONAL_STUDENT_FAILED');
    await page.goto(`/app/chapters/${chapter.chapterId}`);
    for (const target of REVIEW_MANIFEST.filter(
      (row) => row.chapterCode === chapter.stableCode,
    )) {
      if (
        !sections.some((section) =>
          section.subtopics.some(
            (subtopic) => subtopic.subtopicId === target.subtopicId,
          ),
        )
      )
        return fail('FUNCTIONAL_STUDENT_FAILED');
      await walkReviewCards(
        page,
        target.sectionKey,
        target.cardTitles,
        async (card) => {
          await completeReviewCard(card);
        },
      );
    }
    const completed = await repository.listReviewProgress();
    if (
      cards.some(
        (card) =>
          !completed.some(
            (row) =>
              row.reviewCardId === card.cardId &&
              row.cardVersion === card.version,
          ),
      )
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    const progress = await repository.getLearningProgress(chapter.chapterId);
    if (
      !progress.some(
        (row) => row.scope === 'chapter' && row.reviewCompleted >= cards.length,
      )
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    return {
      completedCards: cards.length,
      progressConfirmed: true,
      mediaDoesNotBlockCompletion: true,
    };
  }, 'FUNCTIONAL_STUDENT_FAILED');
export const remediationFunctional = async (
  page: Page,
  client: SupabaseClient<Database>,
  scope: FunctionalScope,
  journal: PrivateJournal,
) =>
  safely(async () => {
    const repository = createLearningRepository(client);
    const before = await repository.listMistakes();
    const open = before.filter((row) => row.status !== 'resolved');
    if (open.length !== 2) return fail('FUNCTIONAL_STUDENT_FAILED');
    const subtopics = [...new Set(open.map((row) => row.subtopicId))];
    let completed = 0;
    for (const subtopic of subtopics) {
      await finishFunctionalQuiz(
        page,
        client,
        scope,
        0,
        journal,
        `remediation-${String(completed + 1)}`,
        async () => {
          await page.goto('/app/mistakes');
          const group = page.locator(`#mistake-subtopic-${subtopic}`);
          await group
            .getByRole('button', { name: '再挑戰（補救練習）', exact: true })
            .click();
          await page.waitForURL(/\/app\/quiz\/[0-9a-f-]{36}$/u);
        },
      );
      await createEconomyRepository(client).getSummary();
      const result = await (
        await import('../../src/features/quiz/api/quiz-repository')
      )
        .createQuizRepository(client)
        .finalizeSession(quizSessionIdFromPage(page));
      if (result.tokensAwarded !== 0) return fail('FUNCTIONAL_STUDENT_FAILED');
      completed++;
    }
    if (
      (await repository.listMistakes()).some((row) => row.status !== 'resolved')
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    return { resolvedMistakes: open.length, remediationSessions: completed };
  }, 'FUNCTIONAL_STUDENT_FAILED');
export const masteryFunctional = async (
  page: Page,
  client: SupabaseClient<Database>,
  journal: PrivateJournal,
) =>
  safely(async () => {
    const chapter = await functionalChapter(client);
    const repository = createMasteryRepository(client);
    await page.goto('/app/missions');
    const card = page.locator('li.mission-select__item').filter({
      has: page.getByRole('heading', { name: chapter.title, exact: true }),
    });
    await expect(page.locator('li.mission-select__item').first()).toBeVisible();
    let found = false;
    for (let turn = 0; turn < 30; turn++) {
      const matches = await card.count();
      if (matches > 1) return fail('FUNCTIONAL_STUDENT_FAILED');
      if (matches === 1) {
        await expect(card).toBeVisible();
        found = true;
        break;
      }
      const pager = page.getByRole('group', {
        name: '任務章節分頁',
        exact: true,
      });
      const next = pager.getByRole('button', { name: '下一頁', exact: true });
      if (
        (await pager.count()) !== 1 ||
        (await next.count()) !== 1 ||
        !(await next.isEnabled())
      )
        return fail('FUNCTIONAL_STUDENT_FAILED');
      const status = pager.locator('.game-pager__status');
      const before = await status.textContent();
      if (!before) return fail('FUNCTIONAL_STUDENT_FAILED');
      await next.click();
      await expect(status).not.toHaveText(before);
    }
    if (!found) return fail('FUNCTIONAL_STUDENT_FAILED');
    await card
      .getByRole('button', { name: '展開小節任務', exact: true })
      .click();
    await page.waitForURL(/\/app\/missions\/[0-9a-f-]{36}$/u);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    if (!id) return fail('FUNCTIONAL_STUDENT_FAILED');
    await journal.write('mastery-session', { sessionId: id });
    let attempted = 0;
    for (let index = 0; index < 30; index++) {
      const state = await repository.getState(id);
      if (state.chapterId !== chapter.chapterId)
        return fail('FUNCTIONAL_STUDENT_FAILED');
      if (state.status === 'completed') {
        await expect(
          page.getByRole('heading', { name: '階段任務挑戰完成！' }),
        ).toBeVisible();
        if (!state.stages.every((row) => row.completed) || attempted === 0)
          return fail('FUNCTIONAL_STUDENT_FAILED');
        return { completedStages: state.stages.length, attempts: attempted };
      }
      const question = state.question;
      if (!question) return fail('FUNCTIONAL_STUDENT_FAILED');
      const answerText = GENERATED_CORRECT_ANSWERS.get(question.prompt.trim());
      const answer = question.options.find(
        (option) => option.text === answerText && !option.locked,
      );
      if (!answer) return fail('FUNCTIONAL_STUDENT_FAILED');
      if (attempted === 0) {
        if (question.wrongAttempts !== 0)
          return fail('FUNCTIONAL_STUDENT_FAILED');
        const wrong = question.options.find(
          (option) => option.text !== answerText && !option.locked,
        );
        if (!wrong) return fail('FUNCTIONAL_STUDENT_FAILED');
        await page
          .getByRole('radio', { name: wrong.text, exact: true })
          .check();
        await page
          .getByRole('button', { name: '送出答案', exact: true })
          .click();
        attempted++;
        await expect(
          page.getByText('✕ 還不對，該選項已鎖定。可索取提示後再試。', {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('radio', { name: wrong.text, exact: true }),
        ).toBeDisabled();
        const afterWrong = await repository.getState(id);
        if (
          afterWrong.status !== 'in_progress' ||
          afterWrong.position !== state.position ||
          afterWrong.question?.questionId !== question.questionId ||
          afterWrong.question.wrongAttempts !== 1 ||
          !afterWrong.question.options.some(
            (option) => option.id === wrong.id && option.locked,
          )
        )
          return fail('FUNCTIONAL_STUDENT_FAILED');
        await page
          .getByRole('button', { name: '索取第 1 層提示', exact: true })
          .click();
        const hint = page.locator('.mission__hints .ui-hint--tier1');
        await expect(hint).toBeVisible();
        if (!(await hint.locator('span').textContent())?.trim())
          return fail('FUNCTIONAL_STUDENT_FAILED');
      }
      if (attempted >= 30) return fail('FUNCTIONAL_STUDENT_FAILED');
      await page.getByRole('radio', { name: answer.text, exact: true }).check();
      await page.getByRole('button', { name: '送出答案', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: '✓ 答對了', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: /^(?:下一關|查看結算) →$/u })
        .click();
      attempted++;
    }
    return fail('FUNCTIONAL_STUDENT_FAILED');
  }, 'FUNCTIONAL_STUDENT_FAILED');
