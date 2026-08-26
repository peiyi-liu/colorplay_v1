import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { StudentChapterMapEntry } from '../api/chapter-map';
import { ChapterMapBuilding } from './chapter-map-building';
import type { ChapterGroundAnchor } from './chapter-map-layout';

const chapter = (
  accessState: StudentChapterMapEntry['accessState'],
): StudentChapterMapEntry => ({
  accessState,
  blockers: [],
  chapterId: '21000000-0000-0000-0000-000000000001',
  description: '建立色彩世界的第一塊基石。',
  mastery: accessState === 'completed' ? 90 : null,
  progressStatus: accessState === 'completed' ? 'mastered' : 'not_started',
  reviewCompleted: accessState === 'completed' ? 3 : 0,
  reviewTotal: 3,
  sortOrder: 1,
  stableCode: 'chapter-1',
  templateId: '26000000-0000-0000-0000-000000000001',
  templateQuestionCount: 10,
  title: '認識色彩',
});

const anchor: ChapterGroundAnchor = {
  mobileX: 500,
  mobileY: 270,
  visualOffsetX: 0,
  visualOffsetY: 0,
  x: 290,
  y: 298,
};

describe('ChapterMapBuilding', () => {
  it.each([
    ['content_unavailable', '內容準備中'],
    ['locked', '未解鎖'],
    ['available', '可進入'],
    ['completed', '已完成'],
  ] as const)('keeps %s as a real labelled button', (state, label) => {
    const { container } = render(
      <ol>
        <ChapterMapBuilding
          anchor={anchor}
          chapter={chapter(state)}
          onSelect={vi.fn()}
          selected={state === 'available'}
        />
      </ol>,
    );

    const button = screen.getByRole('button', {
      name: `Chapter 1 認識色彩 ${label}`,
    });
    expect(button).toHaveAttribute(
      'aria-pressed',
      state === 'available' ? 'true' : 'false',
    );
    expect(button.closest('.chapter-map__building')).toHaveAttribute(
      'data-selected',
      state === 'available' ? 'true' : 'false',
    );

    const sign = container.querySelector('.chapter-map__building-label');
    const medal = container.querySelector('.chapter-map__status-medal');
    expect(sign).toHaveTextContent('第一章');
    expect(sign).toHaveTextContent('認識色彩');
    expect(sign).not.toHaveTextContent(label);
    expect(medal).toHaveTextContent(label);
    expect(medal).not.toBeNull();
    expect(medal?.querySelector('svg')).toHaveAttribute(
      'data-icon',
      {
        available: 'book',
        completed: 'check',
        content_unavailable: 'alert',
        locked: 'lock',
      }[state],
    );

    const chains = container.querySelectorAll('.chapter-map__sign-chain');
    expect(chains).toHaveLength(2);
    for (const chain of chains) {
      expect(chain).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('labels an accessible chapter with existing progress as in progress', () => {
    render(
      <ol>
        <ChapterMapBuilding
          anchor={anchor}
          chapter={{
            ...chapter('available'),
            progressStatus: 'developing',
            reviewCompleted: 1,
          }}
          onSelect={vi.fn()}
          selected
        />
      </ol>,
    );

    expect(
      screen.getByRole('button', {
        name: 'Chapter 1 認識色彩 進行中',
      }),
    ).toBeVisible();
    expect(screen.getByText('進行中')).toBeVisible();
  });

  it.each([
    ['locked', '.chapter-map__cloud'],
    ['content_unavailable', '.chapter-map__construction'],
  ] as const)('adds the decorative %s scene overlay', (state, selector) => {
    const { container } = render(
      <ol>
        <ChapterMapBuilding
          anchor={anchor}
          chapter={chapter(state)}
          onSelect={vi.fn()}
          selected={false}
        />
      </ol>,
    );

    expect(container.querySelector(selector)).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('expresses completion with an independent medal and no scene overlay', () => {
    const { container } = render(
      <ol>
        <ChapterMapBuilding
          anchor={anchor}
          chapter={chapter('completed')}
          onSelect={vi.fn()}
          selected={false}
        />
      </ol>,
    );

    expect(
      container.querySelector('.chapter-map__status-medal'),
    ).toHaveTextContent('已完成');
    expect(container.querySelector('.chapter-map__completion')).toBeNull();
  });

  it('selects by pointer and keyboard without navigating', async () => {
    const onSelect = vi.fn();
    render(
      <ol>
        <ChapterMapBuilding
          anchor={anchor}
          chapter={chapter('available')}
          onSelect={onSelect}
          selected={false}
        />
      </ol>,
    );

    const button = screen.getByRole('button', {
      name: 'Chapter 1 認識色彩 可進入',
    });
    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenNthCalledWith(
      1,
      '21000000-0000-0000-0000-000000000001',
    );
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('falls back to a semantic CSS building when artwork fails', () => {
    render(
      <ol>
        <ChapterMapBuilding
          anchor={anchor}
          chapter={chapter('locked')}
          onSelect={vi.fn()}
          selected={false}
        />
      </ol>,
    );

    fireEvent.error(screen.getByTestId('chapter-building-art'));
    expect(screen.queryByTestId('chapter-building-art')).toBeNull();
    expect(screen.getByTestId('chapter-building-fallback')).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Chapter 1 認識色彩 未解鎖',
      }),
    ).toBeEnabled();
  });

  it('uses its bottom-center ground anchor instead of participating in a grid', () => {
    const { container } = render(
      <ol>
        <ChapterMapBuilding
          anchor={anchor}
          chapter={chapter('available')}
          onSelect={vi.fn()}
          selected={false}
        />
      </ol>,
    );

    const building = container.querySelector('.chapter-map__building');
    expect(building).toHaveAttribute('data-ground-x', '290');
    expect(building).toHaveAttribute('data-ground-y', '298');
    expect(building).toHaveAttribute('data-mobile-ground-x', '500');
    expect(building).toHaveAttribute('data-mobile-ground-y', '270');
    expect(building).toHaveStyle({
      '--chapter-anchor-x': '290',
      '--chapter-anchor-y': '298',
      left: '17.344%',
      top: '31.668%',
    });
  });
});
