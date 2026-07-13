import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './create-app-router';

describe('createAppRouter', () => {
  it.each([
    ['/', 'ColorPlay', '前往登入'],
    ['/login', '登入', '進入學習大廳'],
    ['/app', '學習大廳', '開始探索課程'],
    ['/unauthorized', '沒有權限', '返回登入'],
    ['/missing-route', '找不到頁面', '返回首頁'],
  ])('renders %s with one primary CTA', async (path, heading, actionLabel) => {
    window.history.replaceState({}, '', path);
    render(<RouterProvider router={createAppRouter()} />);
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByRole('link', { name: actionLabel })).toHaveAttribute(
      'data-acceptance-target',
    );
    expect(
      document.querySelectorAll('[data-primary-action="true"]'),
    ).toHaveLength(1);
  });
});
