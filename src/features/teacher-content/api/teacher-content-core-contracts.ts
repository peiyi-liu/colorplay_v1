import { z } from 'zod';

const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);

export const questionRowSchema = z.object({
  explanation: z.string(),
  options: z.array(
    z.object({
      is_correct: z.boolean(),
      key: z.string(),
      text: z.string(),
    }),
  ),
  prompt: z.string(),
  question_id: uuidString,
  stable_code: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
  subtopic_id: uuidString,
  version: z.number().int().positive(),
});

export const cardRowSchema = z.object({
  content: z.string(),
  group_label: z.string(),
  id: uuidString,
  requires_recompletion: z.boolean(),
  review_card_media: z.array(
    z.object({
      alt_text: z.string(),
      asset_path: z.string(),
      card_version: z.number().int(),
    }),
  ),
  stable_code: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
  subtopic_id: uuidString,
  title: z.string(),
  version: z.number().int().positive(),
});

export const publishReceiptSchema = z
  .object({
    changed: z.boolean(),
    version: z.number().int().positive(),
  })
  .loose();

export const importReportSchema = z
  .object({
    import_id: uuidString,
    status: z.enum(['committed', 'failed']),
    total_rows: z.number().int().nonnegative(),
    valid_rows: z.number().int().nonnegative(),
    error_rows: z.number().int().nonnegative(),
    row_errors: z.array(
      z
        .object({
          code: z.string(),
          field: z.string(),
          message: z.string(),
          row: z.number().int(),
          sheet: z.string(),
        })
        .loose(),
    ),
    replayed: z.boolean(),
  })
  .loose();

export const subtopicOptionSchema = z.object({
  id: uuidString,
  stable_code: z.string(),
  title: z.string(),
});

export type TeacherQuestionOption = Readonly<{
  isCorrect: boolean;
  key: string;
  text: string;
}>;

export type TeacherQuestionRow = Readonly<{
  explanation: string;
  options: readonly TeacherQuestionOption[];
  prompt: string;
  questionId: string;
  stableCode: string;
  status: 'draft' | 'published' | 'archived';
  subtopicId: string;
  version: number;
}>;

export type CardMediaEntry = Readonly<{
  altText: string;
  assetPath: string;
}>;

export type TeacherCardRow = Readonly<{
  cardId: string;
  content: string;
  groupLabel: string;
  media: readonly CardMediaEntry[];
  requiresRecompletion: boolean;
  stableCode: string;
  status: 'draft' | 'published' | 'archived';
  subtopicId: string;
  title: string;
  version: number;
}>;

export type PublishReceipt = Readonly<{
  changed: boolean;
  version: number;
}>;

export type QuestionDraftPayload = Readonly<{
  explanation: string;
  options: readonly Readonly<{
    isCorrect: boolean;
    key: string;
    text: string;
  }>[];
  prompt: string;
  stableCode: string;
  subtopicId: string;
}>;

export type ReviewCardDraftPayload = Readonly<{
  content: string;
  groupLabel: string;
  media: readonly CardMediaEntry[] | null;
  requiresRecompletion: boolean;
  stableCode: string;
  subtopicId: string;
  title: string;
}>;

export type ImportCommitReport = z.infer<typeof importReportSchema>;

export type SubtopicOption = Readonly<{
  stableCode: string;
  subtopicId: string;
  title: string;
}>;

export const toCardPayload = (payload: ReviewCardDraftPayload) => ({
  content: payload.content,
  group_label: payload.groupLabel,
  ...(payload.media
    ? {
        media: payload.media.map((entry) => ({
          alt_text: entry.altText,
          asset_path: entry.assetPath,
        })),
      }
    : {}),
  requires_recompletion: payload.requiresRecompletion,
  stable_code: payload.stableCode,
  subtopic_id: payload.subtopicId,
  title: payload.title,
});

export const toQuestionPayload = (payload: QuestionDraftPayload) => ({
  explanation: payload.explanation,
  options: payload.options.map((option) => ({
    is_correct: option.isCorrect,
    key: option.key,
    text: option.text,
  })),
  prompt: payload.prompt,
  stable_code: payload.stableCode,
  subtopic_id: payload.subtopicId,
});
