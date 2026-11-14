import { createContentMediaHandler } from '../../supabase/functions/content-media/handler';
export const runId = '81000000-0000-4000-8000-000000000002';
export const requestId = '81000000-0000-4000-8000-000000000001';
const actor = 'synthetic-actor';
const session = 'synthetic-session';
export const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
export interface Scenario {
  completeReplyLost?: boolean;
  cleanupThrows?: boolean;
  failReply?: 'error' | 'lost' | 'denied' | 'wrong_run' | 'malformed' | 'ok';
  uploadFails?: boolean;
  processorGate?: ReturnType<typeof deferred>;
  completeGate?: ReturnType<typeof deferred>;
  abortReply?: 'lost' | 'wrong_run';
  reconcileReply?:
    'error' | 'lost' | 'wrong_run' | 'wrong_request' | 'malformed';
  completeReplyError?: boolean;
  initialStatus?: 'processing' | 'verified';
}
export function setupMediaHandler(scenario: Scenario = {}) {
  const events: string[] = [];
  const objects = new Set<string>();
  let status: string = scenario.initialStatus ?? 'awaiting_upload';
  let claims = 0;
  let processorCalls = 0;
  const receipt = {
    asset_id: '81000000-0000-4000-8000-000000000003',
    source_sha256: 'a'.repeat(64),
    manifest_sha256: 'b'.repeat(64),
    has_alpha: false,
    semantic_role: 'standard',
    variants: ['thumbnail', 'reading'].map((kind) => ({
      kind,
      mime_type: 'image/webp',
      sha256: 'c'.repeat(64),
      bytes: 1,
      width: 1,
      height: 1,
    })),
    width: 1,
    height: 1,
  };
  const claim = () => {
    if (status === 'failed' || status === 'aborted')
      return { outcome: 'denied' };
    if (status === 'verified')
      return {
        action: 'verified',
        receipt,
        outcome: 'ok',
        run_id: runId,
        request_id: requestId,
      };
    const replayed = status === 'processing';
    status = 'processing';
    return {
      run_id: runId,
      request_id: requestId,
      action: 'claim',
      outcome: 'ok',
      replayed,
      actor_user_id: actor,
      auth_session_id: session,
      object_path: 'synthetic-source',
      asset_id: '81000000-0000-4000-8000-000000000003',
      source_mime_type: 'image/png',
      source_bytes: 1,
      semantic_role: 'standard',
    };
  };
  const user = {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: actor } }, error: null }),
    },
    rpc: async (name: string) => {
      await Promise.resolve();
      if (name === 'admin_abort_content_media_upload') {
        events.push('abort');
        if (status === 'verified')
          return { data: { outcome: 'denied' }, error: null };
        status = 'aborted';
        if (scenario.abortReply === 'lost')
          throw new Error('SYNTHETIC_ABORT_REPLY_LOST');
        return {
          data: {
            outcome: 'ok',
            run_id:
              scenario.abortReply === 'wrong_run' ? 'different-run' : runId,
            object_path: 'synthetic-source',
          },
          error: null,
        };
      }
      claims += 1;
      if (claims > 1 && scenario.reconcileReply === 'lost')
        throw new Error('SYNTHETIC_RAW_MARKER');
      if (claims > 1 && scenario.reconcileReply === 'error')
        return { data: null, error: {} };
      const result = claim();
      if (claims > 1 && scenario.reconcileReply === 'wrong_run')
        return { data: { ...result, run_id: 'wrong-run' }, error: null };
      if (claims > 1 && scenario.reconcileReply === 'wrong_request')
        return {
          data: { ...result, request_id: 'wrong-request' },
          error: null,
        };
      if (claims > 1 && scenario.reconcileReply === 'malformed')
        return { data: { ...result, receipt: {} }, error: null };
      return { data: result, error: null };
    },
  };
  const service = {
    rpc: async (name: string) => {
      if (name === 'svc_complete_content_media_upload') {
        events.push('complete');
        await scenario.completeGate?.promise;
        if (status !== 'processing')
          return { data: { outcome: 'denied' }, error: null };
        status = 'verified';
        if (scenario.completeReplyError) return { data: null, error: {} };
        if (scenario.completeReplyLost) throw new Error('SYNTHETIC_REPLY_LOST');
        return {
          data: {
            outcome: 'ok',
            run_id: runId,
            request_id: requestId,
            receipt,
          },
          error: null,
        };
      }
      events.push('fail');
      if (scenario.failReply === 'lost')
        throw new Error('SYNTHETIC_FAIL_REPLY_LOST');
      if (scenario.failReply === 'error') return { data: null, error: {} };
      if (status === 'verified' || scenario.failReply === 'denied')
        return { data: { outcome: 'denied' }, error: null };
      if (scenario.failReply === 'wrong_run')
        return {
          data: { outcome: 'ok', run_id: 'different-run' },
          error: null,
        };
      if (scenario.failReply === 'malformed') return { data: {}, error: null };
      status = 'failed';
      return { data: { outcome: 'ok', run_id: runId }, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: () =>
          Promise.resolve({
            data: { token: 'synthetic' },
            error: null,
          }),
        createSignedUrls: () => Promise.resolve({ data: [], error: null }),
        download: () => {
          events.push('download');
          return Promise.resolve({
            data: new Blob([new Uint8Array([1])]),
            error: null,
          });
        },
        upload: async (path: string) => {
          await Promise.resolve();
          events.push('upload');
          if (scenario.uploadFails && objects.size > 0) return { error: {} };
          objects.add(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          await Promise.resolve();
          events.push(
            bucket === 'content-media' ? 'remove_final' : 'remove_source',
          );
          if (bucket !== 'content-media' && scenario.cleanupThrows)
            throw new Error('SYNTHETIC_CLEANUP');
          paths.forEach((path) => objects.delete(path));
          return { error: null };
        },
      }),
    },
  };
  const handler = createContentMediaHandler({
    clients: () => ({ user, service }),
    processorFailure: () => null,
    process: async () => {
      processorCalls += 1;
      await scenario.processorGate?.promise;
      return {
        sourceSha256: 'a'.repeat(64),
        manifestSha256: 'b'.repeat(64),
        pixelSemanticSha256: 'd'.repeat(64),
        processorVersion: 'synthetic-processor',
        variants: [
          {
            kind: 'thumbnail',
            sha256: 'c'.repeat(64),
            bytes: new Uint8Array([2]),
            width: 1,
            height: 1,
            mimeType: 'image/webp',
            qualityMode: 'lossy',
            structuralSimilarityDistortion: null,
          },
        ],
        width: 1,
        height: 1,
        hasAlpha: false,
      };
    },
  });
  const invoke = (action = 'process') =>
    handler(
      new Request('http://127.0.0.1/content-media', {
        method: 'POST',
        headers: {
          Authorization: `Bearer x.${btoa(JSON.stringify({ session_id: session }))}.x`,
        },
        body: JSON.stringify({ action, runId, requestId }),
      }),
    );
  return {
    invoke,
    events,
    objects,
    status: () => status,
    processorCalls: () => processorCalls,
  };
}
