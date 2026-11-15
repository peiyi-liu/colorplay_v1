import type { Page, Request } from '@playwright/test';
import { fail, type FunctionalScope } from './config';
import { sha256, requireFunctionalReady } from './local-runtime';
import type { PrivateJournal } from './private-journal';
import type {
  FunctionalHttpHooks,
  MediaHttpRequest,
  MediaHttpResponse,
} from './media-http-contract';
export type MediaSlot = 'single' | 'zip1' | 'zip2' | 'cancel';
export interface OwnedMediaSource {
  slot: MediaSlot;
  filename: string;
  bytes: number;
  sha256: string;
}
interface Entry {
  source: OwnedMediaSource;
  requestId: string;
  runId: string | null;
  pathHash: string | null;
  begin: number;
  uploads: number;
  process: number;
  abort: number;
  preDrop: number;
  postDrop: number;
  asset: MediaHttpResponse['asset'];
  aborted: boolean;
  unknown: boolean;
}
export const createMediaInterception = (
  scope: FunctionalScope,
  actorTokenSha256: string,
  actorId: string,
  sources: readonly OwnedMediaSource[],
  journal: PrivateJournal,
  signal: AbortSignal,
) => {
  requireFunctionalReady(scope);
  if (!/^[a-f0-9]{64}$/u.test(actorTokenSha256))
    return fail('FUNCTIONAL_SCOPE_INVALID');
  const entries = new Map<MediaSlot, Entry>();
  const matches = (request: MediaHttpRequest) =>
    request.actorTokenSha256 === actorTokenSha256;
  const find = (request: MediaHttpRequest) =>
    [...entries.values()].find(
      (entry) =>
        entry.requestId === request.requestId &&
        (request.action === 'begin' || entry.runId === request.runId),
    );
  const unknown = (entry: Entry): never => {
    entry.unknown = true;
    return fail('FUNCTIONAL_OPERATION_FAILED');
  };
  const hooks: FunctionalHttpHooks = {
    signal,
    beforeSend: async (request) => {
      if (!matches(request)) return 'send';
      if (request.action === 'begin') {
        const source = sources.find(
          (item) =>
            item.filename === request.sourceFilename &&
            item.filename.startsWith(`${scope.runId}-`) &&
            item.bytes === request.sourceBytes,
        );
        if (!source) return 'send';
        if (entries.has(source.slot))
          return unknown(
            entries.get(source.slot) ?? fail('FUNCTIONAL_OPERATION_FAILED'),
          );
        await journal.write(`media-${source.slot}-intent`, {
          actorId,
          requestId: request.requestId,
          source,
          retention: 'RETAINED_NO_DELETE',
        });
        entries.set(source.slot, {
          source,
          requestId: request.requestId,
          runId: null,
          pathHash: null,
          begin: 1,
          uploads: 0,
          process: 0,
          abort: 0,
          preDrop: 0,
          postDrop: 0,
          asset: null,
          aborted: false,
          unknown: false,
        });
        return 'send';
      }
      const entry = find(request);
      if (!entry) return 'send';
      if (request.action === 'abort') {
        entry.abort++;
        return 'send';
      }
      if (entry.source.slot === 'cancel') {
        if (entry.preDrop || entry.asset) return unknown(entry);
        entry.preDrop++;
        await journal.write('media-cancel-presend-drop', {
          runId: entry.runId,
          requestId: entry.requestId,
          mode: 'OWNED_PROCESS_PRE_SEND_DROP',
        });
        return 'drop';
      }
      entry.process++;
      return 'send';
    },
    afterResponse: async (request, response) => {
      if (!matches(request)) return 'deliver';
      const entry = find(request);
      if (!entry) return 'deliver';
      if (
        response.status !== 200 ||
        response.outcome !== 'ok' ||
        response.requestId !== entry.requestId ||
        !response.runId
      )
        return unknown(entry);
      if (request.action === 'begin') {
        if (entry.runId || !response.objectPathSha256) return unknown(entry);
        entry.runId = response.runId;
        entry.pathHash = response.objectPathSha256;
        await journal.write(`media-${entry.source.slot}-begun`, {
          requestId: entry.requestId,
          runId: entry.runId,
          actorId,
        });
        return 'deliver';
      }
      if (response.runId !== entry.runId) return unknown(entry);
      if (request.action === 'abort') {
        if (entry.source.slot !== 'cancel' || entry.asset || entry.abort !== 1)
          return unknown(entry);
        entry.aborted = true;
        await journal.write('media-cancel-confirmed', {
          runId: entry.runId,
          requestId: entry.requestId,
        });
        return 'deliver';
      }
      const asset = response.asset;
      if (
        asset?.source_sha256 !== entry.source.sha256 ||
        asset.semantic_role !== 'standard' ||
        asset.width !== 64 ||
        asset.height !== 64 ||
        asset.variants.length !== 2 ||
        new Set(asset.variants.map((item) => item.kind)).size !== 2 ||
        !asset.variants.some((item) => item.kind === 'thumbnail') ||
        !asset.variants.some((item) => item.kind === 'reading')
      )
        return unknown(entry);
      if (entry.asset && JSON.stringify(entry.asset) !== JSON.stringify(asset))
        return unknown(entry);
      entry.asset = asset;
      await journal.write(
        `media-${entry.source.slot}-verified-${String(entry.process)}`,
        { actorId, runId: entry.runId, requestId: entry.requestId, asset },
      );
      if (entry.source.slot === 'zip2' && entry.process === 1) {
        if (!entries.get('zip1')?.asset || entry.postDrop)
          return unknown(entry);
        entry.postDrop++;
        return 'drop';
      }
      if (entry.source.slot === 'zip2' && entry.process !== 2)
        return unknown(entry);
      return 'deliver';
    },
  };
  const track = (page: Page) => {
    const listener = (request: Request) => {
      try {
        const url = new URL(request.url());
        const prefix =
          '/storage/v1/object/upload/sign/content-media-quarantine/';
        if (
          url.origin !== new URL(scope.supabaseUrl).origin ||
          request.method() !== 'PUT' ||
          !url.pathname.startsWith(prefix)
        )
          return;
        const hash = sha256(
          decodeURIComponent(url.pathname.slice(prefix.length)),
        );
        const entry = [...entries.values()].find(
          (value) => value.pathHash === hash,
        );
        if (entry) entry.uploads++;
      } catch {
        /* No raw URI/query/error is retained. */
      }
    };
    page.on('request', listener);
    return () => page.off('request', listener);
  };
  const snapshot = () =>
    sources.map(({ slot }) => {
      const entry = entries.get(slot);
      return {
        slot,
        begin: entry?.begin ?? null,
        uploads: entry?.uploads ?? null,
        process: entry?.process ?? null,
        abort: entry?.abort ?? null,
        verified: entry ? Boolean(entry.asset) : null,
        aborted: entry?.aborted ?? null,
        preSendDrops: entry?.preDrop ?? null,
        postVerifiedDrops: entry?.postDrop ?? null,
        unknown: entry?.unknown ?? null,
      };
    });
  const assertSlot = (slot: MediaSlot) => {
    const entry = entries.get(slot);
    if (!entry || entry.unknown || entry.begin !== 1 || entry.uploads !== 1)
      return fail('FUNCTIONAL_OPERATION_FAILED');
    if (slot === 'cancel') {
      if (
        !entry.aborted ||
        entry.asset ||
        entry.process !== 0 ||
        entry.preDrop !== 1
      )
        return fail('FUNCTIONAL_OPERATION_FAILED');
    } else if (
      !entry.asset ||
      entry.process !== (slot === 'zip2' ? 2 : 1) ||
      (slot === 'zip2' && entry.postDrop !== 1)
    )
      return fail('FUNCTIONAL_OPERATION_FAILED');
  };
  return {
    hooks,
    track,
    snapshot,
    assertSlot,
    privateEntries: () =>
      [...entries.values()].map((entry) => ({
        slot: entry.source.slot,
        runId: entry.runId,
        requestId: entry.requestId,
        asset: entry.asset,
      })),
  };
};
