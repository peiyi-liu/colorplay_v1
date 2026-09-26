import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ContentPublicationRepositoryError,
  createContentPublicationRepository,
} from './content-publication-repository';

const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const ENTITY_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';
const VERSION_ID = '55555555-5555-4555-8555-555555555555';

const transport = { rpc: vi.fn() };

describe('content publication repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishes an exact draft revision without accepting a client impact override', async () => {
    transport.rpc.mockResolvedValue({
      changed_fields: ['title'],
      entity_id: ENTITY_ID,
      entity_type: 'review_card',
      event_id: EVENT_ID,
      impact: 'compatible',
      outcome: 'ok',
      replayed: false,
      request_id: REQUEST_ID,
      version: 2,
    });

    await expect(
      createContentPublicationRepository(transport).publish({
        changeClassification: 'nonsemantic',
        draftId: DRAFT_ID,
        expectedRevision: 3,
        reason: '修正標題錯字',
        requestId: REQUEST_ID,
      }),
    ).resolves.toMatchObject({
      entityId: ENTITY_ID,
      impact: 'compatible',
      version: 2,
    });
    expect(transport.rpc).toHaveBeenCalledWith('admin_publish_content_draft', {
      p_change_classification: 'nonsemantic',
      p_draft_id: DRAFT_ID,
      p_expected_revision: 3,
      p_reason: '修正標題錯字',
      p_request_id: REQUEST_ID,
    });
  });

  it('previews changed fields and progress impact on the server before confirmation', async () => {
    transport.rpc.mockResolvedValue({
      change_classification: 'semantic',
      changed_fields: ['content'],
      current_version: 2,
      draft_id: DRAFT_ID,
      entity_type: 'review_card',
      impact: 'requires_recompletion',
      next_version: 3,
      outcome: 'ok',
      request_id: REQUEST_ID,
      stable_code: 'RC3101',
    });

    await expect(
      createContentPublicationRepository(transport).previewPublish({
        changeClassification: 'semantic',
        draftId: DRAFT_ID,
        expectedRevision: 4,
      }),
    ).resolves.toMatchObject({
      changedFields: ['content'],
      impact: 'requires_recompletion',
      nextVersion: 3,
    });
    expect(transport.rpc).toHaveBeenCalledWith(
      'admin_preview_content_publication',
      {
        p_change_classification: 'semantic',
        p_draft_id: DRAFT_ID,
        p_expected_revision: 4,
      },
    );
  });

  it('archives and rolls back through distinct idempotent commands', async () => {
    transport.rpc
      .mockResolvedValueOnce({
        changed_fields: ['status'],
        entity_id: ENTITY_ID,
        entity_type: 'question',
        event_id: EVENT_ID,
        impact: 'requires_requalification',
        outcome: 'ok',
        replayed: false,
        request_id: REQUEST_ID,
        version: 4,
      })
      .mockResolvedValueOnce({
        changed_fields: ['prompt'],
        entity_id: ENTITY_ID,
        entity_type: 'question',
        event_id: EVENT_ID,
        impact: 'requires_requalification',
        outcome: 'ok',
        replayed: false,
        request_id: REQUEST_ID,
        version: 5,
      });

    const repository = createContentPublicationRepository(transport);
    await repository.archive({
      entityId: ENTITY_ID,
      entityType: 'question',
      expectedVersion: 3,
      reason: '題目停用',
      requestId: REQUEST_ID,
    });
    await repository.rollback({
      entityId: ENTITY_ID,
      entityType: 'question',
      expectedVersion: 4,
      reason: '恢復前一版題目',
      requestId: REQUEST_ID,
      targetVersion: 2,
    });

    expect(transport.rpc).toHaveBeenNthCalledWith(1, 'admin_archive_content', {
      p_entity_id: ENTITY_ID,
      p_entity_type: 'question',
      p_expected_version: 3,
      p_reason: '題目停用',
      p_request_id: REQUEST_ID,
    });
    expect(transport.rpc).toHaveBeenNthCalledWith(2, 'admin_rollback_content', {
      p_entity_id: ENTITY_ID,
      p_entity_type: 'question',
      p_expected_version: 4,
      p_reason: '恢復前一版題目',
      p_request_id: REQUEST_ID,
      p_target_version: 2,
    });
  });

  it('previews archive scope and impact on the server', async () => {
    transport.rpc.mockResolvedValue({
      changed_fields: ['status'],
      current_version: 3,
      entity_id: ENTITY_ID,
      entity_type: 'question',
      impact: 'requires_requalification',
      next_version: 4,
      outcome: 'ok',
      request_id: REQUEST_ID,
      stable_code: 'Q3101',
    });

    await expect(
      createContentPublicationRepository(transport).previewArchive({
        entityId: ENTITY_ID,
        entityType: 'question',
        expectedVersion: 3,
      }),
    ).resolves.toMatchObject({
      entityId: ENTITY_ID,
      impact: 'requires_requalification',
      nextVersion: 4,
    });
    expect(transport.rpc).toHaveBeenCalledWith(
      'admin_preview_content_archive',
      {
        p_entity_id: ENTITY_ID,
        p_entity_type: 'question',
        p_expected_version: 3,
      },
    );
  });

  it('lists safe immutable history metadata without returning frozen answer payloads', async () => {
    transport.rpc.mockResolvedValue({
      entries: [
        {
          actor_id: 'aa000000-0000-0000-0000-000000000001',
          changed_fields: ['prompt'],
          created_at: '2026-09-26T08:30:00+00:00',
          event_id: EVENT_ID,
          event_type: 'publish',
          impact: 'requires_requalification',
          reason: '更新題意',
          version: 3,
          version_id: VERSION_ID,
        },
      ],
      entity_id: ENTITY_ID,
      entity_type: 'question',
      outcome: 'ok',
      request_id: REQUEST_ID,
    });

    await expect(
      createContentPublicationRepository(transport).listHistory({
        entityId: ENTITY_ID,
        entityType: 'question',
      }),
    ).resolves.toMatchObject({
      entries: [{ eventType: 'publish', version: 3 }],
      entityId: ENTITY_ID,
      entityType: 'question',
    });

    transport.rpc.mockResolvedValueOnce({
      entries: [],
      entity_id: ENTITY_ID,
      entity_type: 'question',
      frozen_payload: { correct_answer: 'A' },
      outcome: 'ok',
      request_id: REQUEST_ID,
    });
    await expect(
      createContentPublicationRepository(transport).listHistory({
        entityId: ENTITY_ID,
        entityType: 'question',
      }),
    ).rejects.toBeInstanceOf(ContentPublicationRepositoryError);
  });

  it('returns typed denials without retrying a stale or conflicting command', async () => {
    transport.rpc.mockResolvedValue({
      code: 'CONTENT_PUBLICATION_CONFLICT',
      message: '內容版本已更新，請重新載入。',
      outcome: 'denied',
      request_id: REQUEST_ID,
      retryable: false,
    });

    await expect(
      createContentPublicationRepository(transport).publish({
        changeClassification: 'semantic',
        draftId: DRAFT_ID,
        expectedRevision: 2,
        reason: '更新內容',
        requestId: REQUEST_ID,
      }),
    ).resolves.toMatchObject({
      code: 'CONTENT_PUBLICATION_CONFLICT',
      outcome: 'denied',
    });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
  });
});
