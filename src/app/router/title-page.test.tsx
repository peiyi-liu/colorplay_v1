import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TitlePage } from './title-page';

describe('TitlePage', () => {
  it('顯示 ColorPlay 標題與 PRESS START 進入登入頁', () => {
    render(
      <MemoryRouter>
        <TitlePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'ColorPlay' })).toBeVisible();
    const start = screen.getByRole('link', { name: 'PRESS START' });
    expect(start).toHaveAttribute('href', '/login');
    expect(start).toHaveAttribute('data-primary-action', 'true');
  });
});
