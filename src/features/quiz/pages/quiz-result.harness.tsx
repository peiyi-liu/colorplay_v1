// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';

import { StudentHudHarness } from '../../../app/shell/student-hud.harness';
import type { AchievementRepository } from '../../achievements/types';
import type { EconomyRepository } from '../../rewards/types';
import type { QuizRepository, QuizSession } from '../api/quiz-repository';
import { QuizResultPage } from './quiz-result';

export type QuizResultHarnessKind = 'section' | 'chapter';

const sessionId = '31000000-0000-0000-0000-000000000001';

const fixtureSession = (kind: QuizResultHarnessKind): QuizSession => ({
  answeredCount: 5,
  challengeKind: kind,
  chapterSortOrder: 3,
  chapterTitle: '色彩表示',
  completedAt: '2026-08-13T00:00:00.000Z',
  correctCount: 4,
  gameRulesVersion: '2026-07-mvp-1',
  questionCount: 5,
  questions: [
    {
      answerStatus: 'correct',
      correctOptionId: 'option-a',
      deadlineAt: '2026-08-13T00:00:20.000Z',
      explanation: '色相、明度、彩度共同描述色彩的基本特徵。',
      options: [
        { id: 'option-a', key: 'A', sortOrder: 1, text: '色相、明度、彩度' },
        { id: 'option-b', key: 'B', sortOrder: 2, text: '紅、黃、藍' },
      ],
      position: 1,
      prompt: '色彩三要素包含哪些？',
      scoreDelta: 100,
      selectedOptionId: 'option-a',
      sessionQuestionId: 'question-1',
      stableCode: '3-1-01',
      startedAt: '2026-08-13T00:00:00.000Z',
      version: 1,
    },
    {
      answerStatus: 'incorrect',
      correctOptionId: 'option-b',
      deadlineAt: '2026-08-13T00:00:40.000Z',
      explanation: '明度表示色彩的明暗程度；數值越高，視覺上越接近明亮的色彩。',
      options: [
        { id: 'option-a', key: 'A', sortOrder: 1, text: '彩度' },
        { id: 'option-b', key: 'B', sortOrder: 2, text: '明度' },
      ],
      position: 2,
      prompt: '表示色彩明暗程度的屬性是？',
      scoreDelta: 0,
      selectedOptionId: 'option-a',
      sessionQuestionId: 'question-2',
      stableCode: '3-1-02',
      startedAt: '2026-08-13T00:00:20.000Z',
      version: 1,
    },
  ],
  rewardRatePercent: 100,
  sectionSortOrder: kind === 'section' ? 1 : null,
  sectionTitle: kind === 'section' ? '3-1 色彩三要素與色名的表示' : null,
  sessionId,
  status: 'completed',
  templateId: '26000000-0000-0000-0000-000000000003',
  tokensAwarded: 40,
  totalScore: 400,
  xpAwarded: 120,
});

const economyRepository: EconomyRepository = {
  getSummary: () =>
    Promise.resolve({
      currentLevelXp: 240,
      level: 12,
      tokenBalance: 1250,
      totalXp: 1240,
      walletReconciled: true,
      xpPerLevel: 500,
    }),
};

const achievementRepository: AchievementRepository = {
  getCatalog: () =>
    Promise.resolve({ items: [], totalCount: 0, unlockedCount: 0 }),
};

const fixtureRepository = (kind: QuizResultHarnessKind): QuizRepository => {
  const session = fixtureSession(kind);
  return {
    abandonSession: () => Promise.resolve({ sessionId, status: 'abandoned' }),
    activateNextQuestion: () => Promise.resolve(session),
    createSession: () => Promise.resolve(session),
    finalizeSession: () =>
      Promise.reject(new Error('dev harness: not available')),
    getSession: () => Promise.resolve(session),
    submitAnswer: () => Promise.reject(new Error('dev harness: not available')),
  };
};

export function QuizResultHarness({
  kind,
}: Readonly<{ kind: QuizResultHarnessKind }>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <StudentHudHarness initialEntry={`/app/quiz/${sessionId}/result`}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route
            element={
              <QuizResultPage
                achievementRepository={achievementRepository}
                economyRepository={economyRepository}
                repository={fixtureRepository(kind)}
              />
            }
            path="/app/quiz/:sessionId/result"
          />
        </Routes>
      </QueryClientProvider>
    </StudentHudHarness>
  );
}
