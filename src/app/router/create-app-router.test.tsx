import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AuthRepository, AuthSession } from '../../features/auth/types';
import { AppProviders } from '../providers/app-providers';
import { createAppRouter } from './create-app-router';

const createRepository = (session: AuthSession | null): AuthRepository => ({
  getSession: vi.fn(() => Promise.resolve(session)),
  onAuthStateChange: vi.fn(() => vi.fn()),
  signIn: vi.fn(),
  signOut: vi.fn(),
});

const renderRouter = (path: string, session: AuthSession | null = null) => {
  window.history.replaceState({}, '', path);
  const router = createAppRouter();
  render(
    <AppProviders authRepository={createRepository(session)}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
};

describe('createAppRouter', () => {
  it.each([
    ['/', 'ColorPlay', '前往登入'],
    ['/unauthorized', '沒有權限', '返回登入'],
    ['/missing-route', '找不到頁面', '返回首頁'],
  ])('renders %s with one primary CTA', async (path, heading, actionLabel) => {
    renderRouter(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByRole('link', { name: actionLabel })).toHaveAttribute(
      'data-acceptance-target',
    );
    expect(
      document.querySelectorAll('[data-primary-action="true"]'),
    ).toHaveLength(1);
  });

  it('renders the accessible login form with one primary submit action', async () => {
    renderRouter('/login');

    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('密碼')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: '登入' })).toHaveAttribute(
      'type',
      'submit',
    );
    expect(
      document.querySelectorAll('[data-primary-action="true"]'),
    ).toHaveLength(1);
  });

  it('redirects anonymous /app access while retaining the full intended URL', async () => {
    const router = renderRouter('/app?chapter=color-theory#checkpoint');

    expect(await screen.findByRole('heading', { name: '登入' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({
      from: {
        hash: '#checkpoint',
        pathname: '/app',
        search: '?chapter=color-theory',
      },
    });
    expect(screen.queryByRole('heading', { name: '學習大廳' })).toBeNull();
  });

  it('renders /app for an authenticated repository session', async () => {
    renderRouter('/app', {
      email: 'learner@colorplay.invalid',
      userId: 'learner-id',
    });

    expect(
      await screen.findByRole('heading', { name: '學習大廳' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '開始探索課程' })).toHaveAttribute(
      'data-acceptance-target',
    );
  });
});
