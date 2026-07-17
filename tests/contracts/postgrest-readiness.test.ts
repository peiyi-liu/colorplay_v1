import { execFile } from 'node:child_process';
import { createServer, type RequestListener, type Server } from 'node:http';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const servers: Server[] = [];

const startServer = async (handler: RequestListener): Promise<string> => {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('POSTGREST_READINESS_TEST_ADDRESS_MISSING');
  }
  return `http://127.0.0.1:${String(address.port)}`;
};

const runProbe = (url: string, timeoutSeconds: string) =>
  execFileAsync('bash', ['scripts/supabase/wait-for-postgrest.sh'], {
    env: {
      PATH: process.env.PATH,
      POSTGREST_READINESS_POLL_INTERVAL_SECONDS: '0.05',
      POSTGREST_READINESS_TIMEOUT_SECONDS: timeoutSeconds,
      SUPABASE_ANON_KEY: 'contract-anon-key',
      SUPABASE_URL: url,
    },
  });

const captureProbeStderr = async (
  url: string,
  timeoutSeconds: string,
): Promise<string> => {
  let rejection: unknown;
  try {
    await runProbe(url, timeoutSeconds);
  } catch (error) {
    rejection = error;
  }
  if (typeof rejection !== 'object' || rejection === null) {
    throw new Error('POSTGREST_READINESS_EXPECTED_REJECTION');
  }
  const stderr = (rejection as Record<string, unknown>).stderr;
  if (typeof stderr !== 'string') {
    throw new Error('POSTGREST_READINESS_STDERR_MISSING');
  }
  return stderr;
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
});

describe('PostgREST readiness probe', () => {
  it('polls the schema endpoint until PGRST002 clears without exposing the key', async () => {
    let requests = 0;
    const url = await startServer((request, response) => {
      requests += 1;
      expect(request.url).toBe('/rest/v1/profiles?select=id&limit=1');
      expect(request.headers.apikey).toBe('contract-anon-key');
      if (requests === 1) {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end('{"code":"PGRST002"}');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('[]');
    });

    const result = await runProbe(url, '2');

    expect(requests).toBe(2);
    expect(result.stdout).toContain('POSTGREST_READY');
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      'contract-anon-key',
    );
  });

  it('fails with a stable error after the bounded timeout', async () => {
    const url = await startServer((_request, response) => {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end('{"code":"PGRST002"}');
    });

    expect(await captureProbeStderr(url, '1')).toContain(
      'POSTGREST_READINESS_TIMEOUT',
    );
  });

  it('does not report readiness when the REST endpoint is unreachable', async () => {
    const url = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('[]');
    });
    const server = servers.pop();
    if (!server) throw new Error('POSTGREST_READINESS_TEST_SERVER_MISSING');
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    expect(await captureProbeStderr(url, '1')).toContain(
      'POSTGREST_READINESS_TIMEOUT',
    );
  });
});
