import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { LearningRepository } from '../api/learning-repository';
import { groupOpenMistakes, MistakesPage } from './mistakes-page';

const mistakes = [
  {
    correctOptionText: '暗色',
    lastEventAt: '2026-07-18T01:00:00+00:00',
    mistakeId: '26200000-0000-0000-0000-000000000001',
    prompt: '純色加入黑色所得的色彩稱為？',
    stableCode: '3-1-01',
    status: 'open' as const,
    subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
    subtopicTitle: '3-1 色彩三要素與色名的表示',
  },
  {
    correctOptionText: '清色',
    lastEventAt: '2026-07-18T01:01:00+00:00',
    mistakeId: '26200000-0000-0000-0000-000000000002',
    prompt: '明色和暗色因為不含灰色，所以又稱為？',
    stableCode: '3-1-02',
    status: 'resolved' as const,
    subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
    subtopicTitle: '3-1 色彩三要素與色名的表示',
  },
];

const renderPage = (repository: LearningRepository) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/mistakes']}>
        <Routes>
          <Route element={children} path="/app/mistakes" />
          <Route element={<p>runner-route</p>} path="/app/quiz/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(<MistakesPage repository={repository} />, { wrapper });
};

describe('MistakesPage', () => {
  it('lists open mistakes per subtopic and starts remediation', async () => {
    const startRemediation = vi
      .fn()
      .mockResolvedValue('26300000-0000-0000-0000-000000000001');
    const repository = {
      listMistakes: vi.fn().mockResolvedValue(mistakes),
      startRemediation,
    } as unknown as LearningRepository;
    renderPage(repository);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: '3-1 色彩三要素與色名的表示（1 題待補救）',
        }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: '已解決' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '再挑戰（補救練習）' }));

    await waitFor(() => {
      expect(startRemediation).toHaveBeenCalledWith(
        expect.objectContaining({
          subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText('runner-route')).toBeInTheDocument();
    });
  });

  it('shows the empty state when nothing is open', async () => {
    const repository = {
      listMistakes: vi
        .fn()
        .mockResolvedValue(
          mistakes.filter((mistake) => mistake.status === 'resolved'),
        ),
      startRemediation: vi.fn(),
    } as unknown as LearningRepository;
    renderPage(repository);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '目前沒有待補救的錯題',
      );
    });
  });

  it('groups only open and reopened mistakes', () => {
    expect(groupOpenMistakes(mistakes)).toHaveLength(1);
    expect(
      groupOpenMistakes(
        mistakes.map((mistake) => ({
          ...mistake,
          status: 'resolved' as const,
        })),
      ),
    ).toHaveLength(0);
  });
});
