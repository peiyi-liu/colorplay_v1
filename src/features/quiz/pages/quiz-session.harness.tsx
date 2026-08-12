// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Routes, Route } from 'react-router-dom';

import { StudentHudHarness } from '../../../app/shell/student-hud.harness';
import type {
  QuizQuestion,
  QuizRepository,
  QuizSession,
} from '../api/quiz-repository';
import { QuizSessionPage } from './quiz-session';

export type QuizSessionHarnessScenario = 'idle' | 'correct';

const sessionId = '31000000-0000-0000-0000-000000000001';
const harnessStartedAt = new Date().toISOString();
const harnessDeadlineAt = new Date(Date.now() + 20_000).toISOString();

function fixtureQuestion(scenario: QuizSessionHarnessScenario): QuizQuestion {
  const correct = scenario === 'correct';
  return {
    answerStatus: correct ? 'correct' : null,
    correctOptionId: correct ? 'option-a' : null,
    deadlineAt: harnessDeadlineAt,
    explanation: correct ? '色相、明度、彩度共同描述色彩。' : null,
    options: [
      { id: 'option-a', key: 'A', sortOrder: 1, text: '色相、明度、彩度' },
      { id: 'option-b', key: 'B', sortOrder: 2, text: '紅、黃、藍' },
      { id: 'option-c', key: 'C', sortOrder: 3, text: '冷、暖、中性' },
      { id: 'option-d', key: 'D', sortOrder: 4, text: '光、影、形' },
    ],
    position: 2,
    prompt: '色彩三要素包含哪些？',
    scoreDelta: correct ? 100 : null,
    selectedOptionId: correct ? 'option-a' : null,
    sessionQuestionId: '32000000-0000-0000-0000-000000000002',
    stableCode: '3-1-02',
    startedAt: harnessStartedAt,
    version: 1,
  };
}

function fixtureSession(scenario: QuizSessionHarnessScenario): QuizSession {
  const question = fixtureQuestion(scenario);
  return {
    answeredCount: scenario === 'correct' ? 1 : 0,
    chapterTitle: '第三章・色彩表示',
    completedAt: null,
    correctCount: scenario === 'correct' ? 1 : 0,
    gameRulesVersion: '2026-07-mvp-1',
    questionCount: 5,
    questions: [question],
    rewardRatePercent: 100,
    sessionId,
    status: 'in_progress',
    templateId: '26000000-0000-0000-0000-000000000003',
    tokensAwarded: 0,
    totalScore: scenario === 'correct' ? 100 : 0,
    xpAwarded: 0,
  };
}

function fixtureRepository(
  scenario: QuizSessionHarnessScenario,
): QuizRepository {
  const session = fixtureSession(scenario);
  return {
    abandonSession: () => Promise.resolve({ sessionId, status: 'abandoned' }),
    activateNextQuestion: () => Promise.resolve(session),
    createSession: () => Promise.resolve(session),
    finalizeSession: () =>
      Promise.reject(new Error('dev-harness: finalize is not available')),
    getSession: () => Promise.resolve(session),
    submitAnswer: () =>
      Promise.reject(
        new Error('dev-harness: answer submission is not available'),
      ),
  };
}

export function QuizSessionHarness({
  scenario,
}: Readonly<{ scenario: QuizSessionHarnessScenario }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <StudentHudHarness initialEntry={`/app/quiz/${sessionId}`}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route
            path="/app/quiz/:sessionId"
            element={
              <QuizSessionPage repository={fixtureRepository(scenario)} />
            }
          />
        </Routes>
      </QueryClientProvider>
    </StudentHudHarness>
  );
}
