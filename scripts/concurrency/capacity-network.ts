import {
  createRegistrationFirstReason,
  registerRegistrationDiagnostics,
} from './capacity-registration-final-diagnostics';
import { createServer, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  requireCapacityScope,
  capacityFailure,
  type CapacityScope,
} from './capacity-scope';
export interface CapacityProxyLease {
  origin: string;
  snapshot: () => {
    available: boolean;
    rejectedRequests: number;
    forwardedRequests: 0;
  };
  close: () => Promise<void>;
}
const owned = new WeakSet<object>();
export const capacityProxyArguments = (
  scope: CapacityScope,
  proxy: CapacityProxyLease,
): string[] => {
  requireCapacityScope(scope);
  if (!owned.has(proxy)) return capacityFailure();
  return [
    `--proxy-server=${proxy.origin}`,
    `--proxy-bypass-list=<-loopback>;${[scope.appUrl, scope.supabaseUrl, scope.mailpitUrl].map((value) => new URL(value).host).join(';')}`,
  ];
};
export const createCapacityProxy = async (
  scope: CapacityScope,
  signal: AbortSignal,
  factory: () => Server = () => createServer(),
): Promise<CapacityProxyLease> => {
  requireCapacityScope(scope);
  if (signal.aborted) return capacityFailure();
  const diagnostic = createRegistrationFirstReason();
  const server = factory(),
    sockets = new Set<Duplex>();
  let available = true,
    rejectedRequests = 0,
    stopping = false,
    closing: Promise<void> | undefined,
    rejectStart: () => void = () => undefined;
  server.on('request', (_request, response) => {
    rejectedRequests++;
    response.writeHead(403);
    response.end();
  });
  const rejectTunnel = (_request: unknown, socket: Duplex) => {
    rejectedRequests++;
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  };
  server.on('connect', rejectTunnel);
  server.on('upgrade', rejectTunnel);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
    });
  });
  server.on('error', () => {
    diagnostic.note('PROXY_ERROR');
    available = false;
    rejectStart();
  });
  const isStopped = () => stopping || signal.aborted;
  const close = () =>
    (closing ??= (async () => {
      diagnostic.note('STOP');
      stopping = true;
      available = false;
      signal.removeEventListener('abort', abort);
      for (const socket of sockets) socket.destroy();
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => {
            if (error) reject(new Error('CAPACITY_EVIDENCE_INVALID'));
            else resolve();
          }),
        );
    })());
  const abort = () => {
    diagnostic.note('ABORT');
    stopping = true;
    void close().catch(() => undefined);
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      rejectStart = () => {
        reject(new Error('CAPACITY_EVIDENCE_INVALID'));
      };
      server.listen(0, '127.0.0.1', resolve);
    });
    if (isStopped()) {
      closing = undefined;
      await close();
      return capacityFailure();
    }
    const address = server.address();
    if (
      !address ||
      typeof address === 'string' ||
      address.address !== '127.0.0.1' ||
      !Number.isInteger(address.port) ||
      address.port < 1
    )
      return capacityFailure();
    const proxy: CapacityProxyLease = {
      origin: `http://127.0.0.1:${String(address.port)}`,
      snapshot: () => ({
        available: available && !stopping,
        rejectedRequests,
        forwardedRequests: 0,
      }),
      close,
    };
    registerRegistrationDiagnostics(proxy, diagnostic.snapshot);
    owned.add(proxy);
    return proxy;
  } catch {
    await close().catch(() => undefined);
    return capacityFailure();
  }
};
