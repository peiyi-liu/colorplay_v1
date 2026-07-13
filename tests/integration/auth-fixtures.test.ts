import { mkdir, writeFile } from 'node:fs/promises';

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import type { Database } from '../../src/types/database';
import {
  TEST_USER_ROLES,
  TEST_USERS,
  type TestUserLabel,
} from '../fixtures/users';

const fixtureLabels = [
  'teacher',
  'studentOne',
  'studentTwo',
  'outsider',
] as const satisfies readonly TestUserLabel[];
const evidenceDirectory = 'artifacts/acceptance/phase-1b-task-10/reports';
const signInStatuses = new Map<TestUserLabel, number>();
const verifiedRoles = new Set<TestUserLabel>();

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

const createStatusTrackingFetch =
  (label: TestUserLabel): typeof fetch =>
  async (input, init) => {
    const response = await fetch(input, init);
    const url = requestUrl(input);

    if (
      url.pathname.endsWith('/auth/v1/token') &&
      url.searchParams.get('grant_type') === 'password'
    ) {
      signInStatuses.set(label, response.status);
    }

    return response;
  };

afterAll(async () => {
  await mkdir(evidenceDirectory, { recursive: true });

  const statusLines = fixtureLabels.map(
    (label) =>
      `${label}_sign_in_http_status=${String(signInStatuses.get(label) ?? 0)}`,
  );
  await writeFile(
    `${evidenceDirectory}/auth-fixtures-summary.txt`,
    [
      `fixture_count=${String(fixtureLabels.length)}`,
      ...statusLines,
      `verified_role_count=${String(verifiedRoles.size)}`,
      '',
    ].join('\n'),
    'utf8',
  );
});

describe('local Auth fixtures', () => {
  it.each(fixtureLabels)(
    'signs in fixture %s through real GoTrue and reads its own role',
    async (label) => {
      const { anonKey, url } = readLocalPublicEnvironment();
      const fixture = TEST_USERS[label];
      const client = createClient<Database>(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: createStatusTrackingFetch(label) },
      });
      const { data, error } = await client.auth.signInWithPassword(fixture);

      expect(error === null).toBe(true);
      expect(data.user !== null).toBe(true);

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id, role')
        .single();

      expect(profileError === null).toBe(true);
      expect(profile?.id).toBe(data.user?.id);
      expect(profile?.role).toBe(TEST_USER_ROLES[label]);

      verifiedRoles.add(label);

      const { error: signOutError } = await client.auth.signOut();
      expect(signOutError === null).toBe(true);
    },
  );
});
