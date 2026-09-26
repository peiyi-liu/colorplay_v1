import { z } from 'zod';

import { parsePublicEnv } from '../../../lib/config/public-env';
import { getBrowserSupabaseClient } from '../../../lib/supabase/browser-client';
import { parseContentWorkbook } from './workbook-parser';

const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const xlsxMime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const allowedMimeTypes = new Set(['application/zip', xlsxMime]);

const beginSchema = z.object({
  action: z.literal('begin'),
  bucket: z.literal('content-import-quarantine'),
  expires_at: z.iso.datetime({ offset: true }),
  object_path: z.string().min(1),
  outcome: z.literal('ok'),
  run_id: z.uuid(),
  token: z.string().min(1),
});

const previewSchema = z.object({
  action: z.literal('preview'),
  create_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      disposition: z.enum(['create', 'update', 'no_op', 'error']),
      entity_type: z.string().min(1),
      issues: z.array(z.unknown()),
      row_number: z.number().int().positive(),
      sheet: z.string().min(1).max(100),
      stable_code: z.string().min(1),
      warnings: z.array(z.unknown()).optional(),
    }),
  ),
  no_op_count: z.number().int().nonnegative(),
  outcome: z.literal('ok'),
  run_id: z.uuid(),
  source_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  update_count: z.number().int().nonnegative(),
  warning_count: z.number().int().nonnegative(),
});

const commitSchema = z.object({
  action: z.literal('commit'),
  outcome: z.literal('ok'),
  replayed: z.boolean(),
  request_id: z.uuid(),
  results: z.array(z.object({ stable_code: z.string().min(1) })),
  run_id: z.uuid(),
});

export type ContentImportPreview = z.infer<typeof previewSchema>;
export type ContentImportCommit = z.infer<typeof commitSchema>;

export class ContentImportRepositoryError extends Error {
  readonly code:
    | 'CONTENT_IMPORT_INVALID_FILE'
    | 'CONTENT_IMPORT_INVALID_RESPONSE'
    | 'CONTENT_IMPORT_UNAVAILABLE';
  constructor(code: ContentImportRepositoryError['code']) {
    super(code);
    this.name = 'ContentImportRepositoryError';
    this.code = code;
  }
}

type BeginInput = Readonly<{
  requestId: string;
  sourceBytes: number;
  sourceFilename: string;
  sourceMimeType: string;
}>;

export interface ContentImportTransport {
  begin: (input: BeginInput) => Promise<unknown>;
  commit: (
    input: Readonly<{
      confirmWarnings: boolean;
      requestId: string;
      runId: string;
    }>,
  ) => Promise<unknown>;
  preview: (
    input: Readonly<{
      mediaManifestMap: Readonly<Record<string, string>>;
      requestId: string;
      runId: string;
    }>,
  ) => Promise<unknown>;
  uploadSigned: (
    input: Readonly<{
      file: File;
      objectPath: string;
      token: string;
    }>,
  ) => Promise<void>;
}

const invoke = async (body: Record<string, unknown>): Promise<unknown> => {
  const client = getBrowserSupabaseClient(parsePublicEnv(import.meta.env));
  const result = await client.functions.invoke<unknown>('content-import', {
    body,
  });
  if (result.error)
    throw new ContentImportRepositoryError('CONTENT_IMPORT_UNAVAILABLE');
  return result.data;
};

const defaultTransport: ContentImportTransport = {
  begin: (input) => invoke({ action: 'begin', ...input }),
  commit: (input) => invoke({ action: 'commit', ...input }),
  preview: (input) => invoke({ action: 'preview', ...input }),
  async uploadSigned(input) {
    const client = getBrowserSupabaseClient(parsePublicEnv(import.meta.env));
    const { error } = await client.storage
      .from('content-import-quarantine')
      .uploadToSignedUrl(input.objectPath, input.token, input.file, {
        cacheControl: '0',
        contentType: input.file.type,
      });
    if (error)
      throw new ContentImportRepositoryError('CONTENT_IMPORT_UNAVAILABLE');
  },
};

export interface ContentImportRepository {
  commitDrafts(
    input: Readonly<{
      confirmWarnings: boolean;
      requestId: string;
      runId: string;
    }>,
  ): Promise<ContentImportCommit>;
  previewPackage(
    input: Readonly<{
      file: File;
      mediaManifestMap: Readonly<Record<string, string>>;
      requestId: string;
    }>,
  ): Promise<ContentImportPreview>;
}

export function createContentImportRepository(
  transport: ContentImportTransport = defaultTransport,
): ContentImportRepository {
  return {
    async commitDrafts(input) {
      const parsed = commitSchema.safeParse(await transport.commit(input));
      if (!parsed.success || parsed.data.run_id !== input.runId)
        throw new ContentImportRepositoryError(
          'CONTENT_IMPORT_INVALID_RESPONSE',
        );
      return parsed.data;
    },
    async previewPackage(input) {
      if (
        input.file.size <= 0 ||
        input.file.size > MAX_PACKAGE_BYTES ||
        !allowedMimeTypes.has(input.file.type)
      )
        throw new ContentImportRepositoryError('CONTENT_IMPORT_INVALID_FILE');
      if (input.file.type === xlsxMime)
        parseContentWorkbook(await input.file.arrayBuffer());
      const begin = beginSchema.safeParse(
        await transport.begin({
          requestId: input.requestId,
          sourceBytes: input.file.size,
          sourceFilename: input.file.name,
          sourceMimeType: input.file.type,
        }),
      );
      if (!begin.success)
        throw new ContentImportRepositoryError(
          'CONTENT_IMPORT_INVALID_RESPONSE',
        );
      await transport.uploadSigned({
        file: input.file,
        objectPath: begin.data.object_path,
        token: begin.data.token,
      });
      const preview = previewSchema.safeParse(
        await transport.preview({
          mediaManifestMap: input.mediaManifestMap,
          requestId: input.requestId,
          runId: begin.data.run_id,
        }),
      );
      if (!preview.success)
        throw new ContentImportRepositoryError(
          'CONTENT_IMPORT_INVALID_RESPONSE',
        );
      return preview.data;
    },
  };
}
