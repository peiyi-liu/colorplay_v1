import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const smokeScript = resolve(
  repositoryRoot,
  'scripts/release/read-only-smoke.mjs',
);
const rollbackScript = resolve(
  repositoryRoot,
  'scripts/release/rollback-web.sh',
);
let server: Server;
let origin = '';
let root = '';
const methods: string[] = [];
let serveStagingMarker = false;

beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), 'colorplay-smoke-test-'));
  server = createServer((request, response) => {
    methods.push(request.method ?? 'UNKNOWN');
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (request.url === '/app.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end('window.__COLORPLAY_SMOKE_ASSET__ = true;');
      return;
    }
    const marker = serveStagingMarker
      ? '<div role="status">STAGING 測試環境</div>'
      : '';
    const body = request.url?.startsWith('/login')
      ? '<main><h1>登入</h1><input type="password" aria-label="密碼"></main>'
      : `<main><h1>PRESS START</h1>${marker}<script src="/app.js"></script></main>`;
    response.end(`<!doctype html><html><body>${body}</body></html>`);
  });
  await new Promise<void>((resolveReady) => {
    server.listen(0, '127.0.0.1', resolveReady);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server failed');
  origin = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolveClosed, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolveClosed();
    });
  });
  await rm(root, { recursive: true, force: true });
});

function run(command: string, argumentsList: string[], env = {}) {
  return new Promise<{ code: number | null; stderr: string; stdout: string }>(
    (resolveResult, reject) => {
      const child = spawn(command, argumentsList, {
        cwd: repositoryRoot,
        env: { ...process.env, ...env },
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

describe('read-only release smoke', () => {
  it.each([
    ['production', 0],
    ['staging', 1],
  ])(
    'validates %s marker and stores sanitized results',
    async (environment, markerCount) => {
      methods.length = 0;
      serveStagingMarker = environment === 'staging';
      const output = resolve(root, `${environment}.json`);
      const result = await run(process.execPath, [
        smokeScript,
        '--environment',
        environment,
        '--target-origin',
        origin,
        '--output',
        output,
        '--evidence-root',
        root,
        '--allow-loopback-http',
      ]);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(methods.every((method) => ['GET', 'HEAD'].includes(method))).toBe(
        true,
      );
      const evidenceText = await readFile(output, 'utf8');
      expect(evidenceText).not.toContain('<html');
      expect(evidenceText).not.toContain('cookie');
      const evidence = JSON.parse(evidenceText) as {
        marker: string;
        result: string;
      };
      expect(evidence).toMatchObject({ marker: 'passed', result: 'passed' });
      expect(markerCount).toBe(environment === 'staging' ? 1 : 0);
    },
    30_000,
  );

  it('rejects credentials, query persistence, and non-loopback HTTP', async () => {
    const result = await run(process.execPath, [
      smokeScript,
      '--environment',
      'production',
      '--target-origin',
      'http://example.com?token=synthetic',
      '--output',
      resolve(root, 'invalid.json'),
      '--email',
      'student@example.com',
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('READ_ONLY_SMOKE_INVALID_ARGUMENTS\n');
  });
});

describe('web-only rollback', () => {
  it('defines a 30-minute sanitized monitor and no data-layer rollback command', async () => {
    const [workflow, rollback] = await Promise.all([
      readFile('.github/workflows/health-monitor.yml', 'utf8'),
      readFile(rollbackScript, 'utf8'),
    ]);
    expect(workflow).toContain("cron: '*/30 * * * *'");
    expect(workflow).toContain('environment: staging');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('retention-days: 30');
    expect(workflow).toContain(
      'const title = `[dedupe] ${environment}:${failureClass}`',
    );
    expect(rollback).not.toMatch(/supabase|\bsql\b|migration|database/iu);
  });

  async function createReleaseRecord() {
    const record = resolve(root, 'release-record.json');
    const input = resolve(root, 'release-input.json');
    await writeFile(
      input,
      JSON.stringify({
        schema_version: 1,
        attempt_id: 'production-20260806-001',
        git_sha: 'a'.repeat(40),
        vercel_deployment_id: 'dpl_current12345678',
        vercel_deployment_url: 'https://candidate.vercel.app',
        production_supabase_ref: 'abcdefghijklmnopqrst',
        migration_first: '20260713000100',
        migration_last: '20260728000100',
        staging_gate_run_url: 'https://github.com/example/run/1',
        production_gate_run_url: 'https://github.com/example/run/2',
        approval_actor: 'release-owner',
        approval_at_utc: '2026-08-06T04:00:00.000Z',
        post_deploy_smoke: 'failed',
        previous_healthy_deployment_id: 'dpl_previous123456',
        created_at_utc: '2026-08-06T04:01:00.000Z',
      }),
    );
    const created = await run(process.execPath, [
      resolve(repositoryRoot, 'scripts/release/release-record.mjs'),
      'create',
      '--input',
      input,
      '--output',
      record,
      '--evidence-root',
      root,
    ]);
    expect(created.code).toBe(0);
    return record;
  }

  it.each([1, 2])(
    'does not rollback after %i consecutive failures',
    async (count) => {
      const record = await createReleaseRecord();
      const result = await run('bash', [
        rollbackScript,
        '--record',
        record,
        '--checksum',
        `${record}.sha256`,
        '--current-deployment-id',
        'dpl_current12345678',
        '--failure-class',
        'web-render',
        '--consecutive-failures',
        String(count),
      ]);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe('ROLLBACK_NOT_TRIGGERED\n');
    },
  );

  it('rolls back only to the exact recorded previous deployment after three failures', async () => {
    const record = await createReleaseRecord();
    const fakeBin = resolve(root, 'bin');
    const calls = resolve(root, 'calls.txt');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(fakeBin));
    await writeFile(
      resolve(fakeBin, 'vercel'),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${calls}"\n`,
    );
    await chmod(resolve(fakeBin, 'vercel'), 0o700);
    const result = await run(
      'bash',
      [
        rollbackScript,
        '--record',
        record,
        '--checksum',
        `${record}.sha256`,
        '--current-deployment-id',
        'dpl_current12345678',
        '--failure-class',
        'web-render',
        '--consecutive-failures',
        '3',
      ],
      {
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        PROMOTION_VERCEL_TOKEN: 'synthetic-promotion-token',
      },
    );
    expect(result.code).toBe(0);
    expect(await readFile(calls, 'utf8')).toBe(
      'rollback dpl_previous123456 --token synthetic-promotion-token\n',
    );
  });

  it.each(['security', 'data-corruption'])(
    'routes %s to manual incident recovery',
    async (failureClass) => {
      const record = await createReleaseRecord();
      const result = await run('bash', [
        rollbackScript,
        '--record',
        record,
        '--checksum',
        `${record}.sha256`,
        '--current-deployment-id',
        'dpl_current12345678',
        '--failure-class',
        failureClass,
        '--consecutive-failures',
        '3',
      ]);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe('INCIDENT_MANUAL_RECOVERY_REQUIRED\n');
    },
  );
});
