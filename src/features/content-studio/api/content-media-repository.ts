import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { parsePublicEnv } from '../../../lib/config/public-env';
import {
  contentMediaAbortWireSchema,
  contentMediaBeginWireSchema,
  contentMediaDeniedWireSchema,
  contentMediaProcessWireSchema,
  type ContentMediaAsset,
  type ContentMediaSemanticRole,
} from './content-media-contracts';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const SOURCE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type BeginInput = Readonly<{
  requestId: string;
  semanticRole: ContentMediaSemanticRole;
  sourceBytes: number;
  sourceFilename: string;
  sourceMimeType: string;
}>;

type RunInput = Readonly<{ requestId: string; runId: string }>;

export interface ContentMediaTransport {
  abort(input: RunInput): Promise<unknown>;
  begin(input: BeginInput): Promise<unknown>;
  process(input: RunInput): Promise<unknown>;
  uploadSigned(
    input: Readonly<{
      bucket: 'content-media-quarantine';
      file: File;
      objectPath: string;
      token: string;
    }>,
  ): Promise<void>;
}

export interface ContentMediaRepository {
  recover: (requestId: string) => Promise<ContentMediaAsset>;
  cancel: (requestId: string) => Promise<void>;
  uploadAndProcess: (
    input: Readonly<{
      file: File;
      requestId: string;
      semanticRole: ContentMediaSemanticRole;
    }>,
  ) => Promise<ContentMediaAsset>;
}

export class ContentMediaRepositoryError extends Error {
  readonly code:
    | 'CONTENT_MEDIA_PENDING'
    | 'CONTENT_MEDIA_DENIED'
    | 'CONTENT_MEDIA_INVALID_FILE'
    | 'CONTENT_MEDIA_INVALID_RESPONSE'
    | 'CONTENT_MEDIA_UNAVAILABLE';

  constructor(code: ContentMediaRepositoryError['code']) {
    super(code);
    this.name = 'ContentMediaRepositoryError';
    this.code = code;
  }
}

const invoke = async (body: Record<string, unknown>): Promise<unknown> => {
  const client = getBrowserSupabaseClient(parsePublicEnv(import.meta.env));
  const response = await client.functions.invoke<unknown>('content-media', {
    body,
  });
  if (response.error)
    throw new ContentMediaRepositoryError('CONTENT_MEDIA_UNAVAILABLE');
  return response.data;
};

const defaultTransport: ContentMediaTransport = {
  abort: (input) => invoke({ action: 'abort', ...input }),
  begin: (input) => invoke({ action: 'begin', ...input }),
  process: (input) => invoke({ action: 'process', ...input }),
  async uploadSigned(input) {
    const client = getBrowserSupabaseClient(parsePublicEnv(import.meta.env));
    const { error } = await client.storage
      .from(input.bucket)
      .uploadToSignedUrl(input.objectPath, input.token, input.file, {
        cacheControl: '0',
        contentType: input.file.type,
      });
    if (error)
      throw new ContentMediaRepositoryError('CONTENT_MEDIA_UNAVAILABLE');
  },
};

const failOnDenied = (payload: unknown): void => {
  if (contentMediaDeniedWireSchema.safeParse(payload).success) {
    throw new ContentMediaRepositoryError('CONTENT_MEDIA_DENIED');
  }
};

export function createContentMediaRepository(
  transport: ContentMediaTransport = defaultTransport,
): ContentMediaRepository {
  type Checkpoint = RunInput &
    Readonly<{ semanticRole: ContentMediaSemanticRole }>;
  // In-memory references only: never retain the file, signed token or account.
  const checkpoints = new Map<string, Checkpoint>();
  const busy = new Set<string>();
  const pending = () =>
    new ContentMediaRepositoryError('CONTENT_MEDIA_PENDING');
  const runProcess = async (
    checkpoint: Checkpoint,
  ): Promise<ContentMediaAsset> => {
    let payload: unknown;
    try {
      payload = await transport.process({
        requestId: checkpoint.requestId,
        runId: checkpoint.runId,
      });
    } catch {
      throw pending();
    }
    const process = contentMediaProcessWireSchema.safeParse(payload);
    if (
      !process.success ||
      process.data.run_id !== checkpoint.runId ||
      process.data.request_id !== checkpoint.requestId ||
      process.data.asset.semantic_role !== checkpoint.semanticRole
    )
      throw pending();
    checkpoints.delete(checkpoint.requestId);
    return {
      assetId: process.data.asset.asset_id,
      hasAlpha: process.data.asset.has_alpha,
      height: process.data.asset.height,
      manifestSha256: process.data.asset.manifest_sha256,
      semanticRole: process.data.asset.semantic_role,
      sourceSha256: process.data.asset.source_sha256,
      variants: process.data.asset.variants.map((variant) => ({
        bytes: variant.bytes,
        height: variant.height,
        kind: variant.kind,
        mimeType: variant.mime_type,
        sha256: variant.sha256,
        width: variant.width,
      })),
      width: process.data.asset.width,
    };
  };
  const cancel = async (checkpoint: Checkpoint): Promise<void> => {
    let payload: unknown;
    try {
      payload = await transport.abort({
        requestId: checkpoint.requestId,
        runId: checkpoint.runId,
      });
    } catch {
      throw pending();
    }
    const aborted = contentMediaAbortWireSchema.safeParse(payload);
    if (
      !aborted.success ||
      aborted.data.run_id !== checkpoint.runId ||
      aborted.data.request_id !== checkpoint.requestId
    )
      throw pending();
    checkpoints.delete(checkpoint.requestId);
  };
  const withCheckpoint = async <T>(
    requestId: string,
    operation: (checkpoint: Checkpoint) => Promise<T>,
  ): Promise<T> => {
    const checkpoint = checkpoints.get(requestId);
    if (!checkpoint || busy.has(requestId)) throw pending();
    busy.add(requestId);
    try {
      return await operation(checkpoint);
    } finally {
      busy.delete(requestId);
    }
  };
  return {
    recover: (requestId) => withCheckpoint(requestId, runProcess),
    cancel: (requestId) => withCheckpoint(requestId, cancel),
    async uploadAndProcess(input) {
      if (checkpoints.has(input.requestId) || busy.has(input.requestId))
        throw pending();
      if (
        input.file.size <= 0 ||
        input.file.size > MAX_SOURCE_BYTES ||
        !SOURCE_MIME_TYPES.has(input.file.type)
      ) {
        throw new ContentMediaRepositoryError('CONTENT_MEDIA_INVALID_FILE');
      }
      busy.add(input.requestId);
      try {
        let beginPayload: unknown;
        try {
          beginPayload = await transport.begin({
            requestId: input.requestId,
            semanticRole: input.semanticRole,
            sourceBytes: input.file.size,
            sourceFilename: input.file.name,
            sourceMimeType: input.file.type,
          });
        } catch (error) {
          if (error instanceof ContentMediaRepositoryError) throw error;
          throw new ContentMediaRepositoryError('CONTENT_MEDIA_UNAVAILABLE');
        }
        failOnDenied(beginPayload);
        const begin = contentMediaBeginWireSchema.safeParse(beginPayload);
        if (!begin.success)
          throw new ContentMediaRepositoryError(
            'CONTENT_MEDIA_INVALID_RESPONSE',
          );
        const checkpoint = {
          requestId: input.requestId,
          runId: begin.data.run_id,
          semanticRole: input.semanticRole,
        };
        checkpoints.set(input.requestId, checkpoint);
        try {
          await transport.uploadSigned({
            bucket: begin.data.bucket,
            file: input.file,
            objectPath: begin.data.object_path,
            token: begin.data.token,
          });
        } catch {
          await cancel(checkpoint);
          throw new ContentMediaRepositoryError('CONTENT_MEDIA_UNAVAILABLE');
        }
        return await runProcess(checkpoint);
      } finally {
        busy.delete(input.requestId);
      }
    },
  };
}
