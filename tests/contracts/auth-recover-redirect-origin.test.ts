import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { loadAuthRecoverHandler } from './helpers/auth-recover-handler';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('auth recovery redirect origin contract', () => {
  it('accepts the custom Staging domain and uses it as the safe fallback', () => {
    const corsSource = readSource('supabase/functions/_shared/cors.ts');
    const recoverSource = readSource(
      'supabase/functions/auth-recover/index.ts',
    );

    expect(corsSource).toContain("'https://staging.colorplayapp.com'");
    expect(recoverSource).toContain(": 'https://staging.colorplayapp.com'");
    expect(recoverSource).not.toContain(
      ": 'https://colorplay-staging.vercel.app'",
    );
  });
});

describe('actual auth-recover handler origin policy', () => {
  it.each([
    'http://127.0.0.1:58373',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'https://staging.colorplayapp.com',
  ])(
    'hands the exact approved origin to the recovery provider: %s',
    async (origin) => {
      const { handle, targets } = loadAuthRecoverHandler();
      const response = await handle(
        new Request('http://127.0.0.1:58321/functions/v1/auth-recover', {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account: 'synthetic',
            email: 'synthetic@colorplay.test',
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(targets).toEqual([`${origin}/reset-password`]);
    },
  );
  it.each([
    'http://127.0.0.1:58374',
    'http://127.0.0.1:58373.evil.invalid',
    'https://foreign.invalid',
    'null',
  ])(
    'preserves exact Staging safe fallback for foreign origin %s',
    async (origin) => {
      const { handle, targets } = loadAuthRecoverHandler();
      const response = await handle(
        new Request('http://127.0.0.1:58321/functions/v1/auth-recover', {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account: 'synthetic',
            email: 'synthetic@colorplay.test',
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(targets).toEqual([
        'https://staging.colorplayapp.com/reset-password',
      ]);
    },
  );
});
