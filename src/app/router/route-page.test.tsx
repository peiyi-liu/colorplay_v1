import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RoutePage } from './route-page';

describe('RoutePage', () => {
  it('renders its heading, supporting message, and one primary route CTA', () => {
    render(
      <MemoryRouter>
        <RoutePage {...routePageProps} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '登入' })).toBeVisible();
    expect(screen.getByText('使用個人 Email 進入 ColorPlay')).toBeVisible();
    const action = screen.getByRole('link', { name: '進入學習大廳' });
    expect(action).toHaveAttribute('href', '/app');
    expect(document.querySelectorAll('[data-acceptance-target]')).toHaveLength(
      1,
    );
    expect(
      action.closest('[data-interaction-group="foundation-route"]'),
    ).not.toBeNull();
  });
});

const routePageProps = {
  actionLabel: '進入學習大廳',
  actionTo: '/app',
  eyebrow: '學生入口',
  heading: '登入',
  message: '使用個人 Email 進入 ColorPlay',
};
