import { mkdir, writeFile } from 'node:fs/promises';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import type { Database } from '../../../types/database';
import {
  TEST_USERS,
  type TestUserLabel,
} from '../../../../tests/fixtures/users';
import { AuthRepositoryError } from '../types';
import { createAuthRepository } from './auth-repository';

type NetworkOperation = 'signIn' | 'signOut';

type SanitizedNetworkEntry = Readonly<{
  fixtureLabel: TestUserLabel;
  operation: NetworkOperation;
  httpStatus: number;
  responseKeys: readonly string[];
}>;

const evidenceDirectory = 'artifacts/acceptance/phase-1b-task-11/network';
const networkEntries: SanitizedNetworkEntry[] = [];

const readLocalPublicEnvironment = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) throw new Error('LOCAL_PUBLIC_ENV_MISSING');

  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== 'http:' ||
    parsedUrl.hostname !== '127.0.0.1' ||
    parsedUrl.port !== '54321'
  ) {
    throw new Error('LOCAL_PUBLIC_ENV_INVALID');
  }

  return { anonKey, url } as const;
};

const requestUrl = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
};

const readResponseKeys = async (
  response: Response,
): Promise<readonly string[]> => {
  try {
    const body: unknown = await response.clone().json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return [];
    }

    return Object.keys(body).sort();
  } catch {
    return [];
  }
};

const createNetworkTrackingFetch =
  (fixtureLabel: TestUserLabel): typeof fetch =>
  async (input, init) => {
    const response = await fetch(input, init);
    const url = requestUrl(input);
    let operation: NetworkOperation | undefined;

    if (
      url.pathname.endsWith('/auth/v1/token') &&
      url.searchParams.get('grant_type') === 'password'
    ) {
      operation = 'signIn';
    } else if (url.pathname.endsWith('/auth/v1/logout')) {
      operation = 'signOut';
    }

    if (operation) {
      networkEntries.push({
        fixtureLabel,
        httpStatus: response.status,
        operation,
        responseKeys: await readResponseKeys(response),
      });
    }

    return response;
  };

const createLocalClient = (
  fixtureLabel: TestUserLabel,
): SupabaseClient<Database> => {
  const { anonKey, url } = readLocalPublicEnvironment();

  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: createNetworkTrackingFetch(fixtureLabel) },
  });
};

const waitFor = async (assertion: () => void): Promise<void> => {
  const deadline = Date.now() + 2_000;

  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  assertion();
};

afterAll(async () => {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    `${evidenceDirectory}/auth-repository-network.json`,
    `${JSON.stringify(
      {
        entries: networkEntries,
        schema: 'colorplay.auth.network.v1',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
});

describe('AuthRepository with local Supabase', () => {
  it('returns minimal sessions and removes the local session on sign-out', async () => {
    const repository = createAuthRepository(
      createLocalClient('authLifecycleOne'),
    );

    const signedIn = await repository.signIn(TEST_USERS.authLifecycleOne);

    expect(signedIn.email).toBe(TEST_USERS.authLifecycleOne.email);
    expect(typeof signedIn.userId).toBe('string');
    expect(Object.keys(signedIn).sort()).toEqual(['email', 'userId']);
    await expect(repository.getSession()).resolves.toEqual(signedIn);

    await repository.signOut();

    await expect(repository.getSession()).resolves.toBeNull();
  });

  it('maps a real rejected password attempt to the stable credentials code', async () => {
    const repository = createAuthRepository(
      createLocalClient('authLifecycleTwo'),
    );

    const rejection = repository.signIn({
      email: TEST_USERS.authLifecycleTwo.email,
      password: 'wrong-value',
    });

    await expect(rejection).rejects.toEqual(
      new AuthRepositoryError('AUTH_INVALID_CREDENTIALS'),
    );
    await expect(repository.getSession()).resolves.toBeNull();
  });

  it('maps a controlled unreachable Auth service to the stable network code', async () => {
    const client = createClient<Database>(
      'http://127.0.0.1:1',
      'local-unreachable-client',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const repository = createAuthRepository(client);

    const rejection = repository.signIn({
      email: 'unreachable@colorplay.invalid',
      password: 'unreachable-value',
    });

    await expect(rejection).rejects.toEqual(
      new AuthRepositoryError('AUTH_NETWORK'),
    );
  });

  it('maps real sign-in and sign-out events and returns a working unsubscribe', async () => {
    const repository = createAuthRepository(
      createLocalClient('authLifecycleOne'),
    );
    const observedSessions: (Readonly<{
      userId: string;
      email: string;
    }> | null)[] = [];
    const unsubscribe = repository.onAuthStateChange((session) => {
      observedSessions.push(session);
    });

    const signedIn = await repository.signIn(TEST_USERS.authLifecycleOne);
    await waitFor(() => {
      expect(observedSessions).toContainEqual(signedIn);
    });

    await repository.signOut();
    await waitFor(() => {
      expect(observedSessions.at(-1)).toBeNull();
    });

    const countBeforeUnsubscribe = observedSessions.length;
    unsubscribe();
    await repository.signIn(TEST_USERS.authLifecycleOne);
    await repository.signOut();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(observedSessions).toHaveLength(countBeforeUnsubscribe);
  });
});
