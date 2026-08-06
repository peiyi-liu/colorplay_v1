import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const verifierPath = resolve(
  repositoryRoot,
  'scripts/release/verify-target.mjs',
);
const schemaPath = resolve(
  repositoryRoot,
  'docs/deployment/hosted-mutation.schema.json',
);

interface HostedMutationRecord {
  schema_version: 1;
  action: string;
  exact_target: string;
  frozen_git_sha: string;
  observed_current_state: string;
  proposed_change: string;
  rollback_or_recovery: string;
  owner_authorization_id: string;
  observed_at_utc: string;
  [key: string]: unknown;
}

type CommandResult = Readonly<{
  exitCode: number | null;
  stderr: string;
  stdout: string;
}>;

let temporaryRoot = '';

beforeEach(async () => {
  temporaryRoot = await mkdtemp(resolve(tmpdir(), 'colorplay-target-test-'));
});

afterEach(async () => {
  await rm(temporaryRoot, { force: true, recursive: true });
});

function validRecord(): HostedMutationRecord {
  return {
    schema_version: 1,
    action: 'configure-hosted-controls',
    exact_target: 'github.com/peiyi-liu/colorplay_v1',
    frozen_git_sha: '2295fd6c430fc4a843d2da3e391fd0d48b902704',
    observed_current_state: 'Read-only metadata collected; no mutation made.',
    proposed_change: 'Apply the reviewed Phase 0 hosted controls.',
    rollback_or_recovery: 'Restore the captured provider settings snapshot.',
    owner_authorization_id: 'owner-gate-1-20260806',
    observed_at_utc: new Date().toISOString(),
  };
}

async function runVerifier(
  record: HostedMutationRecord,
): Promise<CommandResult> {
  const recordPath = resolve(temporaryRoot, 'hosted-mutation.json');
  await writeFile(recordPath, `${JSON.stringify(record)}\n`, 'utf8');

  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      [
        verifierPath,
        '--record',
        recordPath,
        '--schema',
        schemaPath,
        '--expected-action',
        'configure-hosted-controls',
        '--expected-target',
        'github.com/peiyi-liu/colorplay_v1',
      ],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          COLORPLAY_FROZEN_GIT_SHA: '2295fd6c430fc4a843d2da3e391fd0d48b902704',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (exitCode) => {
      resolveResult({ exitCode, stderr, stdout });
    });
  });
}

describe('hosted mutation target verifier', () => {
  it('accepts a fresh sanitized record bound to the exact action, target, and SHA', async () => {
    const result = await runVerifier(validRecord());

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'HOSTED_MUTATION_RECORD_VERIFIED\n',
    });
  });

  it.each([
    {
      breakName: 'wrong project target',
      mutate: (record: HostedMutationRecord) => {
        record.exact_target = 'github.com/peiyi-liu/wrong-project';
      },
      error: 'HOSTED_MUTATION_TARGET_MISMATCH',
    },
    {
      breakName: 'wrong action',
      mutate: (record: HostedMutationRecord) => {
        record.action = 'reset-production';
      },
      error: 'HOSTED_MUTATION_ACTION_MISMATCH',
    },
    {
      breakName: 'observation older than 30 minutes',
      mutate: (record: HostedMutationRecord) => {
        record.observed_at_utc = new Date(
          Date.now() - 31 * 60_000,
        ).toISOString();
      },
      error: 'HOSTED_MUTATION_OBSERVATION_STALE',
    },
    {
      breakName: 'missing rollback or recovery text',
      mutate: (record: HostedMutationRecord) => {
        record.rollback_or_recovery = '';
      },
      error: 'HOSTED_MUTATION_RECORD_INVALID',
    },
    {
      breakName: 'missing owner authorization id',
      mutate: (record: HostedMutationRecord) => {
        record.owner_authorization_id = '';
      },
      error: 'HOSTED_MUTATION_RECORD_INVALID',
    },
    {
      breakName: 'mismatched frozen SHA',
      mutate: (record: HostedMutationRecord) => {
        record.frozen_git_sha = '0000000000000000000000000000000000000000';
      },
      error: 'HOSTED_MUTATION_SHA_MISMATCH',
    },
    {
      breakName: 'secret-looking extra key',
      mutate: (record: HostedMutationRecord) => {
        record.api_token = 'synthetic-value';
      },
      error: 'HOSTED_MUTATION_SECRET_LIKE_KEY',
    },
  ])('rejects $breakName', async ({ error, mutate }) => {
    const record = validRecord();
    mutate(record);

    const result = await runVerifier(record);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(`${error}\n`);
  });
});
