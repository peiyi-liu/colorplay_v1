import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '../../../types/database';
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
});
