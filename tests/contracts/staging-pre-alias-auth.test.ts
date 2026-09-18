import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

it('requires exact-artifact authentication proof before assigning the Staging alias', async () => {
  const workflow = await readFile(
    '.github/workflows/staging-deploy.yml',
    'utf8',
  );
  const deploy = workflow.indexOf('pnpm exec vercel deploy --prebuilt');
  const functions = workflow.indexOf('pnpm exec supabase functions deploy');
  const proof = workflow.indexOf(
    'pnpm exec tsx scripts/release/staging-artifact-auth.ts',
  );
  const alias = workflow.indexOf('pnpm exec vercel alias set');
  expect(deploy).toBeGreaterThan(0);
  expect(functions).toBeGreaterThan(deploy);
  expect(proof).toBeGreaterThan(functions);
  expect(alias).toBeGreaterThan(proof);
  expect(workflow).toContain('STAGING_AUTH_EXPECTED_SHA: ${{ github.sha }}');
  expect(workflow.slice(proof, alias)).not.toContain('continue-on-error');
  expect(workflow.slice(proof, alias)).not.toContain('always()');
});

it('reports a safe Vercel API stage when the CLI fails before browser launch', async () => {
  const fakeBin = await mkdtemp(resolve(tmpdir(), 'colorplay-vercel-failure-'));
  tempRoots.push(fakeBin);
  const fakeVercel = resolve(fakeBin, 'vercel');
  await writeFile(
    fakeVercel,
    '#!/bin/sh\necho "SENSITIVE_MARKER_FROM_CHILD" >&2\nexit 1\n',
  );
  await chmod(fakeVercel, 0o755);

  const result = spawnSync(
    resolve('node_modules/.bin/tsx'),
    ['scripts/release/staging-artifact-auth.ts'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
        STAGING_AUTH_DEPLOYMENT_ID: 'dpl_diagnostic',
        STAGING_AUTH_EXPECTED_SHA: 'a'.repeat(40),
        VERCEL_ORG_ID: 'team_diagnostic',
        VERCEL_PROJECT_ID: 'prj_diagnostic',
        VITE_SUPABASE_ANON_KEY: 'sb_publishable_diagnostic',
        VITE_SUPABASE_URL: 'https://onkxnkzeixpezetkmocf.supabase.co',
      },
    },
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('STAGING_ARTIFACT_AUTH_FAILED:VERCEL_API');
  expect(result.stderr).not.toContain('SENSITIVE_MARKER_FROM_CHILD');
});
