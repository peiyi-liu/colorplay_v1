import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { parsePublicEnv } from '../../../lib/config/public-env';
import {
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
  uploadAndProcess(
    input: Readonly<{
      file: File;
      requestId: string;
      semanticRole: ContentMediaSemanticRole;
    }>,
  ): Promise<ContentMediaAsset>;
}

export class ContentMediaRepositoryError extends Error {
  readonly code:
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
  return {
    async uploadAndProcess(input) {
      if (
        input.file.size <= 0 ||
        input.file.size > MAX_SOURCE_BYTES ||
        !SOURCE_MIME_TYPES.has(input.file.type)
      ) {
        throw new ContentMediaRepositoryError('CONTENT_MEDIA_INVALID_FILE');
      }

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
      if (!begin.success) {
        throw new ContentMediaRepositoryError('CONTENT_MEDIA_INVALID_RESPONSE');
      }

      const runInput = { requestId: input.requestId, runId: begin.data.run_id };
      try {
        await transport.uploadSigned({
          bucket: begin.data.bucket,
          file: input.file,
          objectPath: begin.data.object_path,
          token: begin.data.token,
        });
      } catch {
        await transport.abort(runInput).catch(() => undefined);
        throw new ContentMediaRepositoryError('CONTENT_MEDIA_UNAVAILABLE');
      }

      let processPayload: unknown;
      try {
        processPayload = await transport.process(runInput);
      } catch (error) {
        if (error instanceof ContentMediaRepositoryError) throw error;
        throw new ContentMediaRepositoryError('CONTENT_MEDIA_UNAVAILABLE');
      }
      failOnDenied(processPayload);
      const process = contentMediaProcessWireSchema.safeParse(processPayload);
      if (
        !process.success ||
        process.data.run_id !== begin.data.run_id ||
        process.data.request_id !== input.requestId ||
        process.data.asset.semantic_role !== input.semanticRole
      ) {
        throw new ContentMediaRepositoryError('CONTENT_MEDIA_INVALID_RESPONSE');
      }

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
    },
  };
}
