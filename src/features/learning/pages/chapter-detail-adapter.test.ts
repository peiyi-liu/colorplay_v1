import { describe, expect, it } from 'vitest';

import { LearningError } from '../api/learning-repository';
import {
  chapterMapEntryFixture,
  chapterReviewSectionsFixture,
  learningProgressRowsFixture,
  reviewCompletionsFixture,
} from './chapter-detail-page.test-fixtures';
import {
  deriveChapterDetailViewModel,
  deriveMasteryDisplay,
  isCardCompleted,
} from './chapter-detail-adapter';

describe('deriveMasteryDisplay', () => {
  it('legacy 且有效數值 → legacy-recorded，保留數值與 rulesVersion，不稱最高／目前內容版本／merged', () => {
    const result = deriveMasteryDisplay({
      masteryPercent: 59.5,
      rulesVersion: '2026-07-progress-1',
      source: 'legacy',
    });
    expect(result).toEqual({
      kind: 'legacy-recorded',
      masteryPercent: 59.5,
      rulesVersion: '2026-07-progress-1',
    });
  });

  it('legacy 且數值為 0 → 仍是 legacy-recorded（真實 0 分照實記錄，不轉成缺值）', () => {
    const result = deriveMasteryDisplay({
      masteryPercent: 0,
      rulesVersion: '2026-07-progress-1',
      source: 'legacy',
    });
    expect(result).toEqual({
      kind: 'legacy-recorded',
      masteryPercent: 0,
      rulesVersion: '2026-07-progress-1',
    });
  });

  it('legacy 且 masteryPercent=null → unavailable-until-backend-contract（不得推論成 not-attempted-current-version）', () => {
    const result = deriveMasteryDisplay({
      masteryPercent: null,
      rulesVersion: '2026-07-progress-1',
      source: 'legacy',
    });
    expect(result).toEqual({ kind: 'unavailable-until-backend-contract' });
  });

  it('legacy 且 rulesVersion=null（progress row 缺失或版本語意無法確認）→ unavailable-until-backend-contract', () => {
    const result = deriveMasteryDisplay({
      masteryPercent: 59.5,
      rulesVersion: null,
      source: 'legacy',
    });
    expect(result).toEqual({ kind: 'unavailable-until-backend-contract' });
  });

  it('explicit-no-attempt-this-version（未來後端明確證明目前版本無有效嘗試）→ not-attempted-current-version', () => {
    const result = deriveMasteryDisplay({
      currentContentVersion: '2026-09-progress-2',
      source: 'explicit-no-attempt-this-version',
    });
    expect(result).toEqual({
      kind: 'not-attempted-current-version',
      currentContentVersion: '2026-09-progress-2',
    });
  });

  it('versioned 且 highest／current 版本與數值皆不同 → merged=false，各自呈現', () => {
    const result = deriveMasteryDisplay({
      current: { contentVersion: 'v2', masteryPercent: 40 },
      highest: { contentVersion: 'v1', masteryPercent: 82 },
      source: 'versioned',
    });
    expect(result).toEqual({
      kind: 'versioned',
      current: { contentVersion: 'v2', masteryPercent: 40 },
      highest: { contentVersion: 'v1', masteryPercent: 82 },
      merged: false,
    });
  });

  it('versioned 且 highest／current 版本與數值皆相同 → merged=true', () => {
    const score = { contentVersion: 'v1', masteryPercent: 82 };
    const result = deriveMasteryDisplay({
      current: score,
      highest: score,
      source: 'versioned',
    });
    expect(result).toEqual({
      kind: 'versioned',
      current: score,
      highest: score,
      merged: true,
    });
  });

  it('versioned 且 current 為未測驗 → current 保留 not-attempted 標記，merged=false', () => {
    const result = deriveMasteryDisplay({
      current: { contentVersion: 'v2' },
      highest: { contentVersion: 'v1', masteryPercent: 82 },
      source: 'versioned',
    });
    expect(result).toEqual({
      kind: 'versioned',
      current: { contentVersion: 'v2', kind: 'not-attempted' },
      highest: { contentVersion: 'v1', masteryPercent: 82 },
      merged: false,
    });
  });
});

describe('isCardCompleted', () => {
  it('requiresRecompletion=true 且版本不符 → 未完成', () => {
    expect(
      isCardCompleted(
        { cardId: 'card-a', requiresRecompletion: true, version: 2 },
        [{ cardVersion: 1, reviewCardId: 'card-a' }],
      ),
    ).toBe(false);
  });

  it('requiresRecompletion=false → 任何版本的完成紀錄都算完成', () => {
    expect(
      isCardCompleted(
        { cardId: 'card-a', requiresRecompletion: false, version: 2 },
        [{ cardVersion: 1, reviewCardId: 'card-a' }],
      ),
    ).toBe(true);
  });
});

const baseInput = () => ({
  chapterMapEntry: chapterMapEntryFixture(),
  chapterMapIsError: false,
  chapterMapIsPending: false,
  completions: reviewCompletionsFixture(),
  completionsIsError: false,
  completionsIsPending: false,
  progressIsError: false,
  progressIsPending: false,
  progressRows: learningProgressRowsFixture(),
  reviewError: null,
  reviewIsPending: false,
  reviewSections: chapterReviewSectionsFixture(),
});

describe('deriveChapterDetailViewModel', () => {
  it('章節地圖載入中 → loading', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: undefined,
      chapterMapIsPending: true,
    });
    expect(result.state).toBe('loading');
  });

  it('chapterMap 讀取失敗 → error，retryTarget=chapter-map', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapIsError: true,
    });
    expect(result).toMatchObject({
      errorCode: 'UNAVAILABLE',
      retryTarget: 'chapter-map',
      retryable: true,
      state: 'error',
    });
  });

  it('章節不在地圖清單裡 → error，errorCode=CHAPTER_NOT_FOUND，不可重試', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: undefined,
    });
    expect(result).toMatchObject({
      errorCode: 'CHAPTER_NOT_FOUND',
      retryTarget: null,
      retryable: false,
      state: 'error',
    });
  });

  it('accessState=locked → locked，附上 server 提供的 unmetConditions', () => {
    const entry = chapterMapEntryFixture({
      accessState: 'locked',
      blockers: [
        {
          chapterId: '21000000-0000-0000-0000-000000000002',
          chapterTitle: '色彩表示',
          code: 'PREREQUISITE_MASTERY',
          current: 45,
          required: 80,
        },
      ],
    });
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: entry,
    });
    expect(result.state).toBe('locked');
    if (result.state === 'locked') {
      expect(result.unmetConditions).toHaveLength(1);
      expect(result.unmetConditions[0]?.code).toBe('PREREQUISITE_MASTERY');
    }
  });

  it('accessState=content_unavailable → content-preparing', () => {
    const entry = chapterMapEntryFixture({
      accessState: 'content_unavailable',
    });
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: entry,
    });
    expect(result.state).toBe('content-preparing');
  });

  it('review 查詢因過期快取回報 CHAPTER_LOCKED → 頁內渲染 locked，不是 error', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewError: new LearningError('CHAPTER_LOCKED'),
      reviewSections: undefined,
    });
    expect(result.state).toBe('locked');
  });

  it('已解鎖但小節底下完全沒有複習卡 → content-readiness-error（不是空狀態）', () => {
    const emptySections = chapterReviewSectionsFixture([
      {
        subtopics: [
          {
            cards: [],
            sortOrder: 1,
            stableCode: 's',
            subtopicId: 'sub-1',
            title: '3-1',
          },
        ],
      },
    ]);
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewSections: emptySections,
    });
    expect(result.state).toBe('content-readiness-error');
  });

  it('review query 因 UNAVAILABLE 失敗 → error，retryable=true，retryTarget=chapter-content', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewError: new LearningError('UNAVAILABLE'),
      reviewSections: undefined,
    });
    expect(result).toMatchObject({
      errorCode: 'UNAVAILABLE',
      retryTarget: 'chapter-content',
      retryable: true,
      state: 'error',
    });
  });

  it('review query 因格式錯誤（非清單內的不可重試代碼）失敗 → error，retryable=false，retryTarget=null', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewError: new LearningError('INVALID_RESPONSE'),
      reviewSections: undefined,
    });
    expect(result).toMatchObject({
      retryTarget: null,
      retryable: false,
      state: 'error',
    });
  });

  it('reviewError 沒有可辨識的 code（例如非 LearningError 的例外）→ 預設視為可重試（防止意外把未知錯誤鎖死）', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      reviewError: Object.assign(new Error('boom'), {}) as never,
      reviewSections: undefined,
    });
    expect(result).toMatchObject({
      retryTarget: 'chapter-content',
      retryable: true,
      state: 'error',
    });
  });

  it('accessState=available 且有卡片 → in-progress，帶入 status／masteryDisplay／completed', () => {
    const result = deriveChapterDetailViewModel(baseInput());
    expect(result.state).toBe('in-progress');
    if (result.state !== 'in-progress') throw new Error('unreachable');
    expect(result.chapter.status).toBe('learning');
    expect(result.chapter.masteryDisplay).toEqual({
      kind: 'legacy-recorded',
      masteryPercent: 59.5,
      rulesVersion: '2026-07-progress-1',
    });
    expect(result.chapter.sections[0]?.subtopics[0]?.cards[0]?.completed).toBe(
      true,
    );
  });

  it('章節 progress row 缺失 → masteryDisplay 為 unavailable-until-backend-contract', () => {
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      progressRows: [],
    });
    if (result.state !== 'in-progress') throw new Error('unreachable');
    expect(result.chapter.masteryDisplay).toEqual({
      kind: 'unavailable-until-backend-contract',
    });
  });

  it('production 呼叫路徑（legacy 來源）在各種 mastery 數值下，masteryDisplay 永遠不是 versioned 或 not-attempted-current-version', () => {
    for (const masteryPercent of [null, 0, 59.5, 100]) {
      const result = deriveChapterDetailViewModel({
        ...baseInput(),
        progressRows: [
          {
            accuracy: null,
            chapterId: '21000000-0000-0000-0000-000000000003',
            coverage: null,
            mastery: masteryPercent,
            reviewCompleted: 1,
            reviewTotal: 3,
            rulesVersion: '2026-07-progress-1',
            scope: 'chapter',
            status: 'learning',
            subtopicId: null,
          },
        ],
      });
      if (result.state !== 'in-progress') throw new Error('unreachable');
      expect([
        'legacy-recorded',
        'unavailable-until-backend-contract',
      ]).toContain(result.chapter.masteryDisplay.kind);
    }
  });

  it('accessState=completed → completed', () => {
    const entry = chapterMapEntryFixture({ accessState: 'completed' });
    const result = deriveChapterDetailViewModel({
      ...baseInput(),
      chapterMapEntry: entry,
    });
    expect(result.state).toBe('completed');
  });
});
