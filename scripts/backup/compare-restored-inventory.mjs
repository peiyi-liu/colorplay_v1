import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

function parseFlags(argumentsList) {
  if (argumentsList[0] === '--') argumentsList = argumentsList.slice(1);
  const values = new Map();
  const allowed = new Set(['--source', '--restored', '--output']);
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) {
      throw new Error('RESTORE_INVENTORY_INVALID');
    }
    values.set(flag, value);
  }
  if (![...allowed].every((flag) => values.has(flag))) {
    throw new Error('RESTORE_INVENTORY_INVALID');
  }
  return values;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

try {
  const flags = parseFlags(process.argv.slice(2));
  const source = canonicalize(
    JSON.parse(await readFile(flags.get('--source'), 'utf8')),
  );
  const restored = canonicalize(
    JSON.parse(await readFile(flags.get('--restored'), 'utf8')),
  );
  const matches = JSON.stringify(source) === JSON.stringify(restored);
  await writeFile(
    flags.get('--output'),
    `${JSON.stringify({ schema_version: 1, decision: matches ? 'pass' : 'blocked' }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  if (!matches) throw new Error('RESTORE_INVENTORY_MISMATCH');
  process.stdout.write('RESTORE_INVENTORY_MATCHED\n');
} catch (error) {
  process.stderr.write(
    `${error?.message === 'RESTORE_INVENTORY_MISMATCH' ? error.message : 'RESTORE_INVENTORY_INVALID'}\n`,
  );
  process.exitCode = 1;
}
