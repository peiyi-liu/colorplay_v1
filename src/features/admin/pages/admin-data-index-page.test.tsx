import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AdminDataIndexPage } from './admin-data-index-page';
describe('AdminDataIndexPage', () => {
  it('finds records by Chinese purpose while preserving safe catalog routes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminDataIndexPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: '資料查核' }),
    ).toBeInTheDocument();
    for (const name of [
      '教學內容',
      '學習與評量',
      '班級與 Live',
      '獎勵與收藏',
      '帳號資料',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    await user.type(screen.getByRole('searchbox'), '錯題');
    expect(screen.getByRole('link', { name: /錯題紀錄/ })).toHaveAttribute(
      'href',
      '/admin/data/learning/mistake_items',
    );
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'profiles');
    expect(screen.getByRole('link', { name: /帳號基本資料/ })).toHaveAttribute(
      'href',
      '/admin/data/users/profiles',
    );
  });
});
