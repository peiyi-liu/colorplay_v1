import { readQueryRetryDelay } from '../../../lib/query/read-retry';
import { QuizRepositoryError } from '../api/quiz-errors';

export const quizReadQueryOptions = {
  retry: (failureCount: number, error: QuizRepositoryError): boolean =>
    error instanceof QuizRepositoryError &&
    error.code === 'UNAVAILABLE' &&
    failureCount < 2,
  retryDelay: readQueryRetryDelay,
};
