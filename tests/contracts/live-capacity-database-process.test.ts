import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import { createLocalDatabase } from '../../scripts/live/capacity-local-database';

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('Local psql abort settlement', () => {
  it('does not settle an AbortError while the started SQL child is still alive', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cp-pg-abort-contract-'));
    const originalPath = process.env.PATH;
    const started = join(directory, 'started');
    const closed = join(directory, 'closed');
    try {
      const binary = join(directory, 'psql');
      await writeFile(
        binary,
        `#!${process.execPath}\nconst fs = require('node:fs');\nprocess.on('SIGTERM', () => {});\nfs.writeFileSync(${JSON.stringify(started)}, 'started');\nsetTimeout(() => { fs.writeFileSync(${JSON.stringify(closed)}, 'closed'); process.exit(0); }, 250);\n`,
      );
      await chmod(binary, 0o755);
      process.env.PATH = `${directory}:${originalPath ?? ''}`;
      const config = parseCapacityConfig(
        [
          '--revision',
          'a'.repeat(40),
          '--database-url',
          'postgresql://postgres:synthetic@127.0.0.1:65432/postgres',
        ],
        {},
      );
      const controller = new AbortController();
      const running = createLocalDatabase(config)
        .execute('select 1;', controller.signal)
        .then(
          () => 'resolved',
          () => 'rejected',
        );
      let isStarted = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        isStarted = await readFile(started).then(
          () => true,
          () => false,
        );
        if (isStarted) break;
        await pause(10);
      }
      expect(isStarted).toBe(true);
      controller.abort();
      expect(await running).toBe('rejected');
      const isClosedWhenSettled = await readFile(closed).then(
        () => true,
        () => false,
      );
      expect(isClosedWhenSettled).toBe(true);
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      // The RED case returns early; let this owned synthetic child exit before removing its fixture.
      await pause(300);
      await rm(directory, { force: true, recursive: true });
    }
  });
});
