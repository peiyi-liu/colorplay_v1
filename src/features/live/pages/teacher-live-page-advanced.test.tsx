import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  renderWith,
  repositoryWith,
  SESSION_ID,
} from './live-pages.test-fixtures';
import { TeacherLivePage } from './teacher-live-page';

describe('TeacherLivePage (advanced)', () => {
  const activity = {
    activityId: '18300000-0000-0000-0000-000000000001',
    title: '色彩快問快答',
    quizTemplateId: '26000000-0000-0000-0000-000000000003',
    questionTimeLimitSeconds: 20,
    status: 'active' as const,
    rulesVersion: '2026-07-live-1',
    questionDisplay: 'screen_only' as const,
  };

  it('creates a section activity and launches straight into the presenter', async () => {
    const createActivity = vi.fn().mockResolvedValue({
      ...activity,
      sectionId: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
      title: '3-1 色彩三要素與色名的表示',
    });
    const createSession = vi.fn().mockResolvedValue({
      sessionId: SESSION_ID,
      state: 'draft',
      stateVersion: 1,
      joinCode: '654321',
      joinCodeVersion: 1,
    });
    const startSession = vi.fn().mockResolvedValue(undefined);
    const repository = repositoryWith({
      createActivity,
      createSession,
      startSession,
    });
    renderWith(
      <TeacherLivePage menu={<div data-testid="teacher-menu" />} repository={repository} />,
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('radio', {
        name: '3-1 色彩三要素與色名的表示',
      }),
    );
    await user.click(screen.getByRole('button', { name: '建立課堂' }));

    expect(await screen.findByText('已進入主持台')).toBeVisible();
    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: 'cd732278-0bfe-1293-19e1-338db3fe6a3c',
        title: '3-1 色彩三要素與色名的表示',
        quizTemplateId: '26000000-0000-0000-0000-000000000003',
      }),
    );
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        classroomId: '18100000-0000-0000-0000-000000000001',
      }),
    );
    expect(startSession).toHaveBeenCalledWith(SESSION_ID, 1);
  });

  it('hides the activity history table — the page only creates new activities (owner 2026-07-23)', async () => {
    const repository = repositoryWith({
      listMyActivities: vi.fn().mockResolvedValue([activity]),
    });
    renderWith(
      <TeacherLivePage menu={<div data-testid="teacher-menu" />} repository={repository} />,
    );

    expect(
      await screen.findByRole('heading', { name: '建立 Live 課堂' }),
    ).toBeVisible();
    expect(screen.queryByText('我的 Live 活動')).toBeNull();
    expect(screen.queryByRole('button', { name: '開新場次' })).toBeNull();
  });

  it('restores the real classroom selector without reviving mode, schedule, or display controls', async () => {
    renderWith(
      <TeacherLivePage
        menu={<div data-testid="teacher-menu" />}
        repository={repositoryWith({})}
      />,
    );

    expect(await screen.findByLabelText('1・選擇班級')).toBeVisible();
    expect(
      screen.getByRole('radio', {
        name: '3-1 色彩三要素與色名的表示',
      }),
    ).toBeVisible();
    expect(screen.queryByLabelText('對戰模式')).toBeNull();
    expect(screen.queryByLabelText('題目顯示位置')).toBeNull();
    expect(screen.queryByText(/即將進行/u)).toBeNull();
  });
});
