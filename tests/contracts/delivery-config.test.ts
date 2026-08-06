import { readFile, readdir } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workflowPath = '.github/workflows/ci.yml';
const visualBaselineDirectory = 'tests/e2e/app-shell.visual.spec.ts-snapshots';

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
      rewrites: [{ source: '/(.*)', destination: '/index.html' }],
    });
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
    };
    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/u);
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
    const secretScanIndex = workflow.indexOf('id: secret-scan');
    const uploadIndex = workflow.indexOf('uses: actions/upload-artifact@');
    const uploadBlock = workflow.slice(uploadIndex, uploadIndex + 400);

    expect(secretScanIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(secretScanIndex);
    expect(uploadBlock).toContain(
      "if: ${{ success() && steps.secret-scan.outcome == 'success' }}",
    );
    expect(uploadBlock).not.toContain('always()');
  });

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
