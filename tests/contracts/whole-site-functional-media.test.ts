import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { buildMediaFixtures } from '../../scripts/concurrency/media-fixtures';
import { createMediaInterception } from '../../scripts/concurrency/media-interception';
import {
  mediaRequestSchema,
  type MediaHttpRequest,
  type MediaHttpResponse,
} from '../../scripts/concurrency/media-http-contract';
import { createContentMediaRepository } from '../../src/features/content-studio/api/content-media-repository';
import { inspectContentImportMedia } from '../../src/features/content-studio/import/package-media';
import { sha256 } from '../../scripts/concurrency/local-runtime';
import { readyScope } from './helpers/whole-site-functional';
const tokenHash = sha256('SYNTHETIC_TOKEN');
const setup = async () => {
  const scope = await readyScope();
  const fixture = buildMediaFixtures(scope, 'sheet-3-1-all');
  const writes: { name: string; value: unknown }[] = [];
  const emitter = new EventEmitter();
  const policy = createMediaInterception(
    scope,
    tokenHash,
    randomUUID(),
    fixture.sources,
    {
      directory: 'private',
      write: (name, value) => {
        writes.push({ name, value });
        return Promise.resolve();
      },
    },
    new AbortController().signal,
  );
  const untrack = policy.track(emitter as unknown as Page);
  const request = (input: unknown): MediaHttpRequest => ({
    ...mediaRequestSchema.parse(input),
    actorTokenSha256: tokenHash,
  });
  const entries = new Map<
    string,
    {
      runId: string;
      path: string;
      asset: NonNullable<MediaHttpResponse['asset']>;
    }
  >();
  let processed = 0;
  const abort = vi.fn();
  const repo = createContentMediaRepository({
    begin: async (input) => {
      const req = request({
        action: 'begin',
        ...input,
        semanticRole: input.semanticRole,
        sourceMimeType: 'image/png',
      });
      expect(await policy.hooks.beforeSend?.(req)).toBe('send');
      const source = fixture.sources.find(
        (row) => row.filename === input.sourceFilename,
      );
      if (!source) throw new Error('SYNTHETIC_MISSING');
      const runId = randomUUID();
      const path = `owned/${runId}/source.png`;
      const asset = {
        asset_id: randomUUID(),
        source_sha256: source.sha256,
        manifest_sha256: 'a'.repeat(64),
        semantic_role: input.semanticRole,
        width: 64,
        height: 64,
        has_alpha: false,
        variants: (input.semanticRole === 'color_critical'
          ? (['thumbnail', 'reading', 'color_critical'] as const)
          : (['thumbnail', 'reading'] as const)
        ).map((kind) => ({
          kind,
          width: 64,
          height: 64,
          bytes: 100,
          mime_type: 'image/webp' as const,
          sha256: sha256(kind),
        })),
      };
      entries.set(input.requestId, { runId, path, asset });
      expect(
        await policy.hooks.afterResponse?.(req, {
          status: 200,
          outcome: 'ok',
          runId,
          requestId: input.requestId,
          objectPathSha256: sha256(path),
          asset: null,
        }),
      ).toBe('deliver');
      return {
        action: 'begin',
        outcome: 'ok',
        bucket: 'content-media-quarantine',
        expires_at: '2030-01-01T00:00:00Z',
        run_id: runId,
        object_path: path,
        token: 'SYNTHETIC_SIGNED_TOKEN',
      };
    },
    uploadSigned: (input) => {
      emitter.emit('request', {
        url: () =>
          `${scope.supabaseUrl}/storage/v1/object/upload/sign/content-media-quarantine/${input.objectPath}?token=SYNTHETIC_SIGNED_TOKEN`,
        method: () => 'PUT',
      });
      return Promise.resolve();
    },
    process: async (input) => {
      const req = request({ action: 'process', ...input });
      if ((await policy.hooks.beforeSend?.(req)) === 'drop')
        throw new Error('SYNTHETIC_DROP');
      const entry = entries.get(input.requestId);
      if (!entry) throw new Error('SYNTHETIC_MISSING');
      processed++;
      const response: MediaHttpResponse = {
        status: 200,
        outcome: 'ok',
        requestId: input.requestId,
        runId: entry.runId,
        objectPathSha256: null,
        asset: entry.asset,
      };
      if ((await policy.hooks.afterResponse?.(req, response)) === 'drop')
        throw new Error('SYNTHETIC_DROP');
      return {
        action: 'process',
        outcome: 'ok',
        request_id: input.requestId,
        run_id: entry.runId,
        asset: entry.asset,
      };
    },
    abort: async (input) => {
      abort(input);
      const req = request({ action: 'abort', ...input });
      await policy.hooks.beforeSend?.(req);
      await policy.hooks.afterResponse?.(req, {
        status: 200,
        outcome: 'ok',
        requestId: input.requestId,
        runId: input.runId,
        objectPathSha256: null,
        asset: null,
      });
      return {
        action: 'abort',
        outcome: 'ok',
        request_id: input.requestId,
        run_id: input.runId,
      };
    },
  });
  return {
    scope,
    fixture,
    writes,
    policy,
    repo,
    entries,
    untrack,
    abort,
    request,
    processed: () => processed,
  };
};
const asFile = (image: { name: string; buffer: Buffer; mimeType: string }) => {
  const bytes = Uint8Array.from(image.buffer).buffer;
  const file = new File([bytes], image.name, { type: image.mimeType });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes),
  });
  return file;
};
describe('functional media uses real repository and ZIP contracts', () => {
  it('parses the actual two-PNG ZIP and recovers only its second same-key result', async () => {
    const h = await setup();
    try {
      const files = await inspectContentImportMedia(asFile(h.fixture.zip));
      expect(files).toHaveLength(2);
      const first = files[0];
      const second = files[1];
      if (!first || !second) throw new Error('SYNTHETIC_MISSING');
      const a = randomUUID();
      const b = randomUUID();
      const verified = await h.repo.uploadAndProcess({
        file: first.file,
        requestId: a,
        semanticRole: first.semanticRole,
      });
      await expect(
        h.repo.uploadAndProcess({
          file: second.file,
          requestId: b,
          semanticRole: second.semanticRole,
        }),
      ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
      expect(
        h.policy.snapshot().find((row) => row.slot === 'zip2'),
      ).toMatchObject({ verified: true, postVerifiedDrops: 1 });
      await expect(h.repo.recover(b)).resolves.toMatchObject({
        sourceSha256: h.fixture.sources.find((row) => row.slot === 'zip2')
          ?.sha256,
      });
      h.policy.assertSlot('zip1');
      h.policy.assertSlot('zip2');
      expect(h.processed()).toBe(3);
      expect(h.entries.size).toBe(2);
      expect(
        h.policy.privateEntries().find((row) => row.requestId === a)?.asset
          ?.asset_id,
      ).toBe(verified.assetId);
      expect(JSON.stringify(h.policy.snapshot())).not.toMatch(
        /SYNTHETIC_TOKEN|SIGNED_TOKEN|owned\//u,
      );
    } finally {
      h.untrack();
    }
  });
  it('pre-send loss allows only explicit same-scope confirmed abort, not process or new begin', async () => {
    const h = await setup();
    try {
      const image = h.fixture.images.find((row) => row.slot === 'cancel');
      if (!image) throw new Error('SYNTHETIC_MISSING');
      const requestId = randomUUID();
      const file = asFile(image);
      await expect(
        h.repo.uploadAndProcess({ file, requestId, semanticRole: 'standard' }),
      ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
      await expect(
        h.repo.uploadAndProcess({ file, requestId, semanticRole: 'standard' }),
      ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
      expect(h.processed()).toBe(0);
      expect(h.entries.size).toBe(1);
      await h.repo.cancel(requestId);
      h.policy.assertSlot('cancel');
      expect(h.abort).toHaveBeenCalledExactlyOnceWith({
        requestId,
        runId: h.entries.get(requestId)?.runId,
      });
    } finally {
      h.untrack();
    }
  });
  it('accounts for all seven owned sources and the actual color-critical three-variant receipt', async () => {
    const h = await setup();
    try {
      for (const slot of [
        'single',
        'single-recovery',
        'single-cancel',
        'single-duplicate',
        'zip1',
        'zip2',
        'cancel',
      ] as const) {
        const image = h.fixture.images.find((row) => row.slot === slot);
        const source = h.fixture.sources.find((row) => row.slot === slot);
        if (!image || !source) throw new Error('SYNTHETIC_MISSING');
        const requestId = randomUUID();
        const operation = h.repo.uploadAndProcess({
          file: asFile(image),
          requestId,
          semanticRole: source.semanticRole,
        });
        if (
          slot === 'single-recovery' ||
          slot === 'zip2' ||
          slot === 'single-cancel' ||
          slot === 'cancel'
        ) {
          await expect(operation).rejects.toMatchObject({
            code: 'CONTENT_MEDIA_PENDING',
          });
          if (slot === 'single-cancel' || slot === 'cancel')
            await h.repo.cancel(requestId);
          else await h.repo.recover(requestId);
        } else await operation;
        h.policy.assertSlot(slot);
      }
      const runs = h.policy.privateEntries();
      expect(runs).toHaveLength(7);
      expect(runs.filter((row) => row.asset)).toHaveLength(5);
      expect(runs.filter((row) => row.aborted)).toHaveLength(2);
      expect(
        runs.reduce(
          (count, run) => count + (run.asset?.variants.length ?? 0),
          0,
        ),
      ).toBe(11);
      expect(h.policy.assertDuplicate()).toMatchObject({
        distinctAssets: true,
        equalSourceAndManifest: true,
        originalReceiptUnchanged: true,
      });
      const critical = runs.find((row) => row.slot === 'single-recovery');
      expect(critical).toMatchObject({
        semanticRole: 'color_critical',
        asset: { semantic_role: 'color_critical' },
      });
      expect(
        critical?.asset?.variants.map((variant) => variant.kind),
      ).toContain('color_critical');
      const names = h.writes.map((row) => row.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names).toContain('media-single-cancel-confirmed');
      expect(names).toContain('media-cancel-confirmed');
    } finally {
      h.untrack();
    }
  });
  it.each(['asset-id', 'manifest', 'source', 'first-mutation'] as const)(
    'same-byte duplicate regression rejects %s corruption',
    async (mode) => {
      const h = await setup();
      try {
        for (const slot of ['single', 'single-duplicate'] as const) {
          const image = h.fixture.images.find((row) => row.slot === slot);
          if (!image) throw new Error('SYNTHETIC_MISSING');
          await h.repo.uploadAndProcess({
            file: asFile(image),
            requestId: randomUUID(),
            semanticRole: 'standard',
          });
        }
        expect(h.policy.assertDuplicate().distinctAssets).toBe(true);
        const first = h.policy
          .privateEntries()
          .find((row) => row.slot === 'single')?.asset;
        const duplicate = h.policy
          .privateEntries()
          .find((row) => row.slot === 'single-duplicate')?.asset;
        if (!first || !duplicate) throw new Error('SYNTHETIC_MISSING');
        if (mode === 'asset-id') duplicate.asset_id = first.asset_id;
        if (mode === 'manifest') duplicate.manifest_sha256 = 'f'.repeat(64);
        if (mode === 'source') duplicate.source_sha256 = 'f'.repeat(64);
        if (mode === 'first-mutation') first.width++;
        expect(() => h.policy.assertDuplicate()).toThrow(
          'FUNCTIONAL_OPERATION_FAILED',
        );
      } finally {
        h.untrack();
      }
    },
  );
  it('leaves wrong-run traffic untouched and cannot confirm an unbound receipt', async () => {
    const h = await setup();
    try {
      const image = h.fixture.images.find((row) => row.slot === 'cancel');
      if (!image) throw new Error('SYNTHETIC_MISSING');
      const requestId = randomUUID();
      await expect(
        h.repo.uploadAndProcess({
          file: asFile(image),
          requestId,
          semanticRole: 'standard',
        }),
      ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
      const wrong = h.request({
        action: 'process',
        requestId,
        runId: randomUUID(),
      });
      const before = h.policy.snapshot();
      expect(await h.policy.hooks.beforeSend?.(wrong)).toBe('send');
      expect(
        await h.policy.hooks.afterResponse?.(wrong, {
          status: 200,
          outcome: 'ok',
          requestId,
          runId: wrong.action === 'process' ? wrong.runId : null,
          objectPathSha256: null,
          asset: null,
        }),
      ).toBe('deliver');
      expect(h.policy.snapshot()).toEqual(before);
      const entry = h.entries.get(requestId);
      if (!entry) throw new Error('SYNTHETIC_MISSING');
      const owned = h.request({
        action: 'abort',
        requestId,
        runId: entry.runId,
      });
      await h.policy.hooks.beforeSend?.(owned);
      await expect(
        h.policy.hooks.afterResponse?.(owned, {
          status: 503,
          outcome: 'unknown',
          requestId: null,
          runId: null,
          objectPathSha256: null,
          asset: null,
        }),
      ).rejects.toThrow('FUNCTIONAL_OPERATION_FAILED');
      expect(() => {
        h.policy.assertSlot('cancel');
      }).toThrow('FUNCTIONAL_OPERATION_FAILED');
      expect(
        h.policy.snapshot().find((row) => row.slot === 'cancel'),
      ).toMatchObject({ aborted: false, unknown: true });
    } finally {
      h.untrack();
    }
  });
  it('cannot inject a wrong actor or unrelated request, or repeat the owned injection', async () => {
    const h = await setup();
    try {
      const req = {
        action: 'process' as const,
        runId: randomUUID(),
        requestId: randomUUID(),
        actorTokenSha256: sha256('OTHER'),
      };
      expect(await h.policy.hooks.beforeSend?.(req)).toBe('send');
      expect(h.policy.snapshot().every((row) => row.begin === null)).toBe(true);
      const image = h.fixture.images.find((row) => row.slot === 'cancel');
      if (!image) throw new Error('SYNTHETIC_MISSING');
      const requestId = randomUUID();
      await expect(
        h.repo.uploadAndProcess({
          file: asFile(image),
          requestId,
          semanticRole: 'standard',
        }),
      ).rejects.toMatchObject({ code: 'CONTENT_MEDIA_PENDING' });
      await expect(h.repo.recover(requestId)).rejects.toMatchObject({
        code: 'CONTENT_MEDIA_PENDING',
      });
      expect(() => {
        h.policy.assertSlot('cancel');
      }).toThrow('FUNCTIONAL_OPERATION_FAILED');
      expect(h.processed()).toBe(0);
    } finally {
      h.untrack();
    }
  });
});

import { createFunctionalMediaObservation } from '../../scripts/concurrency/functional-media-observation';
import {
  leaveUnsavedMediaEditor,
  runMediaJourney,
} from '../../scripts/concurrency/media-journey';
it.each(['success', 'abort', 'error'])(
  'observes the actual unsaved editor %s without changing actions',
  async (kind) => {
    const scope = await readyScope(),
      page = new EventEmitter();
    const observation = createFunctionalMediaObservation(scope, () => 'media');
    observation.register(page, () => 'A1');
    const signal = new AbortController(),
      original = new Error('SYNTHETIC_ORIGINAL');
    const action = vi.fn(() => {
      if (kind === 'error') return Promise.reject(original);
      page.emit('dialog', {
        type: () => 'confirm',
        message: () => '尚有未儲存變更，離開會捨棄這些變更。確定繼續嗎？',
        accept: () => Promise.resolve(),
      });
      if (kind === 'abort') signal.abort();
      return Promise.resolve();
    });
    const task = leaveUnsavedMediaEditor(
      page as unknown as Page,
      action,
      observation.port(page),
      signal.signal,
    );
    if (kind === 'success') await task;
    else if (kind === 'error') await expect(task).rejects.toBe(original);
    else await expect(task).rejects.toThrow();
    const record = observation.request(page, 'after', {
      request: { url: scope.supabaseUrl, method: 'GET' },
    });
    expect(record.requestIntent?.state).toBe(
      kind === 'success' ? 'COMPLETED' : 'FAILED',
    );
    expect(record.documentOrdinal).toBeNull();
    expect(action).toHaveBeenCalledTimes(1);
    expect(page.listenerCount('dialog')).toBe(0);
  },
);
it.each(['writer', 'abort', 'confirmed'])(
  'does not update a media step or perform UI/API after started journal %s failure',
  async (bad) => {
    const scope = await readyScope(),
      signal = new AbortController();
    const entered = Promise.withResolvers<undefined>(),
      pending = Promise.withResolvers<undefined>();
    const step = vi.fn(),
      getUser = vi.fn(),
      evaluate = vi.fn();
    let writes = 0;
    const journal = {
      directory: 'synthetic',
      write: () => {
        writes++;
        entered.resolve(undefined);
        return writes === 1 ? pending.promise : Promise.resolve();
      },
    };
    type Args = Parameters<typeof runMediaJourney>;
    const task = runMediaJourney(
      { evaluate } as unknown as Page,
      { auth: { getUser } } as unknown as Args[1],
      { label: 'A1', userId: randomUUID() } as Args[2],
      scope,
      {} as Args[4],
      signal.signal,
      journal,
      {} as Args[7],
      vi.fn(),
      { step, view: (action) => action() },
    );
    const rejected = expect(task).rejects.toThrow();
    await entered.promise;
    if (bad === 'writer') pending.reject(new Error('SYNTHETIC_WRITER_ERROR'));
    else {
      if (bad === 'abort') signal.abort();
      pending.resolve(undefined);
    }
    await rejected;
    expect(step).toHaveBeenCalledTimes(bad === 'confirmed' ? 1 : 0);
    if (bad === 'confirmed') expect(step).toHaveBeenCalledWith('authorization');
    expect(getUser).not.toHaveBeenCalled();
    expect(evaluate).toHaveBeenCalledTimes(bad === 'confirmed' ? 1 : 0);
  },
);
