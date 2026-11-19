import { readFile, readdir } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workflowPath = '.github/workflows/ci.yml';
const visualBaselineDirectory = 'tests/e2e/app-shell.visual.spec.ts-snapshots';

const assertArtifactPolicy = (workflow: string) => {
  const jobs = [...workflow.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gmu)];
  const uploads: { job: string; jobBody: string; step: string }[] = [];
  for (const [index, job] of jobs.entries()) {
    const jobName = job[1];
    if (!jobName) throw new Error('WORKFLOW_JOB_UNKNOWN');
    const body = workflow.slice(job.index, jobs[index + 1]?.index);
    const steps = [...body.matchAll(/^ {6}- /gmu)];
    for (const [stepIndex, start] of steps.entries()) {
      const step = body
        .slice(start.index, steps[stepIndex + 1]?.index)
        .trimEnd();
      if (step.includes('actions/upload-artifact@'))
        uploads.push({ job: jobName, jobBody: body, step });
    }
  }
  expect(uploads).toHaveLength(3);
  expect(workflow.match(/actions\/upload-artifact@/gu)).toHaveLength(
    uploads.length,
  );
  const cipherJobs: string[] = [];
  let scanned = 0;
  for (const upload of uploads) {
    if (['local-database', 'chromium-e2e'].includes(upload.job)) {
      const exactCipherStep = [
        '      - name: Upload encrypted Local start failure',
        "        if: ${{ failure() && steps.local-start.outputs.local_start_cipher == 'true' && hashFiles('artifacts/ci-local-start/start-failure.age') != '' }}",
        '        uses: actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4',
        '        with:',
        `          name: local-start-failure-${upload.job}`,
        '          path: artifacts/ci-local-start/start-failure.age',
        '          if-no-files-found: error',
        '          retention-days: 1',
      ].join('\n');
      expect(upload.step).toBe(exactCipherStep);
      cipherJobs.push(upload.job);
      continue;
    }
    expect(upload.job).toBe('credential-scan');
    const secretScanIndex = upload.jobBody.indexOf('id: secret-scan');
    const uploadIndex = upload.jobBody.indexOf(upload.step);
    expect(secretScanIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(secretScanIndex);
    expect(upload.step).toContain(
      "if: ${{ success() && steps.secret-scan.outcome == 'success' }}",
    );
    expect(
      [...upload.step.matchAll(/^ {8}if: (.+)$/gmu)].map((row) => row[1]),
    ).toEqual(["${{ success() && steps.secret-scan.outcome == 'success' }}"]);
    expect(upload.step).not.toContain('always()');
    expect(upload.step).toContain('- name: Upload scanned CI evidence\n');
    expect(upload.step).toContain('name: feature-ci-credential-scan\n');
    expect(upload.step).toContain('path: artifacts/phase0/ci/\n');
    scanned++;
  }
  expect(scanned).toBe(1);
  expect(cipherJobs.sort()).toEqual(['chromium-e2e', 'local-database']);
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('delivery configuration', () => {
  it('uses the approved Vercel Vite SPA settings', async () => {
    const config = JSON.parse(await readFile('vercel.json', 'utf8')) as Record<
      string,
      unknown
    >;

    expect(config).toEqual({
      $schema: 'https://openapi.vercel.sh/vercel.json',
      framework: 'vite',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      git: {
        deploymentEnabled: {
          'codex/local-capacity-linux-20261116': false,
          'codex/local-capacity-vm-20261118': false,
        },
      },
      rewrites: [{ source: '/(.*)', destination: '/index.html' }],
    });
  });

  it('self-hosts only the two required Noto Sans TC weights', async () => {
    const [indexHtml, mainSource] = await Promise.all([
      readFile('index.html', 'utf8'),
      readFile('src/main.tsx', 'utf8'),
    ]);
    const weights = [...mainSource.matchAll(/noto-sans-tc\/(\d+)\.css/gu)].map(
      ([, weight]) => weight,
    );

    expect(indexHtml).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/u);
    expect(weights).toEqual(['400', '700']);
  });

  it('exposes the eight unique Feature CI checks and full clean-install gates', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const expectedChecks = [
      'format',
      'lint',
      'typecheck',
      'unit-coverage',
      'production-build',
      'local-database',
      'chromium-e2e',
      'credential-scan',
    ];
    const requiredCommands = [
      'pnpm install --frozen-lockfile',
      'pnpm format:check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test:coverage',
      'npm run build',
      'pnpm test:db',
      'pnpm exec playwright install --with-deps chromium',
      'pnpm test:e2e --project=chromium',
    ];

    const jobNames = [...workflow.matchAll(/^ {4}name: (\S+)$/gmu)].map(
      ([, name]) => name,
    );
    expect(jobNames).toEqual(expectedChecks);
    expect(new Set(jobNames).size).toBe(expectedChecks.length);
    for (const command of requiredCommands) expect(workflow).toContain(command);
  });

  it('pins Node and obtains the exact pnpm version from packageManager', async () => {
    const [workflow, packageJsonText] = await Promise.all([
      readFile(workflowPath, 'utf8'),
      readFile('package.json', 'utf8'),
    ]);
    const packageJson = JSON.parse(packageJsonText) as {
      packageManager?: string;
      devDependencies?: Record<string, string>;
    };
    expect(packageJson.packageManager).toBe('pnpm@11.25.0');
    expect(packageJson.devDependencies?.vercel).toBe('59.11.7');
    expect(workflow).toMatch(/node-version: '\d+\.\d+\.\d+'/u);
    // pnpm 一律依 packageManager pin 安裝；workflow 不得另行硬編版本。
    expect(workflow).toContain(
      `npm install --global "$(node --print "require('./package.json').packageManager")"`,
    );
    expect(workflow).not.toMatch(/pnpm@\d/u);
  });

  it('provides only synthetic browser-safe public configuration', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    const viteNames = [...workflow.matchAll(/^\s+(VITE_[A-Z0-9_]+):/gmu)].map(
      ([, name]) => name,
    );
    const declaredEnvironmentNames = [
      ...workflow.matchAll(/^\s{6,10}([A-Z][A-Z0-9_]+):/gmu),
    ].map(([, name]) => name);

    expect(new Set(viteNames)).toEqual(
      new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']),
    );
    expect(workflow).toContain('https://synthetic-colorplay-ci.invalid');
    expect(workflow).toContain('synthetic-browser-public-anon-key');
    expect(
      declaredEnvironmentNames.filter((name) =>
        /(?:DATABASE|JWT|PASSWORD|SECRET|SERVICE_ROLE)/u.test(name ?? ''),
      ),
    ).toEqual([]);
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./u);
  });

  it('uploads artifacts only after a successful secret scan', async () => {
    const workflow = await readFile(workflowPath, 'utf8');
    assertArtifactPolicy(workflow);
  });

  it.each([
    'RAW_PATH',
    'ALWAYS',
    'MISSING_SCAN_GATE',
    'UNKNOWN_UPLOAD',
  ] as const)(
    'rejects unsafe artifact policy mutation: %s',
    async (mutation) => {
      const workflow = await readFile(workflowPath, 'utf8');
      const scanGate =
        "if: ${{ success() && steps.secret-scan.outcome == 'success' }}";
      const mutated =
        mutation === 'RAW_PATH'
          ? workflow.replace(
              'path: artifacts/ci-local-start/start-failure.age',
              'path: artifacts/ci-local-start/',
            )
          : mutation === 'ALWAYS'
            ? workflow.replace(scanGate, 'if: ${{ always() }}')
            : mutation === 'MISSING_SCAN_GATE'
              ? workflow.replace(scanGate, 'if: ${{ success() }}')
              : workflow +
                '\n      - name: Unknown upload\n        uses: actions/upload-artifact@v5\n        with:\n          path: artifacts/unknown/\n';
      expect(mutated).not.toBe(workflow);
      expect(() => {
        assertArtifactPolicy(mutated);
      }).toThrow();
    },
  );

  it('uses an explicit Playwright base URL without starting another server', async () => {
    vi.stubEnv('PLAYWRIGHT_BASE_URL', 'http://127.0.0.1:4173');

    const { default: config } = await import('../../playwright.config');

    expect(config.use?.baseURL).toBe('http://127.0.0.1:4173');
    expect(config.webServer).toBeUndefined();
  });

  it('tracks the four Chromium Linux visual baselines required by CI', async () => {
    const baselineFiles = await readdir(visualBaselineDirectory);
    const requiredLinuxBaselines = [
      'login-320x812-chromium-linux.png',
      'login-375x812-chromium-linux.png',
      'login-768x1024-chromium-linux.png',
      'login-1440x900-chromium-linux.png',
    ];

    for (const baseline of requiredLinuxBaselines) {
      expect(baselineFiles).toContain(baseline);
    }
  });
});
