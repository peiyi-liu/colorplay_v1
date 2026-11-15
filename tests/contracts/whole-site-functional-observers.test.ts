import { EventEmitter } from 'node:events';
import type { Page, Response } from '@playwright/test';
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
) =>
  ({
    url: () => 'http://127.0.0.1:58321/rest/v1/rpc/admin_health_summary',
    request: () => ({ method: () => 'POST' }),
    status: () => status,
    finished: () => Promise.resolve(null),
    body: () => Promise.resolve(Buffer.from(JSON.stringify(body))),
  }) as unknown as Response;
afterEach(() => vi.useRealTimers());
describe('functional Admin observers release listeners and safe outputs', () => {
  it('requires the actual successful privileged response, not just navigation', async () => {
    const emitter = new EventEmitter();
    const result = await visitAdminRead(
      emitter as unknown as Page,
      syntheticScope(),
      new AbortController().signal,
      '/admin',
      'admin_health_summary',
      () => {
        emitter.emit('response', response());
        return Promise.resolve();
      },
    );
    expect(result).toEqual({ status: 200, rowCount: 1 });
    expect(emitter.eventNames()).toHaveLength(0);
  });
  it('cannot treat an unavailable read as successful Admin navigation', async () => {
    const emitter = new EventEmitter();
    await expect(
      visitAdminRead(
        emitter as unknown as Page,
        syntheticScope(),
        new AbortController().signal,
        '/admin',
        'admin_health_summary',
        () => {
          emitter.emit(
            'response',
            response(503, { message: 'SYNTHETIC_SECRET' }),
          );
          return Promise.resolve();
        },
      ),
    ).rejects.toThrow('FUNCTIONAL_OPERATION_FAILED');
    expect(emitter.eventNames()).toHaveLength(0);
  });
  it.each(['timeout', 'abort', 'close'] as const)(
    '%s releases the read observer without unhandled rejection',
    async (mode) => {
      vi.useFakeTimers();
      const emitter = new EventEmitter();
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
