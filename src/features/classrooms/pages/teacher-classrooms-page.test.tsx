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
  return render(<TeacherClassroomsPage repository={repository} />, {
    wrapper: Wrapper,
  });
};

describe('TeacherClassroomsPage', () => {
  it('shows loading then a truthful empty state', async () => {
    let resolve!: (value: readonly []) => void;
    renderPage(
      createRepository({
        listOwned: () => new Promise((done) => (resolve = done)),
      }),
    );
    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
    resolve([]);
    expect(await screen.findByText('尚未建立班級。')).toBeVisible();
  });

  it('validates 1–80 characters and locks one create request', async () => {
    let resolve!: (value: ClassroomCodeReceipt) => void;
    const createClassroom = vi.fn(
      () => new Promise<ClassroomCodeReceipt>((done) => (resolve = done)),
    );
    renderPage(createRepository({ createClassroom }));
    await screen.findByRole('heading', { name: '班級管理' });
    await userEvent.click(screen.getByRole('button', { name: '建立班級' }));
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
    expect(await screen.findByText('ABCD-1234-EF56-7890')).toBeVisible();
  });

  it('keeps create errors adjacent and discards the receipt on dismiss/remount', async () => {
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
    const view = renderPage(repository);
    await screen.findByRole('heading', { name: '班級管理' });
    await userEvent.type(
      screen.getByRole('textbox', { name: '班級名稱' }),
      '色彩一班',
    );
    await userEvent.click(screen.getByRole('button', { name: '建立班級' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '請先檢查班級列表',
    );
    await userEvent.click(screen.getByRole('button', { name: '建立班級' }));
    expect(await screen.findByText('ABCD-1234-EF56-7890')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: '我已保存，關閉' }),
    );
    expect(screen.queryByText('ABCD-1234-EF56-7890')).toBeNull();
    view.unmount();
    renderPage(repository);
    await waitFor(() => {
      expect(screen.queryByText('ABCD-1234-EF56-7890')).toBeNull();
    });
  });
});
