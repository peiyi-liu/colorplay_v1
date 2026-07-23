import { describe, expect, it } from 'vitest';
import { getBrowserSupabaseClient } from './browser-client';

describe('getBrowserSupabaseClient', () => {
  it('returns the same client for repeated calls', () => {
    const env = {
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'synthetic-anon-test-key-12345',
    } as const;

    expect(getBrowserSupabaseClient(env)).toBe(getBrowserSupabaseClient(env));
  });
});
