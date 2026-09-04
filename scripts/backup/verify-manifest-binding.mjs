import { readFile } from 'node:fs/promises';
import process from 'node:process';

function parseFlags(argumentsList) {
  const values = new Map();
  const allowed = new Set([
    '--manifest',
    '--expected-repo-sha',
    '--expected-b2-prefix',
  ]);
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) {
      throw new Error('RESTORE_MANIFEST_BINDING_INVALID');
    }
    values.set(flag, value);
  }
  if (![...allowed].every((flag) => values.has(flag))) {
    throw new Error('RESTORE_MANIFEST_BINDING_INVALID');
  }
  return values;
}

try {
  const flags = parseFlags(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(flags.get('--manifest'), 'utf8'));
  if (manifest.repo_sha !== flags.get('--expected-repo-sha')) {
    throw new Error('RESTORE_MANIFEST_BINDING_INVALID');
  }
  if (manifest.b2_prefix !== flags.get('--expected-b2-prefix')) {
    throw new Error('RESTORE_MANIFEST_BINDING_INVALID');
  }
  process.stdout.write('RESTORE_MANIFEST_BINDING_VERIFIED\n');
} catch {
  process.stderr.write('RESTORE_MANIFEST_BINDING_INVALID\n');
  process.exitCode = 1;
}
