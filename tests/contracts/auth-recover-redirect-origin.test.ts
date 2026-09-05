import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

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
