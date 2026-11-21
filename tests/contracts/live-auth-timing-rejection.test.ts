import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it.each(['header', 'parse'])(
  'observes the actual rejected %s timing task immediately while its caller still receives rejection',
  (failure) => {
    const module = pathToFileURL(
      resolve('tests/e2e/helpers/staging-capacity-browser.ts'),
    ).href;
    const script = `
    const { attachDiagnostics } = await import(${JSON.stringify(module)});
    const handlers = new Map();
    const diagnostic = await attachDiagnostics({ on(event, fn) { const list = handlers.get(event) ?? []; list.push(fn); handlers.set(event, list); }, async addInitScript() {} });
    const response = { url: () => 'http://127.0.0.1:56321/functions/v1/auth-login', status: () => 200,
      request: () => ({ method: () => 'POST' }),
      headerValue: () => ${failure === 'header' ? "Promise.reject(new Error('SYNTHETIC_SECRET_MARKER'))" : "Promise.resolve('SYNTHETIC_SECRET_MARKER')"} };
    for (const callback of handlers.get('response')) callback(response);
    setTimeout(async () => {
      let rejected = false;
      try { await diagnostic.authTimings(); } catch { rejected = true; }
      process.stdout.write(JSON.stringify({ callerRejected: rejected }));
    }, 20);
  `;
    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', script],
      { encoding: 'utf8', timeout: 15000 },
    );
    if (child.status !== 0)
      expect(
        child.stderr.includes(
          failure === 'header'
            ? 'SYNTHETIC_SECRET_MARKER'
            : 'CAPACITY_LOGIN_TIMING_INVALID',
        ),
      ).toBe(true);
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout) as unknown).toEqual({
      callerRejected: true,
    });
    expect(child.stdout).not.toContain('SYNTHETIC_SECRET_MARKER');
  },
);
