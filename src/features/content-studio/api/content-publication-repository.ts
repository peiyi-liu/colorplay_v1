import { adminRpc } from '../../admin/api/admin-client';
import {
  publicationDeniedWireSchema,
  publicationHistoryWireSchema,
  publicationSuccessWireSchema,
  type PublicationDenied,
  type PublicationHistory,
  type PublicationOutcome,
  type PublicationSuccess,
} from './content-publication-contracts';
import type { ContentEntityType } from './contracts';

type ContentPublicationRpc =
  | 'admin_archive_content'
  | 'admin_list_content_history'
  | 'admin_publish_content_draft'
  | 'admin_rollback_content';

export interface ContentPublicationTransport {
  rpc(
    fn: ContentPublicationRpc,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}

type ContentVersionCommand = Readonly<{
  entityId: string;
  entityType: ContentEntityType;
  expectedVersion: number;
  reason: string;
  requestId: string;
}>;

export interface ContentPublicationRepository {
  publish(
    input: Readonly<{
      draftId: string;
      expectedRevision: number;
      reason: string;
      requestId: string;
    }>,
  ): Promise<PublicationOutcome<PublicationSuccess>>;
  archive(
    input: ContentVersionCommand,
  ): Promise<PublicationOutcome<PublicationSuccess>>;
  rollback(
    input: ContentVersionCommand & Readonly<{ targetVersion: number }>,
  ): Promise<PublicationOutcome<PublicationSuccess>>;
  listHistory(
    input: Readonly<{ entityId: string; entityType: ContentEntityType }>,
  ): Promise<PublicationOutcome<PublicationHistory>>;
}

export class ContentPublicationRepositoryError extends Error {
  readonly code = 'CONTENT_PUBLICATION_INVALID_RESPONSE' as const;

  constructor() {
    super('CONTENT_PUBLICATION_INVALID_RESPONSE');
    this.name = 'ContentPublicationRepositoryError';
  }
}

const defaultTransport: ContentPublicationTransport = {
  rpc: (fn, args) => adminRpc<unknown>(fn, args),
};

const toDenied = (payload: unknown): PublicationDenied | null => {
  const denied = publicationDeniedWireSchema.safeParse(payload);
  if (!denied.success) return null;
  return {
    code: denied.data.code,
    message: denied.data.message,
    outcome: 'denied',
    requestId: denied.data.request_id,
    retryable: denied.data.retryable,
  };
};

const toSuccess = (payload: unknown): PublicationSuccess => {
  const parsed = publicationSuccessWireSchema.safeParse(payload);
  if (!parsed.success) throw new ContentPublicationRepositoryError();
  return {
    changedFields: parsed.data.changed_fields,
    entityId: parsed.data.entity_id,
    entityType: parsed.data.entity_type,
    eventId: parsed.data.event_id,
    impact: parsed.data.impact,
    outcome: 'ok',
    replayed: parsed.data.replayed,
    requestId: parsed.data.request_id,
    version: parsed.data.version,
  };
};

export function createContentPublicationRepository(
  transport: ContentPublicationTransport = defaultTransport,
): ContentPublicationRepository {
  const runCommand = async (
    fn: Exclude<ContentPublicationRpc, 'admin_list_content_history'>,
    args: Record<string, unknown>,
  ): Promise<PublicationOutcome<PublicationSuccess>> => {
    const payload = await transport.rpc(fn, args);
    const denied = toDenied(payload);
    return denied ?? toSuccess(payload);
  };

  return {
    publish: (input) =>
      runCommand('admin_publish_content_draft', {
        p_draft_id: input.draftId,
        p_expected_revision: input.expectedRevision,
        p_reason: input.reason,
        p_request_id: input.requestId,
      }),
    archive: (input) =>
      runCommand('admin_archive_content', {
        p_entity_id: input.entityId,
        p_entity_type: input.entityType,
        p_expected_version: input.expectedVersion,
        p_reason: input.reason,
        p_request_id: input.requestId,
      }),
    rollback: (input) =>
      runCommand('admin_rollback_content', {
        p_entity_id: input.entityId,
        p_entity_type: input.entityType,
        p_expected_version: input.expectedVersion,
        p_reason: input.reason,
        p_request_id: input.requestId,
        p_target_version: input.targetVersion,
      }),
    async listHistory(input) {
      const payload = await transport.rpc('admin_list_content_history', {
        p_entity_id: input.entityId,
        p_entity_type: input.entityType,
      });
      const denied = toDenied(payload);
      if (denied) return denied;
      const parsed = publicationHistoryWireSchema.safeParse(payload);
      if (!parsed.success) throw new ContentPublicationRepositoryError();
      return {
        entries: parsed.data.entries.map((entry) => ({
          changedFields: entry.changed_fields,
          createdAt: entry.created_at,
          eventId: entry.event_id,
          eventType: entry.event_type,
          impact: entry.impact,
          reason: entry.reason,
          version: entry.version,
          versionId: entry.version_id,
        })),
        entityId: parsed.data.entity_id,
        entityType: parsed.data.entity_type,
        outcome: 'ok',
        requestId: parsed.data.request_id,
      };
    },
  };
}
