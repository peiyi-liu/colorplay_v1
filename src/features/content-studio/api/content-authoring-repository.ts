import { adminRpc } from '../../admin/api/admin-client';
import {
  contentAuthoringDeniedWireSchema,
  contentEditorStateWireSchema,
  contentPreviewWireSchema,
  contentScopeWireSchema,
  contentValidationWireSchema,
  saveContentDraftSuccessWireSchema,
  type ContentBankSummary,
  type ContentAuthoringDenied,
  type ContentAuthoringOutcome,
  type ContentDraft,
  type ContentDraftWire,
  type ContentEditorState,
  type ContentEntityType,
  type ContentPreview,
  type ContentScope,
  type ContentValidationResult,
  type SaveContentDraftInput,
  type SaveContentDraftOutcome,
} from './contracts';

type ContentAuthoringRpc =
  | 'admin_list_content_scope'
  | 'admin_preview_content_draft'
  | 'admin_read_content_editor_state'
  | 'admin_save_content_draft'
  | 'admin_validate_content_draft';

export interface ContentAuthoringTransport {
  rpc(fn: ContentAuthoringRpc, args: Record<string, unknown>): Promise<unknown>;
}

export interface ContentAuthoringRepository {
  listScope(
    input: Readonly<{ chapterId: string }>,
  ): Promise<ContentAuthoringOutcome<ContentScope>>;
  readEditorState(
    input: Readonly<{
      draftId: string | null;
      entityId: string | null;
      entityType: ContentEntityType;
    }>,
  ): Promise<ContentAuthoringOutcome<ContentEditorState>>;
  previewDraft(
    input: Readonly<{ draftId: string; expectedRevision: number }>,
  ): Promise<ContentAuthoringOutcome<ContentPreview>>;
  saveDraft(input: SaveContentDraftInput): Promise<SaveContentDraftOutcome>;
  validateDraft(
    input: Readonly<{ draftId: string; expectedRevision: number }>,
  ): Promise<ContentAuthoringOutcome<ContentValidationResult>>;
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

const toBank = (
  value: ReturnType<
    typeof contentScopeWireSchema.parse
  >['chapter_banks'][number],
): ContentBankSummary => ({
  bankId: value.id,
  kind: value.kind,
  questionCount: value.question_count,
  questions: value.questions.map((question) => ({
    entityId: question.id,
    sortOrder: question.sort_order,
    stableCode: question.stable_code,
    status: question.status,
    title: question.title,
    version: question.version,
  })),
  sortOrder: value.sort_order,
  stableCode: value.stable_code,
  status: value.status,
  title: value.title,
});

const toDenied = (payload: unknown): ContentAuthoringDenied | null => {
  const denial = contentAuthoringDeniedWireSchema.safeParse(payload);
  if (!denial.success) return null;
  return {
    code: denial.data.code,
    message: denial.data.message,
    outcome: 'denied',
    requestId: denial.data.request_id,
    retryable: denial.data.retryable,
  };
};

export function createContentAuthoringRepository(
  transport: ContentAuthoringTransport = defaultTransport,
): ContentAuthoringRepository {
  return {
    async listScope(input) {
      const payload = await transport.rpc('admin_list_content_scope', {
        p_chapter_id: input.chapterId,
      });
      const denial = toDenied(payload);
      if (denial) return denial;
      const parsed = contentScopeWireSchema.safeParse(payload);
      if (!parsed.success) throw new ContentAuthoringRepositoryError();
      return {
        chapter: {
          chapterId: parsed.data.chapter.id,
          sortOrder: parsed.data.chapter.sort_order,
          stableCode: parsed.data.chapter.stable_code,
          status: parsed.data.chapter.status,
          title: parsed.data.chapter.title,
        },
        chapterBanks: parsed.data.chapter_banks.map(toBank),
        drafts: parsed.data.drafts.map((draft) => ({
          draftId: draft.draft_id,
          entityId: draft.entity_id,
          entityType: draft.entity_type,
          revision: draft.revision,
          stableCode: draft.stable_code,
          updatedAt: draft.updated_at,
        })),
        outcome: 'ok',
        requestId: parsed.data.request_id,
        sections: parsed.data.sections.map((section) => ({
          banks: section.banks.map(toBank),
          sectionId: section.id,
          sortOrder: section.sort_order,
          stableCode: section.stable_code,
          status: section.status,
          subtopics: section.subtopics.map((subtopic) => ({
            reviewCardCount: subtopic.review_card_count,
            reviewCards: subtopic.review_cards.map((card) => ({
              entityId: card.id,
              sortOrder: card.sort_order,
              stableCode: card.stable_code,
              status: card.status,
              title: card.title,
              version: card.version,
            })),
            sortOrder: subtopic.sort_order,
            stableCode: subtopic.stable_code,
            status: subtopic.status,
            subtopicId: subtopic.id,
            title: subtopic.title,
          })),
          title: section.title,
        })),
      };
    },
    async readEditorState(input) {
      const payload = await transport.rpc('admin_read_content_editor_state', {
        p_draft_id: input.draftId,
        p_entity_id: input.entityId,
        p_entity_type: input.entityType,
      });
      const denial = toDenied(payload);
      if (denial) return denial;
      const parsed = contentEditorStateWireSchema.safeParse(payload);
      if (!parsed.success) throw new ContentAuthoringRepositoryError();
      return {
        current:
          parsed.data.current === null
            ? null
            : {
                entityId: parsed.data.current.entity_id,
                entityType: parsed.data.current.entity_type,
                payload: parsed.data.current.payload,
                stableCode: parsed.data.current.stable_code,
                status: parsed.data.current.status,
                version: parsed.data.current.version,
              },
        draft: parsed.data.draft === null ? null : toDraft(parsed.data.draft),
        outcome: 'ok',
        requestId: parsed.data.request_id,
      };
    },
    async previewDraft(input) {
      const payload = await transport.rpc('admin_preview_content_draft', {
        p_draft_id: input.draftId,
        p_expected_revision: input.expectedRevision,
      });
      const denial = toDenied(payload);
      if (denial) return denial;
      const parsed = contentPreviewWireSchema.safeParse(payload);
      if (!parsed.success) throw new ContentAuthoringRepositoryError();
      const projection = parsed.data.projection;
      return {
        draftId: parsed.data.draft_id,
        outcome: 'ok',
        projection:
          projection.entity_type === 'question'
            ? {
                durationSeconds: projection.duration_seconds,
                entityType: 'question',
                options: projection.options,
                prompt: projection.prompt,
                questionType: projection.question_type,
                stableCode: projection.stable_code,
              }
            : {
                content: projection.content,
                entityType: 'review_card',
                groupLabel: projection.group_label,
                media: projection.media.map((entry) => ({
                  altText: entry.alt_text,
                  sortOrder: entry.sort_order,
                })),
                stableCode: projection.stable_code,
                title: projection.title,
              },
        requestId: parsed.data.request_id,
        revision: parsed.data.revision,
      };
    },
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

      const denial = toDenied(payload);
      if (denial) return denial;

      const success = saveContentDraftSuccessWireSchema.safeParse(payload);
      if (!success.success) throw new ContentAuthoringRepositoryError();
      return {
        draft: toDraft(success.data.draft),
        outcome: 'ok',
        replayed: success.data.replayed,
        requestId: success.data.request_id,
      };
    },
    async validateDraft(input) {
      const payload = await transport.rpc('admin_validate_content_draft', {
        p_draft_id: input.draftId,
        p_expected_revision: input.expectedRevision,
      });
      const denial = toDenied(payload);
      if (denial) return denial;
      const parsed = contentValidationWireSchema.safeParse(payload);
      if (!parsed.success) throw new ContentAuthoringRepositoryError();
      return {
        draftId: parsed.data.draft_id,
        issues: parsed.data.issues,
        outcome: 'ok',
        requestId: parsed.data.request_id,
        revision: parsed.data.revision,
        valid: parsed.data.valid,
      };
    },
  };
}
