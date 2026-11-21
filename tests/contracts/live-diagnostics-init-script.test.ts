import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, it } from 'vitest';

it('executes the actual TSX-transformed init callback in a fresh realm without a helper polyfill', () => {
  const source = pathToFileURL(
    resolve('tests/e2e/helpers/staging-capacity-browser.ts'),
  ).href;
  const script = `
    import { runInNewContext } from 'node:vm';
    const { attachDiagnostics } = await import(${JSON.stringify(source)});
    let callback;
    await attachDiagnostics({ on() {}, async addInitScript(value) { callback = value; } });
    let scan;
    let domState = '';
    const window = {};
    const context = {
      window,
      document: { querySelector() { return { dataset: { state: domState } }; } },
      MutationObserver: class { constructor(value) { scan = value; } observe() {} },
    };
    const result = { executed: false, helperNameFailure: false, initialDisconnects: null, transitionDisconnects: null, sequenceLength: null, finalDisconnects: null, markerAbsent: null };
    try {
      runInNewContext('(' + callback.toString() + ')()', context);
      result.executed = true;
      for (const value of ['connecting', 'connecting', 'disconnected']) { domState = value; scan(); }
      result.initialDisconnects = window.__colorplayCapacityRealtime.disconnects;
      for (const value of ['connected', 'disconnected', 'disconnected', 'SYNTHETIC_SECRET_MARKER']) { domState = value; scan(); }
      result.transitionDisconnects = window.__colorplayCapacityRealtime.disconnects;
      for (let index = 0; index < 20; index += 1) {
        for (const value of ['connecting', 'connected', 'disconnected']) { domState = value; scan(); }
      }
      result.sequenceLength = window.__colorplayCapacityRealtime.sequence.length;
      result.finalDisconnects = window.__colorplayCapacityRealtime.disconnects;
      result.markerAbsent = !JSON.stringify(window.__colorplayCapacityRealtime).includes('SYNTHETIC_SECRET_MARKER');
    } catch (error) {
      result.helperNameFailure = error?.name === 'ReferenceError' && String(error?.message).includes('__name');
    }
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    { encoding: 'utf8', timeout: 15_000 },
  );
  expect(child.status).toBe(0);
  const result: unknown = JSON.parse(child.stdout);
  expect(result).toEqual({
    executed: true,
    helperNameFailure: false,
    initialDisconnects: 0,
    transitionDisconnects: 1,
    sequenceLength: 16,
    finalDisconnects: 21,
    markerAbsent: true,
  });
});
