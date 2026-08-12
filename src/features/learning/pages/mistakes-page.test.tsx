import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
          name: '3-1 色彩三要素與色名的表示 1 題待補救',
        }),
      ).toBeInTheDocument();
    });
    // DC 1063:「n 題待補救」是獨立紅色 pill，非嵌在標題文字內的括號註記。
    expect(screen.getByText('1 題待補救')).toHaveClass('mistake-group__badge');
    expect(screen.getByRole('heading', { name: '已解決' })).toBeInTheDocument();
    // owner 0728:已解決題附正確答案供再複習。
    expect(screen.getByText('正確答案：清色')).toBeInTheDocument();
    // owner 0730 #1:已解決列不再於題目後加「（已解決）」字尾。
    expect(screen.queryByText(/（已解決）/u)).toBeNull();

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

  it('renders codex monsters: silhouettes for open mistakes, lit for resolved', async () => {
    const repository = {
      listMistakes: vi.fn().mockResolvedValue(mistakes),
      startRemediation: vi.fn(),
    } as unknown as LearningRepository;
    renderPage(repository);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: '已解決' }),
      ).toBeInTheDocument();
    });
    expect(
      document.querySelector(
        '.mistakes-codex.mistakes-codex--archive-v2.scene-day',
      ),
    ).not.toBeNull();
    const monsters = document.querySelectorAll('.codex-monster');
    expect(monsters).toHaveLength(2);
    expect(document.querySelectorAll('.codex-monster--lit')).toHaveLength(1);
    for (const monster of monsters) {
      expect(monster).toHaveAttribute('aria-hidden', 'true');
      expect(monster).toBeEmptyDOMElement();
    }
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

  it('組內錯題與已解決分別分頁,超出容量時可翻頁,badge 維持總數', async () => {
    const user = userEvent.setup();
    const openMistakes = Array.from({ length: 7 }, (_, index) => ({
      correctOptionText: `答案${String(index + 1)}`,
      lastEventAt: '2026-07-18T01:00:00+00:00',
      mistakeId: `26200000-0000-0000-0000-00000000010${String(index)}`,
      prompt: `題目${String(index + 1)}`,
      stableCode: '3-1-01',
      status: 'open' as const,
      subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
      subtopicTitle: '3-1 色彩三要素與色名的表示',
    }));
    const resolvedMistakes = Array.from({ length: 9 }, (_, index) => ({
      correctOptionText: `已解決答案${String(index + 1)}`,
      lastEventAt: '2026-07-18T01:00:00+00:00',
      mistakeId: `26200000-0000-0000-0000-00000000020${String(index)}`,
      prompt: `已解決題${String(index + 1)}`,
      stableCode: '3-1-02',
      status: 'resolved' as const,
      subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9584',
      subtopicTitle: '3-1 色彩三要素與色名的表示',
    }));
    const repository = {
      listMistakes: vi
        .fn()
        .mockResolvedValue([...openMistakes, ...resolvedMistakes]),
      startRemediation: vi.fn(),
    } as unknown as LearningRepository;
    renderPage(repository);

    // 全域 matchMedia stub matches:false → narrow 檔位:組內容量3(7題→3頁)、已解決容量4(9題→3頁)。
    const groupPager = await screen.findByRole('group', {
      name: '3-1 色彩三要素與色名的表示 錯題分頁',
    });
    expect(within(groupPager).getByText('第 1 / 3 頁')).toBeVisible();
    expect(screen.getByText('題目1')).toBeInTheDocument();
    expect(screen.queryByText('題目4')).toBeNull();
    // badge 顯示組內總數,不受目前頁面筆數影響。
    expect(screen.getByText('7 題待補救')).toHaveClass('mistake-group__badge');
    expect(
      screen.getByRole('button', { name: '再挑戰（補救練習）' }),
    ).toBeVisible();

    await user.click(
      within(groupPager).getByRole('button', { name: '下一頁' }),
    );
    expect(within(groupPager).getByText('第 2 / 3 頁')).toBeVisible();
    expect(screen.getByText('題目4')).toBeInTheDocument();
    expect(screen.queryByText('題目1')).toBeNull();

    const resolvedPager = screen.getByRole('group', {
      name: '已解決錯題分頁',
    });
    expect(within(resolvedPager).getByText('第 1 / 3 頁')).toBeVisible();
    expect(screen.getByText('已解決題1')).toBeInTheDocument();
    expect(screen.queryByText('已解決題5')).toBeNull();

    await user.click(
      within(resolvedPager).getByRole('button', { name: '下一頁' }),
    );
    expect(within(resolvedPager).getByText('第 2 / 3 頁')).toBeVisible();
    expect(screen.getByText('已解決題5')).toBeInTheDocument();
    expect(screen.queryByText('已解決題1')).toBeNull();
  });
});
