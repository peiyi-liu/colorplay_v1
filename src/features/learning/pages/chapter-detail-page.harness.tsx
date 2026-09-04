// DEV/TEST-ONLY. 不得被 src/main.tsx 或 src/app/router/** import。
// 用 Task 1 fixtures 直接建構 viewModel，掛載純 presentational 的
// ChapterDetailPageView，完全不觸碰 Supabase／任何 hook。
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { StudentChapterMapEntry } from '../api/chapter-map';
import {
  LearningError,
  type LearningRepository,
} from '../api/learning-repository';
import { StudentHudHarness } from '../../../app/shell/student-hud.harness';
import { deriveChapterDetailViewModel } from './chapter-detail-adapter';
import { ChapterDetailPageView } from './chapter-detail-page';
import {
  chapterEntrySectionsFixture,
  chapterMapEntryFixture,
  chapterReviewSectionsFixture,
  learningProgressRowsFixture,
  reviewCompletionsFixture,
} from './chapter-detail-page.test-fixtures';

export type ChapterDetailHarnessScenario =
  | 'loading'
  | 'locked'
  | 'content-preparing'
  | 'content-readiness-error'
  | 'error'
  | 'in-progress'
  | 'completed'
  | 'long-title';

export const CHAPTER_DETAIL_HARNESS_SCENARIOS: readonly ChapterDetailHarnessScenario[] =
  [
    'loading',
    'locked',
    'content-preparing',
    'content-readiness-error',
    'error',
    'in-progress',
    'completed',
    'long-title',
  ];

const LONG_TITLE =
  '這是一個刻意寫得很長很長很長很長很長很長很長很長的小節標題用來測試換行行為';

const harnessQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function entryFor(
  scenario: ChapterDetailHarnessScenario,
): StudentChapterMapEntry {
  if (scenario === 'locked') {
    return chapterMapEntryFixture({
      accessState: 'locked',
      blockers: [
        {
          chapterId: 'c2',
          chapterTitle: '色彩表示',
          code: 'PREREQUISITE_MASTERY',
          current: 45,
          required: 80,
        },
      ],
    });
  }
  if (scenario === 'content-preparing') {
    return chapterMapEntryFixture({ accessState: 'content_unavailable' });
  }
  if (scenario === 'completed') {
    return chapterMapEntryFixture({ accessState: 'completed' });
  }
  return chapterMapEntryFixture({ accessState: 'available' });
}

export function ChapterDetailPageHarness({
  scenario,
}: Readonly<{ scenario: ChapterDetailHarnessScenario }>) {
  const readerState = new URLSearchParams(window.location.search).get(
    'readerState',
  );
  const sections =
    scenario === 'content-readiness-error'
      ? chapterReviewSectionsFixture([
          {
            subtopics: [
              {
                cards: [],
                sortOrder: 1,
                stableCode: 's',
                subtopicId: 'sub-1',
                title: '3-1 色彩三要素',
              },
            ],
          },
        ])
      : scenario === 'long-title'
        ? chapterReviewSectionsFixture([
            {
              subtopics: [
                {
                  cards: [
                    {
                      cardId: '25500000-0000-0000-0000-000000000099',
                      content: '佔位內容',
                      groupLabel: '',
                      media: [],
                      requiresRecompletion: false,
                      sortOrder: 1,
                      title: '佔位卡片',
                      version: 1,
                    },
                  ],
                  sortOrder: 1,
                  stableCode: 's',
                  subtopicId: 'sub-1',
                  title: LONG_TITLE,
                },
              ],
            },
          ])
        : chapterEntrySectionsFixture();
  const readerSections =
    readerState === 'media-wait'
      ? sections.map((section) => ({
          ...section,
          subtopics: section.subtopics.map((subtopic) => ({
            ...subtopic,
            cards: subtopic.cards.map((card) => ({
              ...card,
              media: card.media.map((media) => ({
                ...media,
                assetPath: 'chapter-3/color-wheel.webp',
              })),
            })),
          })),
        }))
      : sections;
  const stalledMediaRepository = {
    resolveReviewMedia: () => new Promise<never>(() => undefined),
  } as unknown as LearningRepository;

  const viewModel = deriveChapterDetailViewModel({
    chapterMapEntry: scenario === 'loading' ? undefined : entryFor(scenario),
    chapterMapIsError: false,
    chapterMapIsPending: scenario === 'loading',
    completions: reviewCompletionsFixture(),
    completionsIsError: false,
    completionsIsPending: false,
    progressIsError: false,
    progressIsPending: false,
    progressRows: learningProgressRowsFixture(),
    reviewError: scenario === 'error' ? new LearningError('UNAVAILABLE') : null,
    reviewIsPending: false,
    reviewSections: readerSections,
  });

  return (
    <QueryClientProvider client={harnessQueryClient}>
      <StudentHudHarness initialEntry="/app/chapters/chapter-3">
        <ChapterDetailPageView
          completeError={
            readerState === 'completion-error'
              ? '儲存失敗，請再試一次。'
              : undefined
          }
          completePending={false}
          onCompleteCard={() => undefined}
          onRetry={() => undefined}
          {...(readerState === 'media-wait'
            ? { repository: stalledMediaRepository }
            : {})}
          viewModel={viewModel}
        />
      </StudentHudHarness>
    </QueryClientProvider>
  );
}
