import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const authLoginSource = readFileSync(
  resolve(process.cwd(), 'supabase/functions/auth-login/index.ts'),
  'utf8',
);

describe('teacher account login contract', () => {
  it('authenticates teachers by account, password, and server-owned role only', () => {
    expect(authLoginSource).toContain('profile.role !== portalValue');
    expect(authLoginSource).toContain('grant_type=password');
    expect(authLoginSource).not.toMatch(/classCode|normalizeClassCode/u);
  });

  it('returns only session tokens from the custom auth-login endpoint', () => {
    expect(authLoginSource).toContain('access_token: session.access_token');
    expect(authLoginSource).toContain('refresh_token: session.refresh_token');
    expect(authLoginSource).not.toContain('jsonResponse(200, { session })');
  });
});
