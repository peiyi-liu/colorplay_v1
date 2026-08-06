import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const candidateVerifier = resolve(
  repositoryRoot,
  'scripts/release/verify-candidate.mjs',
);
const parityVerifier = resolve(
  repositoryRoot,
  'scripts/release/verify-main-parity.mjs',
);
const sha = 'a'.repeat(40);
const now = '2026-08-06T04:00:00.000Z';
let root = '';

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'colorplay-production-release-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function run(script: string, args: string[]) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolveResult, reject) => {
      const child = spawn(process.execPath, [script, ...args], {
        cwd: repositoryRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
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
      child.once('close', (code) => {
        resolveResult({ code, stderr, stdout });
      });
    },
  );
}

function record() {
  return {
    schema_version: 1,
    attempt_id: 'candidate-20260806-001',
    git_sha: sha,
    vercel_deployment_id: 'dpl_1234567890abcdef',
    vercel_deployment_url: 'https://colorplay-candidate.vercel.app',
    production_supabase_ref: 'abcdefghijklmnopqrst',
    migration_first: '20260713000000',
    migration_last: '20260730000000',
    staging_gate_run_url: 'https://github.com/owner/repo/actions/runs/1',
    production_gate_run_url: 'https://github.com/owner/repo/actions/runs/2',
    approval_actor: 'release-owner',
    approval_at_utc: '2026-08-06T03:58:00.000Z',
    post_deploy_smoke: 'passed',
    previous_healthy_deployment_id: 'dpl_abcdef1234567890',
    created_at_utc: '2026-08-06T03:59:00.000Z',
  };
}

function observation() {
  return {
    schema_version: 1,
    git_sha: sha,
    vercel_deployment_id: 'dpl_1234567890abcdef',
    vercel_deployment_url: 'https://colorplay-candidate.vercel.app',
    staging_gate_status: 'success',
    staging_gate_observed_at_utc: '2026-08-06T03:50:00.000Z',
    backup_freshness_status: 'success',
    backup_freshness_observed_at_utc: '2026-08-06T03:40:00.000Z',
    production_marker_count: 0,
    redirected_to_staging: false,
    deployment_protection: 'verified',
    fixture_identity_count: 0,
    content_inventory_status: 'formal',
  };
}

async function writeCandidate(overrides = {}) {
  const recordPath = resolve(root, 'record.json');
  const observationPath = resolve(root, 'observation.json');
  const recordText = `${JSON.stringify(record(), null, 2)}\n`;
  await writeFile(recordPath, recordText);
  await writeFile(
    `${recordPath}.sha256`,
    `${createHash('sha256').update(recordText).digest('hex')}  ${basename(recordPath)}\n`,
  );
  await writeFile(
    observationPath,
    `${JSON.stringify({ ...observation(), ...overrides }, null, 2)}\n`,
  );
  return { observationPath, recordPath };
}

async function verifyCandidate(overrides = {}) {
  const { observationPath, recordPath } = await writeCandidate(overrides);
  return run(candidateVerifier, [
    '--record',
    recordPath,
    '--checksum',
    `${recordPath}.sha256`,
    '--observation',
    observationPath,
    '--expected-sha',
    sha,
    '--expected-project-ref',
    'abcdefghijklmnopqrst',
    '--now',
    now,
  ]);
}

describe('Production Candidate verification', () => {
  it('accepts a checksummed exact-SHA protected candidate', async () => {
    expect(await verifyCandidate()).toEqual({
      code: 0,
      stderr: '',
      stdout: 'PRODUCTION_CANDIDATE_VERIFIED\n',
    });
  });

  it.each([
    ['SHA mismatch', { git_sha: 'b'.repeat(40) }],
    [
      'stale Staging gate',
      { staging_gate_observed_at_utc: '2026-08-04T00:00:00.000Z' },
    ],
    [
      'stale backup',
      { backup_freshness_observed_at_utc: '2026-08-04T00:00:00.000Z' },
    ],
    ['Production marker', { production_marker_count: 1 }],
    ['Staging redirect', { redirected_to_staging: true }],
    ['unprotected URL', { deployment_protection: 'missing' }],
    ['fixture identities', { fixture_identity_count: 1 }],
    ['non-formal content', { content_inventory_status: 'draft' }],
  ])('rejects %s', async (_name, mutation) => {
    const result = await verifyCandidate(mutation);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('PRODUCTION_CANDIDATE_INVALID\n');
  });
});

describe('Production release workflows', () => {
  it('creates a protected Candidate without assigning a domain', async () => {
    const workflow = await readFile(
      '.github/workflows/production-candidate.yml',
      'utf8',
    );

    expect(workflow).toContain('environment: production-candidate');
    expect(workflow).toContain('COLORPLAY_DEPLOYMENT_ENVIRONMENT: production');
    expect(workflow).toContain('colorplay-web');
    expect(workflow).toContain('vercel deploy --prebuilt --prod --skip-domain');
    expect(workflow).toContain('staging-gate');
    expect(workflow).toContain('backup-freshness');
    expect(workflow).toContain('verify-candidate.mjs');
    expect(workflow).toContain('CANDIDATE_VERCEL_TOKEN');
    expect(workflow).not.toContain('PROMOTION_VERCEL_TOKEN');
    expect(workflow).not.toContain('vercel promote');
  });

  it('promotes only the checksummed artifact under protected approval', async () => {
    const workflow = await readFile(
      '.github/workflows/production-promote.yml',
      'utf8',
    );
    const promoteIndex = workflow.indexOf('vercel promote');
    const smokeIndex = workflow.indexOf('Three immediate read-only samples');
    const parityIndex = workflow.indexOf('verify-main-parity.mjs');
    const tagIndex = workflow.indexOf('git push origin "$release_tag"');

    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('PROMOTION_VERCEL_TOKEN');
    expect(workflow).not.toContain('CANDIDATE_VERCEL_TOKEN');
    expect(workflow).toContain('release-record.mjs verify');
    expect(promoteIndex).toBeGreaterThan(0);
    expect(workflow).not.toMatch(/vercel (?:deploy|build)/u);
    expect(smokeIndex).toBeGreaterThan(promoteIndex);
    expect(parityIndex).toBeGreaterThan(smokeIndex);
    expect(tagIndex).toBeGreaterThan(parityIndex);
    expect(workflow).toContain(
      'git merge-base --is-ancestor origin/main "$APPROVED_SHA"',
    );
    expect(workflow).toContain('git push origin "$APPROVED_SHA:main"');
    expect(workflow).toContain('rollback-web.sh');
    expect(workflow).not.toMatch(
      /supabase db (?:reset|down)|seed-auth|\/login/u,
    );
  });

  it('verifies main, Vercel source, and tag all point to one SHA', async () => {
    const { recordPath } = await writeCandidate();
    const observationPath = resolve(root, 'observation.json');
    const result = await run(parityVerifier, [
      '--record',
      recordPath,
      '--checksum',
      `${recordPath}.sha256`,
      '--observation',
      observationPath,
      '--expected-project-ref',
      'abcdefghijklmnopqrst',
      '--main-sha',
      sha,
      '--vercel-source-sha',
      sha,
      '--tag-sha',
      sha,
      '--now',
      now,
    ]);
    expect(result).toEqual({
      code: 0,
      stderr: '',
      stdout: 'PRODUCTION_MAIN_PARITY_VERIFIED\n',
    });
  });
});
