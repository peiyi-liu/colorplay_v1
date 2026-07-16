import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { GENERATED_CORRECT_ANSWERS } from '../../../../tests/fixtures/question-answers.generated';
import { TEST_USERS } from '../../../../tests/fixtures/users';
import { signedInClient } from '../../../../tests/helpers/signed-in-client';
import { createQuizRepository } from '../../quiz/api/quiz-repository';
import {
  createInventoryRepository,
  InventoryRepositoryError,
} from './inventory-repository';

describe('InventoryRepository with local Supabase', () => {
  const clients: Awaited<ReturnType<typeof signedInClient>>[] = [];

  afterAll(async () => {
    await Promise.all(
      clients.map((client) => client.auth.signOut({ scope: 'local' })),
    );
  });

  it('keeps inventories private and supports real reward, retry, equip, and shortfall flow', async () => {
    const studentOne = await signedInClient(TEST_USERS.studentOne);
    const studentTwo = await signedInClient(TEST_USERS.studentTwo);
    clients.push(studentOne, studentTwo);
    const firstInventory = createInventoryRepository(studentOne);
    const secondInventory = createInventoryRepository(studentTwo);

    const initialOne = await firstInventory.getInventory();
    const initialTwo = await secondInventory.getInventory();
    expect(initialOne).toEqual(initialTwo);
    expect(initialOne.items.filter((item) => item.owned)).toHaveLength(1);

    const quiz = createQuizRepository(studentOne);
    let session = await quiz.createSession(
      '26000000-0000-0000-0000-000000000003',
      randomUUID(),
    );
    for (let position = 0; position < session.questionCount; position += 1) {
      const question = session.questions[position];
      if (!question) throw new Error('INTEGRATION_QUESTION_MISSING');
      const correctText = GENERATED_CORRECT_ANSWERS.get(question.prompt);
      const correctOption = question.options.find(
        (option) => option.text === correctText,
      );
      if (!correctOption) throw new Error('INTEGRATION_ANSWER_MISSING');

      await quiz.submitAnswer(
        question.sessionQuestionId,
        correctOption.id,
        randomUUID(),
      );
      if (position + 1 < session.questionCount) {
        session = await quiz.activateNextQuestion(session.sessionId);
      }
    }
    const finalized = await studentOne.rpc('finalize_quiz_session', {
      session_id: session.sessionId,
    });
    expect(finalized.error).toBeNull();
    expect((finalized.data as { tokens_awarded: number }).tokens_awarded).toBe(
      250,
    );

    const luckyCat = initialOne.items.find(
      (item) => item.stableCode === 'lucky_cat',
    );
    const travelFrog = initialOne.items.find(
      (item) => item.stableCode === 'travel_frog',
    );
    if (!luckyCat || !travelFrog) throw new Error('INTEGRATION_BLOOK_MISSING');

    const purchased = await firstInventory.purchaseBlook(luckyCat.id);
    const retried = await firstInventory.purchaseBlook(luckyCat.id);
    expect(purchased.tokenBalance).toBe(150);
    expect(retried).toEqual(purchased);

    const equipped = await firstInventory.equipBlook(luckyCat.id);
    expect(equipped.activeBlookId).toBe(luckyCat.id);
    await expect(firstInventory.purchaseBlook(travelFrog.id)).rejects.toEqual(
      new InventoryRepositoryError('INSUFFICIENT_TOKENS', 100),
    );
    expect((await secondInventory.getInventory()).tokenBalance).toBe(0);
  });
});
