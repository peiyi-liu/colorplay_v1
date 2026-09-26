import { z } from 'zod';

export const contentEntityTypeSchema = z.enum([
  'course',
  'chapter',
  'section',
  'subtopic',
  'review_card',
  'assessment_bank',
  'question',
]);

export const contentDraftSourceSchema = z.enum(['manual', 'import']);

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const payloadSchema = z.record(z.string(), z.unknown());

export const contentDraftWireSchema = z.strictObject({
  base_version: z.number().int().positive().nullable(),
  draft_id: uuidSchema,
  entity_id: uuidSchema.nullable(),
  entity_type: contentEntityTypeSchema,
  payload: payloadSchema,
  revision: z.number().int().positive(),
  source: contentDraftSourceSchema,
  stable_code: z.string().trim().min(1).max(200),
  updated_at: timestampSchema,
});

export const saveContentDraftSuccessWireSchema = z.strictObject({
  draft: contentDraftWireSchema,
  outcome: z.literal('ok'),
  replayed: z.boolean(),
  request_id: uuidSchema,
});

export const contentAuthoringDeniedWireSchema = z.strictObject({
  code: z.enum([
    'CONTENT_DRAFT_CONFLICT',
    'CONTENT_SCOPE_INVALID',
    'CONTENT_VALIDATION_FAILED',
    'IDEMPOTENCY_CONFLICT',
    'INSUFFICIENT_MFA',
    'STALE_PRIVILEGED_SESSION',
  ]),
  message: z.string().min(1),
  outcome: z.literal('denied'),
  request_id: uuidSchema,
  retryable: z.boolean(),
});

export type ContentEntityType = z.infer<typeof contentEntityTypeSchema>;
export type ContentDraftSource = z.infer<typeof contentDraftSourceSchema>;
export type ContentDraftWire = z.infer<typeof contentDraftWireSchema>;

export type ContentDraft = Readonly<{
  baseVersion: number | null;
  draftId: string;
  entityId: string | null;
  entityType: ContentEntityType;
  payload: Readonly<Record<string, unknown>>;
  revision: number;
  source: ContentDraftSource;
  stableCode: string;
  updatedAt: string;
}>;

export type SaveContentDraftInput = Readonly<{
  draftId: string | null;
  entityId: string | null;
  entityType: ContentEntityType;
  expectedRevision: number;
  payload: Readonly<Record<string, unknown>>;
  requestId: string;
  source: ContentDraftSource;
  stableCode: string;
}>;

export type SaveContentDraftSuccess = Readonly<{
  draft: ContentDraft;
  outcome: 'ok';
  replayed: boolean;
  requestId: string;
}>;

export type ContentAuthoringDenied = Readonly<{
  code: z.infer<typeof contentAuthoringDeniedWireSchema>['code'];
  message: string;
  outcome: 'denied';
  requestId: string;
  retryable: boolean;
}>;

export type SaveContentDraftOutcome =
  SaveContentDraftSuccess | ContentAuthoringDenied;
