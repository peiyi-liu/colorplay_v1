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
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudentBackNavigationProvider } from '../../../app/shell/student-back-navigation';
import { StudentRouteBackButton } from '../../../app/shell/student-route-back-button';
import type { StudentChapterMapEntry } from '../api/chapter-map';
import {
  LearningError,
  type LearningRepository,
} from '../api/learning-repository';
import { useStudentChapterMap } from '../hooks/use-chapter-map';
import {
  ChapterDetailPage,
  percentText,
  reviewText,
} from './chapter-detail-page';
import {
  chapterEntrySectionsFixture,
  chapterReviewSectionsFixture,
} from './chapter-detail-page.test-fixtures';

vi.mock('../api/chapters', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/chapters')>();
  return {
    ...original,
    usePublishedChapters: () => ({
      data: [
        {
          description: '',
          id: '21000000-0000-0000-0000-000000000003',
          isPlayable: true,
          sortOrder: 3,
          stableCode: 'chapter-3',
          template: {
            id: '26000000-0000-0000-0000-000000000003',
            questionCount: 10,
            title: '色彩體系與應用',
          },
          title: '色彩體系與應用',
        },
      ],
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    }),
  };
});
vi.mock('../hooks/use-chapter-map', () => ({
  useStudentChapterMap: vi.fn(),
}));

const mockedChapterMap = vi.mocked(useStudentChapterMap);
const chapterMapEntry = (
  accessState: StudentChapterMapEntry['accessState'] = 'available',
): StudentChapterMapEntry => ({
  accessState,
  blockers: [],
  chapterId: '21000000-0000-0000-0000-000000000003',
  description: '色彩體系與應用',
  mastery: 59.5,
  progressStatus: 'learning',
  reviewCompleted: 1,
  reviewTotal: 3,
  sortOrder: 3,
  stableCode: 'chapter-3',
  templateId: '26000000-0000-0000-0000-000000000003',
  templateQuestionCount: 10,
  title: '色彩體系與應用',
});

const mapResult = (entry = chapterMapEntry()) =>
  ({
    data: {
      chapters: [entry],
      mode: 'sequential',
      rulesVersion: '2026-08-sequence-1',
    },
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }) as never;

const sections = [
  {
    sectionId: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
    quizTemplateId: '26000000-0000-0000-0000-000000003101',
    sortOrder: 1,
    stableCode: 'sheet-3-1',
    subtopics: [
      {
        cards: [
          {
            cardId: '25500000-0000-0000-0000-000000000001',
            content: '第一行\n\n第二行',
            groupLabel: '色彩的分類',
            media: [
              {
                altText: '十二色相環示意圖',
                assetPath: '/media/review/color-wheel.svg',
              },
            ],
            requiresRecompletion: false,
            sortOrder: 1,
            title: '有彩色與無彩色',
            version: 1,
          },
          {
            cardId: '25500000-0000-0000-0000-000000000002',
            content: '內容乙',
            groupLabel: '色彩三要素',
            media: [],
            requiresRecompletion: false,
            sortOrder: 2,
            title: '甚麼是HVC',
            version: 1,
          },
        ],
        sortOrder: 1,
        stableCode: 'sheet-3-1-all',
        subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
        title: '3-1 色彩三要素與色名的表示',
      },
    ],
    title: '3-1 色彩三要素與色名的表示',
  },
] as const;

const progressRows = [
  {
    accuracy: 66.7,
    chapterId: '21000000-0000-0000-0000-000000000003',
    coverage: 23.1,
    mastery: 15.4,
    reviewCompleted: 1,
    reviewTotal: 3,
    rulesVersion: '2026-07-progress-1',
    scope: 'subtopic' as const,
    status: 'learning' as const,
    subtopicId: 'f929cde5-c294-46ce-5faf-c866b3cb9583',
  },
  {
    accuracy: 95.7,
    chapterId: '21000000-0000-0000-0000-000000000003',
    coverage: 62.2,
    mastery: 59.5,
    reviewCompleted: 1,
    reviewTotal: 3,
    rulesVersion: '2026-07-progress-1',
    scope: 'chapter' as const,
    status: 'learning' as const,
    subtopicId: null,
  },
];

const repositoryWith = (
  overrides: Partial<LearningRepository> = {},
): LearningRepository =>
  ({
    completeReviewCard: vi.fn().mockResolvedValue(undefined),
    getClassroomProgress: vi.fn().mockResolvedValue([]),
    getLearningProgress: vi.fn().mockResolvedValue(progressRows),
    listChapterReview: vi.fn().mockResolvedValue(sections),
    listMistakes: vi.fn().mockResolvedValue([]),
    listReviewProgress: vi.fn().mockResolvedValue([
      {
        cardVersion: 1,
        reviewCardId: '25500000-0000-0000-0000-000000000001',
      },
    ]),
    requestHint: vi.fn(),
    resolveReviewMedia: vi.fn().mockResolvedValue([
      {
        assetPath: '/media/review/color-wheel.svg',
        resolvedUrl: '/media/review/color-wheel.svg',
      },
    ]),
    startRemediation: vi.fn(),
    ...overrides,
  }) satisfies LearningRepository;

const renderPage = (repository: LearningRepository) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/chapters/chapter-3']}>
        <StudentBackNavigationProvider>
          <StudentRouteBackButton />
          {children}
        </StudentBackNavigationProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    <ChapterDetailPage
      chapterId="21000000-0000-0000-0000-000000000003"
      repository={repository}
    />,
    { wrapper },
  );
};

describe('ChapterDetailPage', () => {
  beforeEach(() => {
    mockedChapterMap.mockReturnValue(mapResult());
  });

  it('renders the locked state in place instead of navigating away, showing server unmet conditions', async () => {
    mockedChapterMap.mockReturnValue(
      mapResult({
        ...chapterMapEntry('locked'),
        blockers: [
          {
            chapterId: 'c2',
            chapterTitle: '色彩表示',
            code: 'PREREQUISITE_MASTERY',
            current: 45,
            required: 80,
          },
        ],
      }),
    );
    const repository = repositoryWith();
    renderPage(repository);

    expect(
      await screen.findByRole('heading', { name: '色彩體系與應用' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/色彩表示/u)).toBeInTheDocument();
    expect(screen.getByText(/80/u)).toBeInTheDocument();
    expect(repository.listChapterReview).not.toHaveBeenCalled();
  });

  it('renders the locked state and reconciles with the server when the guarded review read detects a stale lock', async () => {
    const refetch = vi.fn();
    mockedChapterMap.mockReturnValue({
      data: {
        chapters: [chapterMapEntry()],
        mode: 'sequential',
        rulesVersion: '2026-08-sequence-1',
      },
      error: null,
      isError: false,
      isPending: false,
      refetch,
    } as never);
    const repository = repositoryWith({
      listChapterReview: vi
        .fn()
        .mockRejectedValue(new LearningError('CHAPTER_LOCKED')),
    });
    renderPage(repository);

    await screen.findByRole('heading', { name: '色彩體系與應用' });
    expect(screen.queryByText('第一行')).toBeNull();
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled();
    });
  });

  it('fails closed and retries only the map when access is unavailable', async () => {
    const refetch = vi.fn();
    mockedChapterMap.mockReturnValue({
      data: undefined,
      error: new LearningError('UNAVAILABLE'),
      isError: true,
      isPending: false,
      refetch,
    } as never);
    const repository = repositoryWith();
    renderPage(repository);
    expect(screen.getByRole('alert')).toHaveTextContent('章節狀態暫時無法確認');
    expect(repository.listChapterReview).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders subtopic progress, cards, media, and completion states', async () => {
    const repository = repositoryWith();
    renderPage(repository);

    await waitFor(() => {
      // owner 0730 #4:章節標題表示完整(Chapter n：標題)。
      expect(
        screen.getByRole('heading', { name: 'Chapter 3：色彩體系與應用' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: '章節總挑戰' })).toHaveAttribute(
      'href',
      '/app/quiz/new?template=26000000-0000-0000-0000-000000000003',
    );
    expect(screen.getByRole('link', { name: '小節挑戰' })).toHaveAttribute(
      'href',
      '/app/quiz/new?template=26000000-0000-0000-0000-000000003101',
    );
    expect(screen.queryByText('開始挑戰')).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', {
        name: '3-1 色彩三要素與色名的表示',
      }),
    ).toBeInTheDocument();

    // 章節進度：綠「學習中」pill＋複習完成 x/y＋44px 精熟圓環(DC 534–567)。
    const chapterProgress = screen.getByLabelText('章節進度');
    expect(chapterProgress).toHaveTextContent('學習中');
    expect(chapterProgress).toHaveTextContent('複習完成 1 / 3');
    expect(chapterProgress).toHaveTextContent('精熟程度');
    expect(chapterProgress).toHaveTextContent('目前記錄精熟度 59.5%');
    expect(chapterProgress).toHaveTextContent('規則版本 2026-07-progress-1');
    expect(chapterProgress).toHaveTextContent('跨版本比較尚待資料更新');
    const masteryRing = within(chapterProgress).getByRole('progressbar', {
      name: '精熟程度',
    });
    expect(masteryRing).toHaveAttribute('aria-valuenow', '59.5');
    expect(masteryRing).toHaveAttribute('aria-valuemin', '0');
    expect(masteryRing).toHaveAttribute('aria-valuemax', '100');

    // 序號方塊漸層三種循環(DC 594/608/623):兩張卡分屬循環的第 0/1 式樣。
    const badges = document.querySelectorAll('.review-accordion__badge');
    expect(badges[0]).toHaveClass('review-accordion__badge--0');
    expect(badges[1]).toHaveClass('review-accordion__badge--1');

    await userEvent.click(
      screen.getByRole('button', { name: '選擇複習卡：色彩的分類' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '進入複習' }));
    expect(
      await screen.findByRole('img', { name: '十二色相環示意圖' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('已完成複習');

    await userEvent.click(
      within(
        screen.getByRole('region', { name: /複習卡閱讀：色彩的分類/u }),
      ).getByRole('button', { name: '返回複習卡選擇' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: '選擇複習卡：色彩三要素' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '進入複習' }));
    expect(
      screen.getByRole('button', { name: '完成複習' }),
    ).toBeInTheDocument();
  });

  it('selects a 05a review book without expanding it, then enters the 06-v2 reading surface', async () => {
    renderPage(
      repositoryWith({
        listChapterReview: vi
          .fn()
          .mockResolvedValue(chapterEntrySectionsFixture()),
      }),
    );

    const journey = await screen.findByRole('region', {
      name: '第三章複習旅程',
    });
    const subtopicMenu = within(journey).getByRole('navigation', {
      name: '第三章小節',
    });
    const firstSubtopic = within(subtopicMenu).getByRole('button', {
      name: '3-1 色彩三要素與色名的表示',
    });
    const secondSubtopic = within(subtopicMenu).getByRole('button', {
      name: '3-2 色彩體系',
    });
    expect(firstSubtopic).toHaveAttribute('aria-current', 'true');
    expect(secondSubtopic).not.toHaveAttribute('aria-current');
    expect(
      within(journey).getByRole('region', {
        name: '3-1 色彩三要素與色名的表示',
      }),
    ).toBeInTheDocument();
    expect(
      within(journey).queryByRole('region', { name: '3-2 色彩體系' }),
    ).not.toBeInTheDocument();
    expect(journey.querySelectorAll('.chapter-review-node')).toHaveLength(6);
    expect(within(journey).getByText('第 1 / 2 頁')).toBeInTheDocument();
    expect(journey.querySelectorAll('.primary-action')).toHaveLength(1);
    const footer = journey.querySelector('footer');
    expect(footer).not.toBeNull();
    if (!footer) throw new Error('CHAPTER_ARCHIVE_FOOTER_MISSING');
    expect(within(footer).queryByLabelText('章節進度')).toBeNull();
    expect(within(footer).queryByText(/挑戰/u)).not.toBeInTheDocument();
    expect(
      within(subtopicMenu).getByRole('link', { name: '小節挑戰' }),
    ).toHaveAttribute(
      'href',
      '/app/quiz/new?template=26000000-0000-0000-0000-000000003101',
    );
    expect(
      within(subtopicMenu).getByRole('link', { name: '章節總挑戰' }),
    ).toHaveAttribute(
      'href',
      '/app/quiz/new?template=26000000-0000-0000-0000-000000000003',
    );
    const header = journey.querySelector('header');
    expect(header).not.toBeNull();
    if (!header) throw new Error('CHAPTER_ARCHIVE_HEADER_MISSING');
    expect(within(header).getByLabelText('章節進度')).toBeInTheDocument();
    expect(within(footer).queryByText(/^複習\s+\d+\s*\/\s*\d+$/u)).toBeNull();

    const bookSources = Array.from(
      journey.querySelectorAll<HTMLImageElement>(
        '.chapter-review-node__book-art',
      ),
      (image) => image.getAttribute('src'),
    );
    expect(bookSources).toHaveLength(6);
    expect(new Set(bookSources)).toHaveProperty('size', 6);
    expect(bookSources.join(' ')).not.toContain('01-color-wheel-book');
    expect(
      journey.querySelectorAll('.chapter-review-node__platform-art'),
    ).toHaveLength(0);

    const current = journey.querySelector<HTMLElement>(
      '.chapter-review-node[data-current="true"]',
    );
    expect(current).not.toBeNull();
    expect(current).toHaveAttribute('data-selected', 'true');
    expect(within(journey).queryByRole('article')).not.toBeInTheDocument();

    await userEvent.click(
      within(journey).getByRole('button', { name: '下一頁' }),
    );
    expect(journey.querySelectorAll('.chapter-review-node')).toHaveLength(4);
    expect(within(journey).getByText('第 2 / 2 頁')).toBeInTheDocument();
    expect(
      within(journey).getByRole('button', {
        name: '選擇複習卡：彩度的變化',
      }),
    ).toBeInTheDocument();

    await userEvent.click(secondSubtopic);
    expect(firstSubtopic).not.toHaveAttribute('aria-current');
    expect(secondSubtopic).toHaveAttribute('aria-current', 'true');
    expect(journey.querySelectorAll('.chapter-review-node')).toHaveLength(5);
    expect(within(journey).queryByText(/第 \d+ \/ \d+ 頁/u)).toBeNull();
    expect(
      within(journey).getByRole('region', { name: '3-2 色彩體系' }),
    ).toBeInTheDocument();

    const nextBook = within(journey).getByRole('button', {
      name: /選擇複習卡：常用的色彩體系/u,
    });
    await userEvent.click(nextBook);

    expect(nextBook.closest('.chapter-review-node')).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(within(journey).queryByRole('article')).not.toBeInTheDocument();

    await userEvent.click(
      within(journey).getByRole('button', { name: '進入複習' }),
    );

    expect(
      screen.getByRole('region', { name: /複習卡閱讀：常用的色彩體系/u }),
    ).toBeInTheDocument();
    const reader = screen.getByRole('region', {
      name: /複習卡閱讀：常用的色彩體系/u,
    });
    expect(
      within(reader).getByRole('heading', {
        name: '第三章 · 色彩體系與應用',
      }),
    ).toBeVisible();
    expect(reader).toHaveTextContent('3-2 色彩體系');
    expect(reader).toHaveTextContent('複習 3 / 5');
    expect(within(reader).getByRole('article')).toBeVisible();
    expect(
      within(reader).getByRole('button', { name: '返回複習卡選擇' }),
    ).toBeVisible();
    expect(
      within(reader).getByRole('progressbar', { name: '本頁閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '1');
    expect(
      within(reader).getByRole('button', { name: '閱讀上一頁' }),
    ).toBeDisabled();
    expect(
      within(reader).getByRole('button', { name: '閱讀下一頁' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '第三章複習旅程' })).toBeNull();
  });

  it('completes a card through the trusted command', async () => {
    const repository = repositoryWith();
    renderPage(repository);

    await screen.findByRole('button', { name: '進入複習' });
    await userEvent.click(screen.getByRole('button', { name: '進入複習' }));
    const button = await screen.findByRole('button', { name: '完成複習' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(repository.completeReviewCard).toHaveBeenCalledWith(
        expect.objectContaining({
          reviewCardId: '25500000-0000-0000-0000-000000000002',
        }),
      );
    });
  });

  it('shows a fallback when card media fails to load', async () => {
    renderPage(repositoryWith());

    await userEvent.click(
      await screen.findByRole('button', {
        name: '選擇複習卡：色彩的分類',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: '進入複習' }));
    const image = await screen.findByRole('img', {
      name: '十二色相環示意圖',
    });
    fireEvent.error(image);

    expect(
      screen.getByText(/圖片載入失敗：十二色相環示意圖/u),
    ).toBeInTheDocument();
  });

  it('renders imported Markdown and keeps inline media in document order', async () => {
    const repository = repositoryWith({
      listChapterReview: vi.fn().mockResolvedValue([
        {
          ...sections[0],
          subtopics: [
            {
              ...sections[0].subtopics[0],
              cards: [
                {
                  ...sections[0].subtopics[0].cards[0],
                  content: `# 明度觀察

**明度**代表色彩的明暗，==先找出最亮與最暗的位置==。

![十二色相環示意圖](/media/review/color-wheel.svg)

| 觀察 | 結果 |
| --- | --- |
| 明度 | 清楚 |`,
                },
              ],
            },
          ],
        },
      ]),
      listReviewProgress: vi.fn().mockResolvedValue([]),
    });
    renderPage(repository);

    await userEvent.click(
      await screen.findByRole('button', {
        name: '選擇複習卡：色彩的分類',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: '進入複習' }));

    const reader = await screen.findByRole('region', {
      name: /複習卡閱讀：色彩的分類/u,
    });
    const heading = within(reader).getByRole('heading', {
      level: 1,
      name: '明度觀察',
    });
    const image = within(reader).getByRole('img', {
      name: '十二色相環示意圖',
    });
    const table = within(reader).getByRole('table');

    expect(heading.compareDocumentPosition(image)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(image.compareDocumentPosition(table)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      within(reader).getByText('明度', { selector: 'strong' }),
    ).toBeInTheDocument();
    expect(
      within(reader).getByText('先找出最亮與最暗的位置', {
        selector: 'mark',
      }),
    ).toBeInTheDocument();
  });

  it('keeps review text and controls usable while private media signing is pending', async () => {
    const nativeSetTimeout = window.setTimeout;
    const timeoutSpy = vi
      .spyOn(window, 'setTimeout')
      .mockImplementation((handler, timeout) =>
        nativeSetTimeout.call(
          window,
          handler,
          timeout === 10_000 ? 0 : timeout,
        ),
      );
    const repository = repositoryWith({
      listChapterReview: vi.fn().mockResolvedValue([
        {
          ...sections[0],
          subtopics: [
            {
              ...sections[0].subtopics[0],
              cards: [
                {
                  ...sections[0].subtopics[0].cards[0],
                  media: [
                    {
                      altText: '十二色相環示意圖',
                      assetPath: 'review-card-media/chapter-3/color-wheel.webp',
                    },
                  ],
                },
                ...sections[0].subtopics[0].cards.slice(1),
              ],
            },
          ],
        },
      ]),
      listReviewProgress: vi.fn().mockResolvedValue([]),
      resolveReviewMedia: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    try {
      renderPage(repository);

      await userEvent.click(
        await screen.findByRole('button', {
          name: '選擇複習卡：色彩的分類',
        }),
      );
      await userEvent.click(screen.getByRole('button', { name: '進入複習' }));

      const reader = await screen.findByRole('region', {
        name: /複習卡閱讀：色彩的分類/u,
      });
      expect(reader).toHaveTextContent('第一行');
      expect(
        within(reader).getByRole('button', { name: '完成複習' }),
      ).toBeEnabled();
      expect(
        within(reader).getByRole('status', {
          name: '圖片載入中：十二色相環示意圖',
        }),
      ).toBeInTheDocument();

      await userEvent.click(
        await within(reader).findByRole('button', { name: '略過圖片' }),
      );
      expect(
        within(reader).getByRole('img', { name: '十二色相環示意圖' }),
      ).toHaveTextContent('圖片載入失敗');
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('surfaces a retryable error state', async () => {
    renderPage(
      repositoryWith({
        listChapterReview: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '章節狀態暫時無法確認',
      );
    });
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });

  it('renders dungeon floor torches matching subtopic review progress', async () => {
    renderPage(repositoryWith());

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Chapter 3：色彩體系與應用' }),
      ).toBeInTheDocument();
    });

    // fixture 小節(f929cde5-…)於 progressRows 的 reviewTotal=3、reviewCompleted=1。
    const torches = document.querySelectorAll('.floor-torch');
    expect(torches).toHaveLength(3);
    expect(document.querySelectorAll('.floor-torch--lit')).toHaveLength(1);
    expect(
      document.querySelector('.chapter-dungeon.scene-dungeon'),
    ).not.toBeNull();
  });

  it('formats missing review/mastery values without fabricating a percentage', () => {
    expect(percentText(null)).toBe('—');
    expect(reviewText(0, null)).toBe('—');
  });

  it('renders the content-preparing state in place when content is not yet available', async () => {
    mockedChapterMap.mockReturnValue(
      mapResult(chapterMapEntry('content_unavailable')),
    );
    renderPage(repositoryWith());
    expect(
      await screen.findByText('這個章節的內容還在準備中，敬請期待。'),
    ).toBeInTheDocument();
  });

  it('renders the content-readiness-error state when the chapter has no cards despite being unlocked', async () => {
    const emptySections = chapterReviewSectionsFixture([
      {
        subtopics: [
          {
            cards: [],
            sortOrder: 1,
            stableCode: 's',
            subtopicId: 'sub-1',
            title: '3-1',
          },
        ],
      },
    ]);
    renderPage(
      repositoryWith({
        listChapterReview: vi.fn().mockResolvedValue(emptySections),
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '沒有可用的複習卡',
    );
  });

  it('多個小節全部列在目錄，且一次只呈現選取的小節', async () => {
    const overflowSection = {
      sectionId: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
      quizTemplateId: '26000000-0000-0000-0000-000000003101',
      sortOrder: 1,
      stableCode: 'sheet-3-1',
      // 至少一張卡才不會觸發 content-readiness-error(章節整體無卡片時的
      // 頁內狀態);其餘樓層維持空卡陣列,不影響本測試驗證的分頁行為。
      subtopics: [1, 2, 3, 4, 5, 6].map((n) => ({
        cards:
          n === 1
            ? [
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
              ]
            : [],
        sortOrder: n,
        stableCode: `sheet-3-1-${String(n)}`,
        subtopicId: `f929cde5-c294-46ce-5faf-c866b3cb${String(n).padStart(4, '0')}`,
        title: `3-1-${String(n)} 樓層`,
      })),
      title: '3-1 色彩三要素與色名的表示',
    };
    renderPage(
      repositoryWith({
        listChapterReview: vi.fn().mockResolvedValue([overflowSection]),
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Chapter 3：色彩體系與應用' }),
      ).toBeInTheDocument();
    });

    const menu = screen.getByRole('navigation', { name: '第三章小節' });
    expect(
      menu.querySelectorAll('.chapter-archive__subtopic-menu-item'),
    ).toHaveLength(6);
    expect(screen.getByRole('region', { name: '3-1-1 樓層' })).toBeVisible();
    expect(screen.queryByRole('region', { name: '3-1-3 樓層' })).toBeNull();

    await userEvent.click(
      within(menu).getByRole('button', { name: '3-1-3 樓層' }),
    );

    expect(screen.getByRole('region', { name: '3-1-3 樓層' })).toBeVisible();
    expect(screen.queryByRole('region', { name: '3-1-1 樓層' })).toBeNull();
  });
});
