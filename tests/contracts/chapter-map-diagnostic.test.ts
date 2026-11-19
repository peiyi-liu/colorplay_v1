import { describe, expect, it } from 'vitest';
import {
  createSyntheticStudents,
  parseFixtureInput,
  type FixturePorts,
} from '../../scripts/concurrency/diagnose-chapter-map-fixtures';
const input = {
  api: 'http://127.0.0.1:58321',
  anon: 'synthetic_anon_123456789',
  service: 'synthetic_service_123456789',
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture(patch: Partial<FixturePorts> = {}) {
  let index = 0;
  const calls: string[] = [];
  const ports: FixturePorts = {
    create: (email, password) => {
      calls.push('CREATE');
      expect(email).toMatch(/@colorplay\.test$/u);
      expect(password).not.toBe(input.service);
      return Promise.resolve(id(++index));
    },
    profile: () => {
      calls.push('PROFILE');
      return Promise.resolve();
    },
    login: (userId) => {
      calls.push('LOGIN');
      return Promise.resolve({
        userId,
        accessToken: 'synthetic_access_token_123456789',
        claims: { sub: userId, role: 'authenticated' },
      });
    },
    history: () => {
      calls.push('HISTORY');
      return Promise.resolve({ quiz: 0, review: 0 });
    },
    ...patch,
  };
  return { ports, calls };
}
describe('diagnostic synthetic Local fixture boundary', () => {
  it('accepts only fixed literal-loopback API and strict private input', () => {
    expect(parseFixtureInput(input).api).toBe(input.api);
    expect(parseFixtureInput({ ...input, api: 'http://[::1]:58321' }).api).toBe(
      'http://[::1]:58321',
    );
    for (const api of [
      'https://127.0.0.1:58321',
      'http://localhost:58321',
      'http://2130706433:58321',
      'http://127.1:58321',
      'http://127.0.0.1:54321',
      'http://u:p@127.0.0.1:58321',
      'http://127.0.0.1:58321/x',
      'http://127.0.0.1:58321?x=1',
    ])
      expect(() => parseFixtureInput({ ...input, api })).toThrow();
    expect(() =>
      parseFixtureInput({ ...input, url: 'https://synthetic.invalid' }),
    ).toThrow();
  });
  it('uses fixed fixture lifecycle shape exactly59 times without sending mail/gameplay', async () => {
    const h = fixture();
    const value = await createSyntheticStudents(h.ports);
    expect(value.rows).toHaveLength(59);
    expect(new Set(value.rows.map((r) => r.userId)).size).toBe(59);
    expect(value.counts).toEqual({
      students: 59,
      quizHistory: 0,
      reviewHistory: 0,
    });
    expect(h.calls).toEqual(
      Array.from({ length: 59 }, () => [
        'CREATE',
        'PROFILE',
        'LOGIN',
        'HISTORY',
      ]).flat(),
    );
    expect(JSON.stringify(value)).not.toContain(input.service);
  });
  it.each([
    'duplicate',
    'wrong-subject',
    'nonempty-history',
    'create-fails',
  ] as const)(
    'fails closed without repeating fixture operations: %s',
    async (kind) => {
      const h = fixture(
        kind === 'duplicate'
          ? { create: () => Promise.resolve(id(1)) }
          : kind === 'wrong-subject'
            ? {
                login: () =>
                  Promise.resolve({
                    userId: id(99),
                    accessToken: 'synthetic_access_token_123456789',
                    claims: { sub: id(99), role: 'authenticated' },
                  }),
              }
            : kind === 'nonempty-history'
              ? { history: () => Promise.resolve({ quiz: 1, review: 0 }) }
              : {
                  create: () => Promise.reject(new Error('SYNTHETIC_SECRET')),
                },
      );
      await expect(createSyntheticStudents(h.ports)).rejects.toThrow();
      expect(h.calls.length).toBeLessThan(8);
    },
  );
});
