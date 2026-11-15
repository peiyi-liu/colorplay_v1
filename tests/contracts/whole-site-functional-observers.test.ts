import { EventEmitter } from 'node:events';
import { installFunctionalNavigation } from '../../scripts/concurrency/functional-navigation';
import type { BrowserContext, Page, Response } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { visitAdminRead } from '../../scripts/concurrency/admin-read-observer';
import { leaveUnsavedMediaEditor } from '../../scripts/concurrency/media-journey';
import {
  assertMediaReadback,
  type MediaReadbackInput,
} from '../../scripts/concurrency/media-readback';
import { syntheticScope } from './helpers/whole-site-functional';
const response = (
  status = 200,
  body: unknown = { outcome: 'ok', rows: [{ synthetic: true }] },
) => {
  const request = {
    method: () => 'POST',
    url: () => 'http://127.0.0.1:58321/rest/v1/rpc/admin_health_summary',
  };
  return {
    url: request.url,
    request: () => request,
    status: () => status,
    finished: () => Promise.resolve(null),
    body: () => Promise.resolve(Buffer.from(JSON.stringify(body))),
  } as unknown as Response;
};
const adminPage = (
  navigate: (page: EventEmitter) => void = () => undefined,
) => {
  const context = new EventEmitter();
  const page = Object.assign(new EventEmitter(), {
    goto: () => {
      navigate(page);
      return Promise.resolve(null);
    },
    waitForURL: () => Promise.resolve(),
    waitForLoadState: vi.fn(() => Promise.resolve()),
    evaluate: () => Promise.resolve(),
    isClosed: () => false,
  });
  installFunctionalNavigation(context as unknown as BrowserContext);
  context.emit('page', page);
  return { page, dispose: () => context.emit('close') };
};
afterEach(() => vi.useRealTimers());
describe('functional Admin observers release listeners and safe outputs', () => {
  it('requires the actual successful privileged response from this navigation request', async () => {
    const h = adminPage((page) => {
      const received = response();
      page.emit('request', received.request());
      page.emit('response', received);
    });
    const result = await visitAdminRead(
      h.page as unknown as Page,
      syntheticScope(),
      new AbortController().signal,
      '/admin',
      'admin_health_summary',
    );
    expect(result).toEqual({ status: 200, rowCount: 1 });
    h.dispose();
    expect(h.page.eventNames()).toHaveLength(0);
  });
  it('cannot treat an unavailable read as successful Admin navigation', async () => {
    const h = adminPage((page) => {
      const received = response(503, { message: 'SYNTHETIC_SECRET' });
      page.emit('request', received.request());
      page.emit('response', received);
    });
    await expect(
      visitAdminRead(
        h.page as unknown as Page,
        syntheticScope(),
        new AbortController().signal,
        '/admin',
        'admin_health_summary',
      ),
    ).rejects.toThrow('FUNCTIONAL_OPERATION_FAILED');
    h.dispose();
    expect(h.page.eventNames()).toHaveLength(0);
  });
  it('old pending/effect same-RPC responses during readiness cannot prove the new route read', async () => {
    let release: () => void = () => undefined;
    const oldPending = new Promise<void>((done) => {
      release = done;
    });
    const h = adminPage((page) => {
      const received = response(200, { outcome: 'ok', rows: [{}, {}] });
      page.emit('request', received.request());
      page.emit('response', received);
    });
    h.page.waitForLoadState.mockReturnValueOnce(oldPending);
    let done = false;
    const pending = visitAdminRead(
      h.page as unknown as Page,
      syntheticScope(),
      new AbortController().signal,
      '/admin',
      'admin_health_summary',
    ).then((value) => {
      done = true;
      return value;
    });
    const old = response();
    h.page.emit('request', old.request());
    h.page.emit('response', old);
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    release();
    expect(await pending).toEqual({ status: 200, rowCount: 2 });
    h.dispose();
    expect(h.page.eventNames()).toHaveLength(0);
  });
  it.each(['timeout', 'abort', 'close'] as const)(
    '%s releases the read observer without unhandled rejection',
    async (mode) => {
      vi.useFakeTimers();
      const h = adminPage();
      const emitter = h.page;
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const task = visitAdminRead(
        emitter as unknown as Page,
        syntheticScope(),
        controller.signal,
        '/admin',
        'admin_health_summary',
        () => Promise.resolve(),
      );
      const caught = expect(task).rejects.toThrow(
        'FUNCTIONAL_OPERATION_FAILED',
      );
      if (mode === 'abort') controller.abort();
      else if (mode === 'close') emitter.emit('close');
      else await vi.advanceTimersByTimeAsync(15_000);
      await caught;
      h.dispose();
      expect(emitter.eventNames()).toHaveLength(0);
      expect(remove).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each([true, false])(
    'only accepts the exact known dirty-editor confirmation (%s)',
    async (expected) => {
      const emitter = new EventEmitter();
      const accept = vi.fn(() => Promise.resolve());
      const dismiss = vi.fn(() => Promise.resolve());
      const operation = leaveUnsavedMediaEditor(
        emitter as unknown as Page,
        () => {
          emitter.emit('dialog', {
            type: () => 'confirm',
            message: () =>
              expected
                ? '尚有未儲存變更，離開會捨棄這些變更。確定繼續嗎？'
                : 'SYNTHETIC_SECRET',
            accept,
            dismiss,
          });
          return Promise.resolve();
        },
      );
      if (expected) await expect(operation).resolves.toBeUndefined();
      else
        await expect(operation).rejects.toThrow('FUNCTIONAL_OPERATION_FAILED');
      expect(accept).toHaveBeenCalledTimes(expected ? 1 : 0);
      expect(dismiss).toHaveBeenCalledTimes(expected ? 0 : 1);
      expect(emitter.listenerCount('dialog')).toBe(0);
    },
  );
});
describe('root media READ ONLY oracle is mandatory and exact', () => {
  const input: MediaReadbackInput = {
    scopeRunId: 'synthetic',
    actorId: 'synthetic',
    runs: [],
    draftIds: [],
    expected: {
      verifiedRuns: 3,
      abortedRuns: 1,
      assets: 3,
      variants: 6,
      masterObjects: 3,
      variantObjects: 6,
      quarantineObjects: 0,
    },
  };
  const output = {
    ...input.expected,
    hashesMatch: true,
    canonicalUnchanged: true,
  };
  it('accepts only the approved journey counts and physical hashes', () => {
    expect(assertMediaReadback(input, output)).toEqual(output);
  });
  it.each([
    { ...output, assets: 2 },
    { ...output, hashesMatch: false },
    { ...output, quarantineObjects: 1 },
    { ...output, rawPath: 'SYNTHETIC_SECRET' },
    undefined,
  ])(
    'does not infer missing/incorrect storage evidence as success %#',
    (value) => {
      expect(() => assertMediaReadback(input, value)).toThrow(
        'FUNCTIONAL_OPERATION_FAILED',
      );
    },
  );
});
