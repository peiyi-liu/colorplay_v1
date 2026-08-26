import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const requiredChecks = [
  'format',
  'lint',
  'typecheck',
  'unit-coverage',
  'production-build',
  'local-database',
  'chromium-e2e',
  'credential-scan',
  'owner-approval',
];

async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as {
    bypass_actors?: unknown[];
    conditions?: { ref_name?: { include?: string[] } };
    enforcement?: string;
    rules?: {
      type?: string;
      parameters?: {
        required_status_checks?: { context?: string }[];
      };
    }[];
    target?: string;
  };
}

describe('Phase 0 delivery workflows', () => {
  it('runs Feature CI for pull requests targeting staging only', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');

    expect(workflow).toMatch(/pull_request:\n\s+branches:\n\s+- staging/u);
    expect(workflow).not.toMatch(/pull_request:\n\s+branches:\n\s+- main/u);
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./u);
    expect(workflow).not.toContain('supabase link');
    expect(workflow).not.toContain('vercel deploy');
  });

  it('gives every independent CI job a clean pinned setup', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const setupCount = (
      workflow.match(/npm install --global "\$\(node --print/gmu) ?? []
    ).length;
    const nodeCount = (workflow.match(/node-version: '24\.13\.1'/gmu) ?? [])
      .length;
    const installCount = (
      workflow.match(/pnpm install --frozen-lockfile/gmu) ?? []
    ).length;

    expect(setupCount).toBe(8);
    expect(nodeCount).toBe(8);
    expect(installCount).toBe(8);
    expect(workflow).not.toMatch(/^\s+needs:/gmu);
  });

  it('keeps Local database and Chromium runners isolated', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    const databaseJob = workflow.slice(
      workflow.indexOf('  local-database:'),
      workflow.indexOf('  chromium-e2e:'),
    );
    const chromiumJob = workflow.slice(
      workflow.indexOf('  chromium-e2e:'),
      workflow.indexOf('  credential-scan:'),
    );

    expect(databaseJob).toContain('pnpm test:db');
    expect(chromiumJob).toContain('pnpm exec supabase start');
    expect(chromiumJob).toContain('pnpm exec supabase db reset --local');
    expect(chromiumJob).toContain(
      'pnpm exec tsx scripts/supabase/seed-auth.ts',
    );
    expect(chromiumJob).toContain('pnpm preview --host 127.0.0.1 --port 4173');
    expect(chromiumJob).toContain('pnpm test:e2e --project=chromium');
  });

  it('requires protected exact-SHA owner approval without executing PR code', async () => {
    const workflow = await readFile(
      '.github/workflows/owner-approval.yml',
      'utf8',
    );

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('pull_request_target');
    expect(workflow).not.toContain('actions/checkout');
    expect(workflow).toContain('environment: staging-approval');
    expect(workflow).toContain('pull_request_number:');
    expect(workflow).toContain('head_sha:');
    expect(workflow).toContain('^[0-9a-f]{40}$');
    expect(workflow).toContain("pull.base.ref !== 'staging'");
    expect(workflow).toContain('pull.head.sha !== expectedSha');
    expect(workflow).toContain("context: 'owner-approval'");
    expect(workflow).toMatch(
      /permissions:\n\s+contents: read\n\s+pull-requests: read\n\s+statuses: write/u,
    );
  });

  it.each([
    ['staging', '.github/rulesets/staging.json', 'refs/heads/staging'],
    ['main', '.github/rulesets/main.json', 'refs/heads/main'],
    [
      'production tags',
      '.github/rulesets/production-tags.json',
      'refs/tags/prod-*',
    ],
  ])('defines an active fail-closed %s ruleset', async (_name, path, ref) => {
    const ruleset = await readJson(path);
    const ruleTypes = ruleset.rules?.map(({ type }) => type) ?? [];
    const statusRule = ruleset.rules?.find(
      ({ type }) => type === 'required_status_checks',
    );
    const contexts =
      statusRule?.parameters?.required_status_checks?.map(
        ({ context }) => context,
      ) ?? [];

    expect(ruleset.enforcement).toBe('active');
    expect(ruleset.bypass_actors).toEqual([]);
    expect(ruleset.conditions?.ref_name?.include).toContain(ref);
    expect(ruleTypes).toContain('deletion');
    expect(ruleTypes).toContain('non_fast_forward');
    expect(contexts).toEqual(requiredChecks);
    expect(new Set(contexts).size).toBe(requiredChecks.length);
  });
});
