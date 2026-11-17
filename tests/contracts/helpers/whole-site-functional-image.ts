import { EventEmitter } from 'node:events';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { vi } from 'vitest';
import { createFunctionalHealth } from '../../../scripts/concurrency/functional-health';
import type { FunctionalStage } from '../../../scripts/concurrency/functional-receipt';
import { syntheticScope } from './whole-site-functional';
export const path = '/assets/blooks/synthetic-256.webp';
export const app = syntheticScope().appUrl;
export const setup = async (
  proof: unknown = { result: 'DECODED' },
  approved = [path],
) => {
  let phase: FunctionalStage | null = 'student_s1';
  let url = `${app}/shop`;
  let closed = false;
  const frame = {};
  const evaluate = vi.fn(() => Promise.resolve(proof));
  const page = Object.assign(new EventEmitter(), {
    isClosed: () => closed,
    opener: () => Promise.resolve(null),
    url: () => url,
    mainFrame: () => frame,
    evaluate,
  });
  const cdp = Object.assign(new EventEmitter(), {
    send: (method: string) =>
      Promise.resolve(
        method === 'Browser.getVersion'
          ? {
              product: 'Chrome/159.0.8154.6',
              protocolVersion: '1.3',
              revision: '@' + 'a'.repeat(40),
            }
          : method === 'Page.getFrameTree'
            ? {
                frameTree: {
                  frame: { id: 'frame1', loaderId: 'document1', url },
                },
              }
            : {},
      ),
    detach: () => Promise.resolve(),
  });
  const health = createFunctionalHealth(
    syntheticScope(),
    () => phase,
    [],
    approved,
  );
  await health.attach(
    {
      newCDPSession: () => Promise.resolve(cdp as unknown as CDPSession),
    } as unknown as BrowserContext,
    page as unknown as Page,
  );
  health.identify(page as unknown as Page, 'S1');
  const request = (patch: Record<string, unknown> = {}) =>
    cdp.emit('Network.requestWillBeSent', {
      requestId: 'image1',
      type: 'Image',
      documentURL: url,
      loaderId: 'document1',
      frameId: 'frame1',
      request: { url: `${app}${path}`, method: 'GET' },
      ...patch,
    });
  const cancel = (patch: Record<string, unknown> = {}) =>
    cdp.emit('Network.loadingFailed', {
      requestId: 'image1',
      type: 'Image',
      errorText: 'net::ERR_ABORTED',
      canceled: true,
      ...patch,
    });
  return {
    health,
    page,
    cdp,
    evaluate,
    request,
    cancel,
    identify: (actor: string) => {
      health.identify(page as unknown as Page, actor);
    },
    phase: () => {
      phase = 'teacher_reads';
    },
    navigate: () => {
      cdp.emit('Page.frameNavigated', {
        frame: { id: 'frame1', loaderId: 'document2', url },
      });
    },
    sameDocument: (next: string, patch: Record<string, unknown> = {}) => {
      url = next;
      cdp.emit('Page.navigatedWithinDocument', {
        frameId: 'frame1',
        url,
        navigationType: 'historyApi',
        ...patch,
      });
    },
    foreign: () => {
      url = 'https://synthetic.invalid/shop';
    },
    close: () => {
      closed = true;
      page.emit('close');
    },
  };
};
export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
