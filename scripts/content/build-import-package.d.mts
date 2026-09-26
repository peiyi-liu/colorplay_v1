import type * as XLSX from 'xlsx';

export type CompatibilityQuestion = Readonly<{
  answer: string;
  code: string;
  explanation: string;
  options: readonly Readonly<{ key: string; text: string }>[];
  prompt: string;
}>;

export type CompatibilityReviewCard = Readonly<{
  attachmentRef: string;
  chapterCode: string;
  content: string;
  groupLabel: string;
  sectionKey: string;
  sortOrder: number;
  stableCode: string;
  title: string;
}>;

export function buildCompatibilityWorkbook(
  snapshot: Readonly<{
    questions: readonly CompatibilityQuestion[];
    reviewCards: readonly CompatibilityReviewCard[];
  }>,
  chapterNumber?: string,
): Readonly<{
  attachmentWarnings: readonly string[];
  workbook: XLSX.WorkBook;
}>;
