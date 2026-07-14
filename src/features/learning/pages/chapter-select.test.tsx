import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LearningRepositoryError,
  usePublishedChapters,
  type PublishedChapter,
} from '../api/chapters';
import { ChapterSelectPage } from './chapter-select';

vi.mock('../api/chapters', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/chapters')>();
  return { ...original, usePublishedChapters: vi.fn() };
});

const mockedUsePublishedChapters = vi.mocked(usePublishedChapters);
const refetch = vi.fn();

const chapters: PublishedChapter[] = [
  '色彩與光源',
  '色彩與生理',
  '色彩表示',
  '色彩混色',
  '色彩心理',
  '色彩配色',
].map((title, index) => ({
  description: `${title}的學習重點。`,
  id: `21000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
  isPlayable: index === 2,
  sortOrder: index + 1,
  stableCode: `chapter-${String(index + 1)}`,
  template: {
    id: `26000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    questionCount: 10,
    title: `第${String(index + 1)}章綜合挑戰`,
  },
  title,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <ChapterSelectPage />
    </MemoryRouter>,
  );

describe('ChapterSelectPage', () => {
  beforeEach(() => {
    refetch.mockReset();
  });

  it('announces the loading state', () => {
    mockedUsePublishedChapters.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isPending: true,
      refetch,
    });

    renderPage();

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });

  it('shows a safe error and retries the query', async () => {
    mockedUsePublishedChapters.mockReturnValue({
      data: undefined,
      error: new LearningRepositoryError('CHAPTERS_UNAVAILABLE'),
      isError: true,
      isPending: false,
      refetch,
    });

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '重新載入' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      '目前無法載入章節，請稍後重試。',
    );
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('provides a perceivable empty state', () => {
    mockedUsePublishedChapters.mockReturnValue({
      data: [],
      error: null,
      isError: false,
      isPending: false,
      refetch,
    });

    renderPage();

    expect(
      screen.getByRole('heading', { name: '目前沒有可用章節' }),
    ).toBeVisible();
  });

  it('renders six flat chapter cards and enables only the playable chapter', () => {
    mockedUsePublishedChapters.mockReturnValue({
      data: chapters,
      error: null,
      isError: false,
      isPending: false,
      refetch,
    });

    renderPage();

    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(screen.getByRole('link', { name: '開始挑戰' })).toHaveAttribute(
      'href',
      `/app/quiz/new?template=${chapters[2]?.template.id ?? ''}`,
    );
    expect(screen.getAllByText('尚無題目')).toHaveLength(5);
    expect(
      document.querySelectorAll('[data-primary-action="true"]'),
    ).toHaveLength(1);
  });
});
