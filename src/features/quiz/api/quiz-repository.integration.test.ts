import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '../../../types/database';
import { GENERATED_CORRECT_ANSWERS } from '../../../../tests/fixtures/question-answers.generated';
import { TEST_USERS } from '../../../../tests/fixtures/users';
import { createQuizRepository } from './quiz-repository';

const localEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('LOCAL_PUBLIC_ENV_MISSING');
  return { anonKey, url } as const;
};

const signedInRepository = async () => {
  const { anonKey, url } = localEnvironment();
  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword(TEST_USERS.studentOne);
  if (error) throw new Error('QUIZ_TEST_SIGN_IN_FAILED');
  return createQuizRepository(client);
};

describe('quiz repository with local Supabase', () => {
  it('returns the original answer for simultaneous retries with one idempotency key', async () => {
    const [firstRepository, secondRepository] = await Promise.all([
      signedInRepository(),
      signedInRepository(),
    ]);
    const session = await firstRepository.createSession(
      '26000000-0000-0000-0000-000000000003',
      randomUUID(),
    );
    const firstQuestion = session.questions[0];
    const selectedOption = firstQuestion?.options[0];
    if (!firstQuestion || !selectedOption)
      throw new Error('QUIZ_TEST_DATA_MISSING');
    const idempotencyKey = randomUUID();

    const [firstResult, secondResult] = await Promise.all([
      firstRepository.submitAnswer(
        firstQuestion.sessionQuestionId,
        selectedOption.id,
        idempotencyKey,
      ),
      secondRepository.submitAnswer(
        firstQuestion.sessionQuestionId,
        selectedOption.id,
        idempotencyKey,
      ),
    ]);

    expect(secondResult).toEqual(firstResult);
  });

  it('returns live authoritative aggregates after the final answer and before finalize', async () => {
    const { anonKey, url } = localEnvironment();
    const client = createClient<Database>(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword(
      TEST_USERS.studentTwo,
    );
    if (error) throw new Error('QUIZ_TEST_SIGN_IN_FAILED');
    const repository = createQuizRepository(client);

    try {
      let current = await repository.createSession(
        '26000000-0000-0000-0000-000000000003',
        randomUUID(),
      );
      for (let position = 0; position < current.questionCount; position += 1) {
        const question = current.questions[position];
        if (!question) throw new Error('QUIZ_TEST_QUESTION_MISSING');
        const correctText = GENERATED_CORRECT_ANSWERS.get(question.prompt);
        const correctOption = question.options.find(
          (option) => option.text === correctText,
        );
        if (!correctOption) throw new Error('QUIZ_TEST_ANSWER_MISSING');
        await repository.submitAnswer(
          question.sessionQuestionId,
          correctOption.id,
          randomUUID(),
        );
        if (position + 1 < current.questionCount) {
          current = await repository.activateNextQuestion(current.sessionId);
        }
      }

      const beforeFinalize = await repository.getSession(current.sessionId);

      expect(beforeFinalize.status).toBe('in_progress');
      expect(beforeFinalize).toMatchObject({
        answeredCount: 10,
        correctCount: 10,
        totalScore: 1_500,
      });
      expect(beforeFinalize.questions.at(-1)?.answerStatus).toBe('correct');
    } finally {
      await client.auth.signOut({ scope: 'local' });
    }
  });
});
