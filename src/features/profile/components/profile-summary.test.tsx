import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProfileSummary } from './profile-summary';

describe('ProfileSummary', () => {
  it('renders the safe display name and localized role without Email or extra fields', () => {
    render(
      <ProfileSummary
        profile={{
          displayName: 'student.one',
          id: 'student-one-id',
          role: 'student',
          timezone: 'Asia/Taipei',
          reducedMotion: false,
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'student.one' })).toBeVisible();
    expect(screen.getByText('角色：學生')).toBeVisible();
    expect(screen.queryByText(/email/iu)).toBeNull();
    expect(screen.queryByText('student-one-id')).toBeNull();
    expect(screen.queryByText('Asia/Taipei')).toBeNull();
  });
});
