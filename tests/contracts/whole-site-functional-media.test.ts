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
        semanticRole: 'standard',
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
        semantic_role: 'standard' as const,
        width: 64,
        height: 64,
        has_alpha: false,
        variants: (['thumbnail', 'reading'] as const).map((kind) => ({
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
