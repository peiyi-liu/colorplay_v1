import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import playwrightConfig from '../../playwright.config';
import {
  createEvidenceRun,
  type CreateEvidenceRunOptions,
} from '../../scripts/acceptance/create-run.mjs';
import { countAcceptanceIds } from '../../scripts/verify/count-acceptance.mjs';

const execFileAsync = promisify(execFile);

async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFilesRecursively(path) : [path];
    }),
  );
  return files.flat();
}

describe('acceptance metadata', () => {
  it('counts every normative acceptance ID including A11Y', async () => {
    const markdown = await readFile(
      'acceptance/ACCEPTANCE_CRITERIA.md',
      'utf8',
    );

    expect(countAcceptanceIds(markdown)).toHaveLength(84);
  });

  it('keeps the package manifest count synchronized', async () => {
    const manifest = JSON.parse(
      await readFile('DOCUMENT_MANIFEST.json', 'utf8'),
    ) as {
      acceptance_criteria: number;
      unique_acceptance_criteria: number;
    };

    expect(manifest).toMatchObject({
      acceptance_criteria: 84,
      unique_acceptance_criteria: 84,
    });
  });

  it('creates deterministic blocked runs with no fabricated evidence', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'colorplay-evidence-'));
    const firstOutput = join(temporaryRoot, 'first');
    const secondOutput = join(temporaryRoot, 'second');
    const secretFromEnvironment = randomUUID();
    const previousSecret = process.env.COLORPLAY_ACCEPTANCE_TEST_SECRET;
    process.env.COLORPLAY_ACCEPTANCE_TEST_SECRET = secretFromEnvironment;

    const options = {
      appUrl: 'http://127.0.0.1:4173',
      browser: { name: 'chromium', version: '123.0.0' },
      commands: [
        {
          command: 'pnpm test',
          duration_ms: 1250,
          exit_code: 0,
          report_path: 'reports/unit.txt',
          started_at: '2026-07-14T00:00:00.000Z',
        },
      ],
      dirtyWorktree: false,
      finishedAt: '2026-07-14T00:05:00.000Z',
      gitSha: '0123456789abcdef0123456789abcdef01234567',
      os: { name: 'darwin', version: '25.5.0' },
      runId: 'task-6-deterministic',
      startedAt: '2026-07-14T00:00:00.000Z',
      supabaseEnvironment: 'local',
      viewports: [
        { height: 812, width: 375 },
        { height: 1024, width: 768 },
        { height: 900, width: 1440 },
      ],
    } as const;

    try {
      await createEvidenceRun({ ...options, outputRoot: firstOutput });
      await createEvidenceRun({ ...options, outputRoot: secondOutput });

      const firstManifestText = await readFile(
        join(firstOutput, options.runId, 'manifest.json'),
        'utf8',
      );
      const secondManifestText = await readFile(
        join(secondOutput, options.runId, 'manifest.json'),
        'utf8',
      );
      const firstSummary = await readFile(
        join(firstOutput, options.runId, 'summary.md'),
        'utf8',
      );
      const secondSummary = await readFile(
        join(secondOutput, options.runId, 'summary.md'),
        'utf8',
      );
      const manifest = JSON.parse(firstManifestText) as {
        acceptance: {
          evidence_files: string[];
          id: string;
          status: string;
        }[];
        app_url: string;
        browser: { name: string; version: string };
        commands: { command: string; exit_code: number }[];
        dirty_worktree: boolean;
        finished_at: string;
        git_sha: string;
        known_failures: unknown[];
        os: { name: string; version: string };
        real_devices: unknown[];
        release_decision: string;
        run_id: string;
        started_at: string;
        status_counts: Record<string, number>;
        supabase_environment: string;
        viewports: { height: number; width: number }[];
      };
      const markdown = await readFile(
        'acceptance/ACCEPTANCE_CRITERIA.md',
        'utf8',
      );

      expect(secondManifestText).toBe(firstManifestText);
      expect(secondSummary).toBe(firstSummary);
      for (const requiredSection of [
        '## 5. Required Screenshot Inventory',
        '## 6. Data Integrity Proof',
        '## 7. Security Proof',
        '## 8. Browser Health',
        '## 9. Accessibility and Performance',
        '## 10. Manual Exploratory Checklist',
        '## 11. Real Device Inventory',
        '## 12. Known Failures / Not Verified',
        '## 13. Reviewer Sign-off',
      ]) {
        expect(firstSummary).toContain(requiredSection);
      }
      expect(manifest).toMatchObject({
        app_url: options.appUrl,
        browser: options.browser,
        commands: options.commands,
        dirty_worktree: false,
        finished_at: options.finishedAt,
        git_sha: options.gitSha,
        known_failures: [],
        os: options.os,
        real_devices: [],
        release_decision: 'BLOCKED',
        run_id: options.runId,
        started_at: options.startedAt,
        status_counts: {
          FAIL: 0,
          'NOT APPLICABLE': 0,
          'NOT VERIFIED': 84,
          PASS: 0,
        },
        supabase_environment: options.supabaseEnvironment,
        viewports: options.viewports,
      });
      expect(manifest.acceptance.map(({ id }) => id)).toEqual(
        countAcceptanceIds(markdown),
      );
      expect(manifest.acceptance).toHaveLength(84);
      expect(
        manifest.acceptance.every(
          ({ evidence_files, status }) =>
            status === 'NOT VERIFIED' && evidence_files.length === 0,
        ),
      ).toBe(true);
      expect(`${firstManifestText}\n${firstSummary}`).not.toContain(
        secretFromEnvironment,
      );

      for (const directory of [
        'db',
        'network',
        'real-device',
        'reports',
        'screenshots',
        'traces',
        'videos',
      ]) {
        expect(
          (
            await stat(join(firstOutput, options.runId, directory))
          ).isDirectory(),
        ).toBe(true);
      }
    } finally {
      if (previousSecret === undefined) {
        delete process.env.COLORPLAY_ACCEPTANCE_TEST_SECRET;
      } else {
        process.env.COLORPLAY_ACCEPTANCE_TEST_SECRET = previousSecret;
      }
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('rejects credentials and email addresses from recorded metadata', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'colorplay-evidence-'));
    const emailAddress = ['student', 'example.invalid'].join(
      String.fromCharCode(64),
    );

    try {
      await expect(
        createEvidenceRun({
          appUrl: 'http://127.0.0.1:4173',
          commands: [
            {
              command: `contact ${emailAddress}; authorization: REDACTED`,
              duration_ms: 1,
              exit_code: 0,
              report_path: null,
              started_at: '2026-07-14T00:00:00.000Z',
            },
          ],
          dirtyWorktree: true,
          gitSha: '0123456789abcdef0123456789abcdef01234567',
          outputRoot: temporaryRoot,
          runId: 'unsafe-run',
          startedAt: '2026-07-14T00:00:00.000Z',
          supabaseEnvironment: 'local',
        }),
      ).rejects.toThrow('EVIDENCE_SENSITIVE_VALUE');
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('rejects environment-variable values from recorded commands', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'colorplay-evidence-'));

    try {
      await expect(
        createEvidenceRun({
          appUrl: 'http://127.0.0.1:4173',
          commands: [
            {
              command: `PUBLIC_SETTING=${randomUUID()} pnpm test`,
              duration_ms: 1,
              exit_code: 0,
              report_path: null,
              started_at: '2026-07-14T00:00:00.000Z',
            },
          ],
          dirtyWorktree: true,
          gitSha: '0123456789abcdef0123456789abcdef01234567',
          outputRoot: temporaryRoot,
          runId: 'unsafe-environment-run',
          startedAt: '2026-07-14T00:00:00.000Z',
          supabaseEnvironment: 'local',
        }),
      ).rejects.toThrow('EVIDENCE_SENSITIVE_VALUE');
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('rejects flag credentials and sensitive values from every free-text metadata field', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'colorplay-evidence-'));
    const sensitiveEmail = ['person', 'invalid.example'].join(
      String.fromCharCode(64),
    );
    const startedAt = '2026-07-14T00:00:00.000Z';
    const baseOptions: CreateEvidenceRunOptions = {
      appUrl: 'https://preview.invalid/app',
      dirtyWorktree: true,
      gitSha: '0123456789abcdef0123456789abcdef01234567',
      outputRoot: temporaryRoot,
      runId: 'sensitive-field-contract',
      startedAt,
      supabaseEnvironment: 'staging',
    };
    type EvidenceCommand = NonNullable<
      CreateEvidenceRunOptions['commands']
    >[number];
    type KnownFailure = NonNullable<
      CreateEvidenceRunOptions['knownFailures']
    >[number];
    type RealDevice = NonNullable<
      CreateEvidenceRunOptions['realDevices']
    >[number];
    const command = (value: string): EvidenceCommand => ({
      command: value,
      duration_ms: 1,
      exit_code: 0,
      report_path: null,
      started_at: startedAt,
    });
    const knownFailure: KnownFailure = {
      description: 'description',
      id_or_area: 'area',
      owner: 'owner',
      target: 'target',
      user_impact: 'impact',
      workaround: 'workaround',
    };
    const realDevice: RealDevice = {
      android_back_tested: false,
      browser: 'browser',
      css_viewport: '375x812',
      device_model: 'device',
      evidence_files: ['real-device/evidence.png'],
      evidence_id: 'device-1',
      keyboard_visible: false,
      orientation: 'portrait',
      os: 'os',
    };
    const cases: {
      label: string;
      options: Partial<CreateEvidenceRunOptions>;
    }[] = [
      {
        label: 'password flag',
        options: { commands: [command('pnpm test --password REDACTED')] },
      },
      {
        label: 'token flag',
        options: { commands: [command('pnpm test --access-token REDACTED')] },
      },
      {
        label: 'secret flag',
        options: { commands: [command('pnpm test --client-secret REDACTED')] },
      },
      {
        label: 'app url',
        options: {
          appUrl: `https://preview.invalid/path/${sensitiveEmail}`,
        },
      },
      {
        label: 'browser name',
        options: { browser: { name: sensitiveEmail, version: '1' } },
      },
      {
        label: 'browser version',
        options: { browser: { name: 'browser', version: sensitiveEmail } },
      },
      {
        label: 'command report path',
        options: {
          commands: [
            {
              ...command('pnpm test'),
              report_path: `reports/${sensitiveEmail}.txt`,
            },
          ],
        },
      },
      {
        label: 'migration version',
        options: { migrationVersion: sensitiveEmail },
      },
      {
        label: 'seed version',
        options: { seedVersion: sensitiveEmail },
      },
      {
        label: 'os name',
        options: { os: { name: sensitiveEmail, version: '1' } },
      },
      {
        label: 'os version',
        options: { os: { name: 'os', version: sensitiveEmail } },
      },
      {
        label: 'real device evidence path',
        options: {
          realDevices: [
            {
              ...realDevice,
              evidence_files: [`real-device/${sensitiveEmail}.png`],
            },
          ],
        },
      },
    ];
    for (const field of Object.keys(knownFailure) as (keyof KnownFailure)[]) {
      cases.push({
        label: `known failure ${field}`,
        options: {
          knownFailures: [{ ...knownFailure, [field]: sensitiveEmail }],
        },
      });
    }
    for (const field of [
      'browser',
      'css_viewport',
      'device_model',
      'evidence_id',
      'orientation',
      'os',
    ] as const satisfies readonly (keyof RealDevice)[]) {
      cases.push({
        label: `real device ${field}`,
        options: {
          realDevices: [{ ...realDevice, [field]: sensitiveEmail }],
        },
      });
    }
    const acceptedUnsafeCases: string[] = [];

    try {
      for (const testCase of cases) {
        try {
          await createEvidenceRun({ ...baseOptions, ...testCase.options });
          acceptedUnsafeCases.push(testCase.label);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== 'EVIDENCE_SENSITIVE_VALUE'
          ) {
            acceptedUnsafeCases.push(`${testCase.label}:wrong-error`);
          }
        }
      }

      expect(acceptedUnsafeCases).toEqual([]);

      const validRun = await createEvidenceRun({
        ...baseOptions,
        appUrl: 'https://preview.invalid/app/login',
        runId: 'valid-public-url',
      });
      expect(validRun.manifest.app_url).toBe(
        'https://preview.invalid/app/login',
      );
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('honors explicit deterministic CLI inputs and sanitized metadata', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'colorplay-evidence-'));
    const outputRoot = join(temporaryRoot, 'artifacts');
    const metadataPath = join(temporaryRoot, 'metadata.json');
    const runId = 'task-6-cli-deterministic';
    const gitSha = 'abcdef0123456789abcdef0123456789abcdef01';
    const startedAt = '2026-07-14T01:00:00.000Z';
    const finishedAt = '2026-07-14T01:03:00.000Z';
    const args = [
      'scripts/acceptance/create-run.mjs',
      '--environment',
      'local',
      '--app-url',
      'http://127.0.0.1:4173',
      '--output-root',
      outputRoot,
      '--run-id',
      runId,
      '--started-at',
      startedAt,
      '--finished-at',
      finishedAt,
      '--git-sha',
      gitSha,
      '--dirty-worktree',
      'false',
      '--metadata-file',
      metadataPath,
    ];

    await writeFile(
      metadataPath,
      `${JSON.stringify({
        browser: { name: 'webkit', version: '18.5' },
        commands: [
          {
            command: 'pnpm typecheck',
            duration_ms: 800,
            exit_code: 0,
            report_path: 'reports/typecheck.txt',
            started_at: startedAt,
          },
        ],
        known_failures: [],
        migration_version: null,
        os: { name: 'darwin', version: '25.5.0' },
        real_devices: [],
        seed_version: null,
        viewports: [{ height: 900, width: 1440 }],
      })}\n`,
      'utf8',
    );

    try {
      const firstRun = await execFileAsync(process.execPath, args, {
        cwd: process.cwd(),
      });
      const firstManifest = await readFile(
        join(outputRoot, runId, 'manifest.json'),
        'utf8',
      );
      const secondRun = await execFileAsync(process.execPath, args, {
        cwd: process.cwd(),
      });
      const secondManifest = await readFile(
        join(outputRoot, runId, 'manifest.json'),
        'utf8',
      );

      expect(firstRun.stderr).toBe('');
      expect(secondRun.stderr).toBe('');
      expect(firstRun.stdout.trim()).toBe(join(outputRoot, runId));
      expect(secondRun.stdout).toBe(firstRun.stdout);
      expect(secondManifest).toBe(firstManifest);
      expect(JSON.parse(firstManifest)).toMatchObject({
        browser: { name: 'webkit', version: '18.5' },
        dirty_worktree: false,
        finished_at: finishedAt,
        git_sha: gitSha,
        run_id: runId,
        started_at: startedAt,
        viewports: [{ height: 900, width: 1440 }],
      });
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('uses standard Playwright projects and fixtures for browser evidence', async () => {
    const foundationSpec = await readFile(
      'tests/e2e/foundation-routes.spec.ts',
      'utf8',
    );

    expect(playwrightConfig.projects?.map(({ name }) => name)).toEqual([
      'chromium',
      'firefox',
      'webkit',
    ]);
    expect(playwrightConfig.outputDir).toMatch(
      /^artifacts\/acceptance\/playwright-local-[A-Za-z0-9._-]+\/playwright$/u,
    );
    expect(playwrightConfig.use).toMatchObject({
      screenshot: 'only-on-failure',
      trace: 'on-first-retry',
      video: 'retain-on-failure',
    });
    for (const project of playwrightConfig.projects?.filter(
      ({ name }) => name !== 'chromium',
    ) ?? []) {
      expect(project.testIgnore).toEqual(/\.visual\.spec\.ts$/u);
    }
    expect(foundationSpec).not.toContain('chromium.launch');
    expect(foundationSpec).not.toContain(
      "const baseUrl = 'http://127.0.0.1:4173'",
    );
    expect(foundationSpec).toMatch(/async\s*\(\{\s*page,?\s*\}\)\s*=>/u);
  });

  it('exposes honest package and shell entry points for evidence runs', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'colorplay-evidence-'));
    const packageManifest = JSON.parse(
      await readFile('package.json', 'utf8'),
    ) as { scripts: Record<string, string> };

    try {
      expect(packageManifest.scripts).toMatchObject({
        acceptance: 'bash scripts/acceptance/run.sh',
        'acceptance:count':
          'node scripts/verify/count-acceptance.mjs acceptance/ACCEPTANCE_CRITERIA.md',
        'acceptance:create-run': 'node scripts/acceptance/create-run.mjs',
      });

      const countResult = await execFileAsync(
        process.execPath,
        [
          'scripts/verify/count-acceptance.mjs',
          'acceptance/ACCEPTANCE_CRITERIA.md',
        ],
        { cwd: process.cwd() },
      );
      expect(countResult.stderr).toBe('');
      expect(countResult.stdout).toBe('84\n');

      const runId = 'task-6-shell-deterministic';
      const runResult = await execFileAsync(
        'bash',
        [
          'scripts/acceptance/run.sh',
          '--environment',
          'local',
          '--app-url',
          'http://127.0.0.1:4173',
          '--output-root',
          temporaryRoot,
          '--run-id',
          runId,
          '--started-at',
          '2026-07-14T02:00:00.000Z',
          '--git-sha',
          'abcdef0123456789abcdef0123456789abcdef01',
          '--dirty-worktree',
          'false',
        ],
        { cwd: process.cwd() },
      );

      expect(runResult.stderr).toBe('');
      expect(runResult.stdout.trim()).toBe(join(temporaryRoot, runId));
      expect(
        JSON.parse(
          await readFile(join(temporaryRoot, runId, 'manifest.json'), 'utf8'),
        ),
      ).toMatchObject({
        release_decision: 'BLOCKED',
        status_counts: { 'NOT VERIFIED': 84, PASS: 0 },
      });
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it(
    'retains the first acceptance run video and trace after a second run',
    { timeout: 60_000 },
    async () => {
      const temporaryRoot = await mkdtemp(
        join(tmpdir(), 'colorplay-retention-'),
      );
      const runAcceptance = async (runId: string, startedAt: string) => {
        await execFileAsync(
          'bash',
          [
            'scripts/acceptance/run.sh',
            '--environment',
            'local',
            '--app-url',
            'http://127.0.0.1:4173',
            '--output-root',
            temporaryRoot,
            '--run-id',
            runId,
            '--started-at',
            startedAt,
            '--git-sha',
            'abcdef0123456789abcdef0123456789abcdef01',
            '--dirty-worktree',
            'false',
            '--',
            'tests/e2e/foundation-routes.spec.ts',
            '--project=chromium',
          ],
          { cwd: process.cwd(), maxBuffer: 2 * 1024 * 1024 },
        );
      };

      try {
        await runAcceptance('retained-run-one', '2026-07-14T03:00:00.000Z');
        const firstRunFiles = await listFilesRecursively(
          join(temporaryRoot, 'retained-run-one', 'playwright'),
        );
        const firstVideo = firstRunFiles.find((path) =>
          path.endsWith('video.webm'),
        );
        const firstTrace = firstRunFiles.find((path) =>
          path.endsWith('trace.zip'),
        );
        expect(firstVideo).toBeDefined();
        expect(firstTrace).toBeDefined();

        await runAcceptance('retained-run-two', '2026-07-14T03:05:00.000Z');

        expect((await stat(firstVideo ?? '')).isFile()).toBe(true);
        expect((await stat(firstTrace ?? '')).isFile()).toBe(true);
        const secondRunFiles = await listFilesRecursively(
          join(temporaryRoot, 'retained-run-two', 'playwright'),
        );
        expect(secondRunFiles.some((path) => path.endsWith('video.webm'))).toBe(
          true,
        );
        expect(secondRunFiles.some((path) => path.endsWith('trace.zip'))).toBe(
          true,
        );
      } finally {
        await rm(temporaryRoot, { force: true, recursive: true });
      }
    },
  );
});
