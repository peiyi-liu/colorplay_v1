import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ContentAuthoringRepositoryError,
  createContentAuthoringRepository,
} from './content-authoring-repository';

const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const ENTITY_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const UPDATED_AT = '2026-09-26T08:30:00+00:00';

const transport = {
  rpc: vi.fn(),
};

const saveInput = {
  draftId: DRAFT_ID,
  entityId: ENTITY_ID,
  entityType: 'assessment_bank' as const,
  expectedRevision: 2,
  payload: {
    kind: 'QB',
    section_id: '44444444-4444-4444-8444-444444444444',
    sort_order: 1,
    title: '3-1 小節題庫',
  },
  requestId: REQUEST_ID,
  source: 'manual' as const,
  stableCode: 'QB31',
};

const savedDraftWire = {
  base_version: 1,
  draft_id: DRAFT_ID,
  entity_id: ENTITY_ID,
  entity_type: 'assessment_bank',
  payload: saveInput.payload,
  revision: 3,
  source: 'manual',
  stable_code: 'QB31',
  updated_at: UPDATED_AT,
};

describe('content authoring repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a normalized draft with an expected revision and request identity', async () => {
    transport.rpc.mockResolvedValue({
      draft: savedDraftWire,
      outcome: 'ok',
      replayed: false,
      request_id: REQUEST_ID,
    });

    await expect(
      createContentAuthoringRepository(transport).saveDraft(saveInput),
    ).resolves.toEqual({
      draft: {
        baseVersion: 1,
        draftId: DRAFT_ID,
        entityId: ENTITY_ID,
        entityType: 'assessment_bank',
        payload: saveInput.payload,
        revision: 3,
        source: 'manual',
        stableCode: 'QB31',
        updatedAt: UPDATED_AT,
      },
      outcome: 'ok',
      replayed: false,
      requestId: REQUEST_ID,
    });
    expect(transport.rpc).toHaveBeenCalledWith('admin_save_content_draft', {
      p_draft_id: DRAFT_ID,
      p_entity_id: ENTITY_ID,
      p_entity_type: 'assessment_bank',
      p_expected_revision: 2,
      p_payload: saveInput.payload,
      p_request_id: REQUEST_ID,
      p_source: 'manual',
      p_stable_code: 'QB31',
    });
  });

  it('returns the original receipt when the same request is replayed', async () => {
    transport.rpc.mockResolvedValue({
      draft: savedDraftWire,
      outcome: 'ok',
      replayed: true,
      request_id: REQUEST_ID,
    });

    await expect(
      createContentAuthoringRepository(transport).saveDraft(saveInput),
    ).resolves.toMatchObject({
      draft: { draftId: DRAFT_ID, revision: 3 },
      outcome: 'ok',
      replayed: true,
      requestId: REQUEST_ID,
    });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
  });

  it('returns a typed stale-revision conflict without retrying', async () => {
    transport.rpc.mockResolvedValue({
      code: 'CONTENT_DRAFT_CONFLICT',
      message: '草稿已由其他工作階段更新，請重新載入比較。',
      outcome: 'denied',
      request_id: REQUEST_ID,
      retryable: false,
    });

    await expect(
      createContentAuthoringRepository(transport).saveDraft(saveInput),
    ).resolves.toEqual({
      code: 'CONTENT_DRAFT_CONFLICT',
      message: '草稿已由其他工作階段更新，請重新載入比較。',
      outcome: 'denied',
      requestId: REQUEST_ID,
      retryable: false,
    });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { draft: { ...savedDraftWire, actor_id: ENTITY_ID } },
    { draft: { ...savedDraftWire, entity_type: 'teacher' } },
    { draft: { ...savedDraftWire, revision: 0 } },
  ])(
    'fails closed on malformed or internal response fields %#',
    async (patch) => {
      transport.rpc.mockResolvedValue({
        draft: { ...savedDraftWire, ...patch.draft },
        outcome: 'ok',
        replayed: false,
        request_id: REQUEST_ID,
      });

      await expect(
        createContentAuthoringRepository(transport).saveDraft(saveInput),
      ).rejects.toBeInstanceOf(ContentAuthoringRepositoryError);
    },
  );
});
