import { decodeRootSamplerTiming } from './root-sampler-timing-decoder';
import { samplerTimingSchema } from './root-sampler-timing-contracts';
import { z } from 'zod';
import { rootStabilitySchema } from './root-stability-contracts';
import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { join, dirname, basename } from 'node:path';
import {
  rootHelperEventSchema,
  rootSamplerFailureSchema,
  rootSamplerCodes,
  rootSamplerStages,
  rootErrnos,
  type RootHelperObserver,
  type RootHelperEvent,
  ROOT_RUNTIME_DIRECTORY,
  linuxExecutableNames,
  functionalHelperNames,
  capacityHelperNames,
  requireRootHelperAuthority,
  type RootExecutable,
  type RootHelperAuthority,
} from './root-helper-contracts';
export interface RootHelperChild {
  pid: number | undefined;
  stdin: Pick<Writable, 'on' | 'end'>;
  stdout: Pick<Readable, 'on'>;
  onError(listener: (error?: unknown) => void): void;
  onClose(
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): void;
}
export interface RootHelperProcessPorts {
  platform: string;
  spawn(command: string, args: readonly string[]): RootHelperChild;
  killGroup(pid: number): void;
}
const nativePorts: RootHelperProcessPorts = {
  platform: process.platform,
  spawn: (command, args) => {
    const c = spawn(command, [...args], {
      detached: true,
      env: {
        PATH: '/usr/bin:/bin',
        ...(process.platform === 'darwin'
          ? { DEVELOPER_DIR: '/Library/Developer/CommandLineTools' }
          : {}),
      },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return {
      pid: c.pid,
      stdin: c.stdin,
      stdout: c.stdout,
      onError: (fn) => {
        c.once('error', fn);
      },
      onClose: (fn) => {
        c.once('close', fn);
      },
    };
  },
  killGroup: (pid) => {
    process.kill(-pid, 'SIGKILL');
  },
};
const sha = /^[a-f0-9]{64}$/u,
  revision = /^[a-f0-9]{40}$/u;
const argumentsValid = (helper: RootExecutable, args: readonly string[]) => {
  if (
    helper === 'host-sample.py' ||
    helper === 'vm-sample.py' ||
    helper === 'linux-host-sample.py' ||
    helper === 'backend-cgroup-sample.py'
  )
    return args.length === 0;
  if (helper === 'execution-profile-preflight.py')
    return (
      args.length === 3 &&
      revision.test(args[0] ?? '') &&
      sha.test(args[1] ?? '') &&
      /^[a-f0-9]{32}$/u.test(args[2] ?? '')
    );
  if ((capacityHelperNames as readonly string[]).includes(helper))
    return (
      args.length === 3 &&
      revision.test(args[0] ?? '') &&
      /^wsc-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u.test(args[1] ?? '') &&
      sha.test(args[2] ?? '')
    );
  if (
    !(functionalHelperNames as readonly string[]).includes(helper) ||
    args.length !== 2 ||
    !revision.test(args[0] ?? '')
  )
    return false;
  return helper === 'media-readback.py'
    ? dirname(args[1] ?? '') ===
        join(ROOT_RUNTIME_DIRECTORY, 'functional-private') &&
        /^wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u.test(basename(args[1] ?? ''))
    : /^wsb-[a-z0-9]{6,16}-[a-z0-9]{6,16}$/u.test(args[1] ?? '');
};
/** Native IO only: approved Linux closure is required even for bootstrap.
 * Callers additionally recheck every closure byte before and after each call. */
export const executeRootHelper = (
  helper: RootExecutable,
  args: readonly string[],
  input: string | null,
  signal: AbortSignal,
  authority?: RootHelperAuthority,
  ports: RootHelperProcessPorts = nativePorts,
  observer?: RootHelperObserver,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const emit = (event: RootHelperEvent) => {
      try {
        observer?.(event);
      } catch {
        /* Observation cannot change execution. */
      }
    };
    let stage: RootHelperEvent['event'] = 'ADMISSION';
    emit({ event: 'ADMISSION', state: 'ENTERED' });
    const isAborted = () => signal.aborted;
    const failed = () => {
      if (stage === 'ADMISSION') emit({ event: 'ADMISSION', state: 'FAILED' });
      emit({ event: 'REJECT', state: 'FAILED' });
      reject(new Error('ROOT_HELPER_INVALID'));
    };
    try {
      if (
        isAborted() ||
        args.some((a) => a.length > 4096 || /[\r\n\0]/u.test(a)) ||
        !argumentsValid(helper, args) ||
        Buffer.byteLength(input ?? '') > 131072
      ) {
        emit({ event: 'ADMISSION', state: 'FAILED' });
        failed();
        return;
      }
      if (ports.platform === 'linux') {
        requireRootHelperAuthority(authority);
        if (!(linuxExecutableNames as readonly string[]).includes(helper)) {
          failed();
          return;
        }
      } else if (
        ports.platform !== 'darwin' ||
        authority ||
        !(
          [
            ...functionalHelperNames,
            ...capacityHelperNames,
            'host-sample.py',
            'vm-sample.py',
          ] as readonly string[]
        ).includes(helper)
      ) {
        failed();
        return;
      }
      emit({ event: 'ADMISSION', state: 'COMPLETED' });
      stage = 'SPAWN';
      emit({ event: 'SPAWN', state: 'ENTERED' });
      const child = ports.spawn(
        ports.platform === 'linux'
          ? '/usr/bin/python3'
          : '/opt/homebrew/bin/python3',
        [
          ...(ports.platform === 'linux' ? ['-B'] : []),
          join(ROOT_RUNTIME_DIRECTORY, helper),
          ...args,
        ],
      );
      const pidPresent = Number.isInteger(child.pid) && (child.pid ?? 0) > 0;
      emit({ event: 'SPAWN', state: 'RETURNED', pidPresent });
      const chunks: Buffer[] = [];
      let bytes = 0,
        invalid = false,
        closed = false;
      const isInvalid = () => invalid;
      const kill = (event: RootHelperEvent['event'], error?: unknown) => {
        if (closed) {
          emit({ event: 'LATE', state: 'FAILED' });
          return;
        }
        emit({ event, state: 'REQUESTED', nodeCode: rootNodeCode(error) });
        invalid = true;
        try {
          if (child.pid) ports.killGroup(child.pid);
        } catch {
          /* fixed result only */
        }
      };
      const timer = setTimeout(() => {
        kill('DEADLINE');
      }, 30000);
      const aborted = () => {
        kill('ABORT');
      };
      signal.addEventListener('abort', aborted, { once: true });
      child.stdout.on('data', (chunk: Buffer) => {
        if (closed) {
          emit({ event: 'LATE', state: 'FAILED' });
          return;
        }
        if (bytes === 0) emit({ event: 'STDOUT', state: 'OBSERVED' });
        bytes += chunk.length;
        if (bytes > 131072) kill('OUTPUT_LIMIT');
        else chunks.push(chunk);
      });
      child.stdout.on('error', (error: unknown) => {
        kill('STDOUT', error);
      });
      child.stdin.on('error', (error: unknown) => {
        kill('STDIN', error);
      });
      child.onError((error) => {
        emit({
          event: closed ? 'LATE' : 'ERROR',
          state: 'FAILED',
          nodeCode: rootNodeCode(error),
        });
        invalid = true;
      });
      child.onClose((code, stopSignal) => {
        if (closed) {
          emit({ event: 'LATE', state: 'FAILED' });
          return;
        }
        closed = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', aborted);
        emit({
          event: 'CLOSE',
          state:
            invalid || isAborted() || code !== 0 || stopSignal !== null
              ? 'FAILED'
              : 'COMPLETED',
          pidPresent,
          exitCode: code,
          stopSignal: rootStopSignal(stopSignal),
          stdoutBytes: bytes,
          envelopeState: 'UNOBSERVED',
        });
        const data = Buffer.concat(chunks);
        if (observer && bytes <= 131072 && helper === 'linux-host-sample.py') {
          const timing = decodeRootSamplerTiming(data.toString('utf8'));
          emit({
            event: 'HOST_TIMING',
            state: 'OBSERVED',
            timingState: timing.collection,
            timingAuthority: timing.authority,
            ...('samplerTiming' in timing
              ? { samplerTiming: timing.samplerTiming }
              : {}),
          });
        }
        const complete =
          pidPresent &&
          !invalid &&
          !isAborted() &&
          bytes <= 131072 &&
          stopSignal === null &&
          code !== null;
        let utf8 = true;
        if (complete) {
          try {
            new TextDecoder('utf-8', { fatal: true }).decode(data);
          } catch {
            utf8 = false;
            emit({ event: 'UTF8', state: 'FAILED' });
          }
        }
        if (complete && code !== 0 && utf8) {
          const decoded = decodeRootSamplerFailure(data.toString('utf8'));
          const envelope =
            decoded &&
            (helper === 'linux-host-sample.py' || helper === 'host-sample.py'
              ? decoded.result === 'HOST_SAMPLE_UNAVAILABLE'
              : helper === 'backend-cgroup-sample.py' &&
                decoded.result === 'BACKEND_SAMPLE_UNAVAILABLE')
              ? decoded
              : undefined;
          emit({
            event: 'ENVELOPE',
            state: envelope ? 'COMPLETED' : 'FAILED',
            envelopeState: envelope ? 'OBSERVED' : 'UNAVAILABLE',
            ...(envelope ? { envelope } : {}),
          });
        }
        if (invalid || isAborted() || code !== 0 || stopSignal !== null)
          failed();
        else {
          emit({ event: 'RESOLVE', state: 'REQUESTED' });
          resolve(data.toString('utf8'));
        }
      });
      if (isAborted()) kill('ABORT');
      stage = 'STDIN';
      try {
        emit({ event: 'STDIN', state: 'ENTERED' });
        child.stdin.end(isInvalid() ? '' : (input ?? ''));
        emit({ event: 'STDIN', state: 'RETURNED' });
      } catch (error) {
        kill('STDIN', error);
      }
    } catch (error) {
      emit({ event: stage, state: 'FAILED', nodeCode: rootNodeCode(error) });
      failed();
    }
  });

export const rootNodeCode = (error: unknown): RootHelperEvent['nodeCode'] => {
  try {
    const code: unknown =
      typeof error === 'object' && error !== null
        ? Reflect.get(error, 'code')
        : null;
    return rootHelperEventSchema.shape.nodeCode.unwrap().safeParse(code).success
      ? (code as RootHelperEvent['nodeCode'])
      : 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
};
export const rootStopSignal = (
  value: unknown,
): z.infer<typeof rootHelperEventSchema>['stopSignal'] => {
  const v = rootHelperEventSchema.shape.stopSignal.unwrap().safeParse(value);
  return v.success ? v.data : 'UNKNOWN';
};
export const decodeRootSamplerFailure = (text: string) => {
  try {
    const v = z
      .strictObject({
        result: z.enum([
          'HOST_SAMPLE_UNAVAILABLE',
          'BACKEND_SAMPLE_UNAVAILABLE',
        ]),
        code: z.string().max(80),
        stage: z.string().max(40),
        errno: z.string().max(20).nullable(),
        rawProviderOutput: z.literal(false),
        stability: rootStabilitySchema.optional(),
        samplerTiming: samplerTimingSchema.optional(),
      })
      .parse(JSON.parse(text));
    return rootSamplerFailureSchema.parse({
      ...v,
      code: new Set<string>(rootSamplerCodes).has(v.code) ? v.code : 'UNKNOWN',
      stage: new Set<string>(rootSamplerStages).has(v.stage)
        ? v.stage
        : 'UNKNOWN',
      errno:
        v.errno === null
          ? null
          : new Set<string>(rootErrnos).has(v.errno)
            ? v.errno
            : 'UNKNOWN',
    });
  } catch {
    return undefined;
  }
};
