import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../types/database';
import type { ImportQuestionRow, ImportReviewCardRow } from './xlsx-codec';

const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu);

export type TeacherContentErrorCode =
  | 'CONTENT_ALREADY_PUBLISHED'
  | 'CONTENT_INVALID'
  | 'CONTENT_NOT_FOUND'
  | 'CONTENT_TEACHER_ONLY'
  | 'CONTENT_UNSAFE_TEXT'
  | 'EXTERNAL_URL_INVALID'
  | 'INVALID_RESPONSE'
  | 'UNAVAILABLE';

const messages: Record<TeacherContentErrorCode, string> = {
  CONTENT_ALREADY_PUBLISHED: '已發布的內容請用發布流程更新。',
  CONTENT_INVALID: '內容未通過驗證，請檢查欄位。',
  CONTENT_NOT_FOUND: '找不到這筆內容。',
  CONTENT_TEACHER_ONLY: '只有教師帳號可以管理內容。',
  CONTENT_UNSAFE_TEXT: '內容含不允許的 script 或事件屬性。',
  EXTERNAL_URL_INVALID: '外部連結必須是 https 開頭的網址。',
  INVALID_RESPONSE: '內容資料格式不正確，請稍後重試。',
  UNAVAILABLE: '目前無法完成操作，請稍後重試。',
};

export class TeacherContentError extends Error {
  readonly code: TeacherContentErrorCode;

  constructor(code: TeacherContentErrorCode) {
    super(messages[code]);
    this.name = 'TeacherContentError';
    this.code = code;
  }
}

const toError = (message: string): TeacherContentError => {
  if (message.includes('CONTENT_ALREADY_PUBLISHED')) {
    return new TeacherContentError('CONTENT_ALREADY_PUBLISHED');
  }
  if (message.includes('CONTENT_TEACHER_ONLY')) {
    return new TeacherContentError('CONTENT_TEACHER_ONLY');
  }
  if (message.includes('CONTENT_UNSAFE_TEXT')) {
    return new TeacherContentError('CONTENT_UNSAFE_TEXT');
  }
  if (message.includes('CONTENT_NOT_FOUND')) {
    return new TeacherContentError('CONTENT_NOT_FOUND');
  }
  if (message.includes('EXTERNAL_URL_INVALID')) {
    return new TeacherContentError('EXTERNAL_URL_INVALID');
  }
  if (message.includes('CONTENT_INVALID') || message.includes('_INVALID')) {
    return new TeacherContentError('CONTENT_INVALID');
  }
  return new TeacherContentError('UNAVAILABLE');
};

const parseWith = <Output>(
  schema: z.ZodType<Output>,
  value: unknown,
): Output => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new TeacherContentError('INVALID_RESPONSE');
  return parsed.data;
};

const questionRowSchema = z.object({
  explanation: z.string(),
  id: uuidString,
  prompt: z.string(),
  question_options: z.array(
    z.object({
      id: uuidString,
      is_correct: z.boolean(),
      option_key: z.string(),
      option_text: z.string(),
      sort_order: z.number().int(),
    }),
  ),
  stable_code: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
  subtopic_id: uuidString,
  version: z.number().int().positive(),
});

const cardRowSchema = z.object({
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

const publishReceiptSchema = z
  .object({
    changed: z.boolean(),
    version: z.number().int().positive(),
  })
  .loose();

const importReportSchema = z
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

const summarySchema = z.array(
  z
    .object({
      attempts: z.number().int().nonnegative(),
      average_accuracy: z.number().nullable(),
      unique_students: z.number().int().nonnegative(),
      worst_subtopic_title: z.string().nullable(),
    })
    .loose(),
);

const questionAnalysisSchema = z.array(
  z.object({
    attempts: z.number().int().nonnegative(),
    correct_rate: z.number().nullable(),
    prompt: z.string(),
    stable_code: z.string(),
  }),
);

const subtopicMasterySchema = z.array(
  z.object({
    accuracy: z.number().nullable(),
    answers: z.number().int().nonnegative(),
    students: z.number().int().nonnegative(),
    subtopic_code: z.string(),
    subtopic_title: z.string(),
  }),
);

const assignmentSummarySchema = z.array(
  z.object({
    assignment_id: uuidString,
    attempts: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    status: z.string(),
    targets: z.number().int().nonnegative(),
    title: z.string(),
  }),
);

const liveReportSchema = z.array(
  z.object({
    activity_title: z.string(),
    answers: z.number().int().nonnegative(),
    completed_at: z.string().nullable(),
    correct_rate: z.number().nullable(),
    participants: z.number().int().nonnegative(),
    session_id: uuidString,
    state: z.string(),
  }),
);

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

export type AnalyticsFilters = Readonly<{
  chapterId?: string | null;
  from?: string | null;
  subtopicId?: string | null;
  to?: string | null;
}>;

export type DateRangeFilters = Readonly<{
  from?: string | null;
  to?: string | null;
}>;

export type SubtopicOption = Readonly<{
  stableCode: string;
  subtopicId: string;
  title: string;
}>;

export type QuestionAnalysisRow = z.infer<
  typeof questionAnalysisSchema
>[number];
export type SubtopicMasteryRow = z.infer<typeof subtopicMasterySchema>[number];
export type AssignmentSummaryRow = z.infer<
  typeof assignmentSummarySchema
>[number];
export type LiveReportRow = z.infer<typeof liveReportSchema>[number];

export type ClassroomSummary = Readonly<{
  attempts: number;
  averageAccuracy: number | null;
  uniqueStudents: number;
  worstSubtopicTitle: string | null;
}>;

const toCardPayload = (payload: ReviewCardDraftPayload) => ({
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

const toQuestionPayload = (payload: QuestionDraftPayload) => ({
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

const dateArgs = (filters: DateRangeFilters) => ({
  ...(filters.from ? { p_from: filters.from } : {}),
  ...(filters.to ? { p_to: filters.to } : {}),
});

const analyticsArgs = (classroomId: string, filters: AnalyticsFilters) => ({
  p_classroom_id: classroomId,
  ...(filters.chapterId ? { p_chapter_id: filters.chapterId } : {}),
  ...(filters.subtopicId ? { p_subtopic_id: filters.subtopicId } : {}),
  ...dateArgs(filters),
});

const subtopicOptionSchema = z.object({
  id: uuidString,
  stable_code: z.string(),
  title: z.string(),
});

export type TeacherContentRepository = Readonly<{
  archiveQuestion(questionId: string, requestId: string): Promise<void>;
  archiveReviewCard(cardId: string, requestId: string): Promise<void>;
  commitImport(
    input: Readonly<{
      dryRun: boolean;
      filename: string;
      questions: readonly ImportQuestionRow[];
      requestId: string;
      reviewCards: readonly ImportReviewCardRow[];
    }>,
  ): Promise<ImportCommitReport>;
  getAssignmentSummary(
    classroomId: string,
    filters: DateRangeFilters,
  ): Promise<readonly AssignmentSummaryRow[]>;
  getClassroomSummary(
    classroomId: string,
    filters: AnalyticsFilters,
  ): Promise<ClassroomSummary | null>;
  getLiveReport(
    classroomId: string,
    filters: DateRangeFilters,
  ): Promise<readonly LiveReportRow[]>;
  getQuestionAnalysis(
    classroomId: string,
    filters: AnalyticsFilters,
  ): Promise<readonly QuestionAnalysisRow[]>;
  getSubtopicMastery(
    classroomId: string,
    filters: AnalyticsFilters,
  ): Promise<readonly SubtopicMasteryRow[]>;
  listCards(): Promise<readonly TeacherCardRow[]>;
  listQuestions(): Promise<readonly TeacherQuestionRow[]>;
  listSubtopics(): Promise<readonly SubtopicOption[]>;
  publishQuestion(
    input: Readonly<{
      payload: QuestionDraftPayload | null;
      questionId: string;
      requestId: string;
    }>,
  ): Promise<PublishReceipt>;
  publishReviewCard(
    input: Readonly<{
      cardId: string;
      payload: ReviewCardDraftPayload | null;
      requestId: string;
    }>,
  ): Promise<PublishReceipt>;
  upsertQuestionDraft(
    input: Readonly<{
      payload: QuestionDraftPayload;
      requestId: string;
    }>,
  ): Promise<void>;
  upsertReviewCardDraft(
    input: Readonly<{
      payload: ReviewCardDraftPayload;
      requestId: string;
    }>,
  ): Promise<void>;
}>;

export function createTeacherContentRepository(
  client: SupabaseClient<Database>,
): TeacherContentRepository {
  return {
    async archiveQuestion(questionId, requestId) {
      const { error } = await client.rpc('archive_question', {
        p_question_id: questionId,
        p_request_id: requestId,
      });
      if (error) throw toError(error.message);
    },

    async archiveReviewCard(cardId, requestId) {
      const { error } = await client.rpc('archive_review_card', {
        p_card_id: cardId,
        p_request_id: requestId,
      });
      if (error) throw toError(error.message);
    },

    async commitImport(input) {
      const { data, error } = await client.rpc('commit_content_import', {
        p_dry_run: input.dryRun,
        p_filename: input.filename,
        p_request_id: input.requestId,
        p_rows: {
          questions: input.questions.map((row) => ({
            answer: row.answerKey,
            chapter: row.chapter,
            code: row.code,
            explanation: row.explanation,
            options: row.options.map((option) => ({
              key: option.key,
              text: option.text,
            })),
            prompt: row.prompt,
            row: row.row,
            section_label: row.sectionLabel,
            subtopic_label: row.subtopicLabel,
          })),
          review_cards: input.reviewCards.map((row) => ({
            alt_text: row.altText,
            chapter: row.chapter,
            content: row.content,
            media_url: row.mediaUrl,
            row: row.row,
            section_label: row.sectionLabel,
            subtopic_label: row.subtopicLabel,
            title: row.title,
          })),
        },
      });
      if (error) throw toError(error.message);
      return parseWith(importReportSchema, data);
    },

    async getAssignmentSummary(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_assignment_summary', {
        p_classroom_id: classroomId,
        ...dateArgs(filters),
      });
      if (error) throw toError(error.message);
      return parseWith(assignmentSummarySchema, data);
    },

    async getClassroomSummary(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_classroom_summary', {
        ...analyticsArgs(classroomId, filters),
      });
      if (error) throw toError(error.message);
      const rows = parseWith(summarySchema, data);
      const row = rows[0];
      if (!row) return null;
      return {
        attempts: row.attempts,
        averageAccuracy: row.average_accuracy,
        uniqueStudents: row.unique_students,
        worstSubtopicTitle: row.worst_subtopic_title,
      };
    },

    async getLiveReport(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_live_session_report', {
        p_classroom_id: classroomId,
        ...dateArgs(filters),
      });
      if (error) throw toError(error.message);
      return parseWith(liveReportSchema, data);
    },

    async getQuestionAnalysis(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_question_analysis', {
        ...analyticsArgs(classroomId, filters),
      });
      if (error) throw toError(error.message);
      return parseWith(questionAnalysisSchema, data);
    },

    async getSubtopicMastery(classroomId, filters) {
      const { data, error } = await client.rpc('teacher_subtopic_mastery', {
        ...analyticsArgs(classroomId, filters),
      });
      if (error) throw toError(error.message);
      return parseWith(subtopicMasterySchema, data);
    },

    async listCards() {
      const { data, error } = await client
        .from('review_cards')
        .select(
          'id, stable_code, group_label, title, content, status, version, ' +
            'requires_recompletion, subtopic_id, ' +
            'review_card_media (asset_path, alt_text, card_version)',
        )
        .order('title');
      if (error) throw toError(error.message);
      return parseWith(z.array(cardRowSchema), data).map((row) => ({
        cardId: row.id,
        content: row.content,
        groupLabel: row.group_label,
        media: row.review_card_media
          .filter((entry) => entry.card_version === row.version)
          .map((entry) => ({
            altText: entry.alt_text,
            assetPath: entry.asset_path,
          })),
        requiresRecompletion: row.requires_recompletion,
        stableCode: row.stable_code,
        status: row.status,
        subtopicId: row.subtopic_id,
        title: row.title,
        version: row.version,
      }));
    },

    async listQuestions() {
      const { data, error } = await client
        .from('questions')
        .select(
          'id, stable_code, prompt, explanation, status, version, ' +
            'subtopic_id, ' +
            'question_options (id, option_key, option_text, is_correct, sort_order)',
        )
        .order('stable_code');
      if (error) throw toError(error.message);
      return parseWith(z.array(questionRowSchema), data).map((row) => ({
        explanation: row.explanation,
        options: [...row.question_options]
          .sort((left, right) => left.sort_order - right.sort_order)
          .map((option) => ({
            isCorrect: option.is_correct,
            key: option.option_key,
            text: option.option_text,
          })),
        prompt: row.prompt,
        questionId: row.id,
        stableCode: row.stable_code,
        status: row.status,
        subtopicId: row.subtopic_id,
        version: row.version,
      }));
    },

    async listSubtopics() {
      const { data, error } = await client
        .from('subtopics')
        .select('id, stable_code, title')
        .order('stable_code');
      if (error) throw toError(error.message);
      return parseWith(z.array(subtopicOptionSchema), data).map((row) => ({
        stableCode: row.stable_code,
        subtopicId: row.id,
        title: row.title,
      }));
    },

    async publishQuestion(input) {
      const { data, error } = await client.rpc('publish_question', {
        p_question_id: input.questionId,
        p_request_id: input.requestId,
        ...(input.payload
          ? { p_payload: toQuestionPayload(input.payload) }
          : {}),
      });
      if (error) throw toError(error.message);
      const receipt = parseWith(publishReceiptSchema, data);
      return { changed: receipt.changed, version: receipt.version };
    },

    async publishReviewCard(input) {
      const { data, error } = await client.rpc('publish_review_card', {
        p_card_id: input.cardId,
        p_request_id: input.requestId,
        ...(input.payload ? { p_payload: toCardPayload(input.payload) } : {}),
      });
      if (error) throw toError(error.message);
      const receipt = parseWith(publishReceiptSchema, data);
      return { changed: receipt.changed, version: receipt.version };
    },

    async upsertQuestionDraft(input) {
      const { error } = await client.rpc('upsert_question_draft', {
        p_payload: toQuestionPayload(input.payload),
        p_request_id: input.requestId,
      });
      if (error) throw toError(error.message);
    },

    async upsertReviewCardDraft(input) {
      const { error } = await client.rpc('upsert_review_card_draft', {
        p_payload: toCardPayload(input.payload),
        p_request_id: input.requestId,
      });
      if (error) throw toError(error.message);
    },
  };
}
