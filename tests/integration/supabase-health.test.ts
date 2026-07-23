import { describe, expect, it } from 'vitest';

const authHealthUrl = 'http://127.0.0.1:54321/auth/v1/health';

describe('Supabase local Auth health', () => {
  it('returns the real GoTrue health document', async () => {
    const response = await fetch(authHealthUrl);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const health = (await response.json()) as unknown;

    expect(health).toMatchObject({ name: 'GoTrue' });
  });
});
