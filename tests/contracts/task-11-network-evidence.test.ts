import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  validateTask11NetworkEvidence,
  validateTask11NetworkEvidenceFile,
} from '../../scripts/verify/task-11-network-evidence.mjs';

interface MutableNetworkEntry {
  fixtureLabel: string;
  httpStatus: number;
  operation: string;
  responseKeys: string[];
  [key: string]: unknown;
}

interface MutableNetworkReport {
  entries: MutableNetworkEntry[];
  schema: string;
  [key: string]: unknown;
}

const successfulResponseKeys = [
  'access_token',
  'expires_at',
  'expires_in',
  'refresh_token',
  'token_type',
  'user',
  'weak_password',
];

const createValidReport = (): MutableNetworkReport => ({
  entries: [
    {
      fixtureLabel: 'authLifecycleOne',
      httpStatus: 200,
      operation: 'signIn',
      responseKeys: [...successfulResponseKeys],
    },
    {
      fixtureLabel: 'authLifecycleOne',
      httpStatus: 204,
      operation: 'signOut',
      responseKeys: [],
    },
    {
      fixtureLabel: 'authLifecycleTwo',
      httpStatus: 400,
      operation: 'signIn',
      responseKeys: ['code', 'message'],
    },
    {
      fixtureLabel: 'authLifecycleOne',
      httpStatus: 200,
      operation: 'signIn',
      responseKeys: [...successfulResponseKeys],
    },
    {
      fixtureLabel: 'authLifecycleOne',
      httpStatus: 204,
      operation: 'signOut',
      responseKeys: [],
    },
    {
      fixtureLabel: 'authLifecycleOne',
      httpStatus: 200,
      operation: 'signIn',
      responseKeys: [...successfulResponseKeys],
    },
    {
      fixtureLabel: 'authLifecycleOne',
      httpStatus: 204,
      operation: 'signOut',
      responseKeys: [],
    },
  ],
  schema: 'colorplay.auth.network.v1',
});

const firstEntry = (report: MutableNetworkReport): MutableNetworkEntry => {
  const entry = report.entries[0];
  if (!entry) throw new Error('TEST_FIXTURE_MISSING');
  return entry;
};

const adversarialCases: readonly (readonly [
  string,
  (report: MutableNetworkReport) => void,
])[] = [
  [
    'response body field',
    (report) => {
      firstEntry(report).responseBody = { message: 'provider detail' };
    },
  ],
  [
    'response header field',
    (report) => {
      firstEntry(report).headers = { authorization: 'Bearer raw-value' };
    },
  ],
  [
    'request URL field',
    (report) => {
      firstEntry(report).url = 'http://127.0.0.1/path?value=raw';
    },
  ],
  [
    'email value',
    (report) => {
      firstEntry(report).fixtureLabel = 'student.one@colorplay.test';
    },
  ],
  [
    'UUID value',
    (report) => {
      firstEntry(report).fixtureLabel = '123e4567-e89b-42d3-a456-426614174000';
    },
  ],
  [
    'JWT value',
    (report) => {
      firstEntry(report).responseKeys = ['eyJaaa.eyJbbb.signature'];
    },
  ],
  [
    'raw token field',
    (report) => {
      firstEntry(report).token = 'raw-token-value';
    },
  ],
  [
    'raw key field',
    (report) => {
      firstEntry(report).key = 'raw-key-value';
    },
  ],
  [
    'raw password field',
    (report) => {
      firstEntry(report).password = 'raw-password-value';
    },
  ],
  [
    'fixture password value',
    (report) => {
      firstEntry(report).value = 'LocalOnly-Student1!';
    },
  ],
  [
    'service role value',
    (report) => {
      firstEntry(report).value = 'service_role raw-value';
    },
  ],
  [
    'environment value',
    (report) => {
      firstEntry(report).value = 'SUPABASE_ANON_KEY=raw-value';
    },
  ],
  [
    'unexpected top-level field',
    (report) => {
      report.unexpected = 'raw-value';
    },
  ],
  [
    'unexpected entry field',
    (report) => {
      firstEntry(report).unexpected = 'raw-value';
    },
  ],
  [
    'unexpected response key name',
    (report) => {
      firstEntry(report).responseKeys.push('provider_private_value');
    },
  ],
  [
    'unexpected interaction status',
    (report) => {
      firstEntry(report).httpStatus = 201;
    },
  ],
  [
    'missing expected interaction',
    (report) => {
      report.entries.pop();
    },
  ],
  [
    'wrong schema',
    (report) => {
      report.schema = 'colorplay.auth.network.v2';
    },
  ],
];

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Task 11 network evidence validator', () => {
  it('accepts the exact sanitized GoTrue interaction schema', () => {
    const report = createValidReport();

    expect(validateTask11NetworkEvidence(JSON.stringify(report))).toEqual({
      entryCount: 7,
      schema: 'colorplay.auth.network.v1',
    });
  });

  it.each(adversarialCases)('rejects %s', (_label, mutate) => {
    const report = createValidReport();
    mutate(report);

    expect(() => validateTask11NetworkEvidence(JSON.stringify(report))).toThrow(
      'TASK11_NETWORK_EVIDENCE_INVALID',
    );
  });

  it('removes a stale PASS marker before rejecting unsafe evidence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'task-11-network-'));
    temporaryDirectories.push(directory);
    const reportPath = join(directory, 'network.json');
    const scanPath = join(directory, 'secret-pii-scan.txt');
    const report = createValidReport();
    firstEntry(report).responseBody = { message: 'provider detail' };
    await writeFile(reportPath, JSON.stringify(report), 'utf8');
    await writeFile(scanPath, 'findings=0\n', 'utf8');

    await expect(
      validateTask11NetworkEvidenceFile({ reportPath, scanPath }),
    ).rejects.toThrow('TASK11_NETWORK_EVIDENCE_INVALID');
    await expect(stat(scanPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('writes a PASS marker only after successful validation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'task-11-network-'));
    temporaryDirectories.push(directory);
    const reportPath = join(directory, 'network.json');
    const scanPath = join(directory, 'secret-pii-scan.txt');
    await writeFile(reportPath, JSON.stringify(createValidReport()), 'utf8');

    await expect(
      validateTask11NetworkEvidenceFile({ reportPath, scanPath }),
    ).resolves.toEqual({
      entryCount: 7,
      schema: 'colorplay.auth.network.v1',
    });
    await expect(readFile(scanPath, 'utf8')).resolves.toBe(
      [
        'findings=0',
        'scope=phase-1b-task-11-network-evidence',
        'schema=colorplay.auth.network.v1',
        'entry_count=7',
        '',
      ].join('\n'),
    );
  });

  it('wires fresh Task 11 validation into the authoritative DB gate', async () => {
    const runner = await readFile('scripts/test-db.sh', 'utf8');
    const cleanupIndex = runner.indexOf('"$task11_network_report"');
    const integrationIndex = runner.indexOf('pnpm test:integration');
    const validatorIndex = runner.indexOf(
      'node scripts/verify/task-11-network-evidence.mjs',
    );
    const finalScanIndex = runner.indexOf('artifact_secret_pattern=');

    expect(runner).toContain(
      "task11_network_directory='artifacts/acceptance/phase-1b-task-11/network'",
    );
    expect(runner).toContain(
      'task11_network_report="$task11_network_directory/auth-repository-network.json"',
    );
    expect(runner).toContain(
      'task11_secret_scan_report="$task11_network_directory/secret-pii-scan.txt"',
    );
    expect(runner).toContain(
      '"$task11_network_report" \\\n  "$task11_secret_scan_report"',
    );
    expect(runner).toContain(
      '"$task11_network_report" "$task11_secret_scan_report"',
    );
    expect(runner).toContain(
      '"$evidence_directory" "$auth_evidence_directory" "$task11_network_directory"',
    );
    expect(runner).toContain('(?-i:SUPABASE_[A-Z0-9_]+)');
    expect(cleanupIndex).toBeGreaterThan(-1);
    expect(integrationIndex).toBeGreaterThan(cleanupIndex);
    expect(validatorIndex).toBeGreaterThan(integrationIndex);
    expect(finalScanIndex).toBeGreaterThan(validatorIndex);
  });
});
