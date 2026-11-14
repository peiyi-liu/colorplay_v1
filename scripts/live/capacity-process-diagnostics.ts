import {
  closeSync,
  existsSync,
  ftruncateSync,
  openSync,
  readSync,
  writeSync,
} from 'node:fs';
import {
  requireLocalExecution,
  failCapacity,
  type CapacityConfig,
} from './capacity-config';
import { STAGES } from './capacity-receipt';

const SIGNALS = [
  'SIGTERM',
  'SIGKILL',
  'SIGABRT',
  'SIGINT',
  'SIGSEGV',
  'SIGBUS',
  'SIGILL',
  'SIGFPE',
  'SIGHUP',
  'SIGQUIT',
  'SIGPIPE',
  'SIGTRAP',
] as const;
export interface CapacityChildExit {
  exitCode: number | null;
  signal: (typeof SIGNALS)[number] | 'unknown' | null;
  spawnError: boolean;
}
export const safeCapacityChildExit = (
  code: unknown,
  signal: unknown,
  spawnError: unknown,
): CapacityChildExit => ({
  exitCode:
    typeof code === 'number' &&
    Number.isInteger(code) &&
    code >= 0 &&
    code <= 255
      ? code
      : null,
  signal:
    signal === null
      ? null
      : (SIGNALS.find((known) => signal === known) ?? 'unknown'),
  spawnError: spawnError === true,
});
export const capacityChildPassed = (exit: CapacityChildExit) =>
  exit.exitCode === 0 && exit.signal === null && !exit.spawnError;
const CODES = new Set([
  'CAPACITY_LOGIN_TIMING_INVALID',
  'CAPACITY_AUTH_TIMING_INVALID',
  'LIVE_CAPACITY_ABORTED',
  'LIVE_CAPACITY_OUTER_TIMEOUT',
  'LIVE_CAPACITY_ACTOR_OPERATION_FAILED',
]);
const stages = new Set<string>(STAGES);
const RESULTS = new Set([
  'RUNNING',
  'PASS',
  'FAIL',
  'BLOCKED',
  'INCONCLUSIVE',
  'NOT_RUN',
]);
const CLEANUP = new Set(['not_run', 'verified', 'failed', 'blocked']);
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const receiptState = (path: string) => {
  const unavailable = {
    stage: 'unobserved',
    receiptResult: 'unobserved',
    cleanup: 'unobserved',
  };
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, 'r');
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    const length = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (length === buffer.length) return unavailable;
    const receipt = record(
      JSON.parse(buffer.subarray(0, length).toString('utf8')) as unknown,
    );
    const stage = receipt?.current_stage ?? receipt?.failureStage;
    const result = receipt?.result;
    const cleanup = record(receipt?.cleanup)?.status;
    return {
      stage: typeof stage === 'string' && stages.has(stage) ? stage : 'unknown',
      receiptResult:
        typeof result === 'string' && RESULTS.has(result) ? result : 'unknown',
      cleanup:
        typeof cleanup === 'string' && CLEANUP.has(cleanup)
          ? cleanup
          : 'unknown',
    };
  } catch {
    return unavailable;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        /* Passive observation only. */
      }
    }
  }
};
const safeError = (error: unknown) => {
  try {
    const own = (key: string): unknown =>
      typeof error === 'object' && error !== null
        ? Object.getOwnPropertyDescriptor(error, key)?.value
        : undefined;
    const code = own('publicCode');
    const message = own('message');
    const publicCode =
      typeof code === 'string' && CODES.has(code)
        ? code
        : typeof message === 'string' && CODES.has(message)
          ? message
          : 'unknown';
    const name =
      error instanceof TypeError
        ? 'TypeError'
        : error instanceof RangeError
          ? 'RangeError'
          : error instanceof SyntaxError
            ? 'SyntaxError'
            : error instanceof Error
              ? 'Error'
              : 'unknown';
    return { publicCode, name };
  } catch {
    return { publicCode: 'unknown', name: 'unknown' };
  }
};

export function installCapacityProcessDiagnostics(
  config: CapacityConfig,
  env: NodeJS.ProcessEnv = process.env,
) {
  requireLocalExecution(config);
  const path = config.resultPath;
  if (
    config.dryRun ||
    !/^[a-f0-9]{40}$/u.test(config.expectedRevision) ||
    env.COLORPLAY_LIVE_CONFIRM !== 'LOCAL_LOW_DEVICE_ONLY' ||
    path !==
      `/private/tmp/colorplay-low-device-${config.runId}-${config.profile}-${String(config.totalActors)}.json` ||
    !/^\/private\/tmp\/colorplay-low-device-c40-[a-z0-9-]{1,31}-(?:browser|protocol|hybrid)-(?:3|10|20|40)\.json$/u.test(
      path,
    )
  )
    return failCapacity('LIVE_CAPACITY_PROCESS_DIAGNOSTIC_SCOPE_INVALID');
  // Never attach a new process story to old evidence or overwrite a sidecar.
  if (existsSync(path)) return failCapacity('LIVE_CAPACITY_RUN_ID_REUSED');
  const sidecarPath = `${path}.process.json`;
  const descriptor = openSync(sidecarPath, 'wx', 0o600);
  let closed = false;
  const events: Record<string, string | number | null>[] = [];
  const save = () => {
    if (closed) return;
    try {
      const bytes = Buffer.from(
        `${JSON.stringify({ passiveMonitor: true, defaultFatalBehaviorPreserved: true, rawErrorStored: false, events })}\n`,
      );
      writeSync(descriptor, bytes, 0, bytes.length, 0);
      ftruncateSync(descriptor, bytes.length);
    } catch {
      /* Diagnostic I/O must not replace the original fatal behavior. */
    }
  };
  const fatal = (error: Error, origin: string) => {
    if (events.length >= 7) return;
    events.push({
      event: 'fatalMonitor',
      origin:
        origin === 'uncaughtException' || origin === 'unhandledRejection'
          ? origin
          : 'unknown',
      ...safeError(error),
      ...receiptState(path),
    });
    save();
  };
  const close = () => {
    if (!closed) {
      closed = true;
      try {
        closeSync(descriptor);
      } catch {
        /* Passive only. */
      }
    }
  };
  const exit = (code: number) => {
    events.push({
      event: 'exit',
      exitCode: safeCapacityChildExit(code, null, false).exitCode,
      ...receiptState(path),
    });
    save();
    close();
  };
  process.on('uncaughtExceptionMonitor', fatal);
  process.on('exit', exit);
  save();
  return {
    sidecarPath,
    dispose: () => {
      process.off('uncaughtExceptionMonitor', fatal);
      process.off('exit', exit);
      close();
    },
  };
}
