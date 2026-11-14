import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';
import {
  installCapacityProcessDiagnostics,
  safeCapacityChildExit,
} from '../../scripts/live/capacity-process-diagnostics';

const paths: string[] = [];
const scope = () => {
  const config = parseCapacityConfig(
    [
      '--revision',
      'a'.repeat(40),
      '--run-id',
      `c40-diag-${randomBytes(5).toString('hex')}`,
    ],
    {},
  );
  const sidecar = `${config.resultPath}.process.json`;
  paths.push(config.resultPath, sidecar);
  return { config, sidecar };
};
afterEach(() => {
  for (const path of paths.splice(0)) if (existsSync(path)) unlinkSync(path);
});
const module = pathToFileURL(
  resolve('scripts/live/capacity-process-diagnostics.ts'),
).href;
const child = (config: ReturnType<typeof parseCapacityConfig>, body: string) =>
  spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      `
  import { writeFileSync } from 'node:fs';
  const { installCapacityProcessDiagnostics } = await import(${JSON.stringify(module)});
  const config = ${JSON.stringify(config)};
  installCapacityProcessDiagnostics(config, { COLORPLAY_LIVE_CONFIRM: 'LOCAL_LOW_DEVICE_ONLY' });
  writeFileSync(config.resultPath, JSON.stringify({ current_stage: 'round_transition', result: 'RUNNING', cleanup: { status: 'not_run' }, payload: 'SYNTHETIC_SECRET_MARKER' }), { mode: 0o600 });
  ${body}
`,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 },
  );

it.each([
  ['normal', '', 0, null, null],
  [
    'throw',
    "setTimeout(() => { throw new Error('SYNTHETIC_SECRET_MARKER'); }, 0)",
    1,
    null,
    'uncaughtException',
  ],
  [
    'reject',
    "Promise.reject(new Error('CAPACITY_LOGIN_TIMING_INVALID'))",
    1,
    null,
    'unhandledRejection',
  ],
  ['signal', "process.kill(process.pid, 'SIGTERM')", null, 'SIGTERM', null],
] as const)(
  'passively records %s without changing native exit behavior',
  (_name, body, code, signal, origin) => {
    const test = scope();
    const result = child(test.config, body);
    expect(result.status).toBe(code);
    expect(result.signal).toBe(signal);
    const raw = readFileSync(test.sidecar, 'utf8');
    expect(raw).not.toContain('SYNTHETIC_SECRET_MARKER');
    expect(statSync(test.sidecar).mode & 0o777).toBe(0o600);
    const diagnostic = JSON.parse(raw) as {
      events: {
        event: string;
        origin?: string;
        publicCode?: string;
        stage: string;
        cleanup: string;
        exitCode?: number;
      }[];
    };
    expect(
      diagnostic.events
        .filter((event) => event.event === 'fatalMonitor')
        .map((event) => event.origin),
    ).toEqual(origin ? [origin] : []);
    for (const event of diagnostic.events) {
      expect(event.stage).toBe('round_transition');
      expect(event.cleanup).toBe('not_run');
    }
    if (origin === 'unhandledRejection')
      expect(diagnostic.events[0]?.publicCode).toBe(
        'CAPACITY_LOGIN_TIMING_INVALID',
      );
    if (signal === null) expect(diagnostic.events.at(-1)?.exitCode).toBe(code);
    expect(
      JSON.parse(readFileSync(test.config.resultPath, 'utf8')) as unknown,
    ).toEqual({
      current_stage: 'round_transition',
      result: 'RUNNING',
      cleanup: { status: 'not_run' },
      payload: 'SYNTHETIC_SECRET_MARKER',
    });
  },
);

it('does not invoke getters or traverse circular causes and bounds monitor events', () => {
  const test = scope();
  const result = child(
    test.config,
    `
    let getterCalls = 0;
    const error = new Error(); error.cause = error;
    for (const key of ['message', 'publicCode', 'stack', 'name']) Object.defineProperty(error, key, { get() { getterCalls++; throw new Error('SYNTHETIC_SECRET_MARKER'); } });
    for (let index = 0; index < 20; index++) process.emit('uncaughtExceptionMonitor', error, 'SYNTHETIC_SECRET_MARKER');
    process.stdout.write(JSON.stringify({ getterCalls }));
  `,
  );
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout) as unknown).toEqual({ getterCalls: 0 });
  const raw = readFileSync(test.sidecar, 'utf8');
  expect(raw).not.toContain('SYNTHETIC_SECRET_MARKER');
  const diagnostic = JSON.parse(raw) as { events: unknown[] };
  expect(diagnostic.events).toHaveLength(8);
});

it('ignores invalid receipt content and passive observation I/O failure without throwing', () => {
  const test = scope();
  const result = child(
    test.config,
    `
    writeFileSync(config.resultPath, '{SYNTHETIC_SECRET_MARKER');
    process.emit('uncaughtExceptionMonitor', new Error('SYNTHETIC_SECRET_MARKER'), 'uncaughtException');
  `,
  );
  expect(result.status).toBe(0);
  expect(readFileSync(test.sidecar, 'utf8')).not.toContain(
    'SYNTHETIC_SECRET_MARKER',
  );
});

it.each(['receipt', 'sidecar'] as const)(
  'never overwrites an existing %s or registers listeners when reservation fails',
  (existing) => {
    const test = scope();
    const path = existing === 'receipt' ? test.config.resultPath : test.sidecar;
    writeFileSync(path, 'SYNTHETIC_OLD_EVIDENCE', { mode: 0o600 });
    const before = process.listenerCount('uncaughtExceptionMonitor');
    expect(() =>
      installCapacityProcessDiagnostics(test.config, {
        COLORPLAY_LIVE_CONFIRM: 'LOCAL_LOW_DEVICE_ONLY',
      }),
    ).toThrow();
    expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(before);
    expect(readFileSync(path, 'utf8')).toBe('SYNTHETIC_OLD_EVIDENCE');
    if (existing === 'receipt') expect(existsSync(test.sidecar)).toBe(false);
  },
);

it.each(['dry', 'hosted', 'unsafe', 'confirm'] as const)(
  'rejects %s scope before sidecar persistence',
  (mode) => {
    const test = scope();
    const config = {
      ...test.config,
      ...(mode === 'dry'
        ? { dryRun: true }
        : mode === 'hosted'
          ? { environment: 'staging' as const }
          : mode === 'unsafe'
            ? { supabaseUrl: 'https://hosted.invalid' }
            : {}),
    };
    expect(() =>
      installCapacityProcessDiagnostics(config, {
        COLORPLAY_LIVE_CONFIRM:
          mode === 'confirm' ? 'wrong' : 'LOCAL_LOW_DEVICE_ONLY',
      }),
    ).toThrow();
    expect(existsSync(test.sidecar)).toBe(false);
    expect(existsSync(config.resultPath)).toBe(false);
  },
);

it('keeps unknown exit signals and codes safe and drops arbitrary strings', () => {
  expect(
    safeCapacityChildExit(
      'SYNTHETIC_SECRET_MARKER',
      'SYNTHETIC_SECRET_MARKER',
      'SYNTHETIC_SECRET_MARKER',
    ),
  ).toEqual({ exitCode: null, signal: 'unknown', spawnError: false });
});

it('does not throw or change the normal exit when passive sidecar writes fail', () => {
  const test = scope();
  const result = child(
    test.config,
    `
    const fs = await import('node:fs');
    const { syncBuiltinESMExports } = await import('node:module');
    fs.default.writeSync = () => { throw new Error('SYNTHETIC_SECRET_MARKER'); };
    syncBuiltinESMExports();
    process.emit('uncaughtExceptionMonitor', new Error('SYNTHETIC_SECRET_MARKER'), 'uncaughtException');
  `,
  );
  expect(result.status).toBe(0);
  expect(
    JSON.parse(readFileSync(test.sidecar, 'utf8')) as unknown,
  ).toMatchObject({ events: [] });
});

it.each(['path', 'revision'] as const)(
  'rejects a directly constructed unsafe %s before creating a sidecar',
  (kind) => {
    const test = scope();
    expect(() =>
      installCapacityProcessDiagnostics(
        {
          ...test.config,
          ...(kind === 'path'
            ? { resultPath: `${test.config.resultPath}.unexpected` }
            : { expectedRevision: 'SYNTHETIC_SECRET_MARKER' }),
        },
        { COLORPLAY_LIVE_CONFIRM: 'LOCAL_LOW_DEVICE_ONLY' },
      ),
    ).toThrow();
    expect(existsSync(test.sidecar)).toBe(false);
  },
);
