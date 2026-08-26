import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const REQUIRED_FIELDS = [
  'schema_version',
  'attempt_id',
  'git_sha',
  'vercel_deployment_id',
  'vercel_deployment_url',
  'production_supabase_ref',
  'migration_first',
  'migration_last',
  'staging_gate_run_url',
  'production_gate_run_url',
  'approval_actor',
  'approval_at_utc',
  'post_deploy_smoke',
  'previous_healthy_deployment_id',
  'created_at_utc',
];
const ALLOWED_FIELDS = new Set(REQUIRED_FIELDS);
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DEPLOYMENT_PATTERN = /^dpl_[A-Za-z0-9]{8,}$/u;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/u;
const MIGRATION_PATTERN = /^\d{14}(?:_[a-z0-9_]+)?(?:\.sql)?$/u;
const ATTEMPT_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/u;
const ACTOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/u;
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u;
const SECRET_KEY_PATTERN =
  /password|secret|token|authorization|email|student|teacher/iu;
const SECRET_VALUE_PATTERN =
  /(?:Bearer\s+|service_role|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk_[A-Za-z0-9_-]+)/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalUtc(value) {
  if (typeof value !== 'string' || !value.endsWith('Z')) return false;
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

function isSafeUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

function containsSensitiveData(value, key = '') {
  if (key !== 'approval_actor' && SECRET_KEY_PATTERN.test(key)) return true;
  if (typeof value === 'string') {
    return EMAIL_PATTERN.test(value) || SECRET_VALUE_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveData(item));
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([childKey, childValue]) =>
      containsSensitiveData(childValue, childKey),
    );
  }
  return false;
}

export function validateReleaseRecord(value) {
  if (!isRecord(value) || containsSensitiveData(value)) {
    fail('RELEASE_RECORD_INVALID');
  }
  const keys = Object.keys(value);
  if (
    keys.length !== REQUIRED_FIELDS.length ||
    keys.some((key) => !ALLOWED_FIELDS.has(key)) ||
    REQUIRED_FIELDS.some((key) => !(key in value)) ||
    value.schema_version !== 1 ||
    !ATTEMPT_PATTERN.test(value.attempt_id) ||
    !SHA_PATTERN.test(value.git_sha) ||
    !DEPLOYMENT_PATTERN.test(value.vercel_deployment_id) ||
    !isSafeUrl(value.vercel_deployment_url) ||
    !PROJECT_REF_PATTERN.test(value.production_supabase_ref) ||
    !MIGRATION_PATTERN.test(value.migration_first) ||
    !MIGRATION_PATTERN.test(value.migration_last) ||
    !isSafeUrl(value.staging_gate_run_url) ||
    !isSafeUrl(value.production_gate_run_url) ||
    !ACTOR_PATTERN.test(value.approval_actor) ||
    !isCanonicalUtc(value.approval_at_utc) ||
    !['passed', 'failed'].includes(value.post_deploy_smoke) ||
    !DEPLOYMENT_PATTERN.test(value.previous_healthy_deployment_id) ||
    !isCanonicalUtc(value.created_at_utc)
  ) {
    fail('RELEASE_RECORD_INVALID');
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function parseFlags(argumentsList, allowed, required) {
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(flag) || typeof value !== 'string' || values.has(flag)) {
      fail('RELEASE_RECORD_INVALID_ARGUMENTS');
    }
    values.set(flag, value);
  }
  if (required.some((flag) => !values.has(flag))) {
    fail('RELEASE_RECORD_INVALID_ARGUMENTS');
  }
  return values;
}

function assertOutputInsideRoot(outputPath, rootPath) {
  const absoluteRoot = resolve(rootPath);
  const absoluteOutput = resolve(outputPath);
  const relativeOutput = relative(absoluteRoot, absoluteOutput);
  if (
    relativeOutput === '' ||
    relativeOutput.startsWith('..') ||
    isAbsolute(relativeOutput)
  ) {
    fail('EVIDENCE_OUTPUT_OUTSIDE_ROOT');
  }
  return absoluteOutput;
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function createRecord(argumentsList) {
  const flags = parseFlags(
    argumentsList,
    new Set(['--input', '--output', '--evidence-root']),
    ['--input', '--output'],
  );
  const outputPath = assertOutputInsideRoot(
    flags.get('--output'),
    flags.get('--evidence-root') ?? process.cwd(),
  );
  const input = JSON.parse(await readFile(flags.get('--input'), 'utf8'));
  const record = validateReleaseRecord(input);
  const contents = `${JSON.stringify(canonicalize(record), null, 2)}\n`;
  await atomicWrite(outputPath, contents);
  await atomicWrite(
    `${outputPath}.sha256`,
    `${sha256(contents)}  ${basename(outputPath)}\n`,
  );
  process.stdout.write('RELEASE_RECORD_CREATED\n');
}

async function verifyRecord(argumentsList) {
  const flags = parseFlags(argumentsList, new Set(['--record', '--checksum']), [
    '--record',
    '--checksum',
  ]);
  const recordContents = await readFile(flags.get('--record'), 'utf8');
  const checksumContents = await readFile(flags.get('--checksum'), 'utf8');
  const match = checksumContents.match(/^([0-9a-f]{64}) {2}([^/\n]+)\n$/u);
  if (
    !match ||
    match[2] !== basename(flags.get('--record')) ||
    match[1] !== sha256(recordContents)
  ) {
    fail('RELEASE_RECORD_CHECKSUM_MISMATCH');
  }
  validateReleaseRecord(JSON.parse(recordContents));
  process.stdout.write('RELEASE_RECORD_VERIFIED\n');
}

async function main() {
  const [command, ...argumentsList] = process.argv.slice(2);
  if (command === 'create') return createRecord(argumentsList);
  if (command === 'verify') return verifyRecord(argumentsList);
  fail('RELEASE_RECORD_INVALID_ARGUMENTS');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code =
      typeof error?.code === 'string' &&
      error.code.startsWith('RELEASE_RECORD_')
        ? error.code
        : error?.code === 'EVIDENCE_OUTPUT_OUTSIDE_ROOT'
          ? error.code
          : 'RELEASE_RECORD_INVALID';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
