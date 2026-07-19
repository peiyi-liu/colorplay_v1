import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMyProfile } from '../../profile/hooks/use-my-profile';
import { useEconomySummary } from '../../rewards/hooks/use-economy-summary';
import {
  useBlookInventory,
  useFrameInventory,
} from '../../inventory/hooks/use-blook-inventory';
import { useMyClassrooms } from '../../classrooms/hooks/use-classrooms';
import { useClassroomLeaderboard } from '../../leaderboard/hooks/use-classroom-leaderboard';
import { usePublishedChapters, type PublishedChapter } from '../api/chapters';
import { useMistakes } from '../hooks/use-learning';
import { LobbyPage } from './lobby-page';

vi.mock('../api/chapters', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/chapters')>();
  return { ...original, usePublishedChapters: vi.fn() };
});
vi.mock('../hooks/use-learning', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../hooks/use-learning')>();
  return { ...original, useMistakes: vi.fn() };
});
vi.mock('../../profile/hooks/use-my-profile', () => ({
  useMyProfile: vi.fn(),
}));
vi.mock('../../rewards/hooks/use-economy-summary', () => ({
  useEconomySummary: vi.fn(),
}));
vi.mock('../../inventory/hooks/use-blook-inventory', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../inventory/hooks/use-blook-inventory')
    >();
  return {
    ...original,
    useBlookInventory: vi.fn(),
    useFrameInventory: vi.fn(),
  };
});
vi.mock('../../classrooms/hooks/use-classrooms', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../classrooms/hooks/use-classrooms')
    >();
  return { ...original, useMyClassrooms: vi.fn() };
});
vi.mock(
  '../../leaderboard/hooks/use-classroom-leaderboard',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../leaderboard/hooks/use-classroom-leaderboard')
      >();
    return { ...original, useClassroomLeaderboard: vi.fn() };
  },
);

const mockedChapters = vi.mocked(usePublishedChapters);
const mockedMistakes = vi.mocked(useMistakes);
const mockedProfile = vi.mocked(useMyProfile);
const mockedEconomy = vi.mocked(useEconomySummary);
const mockedInventory = vi.mocked(useBlookInventory);
const mockedFrames = vi.mocked(useFrameInventory);
const mockedClassrooms = vi.mocked(useMyClassrooms);
const mockedLeaderboard = vi.mocked(useClassroomLeaderboard);

const asResult = (value: unknown) => value as never;

const chapters: PublishedChapter[] = ['色彩與光源', '色彩表示'].map(
  (title, index) => ({
    description: `${title}的學習重點。`,
    id: `21000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    isPlayable: index === 1,
    sortOrder: index + 1,
    stableCode: `chapter-${String(index + 1)}`,
    template: {
      id: `26000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
      questionCount: 10,
      title: `第${String(index + 1)}章綜合挑戰`,
    },
    title,
  }),
);

const renderPage = () =>
  render(
    <MemoryRouter>
      <LobbyPage />
    </MemoryRouter>,
  );

describe('LobbyPage', () => {
  beforeEach(() => {
    mockedChapters.mockReturnValue(
      asResult({
        data: chapters,
        error: null,
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      }),
    );
    mockedMistakes.mockReturnValue(
      asResult({
        data: [{ id: 'm1' }, { id: 'm2' }],
        isError: false,
        isPending: false,
      }),
    );
    mockedProfile.mockReturnValue(
      asResult({
        data: {
          displayName: '學生一號',
          id: 'student-1',
          role: 'student',
          timezone: 'Asia/Taipei',
          reducedMotion: false,
        },
        isError: false,
        isPending: false,
      }),
    );
    mockedEconomy.mockReturnValue(
      asResult({
        data: {
          currentLevelXp: 250,
          level: 2,
          tokenBalance: 40,
          totalXp: 750,
          walletReconciled: true,
          xpPerLevel: 500,
        },
        isError: false,
        isPending: false,
      }),
    );
    mockedFrames.mockReturnValue(
      asResult({ data: undefined, isError: false, isPending: false }),
    );
    mockedInventory.mockReturnValue(
      asResult({
        data: {
          activeBlookId: 'b1',
          frameGradientEnd: null,
          frameGradientStart: null,
          tokenBalance: 40,
          items: [
            {
              id: 'b1',
              stableCode: 'dino',
              name: '色彩巨獸',
              emoji: '🦖',
              costTokens: 30,
              owned: true,
              equipped: true,
            },
          ],
        },
        isError: false,
        isPending: false,
      }),
    );
    mockedClassrooms.mockReturnValue(
      asResult({
        data: [
          {
            classroomId: '31000000-0000-0000-0000-000000000001',
            classroomName: '設計一甲',
            joinedAt: '2026-07-01T00:00:00Z',
            membershipStatus: 'active',
          },
        ],
        isError: false,
        isPending: false,
      }),
    );
    mockedLeaderboard.mockReturnValue(
      asResult({
        data: {
          classroomId: '31000000-0000-0000-0000-000000000001',
          classroomName: '設計一甲',
          generatedAt: '2026-07-19T00:00:00Z',
          memberCount: 12,
          selfEntry: {
            activeBlookId: 'b1',
            frameGradientEnd: null,
            frameGradientStart: null,
            displayName: '學生一號',
            isSelf: true,
            rank: 6,
            totalXp: 750,
          },
          topEntries: [],
        },
        isError: false,
        isPending: false,
      }),
    );
  });

  it('shows the profile card with the equipped blook and edit link', () => {
    renderPage();
    expect(screen.getByText('🦖')).toBeInTheDocument();
    expect(screen.getByText('學生一號')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /修改/u })).toHaveAttribute(
      'href',
      '/app/profile',
    );
    expect(screen.getByText('750')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('hides classroom rank when the student has no classroom', () => {
    mockedClassrooms.mockReturnValue(
      asResult({ data: [], isError: false, isPending: false }),
    );
    renderPage();
    expect(screen.queryByText('全體排名')).toBeNull();
  });

  it('renders the ggame chapter grid with locked and open cards', () => {
    renderPage();
    expect(screen.getByText('色彩任務選擇大廳')).toBeInTheDocument();
    expect(screen.getByText('已開放')).toBeInTheDocument();
    expect(screen.getByText('鎖定中')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '開始挑戰' })).toHaveAttribute(
      'href',
      '/app/quiz/new?template=26000000-0000-0000-0000-000000000002',
    );
    expect(
      screen.getByRole('link', { name: '色彩表示 複習與進度' }),
    ).toBeInTheDocument();
  });

  it('shows the mistake center count and hub entry cards', () => {
    renderPage();
    expect(screen.getByText(/2 題/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /前往修正/u })).toHaveAttribute(
      'href',
      '/app/mistakes',
    );
    expect(screen.getByRole('link', { name: /我的作業/u })).toHaveAttribute(
      'href',
      '/app/assignments',
    );
    expect(screen.getByRole('link', { name: /成就徽章/u })).toHaveAttribute(
      'href',
      '/app/achievements',
    );
    expect(screen.getByRole('link', { name: /班級排行榜/u })).toHaveAttribute(
      'href',
      '/app/leaderboard',
    );
    expect(screen.getByRole('link', { name: /Live 課堂/u })).toHaveAttribute(
      'href',
      '/app/live/join',
    );
  });

  it('keeps the recoverable error state', () => {
    const refetch = vi.fn();
    mockedChapters.mockReturnValue(
      asResult({
        data: undefined,
        error: null,
        isError: true,
        isPending: false,
        refetch,
      }),
    );
    renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '重新載入' }),
    ).toBeInTheDocument();
  });
});
