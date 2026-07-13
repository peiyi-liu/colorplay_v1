import {
  AuthApiError,
  AuthRetryableFetchError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../types/database';
import { AuthRepositoryError } from '../types';
import { createAuthRepository } from './auth-repository';

const createClientForAuth = (auth: object): SupabaseClient<Database> =>
  ({ auth }) as unknown as SupabaseClient<Database>;

const unknownProviderError = new AuthApiError(
  'provider detail must not escape',
  422,
  'provider_specific_code',
);

describe('AuthRepository error boundary', () => {
  it('uses only the machine code in repository errors', () => {
    const error = new AuthRepositoryError('AUTH_UNKNOWN');

    expect(error).toMatchObject({
      code: 'AUTH_UNKNOWN',
      message: 'AUTH_UNKNOWN',
      name: 'AuthRepositoryError',
    });
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain('provider detail');
  });

  it('returns only the minimal fields from a successful sign-in response', async () => {
    const signInWithPassword = vi.fn(() =>
      Promise.resolve({
        data: {
          session: {
            providerOnly: 'must not escape',
            user: {
              email: 'fixture@colorplay.invalid',
              id: 'fixture-id',
              providerOnly: 'must not escape',
            },
          },
          user: { providerOnly: 'must not escape' },
        },
        error: null,
      }),
    );
    const repository = createAuthRepository(
      createClientForAuth({ signInWithPassword }),
    );

    const session = await repository.signIn({
      email: 'fixture@colorplay.invalid',
      password: 'fixture-value',
    });

    expect(session).toEqual({
      email: 'fixture@colorplay.invalid',
      userId: 'fixture-id',
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'fixture@colorplay.invalid',
      password: 'fixture-value',
    });
  });

  it('returns null or a minimal session from valid get-session responses', async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({
        data: {
          session: {
            user: {
              email: 'fixture@colorplay.invalid',
              id: 'fixture-id',
            },
          },
        },
        error: null,
      });
    const repository = createAuthRepository(
      createClientForAuth({ getSession }),
    );

    await expect(repository.getSession()).resolves.toBeNull();
    await expect(repository.getSession()).resolves.toEqual({
      email: 'fixture@colorplay.invalid',
      userId: 'fixture-id',
    });
  });

  it('uses local scope for a successful sign-out', async () => {
    const signOut = vi.fn(() => Promise.resolve({ error: null }));

    await createAuthRepository(createClientForAuth({ signOut })).signOut();

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it.each([
    ['missing session', { session: null, user: null }],
    ['missing user', { session: {}, user: null }],
    ['missing email', { session: { user: { id: 'fixture-id' } }, user: null }],
  ])('maps a %s sign-in response to AUTH_UNKNOWN', async (_label, data) => {
    const client = createClientForAuth({
      signInWithPassword: () => Promise.resolve({ data, error: null }),
    });

    const rejection = createAuthRepository(client).signIn({
      email: 'fixture@colorplay.invalid',
      password: 'fixture-value',
    });

    await expect(rejection).rejects.toEqual(
      new AuthRepositoryError('AUTH_UNKNOWN'),
    );
  });

  it('maps only the stable provider credentials code', async () => {
    const invalidCredentials = new AuthApiError(
      'provider detail must not escape',
      400,
      'invalid_credentials',
    );
    const client = createClientForAuth({
      signInWithPassword: () =>
        Promise.resolve({
          data: { session: null, user: null },
          error: invalidCredentials,
        }),
    });

    await expect(
      createAuthRepository(client).signIn({
        email: 'fixture@colorplay.invalid',
        password: 'fixture-value',
      }),
    ).rejects.toEqual(new AuthRepositoryError('AUTH_INVALID_CREDENTIALS'));
  });

  it('maps retryable get-session errors to AUTH_NETWORK', async () => {
    const client = createClientForAuth({
      getSession: () =>
        Promise.resolve({
          data: { session: null },
          error: new AuthRetryableFetchError(
            'provider detail must not escape',
            503,
          ),
        }),
    });

    await expect(createAuthRepository(client).getSession()).rejects.toEqual(
      new AuthRepositoryError('AUTH_NETWORK'),
    );
  });

  it('maps non-classified sign-out errors to AUTH_UNKNOWN', async () => {
    const client = createClientForAuth({
      signOut: () => Promise.resolve({ error: unknownProviderError }),
    });

    await expect(createAuthRepository(client).signOut()).rejects.toEqual(
      new AuthRepositoryError('AUTH_UNKNOWN'),
    );
  });

  it('maps a thrown non-provider error to AUTH_UNKNOWN', async () => {
    const client = createClientForAuth({
      getSession: () => {
        throw new Error('provider detail must not escape');
      },
    });

    await expect(createAuthRepository(client).getSession()).rejects.toEqual(
      new AuthRepositoryError('AUTH_UNKNOWN'),
    );
  });

  it.each([
    ['missing result error', {}],
    ['undefined result error', { data: {}, error: undefined }],
  ])('maps %s to AUTH_UNKNOWN', async (_label, result) => {
    const client = createClientForAuth({
      signInWithPassword: () => Promise.resolve(result),
    });

    await expect(
      createAuthRepository(client).signIn({
        email: 'fixture@colorplay.invalid',
        password: 'fixture-value',
      }),
    ).rejects.toEqual(new AuthRepositoryError('AUTH_UNKNOWN'));
  });

  it('maps a missing get-session session to AUTH_UNKNOWN', async () => {
    const client = createClientForAuth({
      getSession: () => Promise.resolve({ data: {}, error: null }),
    });

    await expect(createAuthRepository(client).getSession()).rejects.toEqual(
      new AuthRepositoryError('AUTH_UNKNOWN'),
    );
  });

  it.each(['signIn', 'signOut', 'getSession', 'onAuthStateChange'] as const)(
    'maps raw TypeError thrown by %s to AUTH_NETWORK',
    async (method) => {
      const throwNetworkError = () => {
        throw new TypeError('raw fetch detail must not escape');
      };
      const client = createClientForAuth({
        getSession: throwNetworkError,
        onAuthStateChange: throwNetworkError,
        signInWithPassword: throwNetworkError,
        signOut: throwNetworkError,
      });
      const repository = createAuthRepository(client);

      const operation = () => {
        switch (method) {
          case 'signIn':
            return repository.signIn({
              email: 'fixture@colorplay.invalid',
              password: 'fixture-value',
            });
          case 'signOut':
            return repository.signOut();
          case 'getSession':
            return repository.getSession();
          case 'onAuthStateChange':
            return repository.onAuthStateChange(() => undefined);
        }
      };

      await expect(async () => operation()).rejects.toEqual(
        new AuthRepositoryError('AUTH_NETWORK'),
      );
    },
  );

  it('maps malformed state-change sessions to AUTH_UNKNOWN', () => {
    let providerListener:
      ((event: string, session: unknown) => void) | undefined;
    const listener = vi.fn();
    const unsubscribe = vi.fn();
    const client = createClientForAuth({
      onAuthStateChange: (
        callback: (event: string, session: unknown) => void,
      ) => {
        providerListener = callback;
        return { data: { subscription: { unsubscribe } } };
      },
    });
    const stop = createAuthRepository(client).onAuthStateChange(listener);

    expect(() => providerListener?.('SIGNED_IN', { user: {} })).toThrow(
      new AuthRepositoryError('AUTH_UNKNOWN'),
    );
    expect(listener).not.toHaveBeenCalled();

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('maps valid state changes to minimal sessions and null', () => {
    let providerListener:
      ((event: string, session: unknown) => void) | undefined;
    const listener = vi.fn();
    const unsubscribe = vi.fn();
    const client = createClientForAuth({
      onAuthStateChange: (
        callback: (event: string, session: unknown) => void,
      ) => {
        providerListener = callback;
        return { data: { subscription: { unsubscribe } } };
      },
    });
    const stop = createAuthRepository(client).onAuthStateChange(listener);

    providerListener?.('SIGNED_IN', {
      providerOnly: 'must not escape',
      user: {
        email: 'fixture@colorplay.invalid',
        id: 'fixture-id',
      },
    });
    providerListener?.('SIGNED_OUT', null);

    expect(listener).toHaveBeenNthCalledWith(1, {
      email: 'fixture@colorplay.invalid',
      userId: 'fixture-id',
    });
    expect(listener).toHaveBeenNthCalledWith(2, null);

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing subscription', { data: { subscription: null } }],
    ['missing unsubscribe', { data: { subscription: {} } }],
  ])('maps %s registration data to AUTH_UNKNOWN', (_label, result) => {
    const client = createClientForAuth({
      onAuthStateChange: () => result,
    });

    expect(() =>
      createAuthRepository(client).onAuthStateChange(() => undefined),
    ).toThrow(new AuthRepositoryError('AUTH_UNKNOWN'));
  });

  it('maps a raw TypeError thrown by unsubscribe to AUTH_NETWORK', () => {
    const client = createClientForAuth({
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: () => {
              throw new TypeError('raw fetch detail must not escape');
            },
          },
        },
      }),
    });
    const stop = createAuthRepository(client).onAuthStateChange(
      () => undefined,
    );

    expect(stop).toThrow(new AuthRepositoryError('AUTH_NETWORK'));
  });
});
