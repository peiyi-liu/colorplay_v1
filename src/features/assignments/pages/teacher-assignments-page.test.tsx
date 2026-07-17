import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  type AssignmentRepository,
  AssignmentRepositoryError,
  type ClassroomAssignment,
} from '../types';
import { TeacherAssignmentsPage } from './teacher-assignments-page';

const CLASSROOM_ID = '14100000-0000-0000-0000-000000000001';

const assignmentRow: ClassroomAssignment = {
  assignmentId: '14300000-0000-0000-0000-000000000001',
  title: '第三章回家作業',
  activityType: 'quiz_template',
  status: 'draft',
  availableFrom: null,
  deadlineAt: '2026-07-24T16:00:00+00:00',
  attemptLimit: null,
  passingThreshold: 600,
  targetCount: 0,
  completedCount: 0,
  createdAt: '2026-07-17T01:00:00+00:00',
  updatedAt: '2026-07-17T01:00:00+00:00',
};

const repositoryWith = (
  overrides: Partial<AssignmentRepository>,
): AssignmentRepository => ({
  createAssignment: vi.fn(),
  listClassroom: vi.fn().mockResolvedValue([assignmentRow]),
  listMine: vi.fn().mockResolvedValue([]),
  startAttempt: vi.fn(),
  updateStatus: vi.fn(),
  ...overrides,
});

const renderPage = (repository: AssignmentRepository) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    <TeacherAssignmentsPage
      classroomId={CLASSROOM_ID}
      repository={repository}
    />,
    { wrapper },
  );
};

describe('TeacherAssignmentsPage', () => {
  it('shows a retryable owner error without leaking details', async () => {
    const listClassroom = vi
      .fn()
      .mockRejectedValue(new AssignmentRepositoryError('NOT_FOUND'));
    renderPage(repositoryWith({ listClassroom }));

    expect(
      await screen.findByText('無法載入作業資料，或你沒有管理權限。'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '重試' })).toBeVisible();
  });

  it('renders assignment rows with Taipei deadlines and counts', async () => {
    renderPage(repositoryWith({}));

    expect(await screen.findByText('第三章回家作業')).toBeVisible();
    expect(screen.getByText('草稿')).toBeVisible();
    expect(screen.getByText(/2026年7月25日/u)).toBeVisible();
    expect(screen.getByText('不限')).toBeVisible();
  });

  it('creates an assignment from validated form values', async () => {
    const createAssignment = vi.fn().mockResolvedValue({
      ...assignmentRow,
      assignmentId: '14300000-0000-0000-0000-000000000002',
      classroomId: CLASSROOM_ID,
    });
    renderPage(repositoryWith({ createAssignment }));
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('作業標題'), '新的色彩作業');
    await user.click(screen.getByRole('button', { name: '建立作業' }));

    await waitFor(() => {
      expect(createAssignment).toHaveBeenCalledTimes(1);
    });
    expect(createAssignment).toHaveBeenCalledWith({
      attemptLimit: null,
      availableFrom: null,
      classroomId: CLASSROOM_ID,
      deadlineAt: null,
      passingThreshold: 600,
      quizTemplateId: '26000000-0000-0000-0000-000000000003',
      title: '新的色彩作業',
    });
  });

  it('rejects an empty title before calling the repository', async () => {
    const createAssignment = vi.fn();
    renderPage(repositoryWith({ createAssignment }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '建立作業' }));

    expect(await screen.findByText('作業標題為 1 至 120 個字元')).toBeVisible();
    expect(createAssignment).not.toHaveBeenCalled();
  });

  it('publishes through an explicit confirmation with optimistic concurrency', async () => {
    const updateStatus = vi.fn().mockResolvedValue({
      assignmentId: assignmentRow.assignmentId,
      status: 'published',
      updatedAt: '2026-07-17T02:00:00+00:00',
    });
    renderPage(repositoryWith({ updateStatus }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '發佈' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '確認' }));

    await waitFor(() => {
      expect(updateStatus).toHaveBeenCalledWith({
        assignmentId: assignmentRow.assignmentId,
        expectedUpdatedAt: assignmentRow.updatedAt,
        status: 'published',
      });
    });
  });

  it('surfaces a stale-status conflict as a readable alert', async () => {
    const updateStatus = vi
      .fn()
      .mockRejectedValue(new AssignmentRepositoryError('STATUS_CONFLICT'));
    renderPage(repositoryWith({ updateStatus }));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '發佈' }));
    await user.click(screen.getByRole('button', { name: '確認' }));

    expect(
      await screen.findByText('作業狀態已被更新，請重新整理後再試。'),
    ).toBeVisible();
  });
});
