import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const authLoginSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/auth-login/index.ts'),
  'utf8',
);

describe('teacher account login contract', () => {
  it('authenticates teachers by account, password, and server-owned role only', () => {
    expect(authLoginSource).toContain('if (profile.role !== portalValue)');
    expect(authLoginSource).toContain('grant_type=password');
    expect(authLoginSource).not.toMatch(/classCode|normalizeClassCode/u);
  });
});
