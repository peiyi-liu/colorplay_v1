import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { LiveRepository, LiveSessionDetail } from '../types';
import { TeacherLiveReportPage } from './teacher-live-report-page';

const SESSION_ID = '18400000-0000-0000-0000-000000000001';

const detailFixture: LiveSessionDetail = {
  sessionId: SESSION_ID,
  mode: 'team',
  completedAt: '2026-07-20T05:00:00+00:00',
  classroomId: '18100000-0000-0000-0000-000000000001',
  activity: {
    title: '色彩快問快答',
    quizTemplateId: '26000000-0000-0000-0000-000000000003',
  },
  questions: [
    {
      position: 1,
      prompt: '色彩三要素是？',
      answered: 2,
      correct: 1,
      correctRate: 50.0,
      averageResponseMs: 1800,
    },
    {
      position: 2,
      prompt: '互補色是？',
      answered: 2,
      correct: 0,
      correctRate: 0.0,
      averageResponseMs: 2400,
    },
  ],
  participants: [
    {
      displayName: '學生一',
      rank: 1,
      score: 300,
      teamNumber: 1,
      answers: [
        { position: 1, status: 'correct', responseMs: 900 },
        { position: 2, status: 'incorrect', responseMs: 2400 },
      ],
    },
    {
      displayName: '學生二',
      rank: 2,
      score: 150,
      teamNumber: 2,
      answers: [{ position: 1, status: 'timeout', responseMs: null }],
    },
  ],
  ranking: [
    { rank: 1, displayName: '學生一', score: 300, teamNumber: 1 },
    { rank: 2, displayName: '學生二', score: 150, teamNumber: 2 },
  ],
};

// 獎牌測試專用 fixture：既有 detailFixture 只有 2 名，前三名獎牌需 ≥3 名。
const medalRankingFixture: LiveSessionDetail = {
  ...detailFixture,
  ranking: [
    { rank: 1, displayName: '學生一', score: 300, teamNumber: 1 },
    { rank: 2, displayName: '學生二', score: 150, teamNumber: 2 },
    { rank: 3, displayName: '學生三', score: 100, teamNumber: 3 },
  ],
};

const renderPage = (repository: LiveRepository) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TeacherLiveReportPage repository={repository} sessionId={SESSION_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('TeacherLiveReportPage', () => {
  it('renders per-question aggregates and the ranking', async () => {
    const repository = {
      getSessionDetail: vi.fn().mockResolvedValue(detailFixture),
    } as unknown as LiveRepository;
    renderPage(repository);

    expect(await screen.findByText('色彩三要素是？')).toBeVisible();
    expect(screen.getByText('50.0%')).toBeVisible();
    expect(screen.getByText('1800 ms')).toBeVisible();
    expect(screen.getByText(/學生一（300 分・第 1 隊）/u)).toBeVisible();
    expect(repository.getSessionDetail).toHaveBeenCalledWith(SESSION_ID);
  });

  it('does not surface a reteach call-out section (owner decision)', async () => {
    const repository = {
      getSessionDetail: vi.fn().mockResolvedValue(detailFixture),
    } as unknown as LiveRepository;
    renderPage(repository);

    expect(await screen.findByText('色彩三要素是？')).toBeVisible();
    expect(screen.queryByText(/建議重教/u)).toBeNull();
  });

  it('renders the answer matrix with per-question cells', async () => {
    const repository = {
      getSessionDetail: vi.fn().mockResolvedValue(detailFixture),
    } as unknown as LiveRepository;
    renderPage(repository);

    const matrix = await screen.findByRole('table', {
      name: '個人逐題作答',
    });
    expect(matrix).toBeVisible();
    expect(screen.getByText('對（900 ms）')).toBeVisible();
    expect(screen.getByText('錯（2400 ms）')).toBeVisible();
    expect(screen.getByText('逾時')).toBeVisible();
    // 學生二第 2 題無作答資格 → 佔位破折號。
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  // owner 0730 #14：班級作業停做——報表不再提供一鍵生成複習任務。
  it('does not surface the review assignment shortcut', async () => {
    const repository = {
      getSessionDetail: vi.fn().mockResolvedValue(detailFixture),
    } as unknown as LiveRepository;
    renderPage(repository);

    expect(await screen.findByText('色彩三要素是？')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '一鍵生成課後複習任務' }),
    ).toBeNull();
    expect(screen.queryByText('學習閉環')).toBeNull();
  });

  it('最終排名前三名有裝飾獎牌且不影響文字內容', async () => {
    const repository = {
      getSessionDetail: vi.fn().mockResolvedValue(medalRankingFixture),
    } as unknown as LiveRepository;
    renderPage(repository);

    expect(await screen.findByText(/學生一（300 分・第 1 隊）/u)).toBeVisible();
    const medals = document.querySelectorAll('.live-report__medal');
    expect(medals).toHaveLength(3);
    for (const medal of medals) {
      expect(medal).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('shows a safe error before the session is finalized', async () => {
    const repository = {
      getSessionDetail: vi.fn().mockRejectedValue(
        Object.assign(new Error('INVALID_TRANSITION'), {
          code: 'INVALID_TRANSITION',
        }),
      ),
    } as unknown as LiveRepository;
    renderPage(repository);

    expect(
      await screen.findByText('找不到這場報表，或場次尚未結算。'),
    ).toBeVisible();
  });
});
