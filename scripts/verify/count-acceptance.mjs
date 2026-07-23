import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const EXPECTED_ACCEPTANCE_COUNT = 122;

export function countAcceptanceIds(markdown) {
  return [
    ...new Set(
      markdown
        .match(/^## AC-[A-Z0-9]+-[0-9]{3}/gm)
        ?.map((heading) => heading.slice(3)) ?? [],
    ),
  ].sort();
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  if (process.argv.length !== 3) {
    process.stderr.write('EVIDENCE_INVALID_ARGUMENTS\n');
    process.exitCode = 1;
  } else {
    try {
      const markdown = await readFile(process.argv[2], 'utf8');
      process.stdout.write(`${String(countAcceptanceIds(markdown).length)}\n`);
    } catch {
      process.stderr.write('EVIDENCE_COUNT_FAILED\n');
      process.exitCode = 1;
    }
  }
}
