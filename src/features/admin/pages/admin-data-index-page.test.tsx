import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AdminDataIndexPage } from './admin-data-index-page';

describe('AdminDataIndexPage', () => {
  it('makes all seven browser domains and their catalog resources discoverable', () => {
    render(
      <MemoryRouter>
        <AdminDataIndexPage />
      </MemoryRouter>,
    );

    for (const domain of [
      'assessments',
      'classrooms',
      'content',
      'learning',
      'live',
      'rewards',
      'users',
    ]) {
      expect(
        screen.getByRole('heading', { name: new RegExp(domain) }),
      ).toBeInTheDocument();
    }

    const users = screen.getByRole('region', { name: 'users' });
    expect(
      within(users).getByRole('link', { name: 'profiles' }),
    ).toHaveAttribute('href', '/admin/data/users/profiles');
  });
});
