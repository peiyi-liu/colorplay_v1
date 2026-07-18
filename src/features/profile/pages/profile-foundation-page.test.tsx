import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMyProfile, useSetReducedMotion } from '../hooks/use-my-profile';
import { ProfileRepositoryError } from '../types';
import { ProfileFoundationPage } from './profile-foundation-page';

vi.mock('../hooks/use-my-profile', () => ({
  useMyProfile: vi.fn(),
  useSetReducedMotion: vi.fn(),
}));

const mockedUseMyProfile = vi.mocked(useMyProfile);
const mockedUseSetReducedMotion = vi.mocked(useSetReducedMotion);
const setReducedMotionMutate = vi.fn();

describe('ProfileFoundationPage', () => {
  beforeEach(() => {
    mockedUseMyProfile.mockReset();
    setReducedMotionMutate.mockReset();
    mockedUseSetReducedMotion.mockReturnValue({
      isError: false,
      isPending: false,
      mutate: setReducedMotionMutate,
    } as unknown as ReturnType<typeof useSetReducedMotion>);
  });

  it('renders nested-safe loading while the profile query is pending', () => {
    mockedUseMyProfile.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isPending: true,
      refetch: vi.fn(),
    });

    render(<ProfileFoundationPage />);

    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders a safe inline error and retries on request', async () => {
    const refetch = vi.fn();
    mockedUseMyProfile.mockReturnValue({
      data: undefined,
      error: new ProfileRepositoryError('PROFILE_UNAVAILABLE'),
      isError: true,
      isPending: false,
      refetch,
    });

    render(<ProfileFoundationPage />);
    await userEvent.click(screen.getByRole('button', { name: '重試' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      '無法載入個人資料，請稍後重試。',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'PROFILE_UNAVAILABLE',
    );
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('renders the authoritative safe profile', () => {
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'student.one',
        id: 'student-one-id',
        role: 'student',
        timezone: 'Asia/Taipei',
        reducedMotion: false,
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });

    render(<ProfileFoundationPage />);

    expect(screen.getByRole('heading', { name: 'student.one' })).toBeVisible();
    expect(screen.getByText('角色：學生')).toBeVisible();
  });

  it('saves the reduced-motion preference through the trusted path', async () => {
    mockedUseMyProfile.mockReturnValue({
      data: {
        displayName: 'student.one',
        id: 'student-one-id',
        role: 'student',
        timezone: 'Asia/Taipei',
        reducedMotion: false,
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    });

    render(<ProfileFoundationPage />);
    await userEvent.click(screen.getByLabelText('減少動態效果'));

    expect(setReducedMotionMutate).toHaveBeenCalledWith(true);
  });
});
