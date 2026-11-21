import {
  mkdtemp,
  chmod,
  readFile,
  realpath,
  stat,
  symlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrivateJournal } from '../../scripts/concurrency/private-journal';
import {
  FunctionalError,
  functionalFailureCode,
} from '../../scripts/concurrency/config';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.map((path) => rm(path, { recursive: true, force: true })),
  );
});
const root = async () => {
  const path = await mkdtemp(join(tmpdir(), 'wsb-contract-'));
  roots.push(path);
  await chmod(path, 0o700);
  return realpath(path);
};
describe('functional write-ahead and safe output', () => {
  it('reserves a fresh 0700 run with exclusive 0600 checkpoints before any mutation', async () => {
    const path = await root();
    const journal = await createPrivateJournal(path, 'wsb-26111500-abcdef12');
    await journal.write('plan', { account: 'SYNTHETIC_SECRET' });
    expect((await stat(journal.directory)).mode & 0o777).toBe(0o700);
    expect(
      (await stat(join(journal.directory, 'plan.json'))).mode & 0o777,
    ).toBe(0o600);
    expect(
      JSON.parse(await readFile(join(journal.directory, 'plan.json'), 'utf8')),
    ).toEqual({ account: 'SYNTHETIC_SECRET' });
    await expect(
      createPrivateJournal(path, 'wsb-26111500-abcdef12'),
    ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
    await expect(journal.write('plan', {})).rejects.toThrow(
      'FUNCTIONAL_OWNERSHIP_INVALID',
    );
  });
  it('rejects broad roots, symbolic links and public permissions without changing them', async () => {
    const path = await root();
    await chmod(path, 0o755);
    await expect(
      createPrivateJournal(path, 'wsb-26111500-abcdef12'),
    ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
    const other = await root();
    const link = join(other, 'link');
    await symlink(path, link);
    await expect(
      createPrivateJournal(link, 'wsb-26111500-abcdef12'),
    ).rejects.toThrow('FUNCTIONAL_OWNERSHIP_INVALID');
  });
  it('unknown proxy traps cannot escape safe diagnostic output', () => {
    const value = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error('SYNTHETIC_SECRET');
        },
      },
    );
    expect(functionalFailureCode(value)).toBe('FUNCTIONAL_OPERATION_FAILED');
  });
  it('cannot reflect a caller-provided code, getter, stack or cause', () => {
    const error = new FunctionalError('FUNCTIONAL_SCOPE_INVALID');
    Object.defineProperty(error, 'code', {
      get() {
        throw new Error('SYNTHETIC_SECRET');
      },
    });
    expect(functionalFailureCode(error)).toBe('FUNCTIONAL_OPERATION_FAILED');
    expect(functionalFailureCode({ code: 'FUNCTIONAL_SYNTHETIC_SECRET' })).toBe(
      'FUNCTIONAL_OPERATION_FAILED',
    );
  });
});
