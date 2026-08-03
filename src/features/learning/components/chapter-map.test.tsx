import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBlookInventory } from '../../inventory/hooks/use-blook-inventory';
import type { StudentChapterMapEntry } from '../api/chapter-map';
import { ChapterMap } from './chapter-map';

vi.mock('../../inventory/hooks/use-blook-inventory', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../inventory/hooks/use-blook-inventory')
    >();
  return { ...original, useBlookInventory: vi.fn() };
});

const mockedInventory = vi.mocked(useBlookInventory);
const asResult = (value: unknown) => value as never;

const chapter = (
  sortOrder: number,
  accessState: StudentChapterMapEntry['accessState'],
): StudentChapterMapEntry => ({
  accessState,
  blockers: [],
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

const renderMap = (
  entries: readonly StudentChapterMapEntry[] = chapters,
  initialChapterId?: string,
) =>
  render(
    <MemoryRouter>
      <ChapterMap chapters={entries} initialChapterId={initialChapterId} />
    </MemoryRouter>,
  );

describe('ChapterMap', () => {
  beforeEach(() => {
    mockedInventory.mockReturnValue(
      asResult({
        data: {
          activeBlookId: 'b1',
          frameGradientEnd: null,
          frameGradientStart: null,
          items: [
            {
              costTokens: 30,
              emoji: '🦊',
              equipped: true,
              id: 'b1',
              name: '小狐狸',
              owned: true,
              stableCode: 'little_fox',
            },
          ],
          tokenBalance: 40,
        },
        isError: false,
        isPending: false,
      }),
    );
  });

  it('renders six ordered buttons and defaults to the first accessible incomplete chapter', () => {
    renderMap();
    expect(screen.getByRole('list', { name: '六章學習地圖' })).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(
      screen.getByRole('button', {
        name: 'Chapter 2 色彩呈現 可進入',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('第 2 章說明')).toBeVisible();
    expect(screen.getByTestId('equipped-blook-badge')).toBeVisible();
    expect(screen.queryByText('目前位置')).toBeNull();
  });

  it('selects a building without navigation or focus theft', async () => {
    renderMap();
    const third = screen.getByRole('button', {
      name: 'Chapter 3 色彩表示 尚未解鎖',
    });
    await userEvent.click(third);
    expect(third).toHaveFocus();
    expect(third).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('第 3 章說明')).toBeVisible();
  });

  it('honors a valid initial chapter and selects chapter 6 when all are complete', () => {
    const { unmount } = renderMap(
      chapters,
      '21000000-0000-0000-0000-000000000004',
    );
    expect(
      screen.getByRole('button', {
        name: 'Chapter 4 色彩感知 尚未解鎖',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    unmount();

    renderMap(
      Array.from({ length: 6 }, (_, index) => chapter(index + 1, 'completed')),
    );
    expect(
      screen.getByRole('button', {
        name: 'Chapter 6 色彩應用 已完成',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps every decorative world image out of the accessibility tree', () => {
    const { container } = renderMap();
    const decorations = container.querySelectorAll(
      '.chapter-map__base, .chapter-map__building-art, .chapter-map__cloud, .chapter-map__adventurer',
    );
    expect(decorations.length).toBeGreaterThan(0);
    for (const decoration of decorations) {
      expect(decoration).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
