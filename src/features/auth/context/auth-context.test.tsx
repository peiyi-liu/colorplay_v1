import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { AuthRepository, AuthSession, AuthStateListener } from '../types';
import { AuthBootstrap } from '../components/auth-bootstrap';
import { AuthContext, type AuthContextValue, useAuth } from './auth-context';

const authenticatedSession = {
  email: 'learner@colorplay.invalid',
  userId: 'learner-id',
} as const;

const replacementSession = {
  email: 'replacement@colorplay.invalid',
  userId: 'replacement-id',
} as const;

const createDeferred = <Value,>() => {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });

  return { promise, reject, resolve } as const;
};

const createRepositoryHarness = (
  initialSession: Promise<AuthSession | null> = Promise.resolve(null),
) => {
  let listener: AuthStateListener | undefined;
  const unsubscribe = vi.fn();
  const getSession = vi.fn(() => initialSession);
  const onAuthStateChange = vi.fn((nextListener: AuthStateListener) => {
    listener = nextListener;
    return unsubscribe;
  });
  const signIn = vi.fn((): Promise<AuthSession> =>
    Promise.resolve(authenticatedSession),
  );
  const signOut = vi.fn(() => Promise.resolve());
  const repository: AuthRepository = {
    getSession,
    onAuthStateChange,
    signIn,
    signInWithAccount: vi.fn((): Promise<AuthSession> =>
      Promise.resolve(authenticatedSession),
    ),
    signOut,
  };

  return {
    emit(session: AuthSession | null) {
      listener?.(session);
    },
    getSession,
    onAuthStateChange,
    repository,
    signIn,
    signOut,
    unsubscribe,
  } as const;
};

function AuthProbe() {
  const auth = useAuth();
  const [operationResult, setOperationResult] = useState('idle');
  return (
    <section>
      <output aria-label="Auth 狀態">{auth.status}</output>
      <output aria-label="Auth session">{auth.session?.email ?? 'none'}</output>
      <output aria-label="Auth keys">
        {Object.keys(auth).sort().join(',')}
      </output>
      <output aria-label="Auth operation">{operationResult}</output>
      <button
        onClick={() => {
          void auth
            .signIn({
              email: 'learner@colorplay.invalid',
              password: 'fixture-password',
            })
            .then(
              () => {
                setOperationResult('resolved');
              },
              () => {
                setOperationResult('rejected');
              },
            );
        }}
        type="button"
      >
        sign in
      </button>
      <button
        onClick={() => {
          void auth.signOut().then(
            () => {
              setOperationResult('resolved');
            },
            () => {
              setOperationResult('rejected');
            },
          );
        }}
        type="button"
      >
        sign out
      </button>
    </section>
  );
}

function renderBootstrap(
  repository: AuthRepository,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <AuthBootstrap repository={repository}>
          <AuthProbe />
        </AuthBootstrap>
      </QueryClientProvider>,
    ),
    queryClient,
  };
}

describe('Auth context', () => {
  it('throws a stable safe error when useAuth is outside its provider', () => {
    expect(() => render(<AuthProbe />)).toThrow('AUTH_CONTEXT_MISSING');
  });

  it('exposes only the exact public AuthContextValue fields', () => {
    const value: AuthContextValue = {
      session: null,
      signIn: () => Promise.resolve(),
      signInWithAccount: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
      status: 'anonymous',
    };

    render(
      <AuthContext.Provider value={value}>
        <AuthProbe />
      </AuthContext.Provider>,
    );

    expect(screen.getByLabelText('Auth keys')).toHaveTextContent(
      'session,signIn,signInWithAccount,signOut,status',
    );
  });
});

describe('AuthBootstrap', () => {
  it('exposes loading until the initial session resolves', async () => {
    const initial = createDeferred<AuthSession | null>();
    const { repository } = createRepositoryHarness(initial.promise);

    renderBootstrap(repository);

    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('loading');
    expect(screen.getByLabelText('Auth session')).toHaveTextContent('none');

    await act(async () => {
      initial.resolve(null);
      await initial.promise;
    });

    expect(await screen.findByText('anonymous')).toBeVisible();
  });

  it('keeps an immediately resolved bootstrap visible for one short evidence window', async () => {
    vi.useFakeTimers();
    const { repository } = createRepositoryHarness(Promise.resolve(null));
    const view = renderBootstrap(repository);

    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('loading');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(99);
      });
      expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('loading');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('anonymous');
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('subscribes once per mount and cleans up that subscription', async () => {
    const { onAuthStateChange, repository, unsubscribe } =
      createRepositoryHarness();

    const view = renderBootstrap(repository);
    await screen.findByText('anonymous');

    expect(onAuthStateChange).toHaveBeenCalledOnce();

    view.unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('restores an authenticated initial session', async () => {
    const { repository } = createRepositoryHarness(
      Promise.resolve(authenticatedSession),
    );

    renderBootstrap(repository);

    expect(await screen.findByText('authenticated')).toBeVisible();
    expect(screen.getByLabelText('Auth session')).toHaveTextContent(
      authenticatedSession.email,
    );
  });

  it('does not let a late bootstrap result overwrite a newer Auth event', async () => {
    const initial = createDeferred<AuthSession | null>();
    const harness = createRepositoryHarness(initial.promise);

    renderBootstrap(harness.repository);

    act(() => {
      harness.emit(replacementSession);
    });
    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('loading');
    expect(await screen.findByText(replacementSession.email)).toBeVisible();
    expect(screen.getByLabelText('Auth session')).toHaveTextContent(
      replacementSession.email,
    );

    await act(async () => {
      initial.resolve(authenticatedSession);
      await initial.promise;
    });

    expect(screen.getByLabelText('Auth session')).toHaveTextContent(
      replacementSession.email,
    );
  });

  it('settles safely as anonymous when initial session recovery rejects', async () => {
    const initial = createDeferred<AuthSession | null>();
    const { repository } = createRepositoryHarness(initial.promise);

    renderBootstrap(repository);

    await act(async () => {
      initial.reject(new Error('raw-provider-detail'));
      await expect(initial.promise).rejects.toThrow('raw-provider-detail');
    });

    expect(await screen.findByText('anonymous')).toBeVisible();
    expect(screen.getByLabelText('Auth session')).toHaveTextContent('none');
  });

  it('uses a newer Auth event when bootstrap recovery later rejects', async () => {
    const initial = createDeferred<AuthSession | null>();
    const harness = createRepositoryHarness(initial.promise);

    renderBootstrap(harness.repository);

    act(() => {
      harness.emit(replacementSession);
    });

    await act(async () => {
      initial.reject(new Error('raw-provider-detail'));
      await expect(initial.promise).rejects.toThrow('raw-provider-detail');
    });

    expect(await screen.findByText('authenticated')).toBeVisible();
    expect(screen.getByLabelText('Auth session')).toHaveTextContent(
      replacementSession.email,
    );
  });

  it('updates to authenticated only after signIn succeeds', async () => {
    const deferredSignIn = createDeferred<AuthSession>();
    const harness = createRepositoryHarness();
    harness.signIn.mockReturnValueOnce(deferredSignIn.promise);

    renderBootstrap(harness.repository);
    await screen.findByText('anonymous');

    screen.getByRole('button', { name: 'sign in' }).click();
    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('anonymous');

    await act(async () => {
      deferredSignIn.resolve(authenticatedSession);
      await deferredSignIn.promise;
    });

    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent(
      'authenticated',
    );
    expect(screen.getByLabelText('Auth session')).toHaveTextContent(
      authenticatedSession.email,
    );
  });

  it('preserves anonymous state when signIn rejects', async () => {
    const harness = createRepositoryHarness();
    harness.signIn.mockRejectedValueOnce(new Error('raw-provider-detail'));

    renderBootstrap(harness.repository);
    await screen.findByText('anonymous');

    screen.getByRole('button', { name: 'sign in' }).click();

    expect(await screen.findByText('rejected')).toBeVisible();
    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('anonymous');
    expect(screen.getByLabelText('Auth session')).toHaveTextContent('none');
  });

  it('updates to anonymous only after signOut succeeds', async () => {
    const deferredSignOut = createDeferred<undefined>();
    const harness = createRepositoryHarness(
      Promise.resolve(authenticatedSession),
    );
    harness.signOut.mockReturnValueOnce(deferredSignOut.promise);

    const view = renderBootstrap(harness.repository);
    await screen.findByText('authenticated');
    view.queryClient.setQueryData(['profile', 'me'], {
      displayName: 'student.one',
    });
    view.queryClient.setQueryData(['economy', 'summary'], {
      tokenBalance: 250,
    });
    view.queryClient.setQueryData(['inventory', 'blooks'], { items: [] });
    view.queryClient.setQueryData(['quiz', 'session', 'session-id'], {
      totalScore: 1_000,
    });
    view.queryClient.setQueryData(['catalog', 'public'], 'retained');
    const cancelQueries = vi.spyOn(view.queryClient, 'cancelQueries');
    const removeQueries = vi.spyOn(view.queryClient, 'removeQueries');

    screen.getByRole('button', { name: 'sign out' }).click();
    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent(
      'authenticated',
    );

    await act(async () => {
      deferredSignOut.resolve(undefined);
      await deferredSignOut.promise;
    });

    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('anonymous');
    expect(screen.getByLabelText('Auth session')).toHaveTextContent('none');
    expect(view.queryClient.getQueryData(['profile', 'me'])).toBeUndefined();
    expect(
      view.queryClient.getQueryData(['economy', 'summary']),
    ).toBeUndefined();
    expect(
      view.queryClient.getQueryData(['inventory', 'blooks']),
    ).toBeUndefined();
    expect(
      view.queryClient.getQueryData(['quiz', 'session', 'session-id']),
    ).toBeUndefined();
    expect(view.queryClient.getQueryData(['catalog', 'public'])).toBe(
      'retained',
    );
    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(removeQueries).toHaveBeenCalledOnce();
    expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      removeQueries.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('cancels an in-flight user-scoped query so it cannot repopulate after signOut', async () => {
    const profileRequest = createDeferred<{ displayName: string }>();
    const harness = createRepositoryHarness(
      Promise.resolve(authenticatedSession),
    );
    const view = renderBootstrap(harness.repository);
    await screen.findByText('authenticated');
    const pendingProfile = view.queryClient
      .fetchQuery({
        queryFn: () => profileRequest.promise,
        queryKey: ['profile', 'me'],
      })
      .catch(() => undefined);

    screen.getByRole('button', { name: 'sign out' }).click();
    expect(await screen.findByText('resolved')).toBeVisible();

    profileRequest.resolve({ displayName: 'student.one' });
    await pendingProfile;
    expect(view.queryClient.getQueryData(['profile', 'me'])).toBeUndefined();
  });

  it('clears user-scoped data when the provider reports an external signOut', async () => {
    const harness = createRepositoryHarness(
      Promise.resolve(authenticatedSession),
    );
    const view = renderBootstrap(harness.repository);
    await screen.findByText('authenticated');
    view.queryClient.setQueryData(['economy', 'summary'], {
      tokenBalance: 250,
    });

    act(() => {
      harness.emit(null);
    });

    expect(await screen.findByText('anonymous')).toBeVisible();
    expect(
      view.queryClient.getQueryData(['economy', 'summary']),
    ).toBeUndefined();
  });

  it('clears user-scoped data before exposing a different provider account', async () => {
    const harness = createRepositoryHarness(
      Promise.resolve(authenticatedSession),
    );
    const view = renderBootstrap(harness.repository);
    await screen.findByText(authenticatedSession.email);
    view.queryClient.setQueryData(['inventory', 'blooks'], {
      items: ['private-item'],
    });

    act(() => {
      harness.emit(replacementSession);
    });

    expect(await screen.findByText(replacementSession.email)).toBeVisible();
    expect(
      view.queryClient.getQueryData(['inventory', 'blooks']),
    ).toBeUndefined();
  });

  it('preserves authenticated state when signOut rejects', async () => {
    const harness = createRepositoryHarness(
      Promise.resolve(authenticatedSession),
    );
    harness.signOut.mockRejectedValueOnce(new Error('raw-provider-detail'));

    const view = renderBootstrap(harness.repository);
    await screen.findByText('authenticated');
    view.queryClient.setQueryData(['profile', 'me'], {
      displayName: 'student.one',
    });

    screen.getByRole('button', { name: 'sign out' }).click();

    expect(await screen.findByText('rejected')).toBeVisible();
    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent(
      'authenticated',
    );
    expect(screen.getByLabelText('Auth session')).toHaveTextContent(
      authenticatedSession.email,
    );
    expect(view.queryClient.getQueryData(['profile', 'me'])).toEqual({
      displayName: 'student.one',
    });
  });

  it('reconciles a buffered null event to anonymous and resolves when recovery confirms no session', async () => {
    const harness = createRepositoryHarness(
      Promise.resolve(authenticatedSession),
    );
    harness.getSession
      .mockResolvedValueOnce(authenticatedSession)
      .mockResolvedValueOnce(null);
    harness.signOut.mockImplementationOnce(() => {
      harness.emit(null);
      return Promise.reject(new Error('raw-provider-detail'));
    });
    const view = renderBootstrap(harness.repository);
    await screen.findByText('authenticated');
    view.queryClient.setQueryData(['profile', 'me'], {
      displayName: 'student.one',
    });
    const cancelQueries = vi.spyOn(view.queryClient, 'cancelQueries');
    const removeQueries = vi.spyOn(view.queryClient, 'removeQueries');

    screen.getByRole('button', { name: 'sign out' }).click();

    expect(await screen.findByText('resolved')).toBeVisible();
    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('anonymous');
    expect(screen.getByLabelText('Auth session')).toHaveTextContent('none');
    expect(harness.getSession).toHaveBeenCalledTimes(2);
    expect(view.queryClient.getQueryData(['profile', 'me'])).toBeUndefined();
    expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      removeQueries.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('fails closed and resolves when a buffered null event cannot be reconciled', async () => {
    const harness = createRepositoryHarness(
      Promise.resolve(authenticatedSession),
    );
    harness.getSession
      .mockResolvedValueOnce(authenticatedSession)
      .mockRejectedValueOnce(new Error('recovery-provider-detail'));
    harness.signOut.mockImplementationOnce(() => {
      harness.emit(null);
      return Promise.reject(new Error('sign-out-provider-detail'));
    });
    const view = renderBootstrap(harness.repository);
    await screen.findByText('authenticated');
    view.queryClient.setQueryData(['profile', 'me'], {
      displayName: 'student.one',
    });
    const cancelQueries = vi.spyOn(view.queryClient, 'cancelQueries');
    const removeQueries = vi.spyOn(view.queryClient, 'removeQueries');

    screen.getByRole('button', { name: 'sign out' }).click();

    expect(await screen.findByText('resolved')).toBeVisible();
    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent('anonymous');
    expect(screen.getByLabelText('Auth session')).toHaveTextContent('none');
    expect(harness.getSession).toHaveBeenCalledTimes(2);
    expect(view.queryClient.getQueryData(['profile', 'me'])).toBeUndefined();
    expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      removeQueries.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('reconciles a buffered null event to the confirmed session and rejects without clearing cache', async () => {
    const harness = createRepositoryHarness(
      Promise.resolve(authenticatedSession),
    );
    harness.getSession
      .mockResolvedValueOnce(authenticatedSession)
      .mockResolvedValueOnce(replacementSession);
    harness.signOut.mockImplementationOnce(() => {
      harness.emit(null);
      return Promise.reject(new Error('raw-provider-detail'));
    });

    const view = renderBootstrap(harness.repository);
    await screen.findByText('authenticated');
    view.queryClient.setQueryData(['profile', 'me'], {
      displayName: 'student.one',
    });
    screen.getByRole('button', { name: 'sign out' }).click();

    expect(await screen.findByText('rejected')).toBeVisible();
    expect(screen.getByLabelText('Auth 狀態')).toHaveTextContent(
      'authenticated',
    );
    expect(screen.getByLabelText('Auth session')).toHaveTextContent(
      replacementSession.email,
    );
    expect(harness.getSession).toHaveBeenCalledTimes(2);
    expect(view.queryClient.getQueryData(['profile', 'me'])).toEqual({
      displayName: 'student.one',
    });
  });

  it('settles safely as anonymous when subscription setup rejects', async () => {
    const getSession = vi.fn(() => Promise.resolve(authenticatedSession));
    const repository: AuthRepository = {
      getSession,
      onAuthStateChange: vi.fn(() => {
        throw new Error('raw-provider-detail');
      }),
      signIn: vi.fn(),
      signInWithAccount: vi.fn(),
      signOut: vi.fn(),
    };

    renderBootstrap(repository);

    expect(await screen.findByText('anonymous')).toBeVisible();
    expect(screen.getByLabelText('Auth session')).toHaveTextContent('none');
    expect(getSession).not.toHaveBeenCalled();
  });
});
