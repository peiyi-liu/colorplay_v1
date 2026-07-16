import { readFile } from 'node:fs/promises';
import { cp, mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { finalizeGameEconomy } from '../../scripts/acceptance/finalize-game-economy-v2.mjs';

const acceptanceIds = [
  'AC-GAME-001',
  'AC-GAME-002',
  'AC-GAME-003',
  'AC-GAME-004',
  'AC-GAME-005',
  'AC-GAME-006',
  'AC-GAME-007',
  'AC-SEC-001',
  'AC-SEC-002',
] as const;

const commandLabels = [
  'pnpm format:check',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm test:db',
  'pnpm exec supabase db reset --local',
  'pnpm exec tsx scripts/supabase/seed-auth.ts',
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Game Economy v2 phase gate'",
] as const;

const temporaryDirectories: string[] = [];

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'colorplay-game-economy-'));
  temporaryDirectories.push(root);
  await Promise.all(
    ['reports', 'screenshots', 'videos', 'traces'].map((directory) =>
      mkdir(join(root, directory), { recursive: true }),
    ),
  );
  await writeFile(
    join(root, 'run.json'),
    `${JSON.stringify(
      {
        acceptance_ids: acceptanceIds,
        dirty_worktree: false,
        git_sha: 'a'.repeat(40),
        phase: 'game-economy-v2',
        supabase_environment: 'local',
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(root, 'reports/browser-health.json'),
    `${JSON.stringify({
      console_errors: 0,
      failed_requests: 0,
      page_errors: 0,
      server_errors: 0,
    })}\n`,
  );
  const commandRows = commandLabels.map((label, index) => {
    const report = `reports/command-${String(index + 1)}.log`;
    return `${label}\t2026-07-16T08:00:00.000Z\t100\t${report}\t0`;
  });
  await writeFile(
    join(root, 'reports/commands.tsv'),
    `${commandRows.join('\n')}\n`,
  );
  await Promise.all(
    commandLabels.map((_label, index) =>
      writeFile(
        join(root, `reports/command-${String(index + 1)}.log`),
        'command passed\n',
      ),
    ),
  );
  await Promise.all([
    writeFile(join(root, 'screenshots/result-375x812.png'), 'image-one'),
    writeFile(join(root, 'screenshots/result-768x1024.png'), 'image-two'),
    writeFile(join(root, 'screenshots/result-1440x900.png'), 'image-three'),
    writeFile(join(root, 'videos/game-economy.webm'), 'video'),
    writeFile(join(root, 'traces/game-economy.zip'), 'trace'),
  ]);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Game Economy v2 phase gate source', () => {
  it('exposes the exact package entry point and ordered clean local runner', async () => {
    const [packageSource, runner] = await Promise.all([
      readFile('package.json', 'utf8'),
      readFile('scripts/acceptance/run-game-economy-v2.sh', 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['phase:game-economy']).toBe(
      'bash scripts/acceptance/run-game-economy-v2.sh',
    );

    const orderedSteps = [
      'pnpm format:check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
      'pnpm test:db',
      'pnpm exec supabase db reset --local',
      'pnpm exec tsx scripts/supabase/seed-auth.ts',
      'unset SUPABASE_SERVICE_ROLE_KEY',
      "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Game Economy v2 phase gate'",
      'node scripts/acceptance/finalize-game-economy-v2.mjs',
    ];
    let previous = -1;
    for (const step of orderedSteps) {
      const index = runner.indexOf(step);
      expect(index, `missing or out-of-order: ${step}`).toBeGreaterThan(
        previous,
      );
      previous = index;
    }
    expect(runner).toContain('git status --porcelain=v1 --untracked-files=all');
    expect(runner).toContain('GAME_ECONOMY_DIRTY_WORKTREE');
    expect(runner).toContain('game-economy-v2-${git_sha}');
    expect(runner).toContain('pnpm exec supabase status -o env 2>/dev/null');
    expect(runner).not.toMatch(
      /(?:echo|printf).*\$(?:SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)/u,
    );
  });

  it('defines a real headed flow with exact viewports and no browser API mocks', async () => {
    const spec = await readFile('tests/e2e/game-economy.spec.ts', 'utf8');

    expect(spec).toContain('Game Economy v2 phase gate');
    expect(spec).toContain('GAME_ECONOMY_PRECHECK');
    for (const viewport of [
      'width: 375, height: 812',
      'width: 768, height: 1024',
      'width: 1440, height: 900',
    ]) {
      expect(spec).toContain(viewport);
    }
    expect(spec).toContain('attachBrowserHealth');
    expect(spec).toContain('unexpectedBrowserHealth');
    expect(spec).toContain('wallet_transactions');
    expect(spec).not.toContain('page.route(');
    expect(spec).not.toContain('test.skip(');
    expect(spec).not.toContain(".from('wallets').update");
    expect(spec).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});

describe('Game Economy v2 finalizer', () => {
  it('emits one deterministic sanitized PASS manifest with the exact nine IDs', async () => {
    const root = await createFixture();

    const first = await finalizeGameEconomy(root);
    const firstSource = await readFile(join(root, 'manifest.json'), 'utf8');
    const second = await finalizeGameEconomy(root);
    const secondSource = await readFile(join(root, 'manifest.json'), 'utf8');

    expect(second).toEqual(first);
    expect(secondSource).toBe(firstSource);
    expect(first).toMatchObject({
      acceptance_ids: acceptanceIds,
      browser_health: {
        console_errors: 0,
        failed_requests: 0,
        page_errors: 0,
      },
      decision: 'PASS',
      dirty_worktree: false,
      git_sha: 'a'.repeat(40),
      phase: 'game-economy-v2',
      schema_version: 1,
      supabase_environment: 'local',
    });
    expect(first.artifacts.screenshots).toHaveLength(3);
    expect(first.artifacts.videos).toHaveLength(1);
    expect(first.artifacts.traces).toHaveLength(1);
    expect(first.commands).toHaveLength(commandLabels.length);
    expect(firstSource).not.toContain(root);
  });

  it.each([
    ['screenshot', 'screenshots/result-375x812.png'],
    ['video', 'videos/game-economy.webm'],
    ['trace', 'traces/game-economy.zip'],
    ['command report', 'reports/command-1.log'],
  ])('fails closed when a required %s is missing', async (_kind, path) => {
    const root = await createFixture();
    await unlink(join(root, path));

    await expect(finalizeGameEconomy(root)).rejects.toThrow(
      /GAME_ECONOMY_REQUIRED_EVIDENCE_MISSING/u,
    );
  });

  it.each(['console_errors', 'page_errors', 'failed_requests'] as const)(
    'fails closed when browser health reports %s',
    async (field) => {
      const root = await createFixture();
      await writeFile(
        join(root, 'reports/browser-health.json'),
        `${JSON.stringify({
          console_errors: 0,
          failed_requests: 0,
          page_errors: 0,
          server_errors: 0,
          [field]: 1,
        })}\n`,
      );

      await expect(finalizeGameEconomy(root)).rejects.toThrow(
        'GAME_ECONOMY_BROWSER_HEALTH_FAILED',
      );
    },
  );

  it.each([
    'learner@example.invalid',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
  ])('rejects sensitive evidence content', async (sensitiveValue) => {
    const root = await createFixture();
    await writeFile(join(root, 'reports/leak.txt'), sensitiveValue);

    await expect(finalizeGameEconomy(root)).rejects.toThrow(
      'GAME_ECONOMY_SENSITIVE_EVIDENCE',
    );
  });

  it('rejects non-local, dirty, or malformed source metadata', async () => {
    const baseline = await createFixture();
    for (const [label, metadata] of [
      ['dirty', { dirty_worktree: true }],
      ['remote', { supabase_environment: 'production' }],
      ['sha', { git_sha: 'short' }],
    ] as const) {
      const root = `${baseline}-${label}`;
      temporaryDirectories.push(root);
      await cp(baseline, root, { recursive: true });
      const source = JSON.parse(
        await readFile(join(root, 'run.json'), 'utf8'),
      ) as Record<string, unknown>;
      await writeFile(
        join(root, 'run.json'),
        `${JSON.stringify({ ...source, ...metadata })}\n`,
      );
      await expect(finalizeGameEconomy(root)).rejects.toThrow(
        'GAME_ECONOMY_INVALID_SOURCE_STATE',
      );
    }
  });
});
