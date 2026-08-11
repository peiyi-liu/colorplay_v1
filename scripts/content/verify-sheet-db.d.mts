import type XLSX from 'xlsx';

import type {
  ReviewCardImportRow,
  ReviewCardImportSkip,
} from './import-review-cards.mjs';

export const DEFAULT_PROJECT_REF: string;
export const REPORT_PATH: string;

export type VerifyFixes = Readonly<{
  chapterMap?: Readonly<Record<string, string>>;
  reviewCardMedia?: Readonly<
    Record<string, Readonly<{ asset: string; alt: string }>>
  >;
  reviewFlags?: Readonly<Record<string, string>>;
  skipCodes?: Readonly<Record<string, string>>;
  verifyKnownDivergences?: Readonly<
    Record<string, Readonly<{ fields: readonly string[]; reason: string }>>
  >;
}>;

export type SheetSnapshotQuestion = Readonly<{
  answer: string;
  code: string;
  explanation: string;
  options: readonly Readonly<{ key: string; text: string }>[];
  prompt: string;
}>;

export type SheetSnapshot = Readonly<{
  cardSkipped: readonly ReviewCardImportSkip[];
  errors: readonly string[];
  placeholders: readonly Readonly<{
    chapter: string;
    code: string;
    rowNumber: number;
  }>[];
  questions: readonly SheetSnapshotQuestion[];
  reviewCards: readonly ReviewCardImportRow[];
  skippedCodes: readonly Readonly<{ code: string; reason: string }>[];
  warnings: readonly string[];
}>;

export type DbSnapshot = Readonly<{
  questions: readonly Readonly<{
    code: string;
    explanation: string;
    options: readonly Readonly<{
      correct: boolean;
      key: string;
      text: string;
    }>[];
    prompt: string;
  }>[];
  reviewCards: readonly Readonly<{
    content: string;
    groupLabel: string;
    stableCode: string;
    subtopicCode: string;
    title: string;
  }>[];
}>;

export type VerifyDiff = Readonly<{
  code: string;
  detail?: string;
  field?: string;
  kind: 'field_mismatch' | 'missing_in_db' | 'missing_in_sheet';
}>;

export type VerifyComparison = Readonly<{
  diffs: readonly VerifyDiff[];
  known: readonly Readonly<{ code: string; field: string; reason: string }>[];
  matchedCards: number;
  matchedQuestions: number;
}>;

export function fingerprint(value: unknown): string;

export function detectAnswerConflict(
  input: Readonly<{ answer: string; explanation: string; prompt: string }>,
): string | null;

export function buildSheetSnapshot(
  input: Readonly<{ fixes: VerifyFixes; workbook: XLSX.WorkBook }>,
): SheetSnapshot;

export function fetchDbSnapshot(
  input: Readonly<{
    fetchImpl?: typeof globalThis.fetch;
    projectRef: string;
    token: string;
  }>,
): Promise<DbSnapshot>;

export function compareSnapshots(
  input: Readonly<{
    db: DbSnapshot;
    knownDivergences?: VerifyFixes['verifyKnownDivergences'];
    sheet: SheetSnapshot;
  }>,
): VerifyComparison;

export function resolveExitCode(
  input: Readonly<{
    diffs: readonly VerifyDiff[];
    errors: readonly string[];
    mode: 'audit' | 'gate';
  }>,
): 0 | 1;

export function buildVerifyReport(
  input: Readonly<{
    comparison: VerifyComparison | null;
    dbSource: string;
    generatedAt?: string;
    mode: 'audit' | 'gate';
    reviewFlags?: Readonly<Record<string, string>>;
    sheet: SheetSnapshot;
  }>,
): string;
