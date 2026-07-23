import { describe, expect, it } from 'vitest';
import { parsePublicEnv } from './public-env';

describe('parsePublicEnv', () => {
  it('accepts exactly the browser-safe Supabase inputs', () => {
    expect(
      parsePublicEnv({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_ANON_KEY: 'synthetic-anon-test-key-12345',
      }),
    ).toEqual({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'synthetic-anon-test-key-12345',
    });
  });

  it('rejects a missing URL with a stable configuration code', () => {
    expect(() =>
      parsePublicEnv({
        VITE_SUPABASE_ANON_KEY: 'synthetic-anon-test-key-12345',
      }),
    ).toThrow('APP_CONFIG_INVALID');
  });
});
