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

import { finalizeClassroomLeaderboard } from '../../scripts/acceptance/finalize-classroom-leaderboard.mjs';

const acceptanceIds = [
  'AC-AUTH-005',
  'AC-AUTH-006',
  'AC-AUTH-007',
  'AC-GAME-008',
  'AC-GAME-009',
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
  "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Classroom and Leaderboard v2 phase gate'",
] as const;
const temporaryDirectories: string[] = [];
const pngEvidence = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const webmEvidence = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const expectedFailures = [
  {
    expected_count: 1,
    observed_count: 1,
    status: 400,
    url_pattern: /\/rest\/v1\/rpc\/join_classroom(?:\?.*)?$/u.source,
  },
] as const;

const createFixture = async () => {
  const root = await mkdtemp(
    join(tmpdir(), 'colorplay-classroom-leaderboard-'),
  );
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
      git_sha: 'c'.repeat(40),
      phase: 'classroom-leaderboard-v2',
      supabase_environment: 'local',
    })}\n`,
  );
  await writeFile(
    join(root, 'reports/browser-health.json'),
    `${JSON.stringify({
      console_errors: 0,
      expected_failures: expectedFailures,
      failed_requests: 0,
      page_errors: 0,
      server_errors: 0,
    })}\n`,
  );
  const rows = commandLabels.map((label, index) => {
    const report = `reports/command-${String(index + 1)}.log`;
    return `${label}\t2026-07-17T04:00:00.000Z\t100\t${report}\t0`;
  });
  await writeFile(join(root, 'reports/commands.tsv'), `${rows.join('\n')}\n`);
  await Promise.all(
    commandLabels.map((_label, index) =>
      writeFile(
        join(root, `reports/command-${String(index + 1)}.log`),
        'passed\n',
      ),
    ),
  );
  await Promise.all([
    writeFile(
      join(root, 'screenshots/classroom-join-375x812.png'),
      pngEvidence,
    ),
    writeFile(
      join(root, 'screenshots/classroom-leaderboard-768x1024.png'),
      pngEvidence,
    ),
    writeFile(
      join(root, 'screenshots/classroom-teacher-management-1440x900.png'),
      pngEvidence,
    ),
    writeFile(join(root, 'videos/classroom-leaderboard.webm'), webmEvidence),
    writeFile(join(root, 'traces/classroom-leaderboard.zip'), 'trace'),
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

describe('Classroom and Leaderboard phase gate source', () => {
  it('exposes the exact package entry and ordered clean local runner', async () => {
    const [packageSource, runner, finalizer] = await Promise.all([
      readFile('package.json', 'utf8'),
      readFile('scripts/acceptance/run-classroom-leaderboard.sh', 'utf8'),
      readFile('scripts/acceptance/finalize-classroom-leaderboard.mjs', 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['phase:classroom-leaderboard']).toBe(
      'bash scripts/acceptance/run-classroom-leaderboard.sh',
    );
    expect(packageJson.scripts['test:e2e']).toContain(
      'Classroom and Leaderboard v2 phase gate',
    );
    const ordered = [
      'pnpm format:check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
      'pnpm test:db',
      'pnpm exec supabase db reset --local',
      'pnpm exec tsx scripts/supabase/seed-auth.ts',
      'unset SUPABASE_SERVICE_ROLE_KEY',
      "bash scripts/test-e2e-local.sh --project=chromium --headed --grep='Classroom and Leaderboard v2 phase gate'",
      'node scripts/acceptance/finalize-classroom-leaderboard.mjs',
    ];
    let previous = -1;
    for (const step of ordered) {
      const index = runner.indexOf(step);
      expect(index, `missing or out-of-order: ${step}`).toBeGreaterThan(
        previous,
      );
      previous = index;
    }
    expect(runner).toContain('git status --porcelain=v1 --untracked-files=all');
    expect(runner).toContain('CLASSROOM_LEADERBOARD_DIRTY_WORKTREE');
    expect(runner).toContain('classroom-leaderboard-${git_sha}');
    expect(runner).not.toMatch(
      /(?:echo|printf).*\$(?:SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)/u,
    );
    expect(finalizer).toContain("from './evidence-policy.mjs'");
    expect(finalizer).toContain('assertEvidenceSafe');
    expect(finalizer).toContain('requireNonEmptyEvidence');
  });

  it('defines one acceptance-only real flow with required actors and viewports', async () => {
    const source = await readFile(
      'tests/e2e/classroom-leaderboard.spec.ts',
      'utf8',
    );
    expect(source).toContain("test('Classroom and Leaderboard v2 phase gate'");
    expect(source).toContain("process.env.PLAYWRIGHT_ACCEPTANCE !== 'on'");
    expect(source).toContain('CLASSROOM_LEADERBOARD_ACCEPTANCE_MODE_REQUIRED');
    expect(source).toContain('attachBrowserHealth');
    expect(source.match(/declareExpectedBrowserFailure\(/gu)).toHaveLength(1);
    expect(source).toContain('urlPattern: joinClassroomRpcPattern');
    expect(source).toContain('status: 400');
    expect(source).toContain('count: 1');
    expect(source).toContain('expectedBrowserFailures(studentAHealth)');
    expect(source).toContain('unexpectedBrowserHealth');
    expect(source).toContain('GENERATED_CORRECT_ANSWERS');
    expect(source).toContain('TEST_USERS.teacherTwo');
    expect(source).toContain('TEST_USERS.outsider');
    expect(source).toContain("scope: 'local'");
    expect(source.match(/browser\.newContext\(\{ baseURL \}\)/gu)).toHaveLength(
      4,
    );
    expect(source).toContain(
      "await expect(teacherPage.getByRole('row')).toHaveCount(2);",
    );
    expect(source).toContain('const classroomIdPattern =');
    expect(source).toContain('const teacherClassroomUrlPattern =');
    expect(source).toContain(
      'await teacherPage.waitForURL(teacherClassroomUrlPattern);',
    );
    expect(source).toContain('!classroomIdPattern.test(classroomId)');
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
    expect(source).not.toContain('ERR_ABORTED');
    expect(source).not.toContain('ignoreExpectedBrowserFailure');
  });
});

describe('Classroom and Leaderboard finalizer', () => {
  it('emits one deterministic PASS manifest with exactly five exit IDs', async () => {
    const root = await createFixture();
    const first = await finalizeClassroomLeaderboard(root);
    const firstSource = await readFile(join(root, 'manifest.json'), 'utf8');
    const second = await finalizeClassroomLeaderboard(root);
    expect(second).toEqual(first);
    expect(await readFile(join(root, 'manifest.json'), 'utf8')).toBe(
      firstSource,
    );
    expect(first).toMatchObject({
      acceptance_ids: acceptanceIds,
      browser_health: {
        console_errors: 0,
        expected_failures: expectedFailures,
        failed_requests: 0,
        page_errors: 0,
        server_errors: 0,
      },
      decision: 'PASS',
      dirty_worktree: false,
      git_sha: 'c'.repeat(40),
      phase: 'classroom-leaderboard-v2',
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
    ['screenshot', 'screenshots/classroom-join-375x812.png'],
    ['video', 'videos/classroom-leaderboard.webm'],
    ['trace', 'traces/classroom-leaderboard.zip'],
    ['report', 'reports/command-1.log'],
  ])('fails closed when required %s is missing', async (_kind, path) => {
    const root = await createFixture();
    await unlink(join(root, path));
    await expect(finalizeClassroomLeaderboard(root)).rejects.toThrow(
      'CLASSROOM_LEADERBOARD_REQUIRED_EVIDENCE_MISSING',
    );
  });

  it.each([
    'console_errors',
    'page_errors',
    'failed_requests',
    'server_errors',
  ] as const)('fails closed when browser health reports %s', async (field) => {
    const root = await createFixture();
    await writeFile(
      join(root, 'reports/browser-health.json'),
      `${JSON.stringify({
        console_errors: 0,
        expected_failures: expectedFailures,
        failed_requests: 0,
        page_errors: 0,
        server_errors: 0,
        [field]: 1,
      })}\n`,
    );
    await expect(finalizeClassroomLeaderboard(root)).rejects.toThrow(
      'CLASSROOM_LEADERBOARD_BROWSER_HEALTH_FAILED',
    );
  });

  it('fails closed when the declared join rejection is missing or over-observed', async () => {
    for (const observedCount of [0, 2]) {
      const root = await createFixture();
      await writeFile(
        join(root, 'reports/browser-health.json'),
        `${JSON.stringify({
          console_errors: 0,
          expected_failures: [
            { ...expectedFailures[0], observed_count: observedCount },
          ],
          failed_requests: 0,
          page_errors: 0,
          server_errors: 0,
        })}\n`,
      );
      await expect(finalizeClassroomLeaderboard(root)).rejects.toThrow(
        'CLASSROOM_LEADERBOARD_BROWSER_HEALTH_FAILED',
      );
    }
  });

  it('rejects sensitive text but accepts email-shaped compressed WebM bytes', async () => {
    const textRoot = await createFixture();
    await writeFile(
      join(textRoot, 'reports/leak.json'),
      '{"email":"x@example.test"}',
    );
    await expect(finalizeClassroomLeaderboard(textRoot)).rejects.toThrow(
      'CLASSROOM_LEADERBOARD_SENSITIVE_EVIDENCE',
    );
    const binaryRoot = await createFixture();
    await writeFile(
      join(binaryRoot, 'videos/classroom-leaderboard.webm'),
      Buffer.concat([webmEvidence, Buffer.from('ab@cd.ef')]),
    );
    await expect(
      finalizeClassroomLeaderboard(binaryRoot),
    ).resolves.toMatchObject({
      decision: 'PASS',
    });
  });

  it('rejects invalid binary magic, WebM metadata leaks, and wrong extensions', async () => {
    const corrupt = await createFixture();
    await writeFile(join(corrupt, 'videos/classroom-leaderboard.webm'), 'bad');
    await expect(finalizeClassroomLeaderboard(corrupt)).rejects.toThrow(
      'CLASSROOM_LEADERBOARD_INVALID_BINARY_EVIDENCE',
    );
    const metadata = await createFixture();
    const email = Buffer.from('learner@example.test');
    await writeFile(
      join(metadata, 'videos/classroom-leaderboard.webm'),
      Buffer.concat([
        webmEvidence,
        Buffer.from([0x7b, 0xa9, 0x80 | email.length]),
        email,
      ]),
    );
    await expect(finalizeClassroomLeaderboard(metadata)).rejects.toThrow(
      'CLASSROOM_LEADERBOARD_SENSITIVE_EVIDENCE',
    );
    const wrong = await createFixture();
    await unlink(join(wrong, 'screenshots/classroom-join-375x812.png'));
    await writeFile(
      join(wrong, 'screenshots/classroom-join-375x812.txt'),
      'not png',
    );
    await expect(finalizeClassroomLeaderboard(wrong)).rejects.toThrow(
      'CLASSROOM_LEADERBOARD_REQUIRED_EVIDENCE_MISSING',
    );
  });

  it('rejects nonzero commands, bad source state, and path traversal', async () => {
    const command = await createFixture();
    const commandSource = await readFile(
      join(command, 'reports/commands.tsv'),
      'utf8',
    );
    await writeFile(
      join(command, 'reports/commands.tsv'),
      commandSource.replace(/\t0\n/u, '\t1\n'),
    );
    await expect(finalizeClassroomLeaderboard(command)).rejects.toThrow(
      'CLASSROOM_LEADERBOARD_COMMAND_REPORT_INVALID',
    );

    const baseline = await createFixture();
    for (const [label, metadata] of [
      ['dirty', { dirty_worktree: true }],
      ['remote', { supabase_environment: 'production' }],
      ['sha', { git_sha: 'short' }],
    ] as const) {
      const root = `${baseline}-${label}`;
      temporaryDirectories.push(root);
      await cp(baseline, root, { recursive: true });
      const run = JSON.parse(
        await readFile(join(root, 'run.json'), 'utf8'),
      ) as object;
      await writeFile(
        join(root, 'run.json'),
        `${JSON.stringify({ ...run, ...metadata })}\n`,
      );
      await expect(finalizeClassroomLeaderboard(root)).rejects.toThrow(
        'CLASSROOM_LEADERBOARD_INVALID_SOURCE_STATE',
      );
    }

    const traversal = await createFixture();
    const rows = await readFile(
      join(traversal, 'reports/commands.tsv'),
      'utf8',
    );
    await writeFile(
      join(traversal, 'reports/commands.tsv'),
      rows.replace('reports/command-1.log', 'reports/../run.json'),
    );
    await expect(finalizeClassroomLeaderboard(traversal)).rejects.toThrow(
      'CLASSROOM_LEADERBOARD_COMMAND_REPORT_INVALID',
    );
  });
});
