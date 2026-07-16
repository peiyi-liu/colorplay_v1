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

import {
  QuizRepositoryError,
  type QuizAnswerResult,
  type QuizQuestion,
  type QuizRepository,
  type QuizSession,
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
  correctCount: questions.filter(
    ({ answerStatus }) => answerStatus === 'correct',
  ).length,
  gameRulesVersion: '2026-07-mvp-1',
  questionCount: questions.length,
  questions,
  sessionId,
  status: 'in_progress',
  templateId,
  tokensAwarded: 0,
  totalScore: questions.reduce(
    (total, item) => total + (item.scoreDelta ?? 0),
    0,
  ),
  rewardRatePercent: 100,
  xpAwarded: 0,
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
  const activateNextQuestion = vi.fn<QuizRepository['activateNextQuestion']>();
  const createSession = vi.fn<QuizRepository['createSession']>();
  const finalizeSession = vi.fn<QuizRepository['finalizeSession']>();
  const getSession = vi.fn<QuizRepository['getSession']>();
  const submitAnswer = vi.fn<QuizRepository['submitAnswer']>();
  return {
    createSession,
    activateNextQuestion,
    finalizeSession,
    getSession,
    repository: {
      activateNextQuestion,
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
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  render(<RouterProvider router={router} />, { wrapper: Wrapper });
  return { client, router };
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
        deadlineAt: null,
        startedAt: null,
      },
    ]);
    const activated = session([
      refreshed.questions[0] ?? first,
      {
        ...second,
        deadlineAt: '2099-07-14T12:01:00.000Z',
        startedAt: '2099-07-14T12:00:40.000Z',
      },
    ]);
    mock.getSession.mockResolvedValueOnce(session([first, second]));
    mock.getSession.mockResolvedValueOnce(refreshed);
    mock.submitAnswer.mockResolvedValue(incorrectResult);
    mock.activateNextQuestion.mockResolvedValue(activated);
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
    expect(mock.activateNextQuestion).toHaveBeenCalledWith(sessionId);
    expect(await screen.findByText('第 2 題')).toBeVisible();
    expect(screen.queryByText('RGB 使用三色光。')).toBeNull();
    expect(screen.getByRole('button', { name: '送出答案' })).toBeDisabled();
  });

  it('restores terminal feedback after refresh without starting the next timer', async () => {
    const mock = repositoryMock();
    const first = question(1, {
      answerStatus: 'incorrect',
      correctOptionId: '33000000-0000-0000-0000-000000000001',
      explanation: incorrectResult.explanation,
      scoreDelta: 0,
      selectedOptionId: '33000000-0000-0000-0000-000000000002',
    });
    const second = question(2, { deadlineAt: null, startedAt: null });
    mock.getSession.mockResolvedValue(session([first, second]));
    renderQuiz(mock.repository);

    expect(
      await screen.findByRole('heading', { name: '✕ 答錯了' }),
    ).toBeVisible();
    expect(screen.getByText('已作答')).toBeVisible();
    expect(screen.getByText(incorrectResult.explanation)).toBeVisible();
  });

  it('shows final feedback from authoritative answered rows before stored aggregates finalize', async () => {
    const mock = repositoryMock();
    const answered = question(1, {
      answerStatus: 'correct',
      correctOptionId: '33000000-0000-0000-0000-000000000001',
      explanation: 'RGB 使用三色光。',
      scoreDelta: 150,
      selectedOptionId: '33000000-0000-0000-0000-000000000001',
    });
    mock.getSession.mockResolvedValue({
      ...session([answered]),
      answeredCount: 0,
      correctCount: 0,
      totalScore: 0,
    });
    renderQuiz(mock.repository);

    expect(
      await screen.findByRole('heading', { name: '✓ 答對了' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: '結算並查看結果' }),
    ).toBeEnabled();
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
    mock.getSession.mockResolvedValueOnce(session([expired])).mockResolvedValue(
      session([
        {
          ...expired,
          answerStatus: 'timeout',
          correctOptionId: expired.options[0]?.id ?? null,
          explanation: incorrectResult.explanation,
          scoreDelta: 0,
          selectedOptionId: null,
        },
      ]),
    );
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

  it('reconciles a failed submit and retries with the original idempotency key', async () => {
    const mock = repositoryMock();
    const first = question(1);
    const answered = session([
      {
        ...first,
        answerStatus: 'incorrect',
        correctOptionId: first.options[0]?.id ?? null,
        explanation: incorrectResult.explanation,
        scoreDelta: 0,
        selectedOptionId: first.options[1]?.id ?? null,
      },
    ]);
    mock.getSession
      .mockResolvedValueOnce(session([first]))
      .mockResolvedValueOnce(session([first]))
      .mockResolvedValue(answered);
    mock.submitAnswer
      .mockRejectedValueOnce(new QuizRepositoryError('UNAVAILABLE'))
      .mockResolvedValueOnce(incorrectResult);
    renderQuiz(mock.repository);

    await userEvent.click(await screen.findByRole('radio', { name: 'CMYK' }));
    await userEvent.click(screen.getByRole('button', { name: '送出答案' }));
    expect(
      await screen.findByText('答題服務暫時無法使用，請稍後重試。'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '重試送出' }));

    expect(
      await screen.findByRole('heading', { name: '✕ 答錯了' }),
    ).toBeVisible();
    expect(mock.submitAnswer).toHaveBeenCalledTimes(2);
    expect(mock.submitAnswer.mock.calls[0]?.[2]).toBe(
      mock.submitAnswer.mock.calls[1]?.[2],
    );
  });

  it('creates a new idempotent session and replaces the temporary URL', async () => {
    const mock = repositoryMock();
    mock.createSession.mockResolvedValue(session([question(1)]));
    mock.getSession.mockResolvedValue(session([question(1)]));
    const { router } = renderQuiz(
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

  it('shows a failed session creation and retries with the original request id', async () => {
    const mock = repositoryMock();
    mock.createSession
      .mockRejectedValueOnce(new QuizRepositoryError('UNAVAILABLE'))
      .mockResolvedValueOnce(session([question(1)]));
    mock.getSession.mockResolvedValue(session([question(1)]));
    const { router } = renderQuiz(
      mock.repository,
      `/app/quiz/new?template=${templateId}`,
    );

    expect(
      await screen.findByRole('heading', { name: '無法建立挑戰' }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '重新嘗試' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/app/quiz/${sessionId}`);
    });
    expect(mock.createSession).toHaveBeenCalledTimes(2);
    expect(mock.createSession.mock.calls[0]?.[1]).toBe(
      mock.createSession.mock.calls[1]?.[1],
    );
  });

  it('refreshes the user economy before showing a finalized result', async () => {
    const mock = repositoryMock();
    const lastQuestion = question(1, {
      answerStatus: 'correct',
      correctOptionId: '33000000-0000-0000-0000-000000000001',
      explanation: 'RGB 使用三色光。',
      scoreDelta: 1_000,
      selectedOptionId: '33000000-0000-0000-0000-000000000001',
    });
    mock.getSession.mockResolvedValue(session([lastQuestion]));
    mock.finalizeSession.mockResolvedValue({
      answeredCount: 1,
      completedAt: '2099-07-14T12:01:00.000Z',
      correctCount: 1,
      gameRulesVersion: '2026-07-mvp-1',
      questionCount: 1,
      rewardRatePercent: 100,
      sessionId,
      status: 'completed',
      tokensAwarded: 250,
      totalScore: 1_000,
      xpAwarded: 750,
    });
    const { client, router } = renderQuiz(mock.repository);
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries');

    await userEvent.click(
      await screen.findByRole('button', { name: '結算並查看結果' }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/app/quiz/${sessionId}/result`,
      );
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['economy', 'summary'],
    });
    expect(mock.finalizeSession.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateQueries.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
