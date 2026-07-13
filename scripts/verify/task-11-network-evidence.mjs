import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const schema = 'colorplay.auth.network.v1';
const successfulResponseKeys = [
  'access_token',
  'expires_at',
  'expires_in',
  'refresh_token',
  'token_type',
  'user',
  'weak_password',
];
const expectedEntries = [
  {
    fixtureLabel: 'studentOne',
    httpStatus: 200,
    operation: 'signIn',
    responseKeys: successfulResponseKeys,
  },
  {
    fixtureLabel: 'studentOne',
    httpStatus: 204,
    operation: 'signOut',
    responseKeys: [],
  },
  {
    fixtureLabel: 'studentTwo',
    httpStatus: 400,
    operation: 'signIn',
    responseKeys: ['code', 'message'],
  },
  {
    fixtureLabel: 'outsider',
    httpStatus: 200,
    operation: 'signIn',
    responseKeys: successfulResponseKeys,
  },
  {
    fixtureLabel: 'outsider',
    httpStatus: 204,
    operation: 'signOut',
    responseKeys: [],
  },
  {
    fixtureLabel: 'outsider',
    httpStatus: 200,
    operation: 'signIn',
    responseKeys: successfulResponseKeys,
  },
  {
    fixtureLabel: 'outsider',
    httpStatus: 204,
    operation: 'signOut',
    responseKeys: [],
  },
];
const sensitivePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu,
  /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u,
  /\bBearer\s+[^\s"}]+/iu,
  /LocalOnly-/u,
  /service[_ -]?role/iu,
  /SUPABASE_[A-Z0-9_]+/u,
  /https?:\/\//iu,
];

const invalid = () => {
  throw new Error('TASK11_NETWORK_EVIDENCE_INVALID');
};

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value, expectedKeys) =>
  JSON.stringify(Object.keys(value).sort()) ===
  JSON.stringify([...expectedKeys].sort());

const normalizeEntry = (entry) => ({
  fixtureLabel: entry.fixtureLabel,
  httpStatus: entry.httpStatus,
  operation: entry.operation,
  responseKeys: [...entry.responseKeys].sort(),
});

const compareEntries = (left, right) =>
  JSON.stringify(left).localeCompare(JSON.stringify(right));

export function validateTask11NetworkEvidence(reportText) {
  if (
    typeof reportText !== 'string' ||
    sensitivePatterns.some((pattern) => pattern.test(reportText))
  ) {
    return invalid();
  }

  let report;
  try {
    report = JSON.parse(reportText);
  } catch {
    return invalid();
  }

  if (
    !isRecord(report) ||
    !hasExactKeys(report, ['entries', 'schema']) ||
    report.schema !== schema ||
    !Array.isArray(report.entries)
  ) {
    return invalid();
  }

  const normalizedEntries = [];
  for (const entry of report.entries) {
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, [
        'fixtureLabel',
        'httpStatus',
        'operation',
        'responseKeys',
      ]) ||
      typeof entry.fixtureLabel !== 'string' ||
      !Number.isInteger(entry.httpStatus) ||
      typeof entry.operation !== 'string' ||
      !Array.isArray(entry.responseKeys) ||
      !entry.responseKeys.every((key) => typeof key === 'string')
    ) {
      return invalid();
    }

    normalizedEntries.push(normalizeEntry(entry));
  }

  const normalizedExpectedEntries = expectedEntries.map(normalizeEntry);
  normalizedEntries.sort(compareEntries);
  normalizedExpectedEntries.sort(compareEntries);
  if (
    JSON.stringify(normalizedEntries) !==
    JSON.stringify(normalizedExpectedEntries)
  ) {
    return invalid();
  }

  return {
    entryCount: report.entries.length,
    schema,
  };
}

export async function validateTask11NetworkEvidenceFile({
  reportPath,
  scanPath,
}) {
  await rm(scanPath, { force: true });

  let reportText;
  try {
    reportText = await readFile(reportPath, 'utf8');
  } catch {
    return invalid();
  }

  const summary = validateTask11NetworkEvidence(reportText);
  await writeFile(
    scanPath,
    [
      'findings=0',
      'scope=phase-1b-task-11-network-evidence',
      `schema=${summary.schema}`,
      `entry_count=${String(summary.entryCount)}`,
      '',
    ].join('\n'),
    'utf8',
  );
  return summary;
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(resolve(invokedPath)).href
) {
  const reportPath = process.argv[2];
  const scanPath = process.argv[3];

  if (!reportPath || !scanPath) {
    process.stderr.write('TASK11_NETWORK_EVIDENCE_INVALID\n');
    process.exitCode = 1;
  } else {
    try {
      await validateTask11NetworkEvidenceFile({ reportPath, scanPath });
    } catch {
      process.stderr.write('TASK11_NETWORK_EVIDENCE_INVALID\n');
      process.exitCode = 1;
    }
  }
}
