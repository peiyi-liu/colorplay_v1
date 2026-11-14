import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type {
  ClassroomRepository,
  OwnedClassroom,
} from '../../classrooms/types';
import type { LiveActivity, LiveRepository, LiveSectionOption } from '../types';
import {
  createLiveClassroomSchema,
  TeacherLivePage,
} from './teacher-live-page';

const sectionFixture: LiveSectionOption = {
  sectionId: '26000000-0000-0000-0000-000000000010',
  title: '3-1 色彩三要素',
  quizTemplateId: '26000000-0000-0000-0000-000000000003',
};

const classroomFixture: OwnedClassroom = {
  classroomId: '18100000-0000-0000-0000-000000000001',
  classroomName: '色彩一班',
  classroomStatus: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  joinCode: null,
  joinCodeVersion: 1,
  memberCount: 3,
};

const activityFixture: LiveActivity = {
  activityId: '27000000-0000-0000-0000-000000000001',
  title: sectionFixture.title,
  quizTemplateId: sectionFixture.quizTemplateId,
  questionTimeLimitSeconds: 20,
  status: 'active',
  rulesVersion: 'v1',
  questionDisplay: 'screen_only',
  sectionId: sectionFixture.sectionId,
};

const sessionReceiptFixture = {
  sessionId: '28000000-0000-0000-0000-000000000001',
  state: 'lobby' as const,
  stateVersion: 1,
  joinCode: '123456',
  joinCodeVersion: 1,
};

const repositoryWith = (
  overrides: Partial<LiveRepository> = {},
): LiveRepository => ({
  advance: vi.fn(),
  cancel: vi.fn(),
  closeQuestion: vi.fn(),
  createActivity: vi.fn(),
  createSession: vi.fn(),
  finalize: vi.fn(),
  getDistribution: vi.fn(),
  getMyStanding: vi.fn(),
  getSessionDetail: vi.fn(),
  getStandings: vi.fn(),
  getState: vi.fn(),
  join: vi.fn(),
  listMyActivities: vi.fn().mockResolvedValue([]),
  listSectionOptions: vi.fn().mockResolvedValue([sectionFixture]),
  openQuestion: vi.fn(),
  pauseSession: vi.fn(),
  resumeSession: vi.fn(),
  rotateJoinCode: vi.fn(),
  startSession: vi.fn(),
  submitAnswer: vi.fn(),
  ...overrides,
});

const classroomRepositoryOf = (
  rows: readonly OwnedClassroom[],
): ClassroomRepository =>
  ({
    listOwned: vi.fn().mockResolvedValue(rows),
  }) as unknown as ClassroomRepository;

const renderPage = (
  repository: LiveRepository,
  classroomRepository: ClassroomRepository,
) => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return render(
    <TeacherLivePage
      classroomRepository={classroomRepository}
      menu={<div data-testid="teacher-menu" />}
      repository={repository}
    />,
    { wrapper: Wrapper },
  );
};

const selectSection = async () => {
  await userEvent.click(
    await screen.findByRole('radio', { name: sectionFixture.title }),
  );
};

describe('TeacherLivePage', () => {
  it('submits only once when two valid submit events arrive in the same turn', async () => {
    let finish!: (value: LiveActivity) => void;
    const createActivity = vi.fn(
      () =>
        new Promise<LiveActivity>((done) => {
          finish = done;
        }),
    );
    const createSession = vi.fn().mockResolvedValue(sessionReceiptFixture);
    const startSession = vi.fn().mockResolvedValue(undefined);
    renderPage(
      repositoryWith({ createActivity, createSession, startSession }),
      classroomRepositoryOf([classroomFixture]),
    );
    await selectSection();
    const form = screen.getByRole('form', { name: '建立 Live 課堂' });
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      await Promise.resolve();
    });
    expect(createActivity).toHaveBeenCalledTimes(1);
    finish(activityFixture);
    await waitFor(() => {
      expect(startSession).toHaveBeenCalledTimes(1);
    });
  });

  it('does not send a request when no classroom exists, even on a direct submit event', async () => {
    const repository = repositoryWith();
    renderPage(repository, classroomRepositoryOf([]));
    await selectSection();
    expect(screen.getByRole('button', { name: '建立課堂' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form', { name: '建立 Live 課堂' }));
    expect(await screen.findByText('請選擇班級')).toBeVisible();
    expect(repository.createActivity).not.toHaveBeenCalled();
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('does not send a request without a selected section', async () => {
    const repository = repositoryWith();
    renderPage(repository, classroomRepositoryOf([classroomFixture]));
    await screen.findByRole('radio', { name: sectionFixture.title });
    fireEvent.submit(screen.getByRole('form', { name: '建立 Live 課堂' }));
    expect(await screen.findByText('請選擇要對戰的單元')).toBeVisible();
    expect(screen.getByRole('button', { name: '建立課堂' })).toBeDisabled();
    expect(repository.createActivity).not.toHaveBeenCalled();
  });

  it('summarizes classroom, section and unchanged default seconds with one submit action', async () => {
    renderPage(repositoryWith(), classroomRepositoryOf([classroomFixture]));
    await selectSection();
    const form = within(screen.getByRole('form', { name: '建立 Live 課堂' }));
    expect(
      form.getAllByRole('definition').map((entry) => entry.textContent),
    ).toEqual([classroomFixture.classroomName, sectionFixture.title, '20 秒']);
    expect(form.getAllByRole('button', { name: '建立課堂' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: '建立課堂' })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  it.each(['5', '120'])(
    'preserves the existing valid schema boundary %s',
    (seconds) => {
      expect(
        createLiveClassroomSchema.safeParse({
          classroomId: classroomFixture.classroomId,
          sectionId: sectionFixture.sectionId,
          timeLimit: seconds,
        }).success,
      ).toBe(true);
    },
  );

  it.each(['4', '121', '20.5'])(
    'preserves schema rejection of invalid seconds %s',
    (seconds) => {
      expect(
        createLiveClassroomSchema.safeParse({
          classroomId: classroomFixture.classroomId,
          sectionId: sectionFixture.sectionId,
          timeLimit: seconds,
        }).success,
      ).toBe(false);
    },
  );

  it('updates the summary and submitted seconds using the existing time stepper', async () => {
    const createActivity = vi.fn().mockResolvedValue(activityFixture);
    renderPage(
      repositoryWith({
        createActivity,
        createSession: vi.fn().mockResolvedValue(sessionReceiptFixture),
        startSession: vi.fn().mockResolvedValue(undefined),
      }),
      classroomRepositoryOf([classroomFixture]),
    );
    await selectSection();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '減少每題作答時間' }));
    await user.click(screen.getByRole('button', { name: '減少每題作答時間' }));
    await user.click(screen.getByRole('button', { name: '減少每題作答時間' }));
    expect(
      screen.getByRole('button', { name: '減少每題作答時間' }),
    ).toBeDisabled();
    expect(
      screen.getAllByRole('definition').map((entry) => entry.textContent),
    ).toContain('5 秒');
    await user.click(screen.getByRole('button', { name: '建立課堂' }));
    await waitFor(() => {
      expect(createActivity).toHaveBeenCalledWith(
        expect.objectContaining({ questionTimeLimitSeconds: 5 }),
      );
    });
  });

  it('releases the submission guard after a failed create so the teacher can retry', async () => {
    const createActivity = vi
      .fn()
      .mockRejectedValue(new Error('synthetic-private-marker'));
    renderPage(
      repositoryWith({ createActivity }),
      classroomRepositoryOf([classroomFixture]),
    );
    await selectSection();
    await userEvent.click(screen.getByRole('button', { name: '建立課堂' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '目前無法建立活動，請稍後重試。',
    );
    await userEvent.click(screen.getByRole('button', { name: '建立課堂' }));
    expect(createActivity).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText(/synthetic-private-marker/),
    ).not.toBeInTheDocument();
  });

  it('renders the server-backed four-step Live classroom setup', async () => {
    renderPage(repositoryWith(), classroomRepositoryOf([classroomFixture]));

    expect(
      await screen.findByRole('heading', { name: '建立 Live 課堂' }),
    ).toBeVisible();
    expect(await screen.findByLabelText('1・選擇班級')).toHaveValue(
      classroomFixture.classroomId,
    );
    expect(screen.getByRole('group', { name: '選擇小節' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '每題作答時間' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: '4・建立課堂摘要' }),
    ).toBeVisible();
    expect(
      screen.getByRole('radio', { name: sectionFixture.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '建立課堂' })).toBeDisabled();
  });

  it('creates the activity then launches the session with the selected section payload', async () => {
    const createActivity = vi.fn().mockResolvedValue(activityFixture);
    const createSession = vi.fn().mockResolvedValue(sessionReceiptFixture);
    const startSession = vi.fn().mockResolvedValue(undefined);
    renderPage(
      repositoryWith({ createActivity, createSession, startSession }),
      classroomRepositoryOf([classroomFixture]),
    );

    await selectSection();
    await userEvent.click(screen.getByRole('button', { name: '建立課堂' }));

    await waitFor(() => {
      expect(createActivity).toHaveBeenCalledOnce();
    });
    expect(createActivity).toHaveBeenCalledWith({
      questionTimeLimitSeconds: 20,
      quizTemplateId: sectionFixture.quizTemplateId,
      sectionId: sectionFixture.sectionId,
      title: sectionFixture.title,
    });

    await waitFor(() => {
      expect(startSession).toHaveBeenCalledOnce();
    });
    expect(createSession).toHaveBeenCalledOnce();
    expect(createSession).toHaveBeenCalledWith({
      activityId: activityFixture.activityId,
      assignmentId: null,
      classroomId: classroomFixture.classroomId,
    });
    expect(startSession).toHaveBeenCalledWith(
      sessionReceiptFixture.sessionId,
      sessionReceiptFixture.stateVersion,
    );
  });

  it('disables the submit button while launching so a second click cannot duplicate the request', async () => {
    let resolveCreate!: (value: LiveActivity) => void;
    const createActivity = vi.fn(
      () => new Promise<LiveActivity>((done) => (resolveCreate = done)),
    );
    const createSession = vi.fn().mockResolvedValue(sessionReceiptFixture);
    const startSession = vi.fn().mockResolvedValue(undefined);
    renderPage(
      repositoryWith({ createActivity, createSession, startSession }),
      classroomRepositoryOf([classroomFixture]),
    );

    await selectSection();
    await userEvent.click(screen.getByRole('button', { name: '建立課堂' }));

    const pendingButton = await screen.findByRole('button', {
      name: '建立中…',
    });
    expect(pendingButton).toBeDisabled();
    // A disabled button ignores pointer events, so this click is the
    // duplicate-submission guard under test, not a no-op assertion.
    await userEvent.click(pendingButton);
    expect(createActivity).toHaveBeenCalledOnce();

    resolveCreate(activityFixture);
    await waitFor(() => {
      expect(startSession).toHaveBeenCalledOnce();
    });
  });
});
