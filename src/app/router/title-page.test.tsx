import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TitlePage } from './title-page';

describe('TitlePage', () => {
  it('以世界入口呈現註冊主行動與既有帳號登入路徑', () => {
    render(
      <MemoryRouter>
        <TitlePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'ColorPlay' })).toBeVisible();
    expect(screen.getByText('色彩王國的冒險旅程')).toBeVisible();

    const start = screen.getByRole('link', { name: '開始冒險' });
    expect(start).toHaveAttribute('href', '/register');
    expect(start).toHaveAttribute('data-primary-action', 'true');

    const login = screen.getByRole('link', { name: '已有帳號？登入' });
    expect(login).toHaveAttribute('href', '/login');
    expect(login).not.toHaveAttribute('data-primary-action');
  });
});
