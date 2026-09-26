import { z } from 'zod';

const uuidSchema = z.uuid();
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

export const contentMediaSemanticRoleSchema = z.enum([
  'standard',
  'color_critical',
]);

export const contentMediaBeginWireSchema = z.strictObject({
  action: z.literal('begin'),
  bucket: z.literal('content-media-quarantine'),
  expires_at: z.iso.datetime({ offset: true }),
  object_path: z.string().min(1).max(500),
  outcome: z.literal('ok'),
  run_id: uuidSchema,
  token: z.string().min(1),
});

export const contentMediaVariantWireSchema = z.strictObject({
  bytes: z.number().int().positive(),
  height: z.number().int().positive().max(4096),
  kind: z.enum(['thumbnail', 'reading', 'color_critical']),
  mime_type: z.literal('image/webp'),
  sha256: sha256Schema,
  width: z.number().int().positive().max(4096),
});

export const contentMediaProcessWireSchema = z.strictObject({
  action: z.literal('process'),
  asset: z.strictObject({
    asset_id: uuidSchema,
    has_alpha: z.boolean(),
    height: z.number().int().positive().max(4096),
    manifest_sha256: sha256Schema,
    semantic_role: contentMediaSemanticRoleSchema,
    source_sha256: sha256Schema,
    variants: z.array(contentMediaVariantWireSchema).min(2).max(3),
    width: z.number().int().positive().max(4096),
  }),
  outcome: z.literal('ok'),
  request_id: uuidSchema,
  run_id: uuidSchema,
});

export const contentMediaDeniedWireSchema = z.strictObject({
  code: z.enum([
    'CONTENT_MEDIA_FILE_INVALID',
    'CONTENT_MEDIA_INTEGRITY_FAILED',
    'CONTENT_MEDIA_NOT_FOUND',
    'CONTENT_MEDIA_PROCESSING_FAILED',
    'CONTENT_MEDIA_QUALITY_FAILED',
    'CONTENT_MEDIA_RUN_CONFLICT',
    'IDEMPOTENCY_CONFLICT',
    'INSUFFICIENT_MFA',
    'STALE_PRIVILEGED_SESSION',
  ]),
  message: z.string().min(1).max(300),
  outcome: z.literal('denied'),
  request_id: uuidSchema,
  retryable: z.boolean(),
});

export type ContentMediaSemanticRole = z.infer<
  typeof contentMediaSemanticRoleSchema
>;

export type ContentMediaAsset = Readonly<{
  assetId: string;
  hasAlpha: boolean;
  height: number;
  manifestSha256: string;
  semanticRole: ContentMediaSemanticRole;
  sourceSha256: string;
  variants: readonly Readonly<{
    bytes: number;
    height: number;
    kind: 'thumbnail' | 'reading' | 'color_critical';
    mimeType: 'image/webp';
    sha256: string;
    width: number;
  }>[];
  width: number;
}>;
