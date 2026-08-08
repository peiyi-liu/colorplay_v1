import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { useMyProfile } from '../../profile/hooks/use-my-profile';
import { RequireAdminIdentity } from './require-admin-identity';

vi.mock('../../profile/hooks/use-my-profile', () => ({
  useMyProfile: vi.fn(),
}));

function renderWithProfile(profile: {
  data?: { role: string } | undefined;
  isPending: boolean;
}) {
  vi.mocked(useMyProfile).mockReturnValue(
    profile as unknown as ReturnType<typeof useMyProfile>,
  );
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route element={<RequireAdminIdentity />}>
          <Route element={<p>admin 首頁</p>} path="/admin" />
        </Route>
        <Route element={<p>未授權頁</p>} path="/unauthorized" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAdminIdentity', () => {
  it('renders the outlet for an admin profile', () => {
    renderWithProfile({ data: { role: 'admin' }, isPending: false });
    expect(screen.getByText('admin 首頁')).toBeInTheDocument();
  });

  it('sends non-admin roles to the unauthorized page', () => {
    renderWithProfile({ data: { role: 'teacher' }, isPending: false });
    expect(screen.getByText('未授權頁')).toBeInTheDocument();
  });

  it('shows the route loading state while the profile is pending', () => {
    renderWithProfile({ data: undefined, isPending: true });
    expect(screen.getByRole('status', { name: '頁面載入中' })).toBeVisible();
  });
});
