import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REQUIRED_FIELDS = [
  'schema_version',
  'action',
  'exact_target',
  'frozen_git_sha',
  'observed_current_state',
  'proposed_change',
  'rollback_or_recovery',
  'owner_authorization_id',
  'observed_at_utc',
];
const ALLOWED_FIELDS = new Set(REQUIRED_FIELDS);
const SECRET_LIKE_KEY =
  /password|secret|token|authorization|email|student|teacher/iu;
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u;
const SECRET_VALUE_PATTERN =
  /(?:Bearer\s+|service_role|sb_secret_[A-Za-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk_[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/[^\s:]+:[^@\s]+@)/iu;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const MAX_OBSERVATION_AGE_MS = 30 * 60_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60_000;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function containsSensitiveValue(value) {
  if (typeof value === 'string') {
    return EMAIL_PATTERN.test(value) || SECRET_VALUE_PATTERN.test(value);
  }
  if (Array.isArray(value)) return value.some(containsSensitiveValue);
  if (isRecord(value)) {
    return Object.values(value).some(containsSensitiveValue);
  }
  return false;
}

function isCanonicalUtcTimestamp(value) {
  if (typeof value !== 'string' || !value.endsWith('Z')) return false;
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}

export function verifyHostedMutationRecord(value, options) {
  if (!isRecord(value)) fail('HOSTED_MUTATION_RECORD_INVALID');

  for (const key of Object.keys(value)) {
    if (key !== 'owner_authorization_id' && SECRET_LIKE_KEY.test(key)) {
      fail('HOSTED_MUTATION_SECRET_LIKE_KEY');
    }
  }
  if (containsSensitiveValue(value)) {
    fail('HOSTED_MUTATION_SENSITIVE_VALUE');
  }

  const keys = Object.keys(value);
  if (
    keys.length !== REQUIRED_FIELDS.length ||
    keys.some((key) => !ALLOWED_FIELDS.has(key)) ||
    REQUIRED_FIELDS.some((key) => !(key in value)) ||
    value.schema_version !== 1 ||
    !SHA_PATTERN.test(value.frozen_git_sha) ||
    !isCanonicalUtcTimestamp(value.observed_at_utc) ||
    REQUIRED_FIELDS.filter(
      (field) => field !== 'schema_version' && field !== 'observed_at_utc',
    ).some((field) => !isNonEmptyString(value[field]))
  ) {
    fail('HOSTED_MUTATION_RECORD_INVALID');
  }

  if (value.action !== options.expectedAction) {
    fail('HOSTED_MUTATION_ACTION_MISMATCH');
  }
  if (value.exact_target !== options.expectedTarget) {
    fail('HOSTED_MUTATION_TARGET_MISMATCH');
  }
  if (value.frozen_git_sha !== options.expectedFrozenGitSha) {
    fail('HOSTED_MUTATION_SHA_MISMATCH');
  }

  const now = options.now ?? new Date();
  const observationAge = now.getTime() - Date.parse(value.observed_at_utc);
  if (
    observationAge > MAX_OBSERVATION_AGE_MS ||
    observationAge < -MAX_FUTURE_CLOCK_SKEW_MS
  ) {
    fail('HOSTED_MUTATION_OBSERVATION_STALE');
  }

  return value;
}

function parseArguments(argumentsList) {
  const allowed = new Set([
    '--record',
    '--schema',
    '--expected-action',
    '--expected-target',
  ]);
  const parsed = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!allowed.has(name) || !isNonEmptyString(value) || parsed.has(name)) {
      fail('HOSTED_MUTATION_INVALID_ARGUMENTS');
    }
    parsed.set(name, value);
  }
  if (parsed.size !== allowed.size) fail('HOSTED_MUTATION_INVALID_ARGUMENTS');
  return parsed;
}

function currentFrozenGitSha() {
  const environmentSha = process.env.COLORPLAY_FROZEN_GIT_SHA;
  if (environmentSha !== undefined) return environmentSha;
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

async function verifySchema(schemaPath) {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  if (
    !isRecord(schema) ||
    schema.type !== 'object' ||
    schema.additionalProperties !== false ||
    !Array.isArray(schema.required) ||
    schema.required.length !== REQUIRED_FIELDS.length ||
    REQUIRED_FIELDS.some((field) => !schema.required.includes(field))
  ) {
    fail('HOSTED_MUTATION_SCHEMA_INVALID');
  }
}

async function main() {
  const argumentsMap = parseArguments(process.argv.slice(2));
  await verifySchema(argumentsMap.get('--schema'));
  const record = JSON.parse(
    await readFile(argumentsMap.get('--record'), 'utf8'),
  );
  verifyHostedMutationRecord(record, {
    expectedAction: argumentsMap.get('--expected-action'),
    expectedFrozenGitSha: currentFrozenGitSha(),
    expectedTarget: argumentsMap.get('--expected-target'),
  });
  process.stdout.write('HOSTED_MUTATION_RECORD_VERIFIED\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code =
      typeof error?.code === 'string'
        ? error.code
        : 'HOSTED_MUTATION_RECORD_INVALID';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
