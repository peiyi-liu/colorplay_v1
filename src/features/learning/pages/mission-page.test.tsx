import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useMasteryHint,
  useMasteryState,
  useStartMastery,
  useSubmitMasteryAttempt,
} from '../hooks/use-mastery';
import { useStudentChapterMap } from '../hooks/use-chapter-map';
import { MasteryError } from '../api/mastery-repository';
import { MissionPage, MissionSelectPage } from './mission-page';

vi.mock('../hooks/use-mastery', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../hooks/use-mastery')>();
  return {
    ...original,
    useMasteryHint: vi.fn(),
    useMasteryState: vi.fn(),
    useStartMastery: vi.fn(),
    useSubmitMasteryAttempt: vi.fn(),
  };
});
vi.mock('../hooks/use-chapter-map', () => ({
  useStudentChapterMap: vi.fn(),
}));

const mockedState = vi.mocked(useMasteryState);
const mockedSubmit = vi.mocked(useSubmitMasteryAttempt);
const mockedHint = vi.mocked(useMasteryHint);
const mockedStart = vi.mocked(useStartMastery);
const mockedChapterMap = vi.mocked(useStudentChapterMap);

const asResult = (value: unknown) => value as never;

const baseState = {
  chapterId: '21000000-0000-0000-0000-000000000003',
  chapterTitle: '色彩表示',
  position: 2,
  question: {
    options: [
      { id: 'o1', key: 'A', locked: true, text: '橙色' },
      { id: 'o2', key: 'B', locked: false, text: '黃色' },
    ],
    prompt: 'R255 G255 B0 呈現何種色彩?',
    questionId: 'q1',
    subtopicTitle: '3-2 數位色彩',
    wrongAttempts: 1,
  },
  questionCount: 5,
  sessionId: 's1',
  stages: [
    { attempts: 2, completed: true, position: 1 },
    { attempts: 1, completed: false, position: 2 },
    { attempts: 0, completed: false, position: 3 },
    { attempts: 0, completed: false, position: 4 },
    { attempts: 0, completed: false, position: 5 },
  ],
  status: 'in_progress',
} as const;

describe('MissionPage', () => {
  beforeEach(() => {
    mockedStart.mockReturnValue(
      asResult({ isPending: false, mutate: vi.fn() }),
    );
    mockedSubmit.mockReturnValue(
      asResult({ isPending: false, mutate: vi.fn() }),
    );
    mockedHint.mockReturnValue(asResult({ isPending: false, mutate: vi.fn() }));
    mockedState.mockReturnValue(
      asResult({
        data: baseState,
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      }),
    );
  });

  it('renders the mastery map, scenario, and locks wrong options', () => {
    render(
      <MemoryRouter>
        <MissionPage sessionId="s1" />
      </MemoryRouter>,
    );
    expect(screen.getByText('R255 G255 B0 呈現何種色彩?')).toBeInTheDocument();
    // owner 0730 #7：與大廳開始任務同款 radio＋「送出答案」；答錯選項鎖定。
    const lockedOption = screen.getByRole('radio', { name: /橙色/u });
    expect(lockedOption).toBeDisabled();
    expect(screen.getByRole('radio', { name: /黃色/u })).toBeEnabled();
    expect(screen.getByRole('button', { name: '送出答案' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '索取第 1 層提示' }),
    ).toBeInTheDocument();
    // live-v2 設計稿：quiz-runner 標頭顯示小節標題與關卡進度。
    expect(
      screen.getByRole('heading', { name: '3-2 數位色彩' }),
    ).toBeInTheDocument();
    expect(screen.getByText('第 2 / 5 關')).toBeInTheDocument();
    expect(screen.getByText('本關已嘗試 1 次')).toBeInTheDocument();
  });

  it('shows the victory card without fabricated rewards when completed', () => {
    mockedState.mockReturnValue(
      asResult({
        data: { ...baseState, question: null, status: 'completed' },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      }),
    );
    render(
      <MemoryRouter>
        <MissionPage sessionId="s1" />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: '階段任務挑戰完成！' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('+0 XP')).toBeNull();
  });

  it('shows a tri-spirit mentor on the correct-answer feedback card', async () => {
    const user = userEvent.setup();
    // 既有 stub 只覆蓋 isPending/mutate 骨架,未涵蓋 isCorrect:true 路徑;
    // 這裡擴充回傳以驅動 resolved 卡渲染(只改測試檔)。
    mockedSubmit.mockReturnValue(
      asResult({
        isPending: false,
        mutate: (
          _optionId: string,
          options: { onSuccess: (result: unknown) => void },
        ) => {
          options.onSuccess({
            correctOptionId: 'o2',
            explanation: '解析文',
            isCorrect: true,
            position: baseState.position,
            status: 'in_progress',
          });
        },
      }),
    );
    render(
      <MemoryRouter>
        <MissionPage sessionId="s1" />
      </MemoryRouter>,
    );

    // 沿用檔內既有 render + 答題流程:選正確選項→送出→出現「✓ 答對了」
    await user.click(screen.getByRole('radio', { name: /黃色/u }));
    await user.click(screen.getByRole('button', { name: '送出答案' }));

    expect(
      await screen.findByRole('heading', { name: '✓ 答對了' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/^[紅藍綠]精靈導師$/u)).toBeInTheDocument();
  });
});

// 批③世界地圖:兩個 playable 章節(id 對齊本檔既有慣例的 UUID 樣式)。
const worldMapChapters = [
  {
    description: '色彩三要素說明',
    id: '21000000-0000-0000-0000-000000000001',
    isPlayable: true,
    sortOrder: 1,
    stableCode: 'chapter-1',
    subtopicCodes: ['3-1'],
    subtopicTitles: ['3-1 色彩三要素與色名的表示'],
    template: {
      id: '26000000-0000-0000-0000-000000000001',
      questionCount: 5,
      title: '色彩三要素',
    },
    title: '色彩三要素',
  },
  {
    description: '色彩體系說明',
    id: '21000000-0000-0000-0000-000000000002',
    isPlayable: true,
    sortOrder: 2,
    stableCode: 'chapter-2',
    subtopicCodes: ['3-2'],
    subtopicTitles: ['3-2 數位色彩'],
    template: {
      id: '26000000-0000-0000-0000-000000000002',
      questionCount: 5,
      title: '色彩體系',
    },
    title: '色彩體系',
  },
];

const chapterMapResult = (
  chapters: readonly Readonly<{
    accessState: 'available' | 'completed' | 'content_unavailable' | 'locked';
    blockers: readonly unknown[];
    chapterId: string;
    description: string;
    mastery: number | null;
    progressStatus: 'developing' | 'learning' | 'mastered' | 'not_started';
    reviewCompleted: number;
    reviewTotal: number | null;
    sortOrder: number;
    stableCode: string;
    templateId: string | null;
    templateQuestionCount: number | null;
    title: string;
  }>[],
) =>
  asResult({
    data: {
      chapters,
      mode: 'sequential',
      rulesVersion: '2026-08-sequence-1',
    },
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  });

const renderMissionSelect = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {children}
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(<MissionSelectPage />, { wrapper });
};

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

describe('MissionSelectPage world map', () => {
  beforeEach(() => {
    mockedStart.mockReturnValue(
      asResult({ isPending: false, mutate: vi.fn() }),
    );
    mockedChapterMap.mockReturnValue(
      chapterMapResult(
        worldMapChapters.map((chapter, index) => ({
          accessState: index === 0 ? 'available' : 'locked',
          blockers:
            index === 0
              ? []
              : [
                  {
                    chapterId: '21000000-0000-0000-0000-000000000001',
                    chapterTitle: '色彩三要素',
                    code: 'PREREQUISITE_MASTERY',
                    current: 60,
                    required: 80,
                  },
                ],
          chapterId: chapter.id,
          description: chapter.description,
          mastery: index === 0 ? null : 60,
          progressStatus: index === 0 ? 'not_started' : 'learning',
          reviewCompleted: 0,
          reviewTotal: 5,
          sortOrder: chapter.sortOrder,
          stableCode: chapter.stableCode,
          templateId: chapter.template.id,
          templateQuestionCount: chapter.template.questionCount,
          title: chapter.title,
        })),
      ),
    );
  });

  it('exposes mastery start only for authoritative available chapters', async () => {
    renderMissionSelect();
    expect(
      await screen.findByRole('button', { name: '展開小節任務' }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    expect(screen.getByText('尚未解鎖')).toBeVisible();
    expect(screen.getByText('「色彩三要素」精熟度 60% / 80%')).toBeVisible();
    expect(screen.queryByRole('button', { name: '展開小節任務' })).toBeNull();
  });

  it('returns a stale locked mastery start to the selected map panel', async () => {
    mockedStart.mockReturnValue(
      asResult({
        isPending: false,
        mutate: (
          _chapterId: string,
          options: { onError: (error: MasteryError) => void },
        ) => {
          options.onError(new MasteryError('CHAPTER_LOCKED'));
        },
      }),
    );
    renderMissionSelect();
    await userEvent.click(screen.getByRole('button', { name: '展開小節任務' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/app?chapter=21000000-0000-0000-0000-000000000001&reason=locked',
    );
  });

  it('maps chapter progress onto four-state nodes with the hero on the first unmastered chapter', async () => {
    const user = userEvent.setup();
    mockedChapterMap.mockReturnValue(
      chapterMapResult(
        worldMapChapters.map((chapter, index) => ({
          accessState: index === 0 ? 'completed' : 'available',
          blockers: [],
          chapterId: chapter.id,
          description: chapter.description,
          mastery: index === 0 ? 90 : 40,
          progressStatus: index === 0 ? 'mastered' : 'learning',
          reviewCompleted: index === 0 ? 5 : 1,
          reviewTotal: 5,
          sortOrder: chapter.sortOrder,
          stableCode: chapter.stableCode,
          templateId: chapter.template.id,
          templateQuestionCount: chapter.template.questionCount,
          title: chapter.title,
        })),
      ),
    );
    renderMissionSelect();
    expect(await screen.findByText('已精熟')).toBeInTheDocument();
    expect(document.querySelector('.map-node--mastered')).not.toBeNull();
    // 分頁批:global matchMedia stub=narrow,容量1、playable=2→溢出兩頁,
    // 章節2落頁2,需先點「下一頁」才可見。
    await user.click(screen.getByRole('button', { name: '下一頁' }));
    expect(screen.getByText('學習中')).toBeInTheDocument();
    expect(
      document.querySelector('.map-node--learning .map-node__hero'),
    ).not.toBeNull();
  });

  it('fails closed when authoritative access is unavailable', () => {
    mockedChapterMap.mockReturnValue(
      asResult({
        data: undefined,
        isError: true,
        isPending: false,
        refetch: vi.fn(),
      }),
    );
    renderMissionSelect();
    expect(screen.getByRole('alert')).toHaveTextContent('章節狀態暫時無法確認');
    expect(screen.getByRole('button', { name: '重新載入' })).toBeVisible();
  });

  it('章節數超過單頁容量時分頁,跨頁章節仍可透過下一頁抵達', async () => {
    const overflowChapters = [1, 2, 3, 4, 5].map((n) => ({
      description: `章節${String(n)}說明`,
      id: `21000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
      isPlayable: true,
      sortOrder: n,
      stableCode: `chapter-${String(n)}`,
      subtopicCodes: [`${String(n)}-1`],
      subtopicTitles: [`${String(n)}-1 小節`],
      template: {
        id: `26000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
        questionCount: 5,
        title: `章節${String(n)}挑戰`,
      },
      title: `章節${String(n)}`,
    }));
    mockedChapterMap.mockReturnValue(
      chapterMapResult(
        overflowChapters.map((chapter) => ({
          accessState: 'available',
          blockers: [],
          chapterId: chapter.id,
          description: chapter.description,
          mastery: null,
          progressStatus: 'not_started',
          reviewCompleted: 0,
          reviewTotal: 5,
          sortOrder: chapter.sortOrder,
          stableCode: chapter.stableCode,
          templateId: chapter.template.id,
          templateQuestionCount: chapter.template.questionCount,
          title: chapter.title,
        })),
      ),
    );
    renderMissionSelect();
    // 全域 matchMedia stub matches:false → narrow 容量 1 → 5 頁。
    expect(await screen.findByText('第 1 / 5 頁')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: '章節1' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { level: 2, name: '章節2' }),
    ).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '下一頁' }));
    expect(screen.getByText('第 2 / 5 頁')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: '章節2' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { level: 2, name: '章節1' }),
    ).toBeNull();
  });
});
