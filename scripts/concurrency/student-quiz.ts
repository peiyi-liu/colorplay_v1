import { expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';
import {
  createQuizRepository,
  type QuizFinalResult,
  type QuizSession,
} from '../../src/features/quiz/api/quiz-repository';
import { createEconomyRepository } from '../../src/features/rewards/api/economy-repository';
import { GENERATED_CORRECT_ANSWERS } from '../../tests/fixtures/question-answers.generated';
import {
  quizContinueActionName,
  startQuizFromLobby,
  submitSelectedQuizOption,
  waitForNextQuizStep,
  waitForFreshQuizQuestion,
} from '../../tests/e2e/helpers/quiz';
import { attachAchievementSettlement } from '../../tests/e2e/helpers/achievement-settlement';
import { fail, safely, type FunctionalScope } from './config';
import type { PrivateJournal } from './private-journal';

export const chooseQuizAnswer = (
  question: QuizSession['questions'][number],
  wrong: boolean,
) => {
  // Oracle stays in Node tooling only. Unanswered backend state must not reveal
  // correct options/explanation; the browser only receives the chosen click.
  if (
    question.answerStatus !== null ||
    question.correctOptionId !== null ||
    question.explanation !== null
  )
    return fail('FUNCTIONAL_STUDENT_FAILED');
  const correct = GENERATED_CORRECT_ANSWERS.get(question.prompt.trim());
  if (!correct) return fail('FUNCTIONAL_STUDENT_FAILED');
  const options = question.options.filter((option) =>
    wrong ? option.text !== correct : option.text === correct,
  );
  const answer = options[0];
  if (!answer || (!wrong && options.length !== 1))
    return fail('FUNCTIONAL_STUDENT_FAILED');
  return answer;
};
export const quizSessionIdFromPage = (page: Page) => {
  const match = /^\/app\/quiz\/([0-9a-f-]{36})(?:\/result)?$/u.exec(
    new URL(page.url()).pathname,
  );
  return match?.[1] ?? fail('FUNCTIONAL_STUDENT_FAILED');
};
export const finishFunctionalQuiz = async (
  page: Page,
  client: SupabaseClient<Database>,
  scope: FunctionalScope,
  wrongCount: number,
  journal: PrivateJournal,
  tag: string,
  start: () => Promise<void>,
): Promise<QuizFinalResult> =>
  safely(async () => {
    const repository = createQuizRepository(client);
    const economy = createEconomyRepository(client);
    const before = await economy.getSummary();
    const settlement = attachAchievementSettlement(page, scope.supabaseUrl);
    await start();
    const id = quizSessionIdFromPage(page);
    await journal.write(`${tag}-session`, { sessionId: id });
    const initial = await repository.getSession(id);
    if (
      initial.questionCount < wrongCount ||
      initial.questionCount > 30 ||
      initial.answeredCount !== 0
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    for (let position = 1; position <= initial.questionCount; position++) {
      await waitForFreshQuizQuestion(page);
      const session = await repository.getSession(id);
      const question = session.questions.find(
        (value) => value.position === position,
      );
      if (!question || session.answeredCount !== position - 1)
        return fail('FUNCTIONAL_STUDENT_FAILED');
      const wrong = position <= wrongCount;
      const answer = chooseQuizAnswer(question, wrong);
      await expect(page.getByLabel('挑戰進度')).toContainText(
        `第 ${String(position)} / ${String(initial.questionCount)} 題`,
      );
      await expect(page.locator('.question-card legend')).toHaveText(
        question.prompt,
      );
      await page.getByRole('radio', { name: answer.text, exact: true }).check();
      await submitSelectedQuizOption(page);
      const answered = (await repository.getSession(id)).questions.find(
        (row) => row.position === position,
      );
      if (
        answered?.answerStatus !== (wrong ? 'incorrect' : 'correct') ||
        answered.selectedOptionId !== answer.id
      )
        return fail('FUNCTIONAL_STUDENT_FAILED');
      await page
        .getByRole('button', {
          name: quizContinueActionName(
            wrong ? 'incorrect' : 'correct',
            position === initial.questionCount,
          ),
          exact: true,
        })
        .click();
      await waitForNextQuizStep(page);
    }
    await page.waitForURL(/\/result$/u);
    await settlement.waitBeforeLeavingResult();
    const final = await repository.finalizeSession(id);
    const repeated = await repository.finalizeSession(id);
    const answers = await client
      .from('quiz_answers')
      .select('session_question_id, user_id, answer_status')
      .eq('session_id', id)
      .retry(false);
    const user = await client.auth.getUser();
    if (
      answers.error ||
      user.error ||
      answers.data.length !== initial.questionCount ||
      new Set(answers.data.map((row) => row.session_question_id)).size !==
        initial.questionCount ||
      answers.data.some((row) => row.user_id !== user.data.user.id) ||
      answers.data.filter((row) => row.answer_status === 'correct').length !==
        final.correctCount
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    const after = await economy.getSummary();
    if (
      JSON.stringify(final) !== JSON.stringify(repeated) ||
      final.answeredCount !== initial.questionCount ||
      final.correctCount !== initial.questionCount - wrongCount ||
      after.totalXp - before.totalXp !== final.xpAwarded ||
      after.tokenBalance - before.tokenBalance !== final.tokensAwarded
    )
      return fail('FUNCTIONAL_STUDENT_FAILED');
    await journal.write(`${tag}-finalized`, { sessionId: id, result: final });
    return final;
  }, 'FUNCTIONAL_STUDENT_FAILED');
export const formalFunctionalQuiz = (
  page: Page,
  client: SupabaseClient<Database>,
  scope: FunctionalScope,
  templateId: string,
  wrongCount: number,
  journal: PrivateJournal,
  tag: string,
) =>
  finishFunctionalQuiz(page, client, scope, wrongCount, journal, tag, () =>
    startQuizFromLobby(page, { templateId }),
  );
