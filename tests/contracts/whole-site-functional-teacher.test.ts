import { describe, expect, it, vi } from 'vitest';
import {
  createTeacherClassThroughUi,
  teacherCrossTenantDenials,
} from '../../scripts/concurrency/teacher-journey';
import { createFunctionalClient } from '../../scripts/concurrency/local-runtime';
import {
  readyScope,
  syntheticScope,
  syntheticSecrets,
} from './helpers/whole-site-functional';
const id = '10000000-0000-4000-8000-000000000001';
describe('teacher write-ahead and actual repository denials', () => {
  it('records unknown UI create once and never sends another create', async () => {
    const scope = await readyScope();
    const writes: string[] = [];
    const create = vi.fn(() => {
      expect(writes).toContain('teacher-c3-intent');
      return Promise.reject(new Error('SYNTHETIC_SECRET'));
    });
    await expect(
      createTeacherClassThroughUi(
        scope,
        {
          directory: 'synthetic',
          write: (name) => {
            writes.push(name);
            return Promise.resolve();
          },
        },
        {
          create,
          owned: () => Promise.resolve([]),
          assertOneCard: () => Promise.resolve(),
        },
      ),
    ).rejects.toThrow('FUNCTIONAL_OPERATION_FAILED');
    expect(create).toHaveBeenCalledTimes(1);
    expect(writes.at(-1)).toBe('teacher-c3-unknown');
  });
  it.each(['CLASSROOM_NOT_AVAILABLE', 'UNAVAILABLE'])(
    'only explicit domain denial %s proves cross-tenant refusal',
    async (message) => {
      const fetcher = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          Response.json({ code: 'P0001', message }, { status: 400 }),
        ),
      );
      const client = createFunctionalClient(
        syntheticScope(),
        syntheticSecrets.anonKey,
        new AbortController().signal,
        fetcher,
      );
      const result = teacherCrossTenantDenials(
        client,
        client,
        client,
        id,
        id,
        id,
      );
      if (message === 'CLASSROOM_NOT_AVAILABLE')
        await expect(result).resolves.toMatchObject({ ownerIsolation: true });
      else await expect(result).rejects.toThrow('FUNCTIONAL_OPERATION_FAILED');
    },
  );
});
