import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';

import { expect, test, type BrowserContext } from '@playwright/test';

import { restrictBrowserToLocal } from '../../scripts/live/capacity-browser-actor';
import { parseCapacityConfig } from '../../scripts/live/capacity-config';

const listen = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
const url = (server: Server) => {
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('SYNTHETIC_ORIGIN_MISSING');
  return `http://127.0.0.1:${String(address.port)}`;
};
const close = async (server: Server) => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
};

test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test('synthetic Local WebSocket echo succeeds while disallowed HTTP, redirect and WebSocket remain blocked', async ({
  browser,
}) => {
  let deniedRequests = 0;
  let allowedRequests = 0;
  let allowedUpgrades = 0;
  let deniedUpgrades = 0;
  const sockets = new Set<Duplex>();
  const denied = createServer((_request, response) => {
    deniedRequests += 1;
    response.end('must not be requested');
  });
  denied.on('upgrade', (_request, socket) => {
    deniedUpgrades += 1;
    socket.destroy();
  });
  const backend = createServer((_request, response) =>
    response.end('synthetic backend'),
  );
  backend.on('upgrade', (request, socket) => {
    allowedUpgrades += 1;
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
    socket.on('error', () => undefined);
    const key = request.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      if (pending.length > 4096) {
        socket.destroy();
        return;
      }
      if (pending.length < 6) return;
      const length = (pending[1] ?? 0) & 127;
      if (length > 125) {
        socket.destroy();
        return;
      }
      if (pending.length < length + 6) return;
      if (((pending[0] ?? 0) & 15) === 8) {
        socket.end();
        return;
      }
      const payload = Buffer.from(pending.subarray(6, 6 + length));
      for (let index = 0; index < length; index += 1)
        payload[index] =
          (payload[index] ?? 0) ^ (pending[2 + (index % 4)] ?? 0);
      socket.write(Buffer.concat([Buffer.from([129, length]), payload]));
      pending = pending.subarray(length + 6);
    });
  });
  const allowed = createServer((request, response) => {
    allowedRequests += 1;
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: `${url(denied)}/landing` });
      response.end();
    } else {
      response.end('allowed response');
    }
  });
  let context: BrowserContext | undefined;
  try {
    await listen(denied);
    await listen(allowed);
    await listen(backend);
    context = await browser.newContext({ serviceWorkers: 'block' });
    const app = url(allowed);
    await restrictBrowserToLocal(
      context,
      parseCapacityConfig(
        [
          '--revision',
          'a'.repeat(40),
          '--url',
          app,
          '--supabase-url',
          url(backend),
        ],
        {},
      ),
    );
    const page = await context.newPage();
    const positive = await page.goto(`${app}/allowed`);
    expect(await page.textContent('body')).toBe('allowed response');
    expect(await positive?.finished()).toBeNull();
    const duration = positive?.request().timing().responseEnd;
    expect(
      typeof duration === 'number' &&
        Number.isFinite(duration) &&
        duration >= 0,
    ).toBe(true);
    const probeSocket = (endpoint: string) =>
      page.evaluate(
        (target) =>
          new Promise<string>((resolve) => {
            let socket: WebSocket | undefined;
            let finished = false;
            const timer = setTimeout(() => {
              finish('timeout');
            }, 3000);
            const finish = (outcome: string) => {
              if (finished) return;
              finished = true;
              clearTimeout(timer);
              socket?.close();
              resolve(outcome);
            };
            try {
              socket = new WebSocket(target);
              socket.onopen = () => {
                socket?.send('synthetic-ping');
              };
              socket.onmessage = (event) => {
                finish(event.data === 'synthetic-ping' ? 'echo' : 'unexpected');
              };
              socket.onerror = () => {
                finish('socket_error');
              };
              socket.onclose = () => {
                finish('socket_closed');
              };
            } catch {
              finish('socket_error');
            }
          }),
        endpoint,
      );
    const outcome = await probeSocket(url(backend).replace('http:', 'ws:'));
    expect({ outcome, allowedUpgrades }).toEqual({
      outcome: 'echo',
      allowedUpgrades: 1,
    });
    const directHttp = await page.evaluate(
      async (target) => {
        try {
          await fetch(target, { signal: AbortSignal.timeout(3000) });
          return 'unexpected';
        } catch {
          return 'blocked';
        }
      },
      `${url(denied)}/direct`,
    );
    expect(directHttp).toBe('blocked');
    expect(['socket_error', 'socket_closed']).toContain(
      await probeSocket(url(denied).replace('http:', 'ws:')),
    );
    await page.goto(`${app}/redirect`, { timeout: 5000 }).catch(() => null);
    expect(allowedRequests).toBeGreaterThanOrEqual(2);
    expect(deniedRequests).toBe(0);
    expect(deniedUpgrades).toBe(0);
  } finally {
    try {
      await context?.close();
    } finally {
      for (const socket of sockets) socket.destroy();
      await Promise.all([close(allowed), close(denied), close(backend)]);
    }
  }
});
