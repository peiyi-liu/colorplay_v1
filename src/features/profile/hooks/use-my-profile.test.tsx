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

const authenticatedAs = (userId: string): AuthContextValue => ({
  ...authenticated,
  session: {
    email: `${userId}@colorplay.test`,
    userId,
  },
});

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

  it('refreshes the fixed own-profile query when the authenticated identity changes', async () => {
    const studentOne: SafeProfile = {
      displayName: 'student.one',
      id: 'student-one-id',
      role: 'student',
      timezone: 'Asia/Taipei',
    };
    const studentTwo: SafeProfile = {
      displayName: 'student.two',
      id: 'student-two-id',
      role: 'student',
      timezone: 'Asia/Taipei',
    };
    repositoryMocks.getMyProfile
      .mockResolvedValueOnce(studentOne)
      .mockResolvedValueOnce(studentTwo);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const authState = { current: authenticatedAs(studentOne.id) };
    function IdentityWrapper({ children }: Readonly<{ children: ReactNode }>) {
      return (
        <QueryClientProvider client={client}>
          <AuthContext.Provider value={authState.current}>
            {children}
          </AuthContext.Provider>
        </QueryClientProvider>
      );
    }

    const { rerender, result } = renderHook(() => useMyProfile(), {
      wrapper: IdentityWrapper,
    });
    await waitFor(() => {
      expect(result.current.data).toEqual(studentOne);
    });

    authState.current = authenticatedAs(studentTwo.id);
    rerender();

    expect(result.current.data).toBeUndefined();
    await waitFor(() => {
      expect(result.current.data).toEqual(studentTwo);
    });
    expect(repositoryMocks.getMyProfile).toHaveBeenCalledTimes(2);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    expect(client.getQueryCache().getAll()[0]?.queryKey).toEqual(
      myProfileQueryKey,
    );
  });
});
