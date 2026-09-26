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

// Historical curriculum rows use deterministic UUID-shaped identifiers whose
// version nibble is 0. PostgreSQL accepts them as uuid; the browser contract
// therefore validates the canonical 8-4-4-4-12 shape without inventing a v4
// requirement that the database does not have.
const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
const timestampSchema = z.iso.datetime({ offset: true });
const payloadSchema = z.record(z.string(), z.unknown());
const contentStatusSchema = z.enum(['draft', 'published', 'archived']);

export const contentBankSummaryWireSchema = z.strictObject({
  id: uuidSchema,
  kind: z.enum(['QB', 'CR', 'LT']),
  question_count: z.number().int().nonnegative(),
  questions: z.array(
    z.strictObject({
      id: uuidSchema,
      sort_order: z.number().int().nonnegative(),
      stable_code: z.string().trim().min(1).max(200),
      status: contentStatusSchema,
      title: z.string().min(1).max(1000),
      version: z.number().int().positive(),
    }),
  ),
  sort_order: z.number().int().nonnegative(),
  stable_code: z.string().trim().min(1).max(200),
  status: contentStatusSchema,
  title: z.string().min(1).max(100),
});

export const contentScopeWireSchema = z.strictObject({
  chapter: z.strictObject({
    id: uuidSchema,
    sort_order: z.number().int().nonnegative(),
    stable_code: z.string().trim().min(1).max(200),
    status: contentStatusSchema,
    title: z.string().min(1).max(100),
  }),
  chapter_banks: z.array(contentBankSummaryWireSchema),
  drafts: z.array(
    z.strictObject({
      draft_id: uuidSchema,
      entity_id: uuidSchema.nullable(),
      entity_type: contentEntityTypeSchema,
      revision: z.number().int().positive(),
      stable_code: z.string().trim().min(1).max(200),
      updated_at: timestampSchema,
    }),
  ),
  outcome: z.literal('ok'),
  request_id: uuidSchema,
  sections: z.array(
    z.strictObject({
      banks: z.array(contentBankSummaryWireSchema),
      id: uuidSchema,
      sort_order: z.number().int().nonnegative(),
      stable_code: z.string().trim().min(1).max(200),
      status: contentStatusSchema,
      subtopics: z.array(
        z.strictObject({
          id: uuidSchema,
          review_cards: z.array(
            z.strictObject({
              id: uuidSchema,
              sort_order: z.number().int().nonnegative(),
              stable_code: z.string().trim().min(1).max(200),
              status: contentStatusSchema,
              title: z.string().min(1).max(80),
              version: z.number().int().positive(),
            }),
          ),
          review_card_count: z.number().int().nonnegative(),
          sort_order: z.number().int().nonnegative(),
          stable_code: z.string().trim().min(1).max(200),
          status: contentStatusSchema,
          title: z.string().min(1).max(100),
        }),
      ),
      title: z.string().min(1).max(100),
    }),
  ),
});

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

export const contentEditorStateWireSchema = z.strictObject({
  current: z
    .strictObject({
      entity_id: uuidSchema,
      entity_type: contentEntityTypeSchema,
      payload: payloadSchema,
      stable_code: z.string().trim().min(1).max(200),
      status: contentStatusSchema,
      version: z.number().int().positive().nullable(),
    })
    .nullable(),
  draft: contentDraftWireSchema.nullable(),
  outcome: z.literal('ok'),
  request_id: uuidSchema,
});

export const contentValidationWireSchema = z.strictObject({
  draft_id: uuidSchema,
  issues: z.array(
    z.strictObject({
      code: z.string().min(1).max(100),
      field: z.string().min(1).max(100),
      message: z.string().min(1).max(300),
      severity: z.enum(['error', 'warning']),
    }),
  ),
  outcome: z.literal('ok'),
  request_id: uuidSchema,
  revision: z.number().int().positive(),
  valid: z.boolean(),
});

const questionPreviewWireSchema = z.strictObject({
  duration_seconds: z.number().int().min(5).max(120),
  entity_type: z.literal('question'),
  options: z.array(
    z.strictObject({
      key: z.string().regex(/^[A-D]$/u),
      text: z.string().min(1).max(500),
    }),
  ),
  prompt: z.string().min(1).max(1000),
  question_type: z.literal('single_choice'),
  stable_code: z.string().trim().min(1).max(200),
});

const reviewCardPreviewWireSchema = z.strictObject({
  content: z.string().min(1).max(5000),
  entity_type: z.literal('review_card'),
  group_label: z.string().max(120),
  media: z
    .array(
      z.strictObject({
        alt_text: z.string().min(1).max(200),
        sort_order: z.number().int().nonnegative(),
      }),
    )
    .max(3),
  stable_code: z.string().trim().min(1).max(200),
  title: z.string().min(1).max(80),
});

export const contentPreviewWireSchema = z.strictObject({
  draft_id: uuidSchema,
  outcome: z.literal('ok'),
  projection: z.discriminatedUnion('entity_type', [
    questionPreviewWireSchema,
    reviewCardPreviewWireSchema,
  ]),
  request_id: uuidSchema,
  revision: z.number().int().positive(),
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
export type ContentScopeWire = z.infer<typeof contentScopeWireSchema>;

export type ContentEditorState = Readonly<{
  current: Readonly<{
    entityId: string;
    entityType: ContentEntityType;
    payload: Readonly<Record<string, unknown>>;
    stableCode: string;
    status: 'draft' | 'published' | 'archived';
    version: number | null;
  }> | null;
  draft: ContentDraft | null;
  outcome: 'ok';
  requestId: string;
}>;

export type ContentValidationResult = Readonly<{
  draftId: string;
  issues: readonly Readonly<{
    code: string;
    field: string;
    message: string;
    severity: 'error' | 'warning';
  }>[];
  outcome: 'ok';
  requestId: string;
  revision: number;
  valid: boolean;
}>;

export type ContentPreview = Readonly<{
  draftId: string;
  outcome: 'ok';
  projection:
    | Readonly<{
        durationSeconds: number;
        entityType: 'question';
        options: readonly Readonly<{ key: string; text: string }>[];
        prompt: string;
        questionType: 'single_choice';
        stableCode: string;
      }>
    | Readonly<{
        content: string;
        entityType: 'review_card';
        groupLabel: string;
        media: readonly Readonly<{ altText: string; sortOrder: number }>[];
        stableCode: string;
        title: string;
      }>;
  requestId: string;
  revision: number;
}>;

export type ContentBankSummary = Readonly<{
  bankId: string;
  kind: 'QB' | 'CR' | 'LT';
  questionCount: number;
  questions: readonly ContentItemSummary[];
  sortOrder: number;
  stableCode: string;
  status: 'draft' | 'published' | 'archived';
  title: string;
}>;

export type ContentItemSummary = Readonly<{
  entityId: string;
  sortOrder: number;
  stableCode: string;
  status: 'draft' | 'published' | 'archived';
  title: string;
  version: number;
}>;

export type ContentDraftSummary = Readonly<{
  draftId: string;
  entityId: string | null;
  entityType: ContentEntityType;
  revision: number;
  stableCode: string;
  updatedAt: string;
}>;

export type ContentScope = Readonly<{
  chapter: Readonly<{
    chapterId: string;
    sortOrder: number;
    stableCode: string;
    status: 'draft' | 'published' | 'archived';
    title: string;
  }>;
  chapterBanks: readonly ContentBankSummary[];
  drafts: readonly ContentDraftSummary[];
  outcome: 'ok';
  requestId: string;
  sections: readonly Readonly<{
    banks: readonly ContentBankSummary[];
    sectionId: string;
    sortOrder: number;
    stableCode: string;
    status: 'draft' | 'published' | 'archived';
    subtopics: readonly Readonly<{
      reviewCardCount: number;
      reviewCards: readonly ContentItemSummary[];
      sortOrder: number;
      stableCode: string;
      status: 'draft' | 'published' | 'archived';
      subtopicId: string;
      title: string;
    }>[];
    title: string;
  }>[];
}>;

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

export type ContentAuthoringOutcome<T> = T | ContentAuthoringDenied;

export type SaveContentDraftOutcome =
  ContentAuthoringOutcome<SaveContentDraftSuccess>;
