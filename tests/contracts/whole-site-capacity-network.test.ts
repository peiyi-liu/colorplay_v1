import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { describe, it, expect, vi } from 'vitest';
import {
  createCapacityProxy,
  capacityProxyArguments,
} from '../../scripts/concurrency/capacity-network';
import {
  parseCapacityScope,
  capacityScopeSchema,
} from '../../scripts/concurrency/capacity-scope';
import { capacityFixture } from './helpers/whole-site-capacity';
const fake = () => {
  const server = Object.assign(new EventEmitter(), {
    listening: false,
    listen: vi.fn((_port: number, _host: string, ready: () => void) => {
      server.listening = true;
      queueMicrotask(ready);
      return server;
    }),
    address: () => ({ address: '127.0.0.1', family: 'IPv4', port: 61234 }),
    close: vi.fn((done: (error?: Error) => void) => {
      server.listening = false;
      done();
      return server;
    }),
  });
  return server;
};
describe('owned reject-only proxy and exact native bypass', () => {
  it('binds loopback, rejects HTTP/CONNECT/WS without upstream or route and preserves exact only3-origin bypass', async () => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      server = fake(),
      proxy = await createCapacityProxy(
        scope,
        new AbortController().signal,
        () => server as unknown as Server,
      );
    expect(server.listen).toHaveBeenCalledWith(
      0,
      '127.0.0.1',
      expect.any(Function),
    );
    const response = { writeHead: vi.fn(), end: vi.fn() };
    server.emit('request', { url: 'http://foreign.invalid/' }, response);
    const socket = { end: vi.fn() };
    server.emit('connect', {}, socket);
    server.emit('upgrade', {}, socket);
    expect(response.writeHead).toHaveBeenCalledWith(403);
    expect(socket.end).toHaveBeenCalledTimes(2);
    expect(capacityProxyArguments(scope, proxy)).toEqual([
      '--proxy-server=http://127.0.0.1:61234',
      '--proxy-bypass-list=<-loopback>;127.0.0.1:58373;127.0.0.1:58321;127.0.0.1:58324',
    ]);
    await proxy.close();
    expect(server.close).toHaveBeenCalledTimes(1);
  });
  it('rejects unverified scope before server construction and propagates close failure', async () => {
    const h = await capacityFixture(),
      factory = vi.fn();
    await expect(
      createCapacityProxy(
        capacityScopeSchema.parse(h.input),
        new AbortController().signal,
        factory,
      ),
    ).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
    const scope = parseCapacityScope(h.input, h.proof),
      server = fake();
    server.close.mockImplementationOnce((done) => {
      done(new Error('SYNTHETIC_SECRET'));
      return server;
    });
    const proxy = await createCapacityProxy(
      scope,
      new AbortController().signal,
      () => server as unknown as Server,
    );
    await expect(proxy.close()).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
  });
  it('closes a proxy whose bind finishes after abort rather than leaking a loopback listener', async () => {
    const h = await capacityFixture(),
      scope = parseCapacityScope(h.input, h.proof),
      server = fake();
    let ready: () => void = () => undefined;
    server.listen.mockImplementation((_port, _host, done) => {
      ready = done;
      return server;
    });
    const controller = new AbortController(),
      work = createCapacityProxy(
        scope,
        controller.signal,
        () => server as unknown as Server,
      );
    const rejected = expect(work).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    controller.abort();
    server.listening = true;
    ready();
    await rejected;
    expect(server.listening).toBe(false);
    expect(server.close).toHaveBeenCalledTimes(1);
  });
});
