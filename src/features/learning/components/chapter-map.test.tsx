import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { BlookInventoryItem } from '../../inventory/types';
import type { StudentChapterMapEntry } from '../api/chapter-map';
import { ChapterMap } from './chapter-map';

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

const equippedBlook: BlookInventoryItem = {
  costTokens: 30,
  emoji: '🦊',
  equipped: true,
  id: 'b1',
  name: '小狐狸',
  owned: true,
  stableCode: 'little_fox',
};

const renderMap = (
  entries: readonly StudentChapterMapEntry[] = chapters,
  initialChapterId?: string,
) =>
  render(
    <MemoryRouter>
      <ChapterMap
        chapters={entries}
        equippedBlook={equippedBlook}
        initialChapterId={initialChapterId}
      />
    </MemoryRouter>,
  );

describe('ChapterMap', () => {
  it('renders six ordered buttons and defaults to the first accessible incomplete chapter', () => {
    renderMap();
    expect(screen.getByRole('list', { name: '六章學習地圖' })).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(
      screen.getByRole('button', {
        name: 'Chapter 2 色彩呈現 可進入',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('第 2 章說明')).toBeNull();
    expect(screen.getByRole('heading', { name: '色彩呈現' })).toBeVisible();
    expect(screen.getByTestId('equipped-blook-badge')).toBeVisible();
    expect(screen.queryByText('目前位置')).toBeNull();
  });

  it('selects a building without navigation or focus theft', async () => {
    renderMap();
    const third = screen.getByRole('button', {
      name: 'Chapter 3 色彩表示 未解鎖',
    });
    await userEvent.click(third);
    expect(third).toHaveFocus();
    expect(third).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('第 3 章說明')).toBeNull();
    expect(screen.getByRole('heading', { name: '色彩表示' })).toBeVisible();
  });

  it('honors a valid initial chapter and selects chapter 6 when all are complete', () => {
    const { unmount } = renderMap(
      chapters,
      '21000000-0000-0000-0000-000000000004',
    );
    expect(
      screen.getByRole('button', {
        name: 'Chapter 4 色彩感知 未解鎖',
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

  it('uses separate desktop and mobile continuous-world terrain layers outside the accessibility tree', () => {
    const { container } = renderMap();
    expect(
      container.querySelector('.chapter-map__base--desktop'),
    ).toHaveAttribute(
      'src',
      expect.stringContaining('continuous-world-desktop'),
    );
    expect(
      container.querySelector('.chapter-map__base--mobile'),
    ).toHaveAttribute(
      'src',
      expect.stringContaining('continuous-world-mobile'),
    );
    const decorations = container.querySelectorAll(
      '.chapter-map__base, .chapter-map__building-art, .chapter-map__cloud, .chapter-map__adventurer',
    );
    expect(decorations.length).toBeGreaterThan(0);
    for (const decoration of decorations) {
      expect(decoration).toHaveAttribute('aria-hidden', 'true');
    }
    for (const base of container.querySelectorAll('.chapter-map__base')) {
      expect(base).toHaveAttribute('draggable', 'false');
    }
  });

  it('places the village art, buildings, and characters in one labelled logical world', () => {
    const { container } = renderMap();
    const world = container.querySelector('.chapter-map__world');

    expect(world).toHaveAttribute('data-world-width', '1672');
    expect(world).toHaveAttribute('data-world-height', '941');
    expect(container.querySelector('.chapter-map__base')?.parentElement).toBe(
      world,
    );

    const expectedGroundPoints = [
      ['480', '220'],
      ['1000', '210'],
      ['815', '500'],
      ['330', '515'],
      ['1100', '735'],
      ['480', '760'],
    ];
    const buildings = Array.from(
      container.querySelectorAll('.chapter-map__building'),
    );
    expect(
      buildings.map((building) => [
        building.getAttribute('data-ground-x'),
        building.getAttribute('data-ground-y'),
      ]),
    ).toEqual(expectedGroundPoints);

    for (const decoration of container.querySelectorAll(
      '.chapter-map__base, .chapter-map__buildings, .chapter-map__cloud, .chapter-map__construction, .chapter-map__adventurer, .chapter-map__companion',
    )) {
      expect(world?.contains(decoration)).toBe(true);
    }
  });

  it('keeps the lower-row controls and dialogue in separate pointer lanes', () => {
    const { container } = renderMap();
    const viewport = container.querySelector<HTMLElement>(
      '.chapter-map__viewport',
    );
    const world = container.querySelector<HTMLElement>('.chapter-map__world');
    const dialogueLane = container.querySelector<HTMLElement>(
      '.chapter-map__dialogue-lane',
    );
    const panel = container.querySelector<HTMLElement>('.chapter-map__panel');
    const lowerRowButtons = chapters.slice(3).map((entry) =>
      screen.getByRole('button', {
        name: new RegExp(
          `^Chapter ${String(entry.sortOrder)} ${entry.title}`,
          'u',
        ),
      }),
    );

    expect(dialogueLane).toContainElement(panel);
    expect(viewport).not.toContainElement(panel);
    expect(world).not.toContainElement(panel);
    for (const button of lowerRowButtons) {
      expect(viewport).toContainElement(button);
      expect(dialogueLane).not.toContainElement(button);
    }
  });

  it('keeps the camera operable while selection recenters without stealing building focus', async () => {
    const { container } = renderMap();
    const viewport = screen.getByRole('region', { name: '村莊地圖探索區' });
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 500 },
      scrollWidth: { configurable: true, value: 1000 },
    });
    const sixth = screen.getByRole('button', {
      name: 'Chapter 6 色彩應用 內容準備中',
    });

    await userEvent.click(sixth);

    expect(sixth).toHaveFocus();
    expect(viewport).not.toHaveFocus();
    expect(viewport.scrollLeft).toBeCloseTo(37.081, 3);
    expect(screen.getByText('拖曳探索村莊')).toBeVisible();
    expect(
      container.querySelector('.chapter-map__dialogue-lane'),
    ).toContainElement(screen.getByRole('heading', { name: '色彩應用' }));
  });
});
