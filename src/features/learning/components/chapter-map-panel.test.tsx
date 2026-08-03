import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { StudentChapterMapEntry } from '../api/chapter-map';
import { ChapterMapPanel } from './chapter-map-panel';

const chapter = (
  accessState: StudentChapterMapEntry['accessState'],
): StudentChapterMapEntry => ({
  accessState,
  blockers:
    accessState === 'locked'
      ? [
          {
            chapterId: '21000000-0000-0000-0000-000000000001',
            chapterTitle: '認識色彩',
            code: 'PREREQUISITE_REVIEW',
            current: 2,
            required: 5,
          },
          {
            chapterId: '21000000-0000-0000-0000-000000000001',
            chapterTitle: '認識色彩',
            code: 'PREREQUISITE_MASTERY',
            current: 72,
            required: 80,
          },
        ]
      : [],
  chapterId: '21000000-0000-0000-0000-000000000002',
  description: '理解色彩如何被呈現。',
  mastery: accessState === 'completed' ? 90 : 72,
  progressStatus: accessState === 'completed' ? 'mastered' : 'developing',
  reviewCompleted: 2,
  reviewTotal: 5,
  sortOrder: 2,
  stableCode: 'chapter-2',
  templateId: '26000000-0000-0000-0000-000000000002',
  templateQuestionCount: 10,
  title: '色彩呈現',
});

const renderPanel = (entry: StudentChapterMapEntry) =>
  render(
    <MemoryRouter>
      <ChapterMapPanel chapter={entry} />
    </MemoryRouter>,
  );

describe('ChapterMapPanel', () => {
  it.each(['available', 'completed'] as const)(
    'offers only the detail entry for an %s chapter',
    (state) => {
      renderPanel(chapter(state));
      expect(screen.getByRole('region')).toHaveAttribute('aria-live', 'polite');
      expect(
        screen.getByRole('heading', { name: 'Chapter 2 色彩呈現' }),
      ).toBeVisible();
      expect(screen.getByText('複習進度 2 / 5')).toBeVisible();
      expect(
        screen.getByText(
          `精熟度 ${state === 'completed' ? '90%' : '72%'} / 80%`,
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('link', { name: '進入複習與進度' }),
      ).toHaveAttribute(
        'href',
        '/app/chapters/21000000-0000-0000-0000-000000000002',
      );
      expect(screen.queryByText('開始挑戰')).toBeNull();
    },
  );

  it('shows exact prerequisite numbers and no action while locked', () => {
    renderPanel(chapter('locked'));
    expect(screen.getByText('尚未解鎖')).toBeVisible();
    expect(screen.getByText('「認識色彩」複習 2 / 5')).toBeVisible();
    expect(screen.getByText('「認識色彩」精熟度 72% / 80%')).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a content preparation state without an action', () => {
    renderPanel(chapter('content_unavailable'));
    expect(screen.getByText('內容準備中')).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
