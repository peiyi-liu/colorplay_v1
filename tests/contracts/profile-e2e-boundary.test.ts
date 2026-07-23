import { describe, expect, it } from 'vitest';

import { OWN_PROFILE_SELECT } from '../../src/features/profile/api/own-profile-select';
import {
  isLocalOwnProfileResponseUrl,
  readLocalProfileEnvironment,
} from '../e2e/profile-e2e-boundary';

const localEnvironment = {
  SUPABASE_ANON_KEY: 'local-anon-key',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'local-anon-key',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
} as const;

describe('profile E2E public boundary', () => {
  it.each([
    [
      'URL',
      {
        ...localEnvironment,
        VITE_SUPABASE_URL: 'http://127.0.0.1:65432',
      },
    ],
    [
      'key',
      {
        ...localEnvironment,
        VITE_SUPABASE_ANON_KEY: 'different-public-key',
      },
    ],
  ])(
    'rejects a Vite public %s that differs from the validated local value',
    (_field, environment) => {
      expect(() => readLocalProfileEnvironment(environment)).toThrow(
        'TASK_14_BROWSER_PUBLIC_ENV_MISMATCH',
      );
    },
  );

  it('accepts profile payload responses only from the exact local Supabase origin', () => {
    const query = `?select=${encodeURIComponent(OWN_PROFILE_SELECT)}`;

    expect(
      isLocalOwnProfileResponseUrl(
        `http://127.0.0.1:54321/rest/v1/profiles${query}`,
      ),
    ).toBe(true);
    expect(
      isLocalOwnProfileResponseUrl(
        `https://example.invalid/rest/v1/profiles${query}`,
      ),
    ).toBe(false);
  });
});
