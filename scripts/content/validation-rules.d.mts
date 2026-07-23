export const QUESTION_CODE_PATTERN: RegExp;

export const TEXT_LIMITS: Readonly<{
  explanation: number;
  optionText: number;
  prompt: number;
  reviewCardContent: number;
  reviewCardTitle: number;
}>;

export function hasUnsafeText(value: unknown): boolean;

export function isValidQuestionCode(code: unknown): boolean;

export type AnswerResolution =
  | Readonly<{ key: 'A' | 'B' | 'C' | 'D'; error?: undefined }>
  | Readonly<{
      error: 'ANSWER_INVALID' | 'ANSWER_OPTION_MISSING';
      key?: undefined;
    }>;

export function resolveCorrectAnswer(
  rawValue: unknown,
  options: readonly Readonly<{ key: string; text: string }>[],
): AnswerResolution;

export type RowError = Readonly<{ code: string; field: string }>;

export function validateQuestionRow(
  row: Readonly<{
    answer?: unknown;
    code?: string;
    explanation?: string;
    options?: readonly Readonly<{ key: string; text: string }>[];
    prompt?: string;
  }>,
): readonly RowError[];

export function validateReviewCardRow(
  row: Readonly<{
    chapter?: string;
    content?: string;
    sectionLabel?: string;
    title?: string;
  }>,
): readonly RowError[];
