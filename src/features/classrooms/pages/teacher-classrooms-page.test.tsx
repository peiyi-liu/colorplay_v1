import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  type ClassroomCodeReceipt,
  type ClassroomRepository,
  ClassroomRepositoryError,
} from '../types';
import { TeacherClassroomsPage } from './teacher-classrooms-page';

const createRepository = (
  overrides: Partial<ClassroomRepository> = {},
): ClassroomRepository => ({
  createClassroom: vi.fn(),
  getOwnedMembers: vi.fn(),
  getStudentProgress: vi.fn(),
  joinClassroom: vi.fn(),
  listMine: vi.fn(),
  listOwned: vi.fn().mockResolvedValue([]),
  rotateJoinCode: vi.fn(),
  ...overrides,
});
const renderPage = (repository: ClassroomRepository) => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    );
  }
  return render(
    <TeacherClassroomsPage
      menu={<nav>教師選單</nav>}
      repository={repository}
    />,
    {
      wrapper: Wrapper,
    },
  );
};

describe('TeacherClassroomsPage', () => {
  it('shows loading then a truthful empty state', async () => {
    let resolve!: (value: readonly []) => void;
    renderPage(
      createRepository({
        listOwned: () => new Promise((done) => (resolve = done)),
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('班級資料載入中');
    resolve([]);
    expect(await screen.findByText('尚未建立班級。')).toBeVisible();
  });

  it('validates 1–80 characters and locks one create request', async () => {
    let resolve!: (value: ClassroomCodeReceipt) => void;
    const createClassroom = vi.fn(
      () => new Promise<ClassroomCodeReceipt>((done) => (resolve = done)),
    );
    renderPage(createRepository({ createClassroom }));
    await userEvent.click(
      await screen.findByRole('button', { name: '建立班級' }),
    );
    expect(await screen.findByText('班級名稱為 1 至 80 個字元')).toBeVisible();
    await userEvent.type(
      screen.getByRole('textbox', { name: '班級名稱' }),
      '色彩一班',
    );
    await userEvent.click(screen.getByRole('button', { name: '建立班級' }));
    expect(screen.getByRole('button', { name: '建立中…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '建立中…' }));
    expect(createClassroom).toHaveBeenCalledOnce();
    resolve({
      classroomId: 'ca000000-0000-4000-8000-000000000001',
      classroomName: '色彩一班',
      joinCode: 'ABCD-1234-EF56-7890',
      joinCodeVersion: 1,
    });
    // 固定碼常駐於班級卡（owner 2026-07-27）：建立成功後鎖釋放、表單重置，
    // 不再彈一次性 receipt。
    expect(
      await screen.findByRole('button', { name: '建立班級' }),
    ).toBeEnabled();
  });

  it('shows the aggregate header stats and per-card membership pill/meta', async () => {
    renderPage(
      createRepository({
        listOwned: vi.fn().mockResolvedValue([
          {
            classroomId: 'ca000000-0000-4000-8000-000000000001',
            classroomName: '設計群 甲班',
            classroomStatus: 'active',
            createdAt: '2026-07-18T00:00:00.000Z',
            joinCode: 'ABCD-1234-EF56-7890',
            joinCodeVersion: 3,
            memberCount: 25,
          },
          {
            classroomId: 'ca000000-0000-4000-8000-000000000002',
            classroomName: '設計群 乙班',
            classroomStatus: 'active',
            createdAt: '2026-07-20T00:00:00.000Z',
            joinCode: 'ABCD-1234-EF56-7890',
            joinCodeVersion: 1,
            memberCount: 23,
          },
        ]),
      }),
    );
    await screen.findByText('25 位有效學生');
    expect(screen.getByText('班級數').nextElementSibling).toHaveTextContent(
      '2',
    );
    expect(screen.getByText('學生人數').nextElementSibling).toHaveTextContent(
      '48',
    );
    expect(screen.getByText('25 位有效學生')).toBeVisible();
    expect(screen.getAllByText('ABCD-1234-EF56-7890')[0]).toBeVisible();
    expect(
      screen.getByRole('button', { name: '複製 設計群 甲班 的班級序號' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: '設計群 甲班' })).toBeVisible();
  });

  it('keeps create errors adjacent and recovers on retry', async () => {
    const repository = createRepository({
      createClassroom: vi
        .fn()
        .mockRejectedValueOnce(new ClassroomRepositoryError('AMBIGUOUS_WRITE'))
        .mockResolvedValue({
          classroomId: 'ca000000-0000-4000-8000-000000000001',
          classroomName: '色彩一班',
          joinCode: 'ABCD-1234-EF56-7890',
          joinCodeVersion: 1,
        }),
    });
    renderPage(repository);
    await screen.findByRole('textbox', { name: '班級名稱' });
    await userEvent.type(
      screen.getByRole('textbox', { name: '班級名稱' }),
      '色彩一班',
    );
    await userEvent.click(screen.getByRole('button', { name: '建立班級' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '請先檢查班級列表',
    );
    // 重試成功後錯誤清除、鎖釋放（固定碼由班級卡常駐顯示，無 receipt）。
    await userEvent.click(screen.getByRole('button', { name: '建立班級' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
    expect(screen.getByRole('button', { name: '建立班級' })).toBeEnabled();
  });

  // 分頁批：wide 容量 6，需模擬 useStageWide 的 matchMedia 為 matches:true
  // （沿 rotate-banner.test.tsx stubMatchMedia 慣例；全域 setup 預設
  // matches:false 只覆蓋 narrow 情境）。
  function stubWideMatchMedia() {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        addEventListener: () => undefined,
        matches: true,
        media: query,
        removeEventListener: () => undefined,
      })),
    );
  }

  const sevenClassrooms = Array.from({ length: 7 }, (_, index) => ({
    classroomId: `ca000000-0000-4000-8000-00000000000${String(index + 1)}`,
    classroomName: `分頁班 ${String(index + 1)}`,
    classroomStatus: 'active' as const,
    createdAt: '2026-07-18T00:00:00.000Z',
    joinCode: 'ABCD-1234-EF56-7890',
    joinCodeVersion: 1,
    memberCount: 10,
  }));

  it('超過 6 班時顯示分頁器且第一頁只有 6 張卡', async () => {
    stubWideMatchMedia();
    try {
      renderPage(
        createRepository({
          listOwned: vi.fn().mockResolvedValue(sevenClassrooms),
        }),
      );
      await screen.findByText('第 1 / 2 頁');
      expect(
        screen.getByRole('button', { name: '下一頁' }),
      ).toBeInTheDocument();
      expect(
        screen
          .getAllByRole('heading', { level: 2 })
          .filter((heading) => heading.closest('.classroom-card')),
      ).toHaveLength(6);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // fix wave（owner 裁定）：GamePager 加 followTail，建班成功、owned 清單
  // refetch 多一筆後，新班級卡片所在的末頁要自動可見（不再被埋在最後一
  // 頁）。listOwned 用 mockResolvedValueOnce 模擬「建班前」與「建班後
  // invalidateQueries 觸發 refetch」兩種回應，貼近真實 mutation→refetch
  // 流程（見 use-classrooms.ts 的 useCreateClassroom onSuccess）。
  it('7 班溢出情境下建立第 8 班後，新卡片所在的末頁自動可見', async () => {
    stubWideMatchMedia();
    try {
      const eighthClassroom = {
        classroomId: 'ca000000-0000-4000-8000-000000000008',
        classroomName: '分頁班 8',
        classroomStatus: 'active' as const,
        createdAt: '2026-08-02T00:00:00.000Z',
        joinCode: 'ABCD-1234-EF56-7891',
        joinCodeVersion: 1,
      };
      const listOwned = vi
        .fn()
        .mockResolvedValueOnce(sevenClassrooms)
        .mockResolvedValue([
          ...sevenClassrooms,
          { ...eighthClassroom, memberCount: 0 },
        ]);
      const createClassroom = vi.fn().mockResolvedValue(eighthClassroom);
      renderPage(createRepository({ createClassroom, listOwned }));
      expect(await screen.findByText('第 1 / 2 頁')).toBeVisible();
      await userEvent.type(
        screen.getByRole('textbox', { name: '班級名稱' }),
        '分頁班 8',
      );
      await userEvent.click(screen.getByRole('button', { name: '建立班級' }));
      expect(
        await screen.findByRole('heading', { name: '分頁班 8' }),
      ).toBeVisible();
      expect(screen.getByText('第 2 / 2 頁')).toBeVisible();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
