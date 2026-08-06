import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseFlags(argumentsList) {
  if (argumentsList[0] === '--') argumentsList = argumentsList.slice(1);
  const booleanFlags = new Set(['--allow-loopback-http']);
  const valueFlags = new Set([
    '--environment',
    '--target-origin',
    '--http-origin',
    '--output',
    '--evidence-root',
  ]);
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 1) {
    const flag = argumentsList[index];
    if (booleanFlags.has(flag)) {
      if (values.has(flag)) fail('READ_ONLY_SMOKE_INVALID_ARGUMENTS');
      values.set(flag, true);
      continue;
    }
    const value = argumentsList[index + 1];
    if (
      !valueFlags.has(flag) ||
      typeof value !== 'string' ||
      values.has(flag)
    ) {
      fail('READ_ONLY_SMOKE_INVALID_ARGUMENTS');
    }
    values.set(flag, value);
    index += 1;
  }
  for (const required of ['--environment', '--target-origin', '--output']) {
    if (!values.has(required)) fail('READ_ONLY_SMOKE_INVALID_ARGUMENTS');
  }
  return values;
}

function validateOrigin(value, allowLoopbackHttp) {
  try {
    const url = new URL(value);
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(allowLoopbackHttp && loopback))
    ) {
      fail('READ_ONLY_SMOKE_INVALID_ARGUMENTS');
    }
    return url;
  } catch (error) {
    if (error?.code === 'READ_ONLY_SMOKE_INVALID_ARGUMENTS') throw error;
    fail('READ_ONLY_SMOKE_INVALID_ARGUMENTS');
  }
}

function validateRedirectOrigin(value) {
  try {
    const url = new URL(value);
    if (
      url.origin !== value ||
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      fail('READ_ONLY_SMOKE_INVALID_ARGUMENTS');
    }
    return url;
  } catch (error) {
    if (error?.code === 'READ_ONLY_SMOKE_INVALID_ARGUMENTS') throw error;
    fail('READ_ONLY_SMOKE_INVALID_ARGUMENTS');
  }
}

function outputInsideRoot(path, root) {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  const candidate = relative(absoluteRoot, absolutePath);
  if (candidate === '' || candidate.startsWith('..') || isAbsolute(candidate)) {
    fail('EVIDENCE_OUTPUT_OUTSIDE_ROOT');
  }
  return absolutePath;
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function installReadOnlyGuard(page) {
  const state = { writeRequestCount: 0 };
  await page.route('**/*', async (route) => {
    const method = route.request().method();
    if (!['GET', 'HEAD'].includes(method)) {
      state.writeRequestCount += 1;
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return state;
}

export async function runReadOnlySmoke({
  environment,
  targetOrigin,
  httpOrigin,
}) {
  const target = new URL(targetOrigin);
  let dns = 'passed';
  try {
    await lookup(target.hostname);
  } catch {
    dns = 'failed';
  }
  let httpsRedirect = target.protocol === 'http:' ? 'passed' : 'failed';
  if (httpOrigin) {
    try {
      const response = await globalThis.fetch(httpOrigin, {
        method: 'HEAD',
        redirect: 'manual',
      });
      const location = response.headers.get('location');
      httpsRedirect =
        response.status >= 300 &&
        response.status < 400 &&
        location !== null &&
        new URL(location, httpOrigin).origin === target.origin
          ? 'passed'
          : 'failed';
    } catch {
      httpsRedirect = 'failed';
    }
  }

  const browser = await chromium.launch({ headless: true });
  let home;
  let login;
  let assets;
  let marker;
  let consoleErrorCount = 0;
  let requiredNetworkErrorCount = 0;
  let writeRequestCount;
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const guard = await installReadOnlyGuard(page);
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrorCount += 1;
    });
    page.on('response', (response) => {
      if (response.status() >= 400) requiredNetworkErrorCount += 1;
    });
    let assetResponseCount = 0;
    page.on('response', (response) => {
      if (
        ['script', 'stylesheet'].includes(response.request().resourceType()) &&
        response.ok()
      ) {
        assetResponseCount += 1;
      }
    });
    await page.goto(target.origin, { waitUntil: 'networkidle' });
    home =
      (await page.getByText('PRESS START', { exact: true }).count()) === 1
        ? 'passed'
        : 'failed';
    const markerCount = await page
      .getByText('STAGING 測試環境', { exact: true })
      .count();
    marker =
      (environment === 'staging' && markerCount === 1) ||
      (environment === 'production' && markerCount === 0)
        ? 'passed'
        : 'failed';
    assets = assetResponseCount > 0 ? 'passed' : 'failed';
    await page.goto(new URL('/login', target.origin).href, {
      waitUntil: 'networkidle',
    });
    login =
      (await page.getByRole('heading', { name: '登入' }).count()) === 1 &&
      (await page.getByLabel('密碼').count()) === 1
        ? 'passed'
        : 'failed';
    writeRequestCount = guard.writeRequestCount;
    await context.close();
  } finally {
    await browser.close();
  }
  const passed =
    [dns, httpsRedirect, home, login, assets, marker].every(
      (value) => value === 'passed',
    ) &&
    consoleErrorCount === 0 &&
    requiredNetworkErrorCount === 0 &&
    writeRequestCount === 0;
  return {
    schema_version: 1,
    environment,
    target_origin: target.origin,
    checked_at_utc: new Date().toISOString(),
    dns,
    tls:
      target.protocol === 'https:' ||
      ['127.0.0.1', 'localhost', '::1'].includes(target.hostname)
        ? 'passed'
        : 'failed',
    https_redirect: httpsRedirect,
    home,
    login,
    assets,
    marker,
    console_error_count: consoleErrorCount,
    required_network_error_count: requiredNetworkErrorCount,
    result: passed ? 'passed' : 'failed',
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const environment = flags.get('--environment');
  if (!['staging', 'production'].includes(environment)) {
    fail('READ_ONLY_SMOKE_INVALID_ARGUMENTS');
  }
  const target = validateOrigin(
    flags.get('--target-origin'),
    flags.has('--allow-loopback-http'),
  );
  const httpOrigin = flags.has('--http-origin')
    ? validateRedirectOrigin(flags.get('--http-origin')).origin
    : null;
  const result = await runReadOnlySmoke({
    environment,
    targetOrigin: target.origin,
    httpOrigin,
  });
  const output = outputInsideRoot(
    flags.get('--output'),
    flags.get('--evidence-root') ?? process.cwd(),
  );
  await atomicWrite(output, `${JSON.stringify(result, null, 2)}\n`);
  if (result.result !== 'passed') fail('READ_ONLY_SMOKE_FAILED');
  process.stdout.write('READ_ONLY_SMOKE_PASSED\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const allowed = new Set([
      'READ_ONLY_SMOKE_INVALID_ARGUMENTS',
      'READ_ONLY_SMOKE_FAILED',
      'EVIDENCE_OUTPUT_OUTSIDE_ROOT',
    ]);
    process.stderr.write(
      `${allowed.has(error?.code) ? error.code : 'READ_ONLY_SMOKE_FAILED'}\n`,
    );
    process.exitCode = 1;
  });
}
