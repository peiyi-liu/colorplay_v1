import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AchievementCatalogItem } from '../types';
import { AchievementCard } from './achievement-card';

const item = (
  overrides: Partial<AchievementCatalogItem>,
): AchievementCatalogItem => ({
  badgeKey: 'first_task_complete',
  description: '完成第一次正式挑戰',
  displayName: '初出茅廬',
  progress: 0,
  stableCode: 'first_task_complete',
  state: 'not_started',
  target: 1,
  unlockedAt: null,
  ...overrides,
});

describe('AchievementCard', () => {
  it('shows an unlocked text state and Asia/Taipei date', () => {
    render(
      <AchievementCard
        item={item({
          progress: 1,
          state: 'unlocked',
          unlockedAt: '2026-07-15T16:30:00.000Z',
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: '初出茅廬' })).toBeVisible();
    expect(screen.getByText('完成第一次正式挑戰')).toBeVisible();
    expect(screen.getByText('已獲得')).toBeVisible();
    expect(screen.getByText(/2026年7月16日/u)).toBeVisible();
  });

  it('shows semantic and textual in-progress state', () => {
    render(
      <AchievementCard
        item={item({
          description: '達到 Level 10',
          displayName: '登峰造極',
          progress: 3,
          stableCode: 'level_10',
          state: 'in_progress',
          target: 10,
        })}
      />,
    );

    expect(screen.getByText('進度')).toBeVisible();
    expect(screen.getByText('3 / 10')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '3',
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuemax',
      '10',
    );
  });

  it('shows truthful deferred state without fabricated progress or action', () => {
    render(
      <AchievementCard
        item={item({
          description: '完成 5 場 ColorPlay Live',
          displayName: '課堂挑戰者',
          progress: null,
          stableCode: 'live_complete_5',
          state: 'not_started',
          target: null,
        })}
      />,
    );

    expect(screen.getByText('—')).toBeVisible();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/%/u)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
