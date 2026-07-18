import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { LiveRepository } from '../types';
import { TeacherLiveReportPage } from './teacher-live-report-page';

const SESSION_ID = '18400000-0000-0000-0000-000000000001';

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
      getSessionDetail: vi.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        mode: 'team',
        completedAt: '2026-07-20T05:00:00+00:00',
        questions: [
          {
            position: 1,
            prompt: '色彩三要素是？',
            answered: 2,
            correct: 1,
            correctRate: 50.0,
            averageResponseMs: 1800,
          },
        ],
        ranking: [
          { rank: 1, displayName: '學生一', score: 300, teamNumber: 1 },
          { rank: 2, displayName: '學生二', score: 150, teamNumber: 2 },
        ],
      }),
    } as unknown as LiveRepository;
    renderPage(repository);

    expect(await screen.findByText('色彩三要素是？')).toBeVisible();
    expect(screen.getByText('50.0%')).toBeVisible();
    expect(screen.getByText('1800 ms')).toBeVisible();
    expect(screen.getByText(/學生一（300 分・第 1 隊）/u)).toBeVisible();
    expect(repository.getSessionDetail).toHaveBeenCalledWith(SESSION_ID);
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
