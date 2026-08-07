#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

function fail() {
  process.stderr.write('ROLE_RESTORE_INPUT_INVALID\n');
  process.exit(1);
}

function parseArguments(argumentsList) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (
      !['--input', '--output'].includes(flag) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      values.has(flag)
    ) {
      fail();
    }
    values.set(flag, value);
  }
  if (!values.has('--input') || !values.has('--output')) fail();
  return values;
}

const flags = parseArguments(process.argv.slice(2));
const input = await readFile(flags.get('--input'), 'utf8').catch(fail);
if (input.includes('\0')) fail();

const createRolePattern =
  /^CREATE ROLE ((?:[A-Za-z_][A-Za-z0-9_$]*)|(?:"(?:[^"]|"")*"));$/u;
const createRolePrefix = /^\s*CREATE\s+ROLE\b/iu;
const prepared = input
  .split('\n')
  .map((line) => {
    const match = createRolePattern.exec(line);
    if (!match) {
      if (createRolePrefix.test(line)) fail();
      return line;
    }
    return [
      'DO $colorplay_role$',
      'BEGIN',
      `  CREATE ROLE ${match[1]};`,
      'EXCEPTION',
      '  WHEN duplicate_object THEN NULL;',
      'END',
      '$colorplay_role$;',
    ].join('\n');
  })
  .join('\n');

await writeFile(flags.get('--output'), prepared, {
  encoding: 'utf8',
  mode: 0o600,
}).catch(fail);
process.stdout.write('ROLE_RESTORE_SQL_PREPARED\n');
