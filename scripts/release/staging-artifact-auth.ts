import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { TEST_USERS, TEST_USER_ACCOUNTS } from '../../tests/fixtures/users';

const stagingOrigin = 'https://staging.colorplayapp.com';
const projectRef = 'onkxnkzeixpezetkmocf';
const supabaseOrigin = `https://${projectRef}.supabase.co`;
const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function api(path: string): Record<string, unknown> {
  const team = process.env.VERCEL_ORG_ID;
  const endpoint = team ? `${path}?teamId=${encodeURIComponent(team)}` : path;
  return record(
    JSON.parse(
      execFileSync('pnpm', ['exec', 'vercel', 'api', endpoint], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      }),
    ),
  );
}

async function main() {
  const deploymentId = process.env.STAGING_AUTH_DEPLOYMENT_ID;
  const expectedSha = process.env.STAGING_AUTH_EXPECTED_SHA;
  const expectedProject = process.env.VERCEL_PROJECT_ID;
  const expectedKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (
    !deploymentId?.startsWith('dpl_') ||
    !expectedSha?.match(/^[a-f0-9]{40}$/u) ||
    !expectedProject ||
    !expectedKey ||
    expectedKey === '[SENSITIVE]' ||
    process.env.VITE_SUPABASE_URL !== supabaseOrigin
  )
    throw new Error('STAGING_AUTH_CONFIG_INVALID');
  const deployment = api(`/v13/deployments/${deploymentId}`);
  const project = api(`/v9/projects/${expectedProject}`);
  const meta = record(deployment.meta);
  if (
    project.name !== 'colorplay-staging-web' ||
    deployment.projectId !== expectedProject ||
    deployment.readyState !== 'READY' ||
    meta.githubCommitSha !== expectedSha ||
    typeof deployment.url !== 'string' ||
    !deployment.url.endsWith('.vercel.app')
  )
    throw new Error('STAGING_AUTH_DEPLOYMENT_MISMATCH');
  const candidateOrigin = `https://${deployment.url}`;
  const bypass = Object.entries(record(project.protectionBypass)).find(
    ([, value]) => record(value).scope === 'automation-bypass',
  )?.[0];
  // Existing access only: never disables protection or provisions a new token.
  const headers: Record<string, string> = bypass
    ? { 'x-vercel-protection-bypass': bypass }
    : {};
  const browser = await chromium.launch();
  const results: { role: string; route: string; profileLoaded: boolean }[] = [];
  try {
    for (const role of ['student', 'teacher'] as const) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const failures: string[] = [];
      const proof = {
        bundleKeySeen: false,
        runtimeKeySeen: false,
        profileLoaded: false,
      };
      const profileChecks: Promise<void>[] = [];
      // Render the hosted candidate at its intended origin so the existing
      // Supabase CORS contract remains intact before the public alias changes.
      await page.route(`${stagingOrigin}/**`, async (route) => {
        try {
          const path = new URL(route.request().url());
          const response = await context.request.get(
            `${candidateOrigin}${path.pathname}${path.search}`,
            {
              headers,
              maxRedirects: 0,
              timeout: 20_000,
            },
          );
          if (!response.ok()) failures.push('CANDIDATE_ASSET_FAILED');
          const body = await response.body();
          if (
            path.pathname.endsWith('.js') &&
            body.includes(Buffer.from(expectedKey))
          )
            proof.bundleKeySeen = true;
          await route.fulfill({ response, body });
        } catch {
          failures.push('CANDIDATE_FETCH_FAILED');
          await route.abort();
        }
      });
      await page.route('https://*.supabase.co/**', async (route) => {
        const request = route.request();
        const key = request.headers().apikey;
        if (
          new URL(request.url()).origin !== supabaseOrigin ||
          (key && hash(key) !== hash(expectedKey))
        ) {
          failures.push('BACKEND_TARGET_REJECTED');
          await route.abort();
          return;
        }
        await route.continue();
      });
      page.on('pageerror', () => failures.push('PAGE_ERROR'));
      page.on('console', (message) => {
        if (message.type() === 'error') failures.push('CONSOLE_ERROR');
      });
      page.on('requestfailed', () => failures.push('REQUEST_FAILED'));
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.hostname.endsWith('.supabase.co')) {
          if (url.origin !== supabaseOrigin)
            failures.push('SUPABASE_HOST_MISMATCH');
          const key = request.headers().apikey;
          if (key) {
            if (hash(key) !== hash(expectedKey))
              failures.push('PUBLIC_KEY_MISMATCH');
            else proof.runtimeKeySeen = true;
          }
        }
      });
      page.on('response', (response) => {
        const url = new URL(response.url());
        if (url.origin === supabaseOrigin) {
          if (response.status() >= 400) failures.push('BACKEND_HTTP_ERROR');
          if (url.pathname.endsWith('/rest/v1/profiles') && response.ok())
            profileChecks.push(
              response
                .json()
                .then((value: unknown) => {
                  const profile = record(value);
                  proof.profileLoaded =
                    profile.role === role &&
                    typeof profile.id === 'string' &&
                    (role === 'teacher' ||
                      typeof profile.login_account === 'string');
                })
                .catch(() => {
                  failures.push('PROFILE_INVALID');
                }),
            );
        }
      });
      await page.goto(`${stagingOrigin}/login`);
      if (role === 'teacher')
        await page.getByText('教師端登入', { exact: true }).click();
      const fixture =
        role === 'student' ? TEST_USERS.studentOne : TEST_USERS.teacher;
      const account =
        role === 'student'
          ? TEST_USER_ACCOUNTS.studentOne
          : TEST_USER_ACCOUNTS.teacher;
      await page
        .getByRole('textbox', { name: '帳號', exact: true })
        .fill(account.account);
      await page.getByLabel('密碼', { exact: true }).fill(fixture.password);
      await page.getByRole('button', { name: '登入', exact: true }).click();
      const target = role === 'student' ? '/app' : '/teacher';
      await page.waitForURL(`${stagingOrigin}${target}`, { timeout: 30_000 });
      await expect(page.locator('h1')).toBeVisible();
      await expect(
        page.getByRole('status', { name: '頁面載入中' }),
      ).toHaveCount(0);
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
      await expect(
        page.getByRole('status', { name: 'STAGING 測試環境' }),
      ).toBeVisible();
      await Promise.all(profileChecks);
      if (
        !proof.bundleKeySeen ||
        !proof.runtimeKeySeen ||
        !proof.profileLoaded ||
        failures.length
      ) {
        console.error(
          JSON.stringify({
            role,
            bundleKeySeen: proof.bundleKeySeen,
            runtimeKeySeen: proof.runtimeKeySeen,
            profileLoaded: proof.profileLoaded,
            failures,
          }),
        );
        throw new Error('STAGING_AUTH_BROWSER_PROOF_FAILED');
      }
      results.push({ role, route: target, profileLoaded: proof.profileLoaded });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const output = 'artifacts/acceptance/admin-ui/staging-artifact-auth.json';
  await mkdir('artifacts/acceptance/admin-ui', { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        deploymentId,
        gitSha: expectedSha,
        projectRef,
        publicKeySha256: hash(expectedKey),
        intendedOrigin: stagingOrigin,
        candidateOrigin,
        results,
      },
      null,
      2,
    ),
  );
  console.log('STAGING_ARTIFACT_AUTH_PASS');
}
main().catch(() => {
  console.error('STAGING_ARTIFACT_AUTH_FAILED');
  process.exitCode = 1;
});
