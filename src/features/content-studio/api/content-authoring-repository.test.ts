import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ContentAuthoringRepositoryError,
  createContentAuthoringRepository,
} from './content-authoring-repository';

const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const ENTITY_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const UPDATED_AT = '2026-09-26T08:30:00+00:00';
const CHAPTER_ID = '55555555-5555-4555-8555-555555555555';
const SECTION_ID = '66666666-6666-4666-8666-666666666666';
const SUBTOPIC_ID = '77777777-7777-4777-8777-777777777777';
const BANK_ID = '88888888-8888-4888-8888-888888888888';

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

  it('maps the Admin scope tree without exposing question answers or table internals', async () => {
    transport.rpc.mockResolvedValue({
      chapter: {
        id: CHAPTER_ID,
        sort_order: 3,
        stable_code: 'chapter-3',
        status: 'published',
        title: '色彩表示',
      },
      chapter_banks: [
        {
          id: BANK_ID,
          kind: 'CR',
          question_count: 10,
          sort_order: 3,
          stable_code: 'CR-chapter-3',
          status: 'published',
          title: '色彩表示 章節總題庫',
        },
      ],
      outcome: 'ok',
      request_id: REQUEST_ID,
      sections: [
        {
          banks: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              kind: 'QB',
              question_count: 4,
              sort_order: 1,
              stable_code: 'QB-section-3-1',
              status: 'published',
              title: '3-1 小節題庫',
            },
          ],
          id: SECTION_ID,
          sort_order: 1,
          stable_code: 'section-3-1',
          status: 'published',
          subtopics: [
            {
              id: SUBTOPIC_ID,
              review_card_count: 3,
              sort_order: 1,
              stable_code: 'subtopic-3-1-1',
              status: 'published',
              title: '色彩表示方式',
            },
          ],
          title: '3-1 色彩表示',
        },
      ],
    });

    await expect(
      createContentAuthoringRepository(transport).listScope({
        chapterId: CHAPTER_ID,
      }),
    ).resolves.toMatchObject({
      chapter: { chapterId: CHAPTER_ID, stableCode: 'chapter-3' },
      chapterBanks: [{ bankId: BANK_ID, kind: 'CR', questionCount: 10 }],
      outcome: 'ok',
      requestId: REQUEST_ID,
      sections: [
        {
          banks: [{ kind: 'QB', questionCount: 4 }],
          sectionId: SECTION_ID,
          subtopics: [{ reviewCardCount: 3, subtopicId: SUBTOPIC_ID }],
        },
      ],
    });
    expect(transport.rpc).toHaveBeenCalledWith('admin_list_content_scope', {
      p_chapter_id: CHAPTER_ID,
    });

    transport.rpc.mockResolvedValueOnce({
      chapter: {
        correct_answer: 'A',
        id: CHAPTER_ID,
        sort_order: 3,
        stable_code: 'chapter-3',
        status: 'published',
        title: '色彩表示',
      },
      chapter_banks: [],
      outcome: 'ok',
      request_id: REQUEST_ID,
      sections: [],
    });
    await expect(
      createContentAuthoringRepository(transport).listScope({
        chapterId: CHAPTER_ID,
      }),
    ).rejects.toBeInstanceOf(ContentAuthoringRepositoryError);
  });

  it('reads current content and its persisted draft as one editor state', async () => {
    transport.rpc.mockResolvedValue({
      current: {
        entity_id: BANK_ID,
        entity_type: 'assessment_bank',
        payload: {
          kind: 'QB',
          section_id: SECTION_ID,
          sort_order: 1,
          title: '3-1 小節題庫',
        },
        stable_code: 'QB-section-3-1',
        status: 'published',
        version: 1,
      },
      draft: savedDraftWire,
      outcome: 'ok',
      request_id: REQUEST_ID,
    });

    await expect(
      createContentAuthoringRepository(transport).readEditorState({
        draftId: DRAFT_ID,
        entityId: BANK_ID,
        entityType: 'assessment_bank',
      }),
    ).resolves.toMatchObject({
      current: {
        entityId: BANK_ID,
        entityType: 'assessment_bank',
        stableCode: 'QB-section-3-1',
        status: 'published',
        version: 1,
      },
      draft: { draftId: DRAFT_ID, revision: 3 },
      outcome: 'ok',
      requestId: REQUEST_ID,
    });
    expect(transport.rpc).toHaveBeenCalledWith(
      'admin_read_content_editor_state',
      {
        p_draft_id: DRAFT_ID,
        p_entity_id: BANK_ID,
        p_entity_type: 'assessment_bank',
      },
    );
  });

  it('maps deterministic server validation issues for the exact draft revision', async () => {
    transport.rpc.mockResolvedValue({
      draft_id: DRAFT_ID,
      issues: [
        {
          code: 'CONTENT_BANK_SCOPE_INVALID',
          field: 'section_id',
          message: 'QB 題庫必須屬於小節。',
          severity: 'error',
        },
      ],
      outcome: 'ok',
      request_id: REQUEST_ID,
      revision: 3,
      valid: false,
    });

    await expect(
      createContentAuthoringRepository(transport).validateDraft({
        draftId: DRAFT_ID,
        expectedRevision: 3,
      }),
    ).resolves.toMatchObject({
      draftId: DRAFT_ID,
      issues: [{ code: 'CONTENT_BANK_SCOPE_INVALID', severity: 'error' }],
      outcome: 'ok',
      requestId: REQUEST_ID,
      revision: 3,
      valid: false,
    });
    expect(transport.rpc).toHaveBeenCalledWith('admin_validate_content_draft', {
      p_draft_id: DRAFT_ID,
      p_expected_revision: 3,
    });
  });

  it('returns typed permission and revision denials without client retries', async () => {
    transport.rpc.mockResolvedValue({
      code: 'CONTENT_DRAFT_CONFLICT',
      message: '草稿版本已更新，請重新載入。',
      outcome: 'denied',
      request_id: REQUEST_ID,
      retryable: false,
    });

    await expect(
      createContentAuthoringRepository(transport).validateDraft({
        draftId: DRAFT_ID,
        expectedRevision: 2,
      }),
    ).resolves.toEqual({
      code: 'CONTENT_DRAFT_CONFLICT',
      message: '草稿版本已更新，請重新載入。',
      outcome: 'denied',
      requestId: REQUEST_ID,
      retryable: false,
    });
    expect(transport.rpc).toHaveBeenCalledTimes(1);
  });

  it('maps a student-safe question preview and rejects answer leakage', async () => {
    const wire = {
      draft_id: DRAFT_ID,
      outcome: 'ok',
      projection: {
        duration_seconds: 30,
        entity_type: 'question',
        options: [
          { key: 'A', text: '孟賽爾' },
          { key: 'B', text: '奧斯華德' },
        ],
        prompt: '哪個色彩系統使用 HV/C？',
        question_type: 'single_choice',
        stable_code: 'QB3101',
      },
      request_id: REQUEST_ID,
      revision: 3,
    };
    transport.rpc.mockResolvedValue(wire);

    await expect(
      createContentAuthoringRepository(transport).previewDraft({
        draftId: DRAFT_ID,
        expectedRevision: 3,
      }),
    ).resolves.toMatchObject({
      projection: {
        entityType: 'question',
        options: [
          { key: 'A', text: '孟賽爾' },
          { key: 'B', text: '奧斯華德' },
        ],
      },
      revision: 3,
    });

    transport.rpc.mockResolvedValueOnce({
      ...wire,
      projection: {
        ...wire.projection,
        options: [
          { is_correct: true, key: 'A', text: '孟賽爾' },
          { is_correct: false, key: 'B', text: '奧斯華德' },
        ],
      },
    });
    await expect(
      createContentAuthoringRepository(transport).previewDraft({
        draftId: DRAFT_ID,
        expectedRevision: 3,
      }),
    ).rejects.toBeInstanceOf(ContentAuthoringRepositoryError);
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
