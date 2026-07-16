import { Buffer } from 'node:buffer';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { finalizeAchievements } from '../../scripts/acceptance/finalize-achievements.mjs';

const acceptanceIds = [
  'AC-ACH-001',
  'AC-ACH-002',
  'AC-ACH-003',
  'AC-ACH-004',
  'AC-ACH-005',
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
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Achievements phase gate'",
] as const;

const temporaryDirectories: string[] = [];
const pngEvidence = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const webmEvidence = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'colorplay-achievements-'));
  temporaryDirectories.push(root);
  await Promise.all(
    ['reports', 'screenshots', 'videos', 'traces'].map((directory) =>
      mkdir(join(root, directory), { recursive: true }),
    ),
  );
  await writeFile(
    join(root, 'run.json'),
    `${JSON.stringify({
      acceptance_ids: acceptanceIds,
      dirty_worktree: false,
      git_sha: 'b'.repeat(40),
      phase: 'achievements',
      supabase_environment: 'local',
    })}\n`,
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
  const rows = commandLabels.map((label, index) => {
    const report = `reports/command-${String(index + 1)}.log`;
    return `${label}\t2026-07-16T12:00:00.000Z\t100\t${report}\t0`;
  });
  await writeFile(join(root, 'reports/commands.tsv'), `${rows.join('\n')}\n`);
  await Promise.all(
    commandLabels.map((_label, index) =>
      writeFile(
        join(root, `reports/command-${String(index + 1)}.log`),
        'command passed\n',
      ),
    ),
  );
  await Promise.all([
    writeFile(join(root, 'screenshots/badges-375x812.png'), pngEvidence),
    writeFile(join(root, 'screenshots/badges-768x1024.png'), pngEvidence),
    writeFile(join(root, 'screenshots/badges-1440x900.png'), pngEvidence),
    writeFile(join(root, 'videos/achievements.webm'), webmEvidence),
    writeFile(join(root, 'traces/achievements.zip'), 'trace'),
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

describe('Achievements phase gate source', () => {
  it('exposes the exact package entry point and ordered clean local runner', async () => {
    const [packageSource, runner] = await Promise.all([
      readFile('package.json', 'utf8'),
      readFile('scripts/acceptance/run-achievements.sh', 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['phase:achievements']).toBe(
      'bash scripts/acceptance/run-achievements.sh',
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
      "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Achievements phase gate'",
      'node scripts/acceptance/finalize-achievements.mjs',
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
    expect(runner).toContain('ACHIEVEMENTS_DIRTY_WORKTREE');
    expect(runner).toContain('achievements-${git_sha}');
    expect(runner).toContain('pnpm exec supabase status -o env 2>/dev/null');
    expect(runner).not.toMatch(
      /(?:echo|printf).*\$(?:SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)/u,
    );
  });

  it('defines one real headed flow and security probe without privileged setup', async () => {
    const source = await readFile('tests/e2e/achievements.spec.ts', 'utf8');

    expect(source).toContain("test('Achievements phase gate'");
    expect(source).toContain('attachBrowserHealth');
    expect(source).toContain('unexpectedBrowserHealth');
    expect(source).toContain("page.goto('/app/achievements')");
    expect(source).toContain('GENERATED_CORRECT_ANSWERS');
    expect(source).toContain(".from('achievement_unlocks')");
    expect(source).toContain(".from('achievement_progress')");
    for (const viewport of [
      'width: 375, height: 812',
      'width: 768, height: 1024',
      'width: 1440, height: 900',
    ]) {
      expect(source).toContain(viewport);
    }
    expect(source).not.toContain('page.route(');
    expect(source).not.toContain('test.skip(');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).not.toContain('service_role');
  });
});

describe('Achievements finalizer', () => {
  it('emits one deterministic sanitized PASS manifest with exactly five IDs', async () => {
    const root = await createFixture();

    const first = await finalizeAchievements(root);
    const firstSource = await readFile(join(root, 'manifest.json'), 'utf8');
    const second = await finalizeAchievements(root);
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
      git_sha: 'b'.repeat(40),
      phase: 'achievements',
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
    ['screenshot', 'screenshots/badges-375x812.png'],
    ['video', 'videos/achievements.webm'],
    ['trace', 'traces/achievements.zip'],
    ['command report', 'reports/command-1.log'],
  ])('fails closed when required %s is missing', async (_kind, path) => {
    const root = await createFixture();
    await unlink(join(root, path));

    await expect(finalizeAchievements(root)).rejects.toThrow(
      'ACHIEVEMENTS_REQUIRED_EVIDENCE_MISSING',
    );
  });

  it('rejects corrupt binary and sensitive textual evidence', async () => {
    const binaryRoot = await createFixture();
    await writeFile(join(binaryRoot, 'videos/achievements.webm'), 'corrupt');
    await expect(finalizeAchievements(binaryRoot)).rejects.toThrow(
      'ACHIEVEMENTS_INVALID_BINARY_EVIDENCE',
    );

    const textRoot = await createFixture();
    await writeFile(
      join(textRoot, 'reports/leak.log'),
      'learner@example.invalid',
    );
    await expect(finalizeAchievements(textRoot)).rejects.toThrow(
      'ACHIEVEMENTS_SENSITIVE_EVIDENCE',
    );
  });

  it('rejects dirty, non-local, or malformed source metadata', async () => {
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
      await expect(finalizeAchievements(root)).rejects.toThrow(
        'ACHIEVEMENTS_INVALID_SOURCE_STATE',
      );
    }
  });
});
