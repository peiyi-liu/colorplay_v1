import type XLSX from 'xlsx';

export const SHEET_XLSX_URL: string;
export const QUESTION_TAB_NAME: string;
export const REVIEW_TAB_NAME: string;
export const OUTPUT_DIR: string;

export type SheetQuestionRow = Readonly<{
  answer: string;
  chapter: string;
  code: string;
  explanation: string;
  options: Readonly<{ A: string; B: string; C: string; D: string }>;
  prompt: string;
  rowNumber: number;
  sectionTitle: string;
}>;

export type SheetPlaceholderRow = Readonly<{
  chapter: string;
  code: string;
  rowNumber: number;
}>;

export function extractQuestionRows(workbook: XLSX.WorkBook): Readonly<{
  placeholders: readonly SheetPlaceholderRow[];
  problems: readonly string[];
  rows: readonly SheetQuestionRow[];
}>;

export function extractReviewRows(workbook: XLSX.WorkBook): Readonly<{
  problems: readonly string[];
  rows: readonly (readonly string[])[];
}>;

export function toCsv(aoa: readonly (readonly unknown[])[]): string;

export function toQuestionsCsv(rows: readonly SheetQuestionRow[]): string;

export function toReviewCardsCsv(rows: readonly (readonly string[])[]): string;

export function loadRemoteWorkbook(
  options: Readonly<{ fetchImpl?: typeof globalThis.fetch }>,
): Promise<Readonly<{ buffer: Buffer; workbook: XLSX.WorkBook }>>;
