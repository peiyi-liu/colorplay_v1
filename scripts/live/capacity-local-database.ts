import { spawn } from 'node:child_process';

import { z } from 'zod';

import {
  assertLoopbackUrl,
  failCapacity,
  requireLocalExecution,
  type CapacityConfig,
} from './capacity-config';

export type LocalQueryRow = Record<string, unknown>;
export interface LocalDatabase {
  execute: (query: string, signal?: AbortSignal) => Promise<void>;
  rows: (query: string, signal?: AbortSignal) => Promise<LocalQueryRow[]>;
}

export const localPostgresEnvironment = (
  databaseUrl: string,
): NodeJS.ProcessEnv => {
  const url = assertLoopbackUrl(databaseUrl, true);
  // No inherited PGHOST / PGSERVICE / connection-string options can redirect us.
  return {
    PATH: process.env.PATH,
    PGHOST: url.hostname.replace(/^\[|\]$/gu, ''),
    PGPORT: url.port,
    PGDATABASE: 'postgres',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '5',
  };
};

export const createLocalDatabase = (config: CapacityConfig): LocalDatabase => {
  requireLocalExecution(config);
  if (!config.databaseUrl)
    return failCapacity('LIVE_CAPACITY_LOCAL_DATABASE_REQUIRED');
  const env = localPostgresEnvironment(config.databaseUrl);
  const executeText = (query: string, signal?: AbortSignal): Promise<string> =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('LIVE_CAPACITY_ABORTED'));
        return;
      }
      const child = spawn(
        'psql',
        [
          '--no-psqlrc',
          '--quiet',
          '--tuples-only',
          '--no-align',
          '--set=ON_ERROR_STOP=1',
        ],
        { env, signal, stdio: ['pipe', 'pipe', 'ignore'] },
      );
      let output = '';
      let processFailed = false;
      let terminationTimer: ReturnType<typeof setTimeout> | undefined;
      const clearTerminationTimer = () => {
        if (terminationTimer !== undefined) clearTimeout(terminationTimer);
      };
      const stopChild = () => {
        processFailed = true;
        if (
          child.pid === undefined ||
          child.exitCode !== null ||
          child.signalCode !== null ||
          terminationTimer !== undefined
        )
          return;
        child.kill('SIGTERM');
        // Still wait for close after escalation. If the OS cannot close the
        // child, the outer settle budget blocks cleanup rather than racing it.
        terminationTimer = setTimeout(() => {
          child.kill('SIGKILL');
        }, 2000);
        terminationTimer.unref();
      };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (output.length + chunk.length > 2_000_000) {
          stopChild();
          return;
        }
        output += chunk;
      });
      child.on('error', () => {
        // Spawn failure has no PID. AbortError with a PID does not mean that
        // psql exited: it may still be running SQL after ignoring SIGTERM.
        if (child.pid === undefined) {
          reject(new Error('LIVE_CAPACITY_LOCAL_DATABASE_UNAVAILABLE'));
          return;
        }
        stopChild();
      });
      child.once('exit', clearTerminationTimer);
      child.on('close', (code) => {
        clearTerminationTimer();
        if (code === 0 && !processFailed && !signal?.aborted)
          resolve(output.trim());
        else reject(new Error('LIVE_CAPACITY_LOCAL_DATABASE_FAILED'));
      });
      child.stdin.on('error', stopChild);
      child.stdin.end(`set statement_timeout = '15s';\n${query}\n`);
    });
  return {
    execute: async (query, signal) => {
      await executeText(query, signal);
    },
    rows: async (query, signal) => {
      const select = query.trim().replace(/;$/u, '');
      const output = await executeText(
        `select coalesce(json_agg(capacity_row), '[]'::json) from (${select}) as capacity_row;`,
        signal,
      );
      try {
        return z
          .array(z.record(z.string(), z.unknown()))
          .parse(JSON.parse(output));
      } catch {
        return failCapacity('LIVE_CAPACITY_LOCAL_DATABASE_RESPONSE_INVALID');
      }
    },
  };
};
