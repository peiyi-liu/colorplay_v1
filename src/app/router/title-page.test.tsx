import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TitlePage } from './title-page';

describe('TitlePage', () => {
  it('以唯一主行動帶冒險者前往登入公會', () => {
    render(
      <MemoryRouter>
        <TitlePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'ColorPlay' })).toBeVisible();
    expect(screen.getByText('色彩王國的冒險旅程')).toBeVisible();

    const start = screen.getByRole('link', { name: '開始冒險' });
    expect(start).toHaveAttribute('href', '/login');
    expect(start).toHaveAttribute('data-primary-action', 'true');
    expect(
      screen.queryByRole('link', { name: '已有帳號？登入' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'ColorPlay 藍金寶典' }),
    ).toHaveAttribute('src', '/colorplay-grimoire-pixel.png');
  });
});
