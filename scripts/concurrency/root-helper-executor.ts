import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { join, dirname, basename } from 'node:path';
import {
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
  onError(listener: () => void): void;
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
): Promise<string> =>
  new Promise((resolve, reject) => {
    const isAborted = () => signal.aborted;
    const failed = () => {
      reject(new Error('ROOT_HELPER_INVALID'));
    };
    try {
      if (
        isAborted() ||
        args.some((a) => a.length > 4096 || /[\r\n\0]/u.test(a)) ||
        !argumentsValid(helper, args) ||
        Buffer.byteLength(input ?? '') > 131072
      ) {
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
      const chunks: Buffer[] = [];
      let bytes = 0,
        invalid = false,
        closed = false;
      const isInvalid = () => invalid;
      const kill = () => {
        if (closed) return;
        invalid = true;
        try {
          if (child.pid) ports.killGroup(child.pid);
        } catch {
          /* fixed result only */
        }
      };
      const timer = setTimeout(kill, 30000);
      signal.addEventListener('abort', kill, { once: true });
      child.stdout.on('data', (chunk: Buffer) => {
        if (closed) return;
        bytes += chunk.length;
        if (bytes > 131072) kill();
        else chunks.push(chunk);
      });
      child.stdout.on('error', kill);
      child.stdin.on('error', kill);
      child.onError(() => {
        invalid = true;
      });
      child.onClose((code, stopSignal) => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', kill);
        if (invalid || isAborted() || code !== 0 || stopSignal !== null)
          failed();
        else resolve(Buffer.concat(chunks).toString('utf8'));
      });
      if (isAborted()) kill();
      try {
        child.stdin.end(isInvalid() ? '' : (input ?? ''));
      } catch {
        kill();
      }
    } catch {
      failed();
    }
  });
