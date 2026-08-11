import type { ChapterAccessBlocker } from '../api/chapter-map';
import type { LearningErrorCode } from '../api/learning-repository';
import type { ChapterStatus } from '../lib/progress-status';

export type ChapterDetailRetryTarget = 'chapter-map' | 'chapter-content';

export type MasteryVersionScore = Readonly<{
  masteryPercent: number;
  contentVersion: string;
}>;

// 四態誠實契約（2026-08-10 二次 remediation）：legacy-recorded＝現有
// production 資料的唯一數字，誠實標示為「目前記錄精熟度」＋規則版本，不稱
// 最高、不稱目前內容版本分數、不標記 merged；unavailable-until-backend-
// contract＝數值缺失、progress row 缺失、或版本語意無法確認，一律歸這一
// 態，不得推論成任何形式的「尚未測驗」；not-attempted-current-version 與
// versioned 都需要後端明確提供 active content version／highest+current
// 正式契約才能建構，現有 production adapter 不會產生這兩態，只有測試
// fixture 能覆蓋。
export type MasteryDisplay =
  | Readonly<{
      kind: 'legacy-recorded';
      masteryPercent: number;
      rulesVersion: string;
    }>
  | Readonly<{
      kind: 'not-attempted-current-version';
      currentContentVersion: string;
    }>
  | Readonly<{ kind: 'unavailable-until-backend-contract' }>
  | Readonly<{
      kind: 'versioned';
      highest: MasteryVersionScore;
      current:
        | MasteryVersionScore
        | Readonly<{ kind: 'not-attempted'; contentVersion: string }>;
      merged: boolean;
    }>;

export type ChapterDetailCardView = Readonly<{
  cardId: string;
  title: string;
  groupLabel: string;
  content: string;
  media: readonly Readonly<{ altText: string; assetPath: string }>[];
  completed: boolean;
}>;

export type ChapterDetailSubtopicView = Readonly<{
  quizTemplateId: string | null;
  subtopicId: string;
  title: string;
  reviewCompleted: number;
  reviewTotal: number | null;
  mastery: number | null;
  cards: readonly ChapterDetailCardView[];
}>;

export type ChapterDetailSectionView = Readonly<{
  quizTemplateId: string | null;
  sectionId: string;
  title: string;
  subtopics: readonly ChapterDetailSubtopicView[];
}>;

export type ChapterDetailChapterView = Readonly<{
  chapterId: string;
  title: string;
  sortOrder: number;
  templateId: string | null;
  status: ChapterStatus;
  reviewCompleted: number;
  reviewTotal: number | null;
  masteryDisplay: MasteryDisplay;
  sections: readonly ChapterDetailSectionView[];
}>;

export type ChapterDetailViewModel =
  | Readonly<{ state: 'loading' }>
  | Readonly<{
      state: 'locked';
      chapterTitle: string;
      unmetConditions: readonly ChapterAccessBlocker[];
    }>
  | Readonly<{ state: 'content-preparing'; chapterTitle: string }>
  | Readonly<{
      state: 'content-readiness-error';
      chapterTitle: string;
      reason: string;
    }>
  | Readonly<{
      state: 'error';
      retryable: boolean;
      errorCode: LearningErrorCode | 'CHAPTER_NOT_FOUND';
      retryTarget: ChapterDetailRetryTarget | null;
    }>
  | Readonly<{ state: 'in-progress'; chapter: ChapterDetailChapterView }>
  | Readonly<{ state: 'completed'; chapter: ChapterDetailChapterView }>;
