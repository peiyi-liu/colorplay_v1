import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { verifyCandidate } from './verify-candidate.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;

function fail() {
  throw new Error('PRODUCTION_MAIN_PARITY_INVALID');
}

function parseFlags(argumentsList) {
  const required = [
    '--record',
    '--checksum',
    '--observation',
    '--expected-project-ref',
    '--main-sha',
    '--vercel-source-sha',
    '--tag-sha',
    '--now',
  ];
  const allowed = new Set(required);
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) {
      fail();
    }
    values.set(flag, value);
  }
  if (required.some((flag) => !values.has(flag))) fail();
  return values;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const expectedSha = flags.get('--main-sha');
  if (
    !SHA_PATTERN.test(expectedSha) ||
    flags.get('--vercel-source-sha') !== expectedSha ||
    flags.get('--tag-sha') !== expectedSha
  ) {
    fail();
  }
  const { record } = await verifyCandidate({
    recordPath: flags.get('--record'),
    checksumPath: flags.get('--checksum'),
    observationPath: flags.get('--observation'),
    expectedSha,
    expectedProjectRef: flags.get('--expected-project-ref'),
    now: flags.get('--now'),
  });
  if (record.git_sha !== expectedSha) fail();
  process.stdout.write('PRODUCTION_MAIN_PARITY_VERIFIED\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('PRODUCTION_MAIN_PARITY_INVALID\n');
    process.exitCode = 1;
  });
}
