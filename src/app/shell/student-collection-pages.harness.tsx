// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';

import type { AchievementRepository } from '../../features/achievements/types';
import { AchievementsPage } from '../../features/achievements/pages/achievements-page';
import type { InventoryRepository } from '../../features/inventory/types';
import type { LeaderboardRepository } from '../../features/leaderboard/types';
import { ClassroomLeaderboardPage } from '../../features/leaderboard/pages/classroom-leaderboard-page';
import type { LearningRepository } from '../../features/learning/api/learning-repository';
import { MistakesPage } from '../../features/learning/pages/mistakes-page';
import { StudentHudHarness } from './student-hud.harness';

const learningRepository = {
  listMistakes: () =>
    Promise.resolve([
      {
        correctOptionText: '明度',
        lastEventAt: '2026-08-12T08:00:00.000Z',
        mistakeId: '26000000-0000-4000-8000-000000000001',
        prompt: '表示色彩明暗程度的屬性是？',
        stableCode: '3-1-01',
        status: 'open' as const,
        subtopicId: '27000000-0000-4000-8000-000000000001',
        subtopicTitle: '3-1 色彩三要素與色名的表示',
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        correctOptionText: '色相、明度、彩度',
        lastEventAt: `2026-08-12T08:${String(index + 10).padStart(2, '0')}:00.000Z`,
        mistakeId: `26000000-0000-4000-8000-00000000000${String(index + 3)}`,
        prompt: `色彩三要素練習題 ${String(index + 1)}`,
        stableCode: `3-1-0${String(index + 3)}`,
        status: 'open' as const,
        subtopicId: '27000000-0000-4000-8000-000000000001',
        subtopicTitle: '3-1 色彩三要素與色名的表示',
      })),
      {
        correctOptionText: '清色',
        lastEventAt: '2026-08-12T08:05:00.000Z',
        mistakeId: '26000000-0000-4000-8000-000000000002',
        prompt: '明色和暗色因為不含灰色，所以又稱為？',
        stableCode: '3-1-02',
        status: 'resolved' as const,
        subtopicId: '27000000-0000-4000-8000-000000000001',
        subtopicTitle: '3-1 色彩三要素與色名的表示',
      },
    ]),
  startRemediation: () =>
    Promise.resolve('28000000-0000-4000-8000-000000000001'),
} as unknown as LearningRepository;

const inventoryRepository: InventoryRepository = {
  equipBlook: () => Promise.reject(new Error('dev harness: not available')),
  equipFrame: () => Promise.reject(new Error('dev harness: not available')),
  getFrameInventory: () =>
    Promise.resolve({ activeFrameId: '', items: [], tokenBalance: 0 }),
  getInventory: () =>
    Promise.resolve({
      activeBlookId: '50000000-0000-0000-0000-000000000001',
      items: [
        {
          costTokens: 0,
          emoji: '🦊',
          equipped: true,
          id: '50000000-0000-0000-0000-000000000001',
          name: '小狐狸',
          owned: true,
          stableCode: 'little_fox',
        },
      ],
      tokenBalance: 1250,
    }),
  purchaseBlook: () => Promise.reject(new Error('dev harness: not available')),
  purchaseFrame: () => Promise.reject(new Error('dev harness: not available')),
};

const leaderboardRepository: LeaderboardRepository = {
  getClassroomLeaderboard: () =>
    Promise.resolve({
      classroomId: 'ca000000-0000-4000-8000-000000000001',
      classroomName: '色彩一班',
      generatedAt: '2026-08-12T08:00:00.000Z',
      memberCount: 12,
      selfEntry: null,
      topEntries: [
        {
          activeBlookId: '50000000-0000-0000-0000-000000000001',
          displayName: '色彩探險家',
          frameGradientEnd: '#f59e0b',
          frameGradientStart: '#eab308',
          isSelf: false,
          rank: 1,
          totalXp: 8680,
        },
        {
          activeBlookId: '50000000-0000-0000-0000-000000000001',
          displayName: '藍靛騎士',
          frameGradientEnd: null,
          frameGradientStart: null,
          isSelf: true,
          rank: 2,
          totalXp: 6740,
        },
        {
          activeBlookId: '50000000-0000-0000-0000-000000000001',
          displayName: '虹光學徒',
          frameGradientEnd: null,
          frameGradientStart: null,
          isSelf: false,
          rank: 3,
          totalXp: 5290,
        },
        {
          activeBlookId: '50000000-0000-0000-0000-000000000001',
          displayName: '暮色旅人',
          frameGradientEnd: null,
          frameGradientStart: null,
          isSelf: false,
          rank: 4,
          totalXp: 4120,
        },
      ],
    }),
};

const achievementRepository: AchievementRepository = {
  getCatalog: () =>
    Promise.resolve({
      items: [
        {
          badgeKey: 'first_task_complete',
          description: '完成第一次正式挑戰',
          displayName: '初出茅廬',
          progress: 1,
          stableCode: 'first_task_complete',
          state: 'unlocked',
          target: 1,
          unlockedAt: '2026-08-12T08:00:00.000Z',
        },
        {
          badgeKey: 'level_10',
          description: '達到 Level 10',
          displayName: '登峰造極',
          progress: 8,
          stableCode: 'level_10',
          state: 'in_progress',
          target: 10,
          unlockedAt: null,
        },
        {
          badgeKey: 'chapter_three',
          description: '完成第三章所有挑戰',
          displayName: '色彩表示專家',
          progress: null,
          stableCode: 'chapter_three',
          state: 'not_started',
          target: null,
          unlockedAt: null,
        },
        {
          badgeKey: 'remediation',
          description: '成功解決五道錯題',
          displayName: '逆轉學者',
          progress: 3,
          stableCode: 'remediation',
          state: 'in_progress',
          target: 5,
          unlockedAt: null,
        },
        ...Array.from({ length: 5 }, (_, index) => ({
          badgeKey: `practice_${String(index + 1)}`,
          description: `完成第 ${String(index + 1)} 組色彩練習`,
          displayName: `色彩修練 ${String(index + 1)}`,
          progress: index,
          stableCode: `practice_${String(index + 1)}`,
          state: 'in_progress' as const,
          target: 5,
          unlockedAt: null,
        })),
      ],
      totalCount: 9,
      unlockedCount: 1,
    }),
};

const surface = new URLSearchParams(window.location.search).get('surface');
const initialEntry =
  surface === 'leaderboard'
    ? '/app/leaderboard'
    : surface === 'achievements'
      ? '/app/achievements'
      : '/app/mistakes';

export function StudentCollectionPagesHarness() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return (
    <StudentHudHarness initialEntry={initialEntry}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route
            element={<MistakesPage repository={learningRepository} />}
            path="/app/mistakes"
          />
          <Route
            element={
              <ClassroomLeaderboardPage
                classroomId="ca000000-0000-4000-8000-000000000001"
                inventoryRepository={inventoryRepository}
                leaderboardRepository={leaderboardRepository}
              />
            }
            path="/app/leaderboard"
          />
          <Route
            element={<AchievementsPage repository={achievementRepository} />}
            path="/app/achievements"
          />
        </Routes>
      </QueryClientProvider>
    </StudentHudHarness>
  );
}
