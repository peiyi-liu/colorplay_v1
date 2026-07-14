import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  QuizAnswerResult,
  QuizQuestion,
  QuizRepository,
  QuizSession,
} from '../api/quiz-repository';
import { QuizSessionPage } from './quiz-session';

const sessionId = '31000000-0000-0000-0000-000000000001';
const templateId = '26000000-0000-0000-0000-000000000003';

const question = (
  position: number,
  overrides: Partial<QuizQuestion> = {},
): QuizQuestion => ({
  answerStatus: null,
  correctOptionId: null,
  deadlineAt: '2099-07-14T12:00:20.000Z',
  explanation: null,
  options: [
    {
      id: `33000000-0000-0000-0000-${String(position * 2 - 1).padStart(12, '0')}`,
      key: 'A',
      sortOrder: 1,
      text: 'RGB',
    },
    {
      id: `33000000-0000-0000-0000-${String(position * 2).padStart(12, '0')}`,
      key: 'B',
      sortOrder: 2,
      text: 'CMYK',
    },
  ],
  position,
  prompt: `第 ${String(position)} 題`,
  scoreDelta: null,
  selectedOptionId: null,
  sessionQuestionId: `32000000-0000-0000-0000-${String(position).padStart(12, '0')}`,
  stableCode: `3-1-${String(position).padStart(2, '0')}`,
  startedAt: position === 1 ? '2099-07-14T12:00:00.000Z' : null,
  version: 1,
  ...overrides,
});

const session = (questions: QuizQuestion[]): QuizSession => ({
  answeredCount: questions.filter(({ answerStatus }) => answerStatus !== null)
    .length,
  chapterTitle: '色彩表示',
  completedAt: null,
  correctCount: questions.filter(({ answerStatus }) => answerStatus === 'correct')
    .length,
  questionCount: questions.length,
  questions,
  sessionId,
  status: 'in_progress',
  totalScore: questions.reduce(
    (total, item) => total + (item.scoreDelta ?? 0),
    0,
  ),
});

const incorrectResult: QuizAnswerResult = {
  answerStatus: 'incorrect',
  correctOptionId: '33000000-0000-0000-0000-000000000001',
  correctOptionText: 'RGB',
  explanation: 'RGB 使用三色光。',
  responseMs: 6000,
  scoreDelta: 0,
  selectedOptionId: '33000000-0000-0000-0000-000000000002',
  totalScore: 0,
};

function repositoryMock() {
  const createSession = vi.fn<QuizRepository['createSession']>();
  const finalizeSession = vi.fn<QuizRepository['finalizeSession']>();
  const getSession = vi.fn<QuizRepository['getSession']>();
  const submitAnswer = vi.fn<QuizRepository['submitAnswer']>();
  return {
    createSession,
    finalizeSession,
    getSession,
    repository: {
      createSession,
      finalizeSession,
      getSession,
      submitAnswer,
    } satisfies QuizRepository,
    submitAnswer,
  };
}

function renderQuiz(
  repository: QuizRepository,
  initialEntry = `/app/quiz/${sessionId}`,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const routes: RouteObject[] = [
    {
      path: '/app/quiz/:sessionId',
      element: <QuizSessionPage repository={repository} />,
    },
    {
      path: '/app/quiz/:sessionId/result',
      element: <h1>挑戰結果</h1>,
    },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<RouterProvider router={router} />, { wrapper: Wrapper });
  return router;
}

describe('QuizSessionPage', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('submits one answer, locks options during feedback, then advances with clean state', async () => {
    const mock = repositoryMock();
    const first = question(1);
    const second = question(2);
    const refreshed = session([
      {
        ...first,
        answerStatus: 'incorrect',
        correctOptionId: first.options[0]?.id ?? null,
        explanation: incorrectResult.explanation,
        scoreDelta: 0,
        selectedOptionId: first.options[1]?.id ?? null,
      },
      {
        ...second,
        deadlineAt: '2099-07-14T12:01:00.000Z',
        startedAt: '2099-07-14T12:00:40.000Z',
      },
    ]);
    mock.getSession.mockResolvedValueOnce(session([first, second]));
    mock.getSession.mockResolvedValueOnce(refreshed);
    mock.submitAnswer.mockResolvedValue(incorrectResult);
    renderQuiz(mock.repository);

    expect(await screen.findByText('第 1 題')).toBeVisible();
    await userEvent.click(screen.getByRole('radio', { name: 'CMYK' }));
    await userEvent.click(screen.getByRole('button', { name: '送出答案' }));

    expect(
      await screen.findByRole('heading', { name: '✕ 答錯了' }),
    ).toBeVisible();
    expect(mock.submitAnswer).toHaveBeenCalledWith(
      first.sessionQuestionId,
      first.options[1]?.id,
      expect.any(String),
    );
    for (const option of screen.getAllByRole('radio')) {
      expect(option).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: '送出答案' })).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: '我理解了，下一題' }),
    );
    expect(await screen.findByText('第 2 題')).toBeVisible();
    expect(screen.queryByText('RGB 使用三色光。')).toBeNull();
    expect(screen.getByRole('button', { name: '送出答案' })).toBeDisabled();
  });

  it('submits null when the server deadline is already elapsed', async () => {
    const mock = repositoryMock();
    const expired = question(1, {
      deadlineAt: '2020-07-14T12:00:00.000Z',
      startedAt: '2020-07-14T11:59:40.000Z',
    });
    const result: QuizAnswerResult = {
      ...incorrectResult,
      answerStatus: 'timeout',
      responseMs: 20_001,
      selectedOptionId: null,
    };
    mock.getSession.mockResolvedValue(session([expired]));
    mock.submitAnswer.mockResolvedValue(result);
    renderQuiz(mock.repository);

    await waitFor(() => {
      expect(mock.submitAnswer).toHaveBeenCalledWith(
        expired.sessionQuestionId,
        null,
        expect.any(String),
      );
    });
    expect(
      await screen.findByRole('heading', { name: '⌛ 作答逾時' }),
    ).toBeVisible();
  });

  it('creates a new idempotent session and replaces the temporary URL', async () => {
    const mock = repositoryMock();
    mock.createSession.mockResolvedValue(session([question(1)]));
    mock.getSession.mockResolvedValue(session([question(1)]));
    const router = renderQuiz(
      mock.repository,
      `/app/quiz/new?template=${templateId}`,
    );

    await waitFor(() => {
      expect(mock.createSession).toHaveBeenCalledOnce();
    });
    expect(mock.createSession).toHaveBeenCalledWith(
      templateId,
      expect.any(String),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/app/quiz/${sessionId}`);
    });
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
