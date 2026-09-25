import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSyntheticAccounts,
  readCapacityConfig,
} from '../e2e/helpers/staging-capacity';

const VALID_ENV = {
  COLORPLAY_CAPACITY_APP_URL: 'https://staging.colorplayapp.com',
  COLORPLAY_CAPACITY_CONFIRM: 'STAGING_1_PLUS_39_ONLY',
  COLORPLAY_CAPACITY_EXPECTED_SHA: 'a'.repeat(40),
  COLORPLAY_CAPACITY_RUN_ID: 'c40-contract-test',
  STAGING_EXPECTED_SUPABASE_PROJECT_REF: 'onkxnkzeixpezetkmocf',
  STAGING_SUPABASE_ACCESS_TOKEN: 'synthetic-access-token',
  STAGING_SUPABASE_ANON_KEY: 'synthetic-public-key',
  STAGING_SUPABASE_PROJECT_REF: 'onkxnkzeixpezetkmocf',
  STAGING_SUPABASE_SECRET_KEY: 'synthetic-secret-key',
  STAGING_SUPABASE_URL: 'https://onkxnkzeixpezetkmocf.supabase.co',
} satisfies NodeJS.ProcessEnv;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Staging capacity account reconciliation', () => {
  it('reconciles an Auth user when create response is ambiguous', async () => {
    let fetchCall = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        fetchCall += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify(
              fetchCall === 1
                ? []
                : [
                    {
                      capacity_account: 'cpde1aae8401',
                      capacity_run_id: 'c40-contract-test',
                      email: 'cpde1aae8401@capacity.colorplay.invalid',
                      id: '11111111-1111-4111-8111-111111111111',
                    },
                  ],
            ),
            { status: 200 },
          ),
        );
      }),
    );
    let createCall = 0;
    const service = {
      auth: {
        admin: {
          createUser: vi.fn(() => {
            createCall += 1;
            return Promise.resolve(
              createCall === 1
                ? { data: { user: null }, error: new Error('response lost') }
                : {
                    data: {
                      user: {
                        id: `11111111-1111-4111-8111-${String(createCall).padStart(12, '0')}`,
                      },
                    },
                    error: null,
                  },
            );
          }),
        },
      },
      from: vi.fn(() => ({
        update: vi.fn(
          (
            payload: Readonly<{ full_name: string; login_account: string }>,
          ) => ({
            eq: vi.fn((_column: string, id: string) => ({
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { ...payload, id, role: 'student' },
                    error: null,
                  }),
                ),
              })),
            })),
          }),
        ),
      })),
    };
    const config = readCapacityConfig(VALID_ENV);
    const created = await createSyntheticAccounts(
      config,
      service as never,
      config.runId,
    );

    expect(created).toHaveLength(39);
    expect(created[0]?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(fetchCall).toBe(2);
  });
});
