import { adminRpc } from '../../admin/api/admin-client';
import {
  contentAuthoringDeniedWireSchema,
  saveContentDraftSuccessWireSchema,
  type ContentDraft,
  type ContentDraftWire,
  type SaveContentDraftInput,
  type SaveContentDraftOutcome,
} from './contracts';

type ContentAuthoringRpc = 'admin_save_content_draft';

export interface ContentAuthoringTransport {
  rpc(fn: ContentAuthoringRpc, args: Record<string, unknown>): Promise<unknown>;
}

export interface ContentAuthoringRepository {
  saveDraft(input: SaveContentDraftInput): Promise<SaveContentDraftOutcome>;
}

export class ContentAuthoringRepositoryError extends Error {
  readonly code = 'CONTENT_AUTHORING_INVALID_RESPONSE' as const;

  constructor() {
    super('CONTENT_AUTHORING_INVALID_RESPONSE');
    this.name = 'ContentAuthoringRepositoryError';
  }
}

const defaultTransport: ContentAuthoringTransport = {
  rpc: (fn, args) => adminRpc<unknown>(fn, args),
};

const toDraft = (value: ContentDraftWire): ContentDraft => ({
  baseVersion: value.base_version,
  draftId: value.draft_id,
  entityId: value.entity_id,
  entityType: value.entity_type,
  payload: value.payload,
  revision: value.revision,
  source: value.source,
  stableCode: value.stable_code,
  updatedAt: value.updated_at,
});

export function createContentAuthoringRepository(
  transport: ContentAuthoringTransport = defaultTransport,
): ContentAuthoringRepository {
  return {
    async saveDraft(input) {
      const payload = await transport.rpc('admin_save_content_draft', {
        p_draft_id: input.draftId,
        p_entity_id: input.entityId,
        p_entity_type: input.entityType,
        p_expected_revision: input.expectedRevision,
        p_payload: input.payload,
        p_request_id: input.requestId,
        p_source: input.source,
        p_stable_code: input.stableCode,
      });

      const denial = contentAuthoringDeniedWireSchema.safeParse(payload);
      if (denial.success) {
        return {
          code: denial.data.code,
          message: denial.data.message,
          outcome: 'denied',
          requestId: denial.data.request_id,
          retryable: denial.data.retryable,
        };
      }

      const success = saveContentDraftSuccessWireSchema.safeParse(payload);
      if (!success.success) throw new ContentAuthoringRepositoryError();
      return {
        draft: toDraft(success.data.draft),
        outcome: 'ok',
        replayed: success.data.replayed,
        requestId: success.data.request_id,
      };
    },
  };
}
