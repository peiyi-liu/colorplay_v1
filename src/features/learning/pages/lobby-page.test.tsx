import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StudentChapterMapEntry } from '../api/chapter-map';
import { useStudentChapterMap } from '../hooks/use-chapter-map';
import { LobbyPage } from './lobby-page';

vi.mock('../hooks/use-chapter-map', () => ({
  useStudentChapterMap: vi.fn(),
}));
const mockedChapterMap = vi.mocked(useStudentChapterMap);
const asResult = (value: unknown) => value as never;

const chapter = (
  sortOrder: number,
  accessState: StudentChapterMapEntry['accessState'],
): StudentChapterMapEntry => ({
  accessState,
  blockers:
    sortOrder === 3
      ? [
          {
            chapterId: '21000000-0000-0000-0000-000000000002',
            chapterTitle: '色彩呈現',
            code: 'PREREQUISITE_MASTERY',
            current: 60,
            required: 80,
          },
        ]
      : [],
  chapterId: `21000000-0000-0000-0000-${String(sortOrder).padStart(12, '0')}`,
  description: `第 ${String(sortOrder)} 章說明`,
  mastery: accessState === 'completed' ? 90 : null,
  progressStatus: accessState === 'completed' ? 'mastered' : 'not_started',
  reviewCompleted: accessState === 'completed' ? 5 : 0,
  reviewTotal: 5,
  sortOrder,
  stableCode: `chapter-${String(sortOrder)}`,
  templateId: `26000000-0000-0000-0000-${String(sortOrder).padStart(12, '0')}`,
  templateQuestionCount: 10,
  title:
    ['認識色彩', '色彩呈現', '色彩表示', '色彩感知', '色彩認知', '色彩應用'][
      sortOrder - 1
    ] ?? '',
});

const chapters = [
  chapter(1, 'completed'),
  chapter(2, 'available'),
  chapter(3, 'locked'),
  chapter(4, 'locked'),
  chapter(5, 'content_unavailable'),
  chapter(6, 'content_unavailable'),
];

const renderPage = (entry = '/app') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <LobbyPage />
    </MemoryRouter>,
  );

describe('LobbyPage', () => {
  beforeEach(() => {
    mockedChapterMap.mockReturnValue(
      asResult({
        data: {
          chapters,
          mode: 'open',
          rulesVersion: '2026-08-sequence-1',
        },
        error: null,
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      }),
    );
  });

  it('removes the duplicate student summary and keeps the six-building map', () => {
    const { container } = renderPage();
    expect(screen.queryByRole('region', { name: '學生資訊' })).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: '學習地圖' }),
    ).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(container.querySelector('.chapter-card')).toBeNull();
    expect(container.querySelector('.game-pager')).toBeNull();
    expect(screen.queryByRole('link', { name: /開始挑戰/u })).toBeNull();
    expect(screen.queryByRole('link', { name: /quiz/u })).toBeNull();
  });

  it('renders the approved map copy in one semantic parchment scroll', () => {
    const { container } = renderPage();
    const headings = screen.getAllByRole('heading', { level: 1 });
    const scroll = container.querySelector('.chapter-map-scroll');

    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('學習地圖');
    expect(screen.getByText('學生端 · 森林王國村')).toBeVisible();
    expect(
      screen.getByText('選擇一棟建築，查看章節的複習、精熟度與解鎖條件。'),
    ).toBeVisible();
    expect(scroll).toContainElement(headings[0] ?? null);

    const decorations = container.querySelectorAll(
      '.chapter-map-scroll__roller, .chapter-map-scroll__crest',
    );
    expect(decorations).toHaveLength(3);
    for (const decoration of decorations) {
      expect(decoration).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('selects the requested locked chapter from the exact map query', () => {
    renderPage(
      '/app?chapter=21000000-0000-0000-0000-000000000003&reason=locked',
    );
    expect(
      screen.getByRole('button', {
        name: 'Chapter 3 色彩表示 未解鎖',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('「色彩呈現」精熟度 60% / 80%')).toBeVisible();
  });

  it('renders the route loading boundary while access is pending', () => {
    mockedChapterMap.mockReturnValue(
      asResult({
        data: undefined,
        error: null,
        isError: false,
        isPending: true,
        refetch: vi.fn(),
      }),
    );
    renderPage();
    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });

  it('fails closed with an explicit retry when access cannot be confirmed', async () => {
    const refetch = vi.fn();
    mockedChapterMap.mockReturnValue(
      asResult({
        data: undefined,
        error: null,
        isError: true,
        isPending: false,
        refetch,
      }),
    );
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent('章節狀態暫時無法確認');
    await userEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
