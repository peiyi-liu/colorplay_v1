import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthContext,
  type AuthContextValue,
} from '../../auth/context/auth-context';
import { ProfileRepositoryError, type SafeProfile } from '../types';
import { myProfileQueryKey, useMyProfile } from './use-my-profile';

const repositoryMocks = vi.hoisted(() => ({
  getMyProfile: vi.fn<() => Promise<SafeProfile>>(),
}));

vi.mock('../../../lib/config/public-env', () => ({
  parsePublicEnv: vi.fn(() => ({})),
}));
vi.mock('../../../lib/supabase/browser-client', () => ({
  getBrowserSupabaseClient: vi.fn(() => ({})),
}));
vi.mock('../api/profile-repository', () => ({
  createProfileRepository: vi.fn(() => repositoryMocks),
}));

const authenticated: AuthContextValue = {
  session: {
    email: 'student.one@colorplay.test',
    userId: 'student-one-id',
  },
  signIn: vi.fn(),
  signOut: vi.fn(),
  status: 'authenticated',
};

const createWrapper = (client: QueryClient) =>
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={authenticated}>
          {children}
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  };

describe('useMyProfile', () => {
  beforeEach(() => {
    repositoryMocks.getMyProfile.mockReset();
  });

  it('stores the authoritative profile under the fixed own-profile query key', async () => {
    const profile: SafeProfile = {
      displayName: 'student.one',
      id: 'student-one-id',
      role: 'student',
      timezone: 'Asia/Taipei',
    };
    repositoryMocks.getMyProfile.mockResolvedValue(profile);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useMyProfile(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.data).toEqual(profile);
    });

    expect(client.getQueryData(myProfileQueryKey)).toEqual(profile);
  });

  it('does not retry an authorization failure', async () => {
    repositoryMocks.getMyProfile.mockRejectedValue(
      new ProfileRepositoryError('PROFILE_AUTHORIZATION'),
    );
    const client = new QueryClient();

    const { result } = renderHook(() => useMyProfile(), {
      wrapper: createWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(repositoryMocks.getMyProfile).toHaveBeenCalledOnce();
  });
});
