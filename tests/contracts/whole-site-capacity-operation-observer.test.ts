import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { createCapacityOperationObserver } from '../../scripts/concurrency/capacity-operation-observer';
import { capacityFixture } from './helpers/whole-site-capacity';
import { parseCapacityScope } from '../../scripts/concurrency/capacity-scope';
const fixture = async () => {
  const f = await capacityFixture(),
    scope = parseCapacityScope(f.input, f.proof),
    cdp = Object.assign(new EventEmitter(), {
      send: vi.fn(async () => {
        await Promise.resolve();
        return undefined;
      }),
      detach: vi.fn(async () => {
        await Promise.resolve();
        return undefined;
      }),
    }),
    context = {
      newCDPSession: async () => {
        await Promise.resolve();
        return cdp;
      },
    },
    page = { isClosed: () => false },
    signal = new AbortController();
  let id = 0;
  const observer = await createCapacityOperationObserver(
    scope,
    context as unknown as BrowserContext,
    page as Page,
    1,
    signal.signal,
    () => `op-${String(++id).padStart(6, '0')}`,
    () => true,
  );
  return { scope, cdp, observer, signal };
};
describe('native five-operation physical measurement', () => {
  it('measures exact browser HTTP attempts including intervening retry gap, without reading postData', async () => {
    const f = await fixture();
    await f.observer.run('published_content', 'cold', async () => {
      await Promise.resolve();
      for (const [i, status] of [503, 200].entries()) {
        f.cdp.emit('Network.requestWillBeSent', {
          requestId: `secret${String(i)}`,
          timestamp: 100 + i * 2,
          request: {
            url: f.scope.supabaseUrl + '/rest/v1/rpc/get_student_chapter_map',
            method: 'POST',
            get postData() {
              throw Error('SECRET_MARKER');
            },
          },
        });
        f.cdp.emit('Network.responseReceived', {
          requestId: `secret${String(i)}`,
          response: { status },
        });
        f.cdp.emit('Network.loadingFinished', {
          requestId: `secret${String(i)}`,
          timestamp: 100.1 + i * 2,
        });
      }
    });
    const [sample] = f.observer.samples();
    expect(sample?.finishedAtMs).toBe(102100);
    expect(sample?.startedAtMs).toBe(100000);
    expect(sample?.attempts).toHaveLength(2);
    expect(sample?.status).toBe('success');
    expect(JSON.stringify(sample)).not.toMatch(/secret|SECRET_MARKER/);
    await f.observer.dispose();
    expect(f.cdp.listenerCount('Network.requestWillBeSent')).toBe(0);
  });
  it('keeps errors for an unsuccessful replay and refuses foreign origins/unknown methods', async () => {
    const f = await fixture();
    await expect(
      f.observer.run(
        'submit_answer',
        'warm',
        async () => {
          await Promise.resolve();
          f.cdp.emit('Network.requestWillBeSent', {
            requestId: 'bad',
            timestamp: 1,
            request: {
              url: 'https://example.invalid/rest/v1/rpc/submit_quiz_answer',
              method: 'POST',
            },
          });
          f.cdp.emit('Network.requestWillBeSent', {
            requestId: 'own',
            timestamp: 2,
            request: {
              url: f.scope.supabaseUrl + '/rest/v1/rpc/submit_quiz_answer',
              method: 'POST',
            },
          });
          f.cdp.emit('Network.responseReceived', {
            requestId: 'own',
            response: { status: 429 },
          });
          f.cdp.emit('Network.loadingFinished', {
            requestId: 'own',
            timestamp: 2.1,
          });
          throw Error('SECRET_MARKER');
        },
        'op-000001',
      ),
    ).rejects.toThrow('CAPACITY_EVIDENCE_INVALID');
    expect(f.observer.samples()[0]).toMatchObject({
      status: 'error',
      reason: 'rate_limited',
      replayOf: 'op-000001',
    });
    expect(f.observer.snapshot().physicalRequests).toBe(1);
    await f.observer.dispose();
  });
});
