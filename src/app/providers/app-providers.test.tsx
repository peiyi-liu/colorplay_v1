import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../features/auth/context/auth-context';
import type { AuthRepository } from '../../features/auth/types';
import { AppProviders } from './app-providers';
import { queryClient } from './query-client';

const createAnonymousRepository = () => {
  const getSession = vi.fn(() => Promise.resolve(null));
  const onAuthStateChange = vi.fn(() => vi.fn());
  const repository: AuthRepository = {
    getSession,
    onAuthStateChange,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };

  return { getSession, onAuthStateChange, repository } as const;
};

function QueryClientProbe() {
  const providedQueryClient = useQueryClient();
  return (
    <output>
      {providedQueryClient === queryClient ? 'shared' : 'different'}
    </output>
  );
}

function AuthProbe() {
  const auth = useAuth();
  return <output aria-label="Auth 狀態">{auth.status}</output>;
}

describe('AppProviders', () => {
  it('provides the shared application QueryClient', () => {
    const { repository } = createAnonymousRepository();
    render(
      <AppProviders authRepository={repository}>
        <QueryClientProbe />
      </AppProviders>,
    );
    expect(screen.getByText('shared')).toBeVisible();
  });

  it('bootstraps Auth from the explicitly injected repository', async () => {
    const { getSession, onAuthStateChange, repository } =
      createAnonymousRepository();

    render(
      <AppProviders authRepository={repository}>
        <AuthProbe />
      </AppProviders>,
    );

    expect(await screen.findByText('anonymous')).toBeVisible();
    expect(onAuthStateChange).toHaveBeenCalledOnce();
    expect(getSession).toHaveBeenCalledOnce();
  });
});
