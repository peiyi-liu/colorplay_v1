import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fail } from './config';

// Private checkpoint data never becomes a public receipt. Files are immutable:
// each phase gets a new name, so an uncertain earlier operation stays recorded.
export interface PrivateJournal {
  readonly directory: string;
  write(name: string, value: unknown): Promise<void>;
}
export const createPrivateJournal = async (
  root: string,
  runId: string,
): Promise<PrivateJournal> => {
  try {
    const info = await lstat(root);
    if (
      (await realpath(root)) !== resolve(root) ||
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (info.mode & 0o777) !== 0o700 ||
      !/^wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u.test(runId)
    )
      return fail('FUNCTIONAL_OWNERSHIP_INVALID');
    const directory = join(root, runId);
    await mkdir(directory, { mode: 0o700 });
    return {
      directory,
      write: async (name, value) => {
        if (!/^[a-z][a-z0-9-]{0,70}$/u.test(name))
          return fail('FUNCTIONAL_OWNERSHIP_INVALID');
        try {
          const handle = await open(
            join(directory, `${name}.json`),
            'wx',
            0o600,
          );
          try {
            await handle.writeFile(JSON.stringify(value));
            await handle.sync();
          } finally {
            await handle.close();
          }
        } catch {
          return fail('FUNCTIONAL_OWNERSHIP_INVALID');
        }
      },
    };
  } catch {
    return fail('FUNCTIONAL_OWNERSHIP_INVALID');
  }
};
