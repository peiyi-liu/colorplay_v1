import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  type AssignmentRepository,
  AssignmentRepositoryError,
  type StudentAssignment,
} from '../types';
import { StudentAssignmentDetailPage } from './student-assignment-detail-page';
import { StudentAssignmentsPage } from './student-assignments-page';

const assignment: StudentAssignment = {
  assignmentId: '14300000-0000-0000-0000-000000000001',
  classroomId: '14100000-0000-0000-0000-000000000001',
  classroomName: '三年一班',
  title: '第三章回家作業',
  status: 'published',
  availableFrom: null,
  deadlineAt: '2026-07-24T16:00:00+00:00',
  attemptLimit: 2,
  passingThreshold: 600,
  attemptsUsed: 1,
  latestAttemptStatus: 'completed',
  latestPassed: true,
};

const repositoryWith = (
  overrides: Partial<AssignmentRepository>,
): AssignmentRepository => ({
  createAssignment: vi.fn(),
  listClassroom: vi.fn().mockResolvedValue([]),
  listMine: vi.fn().mockResolvedValue([assignment]),
  startAttempt: vi.fn(),
  updateStatus: vi.fn(),
  ...overrides,
});

const renderWith = (_repository: AssignmentRepository, element: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/current']}>
        <Routes>
          <Route element={element} path="/current" />
          <Route element={<p>已進入測驗頁</p>} path="/app/quiz/:sessionId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('StudentAssignmentsPage', () => {
  it('lists targeted assignments with Taipei deadline and server outcome', async () => {
    renderWith(
      repositoryWith({}),
      <StudentAssignmentsPage repository={repositoryWith({})} />,
    );

    expect(
      await screen.findByRole('link', { name: '第三章回家作業' }),
    ).toHaveAttribute('href', `/app/assignments/${assignment.assignmentId}`);
    expect(screen.getByText(/2026年7月25日/u)).toBeVisible();
    expect(screen.getByText(/次數 1 \/ 2・已通過/u)).toBeVisible();
  });

  it('shows the empty state without inventing rows', async () => {
    const repository = repositoryWith({
      listMine: vi.fn().mockResolvedValue([]),
    });
    renderWith(repository, <StudentAssignmentsPage repository={repository} />);

    expect(await screen.findByText('目前沒有作業。')).toBeVisible();
  });
});

describe('StudentAssignmentDetailPage', () => {
  it('starts an attempt with one stable request id and enters the quiz runner', async () => {
    const startAttempt = vi.fn().mockResolvedValue({
      attemptId: '14400000-0000-0000-0000-000000000002',
      assignmentId: assignment.assignmentId,
      attemptNumber: 2,
      sessionId: '14500000-0000-0000-0000-000000000002',
    });
    const repository = repositoryWith({ startAttempt });
    renderWith(
      repository,
      <StudentAssignmentDetailPage
        assignmentId={assignment.assignmentId}
        repository={repository}
      />,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '開始作答' }));

    expect(await screen.findByText('已進入測驗頁')).toBeVisible();
    expect(startAttempt).toHaveBeenCalledTimes(1);
    const requestId = (startAttempt.mock.calls[0]?.[0] as { requestId: string })
      .requestId;
    expect(requestId).toMatch(/[0-9a-f-]{36}/u);
  });

  it('disables start with a truthful reason when attempts are exhausted', async () => {
    const exhausted: StudentAssignment = {
      ...assignment,
      attemptsUsed: 2,
    };
    const repository = repositoryWith({
      listMine: vi.fn().mockResolvedValue([exhausted]),
    });
    renderWith(
      repository,
      <StudentAssignmentDetailPage
        assignmentId={assignment.assignmentId}
        repository={repository}
      />,
    );

    expect(await screen.findByText('已用完作答次數。')).toBeVisible();
    expect(screen.getByRole('button', { name: '開始作答' })).toBeDisabled();
  });

  it('surfaces a server denial as a readable alert', async () => {
    const startAttempt = vi
      .fn()
      .mockRejectedValue(new AssignmentRepositoryError('DEADLINE_PASSED'));
    const repository = repositoryWith({ startAttempt });
    renderWith(
      repository,
      <StudentAssignmentDetailPage
        assignmentId={assignment.assignmentId}
        repository={repository}
      />,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '開始作答' }));

    expect(await screen.findByText('已超過截止時間。')).toBeVisible();
  });

  it('renders a safe not-found state for foreign assignments', async () => {
    const repository = repositoryWith({
      listMine: vi.fn().mockResolvedValue([]),
    });
    renderWith(
      repository,
      <StudentAssignmentDetailPage
        assignmentId={assignment.assignmentId}
        repository={repository}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('找不到這份作業，或你不是作業對象。'),
      ).toBeVisible();
    });
  });
});
