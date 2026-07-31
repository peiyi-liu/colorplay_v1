import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePublishedChapters } from '../api/chapters';
import type {
  LearningProgressRow,
  LearningRepository,
} from '../api/learning-repository';
import {
  useMasteryHint,
  useMasteryState,
  useStartMastery,
  useSubmitMasteryAttempt,
} from '../hooks/use-mastery';
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
vi.mock('../api/chapters', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/chapters')>();
  return { ...original, usePublishedChapters: vi.fn() };
});

const mockedState = vi.mocked(useMasteryState);
const mockedSubmit = vi.mocked(useSubmitMasteryAttempt);
const mockedHint = vi.mocked(useMasteryHint);
const mockedStart = vi.mocked(useStartMastery);
const mockedChapters = vi.mocked(usePublishedChapters);

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

const progressRow = (
  chapterId: string,
  status: LearningProgressRow['status'],
): LearningProgressRow => ({
  accuracy: null,
  chapterId,
  coverage: null,
  mastery: null,
  reviewCompleted: 0,
  reviewTotal: null,
  rulesVersion: 'v1',
  scope: 'chapter',
  status,
  subtopicId: null,
});

const learningStub = (
  rows: readonly LearningProgressRow[],
): LearningRepository => ({
  completeReviewCard: () => Promise.reject(new Error('unused')),
  getClassroomProgress: () => Promise.reject(new Error('unused')),
  getLearningProgress: () => Promise.resolve(rows),
  listChapterReview: () => Promise.reject(new Error('unused')),
  listMistakes: () => Promise.reject(new Error('unused')),
  listReviewProgress: () => Promise.reject(new Error('unused')),
  requestHint: () => Promise.reject(new Error('unused')),
  startRemediation: () => Promise.reject(new Error('unused')),
});

const renderMissionSelect = (learningRepository: LearningRepository) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<MissionSelectPage learningRepository={learningRepository} />, {
    wrapper,
  });
};

describe('MissionSelectPage world map', () => {
  beforeEach(() => {
    mockedStart.mockReturnValue(
      asResult({ isPending: false, mutate: vi.fn() }),
    );
    mockedChapters.mockReturnValue(
      asResult({
        data: worldMapChapters,
        error: null,
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      }),
    );
  });

  it('maps chapter progress onto four-state nodes with the hero on the first unmastered chapter', async () => {
    renderMissionSelect(
      learningStub([
        progressRow('21000000-0000-0000-0000-000000000001', 'mastered'),
        progressRow('21000000-0000-0000-0000-000000000002', 'learning'),
      ]),
    );
    expect(await screen.findByText('已精熟')).toBeInTheDocument();
    expect(screen.getByText('學習中・目前位置')).toBeInTheDocument();
    expect(document.querySelector('.map-node--mastered')).not.toBeNull();
    expect(
      document.querySelector('.map-node--learning .map-node__hero'),
    ).not.toBeNull();
  });

  it('degrades to not_started nodes when progress is unavailable', async () => {
    renderMissionSelect({
      ...learningStub([]),
      getLearningProgress: () => Promise.reject(new Error('down')),
    });
    // 章節列表照常渲染,節點退灰霧,不新增 alert
    expect(
      await screen.findAllByRole('button', { name: '展開小節任務' }),
    ).not.toHaveLength(0);
    expect(document.querySelector('.map-node--not_started')).not.toBeNull();
  });
});
