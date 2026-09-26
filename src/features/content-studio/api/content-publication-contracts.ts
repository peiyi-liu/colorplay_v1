import { z } from 'zod';

import { contentEntityTypeSchema, type ContentEntityType } from './contracts';

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
const timestampSchema = z.iso.datetime({ offset: true });

export const publicationImpactSchema = z.enum([
  'compatible',
  'requires_recompletion',
  'requires_requalification',
]);

export const publicationEventTypeSchema = z.enum([
  'publish',
  'archive',
  'rollback',
]);

export const publicationSuccessWireSchema = z.strictObject({
  changed_fields: z.array(z.string().min(1).max(100)),
  entity_id: uuidSchema,
  entity_type: contentEntityTypeSchema,
  event_id: uuidSchema,
  impact: publicationImpactSchema,
  outcome: z.literal('ok'),
  replayed: z.boolean(),
  request_id: uuidSchema,
  version: z.number().int().positive(),
});

export const publicationHistoryWireSchema = z.strictObject({
  entries: z.array(
    z.strictObject({
      changed_fields: z.array(z.string().min(1).max(100)),
      created_at: timestampSchema,
      event_id: uuidSchema,
      event_type: publicationEventTypeSchema,
      impact: publicationImpactSchema,
      reason: z.string().min(1).max(500),
      version: z.number().int().positive(),
      version_id: uuidSchema.nullable(),
    }),
  ),
  entity_id: uuidSchema,
  entity_type: contentEntityTypeSchema,
  outcome: z.literal('ok'),
  request_id: uuidSchema,
});

export const publicationDeniedWireSchema = z.strictObject({
  code: z.enum([
    'CONTENT_DRAFT_CONFLICT',
    'CONTENT_PUBLICATION_CONFLICT',
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

export type PublicationImpact = z.infer<typeof publicationImpactSchema>;
export type PublicationEventType = z.infer<typeof publicationEventTypeSchema>;

export type PublicationSuccess = Readonly<{
  changedFields: readonly string[];
  entityId: string;
  entityType: ContentEntityType;
  eventId: string;
  impact: PublicationImpact;
  outcome: 'ok';
  replayed: boolean;
  requestId: string;
  version: number;
}>;

export type PublicationHistory = Readonly<{
  entries: readonly Readonly<{
    changedFields: readonly string[];
    createdAt: string;
    eventId: string;
    eventType: PublicationEventType;
    impact: PublicationImpact;
    reason: string;
    version: number;
    versionId: string | null;
  }>[];
  entityId: string;
  entityType: ContentEntityType;
  outcome: 'ok';
  requestId: string;
}>;

export type PublicationDenied = Readonly<{
  code: z.infer<typeof publicationDeniedWireSchema>['code'];
  message: string;
  outcome: 'denied';
  requestId: string;
  retryable: boolean;
}>;

export type PublicationOutcome<T> = T | PublicationDenied;
