import type { Page } from '@playwright/test';
import type { CapacityProtocolActor } from './capacity-protocol';
import type { createCapacityOperationObserver } from './capacity-operation-observer';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { createLearningRepository } from '../../src/features/learning/api/learning-repository';
import { createMasteryRepository } from '../../src/features/learning/api/mastery-repository';
import { createQuizRepository } from '../../src/features/quiz/api/quiz-repository';
import { createEconomyRepository } from '../../src/features/rewards/api/economy-repository';
import { createInventoryRepository } from '../../src/features/inventory/api/inventory-repository';
import { createAchievementRepository } from '../../src/features/achievements/api/achievement-repository';
import { createLeaderboardRepository } from '../../src/features/leaderboard/api/leaderboard-repository';
import { createTeacherContentRepository } from '../../src/features/teacher-content/api/teacher-content-repository';
import { GENERATED_CORRECT_ANSWERS } from '../../tests/fixtures/question-answers.generated';
import {
  startQuizFromLobby,
  waitForFreshQuizQuestion,
  submitSelectedQuizOption,
  quizContinueActionName,
  waitForNextQuizStep,
} from '../../tests/e2e/helpers/quiz';
import { chooseQuizAnswer, quizSessionIdFromPage } from './student-quiz';
import {
  functionalChapter,
  reviewFunctionalCards,
  masteryFunctional,
} from './student-learning';
import { studentLedgerReadback } from './student-economy';
import { capacityFailure } from './capacity-scope';
import type { CapacityGameActor } from './capacity-live-game';
import type { PrivateJournal } from './private-journal';
export const capacityActorJournal = (
  journal: PrivateJournal,
  index: number,
): PrivateJournal => ({
  directory: journal.directory,
  write: (name, value) =>
    journal.write(`actor-${String(index)}-${name}`, value),
});
export const runCapacityStudentGame = async (
  actor: CapacityGameActor,
  userId: string,
  classroomId: string,
  expectedMembers: number,
  journal: PrivateJournal,
  signal: AbortSignal,
) => {
  const { client, page } = actor,
    own = capacityActorJournal(journal, actor.actorIndex),
    check = () => {
      if (signal.aborted) return capacityFailure();
    };
  const learning = createLearningRepository(client),
    chapter = await functionalChapter(client);
  check();
  await own.write('student-review-intent', { chapterId: chapter.chapterId });
  if (page) await reviewFunctionalCards(page, client);
  else {
    const sections = await learning.listChapterReview(chapter.chapterId),
      cards = sections.flatMap((s) => s.subtopics.flatMap((t) => t.cards));
    if (!cards.length) return capacityFailure();
    for (const card of cards) {
      check();
      await learning.completeReviewCard({
        reviewCardId: card.cardId,
        requestId: randomUUID(),
      });
    }
    const completed = await learning.listReviewProgress();
    if (
      cards.some(
        (c) =>
          !completed.some(
            (p) => p.reviewCardId === c.cardId && p.cardVersion === c.version,
          ),
      )
    )
      return capacityFailure();
    const progress = await learning.getLearningProgress(chapter.chapterId);
    if (
      !progress.some(
        (p) => p.scope === 'chapter' && p.reviewCompleted >= cards.length,
      )
    )
      return capacityFailure();
  }
  await own.write('student-review-confirmed', { completed: true });
  check();
  const quiz = createQuizRepository(client),
    economy = createEconomyRepository(client),
    before = await economy.getSummary(),
    requestId = randomUUID();
  await own.write('quiz-create-intent', {
    requestId,
    templateId: chapter.templateId,
  });
  check();
  let session;
  if (page) {
    await startQuizFromLobby(page, { templateId: chapter.templateId });
    session = await quiz.getSession(quizSessionIdFromPage(page));
  } else session = await quiz.createSession(chapter.templateId, requestId);
  const id = session.sessionId,
    total = session.questionCount;
  if (total < 1 || total > 30 || session.answeredCount !== 0)
    return capacityFailure();
  await own.write('quiz-created', { sessionId: id, questionCount: total });
  for (let position = 1; position <= total; position++) {
    check();
    if (page) await waitForFreshQuizQuestion(page);
    const state = await quiz.getSession(id),
      question = state.questions.find((q) => q.position === position);
    if (!question || state.answeredCount !== position - 1)
      return capacityFailure();
    const option = chooseQuizAnswer(question, false),
      key = randomUUID();
    await own.write(`quiz-question-${String(position)}-intent`, {
      sessionId: id,
      position,
      idempotencyKey: key,
    });
    check();
    await actor.measure('submit_answer', 'warm', async () => {
      if (page) {
        await expect(page.locator('.question-card legend')).toHaveText(
          question.prompt,
        );
        await page
          .getByRole('radio', { name: option.text, exact: true })
          .check();
        check();
        await submitSelectedQuizOption(page);
      } else
        await quiz.submitAnswer(question.sessionQuestionId, option.id, key);
    });
    const answered = (await quiz.getSession(id)).questions.find(
      (q) => q.position === position,
    );
    if (
      answered?.answerStatus !== 'correct' ||
      answered.selectedOptionId !== option.id
    )
      return capacityFailure();
    await own.write(`quiz-question-${String(position)}-confirmed`, {
      position,
      correct: true,
    });
    check();
    const advance = async () => {
      if (page) {
        await page
          .getByRole('button', {
            name: quizContinueActionName('correct', position === total),
            exact: true,
          })
          .click();
        await waitForNextQuizStep(page);
        if (position === total) await page.waitForURL(/\/result$/u);
      } else if (position < total) await quiz.activateNextQuestion(id);
    };
    if (position === total)
      await actor.measure('finalize_quiz', 'warm', async () => {
        await advance();
        if (!page) await quiz.finalizeSession(id);
      });
    else await advance();
  }
  const result = await quiz.finalizeSession(id),
    replay = await quiz.finalizeSession(id),
    after = await economy.getSummary();
  const answers = await client
    .from('quiz_answers')
    .select('session_question_id, user_id, answer_status')
    .eq('session_id', id)
    .retry(false);
  if (
    answers.error ||
    answers.data.length !== total ||
    new Set(answers.data.map((a) => a.session_question_id)).size !== total ||
    answers.data.some(
      (a) => a.user_id !== userId || a.answer_status !== 'correct',
    ) ||
    result.correctCount !== total ||
    result.answeredCount !== total ||
    JSON.stringify(result) !== JSON.stringify(replay) ||
    after.totalXp - before.totalXp !== result.xpAwarded ||
    after.tokenBalance - before.tokenBalance !== result.tokensAwarded
  )
    return capacityFailure();
  await own.write('quiz-finalized', {
    sessionId: id,
    questionCount: total,
    xpAwarded: result.xpAwarded,
    tokensAwarded: result.tokensAwarded,
    replayConfirmed: true,
  });
  check();
  if (page) await masteryFunctional(page, client, own);
  else {
    const mastery = createMasteryRepository(client),
      masteryId = await mastery.startSession(chapter.chapterId);
    await own.write('mastery-session', { sessionId: masteryId });
    let completed = false;
    for (let i = 0; i < 30; i++) {
      check();
      const state = await mastery.getState(masteryId);
      if (state.status === 'completed') {
        if (!state.stages.every((s) => s.completed)) return capacityFailure();
        completed = true;
        break;
      }
      const q = state.question;
      if (!q) return capacityFailure();
      const text = GENERATED_CORRECT_ANSWERS.get(q.prompt.trim()),
        choice = q.options.find((o) => o.text === text && !o.locked);
      if (!choice) return capacityFailure();
      if (!(await mastery.submitAttempt(masteryId, choice.id)).isCorrect)
        return capacityFailure();
    }
    if (!completed) return capacityFailure();
  }
  await own.write('mastery-confirmed', { complete: true });
  check();
  const inventory = createInventoryRepository(client),
    stock = await inventory.getInventory();
  const newItem = stock.items
    .filter(
      (i) => !i.owned && i.costTokens > 0 && i.costTokens <= stock.tokenBalance,
    )
    .sort((a, b) => a.costTokens - b.costTokens)[0];
  const target =
    newItem ??
    stock.items.find((i) => i.owned && !i.equipped) ??
    stock.items.find((i) => i.owned);
  if (!target) return capacityFailure();
  const walletBefore = await client
    .from('wallet_transactions')
    .select('id,amount,source_type,source_id')
    .eq('user_id', userId)
    .retry(false);
  if (walletBefore.error) return capacityFailure();
  if (page) await page.goto('/app/shop');
  if (newItem) {
    await own.write('purchase-intent', { blookId: target.id });
    check();
    if (page) {
      await page
        .getByRole('button', {
          name: `購買 ${target.name}，${String(target.costTokens)} Token`,
          exact: true,
        })
        .click();
      await page
        .getByRole('dialog', { name: `購買「${target.name}」？`, exact: true })
        .getByRole('button', { name: '確認購買', exact: true })
        .click();
      await expect(
        page.getByText(`已購買${target.name}。`, { exact: true }),
      ).toBeVisible();
    } else await inventory.purchaseBlook(target.id);
    const bought = await inventory.getInventory();
    if (
      !bought.items.find((i) => i.id === target.id)?.owned ||
      stock.tokenBalance - bought.tokenBalance !== target.costTokens
    )
      return capacityFailure();
    const replayed = await inventory.purchaseBlook(target.id);
    if (JSON.stringify(replayed) !== JSON.stringify(bought))
      return capacityFailure();
  }
  check();
  if (page && !target.equipped) {
    await page
      .getByRole('button', { name: `選用 ${target.name}`, exact: true })
      .click();
    await expect(
      page.getByText(`已裝備${target.name}。`, { exact: true }),
    ).toBeVisible();
  } else await inventory.equipBlook(target.id);
  const equipped = await inventory.getInventory(),
    walletAfter = await client
      .from('wallet_transactions')
      .select('id,amount,source_type,source_id')
      .eq('user_id', userId)
      .retry(false);
  if (
    walletAfter.error ||
    equipped.activeBlookId !== target.id ||
    walletAfter.data.filter(
      (r) => r.source_type === 'blook_purchase' && r.source_id === target.id,
    ).length !==
      (newItem
        ? 1
        : walletBefore.data.filter(
            (r) =>
              r.source_type === 'blook_purchase' && r.source_id === target.id,
          ).length)
  )
    return capacityFailure();
  const catalog = await createAchievementRepository(client).getCatalog();
  if (!catalog.totalCount || !catalog.unlockedCount) return capacityFailure();
  if (page) {
    await page.goto('/app/achievements');
    await expect(
      page.getByRole('heading', { name: /成就/u }).first(),
    ).toBeVisible();
  }
  await actor.measure(
    'leaderboard',
    'cold',
    async () => {
      if (page) {
        await page.goto(`/app/leaderboard/${classroomId}`);
        await expect(
          page.getByRole('heading', { name: /排行榜/u }).first(),
        ).toBeVisible();
      } else
        await createLeaderboardRepository(client).getClassroomLeaderboard(
          classroomId,
        );
    },
    true,
  );
  const ranking =
      await createLeaderboardRepository(client).getClassroomLeaderboard(
        classroomId,
      ),
    summary = await economy.getSummary();
  if (
    ranking.classroomId !== classroomId ||
    ranking.memberCount !== expectedMembers ||
    !ranking.selfEntry?.isSelf ||
    ranking.selfEntry.totalXp !== summary.totalXp
  )
    return capacityFailure();
  await studentLedgerReadback(client, userId);
  await own.write('student-completed', {
    quizQuestions: total,
    mastery: true,
    purchase: newItem !== undefined,
    equip: true,
    achievements: true,
    leaderboard: true,
    ledgerReconciled: true,
  });
  return {
    quizQuestions: total,
    mastery: true,
    economy: true,
    ledgerReconciled: true,
  };
};
export const readCapacityTeacherDuringLoad = async (
  actor: CapacityGameActor,
  classroomId: string,
  businessActive: () => boolean,
  signal: AbortSignal,
): Promise<void> => {
  for (let index = 0; index < 30; index++) {
    if (signal.aborted || !businessActive()) return capacityFailure();
    await actor.measure(
      'teacher_dashboard',
      actor.observed?.('teacher_dashboard') ? 'warm' : 'cold',
      async () => {
        if (actor.page) {
          await actor.page.goto(`/teacher?classroomId=${classroomId}`);
          await expect(
            actor.page.getByRole('heading', { name: '教學分析', exact: true }),
          ).toBeVisible();
        } else
          await createTeacherContentRepository(
            actor.client,
          ).getClassroomOverview(classroomId, {});
      },
      true,
    );
    if (!businessActive()) return capacityFailure();
  }
};

export const capacityGameActor = (
  protocol: CapacityProtocolActor,
  page?: Page,
  observer?: Awaited<ReturnType<typeof createCapacityOperationObserver>>,
): CapacityGameActor => {
  if (page && !observer) return capacityFailure();
  return {
    actorIndex: protocol.actorIndex,
    observePhysical: protocol.observePhysical,
    observed: (operation) =>
      (observer ? observer.samples() : protocol.samples()).some(
        (row) => row.operation === operation && row.attempts.length > 0,
      ),
    client: protocol.client,
    ...(page ? { page } : {}),
    measure: observer
      ? (op, cache, action, _retry, replay) =>
          observer.run(op, cache, action, replay)
      : protocol.measure,
  };
};

export const settleCapacityGameWork = async <T>(
  work: Promise<T>[],
  stop: () => void,
) => {
  const results = await Promise.allSettled(
    work.map((task) =>
      task.catch(() => {
        stop();
        return capacityFailure();
      }),
    ),
  );
  if (results.some((result) => result.status !== 'fulfilled'))
    return capacityFailure();
  return results.map((result) =>
    result.status === 'fulfilled' ? result.value : capacityFailure(),
  );
};
