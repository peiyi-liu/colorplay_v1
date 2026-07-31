import type { LearningProgressRow } from '../api/learning-repository';

export type ChapterStatus = LearningProgressRow['status'];

/** 四態文案(決議 1 軟鎖:永遠可點,僅視覺引導)。 */
export const statusLabels: Readonly<Record<ChapterStatus, string>> = {
  developing: '進步中',
  learning: '學習中',
  mastered: '已精熟',
  not_started: '尚未開始',
};
